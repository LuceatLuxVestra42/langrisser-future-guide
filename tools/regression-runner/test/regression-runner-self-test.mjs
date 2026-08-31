import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  executeRegressionRun,
  loadRegressionRunnerContracts,
  planRegressionRun,
  preflightRegressionRun,
  validateRegressionRunnerContracts,
} from '../lib/regression-runner.mjs';

const repoRoot = process.cwd();
const contracts = loadRegressionRunnerContracts({ repoRoot });
const fixturePath = path.join(repoRoot, 'tools/regression-runner/test/fixtures/rr4-negative-cases.v1.json');
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
assert.equal(fixtures.schemaId, 'regression-runner-rr4-negative-fixtures/v1');
assert.equal(fixtures.status, 'DESIGN_FROZEN');

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

for (const fixture of fixtures.contractCases) {
  const candidate = structuredClone(contracts);
  if (fixture.mutation === 'PROFILE_APPEND_VALIDATOR_ID') {
    candidate.profilesContract.profiles[0].validatorIds.push(fixture.value);
  } else if (fixture.mutation === 'PROFILE_SET_EXECUTABLE') {
    candidate.profilesContract.profiles[0].executable = fixture.value;
  } else if (fixture.mutation === 'CATALOG_DUPLICATE_VALIDATOR') {
    const source = candidate.validatorCatalog.validators.find(item => item.id === fixture.value);
    assert.ok(source, `fixture catalog source missing: ${fixture.value}`);
    candidate.validatorCatalog.validators.push(structuredClone(source));
  } else if (fixture.mutation === 'CATALOG_SET_SHELL_EXECUTION') {
    candidate.validatorCatalog.policy.shellExecution = fixture.value;
  } else if (fixture.mutation === 'PROFILE_SET_AUTOMATIC_COVERAGE_EXPANSION') {
    candidate.profilesContract.policy.automaticCoverageExpansion = fixture.value;
  } else {
    assert.fail(`Unknown contract fixture mutation: ${fixture.mutation}`);
  }
  assert.throws(
    () => validateRegressionRunnerContracts(candidate),
    new RegExp(fixture.expectedErrorToken),
    fixture.id,
  );
}

for (const fixture of fixtures.preflightCases) {
  const fixturePlan = {
    version: 1,
    schemaId: 'regression-runner-plan/v1',
    status: 'PLAN_READY',
    profileId: `fixture-${fixture.id}`,
    validatorCount: 1,
    validatorIds: [fixture.validator.id],
    validators: [fixture.validator],
    authority: 'tools/project-check/contracts/validators.v1.json',
  };
  const result = preflightRegressionRun({ repoRoot, plan: fixturePlan });
  assert.equal(result.pass, false, fixture.id);
  assert.ok(result.failures.some(item => item.type === fixture.expectedFailureType), fixture.id);
}

const emptyPlanPreflight = preflightRegressionRun({
  repoRoot,
  plan: { validators: [] },
});
assert.equal(emptyPlanPreflight.pass, false);
assert.deepEqual(emptyPlanPreflight.failures, [{ type: 'PLAN_VALIDATORS_INVALID' }]);

for (const fixture of fixtures.runtimeAuthorityOverrideCases) {
  assert.throws(
    () => executeRegressionRun({ repoRoot, [fixture.key]: {} }),
    new RegExp(fixture.expectedErrorToken),
    fixture.id,
  );
}

assert.throws(
  () => executeRegressionRun({ repoRoot, profileId: '__rr4_unknown_profile__' }),
  /Unknown regression profile/,
);

const passResult = executeRegressionRun({
  repoRoot,
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
assert.equal(failureResult.executions.length, 1);

let snapshotCount = 0;
const mutationResult = executeRegressionRun({
  repoRoot,
  snapshotTrackedState: () => {
    snapshotCount += 1;
    return snapshotCount === 1 ? [] : [' M data/generated/probe.json'];
  },
  executor: validator => ({ validatorId: validator.id, exitCode: 0, signal: null }),
});
assert.equal(mutationResult.status, 'BLOCKER');
assert.equal(mutationResult.completion, 'BLOCKED_TRACKED_MUTATION');
assert.equal(mutationResult.executions.length, 1);

let planOnlyExecutorCalled = false;
let planOnlySnapshotCalled = false;
const planOnly = executeRegressionRun({
  repoRoot,
  planOnly: true,
  executor: () => {
    planOnlyExecutorCalled = true;
    throw new Error('plan-only executor must not run');
  },
  snapshotTrackedState: () => {
    planOnlySnapshotCalled = true;
    throw new Error('plan-only snapshot must not run');
  },
});
assert.equal(planOnly.status, 'PASS');
assert.equal(planOnly.completion, 'PLAN_ONLY');
assert.equal(planOnly.executions.length, 0);
assert.equal(planOnlyExecutorCalled, false);
assert.equal(planOnlySnapshotCalled, false);
assert.equal(planOnly.plan.validatorCount, 9);

const cliFixture = fixtures.cliCases.find(item => item.id === 'current-profile-plan-only');
assert.ok(cliFixture);
const cliResult = spawnSync(process.execPath, ['tools/regression-runner/cli/check.mjs', ...cliFixture.args], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: false,
});
assert.equal(cliResult.status, 0, String(cliResult.stderr ?? ''));
const cliPayload = JSON.parse(cliResult.stdout);
assert.equal(cliPayload.status, cliFixture.expectedStatus);
assert.equal(cliPayload.completion, cliFixture.expectedCompletion);
assert.equal(cliPayload.plan.validatorCount, cliFixture.expectedValidatorCount);
assert.equal(cliPayload.executions.length, cliFixture.expectedExecutionCount);
assert.deepEqual(cliPayload.plan.validatorIds, plan.validatorIds);
assert.equal(cliPayload.plan.authority, 'tools/project-check/contracts/validators.v1.json');

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

const negativeFixtureCount = fixtures.contractCases.length
  + fixtures.preflightCases.length
  + fixtures.runtimeAuthorityOverrideCases.length;

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'REGRESSION_RUNNER_RR4_SAFETY_SELF_TEST',
  profile: 'core-regression-v1',
  validatorCount: plan.validatorCount,
  commandAuthority: plan.authority,
  negativeFixtureCount,
  executionSafetyCaseCount: fixtures.executionCases.length,
  cliPlanOnlyCaseCount: fixtures.cliCases.length,
  boundaries: {
    runtimeAuthorityOverrideAllowedCount: 0,
    profileCommandMetadataCount: 0,
    automaticCoverageExpansionCount: 0,
    shellExecutionCount: 0,
    trackedMutationAllowedCount: 0,
    realValidatorExecutionByPlanOnlyCount: 0,
    legacyProjectDoctorRuntimeDependencyCount: 0,
    legacyRegressionAdmissionAuditCount: 0,
    semanticRecomputationCount: 0,
  },
}, null, 2));
