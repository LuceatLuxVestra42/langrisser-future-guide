import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  executeProjectCheck,
  loadProjectCheckContracts,
  preflightProjectCheck,
  routeProjectCheckPaths,
} from '../lib/project-check.mjs';

const repoRoot = process.cwd();
const contracts = loadProjectCheckContracts({ repoRoot });

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
  'tools/project-status/lib/normalize-project-status.mjs',
  ['project-status'],
  ['project-status-parity'],
);
expectOwners(
  'tools/project-check/lib/project-check.mjs',
  ['project-check'],
  ['project-check-self-test'],
);
expectOwners(
  'data/contracts/project-tooling-project-doctor-deletion-inventory.v1.json',
  ['project-check'],
  ['project-check-self-test'],
);
expectOwners(
  '.github/workflows/project-doctor-d7-pr-guard.yml',
  ['project-check'],
  ['project-check-self-test'],
);
expectOwners(
  'src/routes/heroes.tsx',
  ['hero-frontend'],
  ['production-build'],
);
expectOwners(
  'data/validation/hero-stage6-4-final.v1.json',
  ['hero-canonical'],
  ['hero-canonical'],
);
expectOwners(
  'data/validation/hero-soldier-integration-stageC-final.v1.json',
  ['hero-soldier-relation'],
  ['hero-soldier-relation'],
);
expectOwners(
  'data/presentation/equipment-display-collection.v1.json',
  ['equipment-frontend', 'localization'],
  ['localization-audit', 'production-build'],
);
expectOwners(
  'data/configdata/ConfigDataHeroInfo.json',
  ['configdata', 'hero-canonical', 'skin-relation'],
  ['configdata-integrity', 'hero-canonical', 'skin-relation'],
);

const bannerAsset = routeProjectCheckPaths(['public/images/banners/Banner/probe.png'], contracts);
assert.equal(bannerAsset.status, 'MANUAL_REVIEW');
assert.deepEqual(bannerAsset.files[0].owners, ['banner-assets', 'banner-frontend']);
assert.deepEqual(validatorIds(bannerAsset), ['production-build']);
assert.equal(bannerAsset.manualReviews[0].ownerId, 'banner-assets');

const skinAsset = routeProjectCheckPaths(['data/evidence/skin-stage3-2-static-source-evidence.v1.json'], contracts);
assert.equal(skinAsset.status, 'MANUAL_REVIEW');
assert.deepEqual(skinAsset.files[0].owners, ['skin-assets']);
assert.deepEqual(validatorIds(skinAsset), []);

const unknownConfig = routeProjectCheckPaths(['data/configdata/ConfigDataUnknownFutureTable.json'], contracts);
assert.equal(unknownConfig.status, 'MANUAL_REVIEW');
assert.equal(unknownConfig.files[0].status, 'MANUAL_REVIEW');
assert.equal(unknownConfig.manualReviews[0].type, 'UNMATCHED_PATH');

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

assert.throws(
  () => routeProjectCheckPaths(['../outside'], contracts),
  /Invalid repository path/,
);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'PROJECT_CHECK_R3_SELF_TEST',
  fixtures: 15,
  catalogValidatorCount: contracts.validatorCatalog.validators.length,
  ownerCount: contracts.ownerMap.owners.length,
  boundaries: {
    ownerPropagationCount: 0,
    changeClassFanOutCount: 0,
    legacyD2D3D4D5D7RuntimeDependencyCount: 0,
    statusSourceMutationCount: 0,
    projectStatusNormalizationCount: 0,
  },
}, null, 2));