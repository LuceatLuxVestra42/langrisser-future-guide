import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyMergeAdmission,
  DEFAULT_ADMISSION_LABEL,
  hasMergeAdmission,
} from '../lib/admission.mjs';

const contractPath = path.resolve('tools/merge-finalizer/contracts/admission.v1.json');
const workflowPath = path.resolve('.github/workflows/merge-finalize-main.yml');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const workflowText = fs.readFileSync(workflowPath, 'utf8');

assert.equal(contract.version, 1);
assert.equal(contract.schemaId, 'merge-finalizer-admission/v1');
assert.equal(contract.status, 'DESIGN_FROZEN');
assert.equal(contract.owner, 'merge-finalizer/orchestration');
assert.equal(contract.label, DEFAULT_ADMISSION_LABEL);
assert.equal(contract.maxActiveAdmissions, 1);
assert.equal(contract.manualDispatchBypassesAdmission, false);
assert.equal(contract.admissionRequiredForValidation, true);
assert.equal(contract.admissionRequiredForMergeMutation, true);
assert.equal(contract.revalidateOnSynchronize, true);
assert.equal(contract.revocationIsFailClosed, true);

const basePr = {
  number: 42,
  state: 'open',
  draft: false,
  labels: [{ name: DEFAULT_ADMISSION_LABEL }],
};

assert.equal(hasMergeAdmission(basePr), true);
assert.equal(hasMergeAdmission({ ...basePr, labels: [] }), false);
assert.deepEqual(
  classifyMergeAdmission({ pr: { ...basePr, draft: true }, activeAdmissions: [] }),
  { status: 'NOT_ADMITTED', reason: 'DRAFT' },
);
assert.deepEqual(
  classifyMergeAdmission({ pr: { ...basePr, labels: [] }, activeAdmissions: [] }),
  { status: 'NOT_ADMITTED', reason: 'LABEL_MISSING' },
);
assert.equal(
  classifyMergeAdmission({ pr: basePr, activeAdmissions: [42] }).status,
  'ADMITTED',
);
assert.equal(
  classifyMergeAdmission({ pr: basePr, activeAdmissions: [42, 43] }).status,
  'BLOCKER_MULTIPLE_MERGE_ADMISSIONS',
);
assert.equal(
  classifyMergeAdmission({ pr: basePr, activeAdmissions: [43] }).status,
  'BLOCKER_ADMISSION_INDEX_MISMATCH',
);
assert.deepEqual(
  classifyMergeAdmission({ pr: { ...basePr, state: 'closed' }, activeAdmissions: [] }),
  { status: 'NOT_ADMITTED', reason: 'PR_NOT_OPEN' },
);

for (const event of ['labeled', 'unlabeled', 'synchronize', 'ready_for_review', 'converted_to_draft', 'reopened', 'closed']) {
  assert.equal(workflowText.includes(`- ${event}`), true, `Admission event missing from workflow: ${event}`);
}
assert.equal(workflowText.includes('- opened'), false, 'Opening a non-draft PR must not automatically admit it to finalization.');
assert.equal(workflowText.includes('tools/merge-finalizer/cli/check-admission.mjs'), true);
assert.equal(workflowText.includes('Reconfirm merge admission before main mutation'), true);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_ADMISSION_CONTRACT_V1',
  owner: contract.owner,
  label: contract.label,
  maxActiveAdmissions: contract.maxActiveAdmissions,
}, null, 2));
