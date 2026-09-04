import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const workflowPath = path.join(
  repoRoot,
  '.github/workflows/project-tooling-r3-project-check.yml',
);
const workflow = fs.readFileSync(workflowPath, 'utf8');

const mutationStepStart = workflow.indexOf(
  '      - name: Verify Project Check tracked state is unchanged',
);
assert.notEqual(
  mutationStepStart,
  -1,
  'Project Check workflow must keep the tracked-state mutation guard',
);

const mutationStep = workflow.slice(mutationStepStart);
assert.match(
  mutationStep,
  /git status --porcelain=v1 --untracked-files=no/u,
  'tracked-state guard must inspect tracked repository mutation',
);
assert.match(
  mutationStep,
  /Project Check owning validators mutated tracked repository state\./u,
  'tracked-state guard must retain its fail-closed diagnostic',
);
assert.match(
  mutationStep,
  /exit 1/u,
  'tracked-state mutation currently fails the required Project Check',
);

function normalizeMutationSignature(lines) {
  return [...lines].map(line => line.trim()).filter(Boolean).sort();
}

function currentTrackedMutationGuard(headMutations) {
  const signature = normalizeMutationSignature(headMutations);
  return {
    status: signature.length === 0 ? 'PASS' : 'BLOCKER_TRACKED_MUTATION',
    exitCode: signature.length === 0 ? 0 : 1,
    signature,
  };
}

const knownEquipmentGeneratedMutation = [
  'M data/generated/equipment-name-kr-user-approved.v1.json',
  'M data/validation/equipment-name-kr-user-approved-summary.v1.json',
];

const existingDriftFixture = {
  id: 'BASE_AND_HEAD_SAME_TRACKED_MUTATION',
  baseMutations: knownEquipmentGeneratedMutation,
  headMutations: knownEquipmentGeneratedMutation,
  futureExpectedClassification: 'REVIEW_EXISTING_DRIFT',
};

const headOnlyRegressionFixture = {
  id: 'HEAD_ONLY_TRACKED_MUTATION',
  baseMutations: [],
  headMutations: knownEquipmentGeneratedMutation,
  futureExpectedClassification: 'REGRESSION_BLOCKER',
};

const existingCurrent = currentTrackedMutationGuard(
  existingDriftFixture.headMutations,
);
const regressionCurrent = currentTrackedMutationGuard(
  headOnlyRegressionFixture.headMutations,
);

assert.equal(existingCurrent.status, 'BLOCKER_TRACKED_MUTATION');
assert.equal(existingCurrent.exitCode, 1);
assert.equal(regressionCurrent.status, 'BLOCKER_TRACKED_MUTATION');
assert.equal(regressionCurrent.exitCode, 1);
assert.deepEqual(existingCurrent.signature, regressionCurrent.signature);
assert.deepEqual(
  normalizeMutationSignature(existingDriftFixture.baseMutations),
  existingCurrent.signature,
);
assert.deepEqual(
  normalizeMutationSignature(headOnlyRegressionFixture.baseMutations),
  [],
);
assert.notEqual(
  existingDriftFixture.futureExpectedClassification,
  headOnlyRegressionFixture.futureExpectedClassification,
);

console.log(
  '[project-check tracked-mutation baseline] PASS ' +
    JSON.stringify({
      currentBehavior: 'UNDifferentiated tracked mutation failure'.toUpperCase(),
      existingDrift: {
        fixture: existingDriftFixture.id,
        currentStatus: existingCurrent.status,
        futureExpectedClassification:
          existingDriftFixture.futureExpectedClassification,
      },
      headOnlyRegression: {
        fixture: headOnlyRegressionFixture.id,
        currentStatus: regressionCurrent.status,
        futureExpectedClassification:
          headOnlyRegressionFixture.futureExpectedClassification,
      },
    }),
);
