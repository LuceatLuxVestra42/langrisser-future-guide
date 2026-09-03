import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyExecutionBoundary,
  classifyMergeFinalization,
  findExactProjectCheckForWorkflowRun,
  getValidationSha,
  PROJECT_CHECK_WORKFLOW,
  REQUIRED_PROJECT_CHECK,
  shouldRestartFinalization,
  validateSyntheticMergeParents,
  validationRefName,
} from '../lib/merge-finalizer.mjs';

const REPOSITORY = 'owner/repo';
const MAIN = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const HEAD2 = '3'.repeat(40);
const MERGE = '4'.repeat(40);
const MERGE2 = '5'.repeat(40);
const RUN_ID = 12345;

const basePr = {
  number: 42,
  state: 'open',
  draft: false,
  mergeable: true,
  mergeable_state: 'clean',
  merge_commit_sha: MERGE,
  base: { ref: 'main', repo: { full_name: REPOSITORY } },
  head: { sha: HEAD, ref: 'feature/example', repo: { full_name: REPOSITORY } },
};
const successCheck = {
  id: 100,
  name: REQUIRED_PROJECT_CHECK.name,
  app: { id: REQUIRED_PROJECT_CHECK.appId },
  head_sha: MERGE,
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-09-03T01:00:00Z',
  completed_at: '2026-09-03T01:01:00Z',
  details_url: `https://github.com/${REPOSITORY}/actions/runs/${RUN_ID}/job/67890`,
};
const classify = overrides => classifyMergeFinalization({
  mainSha: MAIN,
  pr: {
    ...basePr,
    ...(overrides?.pr ?? {}),
    head: { ...basePr.head, ...(overrides?.pr?.head ?? {}) },
  },
  comparison: { behind_by: overrides?.behindBy ?? 0 },
  checkRuns: overrides?.checkRuns ?? [successCheck],
  ...(Object.prototype.hasOwnProperty.call(overrides ?? {}, 'validationSha')
    ? { validationSha: overrides.validationSha }
    : {}),
});

assert.equal(classifyExecutionBoundary({ repository: REPOSITORY, pr: basePr }).status, 'SUPPORTED');
assert.equal(classifyExecutionBoundary({ repository: REPOSITORY, pr: { ...basePr, base: { ...basePr.base, ref: 'develop' } } }).status, 'BLOCKER_WRONG_BASE');
assert.equal(classifyExecutionBoundary({ repository: REPOSITORY, pr: { ...basePr, head: { ...basePr.head, repo: { full_name: 'fork/repo' } } } }).status, 'BLOCKER_UNSUPPORTED_FORK');
assert.equal(getValidationSha(basePr), MERGE);
assert.equal(getValidationSha({ ...basePr, merge_commit_sha: null }), null);
assert.equal(validationRefName(basePr.number, MERGE), `merge-finalizer/validation/pr-42-${MERGE.slice(0, 12)}`);
assert.equal(validateSyntheticMergeParents({ sha: MERGE, parents: [{ sha: MAIN }, { sha: HEAD }] }, MAIN, HEAD).status, 'PASS');
assert.equal(validateSyntheticMergeParents({ sha: MERGE, parents: [{ sha: HEAD }, { sha: MAIN }] }, MAIN, HEAD).status, 'BLOCKER_SYNTHETIC_MERGE_PARENT_MISMATCH');
assert.equal(classify({ behindBy: 2 }).status, 'UPDATE_REQUIRED');
assert.deepEqual(
  shouldRestartFinalization({ mainSha: MAIN, headSha: HEAD, validationSha: MERGE }, { mainSha: HEAD2, headSha: HEAD, validationSha: MERGE }),
  { restart: true, reason: 'MAIN_CHANGED' },
);
assert.deepEqual(
  shouldRestartFinalization({ mainSha: MAIN, headSha: HEAD, validationSha: MERGE }, { mainSha: MAIN, headSha: HEAD2, validationSha: MERGE }),
  { restart: true, reason: 'HEAD_CHANGED' },
);
assert.deepEqual(
  shouldRestartFinalization({ mainSha: MAIN, headSha: HEAD, validationSha: MERGE }, { mainSha: MAIN, headSha: HEAD, validationSha: MERGE2 }),
  { restart: true, reason: 'VALIDATION_SHA_CHANGED' },
);
assert.equal(classify().status, 'READY_TO_MERGE');
assert.equal(classify({ pr: { merge_commit_sha: null }, validationSha: MERGE }).status, 'READY_TO_MERGE');
assert.equal(classify({ checkRuns: [{ ...successCheck, conclusion: 'failure' }] }).status, 'BLOCKER_OWNING_VALIDATOR');
assert.equal(classify({ checkRuns: [{ ...successCheck, app: { id: 999 } }] }).status, 'CHECK_REQUIRED');
assert.equal(classify({ checkRuns: [{ ...successCheck, head_sha: HEAD }] }).status, 'CHECK_REQUIRED');
assert.equal(classify({ pr: { mergeable: false, mergeable_state: 'dirty' } }).status, 'BLOCKER_CONFLICT');
assert.equal(classify({ checkRuns: [] }).status, 'CHECK_REQUIRED');
assert.equal(classify({ checkRuns: [{ ...successCheck, status: 'in_progress', conclusion: null }] }).status, 'CHECK_PENDING');
assert.equal(classify({ pr: { draft: true } }).status, 'BLOCKER_DRAFT');
assert.equal(classify({ pr: { merge_commit_sha: null }, checkRuns: [], validationSha: null }).status, 'WAIT_MERGEABILITY');
assert.equal(findExactProjectCheckForWorkflowRun([successCheck], MERGE, RUN_ID)?.id, successCheck.id);
assert.equal(findExactProjectCheckForWorkflowRun([{ ...successCheck, details_url: 'https://example.invalid/other' }], MERGE, RUN_ID), null);

const cliText = fs.readFileSync(path.resolve('tools/merge-finalizer/cli/finalize.mjs'), 'utf8');
const workflowText = fs.readFileSync(path.resolve('.github/workflows/merge-finalize-main.yml'), 'utf8');
const projectCheckText = fs.readFileSync(path.resolve('.github/workflows/project-tooling-r3-project-check.yml'), 'utf8');

for (const required of [
  "`/git/ref/pull/${prNumber}/merge`",
  "validationSha: boundary.validationSha",
  "method: 'PUT', body: { expected_head_sha: snapshot.headSha }",
  "method: 'POST',\n      body: { ref: `refs/heads/${refName}`, sha: validationSha }",
  "method: 'DELETE'",
  "ref: refName",
  "expected_head_sha: validationSha",
  "method: 'PUT', body: { sha: guard.headSha, merge_method: 'merge' }",
  'validateSyntheticMergeParents',
  'validationRefName',
  'shouldRestartFinalization',
  'findExactProjectCheckForWorkflowRun',
]) {
  assert.equal(cliText.includes(required), true, `Stage 4 CLI missing merge-result guard/mutation primitive: ${required}`);
}
assert.equal(cliText.includes("method: 'PATCH'"), false, 'Stage 4 CLI contains forbidden PATCH mutation primitive');
assert.equal(cliText.includes('--execute'), true);
assert.equal(cliText.includes('return_run_details: true'), true);
assert.equal(cliText.includes('async function waitForPostMergeVerification'), true);
assert.equal(cliText.includes('Math.min(options.timeoutMs, 60_000)'), true);
assert.equal(cliText.includes('mergedPr?.merged_at != null && mergeCommit?.sha === mergeSha && parentShas.includes(expectedHeadSha)'), true);
assert.equal(cliText.includes('mergedPr?.merge_commit_sha === mergeSha'), false);
assert.equal(cliText.includes('parentShas.includes(expectedHeadSha)'), true);
assert.equal(cliText.includes('guard.headSha,\n      token,'), true);
assert.equal(cliText.includes("blocker('BLOCKER_POST_MERGE_VERIFICATION'"), true);
assert.equal(workflowText.includes('workflow_dispatch:'), true);
assert.equal(workflowText.includes('pull_request_target:'), true);
assert.equal(workflowText.includes('      - opened'), true);
assert.equal(workflowText.includes('      - reopened'), true);
assert.equal(workflowText.includes('      - synchronize'), true);
assert.equal(workflowText.includes('      - ready_for_review'), true);
assert.equal(workflowText.includes("github.event.pull_request.draft == false"), true);
assert.equal(workflowText.includes('github.event.pull_request.head.repo.full_name == github.repository'), true);
assert.equal(workflowText.includes('PR_NUMBER: ${{ github.event.pull_request.number || inputs.pr }}'), true);
assert.equal(workflowText.includes('ref: main'), true);
assert.equal(workflowText.includes('MERGE_FINALIZER_ALREADY_MERGED_NOOP=PASS'), true);
assert.equal(workflowText.includes('group: merge-finalize-main'), true);
assert.equal(workflowText.includes('queue: max'), true);
assert.equal(workflowText.includes('cancel-in-progress: true'), false);
assert.equal(workflowText.includes('contents: write'), true);
assert.equal(workflowText.includes('pull-requests: write'), true);
assert.equal(workflowText.includes('actions: write'), true);
assert.equal(workflowText.includes('actions/create-github-app-token@v2'), true);
assert.equal(workflowText.includes('secrets.MERGEFINALIZER_APP_ID'), true);
assert.equal(workflowText.includes('secrets.MERGEFINALIZER_APP_KEY'), true);
assert.equal(workflowText.includes('permission-contents: write'), true);
assert.equal(workflowText.includes('permission-actions: read'), true);
assert.equal(workflowText.includes('MERGE_FINALIZER_APP_PREFLIGHT_STATUS'), true);
assert.equal(workflowText.includes('GH_TOKEN="$APP_TOKEN" gh api --method PUT'), true);
assert.equal(workflowText.includes('CHECK_REQUIRED|CHECK_PENDING|CHECK_NOT_SUCCESSFUL)'), true);
assert.equal(workflowText.includes('MERGE_FINALIZER_APP_PREFLIGHT=HANDOFF_TO_EXECUTE'), true);
assert.equal(workflowText.includes('WAIT_MERGEABILITY|CHECK_REQUIRED|CHECK_PENDING)'), false);
assert.equal(workflowText.includes('GITHUB_TOKEN: ${{ github.token }}'), true);
assert.equal(projectCheckText.includes('workflow_dispatch:'), true);
assert.equal(projectCheckText.includes('base_sha:'), true);
assert.equal(projectCheckText.includes('expected_head_sha:'), true);
assert.equal(projectCheckText.includes('ACTUAL_MAIN'), true);
assert.equal(projectCheckText.includes('ACTUAL_HEAD'), true);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_APP_REFRESH_SELF_TEST',
  fixtures: 24,
  staticGuards: 53,
  requiredCheck: REQUIRED_PROJECT_CHECK,
  projectCheckWorkflow: PROJECT_CHECK_WORKFLOW,
  validationLocator: 'refs/pull/<pr>/merge',
  validationTarget: 'PR_SYNTHETIC_MERGE_RESULT_SHA',
  validationRefLifetime: 'TEMPORARY_DISPATCH_REF_ONLY',
  staleRefreshActor: 'GITHUB_APP_INSTALLATION_TOKEN',
  appSecretNames: ['MERGEFINALIZER_APP_ID', 'MERGEFINALIZER_APP_KEY'],
  appPermissions: ['contents:write', 'pull-requests:write', 'actions:read', 'checks:read'],
  mergeExecutionToken: 'github.token',
  automaticTrigger: 'pull_request_target non-draft same-repository PR to main',
  duplicateMergeEventHandling: 'ALREADY_MERGED_NOOP',
  mutationMethods: ['PUT update-branch', 'POST temp validation ref', 'POST workflow_dispatch', 'DELETE temp validation ref', 'PUT merge'],
}, null, 2));
