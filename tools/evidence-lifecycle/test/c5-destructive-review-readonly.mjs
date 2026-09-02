import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const c0Path = 'tools/evidence-lifecycle/contracts/c0-scope-admission.v1.json';
const c1Path = 'tools/evidence-lifecycle/generated/c1-inventory.v1.json';
const c2Path = 'tools/evidence-lifecycle/generated/c2-reference-graph.v1.json';
const c3Path = 'tools/evidence-lifecycle/generated/c3-lifecycle-classification.v1.json';
const c4Path = 'tools/evidence-lifecycle/generated/c4-retention-freeze.v1.json';
const contractPath = 'tools/evidence-lifecycle/contracts/c5-destructive-review.v1.json';
const c5Path = 'tools/evidence-lifecycle/generated/c5-destructive-review.v1.json';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const before = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });

const c0 = readJson(c0Path);
const c1 = readJson(c1Path);
const c2 = readJson(c2Path);
const c3 = readJson(c3Path);
const c4 = readJson(c4Path);
const contract = readJson(contractPath);
const committed = readJson(c5Path);

assert.equal(contract.schemaId, 'evidence-lifecycle-c5-destructive-review-contract/v1');
assert.equal(contract.status, 'DESIGN_FROZEN');
assert.equal(contract.completion, 'COMPLETE');
assert.equal(contract.freezeState, 'C5_DESTRUCTIVE_REVIEW_CONTRACT_FROZEN');
assert.equal(contract.baseline.sha, c0.baseline.sha);
assert.equal(contract.input.c1InventoryDigest, c1.inventoryDigest.value);
assert.equal(contract.input.c2GraphDigest, c2.graphDigest.value);
assert.equal(contract.input.c3ClassificationDigest, c3.classificationDigest.value);
assert.equal(contract.input.c4RetentionPartitionDigest, c4.retentionPartitionDigest.value);
assert.equal(contract.input.retirementReviewCount, c4.summary.retirementReviewCount);
assert.equal(contract.candidateScope.candidateCount, c4.summary.retirementReviewCount);
assert.equal(contract.candidateScope.includePartition, 'RETIREMENT_REVIEW');
assert.deepEqual(contract.candidateScope.excludePartitions, ['PROTECTED_CURRENT', 'PROTECTED_RETENTION']);
assert.equal(contract.completionCriteria.candidatePopulationParity, c4.summary.retirementReviewCount);
assert.equal(contract.completionCriteria.gateAEvaluatedCount, c4.summary.retirementReviewCount);
assert.equal(contract.completionCriteria.gateBOnlyEvaluatesGateAEligible, true);
assert.equal(contract.completionCriteria.hardErrorCount, 0);
assert.equal(contract.completionCriteria.semanticReopen, false);
assert.equal(contract.completionCriteria.candidateArtifactMutationCount, 0);
assert.equal(contract.completionCriteria.deletionCount, 0);
assert.equal(contract.completionCriteria.trackedMutationAfterValidationAllowed, false);

const regenerated = JSON.parse(execFileSync('node', ['tools/evidence-lifecycle/cli/c5-destructive-review.mjs'], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
}));
assert.deepEqual(committed, regenerated);

assert.equal(committed.schemaId, 'evidence-lifecycle-c5-destructive-review/v1');
assert.ok(['PASS', 'PASS_WITH_REVIEW'].includes(committed.status));
assert.equal(committed.completion, 'COMPLETE');
assert.equal(committed.freezeState, 'C5_DESTRUCTIVE_REVIEW_COMPLETE');
assert.equal(committed.foundationState, 'C_FOUNDATION_COMPLETE');
assert.equal(committed.baseline.sha, c0.baseline.sha);
assert.equal(committed.input.c1InventoryDigest, c1.inventoryDigest.value);
assert.equal(committed.input.c2GraphDigest, c2.graphDigest.value);
assert.equal(committed.input.c3ClassificationDigest, c3.classificationDigest.value);
assert.equal(committed.input.c4RetentionPartitionDigest, c4.retentionPartitionDigest.value);
assert.equal(committed.input.retirementReviewCount, c4.summary.retirementReviewCount);
assert.equal(committed.authorityBoundary.semanticReopen, false);
assert.equal(committed.authorityBoundary.lifecycleReclassificationCount, 0);
assert.equal(committed.authorityBoundary.rawSemanticRecomputationCount, 0);
assert.equal(committed.authorityBoundary.candidateArtifactMutationCount, 0);
assert.equal(committed.authorityBoundary.deletionCount, 0);

const c4CandidatePaths = c4.records
  .filter((record) => record.partition === 'RETIREMENT_REVIEW')
  .map((record) => record.path)
  .sort();
const c5Paths = committed.records.map((record) => record.path).sort();
assert.equal(c4CandidatePaths.length, c4.summary.retirementReviewCount);
assert.equal(committed.records.length, c4.summary.retirementReviewCount);
assert.deepEqual(c5Paths, c4CandidatePaths);
assert.equal(new Set(c5Paths).size, c5Paths.length);

for (const record of committed.records) {
  assert.equal(record.partition, 'RETIREMENT_REVIEW', `non-C5 partition admitted: ${record.path}`);
  assert.equal(record.protectingReferenceCount, 0, `C4 retirement review candidate unexpectedly protected: ${record.path}`);
  assert.ok(['LOGICAL_ELIGIBLE', 'LOGICAL_INELIGIBLE'].includes(record.gateA.outcome), `invalid Gate A outcome: ${record.path}`);
  assert.ok(['REPOSITORY_READY', 'REPOSITORY_NOT_READY', 'NOT_EVALUATED'].includes(record.gateB.outcome), `invalid Gate B outcome: ${record.path}`);
  if (record.gateA.outcome === 'LOGICAL_INELIGIBLE') {
    assert.equal(record.gateB.outcome, 'NOT_EVALUATED', `Gate B must not evaluate ineligible candidate: ${record.path}`);
  }
  if (record.gateB.outcome === 'REPOSITORY_READY') {
    assert.equal(record.gateA.outcome, 'LOGICAL_ELIGIBLE', `Gate B readiness without Gate A eligibility: ${record.path}`);
    assert.equal(record.deleteApproved, true, `repository-ready candidate must be C5 delete-approved: ${record.path}`);
  }
  if (record.deleteApproved) {
    assert.equal(record.gateA.outcome, 'LOGICAL_ELIGIBLE', `delete approval without Gate A: ${record.path}`);
    assert.equal(record.gateB.outcome, 'REPOSITORY_READY', `delete approval without Gate B readiness: ${record.path}`);
  }
}

assert.equal(committed.summary.candidateCount, c4.summary.retirementReviewCount);
assert.equal(committed.summary.gateAEvaluatedCount, c4.summary.retirementReviewCount);
assert.equal(committed.summary.logicalEligibleCount + committed.summary.logicalIneligibleCount, committed.summary.candidateCount);
assert.equal(committed.summary.repositoryReadyCount + committed.summary.repositoryNotReadyCount, committed.summary.logicalEligibleCount);
assert.equal(committed.summary.repositoryNotEvaluatedCount, committed.summary.logicalIneligibleCount);
assert.equal(committed.summary.deleteApprovedCount, committed.summary.repositoryReadyCount);
assert.equal(committed.summary.hardErrorCount, 0);

assert.equal(contract.gateA.explicitRetirementApprovalDeclarations.length, 0);
assert.equal(contract.gateB.deletionSafeReadOnlyValidatorIds.length, 0);
assert.equal(committed.currentSignalObservation.retirementApprovalDeclarationCount, 0);
assert.equal(committed.currentSignalObservation.deletionSafeReadOnlyValidatorAdmissionCount, 0);
assert.equal(committed.currentSignalObservation.explicitSuccessorCandidateCount, 0);
assert.equal(committed.currentSignalObservation.explicitRetirementApprovalCandidateCount, 0);
assert.equal(committed.summary.logicalEligibleCount, 0);
assert.equal(committed.summary.logicalIneligibleCount, committed.summary.candidateCount);
assert.equal(committed.summary.repositoryReadyCount, 0);
assert.equal(committed.summary.repositoryNotReadyCount, 0);
assert.equal(committed.summary.repositoryNotEvaluatedCount, committed.summary.candidateCount);
assert.equal(committed.summary.deleteApprovedCount, 0);
assert.equal(committed.c6State, 'C6_NOT_OPENED');
assert.equal(committed.handoff.nextOwner, 'NONE_C6_NOT_OPENED');

assert.equal(committed.policy.retirementReviewDoesNotMeanUnused, true);
assert.equal(committed.policy.retirementReviewDoesNotMeanDelete, true);
assert.equal(committed.policy.gateARequiresExplicitSuccessorOrRetirementApproval, true);
assert.equal(committed.policy.gateBRequiresExplicitDeletionSafeReadOnlyValidatorAdmission, true);
assert.equal(committed.policy.informationalReferencesParticipateInDanglingReferenceReadiness, true);
assert.equal(committed.policy.c5DeletesFiles, false);
assert.equal(committed.policy.c5ModifiesCandidateArtifacts, false);
assert.equal(committed.policy.mixedOwnerDeletionBatchAllowed, false);

const expectedDigest = crypto.createHash('sha256').update(JSON.stringify(committed.records)).digest('hex');
assert.equal(committed.destructiveReviewDigest.algorithm, 'sha256');
assert.equal(committed.destructiveReviewDigest.value, expectedDigest);
assert.equal(committed.freezeBundle.destructiveReviewDigest, expectedDigest);

const after = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
assert.equal(after, before, 'C5 validator must not mutate tracked repository state');

console.log(JSON.stringify({
  status: 'PASS',
  completion: 'C5_DESTRUCTIVE_REVIEW_COMPLETE',
  c6State: committed.c6State,
  summary: committed.summary,
  freezeBundle: committed.freezeBundle,
}, null, 2));
