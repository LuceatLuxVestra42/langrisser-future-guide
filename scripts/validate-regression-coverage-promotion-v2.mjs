import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = 'data/contracts/regression-coverage-promotion.v2.json';
const SUMMARY_PATH = 'data/validation/regression-coverage-promotion-summary.v2.json';
const PACKAGE_PATH = 'package.json';

const abs = (relativePath) => path.join(ROOT, relativePath);
const readJson = (relativePath) => JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
const exists = (relativePath) => fs.existsSync(abs(relativePath));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const contract = readJson(CONTRACT_PATH);
const packageJson = readJson(PACKAGE_PATH);
const errors = [];
const checks = [];

function check(id, condition, detail = null) {
  const pass = Boolean(condition);
  checks.push({ id, pass, detail });
  if (!pass) errors.push({ id, detail });
  return pass;
}

function gitBlobSha(relativePath) {
  return execFileSync('git', ['hash-object', relativePath], { cwd: ROOT, encoding: 'utf8' }).trim();
}

function gitHeadBlobSha(relativePath) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${relativePath}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

check('contract-version', contract?.version === 2, contract?.version ?? null);
check('contract-checkpoint', contract?.checkpoint === 'REGRESSION_COVERAGE_PROMOTION_V2', contract?.checkpoint ?? null);
check('contract-design-frozen', contract?.status === 'DESIGN_FROZEN', contract?.status ?? null);
check('v1-contract-exists', exists(contract?.baseline?.v1Contract || ''), contract?.baseline?.v1Contract ?? null);
if (exists(contract?.baseline?.v1Contract || '')) {
  const v1 = readJson(contract.baseline.v1Contract);
  check('v1-checkpoint-preserved', v1?.checkpoint === contract?.baseline?.v1Checkpoint, v1?.checkpoint ?? null);
  const actualV1Blob = gitBlobSha(contract.baseline.v1Contract);
  check('v1-blob-preserved', actualV1Blob === contract?.baseline?.v1GitBlobSha, {
    expected: contract?.baseline?.v1GitBlobSha ?? null,
    actual: actualV1Blob,
  });
}

const policy = contract?.admissionPolicy || {};
check('d3d4-mutation-disabled', policy.d3d4MutationAllowedInThisStage === false, policy.d3d4MutationAllowedInThisStage ?? null);
check('runtime-proof-required', policy.runtimeProofRequired === true, policy.runtimeProofRequired ?? null);
check('readonly-wrapper-policy', policy.readOnlyWrapperPreferredWhenFinalizerMutatesArtifacts === true, policy.readOnlyWrapperPreferredWhenFinalizerMutatesArtifacts ?? null);
check('historical-validator-disallowed', policy.historicalValidatorDisallowed === true, policy.historicalValidatorDisallowed ?? null);
check('build-only-substitute-disallowed', policy.buildOnlySubstituteDisallowed === true, policy.buildOnlySubstituteDisallowed ?? null);

const owners = Array.isArray(contract?.ownerResolutions) ? contract.ownerResolutions : [];
const expectedNodeIds = [
  'hero-canonical',
  'soldier-canonical',
  'equipment-canonical',
  'hero-soldier-relation',
  'hero-equipment-relation',
  'banner-data',
  'skin-relation',
  'shared-movement',
  'soldier-assets',
];
const actualNodeIds = owners.map((owner) => owner.nodeId).sort();
check('owner-count-nine', owners.length === 9, owners.length);
check('owner-node-set', sameJson(actualNodeIds, [...expectedNodeIds].sort()), actualNodeIds);
check('owner-node-unique', new Set(owners.map((owner) => owner.nodeId)).size === owners.length, owners.map((owner) => owner.nodeId));

const forbiddenCommands = new Set(policy.forbiddenOwnerCommands || []);
const forbiddenScripts = new Set(policy.forbiddenOwnerScripts || []);
for (const owner of owners) {
  const prefix = `owner:${owner.nodeId}`;
  check(`${prefix}:resolution`, ['PROMOTE_EXISTING', 'NEW_OWNING_VALIDATOR'].includes(owner?.resolution), owner?.resolution ?? null);
  check(`${prefix}:script-exists`, typeof owner?.ownerScript === 'string' && exists(owner.ownerScript), owner?.ownerScript ?? null);
  check(`${prefix}:package-command-present`, typeof packageJson?.scripts?.[owner?.packageCommand] === 'string', owner?.packageCommand ?? null);
  check(`${prefix}:package-command-exact`, packageJson?.scripts?.[owner?.packageCommand] === owner?.commandValue, {
    command: owner?.packageCommand ?? null,
    expected: owner?.commandValue ?? null,
    actual: packageJson?.scripts?.[owner?.packageCommand] ?? null,
  });
  check(`${prefix}:not-forbidden-command`, !forbiddenCommands.has(owner?.packageCommand), owner?.packageCommand ?? null);
  check(`${prefix}:not-forbidden-script`, !forbiddenScripts.has(owner?.ownerScript), owner?.ownerScript ?? null);
  check(`${prefix}:not-builder-owner`, !String(owner?.ownerScript || '').includes('build_shared_movement_types'), owner?.ownerScript ?? null);
  for (const evidencePath of owner?.evidence || []) {
    check(`${prefix}:evidence:${evidencePath}`, exists(evidencePath), evidencePath);
  }
  if (typeof owner?.ownerScript === 'string' && exists(owner.ownerScript)) {
    const source = fs.readFileSync(abs(owner.ownerScript), 'utf8');
    check(`${prefix}:nonzero-failure-signal`, typeof owner?.failureSignal === 'string' && source.includes(owner.failureSignal), owner?.failureSignal ?? null);
  }
}

const resolutionExpected = contract?.expectedResolutionCounts || {};
const promoteExisting = owners.filter((owner) => owner.resolution === 'PROMOTE_EXISTING').length;
const newOwningValidator = owners.filter((owner) => owner.resolution === 'NEW_OWNING_VALIDATOR').length;
const unresolved = owners.length - promoteExisting - newOwningValidator;
check('resolution-count-total', resolutionExpected.total === 9 && owners.length === resolutionExpected.total, { expected: resolutionExpected.total ?? null, actual: owners.length });
check('resolution-count-promote-existing', resolutionExpected.promoteExisting === 6 && promoteExisting === resolutionExpected.promoteExisting, { expected: resolutionExpected.promoteExisting ?? null, actual: promoteExisting });
check('resolution-count-new-owner', resolutionExpected.newOwningValidator === 3 && newOwningValidator === resolutionExpected.newOwningValidator, { expected: resolutionExpected.newOwningValidator ?? null, actual: newOwningValidator });
check('resolution-count-unresolved-zero', resolutionExpected.unresolved === 0 && unresolved === 0, { expected: resolutionExpected.unresolved ?? null, actual: unresolved });

const soldierOwner = owners.find((owner) => owner.nodeId === 'soldier-canonical');
check('soldier-owner-stage6-7-wrapper', soldierOwner?.ownerScript === 'scripts/validate-soldier-stage6-7-final.mjs', soldierOwner ?? null);
check('soldier-owner-old-stage4-8-rejected', soldierOwner?.ownerScript !== 'scripts/validate-soldier-stage4-8-baseline.cjs', soldierOwner?.ownerScript ?? null);
check('soldier-owner-resolution-new', soldierOwner?.resolution === 'NEW_OWNING_VALIDATOR', soldierOwner?.resolution ?? null);

const soldierGenerated = readJson('data/generated/soldier-stage6-7-site-admission.v1.json');
const soldierValidation = readJson('data/validation/soldier-stage6-7-site-admission.v1.json');
const soldierGate = contract?.specialGates?.soldierCanonical || {};
const acceptedSoldierAdmissions = Array.isArray(soldierGate.acceptedAdmissionStatuses) ? soldierGate.acceptedAdmissionStatuses : [];
check('soldier-stage6-7-generated-schema', soldierGenerated?.schemaId === 'soldier-stage6-7-site-admission/v1' && soldierGenerated?.stage === soldierGate.stage, { schemaId: soldierGenerated?.schemaId ?? null, stage: soldierGenerated?.stage ?? null });
check('soldier-stage6-7-validation-schema', soldierValidation?.schemaId === 'soldier-stage6-7-site-admission-validation/v1' && soldierValidation?.stage === soldierGate.stage, { schemaId: soldierValidation?.schemaId ?? null, stage: soldierValidation?.stage ?? null });
check('soldier-stage6-7-status-pass', soldierGenerated?.status === 'PASS' && soldierValidation?.status === 'PASS', { generated: soldierGenerated?.status ?? null, validation: soldierValidation?.status ?? null });
check('soldier-stage6-7-admission-status', acceptedSoldierAdmissions.includes(soldierGenerated?.admissionStatus) && soldierGenerated?.admissionStatus === soldierValidation?.admissionStatus, { accepted: acceptedSoldierAdmissions, generated: soldierGenerated?.admissionStatus ?? null, validation: soldierValidation?.admissionStatus ?? null });

const soldierCoverageExpected = {
  canonicalSoldiers: soldierGate.canonicalCount,
  normalSoldiers: soldierGate.normalCount,
  spSoldiers: soldierGate.spCount,
  normalTier3: soldierGate.normalTier3Count,
  failRecords: soldierGate.failRecordCount,
  representativeFixtures: 6,
  representativeFixturesPassed: 6,
  filterTests: 15,
  filterTestsPassed: 15,
  heroKeys: soldierGate.heroKeyCount,
  soldierKeys: soldierGate.soldierKeyCount,
  heroSoldierRelations: soldierGate.relationCount,
  reciprocalMismatchCount: soldierGate.reciprocalMismatchCount,
};
for (const [key, expected] of Object.entries(soldierCoverageExpected)) {
  check(`soldier-generated-coverage:${key}`, soldierGenerated?.summary?.[key] === expected, { expected, actual: soldierGenerated?.summary?.[key] ?? null });
  check(`soldier-validation-coverage:${key}`, soldierValidation?.coverage?.[key] === expected, { expected, actual: soldierValidation?.coverage?.[key] ?? null });
}
check('soldier-representative-qa-contract', soldierGate.representativeQa === '6/6', soldierGate.representativeQa ?? null);
check('soldier-filter-qa-contract', soldierGate.filterQa === '15/15', soldierGate.filterQa ?? null);

const expectedAdmissionGates = [
  'generationComplete',
  'validationClassified',
  'representativeQa',
  'listAndRelease',
  'filterQa',
  'reciprocalHeroLinks',
  'expansionFoundation',
  'sourceSnapshotsFrozen',
  'derivationDocumented',
];
for (const gate of expectedAdmissionGates) {
  check(`soldier-generated-gate:${gate}`, soldierGenerated?.admissionGates?.[gate] === 'PASS', soldierGenerated?.admissionGates?.[gate] ?? null);
  check(`soldier-validation-gate:${gate}`, soldierValidation?.admissionGates?.[gate] === 'PASS', soldierValidation?.admissionGates?.[gate] ?? null);
}

const requiredSoldierValidationChecks = [
  'upstreamStatusFailures',
  'sourceSnapshotMismatches',
  'coverageMismatches',
  'recordFailCount',
  'undeclaredReviewCodes',
  'representativeFailedFixtures',
  'filterFailedTests',
  'reciprocalPagePairMismatch',
  'expansionPreservationFailures',
  'documentationMissing',
  'admissionGateFailures',
];
for (const key of requiredSoldierValidationChecks) {
  check(`soldier-validation-check:${key}`, soldierValidation?.checks?.[key] === 0, soldierValidation?.checks?.[key] ?? null);
}
check('soldier-validation-errors-zero', Array.isArray(soldierValidation?.errors) && soldierValidation.errors.length === 0, soldierValidation?.errors ?? null);
check('soldier-source-snapshot-mismatch-array-zero', Array.isArray(soldierValidation?.sourceSnapshotMismatches) && soldierValidation.sourceSnapshotMismatches.length === 0, soldierValidation?.sourceSnapshotMismatches ?? null);
check('soldier-coverage-mismatch-array-zero', Array.isArray(soldierValidation?.coverageMismatches) && soldierValidation.coverageMismatches.length === 0, soldierValidation?.coverageMismatches ?? null);
check('soldier-documentation-missing-array-zero', Array.isArray(soldierValidation?.documentationMissing) && soldierValidation.documentationMissing.length === 0, soldierValidation?.documentationMissing ?? null);
check('soldier-admission-gate-failures-array-zero', Array.isArray(soldierValidation?.admissionGateFailures) && soldierValidation.admissionGateFailures.length === 0, soldierValidation?.admissionGateFailures ?? null);

const soldierFrozenRefs = [
  ...Object.entries(soldierGenerated?.sources || {}).map(([label, ref]) => ({ group: 'source', label, ref })),
  ...Object.entries(soldierGenerated?.keyArtifacts || {}).map(([label, ref]) => ({ group: 'keyArtifact', label, ref })),
];
check('soldier-source-ref-count', Object.keys(soldierGenerated?.sources || {}).length === 12, Object.keys(soldierGenerated?.sources || {}).length);
check('soldier-key-artifact-ref-count', Object.keys(soldierGenerated?.keyArtifacts || {}).length === 6, Object.keys(soldierGenerated?.keyArtifacts || {}).length);
let soldierFrozenMismatchCount = 0;
for (const { group, label, ref } of soldierFrozenRefs) {
  const shapeOk = ref && typeof ref.path === 'string' && typeof ref.gitBlobSha === 'string';
  check(`soldier-frozen-ref-shape:${group}:${label}`, shapeOk, ref ?? null);
  if (!shapeOk) {
    soldierFrozenMismatchCount += 1;
    continue;
  }
  check(`soldier-frozen-ref-exists:${group}:${label}`, exists(ref.path), ref.path);
  const actual = gitHeadBlobSha(ref.path);
  const matches = actual === ref.gitBlobSha;
  check(`soldier-frozen-ref-sha:${group}:${label}`, matches, { path: ref.path, expected: ref.gitBlobSha, actual });
  if (!matches) soldierFrozenMismatchCount += 1;
}
check('soldier-frozen-snapshots-match-head', soldierGate.frozenSourceSnapshotsMustMatchHead === true && soldierFrozenMismatchCount === 0, { required: soldierGate.frozenSourceSnapshotsMustMatchHead ?? null, mismatchCount: soldierFrozenMismatchCount });

const movement = readJson('data/validation/shared-movement-type-index-final.v1.json');
const movementGate = contract?.specialGates?.sharedMovement || {};
check('movement-status-pass', movement?.status === 'PASS', movement?.status ?? null);
check('movement-definition-count', movement?.summary?.definitionCount === movementGate.definitionCount, movement?.summary?.definitionCount ?? null);
check('movement-canonical-hero-count', movement?.summary?.canonicalHeroCount === movementGate.canonicalHeroCount, movement?.summary?.canonicalHeroCount ?? null);
check('movement-hero-job-count', movement?.summary?.heroJobCount === movementGate.heroJobCount && movement?.summary?.generatedHeroJobCount === movementGate.heroJobCount, movement?.summary ?? null);
check('movement-soldier-count', movement?.summary?.canonicalSoldierCount === movementGate.soldierCount && movement?.summary?.generatedSoldierCount === movementGate.soldierCount, movement?.summary ?? null);
check('movement-hard-errors-zero', movement?.summary?.hardErrorCount === 0 && Array.isArray(movement?.hardErrors) && movement.hardErrors.length === 0, movement?.hardErrors ?? null);
const movementOwner = owners.find((owner) => owner.nodeId === 'shared-movement');
check('movement-builder-rejected', movementOwner?.packageCommand !== 'build:movement-types' && movementOwner?.ownerScript !== 'scripts/build_shared_movement_types.mjs', movementOwner ?? null);

const portraitManifest = readJson('data/generated/soldier-portrait-manifest.v9.json');
const portraitAudit = readJson('data/validation/soldier-portrait-v9-source-audit.json');
const portraitGate = contract?.specialGates?.soldierAssets || {};
check('portrait-manifest-v9', portraitManifest?.version === portraitGate.manifestVersion, portraitManifest?.version ?? null);
check('portrait-status-pass', portraitManifest?.status === 'PASS' && portraitAudit?.status === 'PASS', { manifest: portraitManifest?.status ?? null, audit: portraitAudit?.status ?? null });
check('portrait-coverage-224', portraitManifest?.coverage?.canonicalSoldierCount === portraitGate.canonicalCount && portraitManifest?.coverage?.resolvedCount === portraitGate.resolvedCount && portraitManifest?.coverage?.unresolvedCount === portraitGate.unresolvedCount, portraitManifest?.coverage ?? null);
check('portrait-normal-sp-coverage', portraitManifest?.coverage?.canonicalNormalCount === portraitGate.normalCount && portraitManifest?.coverage?.canonicalSpCount === portraitGate.spCount, portraitManifest?.coverage ?? null);
check('portrait-audit-224', portraitAudit?.canonicalCount === portraitGate.canonicalCount && portraitAudit?.cleanResolvedCount === portraitGate.resolvedCount && portraitAudit?.unresolvedCount === portraitGate.unresolvedCount, portraitAudit ?? null);
check('portrait-no-synthetic-processing', portraitManifest?.policy?.generatedImageUsed === false && portraitManifest?.policy?.backgroundRemovalUsed === false && portraitManifest?.policy?.syntheticEditingUsed === false, portraitManifest?.policy ?? null);
const portraitRecords = Array.isArray(portraitManifest?.records) ? portraitManifest.records : [];
const sourceDerivativeSeparated = portraitRecords.length === 224 && portraitRecords.every((record) =>
  Number.isInteger(record?.soldierId) &&
  typeof record?.sourceFileName === 'string' &&
  typeof record?.sourceUrl === 'string' && /^https:\/\//.test(record.sourceUrl) &&
  record?.fileName === `${record.soldierId}.png` &&
  record.sourceFileName !== record.fileName
);
check('portrait-source-derivative-separated', sourceDerivativeSeparated, { recordCount: portraitRecords.length });

const unchangedManualScope = contract?.unchangedV1ManualScope || {};
check('manual-scope-unchanged', unchangedManualScope['hero-assets'] === 'PARTIAL' && unchangedManualScope['equipment-assets'] === 'PARTIAL' && unchangedManualScope['banner-assets'] === 'PARTIAL' && unchangedManualScope['skin-assets'] === 'KEEP_MANUAL', unchangedManualScope);

const status = errors.length === 0 ? 'PASS' : 'FAIL';
const summary = {
  version: 2,
  schemaId: 'regression-coverage-promotion-summary/v2',
  checkpoint: 'REGRESSION_COVERAGE_PROMOTION_V2',
  status,
  contract: CONTRACT_PATH,
  baseline: {
    v1Contract: contract?.baseline?.v1Contract ?? null,
    v1GitBlobSha: contract?.baseline?.v1GitBlobSha ?? null,
    v1Preserved: checks.find((item) => item.id === 'v1-blob-preserved')?.pass === true,
  },
  ownerResolution: {
    total: owners.length,
    promoteExisting,
    newOwningValidator,
    unresolved,
    admittedNodeIds: status === 'PASS' ? owners.map((owner) => owner.nodeId) : [],
  },
  specialGates: {
    soldierCanonical: {
      status: soldierGenerated?.status ?? null,
      admissionStatus: soldierGenerated?.admissionStatus ?? null,
      canonical: soldierGenerated?.summary?.canonicalSoldiers ?? null,
      normal: soldierGenerated?.summary?.normalSoldiers ?? null,
      sp: soldierGenerated?.summary?.spSoldiers ?? null,
      failRecords: soldierGenerated?.summary?.failRecords ?? null,
      frozenRefCount: soldierFrozenRefs.length,
      frozenSnapshotMismatchCount: soldierFrozenMismatchCount,
      historicalStage4_8Rejected: checks.find((item) => item.id === 'soldier-owner-old-stage4-8-rejected')?.pass === true,
    },
    sharedMovement: {
      status: movement?.status ?? null,
      heroJobs: movement?.summary?.heroJobCount ?? null,
      soldiers: movement?.summary?.canonicalSoldierCount ?? null,
      builderRejectedAsOwner: checks.find((item) => item.id === 'movement-builder-rejected')?.pass === true,
    },
    soldierAssets: {
      manifestVersion: portraitManifest?.version ?? null,
      canonical: portraitManifest?.coverage?.canonicalSoldierCount ?? null,
      resolved: portraitManifest?.coverage?.resolvedCount ?? null,
      unresolved: portraitManifest?.coverage?.unresolvedCount ?? null,
      sourceDerivativeSeparated,
    },
  },
  doctorMutation: {
    d3d4ChangedByThisStage: false,
    admissionAllowed: status === 'PASS',
  },
  checkCount: checks.length,
  failureCount: errors.length,
  failures: errors,
  completion: status === 'PASS'
    ? 'All nine V1 final-owner blocks have exact registered owning validators: six promoted existing validators and three dedicated read-only/new owning validators. V2 audit is ready for a separate Doctor D3/D4 admission stage.'
    : 'V2 owner admission remains blocked until all exact owner, package, failure, Soldier Stage 6-7, movement and asset checks pass.',
};

fs.writeFileSync(abs(SUMMARY_PATH), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({
  checkpoint: summary.checkpoint,
  status,
  checkCount: summary.checkCount,
  failureCount: summary.failureCount,
  ownerResolution: summary.ownerResolution,
  soldierCanonical: summary.specialGates.soldierCanonical,
}, null, 2));
if (errors.length) process.exit(1);