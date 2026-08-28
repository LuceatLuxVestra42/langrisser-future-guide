import assert from 'node:assert/strict';
import { executePlan } from './run-project-doctor-d4.mjs';

const catalog = [
  { id: 'configdata-integrity', phase: 1, command: 'npm run check:configdata' },
  { id: 'production-build', phase: 5, command: 'npm run build' },
  { id: 'doctor-health-gate', phase: 6, command: 'npm run doctor:validate' },
  { id: 'doctor-impact-self-test', phase: 6, command: 'npm run doctor:impact:validate' },
  { id: 'doctor-plan-self-test', phase: 6, command: 'npm run doctor:plan:validate' },
];
const d3Contract = { checkCatalog: catalog };
const d4Contract = { allowedCheckIds: catalog.map(item => item.id) };
const check = id => ({ ...catalog.find(item => item.id === id), execution: 'PLANNED' });
const plan = (status, ids = [], manualReviews = []) => ({
  version: 1,
  stage: 'D3',
  status,
  changedFileCount: status === 'NO_CHANGES' ? 0 : 1,
  selectedChecks: ids.map(check),
  manualReviews,
});

const fixtures = [];
const runFixture = (id, fn) => { fn(); fixtures.push(id); };

runFixture('NO_CHANGES_ZERO_EXEC', () => {
  let calls = 0;
  const result = executePlan({ plan: plan('NO_CHANGES'), d3Contract, d4Contract, executor: () => { calls += 1; return { status: 0 }; } });
  assert.equal(result.status, 'PASS_NO_CHANGES');
  assert.equal(calls, 0);
});

runFixture('DRY_RUN_ZERO_EXEC', () => {
  let calls = 0;
  const result = executePlan({ plan: plan('PLAN_READY', ['production-build']), d3Contract, d4Contract, dryRun: true, executor: () => { calls += 1; return { status: 0 }; } });
  assert.equal(result.status, 'PASS_DRY_RUN');
  assert.equal(calls, 0);
});

runFixture('FRONTEND_BUILD_EXECUTES', () => {
  let calls = 0;
  const result = executePlan({ plan: plan('PLAN_READY', ['production-build']), d3Contract, d4Contract, executor: () => { calls += 1; return { status: 0 }; } });
  assert.equal(result.status, 'PASS_EXECUTED');
  assert.equal(calls, 1);
});

runFixture('PHASE_ORDER', () => {
  const seen = [];
  const input = plan('PLAN_READY');
  input.selectedChecks = [check('production-build'), check('configdata-integrity')];
  const result = executePlan({ plan: input, d3Contract, d4Contract, executor: item => { seen.push(item.id); return { status: 0 }; } });
  assert.equal(result.status, 'PASS_EXECUTED');
  assert.deepEqual(seen, ['configdata-integrity', 'production-build']);
});

runFixture('FAIL_FAST', () => {
  const seen = [];
  const input = plan('PLAN_READY');
  input.selectedChecks = [check('configdata-integrity'), check('production-build'), check('doctor-health-gate')];
  const result = executePlan({ plan: input, d3Contract, d4Contract, executor: item => { seen.push(item.id); return { status: item.id === 'production-build' ? 9 : 0 }; } });
  assert.equal(result.status, 'FAIL_CHECK');
  assert.deepEqual(seen, ['configdata-integrity', 'production-build']);
});

runFixture('TAMPER_BLOCKS_ALL', () => {
  let calls = 0;
  const input = plan('PLAN_READY', ['production-build']);
  input.selectedChecks[0].command = 'npm run evil';
  const result = executePlan({ plan: input, d3Contract, d4Contract, executor: () => { calls += 1; return { status: 0 }; } });
  assert.equal(result.status, 'INVALID_PLAN');
  assert.equal(calls, 0);
});

runFixture('UNKNOWN_CHECK_BLOCKS_ALL', () => {
  let calls = 0;
  const input = plan('PLAN_READY');
  input.selectedChecks = [{ id: 'unknown', phase: 1, command: 'npm run build' }];
  const result = executePlan({ plan: input, d3Contract, d4Contract, executor: () => { calls += 1; return { status: 0 }; } });
  assert.equal(result.status, 'INVALID_PLAN');
  assert.equal(calls, 0);
});

runFixture('MANUAL_REVIEW_PRESERVED', () => {
  let calls = 0;
  const result = executePlan({
    plan: plan('MANUAL_REVIEW', ['production-build'], [{ type: 'UNCATALOGED_DEDICATED_CHECK', node: 'soldier-assets' }]),
    d3Contract,
    d4Contract,
    executor: () => { calls += 1; return { status: 0 }; },
  });
  assert.equal(result.status, 'REVIEW_MANUAL');
  assert.equal(result.exitCode, 3);
  assert.equal(calls, 1);
});

console.log(JSON.stringify({
  status: 'PASS_PROJECT_DOCTOR_D4_EXECUTION_FIXTURES',
  fixturePassCount: fixtures.length,
  fixtureCount: 8,
  fixtures,
  actualRepositoryCommandExecutionCount: 0,
}, null, 2));
