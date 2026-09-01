import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const readText = path => fs.readFileSync(path, 'utf8');

const oldWorkflow = '.github/workflows/regression-coverage-promotion-v2.yml';
const legacyAuditScript = 'scripts/validate-regression-coverage-promotion-v2.mjs';
const historicalEvidence = [
  'data/contracts/regression-coverage-promotion.v1.json',
  'data/contracts/regression-coverage-promotion.v2.json',
];
const historicalUncommittedOutput = 'data/validation/regression-coverage-promotion-summary.v2.json';

const rr8 = readJson('data/contracts/project-tooling-regression-runner-r8-final-freeze.v1.json');
assert.equal(rr8.completion, 'REGRESSION_RUNNER_RR8_INSTALLATION_FROZEN_ROLLBACK_OPEN');
assert.equal(rr8.rollbackCloseout?.requiredProofForRr9?.syntheticProofForbidden, true);

const packageJson = readJson('package.json');
assert.equal(Object.hasOwn(packageJson.scripts ?? {}, 'validate:regression-coverage-promotion:v2'), false,
  'OLD V2 package entrypoint must be retired');

assert.equal(fs.existsSync(oldWorkflow), false, 'OLD manual V2 workflow must be physically retired');
assert.equal(fs.existsSync(legacyAuditScript), true,
  'Legacy V2 audit script is intentionally retained as historical inert evidence');

for (const path of historicalEvidence) {
  assert.equal(fs.existsSync(path), true, `historical evidence must be preserved: ${path}`);
}
assert.equal(fs.existsSync(historicalUncommittedOutput), false,
  'RR9 must not manufacture the historically uncommitted V2 summary solely for retirement proof');

const newWorkflow = readText('.github/workflows/project-tooling-regression-runner.yml');
assert.match(newWorkflow, /pull_request:/);
assert.match(newWorkflow, /workflow_dispatch:/);
assert.match(newWorkflow, /permissions:\s*\n\s*contents: read/);
assert.match(newWorkflow, /tools\/regression-runner\/test\/current-parity\.mjs/);
assert.match(newWorkflow, /tools\/regression-runner\/test\/rr9-retirement\.mjs/);

const ownerMap = readJson('tools/project-check/contracts/owners.v1.json');
const regressionRule = ownerMap.pathRules.find(rule => rule.id === 'regression-runner-tooling');
assert.ok(regressionRule);
assert.deepEqual(regressionRule.owners, ['regression-runner']);
assert.equal(regressionRule.patterns.includes(oldWorkflow), true,
  'Retired workflow path remains an ownership/reintroduction guard');

const expectedCoverageCommands = [
  'validate:coverage:hero-canonical',
  'validate:coverage:soldier-canonical',
  'validate:coverage:equipment-canonical',
  'validate:coverage:hero-soldier-relation',
  'validate:coverage:hero-equipment-relation',
  'validate:coverage:banner-data',
  'validate:coverage:skin-relation',
  'validate:coverage:shared-movement',
  'validate:coverage:soldier-assets',
];
for (const command of expectedCoverageCommands) {
  assert.equal(typeof packageJson.scripts?.[command], 'string', `current owning validator missing: ${command}`);
}

const tracked = spawnSync('git', ['diff', '--exit-code'], { encoding: 'utf8', shell: false });
assert.equal(tracked.status, 0, tracked.stdout || tracked.stderr || 'RR9 guard dirtied tracked state');

console.log(JSON.stringify({
  status: 'PASS',
  completion: 'REGRESSION_RUNNER_RR9_RUNTIME_RETIREMENT_GUARD_PASS',
  retiredActiveSurfaces: [oldWorkflow, 'package.json#scripts.validate:regression-coverage-promotion:v2'],
  preservedHistoricalAuditScript: legacyAuditScript,
  preservedHistoricalEvidence: historicalEvidence,
  historicalUncommittedOutputNotMaterialized: historicalUncommittedOutput,
  oldAutomaticRunnerCount: 0,
  oldManualRunnerCount: 0,
  legacyPackageEntrypointCount: 0,
  newRunnerOperational: true,
  trackedMutationCount: 0,
}, null, 2));
