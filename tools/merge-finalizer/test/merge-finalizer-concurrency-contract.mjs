import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const contractPath = path.resolve('tools/merge-finalizer/contracts/concurrency.v1.json');
const workflowPath = path.resolve('.github/workflows/merge-finalize-main.yml');
const cliPath = path.resolve('tools/merge-finalizer/cli/finalize.mjs');

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const workflowText = fs.readFileSync(workflowPath, 'utf8');
const cliText = fs.readFileSync(cliPath, 'utf8');

assert.equal(contract.version, 1);
assert.equal(contract.owner, 'merge-finalizer/orchestration');
assert.equal(contract.validationConcurrency.scope, 'PR');
assert.equal(contract.validationConcurrency.cancelInProgress, true);
assert.equal(contract.mergeMutationConcurrency.scope, 'MAIN_MUTATION');
assert.equal(contract.mergeMutationConcurrency.queue, 'max');
assert.equal(contract.staleRefreshHandoff.policy, 'NEW_EXACT_HEAD_RUN_OWNS_CONTINUATION');
assert.equal(contract.staleRefreshHandoff.oldRunMustNotMergeAfterHeadChange, true);
assert.deepEqual(
  contract.freshnessGuards,
  ['MAIN_CHANGED', 'HEAD_CHANGED', 'VALIDATION_SHA_CHANGED'],
);
assert.equal(contract.validationTargets.projectCheck, 'PR_SYNTHETIC_MERGE_RESULT_SHA');
assert.equal(contract.validationTargets.hostedPreview, 'EXACT_PR_HEAD_SHA');

const prConcurrencyLine = `group: ${contract.validationConcurrency.groupExpression}`;
const mergeMutationConcurrencyLine = `group: ${contract.mergeMutationConcurrency.group}`;
const forbiddenWorkflowWideGlobalLine = `group: ${contract.forbidden.workflowWideGlobalMergeLock}\n`;

// RED contract for Stage 1: these assertions intentionally describe the target
// workflow and are expected to fail until Stage 2 implements the orchestration split.
assert.equal(
  workflowText.includes(prConcurrencyLine),
  true,
  'Finalizer validation must use PR-local concurrency so unrelated PR validation can run in parallel.',
);
assert.equal(
  workflowText.includes('cancel-in-progress: true'),
  true,
  'Same-PR synchronize events must hand ownership to the newest exact-head run.',
);
assert.equal(
  workflowText.includes(mergeMutationConcurrencyLine),
  true,
  'Only the main mutation admission boundary may use a repository-wide merge concurrency group.',
);
assert.equal(
  workflowText.includes(forbiddenWorkflowWideGlobalLine),
  false,
  'The legacy workflow-wide merge-finalize-main lock must be removed.',
);

for (const reason of contract.freshnessGuards) {
  assert.equal(
    cliText.includes(`reason: '${reason}'`) || cliText.includes(`reason: \"${reason}\"`),
    true,
    `Finalizer CLI must preserve freshness restart guard ${reason}.`,
  );
}

for (const required of [
  'waitForMergeGates',
  'validateSyntheticMergeParents',
  'findExactProjectCheckForWorkflowRun',
  '`/commits/${boundary.headSha}/check-runs?per_page=100`',
]) {
  assert.equal(cliText.includes(required), true, `Existing merge safety guard missing: ${required}`);
}

assert.equal(
  cliText.includes("'src/routes/"),
  false,
  'Concurrency refactor must not introduce frontend path inference into merge-finalizer.',
);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_CONCURRENCY_CONTRACT_V1',
  owner: contract.owner,
  validationConcurrency: contract.validationConcurrency,
  mergeMutationConcurrency: contract.mergeMutationConcurrency,
  staleRefreshHandoff: contract.staleRefreshHandoff,
  freshnessGuards: contract.freshnessGuards,
  validationTargets: contract.validationTargets,
}, null, 2));
