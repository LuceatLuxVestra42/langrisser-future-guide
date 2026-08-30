import fs from 'node:fs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d7-pr-guard.v8.json';
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
const d4Validator = text('scripts/validate-project-doctor-d4-v6.mjs');
const failures = [];
let checkCount = 0;
const check = (ok, id) => { checkCount += 1; if (!ok) failures.push(id); };

check(contract.schemaId === 'project-doctor-d7-pr-guard/v8' && contract.status === 'DESIGN_FROZEN', 'CONTRACT');
check(predecessor.schemaId === 'project-doctor-d7-pr-guard/v7' && predecessor.status === 'DESIGN_FROZEN', 'V7_PRESERVED');
check(contract.targetBaseBranch === 'main', 'BASE');
check(contract.permissions?.contents === 'read', 'READ_ONLY');
check(contract.securityPolicy?.freshnessRefreshInWorkflow === false, 'NO_RESEAL');
check(/^name:\s*Project Doctor PR Guard\s*$/m.test(workflow), 'WORKFLOW_NAME');
check(/\bpull_request:\s*\n/.test(workflow) && !/\bpull_request_target:\s*\n/.test(workflow), 'SAFE_EVENT');
check(/permissions:\s*\n\s*contents:\s*read/m.test(workflow) && !/contents:\s*write/.test(workflow), 'WORKFLOW_PERMISSIONS');
check(workflow.includes('github.event.pull_request.base.ref') && workflow.includes('github.event.pull_request.head.sha'), 'REAL_DIFF');
check(!workflow.includes('doctor:freshness:refresh'), 'NO_WORKFLOW_RESEAL');

const exitPolicy = contract.requiredCheckExitPolicy ?? {};
check(Array.isArray(exitPolicy.passingExitCodes) && exitPolicy.passingExitCodes.length === 1 && exitPolicy.passingExitCodes[0] === 0, 'ONLY_EXIT_ZERO_PASSES');
check(exitPolicy.manualReviewExitCode === 3 && exitPolicy.manualReviewIsPassing === false, 'MANUAL_REVIEW_NON_PASSING');
check(exitPolicy.propagateDoctorExitCodeDirectly === true, 'DIRECT_EXIT_PROPAGATION');
check(!workflow.includes('code=$?') && !workflow.includes('acceptable exit code') && !workflow.includes('"$code" -ne 3'), 'NO_EXIT3_SWALLOW');
check(d4Validator.includes("MANUAL_REVIEW_EXIT_3_PRESERVED") && d4Validator.includes("assert.equal(result.exitCode, 3)"), 'D4_EXIT3_FIXTURE');

check(d2.schemaId === 'project-doctor-d2-impact-contract/v6', 'D2_V6');
check(d3.schemaId === 'project-doctor-d3-validator-plan/v6', 'D3_V6');
check(d4.schemaId === 'project-doctor-d4-execution/v6', 'D4_V6');
check(d2.extends === 'data/contracts/project-doctor-d2-impact-contract.v5.json', 'D2_V5_PREDECESSOR');
check(d3.extends === 'data/contracts/project-doctor-d3-validator-plan.v5.json', 'D3_V5_PREDECESSOR');
check(d4.extends === 'data/contracts/project-doctor-d4-execution.v5.json', 'D4_V5_PREDECESSOR');
check(d3.freshnessV2Classification?.enabled === true && d3.freshnessV2Classification?.semanticChangeKeepsCandidateOwner === true, 'FRESHNESS_CLASSIFICATION');
check(d3.freshnessV2Classification?.provenanceOnlyOwningNode === 'project-doctor', 'PROVENANCE_OWNER');
check((d3.addedCheckCatalog ?? []).some(item => item.id === 'frozen-freshness-v2-self-test' && item.command === 'npm run doctor:freshness:v2:self-test'), 'FRESHNESS_SELF_TEST_CATALOG');
check((d4.addedAllowedCheckIds ?? []).includes('frozen-freshness-v2-self-test'), 'FRESHNESS_D4_ALLOW');

check(pkg.scripts?.doctor === 'node scripts/run-project-doctor-closeout-v6.mjs', 'DOCTOR_V6');
check(pkg.scripts?.['doctor:impact'] === 'node scripts/analyze-project-doctor-d2-impact-v6.mjs', 'IMPACT_V6');
check(pkg.scripts?.['doctor:impact:validate'] === 'node scripts/validate-project-doctor-d2-impact-v6.mjs', 'IMPACT_TEST_V6');
check(pkg.scripts?.['doctor:plan'] === 'node scripts/plan-project-doctor-d3-v6.mjs --contract data/contracts/project-doctor-d3-validator-plan.v6.json', 'PLAN_V6');
check(pkg.scripts?.['doctor:plan:validate'] === 'node scripts/validate-project-doctor-d3-v6.mjs', 'PLAN_TEST_V6');
check(pkg.scripts?.['doctor:run'] === 'node scripts/run-project-doctor-d4-v6.mjs', 'RUN_V6');
check(pkg.scripts?.['doctor:run:validate'] === 'node scripts/validate-project-doctor-d4-v6.mjs', 'RUN_TEST_V6');
check(pkg.scripts?.['doctor:freshness:v2:self-test'] === 'node scripts/validate-project-doctor-frozen-freshness-v2.mjs', 'FRESHNESS_ALIAS');
check(pkg.scripts?.['doctor:pr-guard:validate'] === 'node scripts/validate-project-doctor-d7-v8.mjs', 'D7_V8');
check(closeout.includes("script: 'scripts/validate-project-doctor-frozen-freshness-v2.mjs'") && closeout.includes("script: 'scripts/run-project-doctor-d4-v6.mjs'"), 'CLOSEOUT_V6');

const output = {
  version: 8,
  schemaId: 'project-doctor-d7-validation-result/v8',
  status: failures.length ? 'FAIL_PROJECT_DOCTOR_D7_GUARD_V8' : 'PASS_PROJECT_DOCTOR_D7_GUARD_V8',
  exitCode: failures.length ? 1 : 0,
  checkCount,
  failureCount: failures.length,
  failures,
};
console.log(JSON.stringify(output, null, 2));
process.exitCode = output.exitCode;
