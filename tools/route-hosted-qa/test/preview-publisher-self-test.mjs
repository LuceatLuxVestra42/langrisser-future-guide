import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const workflowPath = path.join(repoRoot, '.github/workflows/project-tooling-route-hosted-qa.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

assert.match(workflow, /publish-pr-preview:\n    name: publish-pr-preview\n    concurrency:\n      group: project-tooling-route-hosted-qa-preview-publish\n      cancel-in-progress: false/);
assert.match(workflow, /for attempt in 1 2 3 4 5; do/);
assert.match(workflow, /git fetch origin "\$PREVIEW_BRANCH"/);
assert.match(workflow, /git rebase "origin\/\$PREVIEW_BRANCH"/);
assert.match(workflow, /BLOCKER_PREVIEW_PUBLISH_RETRY_EXHAUSTED/);
assert.match(workflow, /deadline=\$\(\(SECONDS \+ 1200\)\)/);
assert.doesNotMatch(workflow, /deadline=\$\(\(SECONDS \+ 600\)\)/);
assert.match(workflow, /Strict Hosted QA against exact Data Pages preview[\s\S]*--expected-sha "\$SOURCE_SHA"/);

const finalizerHandoffMatch = workflow.match(
  /^  finalizer-handoff:\n[\s\S]*?(?=^  [A-Za-z0-9_-]+:\n)/m,
);
assert.ok(finalizerHandoffMatch, 'finalizer-handoff job must exist');
const finalizerHandoff = finalizerHandoffMatch[0];

assert.match(finalizerHandoff, /finalizer-handoff:\n    name: finalizer-handoff/);
assert.match(finalizerHandoff, /needs:\n      - preview_gate_plan\n      - publish-pr-preview/);
assert.match(finalizerHandoff, /github\.event_name == 'pull_request'/);
assert.match(finalizerHandoff, /github\.event\.action != 'closed'/);
assert.match(finalizerHandoff, /needs\.preview_gate_plan\.outputs\.hosted_preview_required == 'true'/);
assert.match(finalizerHandoff, /needs\.publish-pr-preview\.result == 'success'/);
assert.match(finalizerHandoff, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
assert.match(finalizerHandoff, /permissions:\n      contents: read\n      pull-requests: read\n      actions: write/);
assert.doesNotMatch(finalizerHandoff, /contents:\s*write/);
assert.match(finalizerHandoff, /FINALIZER_HANDOFF=SKIP_DIFFERENT_REPOSITORY/);
assert.match(finalizerHandoff, /FINALIZER_HANDOFF=SKIP_CLOSED/);
assert.match(finalizerHandoff, /FINALIZER_HANDOFF=SKIP_MERGED/);
assert.match(finalizerHandoff, /FINALIZER_HANDOFF=SKIP_STALE_HEAD/);
assert.match(finalizerHandoff, /actions\/workflows\/merge-finalize-main\.yml\/dispatches/);
assert.match(finalizerHandoff, /-f ref=main/);
assert.match(finalizerHandoff, /-f "inputs\[pr\]=\$PR_NUMBER"/);
assert.match(finalizerHandoff, /FINALIZER_HANDOFF=DISPATCHED/);
assert.doesNotMatch(finalizerHandoff, /gh pr merge/);

function classifyHandoffFixture({
  eventName = 'pull_request',
  hostedPreviewRequired = true,
  publishResult = 'success',
  sameRepository = true,
  state = 'open',
  merged = false,
  sourceSha = 'a'.repeat(40),
  currentHead = sourceSha,
}) {
  if (eventName !== 'pull_request') return 'SKIP_NON_PR';
  if (!hostedPreviewRequired) return 'SKIP_NON_REQUIRED';
  if (publishResult !== 'success') return 'SKIP_NOT_PUBLISHED';
  if (!sameRepository) return 'SKIP_DIFFERENT_REPOSITORY';
  if (state !== 'open') return 'SKIP_CLOSED';
  if (merged) return 'SKIP_MERGED';
  if (currentHead !== sourceSha) return 'SKIP_STALE_HEAD';
  return 'DISPATCH';
}

const handoffCases = [
  {
    name: 'pending or non-success then later success',
    steps: [
      [{ publishResult: 'failure' }, 'SKIP_NOT_PUBLISHED'],
      [{ publishResult: 'success' }, 'DISPATCH'],
    ],
  },
  {
    name: 'cancelled then rerun success',
    steps: [
      [{ publishResult: 'cancelled' }, 'SKIP_NOT_PUBLISHED'],
      [{ publishResult: 'success' }, 'DISPATCH'],
    ],
  },
  {
    name: 'validated head A but current head B',
    steps: [
      [{ sourceSha: 'a'.repeat(40), currentHead: 'b'.repeat(40) }, 'SKIP_STALE_HEAD'],
    ],
  },
  {
    name: 'closed or already merged PR',
    steps: [
      [{ state: 'closed' }, 'SKIP_CLOSED'],
      [{ merged: true }, 'SKIP_MERGED'],
    ],
  },
  {
    name: 'hosted preview not required',
    steps: [
      [{ hostedPreviewRequired: false }, 'SKIP_NON_REQUIRED'],
    ],
  },
  {
    name: 'workflow_run or manual non-PR event',
    steps: [
      [{ eventName: 'workflow_run' }, 'SKIP_NON_PR'],
      [{ eventName: 'workflow_dispatch' }, 'SKIP_NON_PR'],
    ],
  },
];

for (const fixture of handoffCases) {
  for (const [input, expected] of fixture.steps) {
    assert.equal(classifyHandoffFixture(input), expected, fixture.name);
  }
}

assert.equal(classifyHandoffFixture({ sameRepository: false }), 'SKIP_DIFFERENT_REPOSITORY');

assert.match(workflow, /ready_for_review, closed/);
assert.match(workflow, /cleanup-pr-preview:/);
assert.match(workflow, /github\.event\.action == 'closed'/);
assert.match(workflow, /cleanup-pr-preview:[\s\S]*group: project-tooling-route-hosted-qa-preview-publish/);
assert.match(workflow, /cleanup-pr-preview:[\s\S]*cancel-in-progress: false/);
assert.match(workflow, /rm -rf -- "\$PREVIEW_PATH"/);
assert.match(workflow, /BLOCKER_PREVIEW_CLEANUP_RETRY_EXHAUSTED/);
assert.match(workflow, /PR_PREVIEW_CLEANUP=PASS/);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'ROUTE_HOSTED_QA_PREVIEW_PUBLISHER_SELF_TEST',
  previewPublishSerialized: true,
  pushRetryAttempts: 5,
  deploymentWaitBudgetSeconds: 1200,
  closedPreviewCleanup: true,
  finalizerHandoffContract: true,
  finalizerHandoffCases: handoffCases.length,
}, null, 2));
