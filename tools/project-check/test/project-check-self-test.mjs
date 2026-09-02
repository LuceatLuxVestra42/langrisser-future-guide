import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  executeProjectCheck,
  loadProjectCheckContracts,
  preflightProjectCheck,
  routeProjectCheckPaths,
} from '../lib/project-check.mjs';

const repoRoot = process.cwd();
const contracts = loadProjectCheckContracts({ repoRoot });
const readJson = relative => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));

function validatorIds(route) {
  return route.validators.map(item => item.id);
}

function expectOwners(filePath, expectedOwners, expectedValidators) {
  const route = routeProjectCheckPaths([filePath], contracts);
  assert.equal(route.changedFileCount, 1);
  assert.deepEqual(route.files[0].owners, [...expectedOwners].sort());
  assert.deepEqual(validatorIds(route), expectedValidators);
  return route;
}

expectOwners(
  'tools/status-source/lib/select-active-sources.mjs',
  ['status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection'],
);
expectOwners(
  '.github/workflows/project-tooling-r1-status-source-writer.yml',
  ['status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection'],
);
expectOwners(
  '.github/workflows/project-doctor-status-source-stage6-3-apply-handoff.yml',
  ['status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection'],
);
expectOwners(
  'tools/project-status/lib/normalize-project-status.mjs',
  ['project-status'],
  ['project-status-parity'],
);
expectOwners(
  '.github/workflows/project-tooling-r2-project-status-writer.yml',
  ['project-status'],
  ['project-status-parity'],
);
expectOwners(
  '.github/workflows/project-status-sync.yml',
  ['project-status'],
  ['project-status-parity'],
);
expectOwners(
  'data/generated/project-status.v1.json',
  ['project-status'],
  ['project-status-parity'],
);
expectOwners(
  'PROJECT_STATUS.md',
  ['project-status'],
  ['project-status-parity'],
);
expectOwners(
  'tools/project-check/lib/project-check.mjs',
  ['project-check'],
  ['project-check-self-test'],
);
expectOwners(
  'tools/regression-runner/lib/runner.mjs',
  ['regression-runner'],
  ['regression-runner-self-test'],
);
expectOwners(
  '.github/workflows/project-tooling-regression-runner.yml',
  ['regression-runner'],
  ['regression-runner-self-test'],
);
expectOwners(
  'data/contracts/project-tooling-regression-runner-r2-admission.v1.json',
  ['regression-runner'],
  ['regression-runner-self-test'],
);
expectOwners(
  'tools/route-hosted-qa/lib/hosted-qa.mjs',
  ['route-hosted-qa'],
  ['route-hosted-qa-self-test'],
);
expectOwners(
  '.github/workflows/project-tooling-route-hosted-qa.yml',
  ['route-hosted-qa'],
  ['route-hosted-qa-self-test'],
);
expectOwners(
  'data/contracts/project-tooling-route-hosted-qa-rh2-admission.v1.json',
  ['route-hosted-qa'],
  ['route-hosted-qa-self-test'],
);
expectOwners(
  'tools/configdata-lookup/lib/lookup.mjs',
  ['configdata-lookup'],
  ['configdata-lookup-self-test'],
);
expectOwners(
  '.github/workflows/project-tooling-configdata-lookup-clr2.yml',
  ['configdata-lookup'],
  ['configdata-lookup-self-test'],
);
expectOwners(
  'data/contracts/project-tooling-configdata-lookup-clr4-admission.v1.json',
  ['configdata-lookup'],
  ['configdata-lookup-self-test'],
);
expectOwners(
  'data/contracts/project-tooling-project-check-configdata-lookup-clr3-self-test.v1.json',
  ['project-check'],
  ['project-check-self-test'],
);
expectOwners(
  'data/contracts/project-tooling-project-doctor-deletion-inventory.v1.json',
  ['project-check'],
  ['project-check-self-test'],
);
expectOwners(
  'data/contracts/project-tooling-project-doctor-deletion-manifest.v1.json',
  ['project-check'],
  ['project-check-self-test'],
);
expectOwners(
  '.github/workflows/project-doctor-d7-pr-guard.yml',
  ['project-check'],
  ['project-check-self-test'],
);
expectOwners(
  'scripts/run-project-doctor-closeout-v6.mjs',
  ['project-check'],
  ['project-check-self-test'],
);
expectOwners(
  'package.json',
  ['shared-build'],
  ['production-build'],
);
expectOwners(
  'src/routes/heroes.tsx',
  ['hero-frontend'],
  ['production-build'],
);
expectOwners(
  'data/generated/hero-card-icon-assets.v1.json',
  ['hero-assets'],
  ['hero-assets'],
);
expectOwners(
  'data/contracts/hero-card-icon-source-pack.v1.json',
  ['hero-card-icon-source-pack-assets'],
  ['hero-card-icon-source-pack-assets'],
);
expectOwners(
  'data/validation/hero-card-icon-source-pack.v1.json',
  ['hero-card-icon-source-pack-assets'],
  ['hero-card-icon-source-pack-assets'],
);
expectOwners(
  'scripts/hydrate-hero-card-icon-source-pack-v1.mjs',
  ['hero-card-icon-source-pack-assets'],
  ['hero-card-icon-source-pack-assets'],
);
expectOwners(
  '.github/workflows/hero-card-icon-source-pack-hydration-v1.yml',
  ['hero-card-icon-source-pack-assets'],
  ['hero-card-icon-source-pack-assets'],
);
expectOwners(
  'public/images/heroes/card-icons/6.png',
  ['hero-card-icon-source-pack-assets', 'hero-frontend'],
  ['hero-card-icon-source-pack-assets', 'production-build'],
);
expectOwners(
  'public/images/heroes/cards/6.png',
  ['hero-assets', 'hero-frontend'],
  ['hero-assets', 'production-build'],
);
expectOwners(
  'public/images/heroes/card-icons-webp/6.webp',
  ['hero-assets', 'hero-frontend'],
  ['hero-assets', 'production-build'],
);
expectOwners(
  'data/validation/hero-stage6-4-final.v1.json',
  ['hero-canonical', 'status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection', 'hero-canonical'],
);
expectOwners(
  'data/validation/soldier-stage6-7-site-admission.v1.json',
  ['soldier-canonical', 'status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection', 'soldier-canonical'],
);
expectOwners(
  'data/validation/equipment-stage4-final.v1.json',
  ['equipment-frontend', 'status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection', 'production-build'],
);
expectOwners(
  'data/validation/equipment-public-presentation-correction-final.v1.json',
  ['equipment-frontend', 'localization', 'status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection', 'localization-audit', 'production-build'],
);
expectOwners(
  'data/validation/hero-soldier-integration-stageC-final.v1.json',
  ['hero-soldier-relation', 'status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection', 'hero-soldier-relation'],
);
expectOwners(
  'data/validation/banner-stage3-8-regression-freeze-summary.v1.json',
  ['banner-data', 'status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection', 'banner-data'],
);
expectOwners(
  'data/validation/skin-stage3-2-readiness.v1.json',
  ['skin-stage3-2-evidence', 'status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection', 'skin-stage3-2-evidence'],
);
expectOwners(
  'data/presentation/equipment-display-collection.v1.json',
  ['equipment-frontend', 'localization'],
  ['localization-audit', 'production-build'],
);
expectOwners(
  'data/configdata/ConfigDataHeroInfo.json',
  ['configdata', 'configdata-source-pack', 'hero-canonical', 'skin-relation'],
  ['configdata-source-pack-boundary', 'configdata-integrity', 'hero-canonical', 'skin-relation'],
);

const bannerAsset = routeProjectCheckPaths(['public/images/banners/Banner/probe.png'], contracts);
assert.equal(bannerAsset.status, 'MANUAL_REVIEW');
assert.deepEqual(bannerAsset.files[0].owners, ['banner-assets', 'banner-frontend']);
assert.deepEqual(validatorIds(bannerAsset), ['production-build']);
assert.equal(bannerAsset.manualReviews[0].ownerId, 'banner-assets');

const skinFullartAsset = routeProjectCheckPaths(['public/images/skin-fullart/601.webp'], contracts);
assert.equal(skinFullartAsset.status, 'PLAN_READY');
assert.deepEqual(skinFullartAsset.files[0].owners, ['skin-fullart-assets']);
assert.deepEqual(validatorIds(skinFullartAsset), ['skin-fullart-assets-readonly']);

const skinFullartConsumer = routeProjectCheckPaths(['src/lib/skin-fullart-assets.ts'], contracts);
assert.equal(skinFullartConsumer.status, 'PLAN_READY');
assert.deepEqual(skinFullartConsumer.files[0].owners, ['hero-frontend', 'skin-fullart-assets']);
assert.deepEqual(validatorIds(skinFullartConsumer), ['skin-fullart-assets-readonly', 'production-build']);

const skinAsset = routeProjectCheckPaths(['data/evidence/skin-stage3-2-static-source-evidence.v1.json'], contracts);
assert.equal(skinAsset.status, 'PLAN_READY');
assert.deepEqual(skinAsset.files[0].owners, ['skin-assets']);
assert.deepEqual(validatorIds(skinAsset), ['skin-static-assets-readonly']);

const unknownConfig = routeProjectCheckPaths(['data/configdata/ConfigDataUnknownFutureTable.json'], contracts);
assert.equal(unknownConfig.status, 'PLAN_READY');
assert.equal(unknownConfig.files[0].status, 'MAPPED');
assert.deepEqual(unknownConfig.files[0].owners, ['configdata', 'configdata-source-pack']);
assert.deepEqual(validatorIds(unknownConfig), ['configdata-source-pack-boundary', 'configdata-integrity']);
assert.equal(unknownConfig.manualReviews.length, 0);

const migrationRoute = routeProjectCheckPaths([
  'data/contracts/project-tooling-migration-r0.v1.json',
  'tools/status-source/test/current-main-parity.mjs',
  'tools/project-status/test/current-parity.mjs',
  'tools/project-check/test/project-check-self-test.mjs',
], contracts);
assert.equal(migrationRoute.status, 'PLAN_READY');
assert.deepEqual(migrationRoute.owners, ['project-check', 'project-status', 'status-source']);
assert.deepEqual(validatorIds(migrationRoute), [
  'status-source-artifact-bridge',
  'status-source-lifecycle',
  'status-source-producer-gate',
  'status-source-promotion',
  'status-source-selection',
  'project-status-parity',
  'project-check-self-test',
]);
assert.equal(migrationRoute.boundaries.ownerPropagationCount, 0);
assert.equal(migrationRoute.boundaries.changeClassFanOutCount, 0);

const allPass = validator => ({ validatorId: validator.id, exitCode: 0, signal: null });
const manualResult = executeProjectCheck(['public/images/banners/Banner/probe.png'], {
  repoRoot,
  contracts,
  preflight: { pass: true, failures: [] },
  executor: allPass,
});
assert.equal(manualResult.status, 'REVIEW');
assert.equal(manualResult.exitCode, 3);
assert.equal(manualResult.executions.length, 1);

let executionCount = 0;
const failedResult = executeProjectCheck(['src/routes/heroes.tsx'], {
  repoRoot,
  contracts,
  preflight: { pass: true, failures: [] },
  executor: validator => {
    executionCount += 1;
    return { validatorId: validator.id, exitCode: 1, signal: null };
  },
});
assert.equal(failedResult.status, 'BLOCKER');
assert.equal(failedResult.exitCode, 2);
assert.equal(failedResult.failedValidatorId, 'production-build');
assert.equal(executionCount, 1);

const noChanges = executeProjectCheck([], {
  repoRoot,
  contracts,
  preflight: { pass: true, failures: [] },
  executor: allPass,
});
assert.equal(noChanges.status, 'NO_CHANGES');
assert.equal(noChanges.exitCode, 0);
assert.equal(noChanges.executions.length, 0);

const planOnly = executeProjectCheck(['tools/project-status/cli/status.mjs'], {
  repoRoot,
  contracts,
  planOnly: true,
});
assert.equal(planOnly.status, 'PASS');
assert.equal(planOnly.exitCode, 0);
assert.equal(planOnly.executions.length, 0);

const catalogPreflight = preflightProjectCheck({ repoRoot, validators: contracts.validatorCatalog.validators });
assert.deepEqual(catalogPreflight, { pass: true, failures: [] });

const runtimePaths = [
  'tools/project-check/lib/project-check.mjs',
  'tools/project-check/cli/check.mjs',
];
const forbiddenRuntimeTokens = [
  'data/generated/project-doctor',
  'scripts/analyze-project-doctor',
  'scripts/plan-project-doctor',
  'scripts/run-project-doctor',
  'project-doctor-d2-',
  'project-doctor-d3-',
  'project-doctor-d4-',
  'project-doctor-d5-',
  'project-doctor-d7-',
  'PROJECT_STATUS.md',
  'data/generated/project-status.v1.json',
];
for (const runtimePath of runtimePaths) {
  const text = fs.readFileSync(runtimePath, 'utf8');
  for (const token of forbiddenRuntimeTokens) {
    assert.equal(text.includes(token), false, `${runtimePath} must not depend on ${token}`);
  }
}

const deletionManifest = readJson('data/contracts/project-tooling-project-doctor-deletion-manifest.v1.json');
assert.equal(deletionManifest.schemaId, 'project-tooling-project-doctor-deletion-manifest/v1');
assert.equal(deletionManifest.applyNextStep.exactPathOnly, true);
assert.equal(deletionManifest.applyNextStep.filenameSimilarityAllowed, false);
assert.equal(deletionManifest.requiredCheckRollbackWindow.operationalLegacyGuardRetentionRequired, false);

const deletionPhase = deletionManifest.applyNextStep.state;
const prepared = deletionManifest.completion === 'EXACT_DELETION_MANIFEST_PREPARED' && deletionPhase === 'READY_AFTER_MANIFEST_VALIDATION';
const applying = deletionManifest.completion === 'OLD_DOCTOR_RETIREMENT_APPLYING' && deletionPhase === 'APPLYING';
const applied = deletionManifest.completion === 'OLD_DOCTOR_RETIREMENT_APPLIED' && deletionPhase === 'APPLIED';
assert.equal(prepared || applying || applied, true, `unsupported deletion manifest phase: ${deletionManifest.completion}/${deletionPhase}`);
if (prepared || applying) assert.equal(deletionManifest.applyNextStep.actualDeletionApplied, false);
if (prepared) assert.equal(deletionManifest.applyNextStep.packageJsonMutated, false);
if (applied) {
  assert.equal(deletionManifest.applyNextStep.actualDeletionApplied, true);
  assert.equal(deletionManifest.applyNextStep.packageJsonMutated, true);
}

const deletionFiles = deletionManifest.applyNextStep.fileDeletions;
const deletionSet = new Set(deletionFiles);
assert.equal(deletionSet.size, deletionFiles.length, 'deletion manifest file paths must be unique');
for (const relative of deletionFiles) {
  assert.equal(/[*?\[\]]/.test(relative), false, `deletion manifest must use exact paths only: ${relative}`);
  const exists = fs.existsSync(path.join(repoRoot, relative));
  if (prepared) assert.equal(exists, true, `deletion candidate must exist before apply: ${relative}`);
  if (applied) assert.equal(exists, false, `deleted OLD Doctor path must be absent after apply: ${relative}`);
}

const retainedRollbackFiles = [
  ...deletionManifest.retainWriterRollback.workflows,
  ...deletionManifest.retainWriterRollback.scripts,
  ...deletionManifest.retainWriterRollback.generatedState,
];
const retainedRollbackSet = new Set(retainedRollbackFiles);
assert.equal(retainedRollbackSet.size, retainedRollbackFiles.length, 'retained rollback paths must be unique');
for (const relative of retainedRollbackFiles) {
  assert.equal(fs.existsSync(path.join(repoRoot, relative)), true, `retained rollback path must exist: ${relative}`);
  assert.equal(deletionSet.has(relative), false, `delete/retain overlap is forbidden: ${relative}`);
}

for (const protectedPath of deletionManifest.preserve.newCanonicalProjectStatus) {
  assert.equal(deletionSet.has(protectedPath), false, `NEW canonical Project Status output cannot be deleted: ${protectedPath}`);
  assert.equal(fs.existsSync(path.join(repoRoot, protectedPath)), true, `NEW canonical Project Status output must exist: ${protectedPath}`);
}
for (const prefix of deletionManifest.preserve.historicalEvidencePolicy.protectedPrefixes) {
  assert.equal(deletionFiles.some(relative => relative.startsWith(prefix)), false, `historical evidence prefix cannot enter deletion set: ${prefix}`);
}
for (const prefix of deletionManifest.preserve.newToolingPrefixes) {
  assert.equal(deletionFiles.some(relative => relative.startsWith(prefix)), false, `NEW tooling prefix cannot enter deletion set: ${prefix}`);
}
for (const token of deletionManifest.preserve.hostedQa.protectedPathTokens) {
  assert.equal(deletionFiles.some(relative => relative.includes(token)), false, `Hosted QA path cannot enter deletion set: ${token}`);
}

const packageJson = readJson('package.json');
const packageScripts = packageJson.scripts ?? {};
const removalKeys = deletionManifest.applyNextStep.packageScriptRemovals;
const removalSet = new Set(removalKeys);
assert.equal(removalSet.size, removalKeys.length, 'package script removals must be unique');
for (const key of removalKeys) {
  if (prepared) assert.equal(typeof packageScripts[key], 'string', `package removal entrypoint must exist before apply: ${key}`);
  if (applied) assert.equal(packageScripts[key], undefined, `retired package entrypoint must be absent after apply: ${key}`);
}
const protectedPackageKeys = [
  ...deletionManifest.retainWriterRollback.packageEntrypoints,
  ...deletionManifest.preserve.hostedQa.packageEntrypoints,
  ...deletionManifest.preserve.independentValidators.packageEntrypoints,
];

const rr9CheckpointPath = 'data/contracts/project-tooling-regression-runner-r9-retirement.v1.json';
const rr9Checkpoint = fs.existsSync(path.join(repoRoot, rr9CheckpointPath)) ? readJson(rr9CheckpointPath) : null;
const rr9RetiredPackageKeys = new Set(
  (rr9Checkpoint?.runtimeRetirementInventory?.removeEntrypoint ?? [])
    .filter(item => item?.path === 'package.json' && typeof item?.key === 'string')
    .map(item => item.key.startsWith('scripts.') ? item.key.slice('scripts.'.length) : item.key),
);
if (rr9Checkpoint) {
  assert.equal(rr9Checkpoint.stage, 'RR9');
  assert.equal(rr9Checkpoint.proof?.rr8ProofConditionSatisfied, true);
  assert.deepEqual([...rr9RetiredPackageKeys], ['validate:regression-coverage-promotion:v2']);
}
for (const key of protectedPackageKeys) {
  if (rr9RetiredPackageKeys.has(key)) {
    assert.equal(key, 'validate:regression-coverage-promotion:v2', `unexpected RR9 package retirement: ${key}`);
    assert.equal(packageScripts[key], undefined, `RR9 retired package entrypoint must be absent: ${key}`);
    assert.equal(removalSet.has(key), false, `RR9 retirement must not rewrite historical OLD Doctor deletion set: ${key}`);
    continue;
  }
  assert.equal(typeof packageScripts[key], 'string', `protected package entrypoint must currently exist: ${key}`);
  assert.equal(removalSet.has(key), false, `protected package entrypoint cannot be removed: ${key}`);
}

assert.throws(
  () => routeProjectCheckPaths(['../outside'], contracts),
  /Invalid repository path/,
);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'PROJECT_CHECK_R3_SELF_TEST',
  fixtures: 47,
  catalogValidatorCount: contracts.validatorCatalog.validators.length,
  ownerCount: contracts.ownerMap.owners.length,
  deletionManifest: {
    status: deletionManifest.status,
    completion: deletionManifest.completion,
    phase: deletionPhase,
    deletionFileCount: deletionFiles.length,
    packageScriptRemovalCount: removalKeys.length,
    retainedWriterRollbackPathCount: retainedRollbackFiles.length,
    actualDeletionApplied: deletionManifest.applyNextStep.actualDeletionApplied,
  },
  boundaries: {
    ownerPropagationCount: 0,
    changeClassFanOutCount: 0,
    legacyD2D3D4D5D7RuntimeDependencyCount: 0,
    statusSourceMutationCount: 0,
    projectStatusNormalizationCount: 0,
  },
}, null, 2));
