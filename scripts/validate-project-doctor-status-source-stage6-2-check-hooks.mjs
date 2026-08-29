import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bridgeStatusSource } from './bridge-project-doctor-status-source.mjs';
import { preflightEffectiveDomain } from './promote-project-doctor-status-source.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-status-source-stage6-2-check-hooks.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

const contract = readJson(CONTRACT_PATH);
const ownerResolution = readJson(contract.ownerResolutionContract);
const bridgeContract = readJson(contract.bridgeContract);
const registry = readJson(contract.activeRegistry);
const checks = [];
const pass = (id, detail = null) => checks.push({ id, pass: true, ...(detail === null ? {} : { detail }) });
const fail = (id, detail) => checks.push({ id, pass: false, detail });

const stepBlock = (workflow, name) => {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  if (start < 0) return null;
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
};

if (contract.status === 'DESIGN_FROZEN') pass('CONTRACT_FROZEN');
else fail('CONTRACT_FROZEN', contract.status);

if (contract.policy?.hookMode === 'CHECK_ONLY' && contract.policy?.automaticApplyEnabled === false) {
  pass('CHECK_ONLY_POLICY');
} else {
  fail('CHECK_ONLY_POLICY', contract.policy);
}

for (const pipeline of contract.pipelines ?? []) {
  const token = pipeline.pipelineId.toUpperCase().replaceAll('-', '_');
  const owner = (ownerResolution.pipelines ?? []).find(item => item.pipelineId === pipeline.pipelineId);
  const bridge = (bridgeContract.pipelines ?? []).find(item => item.id === pipeline.pipelineId);

  if (
    owner
    && owner.producerId === pipeline.producerId
    && owner.activeEntryId === pipeline.activeEntryId
    && owner.activeSourcePath === pipeline.activeSourcePath
    && owner.completionWorkflow?.path === pipeline.workflowPath
    && owner.completionWorkflow?.frozenVerificationStep === pipeline.frozenVerificationStep
    && owner.completionWorkflow?.automationHookPoint === 'AFTER_FROZEN_OUTPUT_VERIFICATION_SUCCESS'
  ) pass(`OWNER_RESOLUTION_${token}`);
  else fail(`OWNER_RESOLUTION_${token}`, { owner, pipeline });

  if (
    bridge
    && bridge.producerId === pipeline.producerId
    && bridge.baselineEntryId === pipeline.activeEntryId
    && bridge.baselineSourcePath === pipeline.activeSourcePath
  ) pass(`STAGE5_BINDING_${token}`);
  else fail(`STAGE5_BINDING_${token}`, { bridge, pipeline });

  const workflow = fs.readFileSync(pipeline.workflowPath, 'utf8');
  const verifyMarker = `      - name: ${pipeline.frozenVerificationStep}`;
  const hookMarker = `      - name: ${pipeline.hookStep}`;
  const verifyIndex = workflow.indexOf(verifyMarker);
  const hookIndex = workflow.indexOf(hookMarker);
  if (verifyIndex >= 0 && hookIndex > verifyIndex) pass(`HOOK_AFTER_FROZEN_VERIFY_${token}`);
  else fail(`HOOK_AFTER_FROZEN_VERIFY_${token}`, { verifyIndex, hookIndex });

  const hook = stepBlock(workflow, pipeline.hookStep);
  if (hook && hook.includes(`run: ${pipeline.hookCommand}`) && hook.includes('--check') && !hook.includes('--apply')) {
    pass(`HOOK_COMMAND_CHECK_ONLY_${token}`);
  } else {
    fail(`HOOK_COMMAND_CHECK_ONLY_${token}`, hook);
  }

  if (
    hook
    && hook.includes('if: success()')
    && hook.includes("github.event_name == 'pull_request'")
    && (hook.includes("github.ref == 'refs/heads/main'") || hook.includes("github.ref_name == 'main'"))
  ) pass(`HOOK_GUARD_${token}`);
  else fail(`HOOK_GUARD_${token}`, hook);

  const source = readJson(pipeline.activeSourcePath);
  const stateMismatches = Object.entries(pipeline.expectedSourceState ?? {})
    .filter(([key, expected]) => source[key] !== expected)
    .map(([key, expected]) => ({ key, expected, actual: source[key] }));
  if (stateMismatches.length === 0) pass(`SOURCE_STATE_${token}`);
  else fail(`SOURCE_STATE_${token}`, stateMismatches);

  try {
    const result = bridgeStatusSource({ pipelineId: pipeline.pipelineId, check: true });
    const item = result.results?.[0];
    const promotion = item?.submission?.promotion;
    if (
      result.status === 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_CHECK'
      && result.pipelineCount === 1
      && item?.mode === 'CHECK_ONLY'
      && item?.submission?.delegatedToStage3 === true
      && promotion?.writePerformed === false
    ) pass(`LIVE_CHECK_ONLY_${token}`, { promotionStatus: promotion.status });
    else fail(`LIVE_CHECK_ONLY_${token}`, result);
  } catch (error) {
    fail(`LIVE_CHECK_ONLY_${token}`, error instanceof Error ? error.message : String(error));
  }
}

try {
  const heroSpec = registry.effectiveDomains?.hero;
  const result = heroSpec ? preflightEffectiveDomain(heroSpec) : { pass: false, failures: [{ type: 'HERO_EFFECTIVE_DOMAIN_MISSING' }] };
  if (result.pass && result.selected?.rawStatus === 'PASS_WITH_REVIEW') {
    pass('REVIEW_STATUS_PRESERVED_AND_ACCEPTED', { rawStatus: result.selected.rawStatus });
  } else {
    fail('REVIEW_STATUS_PRESERVED_AND_ACCEPTED', result);
  }
} catch (error) {
  fail('REVIEW_STATUS_PRESERVED_AND_ACCEPTED', error instanceof Error ? error.message : String(error));
}

{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-status-stage6-2-'));
  try {
    const heroSpec = clone(registry.effectiveDomains?.hero);
    if (!heroSpec) throw new Error('Hero effective domain is missing.');
    const source = clone(readJson(heroSpec.primaryStatusSource));
    source.status = 'FAIL';
    const failSource = path.join(tempDir, 'hero-fail.v1.json');
    fs.writeFileSync(failSource, `${JSON.stringify(source, null, 2)}\n`);
    heroSpec.primaryStatusSource = failSource;
    const result = preflightEffectiveDomain(heroSpec);
    if (!result.pass && result.failures.some(item => item.type === 'D1_STATUS_NOT_ACCEPTED')) {
      pass('FAIL_STATUS_BLOCKED_BY_D1_PREFLIGHT');
    } else {
      fail('FAIL_STATUS_BLOCKED_BY_D1_PREFLIGHT', result);
    }
  } catch (error) {
    fail('FAIL_STATUS_BLOCKED_BY_D1_PREFLIGHT', error instanceof Error ? error.message : String(error));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const projectStatusWorkflow = fs.readFileSync(contract.projectStatusWorkflow, 'utf8');
for (const pipeline of contract.pipelines ?? []) {
  if (projectStatusWorkflow.includes(`- '${pipeline.workflowPath}'`)) {
    pass(`PROJECT_STATUS_WATCHES_${pipeline.pipelineId.toUpperCase()}`);
  } else {
    fail(`PROJECT_STATUS_WATCHES_${pipeline.pipelineId.toUpperCase()}`, pipeline.workflowPath);
  }
}
if (projectStatusWorkflow.includes('Validate Stage 6-2 check-only completion hooks')
  && projectStatusWorkflow.includes('node scripts/validate-project-doctor-status-source-stage6-2-check-hooks.mjs')) {
  pass('PROJECT_STATUS_RUNS_STAGE6_2_VALIDATOR');
} else {
  fail('PROJECT_STATUS_RUNS_STAGE6_2_VALIDATOR', contract.projectStatusWorkflow);
}

const failed = checks.filter(item => !item.pass);
const summary = {
  version: 1,
  schemaId: 'project-doctor-status-source-stage6-2-check-hooks-validation/v1',
  stage: 'PROJECT-STATUS-STAGE6-2',
  status: failed.length === 0 ? 'PASS_STATUS_SOURCE_STAGE6_2_CHECK_HOOKS' : 'FAIL_STATUS_SOURCE_STAGE6_2_CHECK_HOOKS',
  completion: failed.length === 0 ? 'COMPLETE' : 'BLOCKED',
  checkCount: checks.length,
  passedCount: checks.length - failed.length,
  failedCount: failed.length,
  checks,
  boundaries: {
    automaticApplyEnabled: false,
    statusSourceMutation: false,
    rawConfigDataRead: false,
    semanticRecomputation: false,
    canonicalJoinRecomputation: false
  }
};

console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exitCode = 1;
