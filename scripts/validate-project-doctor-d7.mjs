import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_D7_CONTRACT_PATH = 'data/contracts/project-doctor-d7-pr-guard.v1.json';
const WORKFLOW_PATH = '.github/workflows/project-doctor-d7-pr-guard.yml';
const D2_IMPACT_CONTRACT_PATH = 'data/contracts/project-doctor-d2-impact-contract.v1.json';
const PACKAGE_PATH = 'package.json';
const PROMOTION_V1_PATHS = [
  'data/contracts/regression-coverage-promotion.v1.json',
  'data/validation/regression-coverage-promotion-summary.v1.json',
  'scripts/validate-regression-coverage-promotion.mjs',
];

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const readText = filePath => fs.readFileSync(filePath, 'utf8');
const sameSet = (actual, expected) => actual.length === expected.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);

export const validateD7 = ({
  contract = readJson(DEFAULT_D7_CONTRACT_PATH),
  workflowText = readText(WORKFLOW_PATH),
  d2ImpactContract = readJson(D2_IMPACT_CONTRACT_PATH),
  packageJson = readJson(PACKAGE_PATH),
} = {}) => {
  const failures = [];
  let checkCount = 0;
  const check = (condition, code) => { checkCount += 1; if (!condition) failures.push(code); };

  check(contract.stage === 'D7', 'CONTRACT_STAGE');
  check(contract.status === 'DESIGN_FROZEN', 'CONTRACT_STATUS');
  check(contract.targetBaseBranch === 'main', 'TARGET_BASE_MAIN');
  check(sameSet(contract.events?.pull_request?.types ?? [], ['opened', 'synchronize', 'reopened', 'ready_for_review']), 'PR_EVENT_TYPES');
  check(sameSet(contract.events?.pull_request?.branches ?? [], ['main']), 'PR_TARGET_BRANCH');
  check(contract.events?.pullRequestTargetForbidden === true, 'PULL_REQUEST_TARGET_FORBIDDEN_CONTRACT');
  check(contract.permissions?.contents === 'read', 'CONTENTS_READ_CONTRACT');
  check(contract.changedFilePolicy?.useRealChangedFiles === true && contract.changedFilePolicy?.representativePathOverride === false, 'REAL_DIFF_CONTRACT');
  check(contract.changedFilePolicy?.manualReviewMustFailWorkflow === true && contract.changedFilePolicy?.manualReviewExitCode === 3, 'MANUAL_REVIEW_FAIL_CLOSED');
  check(contract.changedFilePolicy?.staleEventBaseShaForbidden === true, 'STALE_EVENT_BASE_SHA_FORBIDDEN');
  check(contract.securityPolicy?.freshnessRefreshInWorkflow === false && contract.securityPolicy?.repositoryWritePermission === false, 'NO_RESEAL_NO_WRITE_CONTRACT');

  check(/^name:\s*Project Doctor PR Guard\s*$/m.test(workflowText), 'WORKFLOW_NAME');
  check(/\bpull_request:\s*\n/.test(workflowText) && !/\bpull_request_target:\s*\n/.test(workflowText), 'SAFE_PR_EVENT');
  check(/branches:\s*\n\s*- main/m.test(workflowText), 'WORKFLOW_MAIN_TARGET');
  check(/permissions:\s*\n\s*contents:\s*read/m.test(workflowText) && !/contents:\s*write/.test(workflowText), 'WORKFLOW_READ_ONLY');
  check(/fetch-depth:\s*0/.test(workflowText), 'FULL_HISTORY_CHECKOUT');
  check(workflowText.includes('github.event.pull_request.base.ref') && workflowText.includes('github.event.pull_request.head.sha'), 'PR_LIVE_BASE_REF_COMPARISON');
  check(workflowText.includes('git fetch --no-tags origin') && workflowText.includes('origin/${{ github.event.pull_request.base.ref }}'), 'PR_BASE_FETCHED_AT_RUNTIME');
  check(!workflowText.includes('github.event.pull_request.base.sha'), 'STALE_PR_BASE_SHA_NOT_USED');
  check(workflowText.includes('origin/main') && workflowText.includes('DOCTOR_BASE') && workflowText.includes('DOCTOR_HEAD'), 'PUSH_PROOF_COMPARISON');
  check(!workflowText.includes('doctor:freshness:refresh'), 'NO_FRESHNESS_REFRESH_COMMAND');
  check(workflowText.includes('npm run doctor:pr-guard:validate'), 'D7_SELF_TEST_STEP');
  check(workflowText.includes('npm run doctor:freshness:validate'), 'FRESHNESS_GUARD_STEP');
  check(workflowText.includes('npm run doctor:status'), 'D1_REGENERATION_STEP');
  check(workflowText.includes('git diff --exit-code -- data/generated/project-doctor-d1-1-status.v1.json'), 'D1_DETERMINISM_STEP');
  check(workflowText.includes('npm run doctor -- --dry-run --base "$DOCTOR_BASE" --head "$DOCTOR_HEAD"'), 'REAL_DIFF_DRY_RUN_STEP');
  check(workflowText.includes('npm run doctor -- --base "$DOCTOR_BASE" --head "$DOCTOR_HEAD"'), 'REAL_DIFF_EXECUTION_STEP');

  const workflowOverlay = (d2ImpactContract.pathRuleOverlays ?? []).find(rule =>
    (rule.patterns ?? []).includes('.github/workflows/project-doctor-*.yml'));
  check(Boolean(workflowOverlay), 'D2_WORKFLOW_MAPPING_PRESENT');
  check(sameSet(workflowOverlay?.directNodes ?? [], ['project-doctor']), 'D2_WORKFLOW_MAPPING_NODE');

  const promotionOverlay = (d2ImpactContract.pathRuleOverlays ?? []).find(rule => rule.id === 'regression-coverage-promotion-v1-meta-contract');
  check(Boolean(promotionOverlay), 'D2_PROMOTION_V1_MAPPING_PRESENT');
  check(sameSet(promotionOverlay?.patterns ?? [], PROMOTION_V1_PATHS), 'D2_PROMOTION_V1_MAPPING_PATHS');
  check(sameSet(promotionOverlay?.directNodes ?? [], ['project-doctor']), 'D2_PROMOTION_V1_MAPPING_NODE');
  check(workflowText.includes('Validate Regression Coverage Promotion V1 admission'), 'PROMOTION_V1_ADMISSION_STEP');
  check(workflowText.includes('node scripts/validate-regression-coverage-promotion.mjs'), 'PROMOTION_V1_VALIDATOR_COMMAND');
  check(PROMOTION_V1_PATHS.every(value => workflowText.includes(value)), 'PROMOTION_V1_EXACT_PATH_GATE');
  check(packageJson.scripts?.['doctor:pr-guard:validate'] === 'node scripts/validate-project-doctor-d7.mjs', 'PACKAGE_COMMAND');

  return {
    version: 1,
    schemaId: 'project-doctor-d7-validation-result/v1',
    stage: 'D7',
    status: failures.length === 0 ? 'PASS_PROJECT_DOCTOR_D7_GUARD_CONTRACT' : 'FAIL_PROJECT_DOCTOR_D7_GUARD_CONTRACT',
    exitCode: failures.length === 0 ? 0 : 1,
    checkCount,
    failureCount: failures.length,
    failures,
  };
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = validateD7();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`[doctor:d7] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
