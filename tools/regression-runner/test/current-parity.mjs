import assert from 'node:assert/strict';
import { executeRegressionRun } from '../lib/regression-runner.mjs';

const repoRoot = process.cwd();
const expectedValidatorIds = [
  'banner-data',
  'equipment-canonical',
  'hero-canonical',
  'hero-equipment-relation',
  'hero-soldier-relation',
  'shared-movement',
  'skin-relation',
  'soldier-canonical',
  'soldier-assets',
];

const result = executeRegressionRun({ repoRoot, profileId: 'core-regression-v1' });

assert.equal(result.status, 'PASS', JSON.stringify(result, null, 2));
assert.equal(result.completion, 'COMPLETE');
assert.equal(result.exitCode, 0);
assert.equal(result.plan.profileId, 'core-regression-v1');
assert.equal(result.plan.authority, 'tools/project-check/contracts/validators.v1.json');
assert.equal(result.plan.validatorCount, 9);
assert.deepEqual(result.plan.validatorIds, expectedValidatorIds);
assert.equal(result.executions.length, 9);
assert.deepEqual(result.executions.map(item => item.validatorId), expectedValidatorIds);
for (const execution of result.executions) {
  assert.equal(execution.exitCode, 0, `validator failed: ${execution.validatorId}`);
  assert.equal(execution.signal, null, `validator signalled: ${execution.validatorId}`);
}
assert.equal(result.boundaries.semanticRecomputationCount, 0);
assert.equal(result.boundaries.canonicalWriteCount, 0);
assert.equal(result.boundaries.frozenWriteCount, 0);
assert.equal(result.boundaries.generatedDomainWriteCount, 0);
assert.equal(result.boundaries.statusSourceMutationCount, 0);
assert.equal(result.boundaries.projectStatusMutationCount, 0);
assert.equal(result.boundaries.legacyProjectDoctorRuntimeDependencyCount, 0);
assert.equal(result.boundaries.legacyRegressionAdmissionAuditCount, 0);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'REGRESSION_RUNNER_RR5_CURRENT_HEAD_PARITY',
  profile: result.plan.profileId,
  authority: result.plan.authority,
  validatorCount: result.plan.validatorCount,
  executions: result.executions,
  trackedMutationDetected: false,
  boundaries: result.boundaries,
}, null, 2));
