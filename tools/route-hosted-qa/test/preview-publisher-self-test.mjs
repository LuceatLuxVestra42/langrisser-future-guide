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
}, null, 2));
