import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workflowText = fs.readFileSync(
  path.resolve('.github/workflows/merge-finalize-main.yml'),
  'utf8',
);

assert.equal(
  workflowText.includes("CHECK_REQUIRED|CHECK_PENDING|CHECK_NOT_SUCCESSFUL|MERGE_GATE_REQUIRED|MERGE_GATE_PENDING)"),
  true,
  'Preflight must route non-successful checks to revalidation instead of treating them as hard blockers.',
);
assert.equal(
  workflowText.includes("if [[ \"$status\" == 'CHECK_NOT_SUCCESSFUL' ]]; then"),
  true,
  'Prepare lifecycle must hand off CHECK_NOT_SUCCESSFUL instead of failing closed as a blocker.',
);
assert.equal(
  workflowText.includes('MERGE_FINALIZER_STALE_REVALIDATION_HANDOFF=PASS'),
  true,
  'Prepare lifecycle must expose the stale revalidation handoff checkpoint.',
);
assert.equal(
  workflowText.includes("status === 'BLOCKER_OWNING_VALIDATOR'"),
  false,
  'Workflow shell must not reinterpret owning-validator blocker semantics.',
);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_STALE_LIFECYCLE',
  staleLifecycle: 'CHECK_NOT_SUCCESSFUL -> REVALIDATION_HANDOFF',
  hardValidatorFailure: 'BLOCKER_OWNING_VALIDATOR remains classifier-owned',
}, null, 2));
