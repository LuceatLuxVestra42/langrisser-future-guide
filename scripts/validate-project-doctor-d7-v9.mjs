import fs from 'node:fs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d7-pr-guard.v9.json';
const WORKFLOW_PATH = '.github/workflows/project-doctor-d7-pr-guard.yml';
const PACKAGE_PATH = 'package.json';
const read = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const text = filePath => fs.readFileSync(filePath, 'utf8');

const contract = read(CONTRACT_PATH);
const predecessor = read(contract.supersedes);
const workflow = text(WORKFLOW_PATH);
const pkg = read(PACKAGE_PATH);
const d2 = read(contract.doctorRuntime.d2Contract);
const d3 = read(contract.doctorRuntime.d3Contract);
const d4 = read(contract.doctorRuntime.d4Contract);
const closeout = text(contract.doctorRuntime.closeoutRunner);
const d4Validator = text('scripts/validate-project-doctor-d4-v7.mjs');
const ownerValidator = text('scripts/validate-project-doctor-soldier-material-asset-owner.mjs');
const failures = [];
let checkCount = 0;
const check = (ok, id) => { checkCount += 1; if (!ok) failures.push(id); };

check(contract.schemaId === 'project-doctor-d7-pr-guard/v9' && contract.status === 'DESIGN_FROZEN', 'CONTRACT');
check(predecessor.schemaId === 'project-doctor-d7-pr-guard/v8' && predecessor.status === 'DESIGN_FROZEN', 'V8_PRESERVED');
check(contract.targetBaseBranch === 'main', 'BASE');
check(contract.permissions?.contents === 'read', 'READ_ONLY');
check(/^name:\s*Project Doctor PR Guard\s*$/m.test(workflow), 'WORKFLOW_NAME');
check(/\bpull_request:\s*\n/.test(workflow) && !/\bpull_request_target:\s*\n/.test(workflow), 'SAFE_EVENT');
check(/permissions:\s*\n\s*contents:\s*read/m.test(workflow) && !/contents:\s*write/.test(workflow), 'WORKFLOW_PERMISSIONS');
check(workflow.includes('github.event.pull_request.base.ref') && workflow.includes('github.event.pull_request.head.sha'), 'REAL_DIFF');
check(!workflow.includes('doctor:freshness:refresh'), 'NO_WORKFLOW_RESEAL');

const exitPolicy = contract.requiredCheckExitPolicy ?? {};
check(Array.isArray(exitPolicy.passingExitCodes) && exitPolicy.passingExitCodes.length === 1 && exitPolicy.passingExitCodes[0] === 0, 'ONLY_EXIT_ZERO_PASSES');
check(exitPolicy.manualReviewExitCode === 3 && exitPolicy.manualReviewIsPassing === false, 'MANUAL_REVIEW_NON_PASSING');
check(d4Validator.includes("assert.equal(manualResult.exitCode, 3)"), 'D4_EXIT3_FIXTURE');

check(d2.schemaId === 'project-doctor-d2-impact-contract/v7', 'D2_V7');
check(d3.schemaId === 'project-doctor-d3-validator-plan/v7', 'D3_V7');
check(d4.schemaId === 'project-doctor-d4-execution/v7', 'D4_V7');
check(d2.extends === 'data/contracts/project-doctor-d2-impact-contract.v6.json', 'D2_PREDECESSOR');
check(d3.extends === 'data/contracts/project-doctor-d3-validator-plan.v6.json', 'D3_PREDECESSOR');
check(d4.extends === 'data/contracts/project-doctor-d4-execution.v6.json', 'D4_PREDECESSOR');
check((d3.addedCheckCatalog ?? []).some(item => item.id === 'soldier-training-material-assets-final' && item.command === 'npm run validate:soldier-training-material-assets-final'), 'A7_CHECK_CATALOG');
check((d4.addedAllowedCheckIds ?? []).includes('soldier-training-material-assets-final'), 'A7_D4_ALLOW');
check(ownerValidator.includes("A6_MANIFEST_BLOB = '69af732325de4ddcb0c2ca3bedc5eac9da8edee0'"), 'A6_FROZEN_BLOB');
check(ownerValidator.includes('getSoldierTrainingMaterialIconUrl(material.itemId)'), 'A7_ITEMID_CONSUMER_GUARD');

check(pkg.scripts?.doctor === 'node scripts/run-project-doctor-closeout-v7.mjs', 'DOCTOR_V7');
check(pkg.scripts?.['doctor:impact'] === 'node scripts/analyze-project-doctor-d2-impact-v7.mjs', 'IMPACT_V7');
check(pkg.scripts?.['doctor:impact:validate'] === 'node scripts/validate-project-doctor-d2-impact-v7.mjs', 'IMPACT_TEST_V7');
check(pkg.scripts?.['doctor:plan'] === 'node scripts/plan-project-doctor-d3-v7.mjs --contract data/contracts/project-doctor-d3-validator-plan.v7.json', 'PLAN_V7');
check(pkg.scripts?.['doctor:plan:validate'] === 'node scripts/validate-project-doctor-d3-v7.mjs', 'PLAN_TEST_V7');
check(pkg.scripts?.['doctor:run'] === 'node scripts/run-project-doctor-d4-v7.mjs', 'RUN_V7');
check(pkg.scripts?.['doctor:run:validate'] === 'node scripts/validate-project-doctor-d4-v7.mjs', 'RUN_TEST_V7');
check(pkg.scripts?.['validate:soldier-training-material-assets-final'] === 'node scripts/validate-project-doctor-soldier-material-asset-owner.mjs', 'A7_VALIDATOR_ALIAS');
check(pkg.scripts?.['doctor:pr-guard:validate'] === 'node scripts/validate-project-doctor-d7-v9.mjs', 'D7_V9');
check(closeout.includes("script: 'scripts/run-project-doctor-d4-v7.mjs'"), 'CLOSEOUT_V7');

const output = {
  version: 9,
  schemaId: 'project-doctor-d7-validation-result/v9',
  status: failures.length ? 'FAIL_PROJECT_DOCTOR_D7_GUARD_V9' : 'PASS_PROJECT_DOCTOR_D7_GUARD_V9',
  exitCode: failures.length ? 1 : 0,
  checkCount,
  failureCount: failures.length,
  failures,
};
console.log(JSON.stringify(output, null, 2));
process.exitCode = output.exitCode;
