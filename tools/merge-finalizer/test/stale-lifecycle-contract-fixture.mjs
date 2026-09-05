import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const contract = JSON.parse(fs.readFileSync(path.resolve('tools/merge-finalizer/contracts/stale-lifecycle.v1.json'), 'utf8'));
const concurrency = JSON.parse(fs.readFileSync(path.resolve('tools/merge-finalizer/contracts/concurrency.v1.json'), 'utf8'));
const libText = fs.readFileSync(path.resolve('tools/merge-finalizer/lib/merge-finalizer.mjs'), 'utf8');
const workflowText = fs.readFileSync(path.resolve('.github/workflows/merge-finalize-main.yml'), 'utf8');

assert.equal(contract.version, 1);
assert.equal(contract.owner, 'merge-finalization');
assert.equal(contract.classification.stale.status, 'CHECK_NOT_SUCCESSFUL');
assert.equal(contract.classification.stale.reason, 'STALE_REVALIDATION_REQUIRED');
assert.equal(contract.classification.stale.hardBlocker, false);
assert.deepEqual(
  contract.classification.hardBlockerConclusions,
  ['action_required', 'cancelled', 'failure', 'timed_out'],
);
assert.equal(contract.classification.hardBlockerStatus, 'BLOCKER_OWNING_VALIDATOR');
assert.equal(contract.precedence.behindMain, 'UPDATE_REQUIRED');
assert.equal(contract.precedence.behindMainBeforeCheckConclusion, true);
assert.equal(contract.lifecycle.initialCheckNotSuccessful, 'REVALIDATE');
assert.equal(contract.lifecycle.prepareCheckNotSuccessful, 'HANDOFF_REVALIDATION');
assert.equal(contract.lifecycle.mergeOnlyNotReady, 'MERGE_ADMISSION_REVALIDATION_REQUIRED');
assert.equal(contract.lifecycle.exactTargetPrOnly, true);
assert.equal(contract.lifecycle.newExactHeadRunOwnsContinuation, true);

assert.equal(libText.includes("check.conclusion === 'stale'"), true);
assert.equal(libText.includes("status: 'CHECK_NOT_SUCCESSFUL'"), true);
assert.equal(libText.includes("reason: 'STALE_REVALIDATION_REQUIRED'"), true);
assert.equal(libText.includes("status: 'UPDATE_REQUIRED'"), true);
for (const conclusion of contract.classification.hardBlockerConclusions) {
  assert.equal(libText.includes(`'${conclusion}'`), true, `Missing hard blocker conclusion: ${conclusion}`);
}

assert.equal(
  workflowText.includes('CHECK_REQUIRED|CHECK_PENDING|CHECK_NOT_SUCCESSFUL|MERGE_GATE_REQUIRED|MERGE_GATE_PENDING)'),
  true,
  'Initial CHECK_NOT_SUCCESSFUL must remain on the revalidation path.',
);
assert.equal(
  workflowText.includes("\"$status\" == 'CHECK_NOT_SUCCESSFUL'"),
  true,
  'Prepare-stage CHECK_NOT_SUCCESSFUL must hand off revalidation instead of becoming a hard blocker.',
);
assert.equal(workflowText.includes('MERGE_FINALIZER_STALE_REVALIDATION_HANDOFF=PASS'), true);
assert.equal(workflowText.includes('inputs[pr]=$PR_NUMBER'), true);
assert.equal(workflowText.includes('push:'), false, 'Stale lifecycle must not add main-push all-open-PR fan-out.');

assert.equal(concurrency.staleRefreshHandoff.policy, 'NEW_EXACT_HEAD_RUN_OWNS_CONTINUATION');
assert.equal(concurrency.staleRefreshHandoff.oldRunMustNotMergeAfterHeadChange, true);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_STALE_LIFECYCLE_CONTRACT_V1',
  stale: contract.classification.stale,
  hardBlockers: contract.classification.hardBlockerConclusions,
  precedence: contract.precedence,
  lifecycle: contract.lifecycle,
  forbidden: contract.forbidden,
}, null, 2));
