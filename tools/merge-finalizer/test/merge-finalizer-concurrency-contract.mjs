import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const contractPath = path.resolve('tools/merge-finalizer/contracts/concurrency.v2.json');
const workflowPath = path.resolve('.github/workflows/merge-finalize-main.yml');
const cliPath = path.resolve('tools/merge-finalizer/cli/finalize.mjs');
const libPath = path.resolve('tools/merge-finalizer/lib/merge-finalizer.mjs');

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const workflowText = fs.readFileSync(workflowPath, 'utf8');
const cliText = fs.readFileSync(cliPath, 'utf8');
const libText = fs.readFileSync(libPath, 'utf8');

assert.equal(contract.version, 2);
assert.equal(contract.schemaId, 'merge-finalizer-concurrency/v2');
assert.equal(contract.status, 'DESIGN_FROZEN');
assert.equal(contract.owner, 'merge-finalizer/orchestration');
assert.equal(contract.wakeupConcurrency.scope, 'PR');
assert.equal(contract.wakeupConcurrency.cancelInProgress, true);
assert.equal(contract.finalizingConcurrency.scope, 'FINALIZING');
assert.equal(contract.finalizingConcurrency.maxActive, 1);
assert.equal(contract.finalizingConcurrency.requiresAdmission, true);
assert.equal(contract.finalizingConcurrency.recheckAdmissionAfterLockAcquired, true);
assert.equal(contract.mergeMutationConcurrency.scope, 'MAIN_MUTATION');
assert.equal(contract.mergeMutationConcurrency.maxActive, 1);
assert.equal(contract.mergeMutationConcurrency.queue, 'max');
assert.equal(contract.staleRefreshHandoff.policy, 'NEW_EXACT_HEAD_RUN_OWNS_CONTINUATION');
assert.equal(contract.staleRefreshHandoff.oldRunMustNotMergeAfterHeadChange, true);
assert.deepEqual(
  contract.freshnessGuards,
  ['MAIN_CHANGED', 'HEAD_CHANGED', 'VALIDATION_SHA_CHANGED'],
);
assert.equal(contract.validationTargets.projectCheck, 'PR_SYNTHETIC_MERGE_RESULT_SHA');
assert.equal(contract.validationTargets.hostedPreview, 'EXACT_PR_HEAD_SHA');

const wakeupConcurrencyLine = `group: ${contract.wakeupConcurrency.groupExpression}`;
const finalizingConcurrencyLine = `group: ${contract.finalizingConcurrency.group}`;
const mergeMutationConcurrencyLine = `group: ${contract.mergeMutationConcurrency.group}`;
const forbiddenWorkflowWideGlobalLine = `group: ${contract.forbidden.workflowWideGlobalMergeLock}\n`;

assert.equal(
  workflowText.includes(wakeupConcurrencyLine),
  true,
  'Workflow wake-up ownership must remain PR-local so unrelated PR events do not cancel each other.',
);
assert.equal(
  workflowText.includes('cancel-in-progress: true'),
  true,
  'Same-PR synchronize events must hand ownership to the newest exact-head run.',
);
assert.equal(
  workflowText.includes('admission:'),
  true,
  'Explicit admission must be resolved before a PR enters the global FINALIZING lane.',
);
assert.equal(
  workflowText.includes("needs.admission.outputs.admitted == 'true'"),
  true,
  'Unadmitted PRs must not occupy the FINALIZING concurrency lane.',
);
assert.equal(
  workflowText.includes(finalizingConcurrencyLine),
  true,
  'Exactly one admitted PR may occupy FINALIZING validation at a time.',
);
assert.equal(
  workflowText.includes('Reconfirm merge admission at FINALIZING entry'),
  true,
  'Admission must be rechecked after the global FINALIZING lock is acquired.',
);
assert.equal(
  workflowText.includes(mergeMutationConcurrencyLine),
  true,
  'Main mutation must remain independently serialized after exact validation.',
);
assert.equal(
  workflowText.includes(forbiddenWorkflowWideGlobalLine),
  false,
  'The legacy workflow-wide merge-finalize-main lock must remain retired.',
);
assert.equal(workflowText.includes('Prepare exact PR for merge admission'), true);
assert.equal(workflowText.includes('--prepare'), true);
assert.equal(workflowText.includes('merge-admission:'), true);
assert.equal(workflowText.includes('--merge-only'), true);
assert.equal(workflowText.includes('--max-restarts 0'), true);
assert.equal(workflowText.includes('MERGE_FINALIZER_MAIN_MUTATION_HANDOFF=PASS'), true);

assert.equal(
  cliText.includes('shouldRestartFinalization'),
  true,
  'Finalizer CLI must delegate freshness changes to the authoritative restart guard.',
);
for (const reason of contract.freshnessGuards) {
  assert.equal(
    libText.includes(`reason: '${reason}'`) || libText.includes(`reason: \"${reason}\"`),
    true,
    `Authoritative merge-finalizer lib must preserve freshness restart guard ${reason}.`,
  );
}

for (const required of [
  'waitForMergeGates',
  'validateSyntheticMergeParents',
  'findExactProjectCheckForWorkflowRun',
  '`/commits/${boundary.headSha}/check-runs?per_page=100`',
  "status: 'PREPARED_FOR_MERGE_ADMISSION'",
  "handoff('PREPARE_REVALIDATION_REQUIRED'",
  "handoff('MERGE_ADMISSION_REVALIDATION_REQUIRED'",
]) {
  assert.equal(cliText.includes(required), true, `Existing merge safety/concurrency guard missing: ${required}`);
}

assert.equal(
  cliText.includes("'src/routes/"),
  false,
  'Concurrency refactor must not introduce frontend path inference into merge-finalizer.',
);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_CONCURRENCY_CONTRACT_V2',
  owner: contract.owner,
  wakeupConcurrency: contract.wakeupConcurrency,
  finalizingConcurrency: contract.finalizingConcurrency,
  mergeMutationConcurrency: contract.mergeMutationConcurrency,
  staleRefreshHandoff: contract.staleRefreshHandoff,
  freshnessGuards: contract.freshnessGuards,
  validationTargets: contract.validationTargets,
  mergeAdmission: 'EXPLICIT_ADMISSION_SINGLE_FINALIZING_EXACT_READY',
}, null, 2));
