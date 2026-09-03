import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyMergeFinalization,
  REQUIRED_PROJECT_CHECK,
  shouldRestartFinalization,
} from '../lib/merge-finalizer.mjs';

const MAIN = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const HEAD2 = '3'.repeat(40);

const basePr = {
  number: 42,
  state: 'open',
  draft: false,
  mergeable: true,
  mergeable_state: 'clean',
  head: { sha: HEAD },
};
const successCheck = {
  id: 100,
  name: REQUIRED_PROJECT_CHECK.name,
  app: { id: REQUIRED_PROJECT_CHECK.appId },
  head_sha: HEAD,
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-09-03T01:00:00Z',
  completed_at: '2026-09-03T01:01:00Z',
};
const classify = overrides => classifyMergeFinalization({
  mainSha: MAIN,
  pr: { ...basePr, ...(overrides?.pr ?? {}), head: { ...basePr.head, ...(overrides?.pr?.head ?? {}) } },
  comparison: { behind_by: overrides?.behindBy ?? 0 },
  checkRuns: overrides?.checkRuns ?? [successCheck],
});

assert.equal(classify({ behindBy: 2 }).status, 'UPDATE_REQUIRED');
assert.deepEqual(
  shouldRestartFinalization({ mainSha: MAIN, headSha: HEAD }, { mainSha: HEAD2, headSha: HEAD }),
  { restart: true, reason: 'MAIN_CHANGED' },
);
assert.deepEqual(
  shouldRestartFinalization({ mainSha: MAIN, headSha: HEAD }, { mainSha: MAIN, headSha: HEAD2 }),
  { restart: true, reason: 'HEAD_CHANGED' },
);
assert.equal(classify().status, 'READY_TO_MERGE');
assert.equal(classify({ checkRuns: [{ ...successCheck, conclusion: 'failure' }] }).status, 'BLOCKER_OWNING_VALIDATOR');
assert.equal(classify({ checkRuns: [{ ...successCheck, app: { id: 999 } }] }).status, 'CHECK_REQUIRED');
assert.equal(classify({ pr: { mergeable: false, mergeable_state: 'dirty' } }).status, 'BLOCKER_CONFLICT');
assert.equal(classify({ checkRuns: [] }).status, 'CHECK_REQUIRED');
assert.equal(classify({ checkRuns: [{ ...successCheck, status: 'in_progress', conclusion: null }] }).status, 'CHECK_PENDING');
assert.equal(classify({ pr: { draft: true } }).status, 'BLOCKER_DRAFT');

const cliText = fs.readFileSync(path.resolve('tools/merge-finalizer/cli/finalize.mjs'), 'utf8');
for (const forbidden of ["method: 'POST'", "method: 'PUT'", "method: 'PATCH'", "method: 'DELETE'", 'update-branch']) {
  assert.equal(cliText.includes(forbidden), false, `dry-run CLI must not contain mutation primitive: ${forbidden}`);
}
assert.equal(cliText.includes("method: 'GET'"), true);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_STAGE2_SELF_TEST',
  fixtures: 11,
  requiredCheck: REQUIRED_PROJECT_CHECK,
  mutationPrimitiveCount: 0,
}, null, 2));
