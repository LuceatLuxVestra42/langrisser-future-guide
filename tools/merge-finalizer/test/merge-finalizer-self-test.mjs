import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyExecutionBoundary,
  classifyMergeFinalization,
  findExactProjectCheckForWorkflowRun,
  PROJECT_CHECK_WORKFLOW,
  REQUIRED_PROJECT_CHECK,
  shouldRestartFinalization,
} from '../lib/merge-finalizer.mjs';

const REPOSITORY = 'owner/repo';
const MAIN = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const HEAD2 = '3'.repeat(40);
const RUN_ID = 12345;

const basePr = {
  number: 42,
  state: 'open',
  draft: false,
  mergeable: true,
  mergeable_state: 'clean',
  base: { ref: 'main', repo: { full_name: REPOSITORY } },
  head: { sha: HEAD, ref: 'feature/example', repo: { full_name: REPOSITORY } },
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
  details_url: `https://github.com/${REPOSITORY}/actions/runs/${RUN_ID}/job/67890`,
};
const classify = overrides => classifyMergeFinalization({
  mainSha: MAIN,
  pr: { ...basePr, ...(overrides?.pr ?? {}), head: { ...basePr.head, ...(overrides?.pr?.head ?? {}) } },
  comparison: { behind_by: overrides?.behindBy ?? 0 },
  checkRuns: overrides?.checkRuns ?? [successCheck],
});

assert.equal(classifyExecutionBoundary({ repository: REPOSITORY, pr: basePr }).status, 'SUPPORTED');
assert.equal(classifyExecutionBoundary({ repository: REPOSITORY, pr: { ...basePr, base: { ...basePr.base, ref: 'develop' } } }).status, 'BLOCKER_WRONG_BASE');
assert.equal(classifyExecutionBoundary({ repository: REPOSITORY, pr: { ...basePr, head: { ...basePr.head, repo: { full_name: 'fork/repo' } } } }).status, 'BLOCKER_UNSUPPORTED_FORK');
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
assert.equal(classify({ checkRuns: [{ ...successCheck, head_sha: HEAD2 }] }).status, 'CHECK_REQUIRED');
assert.equal(classify({ pr: { mergeable: false, mergeable_state: 'dirty' } }).status, 'BLOCKER_CONFLICT');
assert.equal(classify({ checkRuns: [] }).status, 'CHECK_REQUIRED');
assert.equal(classify({ checkRuns: [{ ...successCheck, status: 'in_progress', conclusion: null }] }).status, 'CHECK_PENDING');
assert.equal(classify({ pr: { draft: true } }).status, 'BLOCKER_DRAFT');
assert.equal(findExactProjectCheckForWorkflowRun([successCheck], HEAD, RUN_ID)?.id, successCheck.id);
assert.equal(findExactProjectCheckForWorkflowRun([{ ...successCheck, details_url: 'https://example.invalid/other' }], HEAD, RUN_ID), null);

const cliText = fs.readFileSync(path.resolve('tools/merge-finalizer/cli/finalize.mjs'), 'utf8');
const workflowText = fs.readFileSync(path.resolve('.github/workflows/merge-finalize-main.yml'), 'utf8');
const projectCheckText = fs.readFileSync(path.resolve('.github/workflows/project-tooling-r3-project-check.yml'), 'utf8');

for (const required of [
  "method: 'PUT', body: { expected_head_sha: snapshot.headSha }",
  "method: 'POST', body",
  "method: 'PUT', body: { sha: guard.headSha, merge_method: 'merge' }",
  'shouldRestartFinalization',
  'findExactProjectCheckForWorkflowRun',
]) {
  assert.equal(cliText.includes(required), true, `Stage 3 CLI missing guard/mutation primitive: ${required}`);
}
for (const forbidden of ["method: 'PATCH'", "method: 'DELETE'"]) {
  assert.equal(cliText.includes(forbidden), false, `Stage 3 CLI contains forbidden mutation primitive: ${forbidden}`);
}
assert.equal(cliText.includes('--execute'), true);
assert.equal(cliText.includes(`/actions/workflows/${PROJECT_CHECK_WORKFLOW}/dispatches`), false, 'static source uses template expression, not evaluated test string');
assert.equal(cliText.includes('return_run_details: true'), true);
assert.equal(workflowText.includes('group: merge-finalize-main'), true);
assert.equal(workflowText.includes('queue: max'), true);
assert.equal(workflowText.includes('cancel-in-progress: true'), false);
assert.equal(workflowText.includes('contents: write'), true);
assert.equal(workflowText.includes('pull-requests: write'), true);
assert.equal(workflowText.includes('actions: write'), true);
assert.equal(projectCheckText.includes('workflow_dispatch:'), true);
assert.equal(projectCheckText.includes('base_sha:'), true);
assert.equal(projectCheckText.includes('expected_head_sha:'), true);
assert.equal(projectCheckText.includes('ACTUAL_MAIN'), true);
assert.equal(projectCheckText.includes('ACTUAL_HEAD'), true);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_STAGE3_SELF_TEST',
  fixtures: 16,
  staticGuards: 18,
  requiredCheck: REQUIRED_PROJECT_CHECK,
  projectCheckWorkflow: PROJECT_CHECK_WORKFLOW,
  mutationMethods: ['PUT update-branch', 'POST workflow_dispatch', 'PUT merge'],
}, null, 2));
