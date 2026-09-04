import assert from 'node:assert/strict';
import {
  classifyMergeFinalization,
  REQUIRED_PROJECT_CHECK,
} from '../lib/merge-finalizer.mjs';

const MAIN = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const MERGE = '3'.repeat(40);

const pr = {
  number: 42,
  state: 'open',
  draft: false,
  mergeable: true,
  mergeable_state: 'clean',
  merge_commit_sha: MERGE,
  base: { ref: 'main' },
  head: { sha: HEAD },
};

function check(conclusion) {
  return {
    id: 100,
    name: REQUIRED_PROJECT_CHECK.name,
    app: { id: REQUIRED_PROJECT_CHECK.appId },
    head_sha: MERGE,
    status: 'completed',
    conclusion,
    started_at: '2026-09-05T00:00:00Z',
    completed_at: '2026-09-05T00:01:00Z',
  };
}

function classify(conclusion, behindBy = 0) {
  return classifyMergeFinalization({
    mainSha: MAIN,
    pr,
    comparison: { behind_by: behindBy },
    checkRuns: [check(conclusion)],
  });
}

const stale = classify('stale');
assert.equal(stale.status, 'CHECK_NOT_SUCCESSFUL');
assert.equal(stale.reason, 'STALE_REVALIDATION_REQUIRED');
assert.equal(stale.check.conclusion, 'stale');

for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required']) {
  const result = classify(conclusion);
  assert.equal(result.status, 'BLOCKER_OWNING_VALIDATOR', `${conclusion} must remain a hard blocker`);
}

assert.equal(classify('success').status, 'READY_TO_MERGE');
assert.equal(classify('skipped').status, 'CHECK_NOT_SUCCESSFUL');

const behind = classify('stale', 1);
assert.equal(behind.status, 'UPDATE_REQUIRED');
assert.equal(behind.reason, undefined);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_STALE_RECLASSIFICATION',
  stale: 'CHECK_NOT_SUCCESSFUL / STALE_REVALIDATION_REQUIRED',
  hardBlockers: ['failure', 'cancelled', 'timed_out', 'action_required'],
  behindMainPrecedence: 'UPDATE_REQUIRED',
  explicitPrRefresh: 'DEFERRED_TO_PHASE_8',
}, null, 2));
