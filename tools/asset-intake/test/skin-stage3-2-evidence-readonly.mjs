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

const expected = JSON.parse(capturedOutput);
const actual = JSON.parse(fs.readFileSync(OUT, 'utf8'));
assert.deepEqual(actual, expected, 'Committed Skin Stage 3-2 readiness is semantically stale');

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'SKIN_STAGE3_2_EVIDENCE_READONLY',
  underlyingStatus: expected.status,
  completion: expected.completion,
  checkCount: expected.metrics?.checkCount ?? null,
  passedCheckCount: expected.metrics?.passedCheckCount ?? null,
  failedCheckCount: expected.metrics?.failedCheckCount ?? null,
  trackedWriteCount: 0,
  producerBehaviorPreserved: true,
}, null, 2));
