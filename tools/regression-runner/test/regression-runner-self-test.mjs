import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  executeRegressionRun,
  loadRegressionRunnerContracts,
  planRegressionRun,
  preflightRegressionRun,
  validateRegressionRunnerContracts,
} from '../lib/regression-runner.mjs';

const repoRoot = process.cwd();
const contracts = loadRegressionRunnerContracts({ repoRoot });
const profile = contracts.profilesContract.profiles.find(item => item.id === 'core-regression-v1');
const expectedProfileIds = [
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

assert.ok(profile);
assert.deepEqual(profile.validatorIds, expectedProfileIds);
assert.equal(profile.validatorIds.length, 9);
assert.equal(new Set(profile.validatorIds).size, 9);
for (const key of ['executable', 'args', 'command', 'commands', 'script', 'scripts']) {
  assert.equal(Object.hasOwn(profile, key), false, `profile must not carry ${key}`);
}

const plan = planRegressionRun({ profileId: 'core-regression-v1', contracts });
assert.equal(plan.status, 'PLAN_READY');
assert.equal(plan.validatorCount, 9);
assert.deepEqual(plan.validatorIds, [
  'banner-data',
  'equipment-canonical',
  'hero-canonical',
  'hero-equipment-relation',
  'hero-soldier-relation',
  'shared-movement',
  'skin-relation',
  'soldier-canonical',
  'soldier-assets',
]);

const catalogById = new Map(contracts.validatorCatalog.validators.map(item => [item.id, item]));
for (const validator of plan.validators) {
  const catalogued = catalogById.get(validator.id);
  assert.ok(catalogued, `catalog validator missing: ${validator.id}`);
  assert.equal(validator.executable, catalogued.executable);
  assert.deepEqual(validator.args, catalogued.args);
  assert.equal(validator.phase, catalogued.phase);
  assert.equal(validator.owner, catalogued.owner);
}

assert.deepEqual(preflightRegressionRun({ repoRoot, plan }), { pass: true, failures: [] });

const passResult = executeRegressionRun({
  repoRoot,
  contracts,
  preflight: { pass: true, failures: [] },
  snapshotTrackedState: () => [],
  executor: validator => ({ validatorId: validator.id, exitCode: 0, signal: null }),
});
assert.equal(passResult.status, 'PASS');
assert.equal(passResult.completion, 'COMPLETE');
assert.equal(passResult.exitCode, 0);
assert.equal(passResult.executions.length, 9);
assert.equal(passResult.boundaries.semanticRecomputationCount, 0);
assert.equal(passResult.boundaries.statusSourceMutationCount, 0);
assert.equal(passResult.boundaries.projectStatusMutationCount, 0);
assert.equal(passResult.boundaries.legacyProjectDoctorRuntimeDependencyCount, 0);
assert.equal(passResult.boundaries.legacyRegressionAdmissionAuditCount, 0);

let failureExecutions = 0;
const failureResult = executeRegressionRun({
  repoRoot,
  contracts,
  preflight: { pass: true, failures: [] },
  snapshotTrackedState: () => [],
  executor: validator => {
    failureExecutions += 1;
    return { validatorId: validator.id, exitCode: 1, signal: null };
  },
});
assert.equal(failureResult.status, 'BLOCKER');
assert.equal(failureResult.completion, 'BLOCKED_VALIDATOR');
assert.equal(failureResult.failedValidatorId, plan.validatorIds[0]);
assert.equal(failureExecutions, 1);

let snapshotCount = 0;
const mutationResult = executeRegressionRun({
  repoRoot,
  contracts,
  preflight: { pass: true, failures: [] },
  snapshotTrackedState: () => {
    snapshotCount += 1;
    return snapshotCount === 1 ? [] : [' M data/generated/probe.json'];
  },
  executor: validator => ({ validatorId: validator.id, exitCode: 0, signal: null }),
});
assert.equal(mutationResult.status, 'BLOCKER');
assert.equal(mutationResult.completion, 'BLOCKED_TRACKED_MUTATION');
assert.equal(mutationResult.executions.length, 1);

const planOnly = executeRegressionRun({
  repoRoot,
  contracts,
  preflight: { pass: true, failures: [] },
  planOnly: true,
});
assert.equal(planOnly.status, 'PASS');
assert.equal(planOnly.completion, 'PLAN_ONLY');
assert.equal(planOnly.executions.length, 0);

const unknownContracts = structuredClone(contracts);
unknownContracts.profilesContract.profiles[0].validatorIds.push('unknown-future-validator');
assert.throws(
  () => validateRegressionRunnerContracts(unknownContracts),
  /UNKNOWN_PROFILE_VALIDATOR_ID/,
);

const duplicateContracts = structuredClone(contracts);
duplicateContracts.profilesContract.profiles[0].validatorIds.push('hero-canonical');
assert.throws(
  () => validateRegressionRunnerContracts(duplicateContracts),
  /DUPLICATE_PROFILE_VALIDATOR_ID/,
);

const runtimePaths = [
  'tools/regression-runner/lib/regression-runner.mjs',
  'tools/regression-runner/cli/check.mjs',
];
const forbiddenRuntimeTokens = [
  'scripts/validate-regression-coverage-promotion-v2.mjs',
  'data/contracts/regression-coverage-promotion.v2.json',
  'scripts/analyze-project-doctor',
  'scripts/plan-project-doctor',
  'scripts/run-project-doctor',
  'project-doctor-d2-',
  'project-doctor-d3-',
  'project-doctor-d4-',
  'project-doctor-d5-',
  'project-doctor-d7-',
  "from '../../project-check",
  "from '../project-check",
];
for (const runtimePath of runtimePaths) {
  const text = fs.readFileSync(path.join(repoRoot, runtimePath), 'utf8');
  for (const token of forbiddenRuntimeTokens) {
    assert.equal(text.includes(token), false, `${runtimePath} must not depend on ${token}`);
  }
}

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'REGRESSION_RUNNER_RR3_SELF_TEST',
  profile: 'core-regression-v1',
  validatorCount: plan.validatorCount,
  commandAuthority: plan.authority,
  fixtures: 12,
  boundaries: {
    profileCommandMetadataCount: 0,
    automaticCoverageExpansionCount: 0,
    trackedMutationAllowedCount: 0,
    legacyProjectDoctorRuntimeDependencyCount: 0,
    legacyRegressionAdmissionAuditCount: 0,
    semanticRecomputationCount: 0,
  },
}, null, 2));
