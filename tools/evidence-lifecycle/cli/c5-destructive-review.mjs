import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const c0Path = 'tools/evidence-lifecycle/contracts/c0-scope-admission.v1.json';
const c1Path = 'tools/evidence-lifecycle/generated/c1-inventory.v1.json';
const c2Path = 'tools/evidence-lifecycle/generated/c2-reference-graph.v1.json';
const c3Path = 'tools/evidence-lifecycle/generated/c3-lifecycle-classification.v1.json';
const c4Path = 'tools/evidence-lifecycle/generated/c4-retention-freeze.v1.json';
const contractPath = 'tools/evidence-lifecycle/contracts/c5-destructive-review.v1.json';
const validatorsPath = 'tools/project-check/contracts/validators.v1.json';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const c0 = readJson(c0Path);
const c1 = readJson(c1Path);
const c2 = readJson(c2Path);
const c3 = readJson(c3Path);
const c4 = readJson(c4Path);
const contract = readJson(contractPath);
const validators = readJson(validatorsPath);

assert.equal(contract.schemaId, 'evidence-lifecycle-c5-destructive-review-contract/v1');
assert.equal(contract.status, 'DESIGN_FROZEN');
assert.equal(contract.completion, 'COMPLETE');
assert.equal(contract.baseline.sha, c0.baseline.sha);
assert.equal(contract.input.c1InventoryDigest, c1.inventoryDigest.value);
assert.equal(contract.input.c2GraphDigest, c2.graphDigest.value);
assert.equal(contract.input.c3ClassificationDigest, c3.classificationDigest.value);
assert.equal(contract.input.c4RetentionPartitionDigest, c4.retentionPartitionDigest.value);
assert.equal(contract.input.retirementReviewCount, c4.summary.retirementReviewCount);
assert.equal(c4.foundationState, 'C_FOUNDATION_COMPLETE');

const c1ByPath = new Map(c1.records.map((record) => [record.path, record]));
const c3ByPath = new Map(c3.records.map((record) => [record.path, record]));
const validatorsByOwner = new Map();
for (const validator of validators.validators ?? []) {
  if (!validatorsByOwner.has(validator.owner)) validatorsByOwner.set(validator.owner, []);
  validatorsByOwner.get(validator.owner).push(validator.id);
}
for (const ids of validatorsByOwner.values()) ids.sort();

const deletionSafeValidatorIds = new Set(contract.gateB.deletionSafeReadOnlyValidatorIds);
const approvalDeclarationsByPath = new Map();
for (const declaration of contract.gateA.explicitRetirementApprovalDeclarations) {
  assert.ok(typeof declaration.path === 'string' && declaration.path.length > 0, 'retirement approval declaration path required');
  if (!approvalDeclarationsByPath.has(declaration.path)) approvalDeclarationsByPath.set(declaration.path, []);
  approvalDeclarationsByPath.get(declaration.path).push(declaration);
}

function allBasis(record) {
  const out = [...(record.classificationBasis ?? [])];
  for (const reason of record.secondaryReasons ?? []) out.push(...(reason.basis ?? []));
  return out;
}

function hasRetentionSignal(record) {
  if (String(record.primaryLifecycle).startsWith('RETENTION_')) return true;
  if ((record.secondaryReasons ?? []).some((reason) => String(reason.lifecycle).startsWith('RETENTION_'))) return true;
  const retentionBasis = new Set([
    'EXPLICIT_PREDECESSOR_EDGE',
    'STATUS_SOURCE_SUCCESSOR_PREDECESSOR',
    'EXPLICIT_PROVENANCE_EDGE',
    'MANIFEST_PREDECESSOR_REF',
    'MANIFEST_PROVENANCE_REF',
    'EXPLICIT_HISTORICAL_ROLE',
    'EXPLICIT_RETENTION_RATIONALE',
  ]);
  return allBasis(record).some((basis) => retentionBasis.has(basis.kind));
}

function hasExplicitSuccessor(record) {
  return allBasis(record).some((basis) => basis.kind === contract.gateA.explicitSuccessorBasisKind);
}

function exactRetirementApproval(path) {
  const declarations = approvalDeclarationsByPath.get(path) ?? [];
  if (declarations.length === 0) return { approved: false, matchedDeclarations: [] };
  const matched = [];
  for (const declaration of declarations) {
    if (declaration.approved === true) matched.push(declaration);
  }
  return { approved: matched.length > 0, matchedDeclarations: matched };
}

const candidateRecords = c4.records
  .filter((record) => record.partition === contract.candidateScope.includePartition)
  .sort((a, b) => a.path.localeCompare(b.path));

assert.equal(candidateRecords.length, contract.candidateScope.candidateCount);
assert.equal(candidateRecords.length, contract.input.retirementReviewCount);

const records = candidateRecords.map((c4Record) => {
  const c1Record = c1ByPath.get(c4Record.path);
  const c3Record = c3ByPath.get(c4Record.path);
  assert.ok(c1Record, `C5 candidate missing C1 record: ${c4Record.path}`);
  assert.ok(c3Record, `C5 candidate missing C3 record: ${c4Record.path}`);
  assert.equal(c4Record.protectingReferenceCount, c3Record.protectingReferenceCount);
  assert.equal(c4Record.primaryLifecycle, c3Record.primaryLifecycle);

  const protectingReferenceCountZero = c4Record.protectingReferenceCount === 0;
  const retentionSignalPresent = hasRetentionSignal(c3Record);
  const explicitSuccessor = hasExplicitSuccessor(c3Record);
  const retirementApproval = exactRetirementApproval(c4Record.path);
  const explicitSuccessorOrRetirementApproval = explicitSuccessor || retirementApproval.approved;

  const gateAReasons = [];
  if (!protectingReferenceCountZero) gateAReasons.push('PROTECTING_REFERENCE_PRESENT');
  if (retentionSignalPresent) gateAReasons.push('RETENTION_SIGNAL_PRESENT');
  if (!explicitSuccessorOrRetirementApproval) gateAReasons.push('NO_EXPLICIT_SUCCESSOR_OR_RETIREMENT_APPROVAL');
  const gateA = gateAReasons.length === 0 ? 'LOGICAL_ELIGIBLE' : 'LOGICAL_INELIGIBLE';

  const projectCheckOwners = [...(c1Record.projectCheckOwners ?? [])].sort();
  const projectCheckOwnerRuleIds = [...(c1Record.projectCheckOwnerRuleIds ?? [])].sort();
  const exactlyOneOwner = projectCheckOwners.length === 1;
  const owner = exactlyOneOwner ? projectCheckOwners[0] : null;
  const ownerValidatorIds = owner ? [...(validatorsByOwner.get(owner) ?? [])] : [];
  const deletionSafeOwnerValidatorIds = ownerValidatorIds.filter((id) => deletionSafeValidatorIds.has(id));
  const noDanglingReferenceEdge = c4Record.totalReferenceCount === 0;
  const ownerRulesPresent = projectCheckOwnerRuleIds.length > 0;

  let gateB = 'NOT_EVALUATED';
  let gateBReasons = [];
  if (gateA === 'LOGICAL_ELIGIBLE') {
    if (!exactlyOneOwner) gateBReasons.push('DELETION_OWNER_NOT_EXACTLY_ONE');
    if (ownerValidatorIds.length === 0) gateBReasons.push('NO_CATALOGUED_OWNER_VALIDATOR');
    if (deletionSafeOwnerValidatorIds.length === 0) gateBReasons.push('NO_EXPLICIT_DELETION_SAFE_READONLY_VALIDATOR');
    if (!noDanglingReferenceEdge) gateBReasons.push('CURRENT_EXACT_PATH_REFERENCE_EDGE_WOULD_DANGLE');
    if (!ownerRulesPresent) gateBReasons.push('PROJECT_CHECK_OWNER_RULE_MISSING');
    gateB = gateBReasons.length === 0 ? 'REPOSITORY_READY' : 'REPOSITORY_NOT_READY';
  }

  const deleteApproved = gateA === 'LOGICAL_ELIGIBLE' && gateB === 'REPOSITORY_READY';
  return {
    path: c4Record.path,
    scopeAdmissionRole: c4Record.scopeAdmissionRole,
    primaryLifecycle: c4Record.primaryLifecycle,
    partition: c4Record.partition,
    protectingReferenceCount: c4Record.protectingReferenceCount,
    informationalReferenceCount: c4Record.informationalReferenceCount,
    totalReferenceCount: c4Record.totalReferenceCount,
    gateA: {
      outcome: gateA,
      protectingReferenceCountZero,
      retentionSignalPresent,
      explicitSuccessor,
      explicitRetirementApproval: retirementApproval.approved,
      matchedRetirementApprovalDeclarationCount: retirementApproval.matchedDeclarations.length,
      reasons: gateAReasons,
    },
    gateB: {
      outcome: gateB,
      projectCheckOwnerRuleIds,
      projectCheckOwners,
      resolvedDeletionOwner: owner,
      ownerValidatorIds,
      deletionSafeReadOnlyValidatorIds: deletionSafeOwnerValidatorIds,
      noDanglingReferenceEdge,
      reasons: gateBReasons,
    },
    deleteApproved,
  };
});

const counts = {
  logicalEligibleCount: records.filter((record) => record.gateA.outcome === 'LOGICAL_ELIGIBLE').length,
  logicalIneligibleCount: records.filter((record) => record.gateA.outcome === 'LOGICAL_INELIGIBLE').length,
  repositoryReadyCount: records.filter((record) => record.gateB.outcome === 'REPOSITORY_READY').length,
  repositoryNotReadyCount: records.filter((record) => record.gateB.outcome === 'REPOSITORY_NOT_READY').length,
  repositoryNotEvaluatedCount: records.filter((record) => record.gateB.outcome === 'NOT_EVALUATED').length,
  deleteApprovedCount: records.filter((record) => record.deleteApproved).length,
  explicitSuccessorCount: records.filter((record) => record.gateA.explicitSuccessor).length,
  explicitRetirementApprovalCount: records.filter((record) => record.gateA.explicitRetirementApproval).length,
  zeroTotalReferenceCount: records.filter((record) => record.totalReferenceCount === 0).length,
};

assert.equal(records.length, contract.input.retirementReviewCount);
assert.equal(counts.logicalEligibleCount + counts.logicalIneligibleCount, records.length);
assert.equal(counts.repositoryReadyCount + counts.repositoryNotReadyCount, counts.logicalEligibleCount);
assert.equal(counts.repositoryNotEvaluatedCount, counts.logicalIneligibleCount);
assert.equal(counts.deleteApprovedCount, counts.repositoryReadyCount);

const hardErrors = [];
if (new Set(records.map((record) => record.path)).size !== records.length) hardErrors.push('DUPLICATE_CANDIDATE_PATH');
if (records.some((record) => record.partition !== 'RETIREMENT_REVIEW')) hardErrors.push('NON_RETIREMENT_REVIEW_CANDIDATE');
if (records.some((record) => record.gateA.outcome === 'LOGICAL_INELIGIBLE' && record.gateB.outcome !== 'NOT_EVALUATED')) {
  hardErrors.push('GATE_B_EVALUATED_FOR_LOGICAL_INELIGIBLE');
}
if (records.some((record) => record.deleteApproved && record.gateB.outcome !== 'REPOSITORY_READY')) {
  hardErrors.push('DELETE_APPROVAL_WITHOUT_REPOSITORY_READINESS');
}
assert.equal(hardErrors.length, 0);

const reviewDigestValue = sha256(JSON.stringify(records));
const output = {
  version: 1,
  schemaId: 'evidence-lifecycle-c5-destructive-review/v1',
  stage: 'C5 - Destructive Candidate Review',
  status: records.length > counts.deleteApprovedCount ? 'PASS_WITH_REVIEW' : 'PASS',
  completion: 'COMPLETE',
  freezeState: 'C5_DESTRUCTIVE_REVIEW_COMPLETE',
  foundationState: c4.foundationState,
  c6State: counts.deleteApprovedCount > 0 ? 'C6_OWNER_HANDOFF_READY' : 'C6_NOT_OPENED',
  baseline: {
    branch: c0.baseline.branch,
    sha: c0.baseline.sha,
  },
  input: {
    c1Inventory: c1Path,
    c1InventoryDigest: c1.inventoryDigest.value,
    c2ReferenceGraph: c2Path,
    c2GraphDigest: c2.graphDigest.value,
    c3Classification: c3Path,
    c3ClassificationDigest: c3.classificationDigest.value,
    c4RetentionFreeze: c4Path,
    c4RetentionPartitionDigest: c4.retentionPartitionDigest.value,
    c5Contract: contractPath,
    projectCheckValidatorCatalog: validatorsPath,
    retirementReviewCount: c4.summary.retirementReviewCount,
    reviewPolicyVersion: contract.input.reviewPolicyVersion,
  },
  authorityBoundary: {
    semanticReopen: false,
    lifecycleReclassificationCount: 0,
    rawSemanticRecomputationCount: 0,
    candidateArtifactMutationCount: 0,
    deletionCount: 0,
  },
  currentSignalObservation: {
    retirementApprovalDeclarationCount: contract.gateA.explicitRetirementApprovalDeclarations.length,
    deletionSafeReadOnlyValidatorAdmissionCount: contract.gateB.deletionSafeReadOnlyValidatorIds.length,
    explicitSuccessorCandidateCount: counts.explicitSuccessorCount,
    explicitRetirementApprovalCandidateCount: counts.explicitRetirementApprovalCount,
  },
  summary: {
    candidateCount: records.length,
    gateAEvaluatedCount: records.length,
    ...counts,
    hardErrorCount: hardErrors.length,
  },
  policy: {
    retirementReviewDoesNotMeanUnused: true,
    retirementReviewDoesNotMeanDelete: true,
    gateARequiresExplicitSuccessorOrRetirementApproval: true,
    gateBRequiresExplicitDeletionSafeReadOnlyValidatorAdmission: true,
    informationalReferencesParticipateInDanglingReferenceReadiness: true,
    repositoryReadyIsC5ApprovalForOwnerSpecificC6Handoff: true,
    c5DeletesFiles: false,
    c5ModifiesCandidateArtifacts: false,
    mixedOwnerDeletionBatchAllowed: false,
  },
  freezeBundle: {
    baselineSha: c0.baseline.sha,
    inventoryDigest: c1.inventoryDigest.value,
    referenceGraphDigest: c2.graphDigest.value,
    classificationDigest: c3.classificationDigest.value,
    retentionPartitionDigest: c4.retentionPartitionDigest.value,
    reviewPolicyVersion: contract.input.reviewPolicyVersion,
    destructiveReviewDigest: reviewDigestValue,
  },
  destructiveReviewDigest: {
    algorithm: 'sha256',
    value: reviewDigestValue,
    canonicalization: 'JSON.stringify(sorted-c5-review-record-array)',
  },
  records,
  handoff: {
    currentOwnerComplete: true,
    blockerCount: 0,
    deleteApprovedCount: counts.deleteApprovedCount,
    nextOwner: counts.deleteApprovedCount > 0 ? 'C6_OWNER_SPECIFIC_DELETION_BATCHES' : 'NONE_C6_NOT_OPENED',
    nextStartPoint: counts.deleteApprovedCount > 0
      ? 'Group only deleteApproved candidates by their resolvedDeletionOwner and run owner-specific deletion readiness/validation before any apply.'
      : 'Refresh only affected C5 candidates when explicit successor/retirement approval or deletion-safe owner evidence changes.',
  },
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
