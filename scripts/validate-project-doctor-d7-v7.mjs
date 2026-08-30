import fs from 'node:fs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d7-pr-guard.v7.json';
const WORKFLOW_PATH = '.github/workflows/project-doctor-d7-pr-guard.yml';
const PACKAGE_PATH = 'package.json';
const CLOSEOUT_PATH = 'scripts/run-project-doctor-closeout-v5.mjs';
const D4_VALIDATOR_PATH = 'scripts/validate-project-doctor-d4-v5.mjs';
const ROUTING_CONTRACT_PATH = 'tools/asset-intake/contract/operational-routing.v1.json';
const read = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const text = filePath => fs.readFileSync(filePath, 'utf8');
const same = (a = [], b = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const contract = read(CONTRACT_PATH);
const workflow = text(WORKFLOW_PATH);
const pkg = read(PACKAGE_PATH);
const closeout = text(CLOSEOUT_PATH);
const d4Validator = text(D4_VALIDATOR_PATH);
const routing = read(ROUTING_CONTRACT_PATH);
const d2 = read(contract.doctorRuntime.d2Contract);
const d3 = read(contract.doctorRuntime.d3Contract);
const d4 = read(contract.doctorRuntime.d4Contract);
const failures = [];
let checkCount = 0;
const check = (ok, id) => { checkCount += 1; if (!ok) failures.push(id); };

check(contract.schemaId === 'project-doctor-d7-pr-guard/v7' && contract.status === 'DESIGN_FROZEN', 'CONTRACT');
check(contract.supersedes === 'data/contracts/project-doctor-d7-pr-guard.v6.json', 'SUPERSEDES');
check(contract.targetBaseBranch === 'main', 'BASE');
check(contract.permissions?.contents === 'read', 'READ_ONLY');
check(contract.securityPolicy?.freshnessRefreshInWorkflow === false, 'NO_RESEAL');
check(contract.boundaries?.d2D3D4RuntimeSemanticsChanged === false, 'D2_D3_D4_SEMANTICS_PRESERVED');
check(/^name:\s*Project Doctor PR Guard\s*$/m.test(workflow), 'WORKFLOW_NAME');
check(/\bpull_request:\s*\n/.test(workflow) && !/\bpull_request_target:\s*\n/.test(workflow), 'SAFE_EVENT');
check(/permissions:\s*\n\s*contents:\s*read/m.test(workflow) && !/contents:\s*write/.test(workflow), 'WORKFLOW_PERMISSIONS');
check(workflow.includes('github.event.pull_request.base.ref') && workflow.includes('github.event.pull_request.head.sha'), 'REAL_DIFF');
check(!workflow.includes('doctor:freshness:refresh'), 'NO_WORKFLOW_RESEAL');

const exitPolicy = contract.requiredCheckExitPolicy ?? {};
const passingExitCodes = new Set(exitPolicy.passingExitCodes ?? []);
check(
  passingExitCodes.size === 1
    && passingExitCodes.has(0)
    && exitPolicy.manualReviewExitCode === 3
    && exitPolicy.manualReviewIsPassing === false
    && exitPolicy.propagateDoctorExitCodeDirectly === true
    && contract.mergePolicy?.manualReviewIsNonPassing === true,
  'MANUAL_REVIEW_NON_PASSING_POLICY',
);
check(
  /- name: Integrated Doctor real-diff execution\s*\n\s*run: npm run doctor -- --base "\$DOCTOR_BASE" --head "\$DOCTOR_HEAD"/m.test(workflow),
  'DIRECT_DOCTOR_EXIT_PROPAGATION',
);
check(
  !workflow.includes('code=$?')
    && !workflow.includes('acceptable exit code')
    && !workflow.includes('"$code" -ne 3'),
  'NO_MANUAL_REVIEW_SWALLOW',
);
check(
  d4Validator.includes("run('SKIN_MANUAL_PRESERVED'")
    && d4Validator.includes("assert.equal(result.status, 'REVIEW_MANUAL')")
    && d4Validator.includes('assert.equal(result.exitCode, 3)'),
  'D4_MANUAL_EXIT_3_PRESERVED',
);

check(d2.schemaId === 'project-doctor-d2-impact-contract/v5', 'D2_V5');
check(d3.schemaId === 'project-doctor-d3-validator-plan/v5', 'D3_V5');
check(d4.schemaId === 'project-doctor-d4-execution/v5', 'D4_V5');
const overlay = d2.pathRuleOverlays.find(item => item.id === 'asset-intake-shared-tooling');
check(overlay?.changeClass === 'asset-intake-tooling' && same(overlay.directNodes, ['project-doctor']), 'ASSET_INTAKE_D2');
const intake = d3.checkCatalog.find(item => item.id === 'asset-intake-self-test');
check(intake?.command === 'npm run asset:intake:validate' && intake?.phase === 3 && same(intake.triggerChangeClasses, ['asset-intake-tooling']), 'ASSET_INTAKE_D3');
check((d4.allowedCheckIds ?? []).includes('asset-intake-self-test'), 'ASSET_INTAKE_D4_ALLOW');
check(same(Object.keys(d3.manualReviewNodes ?? {}), ['banner-assets', 'skin-assets']), 'MANUAL_BOUNDARY');
check(!(d3.admittedOwners ?? []).some(item => item.node === 'skin-assets'), 'NO_SKIN_OWNER_PROMOTION');

check(pkg.scripts?.['asset:intake'] === 'node tools/asset-intake/cli/run-v1.mjs', 'ASSET_INTAKE_ALIAS');
check(pkg.scripts?.['asset:intake:route'] === 'node tools/asset-intake/cli/run-v1.mjs route', 'ASSET_INTAKE_ROUTE_ALIAS');
check(pkg.scripts?.['asset:intake:validate'] === 'node tools/asset-intake/cli/validate-stage5-v1.mjs', 'ASSET_INTAKE_VALIDATE_ALIAS');
check(routing.schemaId === 'asset-intake-operational-routing/v1' && routing.status === 'DESIGN_FROZEN', 'ROUTING_CONTRACT');
check(routing.projectEvidencePolicy?.requiredFirst === true, 'PROJECT_EVIDENCE_FIRST');
check(routing.externalCandidatePolicy?.assetIntakePendingRequiredBeforeSearch === true, 'INTAKE_BEFORE_EXTERNAL');
check(routing.externalCandidatePolicy?.directExternalProductionUse === false, 'NO_DIRECT_EXTERNAL_USE');
check(routing.externalCandidatePolicy?.verifiedCandidateNextAction === 'INGEST_EXTERNAL_EVIDENCE_TO_ASSET_INTAKE', 'EXTERNAL_REINGEST');

check(pkg.scripts?.doctor === 'node scripts/run-project-doctor-closeout-v5.mjs', 'DOCTOR_CLOSEOUT_V5');
check(pkg.scripts?.['doctor:impact'] === 'node scripts/analyze-project-doctor-d2-impact.mjs --contract data/contracts/project-doctor-d2-impact-contract.v5.json', 'IMPACT_V5');
check(pkg.scripts?.['doctor:impact:validate'] === 'node scripts/validate-project-doctor-d2-impact-v5.mjs', 'IMPACT_TEST_V5');
check(pkg.scripts?.['doctor:plan'] === 'node scripts/plan-project-doctor-d3.mjs --contract data/contracts/project-doctor-d3-validator-plan.v5.json', 'PLAN_V5');
check(pkg.scripts?.['doctor:plan:validate'] === 'node scripts/validate-project-doctor-d3-v5.mjs', 'PLAN_TEST_V5');
check(pkg.scripts?.['doctor:run'] === 'node scripts/run-project-doctor-d4-v5.mjs', 'RUN_V5');
check(pkg.scripts?.['doctor:run:validate'] === 'node scripts/validate-project-doctor-d4-v5.mjs', 'RUN_TEST_V5');
check(pkg.scripts?.['doctor:pr-guard:validate'] === 'node scripts/validate-project-doctor-d7-v7.mjs', 'D7_V7');
check(closeout.includes("script: 'scripts/validate-project-doctor-d4-v5.mjs'") && closeout.includes("script: 'scripts/run-project-doctor-d4-v5.mjs'"), 'CLOSEOUT_CONTENT_V5');

const output = {
  version: 7,
  schemaId: 'project-doctor-d7-validation-result/v7',
  status: failures.length ? 'FAIL_PROJECT_DOCTOR_D7_GUARD_V7' : 'PASS_PROJECT_DOCTOR_D7_GUARD_V7',
  exitCode: failures.length ? 1 : 0,
  checkCount,
  failureCount: failures.length,
  failures,
};
console.log(JSON.stringify(output, null, 2));
process.exitCode = output.exitCode;
