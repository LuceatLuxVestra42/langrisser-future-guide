import assert from 'node:assert/strict';
import {
  buildStage65MembershipDigest,
  classifyStage65Snapshot,
  normalizeMembershipPairs,
} from './lib/soldier-stage6-5-semantic-projections.mjs';

const canonicalPairs = [
  { heroId: 1, soldierId: 100 },
  { heroId: 2, soldierId: 100 },
  { heroId: 2, soldierId: 200 },
];
const canonicalDigest = buildStage65MembershipDigest(canonicalPairs);

const tests = [
  {
    name: 'membership ordering is non-semantic for this explicit set projection',
    run() {
      const reordered = buildStage65MembershipDigest([...canonicalPairs].reverse());
      assert.deepEqual(reordered, canonicalDigest);
    },
  },
  {
    name: 'same semantic plus same blob is SEMANTIC_FRESH',
    run() {
      assert.equal(classifyStage65Snapshot({
        recordedGitBlobSha: 'aaa', currentGitBlobSha: 'aaa',
        currentDigest: canonicalDigest, canonicalDigest,
      }), 'SEMANTIC_FRESH');
    },
  },
  {
    name: 'same semantic plus different blob is PROVENANCE_ONLY_CHANGED',
    run() {
      assert.equal(classifyStage65Snapshot({
        recordedGitBlobSha: 'old', currentGitBlobSha: 'new',
        currentDigest: canonicalDigest, canonicalDigest,
      }), 'PROVENANCE_ONLY_CHANGED');
    },
  },
  {
    name: 'membership removal is SEMANTIC_STALE',
    run() {
      const changed = buildStage65MembershipDigest(canonicalPairs.slice(0, 2));
      assert.equal(classifyStage65Snapshot({
        recordedGitBlobSha: 'old', currentGitBlobSha: 'new',
        currentDigest: changed, canonicalDigest,
      }), 'SEMANTIC_STALE');
    },
  },
  {
    name: 'unhealthy semantic evidence is SEMANTIC_STALE',
    run() {
      assert.equal(classifyStage65Snapshot({
        recordedGitBlobSha: 'old', currentGitBlobSha: 'new',
        currentDigest: canonicalDigest, canonicalDigest, semanticHealthy: false,
      }), 'SEMANTIC_STALE');
    },
  },
  {
    name: 'missing provenance reference is SEMANTIC_UNKNOWN fail-closed',
    run() {
      assert.equal(classifyStage65Snapshot({
        recordedGitBlobSha: null, currentGitBlobSha: 'new',
        currentDigest: canonicalDigest, canonicalDigest,
      }), 'SEMANTIC_UNKNOWN');
    },
  },
  {
    name: 'duplicate membership is rejected fail-closed',
    run() {
      assert.throws(() => normalizeMembershipPairs([
        canonicalPairs[0], canonicalPairs[0],
      ]), /Duplicate Hero-Soldier membership pair/);
    },
  },
];

let passed = 0;
for (const test of tests) {
  test.run();
  passed += 1;
  console.log(`PASS: ${test.name}`);
}
console.log(`Soldier Stage 6-5 Semantic Freshness R1 fixtures: ${passed}/${tests.length} PASS`);
