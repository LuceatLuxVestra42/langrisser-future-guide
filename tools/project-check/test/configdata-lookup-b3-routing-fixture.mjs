import assert from 'node:assert/strict';
import path from 'node:path';

import {
  loadProjectCheckContracts,
  routeProjectCheckPaths,
} from '../lib/project-check.mjs';

const repoRoot = process.cwd();
const contracts = loadProjectCheckContracts({ repoRoot });

const fixtures = [
  'scripts/lib/configdata-lookup-stage1.mjs',
  'scripts/lib/configdata-lookup-stage2.mjs',
  'scripts/lib/configdata-lookup-stage6.mjs',
  '.github/workflows/project-tooling-configdata-lookup-b3-source-root.yml',
  'tools/configdata-lookup/lib/source-root.mjs',
  'data/contracts/project-tooling-configdata-lookup-b3-source-root-cutover.v1.json',
  'tools/configdata-lookup/checkpoints/b3-source-root-cutover.v1.json',
];

for (const filePath of fixtures) {
  const route = routeProjectCheckPaths([filePath], contracts);
  assert.equal(route.status, 'PLAN_READY', `${filePath}: expected PLAN_READY`);
  assert.equal(route.changedFileCount, 1, `${filePath}: expected one changed file`);
  assert.deepEqual(route.files[0].owners, ['configdata-lookup'], `${filePath}: owner drift`);
  assert.deepEqual(route.validators.map(item => item.id), ['configdata-lookup-self-test'], `${filePath}: validator drift`);
  assert.equal(route.manualReviews.length, 0, `${filePath}: unexpected manual review`);
  assert.equal(route.boundaries.ownerPropagationCount, 0, `${filePath}: owner propagation is forbidden`);
  assert.equal(route.boundaries.changeClassFanOutCount, 0, `${filePath}: change-class fan-out is forbidden`);
}

const combined = routeProjectCheckPaths(fixtures, contracts);
assert.equal(combined.status, 'PLAN_READY');
assert.deepEqual(combined.owners, ['configdata-lookup']);
assert.deepEqual(combined.validators.map(item => item.id), ['configdata-lookup-self-test']);
assert.equal(combined.manualReviews.length, 0);
assert.equal(combined.boundaries.ownerPropagationCount, 0);
assert.equal(combined.boundaries.changeClassFanOutCount, 0);

console.log(JSON.stringify({
  status: 'PASS',
  fixture: path.basename(import.meta.url),
  completion: 'CONFIGDATA_LOOKUP_B3_ROUTING_REGRESSION_PASS',
  changedPathFixtureCount: fixtures.length,
  owners: combined.owners,
  validators: combined.validators.map(item => item.id),
  manualReviewCount: combined.manualReviews.length,
  ownerPropagationCount: combined.boundaries.ownerPropagationCount,
  changeClassFanOutCount: combined.boundaries.changeClassFanOutCount,
}, null, 2));
