import assert from 'node:assert/strict';
import { executeCloseout } from './run-project-doctor-closeout.mjs';

const fixtures = [];
const runFixture = (id, fn) => { fn(); fixtures.push(id); };

runFixture('ALL_STEPS_ORDERED', () => {
  const seen = [];
  const result = executeCloseout({
    argv: ['--dry-run'],
    executor: (step, args) => { seen.push([step.id, args]); return { status: 0 }; },
  });
  assert.equal(result.status, 'PASS_PROJECT_DOCTOR_CLOSEOUT');
  assert.deepEqual(seen.map(item => item[0]), ['d5-fresh-status', 'd4-self-test', 'd4-run']);
  assert.deepEqual(seen[0][1], []);
  assert.deepEqual(seen[2][1], ['--dry-run']);
});

runFixture('D5_FAILURE_STOPS', () => {
  const seen = [];
  const result = executeCloseout({ executor: step => { seen.push(step.id); return { status: step.id === 'd5-fresh-status' ? 4 : 0 }; } });
  assert.equal(result.failedStep, 'd5-fresh-status');
  assert.equal(result.exitCode, 4);
  assert.deepEqual(seen, ['d5-fresh-status']);
});

runFixture('D4_SELF_TEST_FAILURE_STOPS', () => {
  const seen = [];
  const result = executeCloseout({ executor: step => { seen.push(step.id); return { status: step.id === 'd4-self-test' ? 1 : 0 }; } });
  assert.equal(result.failedStep, 'd4-self-test');
  assert.deepEqual(seen, ['d5-fresh-status', 'd4-self-test']);
});

runFixture('D4_EXIT_PROPAGATES', () => {
  const result = executeCloseout({ executor: step => ({ status: step.id === 'd4-run' ? 3 : 0 }) });
  assert.equal(result.failedStep, 'd4-run');
  assert.equal(result.exitCode, 3);
});

console.log(JSON.stringify({
  status: 'PASS_PROJECT_DOCTOR_CLOSEOUT_FIXTURES',
  fixturePassCount: fixtures.length,
  fixtureCount: 4,
  fixtures,
  actualRepositoryCommandExecutionCount: 0,
}, null, 2));
