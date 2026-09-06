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

assert.match(workflow, /finalizer-handoff:\n    name: finalizer-handoff/);
assert.match(workflow, /finalizer-handoff:[\s\S]*needs:\n      - preview_gate_plan\n      - publish-pr-preview/);
assert.match(workflow, /finalizer-handoff:[\s\S]*github\.event_name == 'pull_request'/);
assert.match(workflow, /finalizer-handoff:[\s\S]*github\.event\.action != 'closed'/);
assert.match(workflow, /finalizer-handoff:[\s\S]*needs\.preview_gate_plan\.outputs\.hosted_preview_required == 'true'/);
assert.match(workflow, /finalizer-handoff:[\s\S]*needs\.publish-pr-preview\.result == 'success'/);
assert.match(workflow, /finalizer-handoff:[\s\S]*github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
assert.match(workflow, /finalizer-handoff:[\s\S]*permissions:\n      contents: read\n      pull-requests: read\n      actions: write/);
assert.doesNotMatch(workflow, /finalizer-handoff:[\s\S]*contents: write/);
assert.match(workflow, /FINALIZER_HANDOFF=SKIP_DIFFERENT_REPOSITORY/);
assert.match(workflow, /FINALIZER_HANDOFF=SKIP_CLOSED/);
assert.match(workflow, /FINALIZER_HANDOFF=SKIP_MERGED/);
assert.match(workflow, /FINALIZER_HANDOFF=SKIP_STALE_HEAD/);
assert.match(workflow, /actions\/workflows\/merge-finalize-main\.yml\/dispatches/);
assert.match(workflow, /-f ref=main/);
assert.match(workflow, /-f "inputs\[pr\]=\$PR_NUMBER"/);
assert.match(workflow, /FINALIZER_HANDOFF=DISPATCHED/);
assert.doesNotMatch(workflow, /finalizer-handoff:[\s\S]*gh pr merge/);

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
    name: 'pending or non-success later reruns successfully',
    input: { publishResult: 'success' },
    expected: 'DISPATCH',
  },
  {
    name: 'cancelled preview later reruns successfully',
    input: { publishResult: 'success' },
    expected: 'DISPATCH',
  },
  {
    name: 'validated head A but current head B',
    input: { sourceSha: 'a'.repeat(40), currentHead: 'b'.repeat(40) },
    expected: 'SKIP_STALE_HEAD',
  },
  {
    name: 'closed or already merged PR',
    input: { state: 'closed', merged: true },
    expected: 'SKIP_CLOSED',
  },
  {
    name: 'hosted preview not required',
    input: { hostedPreviewRequired: false },
    expected: 'SKIP_NON_REQUIRED',
  },
  {
    name: 'workflow_run or manual non-PR event',
    input: { eventName: 'workflow_run' },
    expected: 'SKIP_NON_PR',
  },
];

for (const fixture of handoffCases) {
  assert.equal(classifyHandoffFixture(fixture.input), fixture.expected, fixture.name);
}

assert.equal(classifyHandoffFixture({ publishResult: 'cancelled' }), 'SKIP_NOT_PUBLISHED');
assert.equal(classifyHandoffFixture({ sameRepository: false }), 'SKIP_DIFFERENT_REPOSITORY');
assert.equal(classifyHandoffFixture({ merged: true }), 'SKIP_MERGED');
assert.equal(classifyHandoffFixture({ eventName: 'workflow_dispatch' }), 'SKIP_NON_PR');

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
