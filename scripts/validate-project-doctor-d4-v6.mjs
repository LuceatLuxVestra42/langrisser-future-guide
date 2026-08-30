import assert from 'node:assert/strict';
import { executePlan } from './run-project-doctor-d4.mjs';
import { loadProjectDoctorD4V6Context } from './run-project-doctor-d4-v6.mjs';

const context = loadProjectDoctorD4V6Context();
const d3 = context.d3Context.contract;
const d4 = context.contract;
const by = id => d3.checkCatalog.find(item => item.id === id);
const plan = (status, ids = [], manualReviews = []) => ({
  version: 6,
  stage: 'D3',
  status,
  changedFileCount: 1,
  selectedChecks: ids.map(id => ({ ...by(id), execution: 'PLANNED' })),
  manualReviews,
});
const done = [];
const run = (id, fn) => { fn(); done.push(id); };

run('FRESHNESS_SELF_TEST_EXECUTES', () => {
  const seen = [];
  const result = executePlan({
    plan: plan('PLAN_READY', ['frozen-freshness-v2-self-test', 'doctor-health-gate']),
    d3Contract: d3,
    d4Contract: d4,
    executor: item => { seen.push(item.id); return { status: 0 }; },
  });
  assert.equal(result.status, 'PASS_EXECUTED');
  assert.deepEqual(seen, ['frozen-freshness-v2-self-test', 'doctor-health-gate']);
});
run('FRESHNESS_FAIL_FAST', () => {
  const seen = [];
  const result = executePlan({
    plan: plan('PLAN_READY', ['frozen-freshness-v2-self-test', 'doctor-health-gate']),
    d3Contract: d3,
    d4Contract: d4,
    executor: item => { seen.push(item.id); return { status: item.id === 'frozen-freshness-v2-self-test' ? 9 : 0 }; },
  });
  assert.equal(result.status, 'FAIL_CHECK');
  assert.equal(result.failedCheckId, 'frozen-freshness-v2-self-test');
  assert.deepEqual(seen, ['frozen-freshness-v2-self-test']);
});
run('MANUAL_REVIEW_EXIT_3_PRESERVED', () => {
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
  const candidate = plan('PLAN_READY', ['frozen-freshness-v2-self-test']);
  candidate.selectedChecks[0].command = 'node scripts/validate-project-doctor-frozen-freshness-v2.mjs';
  const result = executePlan({ plan: candidate, d3Contract: d3, d4Contract: d4, executor: () => ({ status: 0 }) });
  assert.equal(result.status, 'INVALID_PLAN');
});
run('DRY_RUN', () => {
  let calls = 0;
  const result = executePlan({
    plan: plan('PLAN_READY', ['frozen-freshness-v2-self-test']),
    d3Contract: d3,
    d4Contract: d4,
    dryRun: true,
    executor: () => { calls += 1; return { status: 0 }; },
  });
  assert.equal(result.status, 'PASS_DRY_RUN');
  assert.equal(calls, 0);
});

assert.equal(context.delta.extends, 'data/contracts/project-doctor-d4-execution.v5.json');
assert.deepEqual([...new Set(d4.allowedCheckIds)].sort(), d3.checkCatalog.map(item => item.id).sort());
console.log(JSON.stringify({
  status: 'PASS_PROJECT_DOCTOR_D4_V6_EXECUTION_FIXTURES',
  fixturePassCount: done.length,
  fixtureCount: done.length,
  fixtures: done,
  allowedCheckCount: d4.allowedCheckIds.length,
  manualReviewExitCode: 3,
}, null, 2));
