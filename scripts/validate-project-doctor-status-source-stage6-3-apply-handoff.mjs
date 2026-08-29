import fs from 'node:fs';
import { handoffStatusSource } from './apply-project-doctor-status-source-handoff.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-status-source-stage6-3-apply-handoff.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const contract = readJson(CONTRACT_PATH);
const stage6_2 = readJson(contract.stage6_2Contract);
const bridgeContract = readJson(contract.bridgeContract);
const checks = [];
const pass = (id, detail = null) => checks.push({ id, pass: true, ...(detail === null ? {} : { detail }) });
const fail = (id, detail) => checks.push({ id, pass: false, detail });

if (contract.status === 'DESIGN_FROZEN') pass('CONTRACT_FROZEN');
else fail('CONTRACT_FROZEN', contract.status);

if ((contract.pipelines ?? []).map(item => item.pipelineId).sort().join(',') === 'hero,soldier') {
  pass('PIPELINES_EXACT_HERO_SOLDIER');
} else {
  fail('PIPELINES_EXACT_HERO_SOLDIER', contract.pipelines);
}

for (const pipeline of contract.pipelines ?? []) {
  const stage6Pipeline = (stage6_2.pipelines ?? []).find(item => item.pipelineId === pipeline.pipelineId);
  const bridgePipeline = (bridgeContract.pipelines ?? []).find(item => item.id === pipeline.pipelineId);
  if (stage6Pipeline?.producerId === pipeline.producerId && stage6Pipeline?.workflowPath === pipeline.completionWorkflow) {
    pass(`STAGE6_2_BINDING_${pipeline.pipelineId.toUpperCase()}`);
  } else {
    fail(`STAGE6_2_BINDING_${pipeline.pipelineId.toUpperCase()}`, { stage6Pipeline, pipeline });
  }
  if (bridgePipeline?.domain === pipeline.domain && bridgePipeline?.producerId === pipeline.producerId) {
    pass(`STAGE5_BINDING_${pipeline.pipelineId.toUpperCase()}`);
  } else {
    fail(`STAGE5_BINDING_${pipeline.pipelineId.toUpperCase()}`, { bridgePipeline, pipeline });
  }

  const completionWorkflow = fs.readFileSync(pipeline.completionWorkflow, 'utf8');
  const hookStep = stage6Pipeline?.hookStep;
  const hookIndex = hookStep ? completionWorkflow.indexOf(`      - name: ${hookStep}`) : -1;
  const hookBlock = hookIndex >= 0
    ? completionWorkflow.slice(hookIndex, completionWorkflow.indexOf('\n      - name:', hookIndex + 1) < 0 ? completionWorkflow.length : completionWorkflow.indexOf('\n      - name:', hookIndex + 1))
    : '';
  if (hookBlock.includes('--check') && !hookBlock.includes('--apply')) {
    pass(`COMPLETION_HOOK_REMAINS_CHECK_ONLY_${pipeline.pipelineId.toUpperCase()}`);
  } else {
    fail(`COMPLETION_HOOK_REMAINS_CHECK_ONLY_${pipeline.pipelineId.toUpperCase()}`, hookBlock);
  }
}

const workflow = fs.readFileSync(contract.workflowPath, 'utf8');
const workflowRequirements = [
  ['WORKFLOW_DISPATCH_ONLY_ENTRY', 'workflow_dispatch:'],
  ['WORKFLOW_PIPELINE_INPUT', 'pipeline:'],
  ['WORKFLOW_EXPECTED_PREDECESSOR_INPUT', 'expected_predecessor:'],
  ['WORKFLOW_ENTRY_ID_INPUT', 'entry_id:'],
  ['WORKFLOW_SOURCE_PATH_INPUT', 'source_path:'],
  ['WORKFLOW_REJECTS_MAIN', "github.ref_name == 'main'"],
  ['WORKFLOW_RUNS_SELF_TEST', 'validate-project-doctor-status-source-stage6-3-apply-handoff.mjs'],
  ['WORKFLOW_RUNS_PREVIEW', '--check'],
  ['WORKFLOW_RUNS_APPLY', '--apply'],
  ['WORKFLOW_PASSES_CAS', '--expected-predecessor'],
  ['WORKFLOW_VALIDATES_D5', 'doctor:freshness:validate'],
  ['WORKFLOW_VALIDATES_PROJECT_STATUS', 'build-project-status.mjs --check'],
  ['WORKFLOW_REJECTS_UNEXPECTED_MUTATIONS', 'Reject unexpected working-tree mutations'],
  ['WORKFLOW_COMMITS_D5_MANIFEST', 'data/generated/project-doctor-d5-freshness.v1.json'],
  ['WORKFLOW_PUSHES_WORK_BRANCH', 'git push origin HEAD:"${GITHUB_REF_NAME}"'],
];
for (const [id, needle] of workflowRequirements) {
  if (workflow.includes(needle)) pass(id);
  else fail(id, needle);
}

const makeRuntime = ({
  selected = 'hero-stage6-4-final',
  sourcePass = true,
  refreshPass = true,
  applyWrites = true,
  alreadyActive = false,
} = {}) => {
  let selectedId = selected;
  const state = {
    bridgeModes: [],
    refreshCount: 0,
    validateCount: 0,
    projectStatusCount: 0,
    snapshotCount: 0,
    restoreCount: 0,
  };
  const runtime = {
    contract,
    stage6_2,
    bridgeContract,
    verifyCommittedSource: sourcePath => sourcePass
      ? { pass: true, sourcePath }
      : { pass: false, reason: 'SOURCE_NOT_COMMITTED_AT_HEAD', sourcePath },
    loadRegistry: () => ({ domains: { hero: { selectedId }, soldier: { selectedId: 'soldier-stage6-7-site-admission' } } }),
    bridge: options => {
      state.bridgeModes.push(options.check ? 'CHECK_ONLY' : 'APPLY');
      if (!options.check) selectedId = options.entryId;
      return {
        pipelineCount: 1,
        status: options.check ? 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_CHECK' : 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_APPLY',
        results: [{
          entryId: options.entryId,
          mode: options.check ? 'CHECK_ONLY' : 'APPLY',
          submission: {
            promotion: {
              writePerformed: options.check ? false : applyWrites,
              alreadyActive: options.check ? false : alreadyActive,
            },
          },
        }],
      };
    },
    refresh: () => {
      state.refreshCount += 1;
      return refreshPass
        ? { status: 'PASS_PROJECT_DOCTOR_D5_REFRESH', exitCode: 0 }
        : { status: 'FAIL_PROJECT_DOCTOR_D5_REFRESH', exitCode: 4 };
    },
    validateFreshness: () => {
      state.validateCount += 1;
      return { status: 'FRESH', exitCode: 0 };
    },
    projectStatusCheck: () => {
      state.projectStatusCount += 1;
      return { pass: true, exitCode: 0 };
    },
    snapshot: () => {
      state.snapshotCount += 1;
      return { fixture: true };
    },
    restore: () => {
      state.restoreCount += 1;
    },
  };
  return { runtime, state, selectedId: () => selectedId };
};

{
  const fixture = makeRuntime();
  try {
    const result = handoffStatusSource({
      pipelineId: 'hero',
      expectedPredecessorId: 'hero-stage6-4-final',
      entryId: 'hero-next-final',
      sourcePath: 'data/validation/hero-next-final.v1.json',
      check: true,
    }, fixture.runtime);
    if (
      result.status === 'PASS_STATUS_SOURCE_STAGE6_3_HANDOFF_CHECK'
      && result.writePerformed === false
      && fixture.state.bridgeModes.join(',') === 'CHECK_ONLY'
      && fixture.state.refreshCount === 0
      && fixture.state.snapshotCount === 0
    ) pass('CHECK_MODE_ZERO_APPLY_ZERO_RESEAL');
    else fail('CHECK_MODE_ZERO_APPLY_ZERO_RESEAL', { result, state: fixture.state });
  } catch (error) {
    fail('CHECK_MODE_ZERO_APPLY_ZERO_RESEAL', error instanceof Error ? error.message : String(error));
  }
}

{
  const fixture = makeRuntime();
  try {
    handoffStatusSource({
      pipelineId: 'hero',
      expectedPredecessorId: 'stale-predecessor',
      entryId: 'hero-next-final',
      sourcePath: 'data/validation/hero-next-final.v1.json',
      check: true,
    }, fixture.runtime);
    fail('STALE_PREDECESSOR_BLOCKS_BEFORE_BRIDGE', 'unexpected pass');
  } catch (error) {
    if (String(error).includes('CAS predecessor mismatch') && fixture.state.bridgeModes.length === 0) {
      pass('STALE_PREDECESSOR_BLOCKS_BEFORE_BRIDGE');
    } else {
      fail('STALE_PREDECESSOR_BLOCKS_BEFORE_BRIDGE', { error: String(error), state: fixture.state });
    }
  }
}

{
  const fixture = makeRuntime();
  try {
    const result = handoffStatusSource({
      pipelineId: 'hero',
      expectedPredecessorId: 'hero-stage6-4-final',
      entryId: 'hero-next-final',
      sourcePath: 'data/validation/hero-next-final.v1.json',
      check: false,
    }, fixture.runtime);
    if (
      result.status === 'PASS_STATUS_SOURCE_STAGE6_3_HANDOFF_APPLY'
      && fixture.state.bridgeModes.join(',') === 'CHECK_ONLY,APPLY'
      && fixture.selectedId() === 'hero-next-final'
      && fixture.state.refreshCount === 1
      && fixture.state.validateCount === 1
      && fixture.state.projectStatusCount === 1
      && fixture.state.snapshotCount === 1
      && fixture.state.restoreCount === 0
    ) pass('VALID_APPLY_CHECKS_THEN_APPLIES_AND_RESEALS');
    else fail('VALID_APPLY_CHECKS_THEN_APPLIES_AND_RESEALS', { result, state: fixture.state, selected: fixture.selectedId() });
  } catch (error) {
    fail('VALID_APPLY_CHECKS_THEN_APPLIES_AND_RESEALS', error instanceof Error ? error.message : String(error));
  }
}

{
  const fixture = makeRuntime({ refreshPass: false });
  try {
    handoffStatusSource({
      pipelineId: 'hero',
      expectedPredecessorId: 'hero-stage6-4-final',
      entryId: 'hero-next-final',
      sourcePath: 'data/validation/hero-next-final.v1.json',
      check: false,
    }, fixture.runtime);
    fail('REFRESH_FAILURE_ROLLS_BACK', 'unexpected pass');
  } catch (error) {
    if (String(error).includes('working tree rolled back') && fixture.state.restoreCount === 1) {
      pass('REFRESH_FAILURE_ROLLS_BACK');
    } else {
      fail('REFRESH_FAILURE_ROLLS_BACK', { error: String(error), state: fixture.state });
    }
  }
}

{
  const fixture = makeRuntime({ sourcePass: false });
  try {
    handoffStatusSource({
      pipelineId: 'hero',
      expectedPredecessorId: 'hero-stage6-4-final',
      entryId: 'hero-next-final',
      sourcePath: 'data/validation/hero-next-final.v1.json',
      check: true,
    }, fixture.runtime);
    fail('UNCOMMITTED_SOURCE_BLOCKS', 'unexpected pass');
  } catch (error) {
    if (String(error).includes('Candidate source blocked') && fixture.state.bridgeModes.length === 0) pass('UNCOMMITTED_SOURCE_BLOCKS');
    else fail('UNCOMMITTED_SOURCE_BLOCKS', { error: String(error), state: fixture.state });
  }
}

{
  const fixture = makeRuntime({ applyWrites: false, alreadyActive: true });
  try {
    const result = handoffStatusSource({
      pipelineId: 'hero',
      expectedPredecessorId: 'hero-stage6-4-final',
      entryId: 'hero-stage6-4-final',
      sourcePath: 'data/validation/hero-stage6-4-final.v1.json',
      check: false,
    }, fixture.runtime);
    if (result.alreadyActive === true && result.writePerformed === false && fixture.state.refreshCount === 1) {
      pass('ALREADY_ACTIVE_APPLY_STILL_EXPLICITLY_RESEALS');
    } else {
      fail('ALREADY_ACTIVE_APPLY_STILL_EXPLICITLY_RESEALS', { result, state: fixture.state });
    }
  } catch (error) {
    fail('ALREADY_ACTIVE_APPLY_STILL_EXPLICITLY_RESEALS', error instanceof Error ? error.message : String(error));
  }
}

const failed = checks.filter(item => !item.pass);
const summary = {
  version: 1,
  schemaId: 'project-doctor-status-source-stage6-3-apply-handoff-validation/v1',
  stage: 'PROJECT-STATUS-STAGE6-3',
  status: failed.length === 0 ? 'PASS_STATUS_SOURCE_STAGE6_3_APPLY_HANDOFF' : 'FAIL_STATUS_SOURCE_STAGE6_3_APPLY_HANDOFF',
  completion: failed.length === 0 ? 'COMPLETE' : 'BLOCKED',
  checkCount: checks.length,
  passedCount: checks.length - failed.length,
  failedCount: failed.length,
  checks,
  boundaries: {
    completionWorkflowApplyMutation: false,
    directMainPush: false,
    rawConfigDataRead: false,
    semanticRecomputation: false,
    canonicalJoinRecomputation: false,
    fixtureRepositoryMutation: false,
  },
};

console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exitCode = 1;
