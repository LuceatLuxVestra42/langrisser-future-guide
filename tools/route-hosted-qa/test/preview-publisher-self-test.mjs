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

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'ROUTE_HOSTED_QA_PREVIEW_PUBLISHER_SELF_TEST',
  previewPublishSerialized: true,
  pushRetryAttempts: 5,
  deploymentWaitBudgetSeconds: 1200,
}, null, 2));
