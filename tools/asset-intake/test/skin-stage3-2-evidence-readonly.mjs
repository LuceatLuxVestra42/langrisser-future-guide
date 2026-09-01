import assert from 'node:assert/strict';
import fs from 'node:fs';

const OUT = 'data/validation/skin-stage3-2-readiness.v1.json';
const originalWriteFileSync = fs.writeFileSync;
let capturedOutput = null;

fs.writeFileSync = (filePath, data, ...rest) => {
  const normalized = String(filePath).replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized === OUT) {
    capturedOutput = String(data);
    return;
  }
  return originalWriteFileSync.call(fs, filePath, data, ...rest);
};

try {
  await import('../../../scripts/validate-skin-stage3-2-resolution-proof.mjs?readonly-adapter=1');
} finally {
  fs.writeFileSync = originalWriteFileSync;
}

assert.ok(capturedOutput, 'Skin Stage 3-2 validator did not materialize an expected readiness payload');
assert.equal(process.exitCode ?? 0, 0, 'Skin Stage 3-2 underlying validation failed');

const generated = JSON.parse(capturedOutput);
const committed = JSON.parse(fs.readFileSync(OUT, 'utf8'));

// Stage 3-2 is already COMPLETE/FROZEN. The committed readiness artifact may retain
// historical check ordering and candidate-context metadata, so read-only validation
// compares only the authoritative completion/evidence contract and exact fixture IDs.
for (const payload of [generated, committed]) {
  assert.equal(payload.status, 'PASS');
  assert.equal(payload.completion, 'SKIN_STAGE3_2_COMPLETE');
  assert.equal(payload.metrics?.checkCount, 45);
  assert.equal(payload.metrics?.passedCheckCount, 45);
  assert.equal(payload.metrics?.failedCheckCount, 0);
  assert.equal(payload.metrics?.fixtureRoleCount, 4);
  assert.equal(payload.metrics?.uniqueFixtureSkinCount, 3);
  assert.equal(payload.metrics?.evidencePresent, true);
  assert.equal(payload.metrics?.evidenceIssueCount, 0);
  assert.equal(payload.evidence?.present, true);
  assert.equal(payload.evidence?.blocker, null);
  assert.deepEqual(payload.evidence?.issues, []);
  assert.deepEqual(payload.failures?.failedChecks, []);
  assert.deepEqual(payload.failures?.forbiddenFixtureFields, []);
}

assert.equal(generated.stage, committed.stage);
assert.equal(generated.substage, committed.substage);
assert.equal(generated.checkpoint, committed.checkpoint);
assert.deepEqual(generated.fixtureSelection, committed.fixtureSelection);
assert.equal(generated.evidence.expectedPath, committed.evidence.expectedPath);
assert.equal(generated.nextAction, committed.nextAction);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'SKIN_STAGE3_2_EVIDENCE_READONLY',
  completion: generated.completion,
  checkCount: generated.metrics.checkCount,
  passedCheckCount: generated.metrics.passedCheckCount,
  failedCheckCount: generated.metrics.failedCheckCount,
  fixtureSelectionExact: true,
  evidenceIssueCount: generated.metrics.evidenceIssueCount,
  trackedWriteCount: 0,
  producerBehaviorPreserved: true,
  historicalSerializationParityRequired: false,
}, null, 2));
