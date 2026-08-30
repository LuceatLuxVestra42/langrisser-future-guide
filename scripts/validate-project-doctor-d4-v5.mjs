import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executePlan } from './run-project-doctor-d4.mjs';

const d3 = JSON.parse(fs.readFileSync('data/contracts/project-doctor-d3-validator-plan.v5.json', 'utf8'));
const d4 = JSON.parse(fs.readFileSync('data/contracts/project-doctor-d4-execution.v5.json', 'utf8'));
const by = id => d3.checkCatalog.find(item => item.id === id);
const plan = (status, ids = [], manualReviews = []) => ({
  version: 5,
  stage: 'D3',
  status,
  changedFileCount: 1,
  selectedChecks: ids.map(id => ({ ...by(id), execution: 'PLANNED' })),
  manualReviews,
});
const done = [];
const run = (id, fn) => { fn(); done.push(id); };

run('ASSET_INTAKE_EXECUTES', () => {
  const seen = [];
  const result = executePlan({
    plan: plan('PLAN_READY', ['asset-intake-self-test', 'doctor-health-gate']),
    d3Contract: d3,
    d4Contract: d4,
    executor: item => { seen.push(item.id); return { status: 0 }; },
  });
  assert.equal(result.status, 'PASS_EXECUTED');
  assert.deepEqual(seen, ['asset-intake-self-test', 'doctor-health-gate']);
});
run('ASSET_INTAKE_FAIL_FAST', () => {
  const seen = [];
  const result = executePlan({
    plan: plan('PLAN_READY', ['asset-intake-self-test', 'doctor-health-gate', 'doctor-impact-self-test']),
    d3Contract: d3,
    d4Contract: d4,
    executor: item => { seen.push(item.id); return { status: item.id === 'asset-intake-self-test' ? 7 : 0 }; },
  });
  assert.equal(result.status, 'FAIL_CHECK');
  assert.equal(result.failedCheckId, 'asset-intake-self-test');
  assert.deepEqual(seen, ['asset-intake-self-test']);
});
run('SKIN_MANUAL_PRESERVED', () => {
  const result = executePlan({
    plan: plan('MANUAL_REVIEW', [], [{ node: 'skin-assets' }]),
    d3Contract: d3,
    d4Contract: d4,
    executor: () => ({ status: 0 }),
  });
  assert.equal(result.status, 'REVIEW_MANUAL');
  assert.equal(result.exitCode, 3);
});
run('STRICT_COMMAND', () => {
  const candidate = plan('PLAN_READY', ['asset-intake-self-test']);
  candidate.selectedChecks[0].command = 'node tools/asset-intake/cli/validate-stage4-v1.mjs';
  const result = executePlan({ plan: candidate, d3Contract: d3, d4Contract: d4, executor: () => ({ status: 0 }) });
  assert.equal(result.status, 'INVALID_PLAN');
});
run('DRY_RUN', () => {
  let calls = 0;
  const result = executePlan({
    plan: plan('PLAN_READY', ['asset-intake-self-test']),
    d3Contract: d3,
    d4Contract: d4,
    dryRun: true,
    executor: () => { calls += 1; return { status: 0 }; },
  });
  assert.equal(result.status, 'PASS_DRY_RUN');
  assert.equal(calls, 0);
});

assert.equal(d4.schemaId, 'project-doctor-d4-execution/v5');
assert.equal(d4.status, 'DESIGN_FROZEN');
assert.deepEqual([...new Set(d4.allowedCheckIds)].sort(), d3.checkCatalog.map(item => item.id).sort());
console.log(JSON.stringify({
  status: 'PASS_PROJECT_DOCTOR_D4_V5_EXECUTION_FIXTURES',
  fixturePassCount: done.length,
  fixtureCount: done.length,
  fixtures: done,
  allowedCheckCount: d4.allowedCheckIds.length,
}, null, 2));
