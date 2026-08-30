import assert from 'node:assert/strict';
import { executePlan } from './run-project-doctor-d4.mjs';
import { createPlanV7 } from './plan-project-doctor-d3-v7.mjs';
import { loadProjectDoctorD4V7Context } from './run-project-doctor-d4-v7.mjs';

const context = loadProjectDoctorD4V7Context();
const failures = [];

if (context.delta.extends !== 'data/contracts/project-doctor-d4-execution.v6.json') failures.push('PREDECESSOR');
if (context.predecessor.schemaId !== 'project-doctor-d4-execution/v6') failures.push('V6_PRESERVATION');
if (!(context.contract.allowedCheckIds ?? []).includes('soldier-training-material-assets-final')) failures.push('A7_ALLOWLIST');

const plan = createPlanV7({
  contractPath: 'data/contracts/project-doctor-d3-validator-plan.v7.json',
  mode: 'paths',
  base: 'main',
  head: 'HEAD',
  paths: ['public/images/soldier-training-materials-webp/6003.webp'],
}, { context: context.d3Context });
const result = executePlan({
  plan,
  d3Contract: context.d3Context.contract,
  d4Contract: context.contract,
  dryRun: false,
  executor: () => ({ status: 0, error: null }),
});
if (result.status !== 'PASS_EXECUTED' || result.exitCode !== 0) failures.push('A7_EXECUTION');
if (!result.executions.some(item => item.id === 'soldier-training-material-assets-final')) failures.push('A7_CHECK_NOT_EXECUTED');

const manualPlan = createPlanV7({
  contractPath: 'data/contracts/project-doctor-d3-validator-plan.v7.json',
  mode: 'paths',
  base: 'main',
  head: 'HEAD',
  paths: ['totally-unmapped.future'],
}, { context: context.d3Context });
const manualResult = executePlan({
  plan: manualPlan,
  d3Contract: context.d3Context.contract,
  d4Contract: context.contract,
  dryRun: false,
  executor: () => ({ status: 0, error: null }),
});
try {
  assert.equal(manualResult.status, 'REVIEW_MANUAL');
  assert.equal(manualResult.exitCode, 3);
} catch {
  failures.push('MANUAL_REVIEW_EXIT_3_PRESERVED');
}

const pass = failures.length === 0;
console.log(JSON.stringify({
  version: 7,
  schemaId: 'project-doctor-d4-summary/v7',
  status: pass ? 'PASS_PROJECT_DOCTOR_D4_EXECUTION_V7' : 'FAIL_PROJECT_DOCTOR_D4_EXECUTION_V7',
  a7PlanStatus: plan.status,
  a7RunStatus: result.status,
  manualReviewStatus: manualResult.status,
  manualReviewExitCode: manualResult.exitCode,
  failures,
}, null, 2));
if (!pass) process.exitCode = 1;
