import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyTrackedMutation,
  normalizeStatusLines,
} from '../lib/tracked-mutation.mjs';

const repoRoot = process.cwd();
const workflowPath = path.join(
  repoRoot,
  '.github/workflows/project-tooling-r3-project-check.yml',
);
const workflow = fs.readFileSync(workflowPath, 'utf8');

const mutationStepStart = workflow.indexOf(
  '      - name: Verify and classify Project Check tracked state',
);
assert.notEqual(
  mutationStepStart,
  -1,
  'Project Check workflow must keep tracked-state verification and classification',
);

const mutationStep = workflow.slice(mutationStepStart);
assert.match(
  mutationStep,
  /tracked-mutation\.mjs signature/u,
  'tracked-state guard must capture a deterministic head mutation signature',
);
assert.match(
  mutationStep,
  /git worktree add --detach/u,
  'tracked-state guard must reproduce the owning validators on exact base',
);
assert.match(
  mutationStep,
  /tracked-mutation\.mjs classify/u,
  'tracked-state guard must classify base/head mutation parity',
);
assert.match(
  mutationStep,
  /REVIEW_EXISTING_DRIFT/u,
  'workflow must expose existing drift as a non-blocking review classification',
);
assert.match(
  mutationStep,
  /REGRESSION_BLOCKER/u,
  'workflow must retain a blocking regression classification',
);

function signature(lines, diffSha256) {
  return {
    lines: normalizeStatusLines(lines.join('\n')),
    diffSha256,
  };
}

const knownEquipmentGeneratedMutation = [
  ' M data/generated/equipment-name-kr-user-approved.v1.json',
  ' M data/validation/equipment-name-kr-user-approved-summary.v1.json',
];

const existingDriftFixture = {
  id: 'BASE_AND_HEAD_SAME_TRACKED_MUTATION',
  base: signature(knownEquipmentGeneratedMutation, 'same-diff-hash'),
  head: signature(knownEquipmentGeneratedMutation, 'same-diff-hash'),
};

const headOnlyRegressionFixture = {
  id: 'HEAD_ONLY_TRACKED_MUTATION',
  base: signature([], 'empty-base-hash'),
  head: signature(knownEquipmentGeneratedMutation, 'head-only-diff-hash'),
};

const changedMutationFixture = {
  id: 'BASE_AND_HEAD_DIFFERENT_TRACKED_MUTATION',
  base: signature(knownEquipmentGeneratedMutation, 'base-diff-hash'),
  head: signature(knownEquipmentGeneratedMutation, 'head-diff-hash'),
};

const existing = classifyTrackedMutation(
  existingDriftFixture.head,
  existingDriftFixture.base,
);
const headOnly = classifyTrackedMutation(
  headOnlyRegressionFixture.head,
  headOnlyRegressionFixture.base,
);
const changed = classifyTrackedMutation(
  changedMutationFixture.head,
  changedMutationFixture.base,
);

assert.equal(existing.status, 'REVIEW_EXISTING_DRIFT');
assert.equal(existing.exitCode, 0);
assert.equal(headOnly.status, 'REGRESSION_BLOCKER');
assert.equal(headOnly.exitCode, 1);
assert.equal(changed.status, 'REGRESSION_BLOCKER');
assert.equal(changed.exitCode, 1);

console.log(
  '[project-check tracked-mutation classification] PASS ' +
    JSON.stringify({
      existingDrift: {
        fixture: existingDriftFixture.id,
        status: existing.status,
        exitCode: existing.exitCode,
      },
      headOnlyRegression: {
        fixture: headOnlyRegressionFixture.id,
        status: headOnly.status,
        exitCode: headOnly.exitCode,
      },
      changedMutation: {
        fixture: changedMutationFixture.id,
        status: changed.status,
        exitCode: changed.exitCode,
      },
    }),
);
