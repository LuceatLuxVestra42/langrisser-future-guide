import assert from 'node:assert/strict';
import {
  loadProjectCheckContracts,
  routeProjectCheckPaths,
} from '../lib/project-check.mjs';

const repoRoot = process.cwd();
const contracts = loadProjectCheckContracts({ repoRoot });

function assertRoute(filePath, expectedOwners, expectedValidators) {
  const route = routeProjectCheckPaths([filePath], contracts);
  assert.equal(route.status, 'PLAN_READY', filePath);
  assert.equal(route.changedFileCount, 1, filePath);
  assert.deepEqual(route.files[0].owners, [...expectedOwners].sort(), filePath);
  assert.deepEqual(route.validators.map(item => item.id), expectedValidators, filePath);
  assert.deepEqual(route.manualReviews, [], filePath);
  assert.equal(route.boundaries.ownerPropagationCount, 0, filePath);
  assert.equal(route.boundaries.changeClassFanOutCount, 0, filePath);
  assert.equal(route.boundaries.semanticRecomputationCount, 0, filePath);
}

assertRoute(
  'src/routes/soldiers.tsx',
  ['soldier-frontend'],
  ['production-build'],
);

assertRoute(
  'data/validation/soldier-stage6-7-site-admission.v1.json',
  ['soldier-canonical', 'status-source'],
  ['status-source-artifact-bridge', 'status-source-lifecycle', 'status-source-producer-gate', 'status-source-promotion', 'status-source-selection', 'soldier-canonical'],
);

assertRoute(
  'tools/asset-intake/core/resolve.mjs',
  ['asset-intake'],
  ['asset-intake'],
);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'POST_REINSTALL_ROUTING_FIXTURES',
  fixtureCount: 3,
  fixtures: [
    'soldier-frontend -> production-build',
    'soldier-canonical + status-source -> provenance + soldier-canonical validators',
    'asset-intake -> asset-intake',
  ],
  boundaries: {
    ownerPropagationCount: 0,
    changeClassFanOutCount: 0,
    semanticRecomputationCount: 0,
  },
}, null, 2));
