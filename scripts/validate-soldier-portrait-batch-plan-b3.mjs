import { buildSoldierPortraitBatchPlan, computeSoldierPortraitBatchPlan } from './plan-soldier-portrait-batch.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertJsonEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const noUpdate = computeSoldierPortraitBatchPlan([100, 101], [100, 101]);
assert(noUpdate.status === 'NO_UPDATE_REQUIRED', '0-delta fixture status');
assertJsonEqual(noUpdate.newIds, [], '0-delta newIds');
assertJsonEqual(noUpdate.removedIds, [], '0-delta removedIds');

const oneNew = computeSoldierPortraitBatchPlan([100, 101, 102], [100, 101]);
assert(oneNew.status === 'BATCH_READY', 'new-ID fixture status');
assertJsonEqual(oneNew.newIds, [102], 'new-ID fixture newIds');
assertJsonEqual(oneNew.removedIds, [], 'new-ID fixture removedIds');

const removed = computeSoldierPortraitBatchPlan([100, 101], [100, 101, 102]);
assert(removed.status === 'BLOCKER', 'removed-ID fixture status');
assertJsonEqual(removed.newIds, [], 'removed-ID fixture newIds');
assertJsonEqual(removed.removedIds, [102], 'removed-ID fixture removedIds');

const current = buildSoldierPortraitBatchPlan();
assert(current.schemaId === 'soldier-portrait-batch-plan/v1', 'current plan schema');
assert(current.status === 'NO_UPDATE_REQUIRED', `current plan must be NO_UPDATE_REQUIRED, got ${current.status}`);
assertJsonEqual(current.newIds, [], 'current newIds');
assertJsonEqual(current.removedIds, [], 'current removedIds');
assert(current.boundaries?.semanticAuthority === false, 'planner must not be semantic authority');
assert(current.boundaries?.idSetDifferenceOnly === true, 'planner must stay ID-set-difference only');
assert(current.boundaries?.nameJoin === false, 'planner must not use name JOIN');
assert(current.boundaries?.idArithmetic === false, 'planner must not use ID arithmetic');
assert(current.boundaries?.filenameSimilarity === false, 'planner must not use filename similarity');
assert(current.boundaries?.assetMutation === false, 'planner must be read-only');

console.log('SOLDIER PORTRAIT B3 BATCH PLANNER: PASS');
console.log(JSON.stringify(current, null, 2));
