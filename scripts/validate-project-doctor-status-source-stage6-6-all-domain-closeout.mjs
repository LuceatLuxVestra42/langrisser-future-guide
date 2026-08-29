import fs from 'node:fs';
import { runStage6_6Closeout } from './apply-project-doctor-status-source-stage6-6-all-domain-closeout.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-status-source-stage6-6-all-domain-closeout.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const contract = readJson(CONTRACT_PATH);
const bridgeContract = readJson(contract.bridgeContract);
const registry = readJson(contract.activeRegistry);
const legacyContract = readJson(contract.legacyStage6_5Contract);
const checks = [];
const add = (id, pass, detail = null) => checks.push({ id, pass: Boolean(pass), ...(detail === null ? {} : { detail }) });
const expectThrow = (id, fn, needle) => {
  try {
    fn();
    add(id, false, 'unexpected pass');
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    add(id, text.includes(needle), text);
  }
};

add('CONTRACT_FROZEN', contract.status === 'DESIGN_FROZEN');
add('PIPELINES_EXACT_SIX', (contract.pipelines ?? []).map(item => item.pipelineId).sort().join(',') === 'banner,equipment,hero,hero-soldier,skin,soldier');
add('LEGACY_MODES_EXACT_TWO', contract.pipelines.filter(item => item.mode === contract.policy.legacyMode).map(item => item.pipelineId).sort().join(',') === 'hero,soldier');
add('FINAL_MODES_EXACT_THREE', contract.pipelines.filter(item => item.mode === contract.policy.finalMode).map(item => item.pipelineId).sort().join(',') === 'banner,equipment,hero-soldier');
add('READINESS_MODE_SKIN_ONLY', contract.pipelines.filter(item => item.mode === contract.policy.readinessMode).map(item => item.pipelineId).join(',') === 'skin');
add('NO_REAL_SUCCESSOR_STAGE6_6', contract.policy.realSuccessorPromotionInThisStage === false);
add('SKIN_APPLY_POLICY_FORBIDDEN', contract.policy.skinApplyForbiddenUntilNewReviewedContract === true);
add('NO_AUTHORITY_INFERENCE', contract.policy.filenameAuthorityInference === false && contract.policy.stageNumberAuthorityInference === false && contract.policy.chronologyAuthorityInference === false);
add('NO_RAW_SEMANTIC_JOIN_RECOMPUTE', contract.policy.rawConfigDataRead === false && contract.policy.semanticRecomputation === false && contract.policy.canonicalJoinRecomputation === false);

for (const pipeline of contract.pipelines ?? []) {
  const active = registry?.domains?.[pipeline.domain];
  const bridge = bridgeContract.pipelines.find(item => item.id === pipeline.pipelineId);
  add(`BRIDGE_BINDING_${pipeline.pipelineId}`, bridge?.domain === pipeline.domain && bridge?.producerId === pipeline.producerId);
  add(`ACTIVE_BASELINE_${pipeline.pipelineId}`, active?.selectedId === pipeline.activeEntryId && active?.sourcePath === pipeline.activeSourcePath);

  try {
    const result = runStage6_6Closeout({ pipelineId: pipeline.pipelineId, check: true });
    const expected = pipeline.mode === contract.policy.legacyMode
      ? 'PASS_STATUS_SOURCE_STAGE6_6_LEGACY_CHECK'
      : pipeline.mode === contract.policy.readinessMode
        ? 'PASS_STATUS_SOURCE_STAGE6_6_READINESS_CHECK'
        : 'PASS_STATUS_SOURCE_STAGE6_6_HANDOFF_CHECK';
    add(`REAL_CHECK_${pipeline.pipelineId}`, result.status === expected && result.writePerformed === false, result);
  } catch (error) {
    add(`REAL_CHECK_${pipeline.pipelineId}`, false, error instanceof Error ? error.message : String(error));
  }

  if (pipeline.mode !== contract.policy.legacyMode) {
    const request = readJson(pipeline.requestPath);
    add(`REQUEST_BINDING_${pipeline.pipelineId}`, request.pipelineId === pipeline.pipelineId && request.domain === pipeline.domain && request.producerId === pipeline.producerId && request.mode === pipeline.mode);
    add(`REQUEST_BASELINE_${pipeline.pipelineId}`, request.predecessorId === active?.selectedId && request.entryId === active?.selectedId && request.sourcePath === active?.sourcePath);
  } else {
    const legacy = legacyContract.pipelines.find(item => item.pipelineId === pipeline.pipelineId);
    add(`LEGACY_REQUEST_REUSED_${pipeline.pipelineId}`, legacy?.requestPath === pipeline.requestPath);
  }
}

const equipment = contract.pipelines.find(item => item.pipelineId === 'equipment');
const equipmentRequest = readJson(equipment.requestPath);
const passVerify = sourcePath => ({ pass: true, sourcePath });
const makeBridgeResult = ({ check, entryId }) => ({
  status: check ? 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_CHECK' : 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_APPLY',
  pipelineCount: 1,
  results: [{
    entryId,
    mode: check ? 'CHECK_ONLY' : 'APPLY',
    submission: {
      promotion: {
        writePerformed: false,
        alreadyActive: true,
      },
    },
  }],
});

const baseRuntime = {
  contract,
  legacyContract,
  bridgeContract,
  registry,
  request: equipmentRequest,
  verifyCommittedSource: passVerify,
  bridge: options => makeBridgeResult({ check: options.check !== false, entryId: options.entryId }),
};

expectThrow('STALE_PREDECESSOR_BLOCKS', () => runStage6_6Closeout({ pipelineId: 'equipment', check: true }, {
  ...baseRuntime,
  request: { ...equipmentRequest, predecessorId: 'equipment-stale' },
}), 'stale predecessor');

expectThrow('UNAPPROVED_REQUEST_BLOCKS', () => runStage6_6Closeout({ pipelineId: 'equipment', check: true }, {
  ...baseRuntime,
  request: { ...equipmentRequest, state: 'DRAFT' },
}), 'closeout request blocked');

expectThrow('CROSS_DOMAIN_REQUEST_BLOCKS', () => runStage6_6Closeout({ pipelineId: 'equipment', check: true }, {
  ...baseRuntime,
  request: { ...equipmentRequest, domain: 'banner' },
}), 'closeout request blocked');

expectThrow('UNCOMMITTED_REQUEST_BLOCKS', () => runStage6_6Closeout({ pipelineId: 'equipment', check: true }, {
  ...baseRuntime,
  verifyCommittedSource: sourcePath => sourcePath === equipment.requestPath
    ? { pass: false, reason: 'SOURCE_NOT_COMMITTED_AT_HEAD', sourcePath }
    : { pass: true, sourcePath },
}), 'request file blocked');

expectThrow('UNCOMMITTED_SOURCE_BLOCKS', () => runStage6_6Closeout({ pipelineId: 'equipment', check: true }, {
  ...baseRuntime,
  verifyCommittedSource: sourcePath => sourcePath === equipmentRequest.sourcePath
    ? { pass: false, reason: 'SOURCE_NOT_COMMITTED_AT_HEAD', sourcePath }
    : { pass: true, sourcePath },
}), 'candidate source blocked');

expectThrow('MAIN_APPLY_BLOCKS', () => runStage6_6Closeout({ pipelineId: 'equipment', check: false }, {
  ...baseRuntime,
  branchName: 'main',
}), 'requires work/* branch');

const skin = contract.pipelines.find(item => item.pipelineId === 'skin');
const skinRequest = readJson(skin.requestPath);
expectThrow('SKIN_APPLY_BLOCKS', () => runStage6_6Closeout({ pipelineId: 'skin', check: false }, {
  contract,
  legacyContract,
  bridgeContract,
  registry,
  request: skinRequest,
  source: { status: skin.expectedSourceStatus },
  verifyCommittedSource: passVerify,
  bridge: options => makeBridgeResult({ check: options.check !== false, entryId: options.entryId }),
  branchName: 'work/stage6-6-self-test',
}), 'Skin apply blocked');

expectThrow('LEGACY_DIRECT_APPLY_BLOCKS', () => runStage6_6Closeout({ pipelineId: 'hero', check: false }, {
  contract,
  legacyContract,
  bridgeContract,
  registry,
}), 'legacy apply blocked');

let syntheticRegistry = JSON.parse(JSON.stringify(registry));
const syntheticRequest = {
  ...equipmentRequest,
  predecessorId: registry.domains.equipment.selectedId,
  entryId: 'equipment-stage6-6-synthetic-next',
  sourcePath: 'data/validation/equipment-stage6-6-synthetic-next.v1.json',
  note: 'Synthetic successor fixture for Stage 6-6 self-test only.',
};
try {
  const result = runStage6_6Closeout({ pipelineId: 'equipment', check: false }, {
    contract,
    legacyContract,
    bridgeContract,
    registry,
    request: syntheticRequest,
    verifyCommittedSource: passVerify,
    branchName: 'work/stage6-6-self-test',
    bridge: options => {
      const check = options.check !== false;
      if (!check) syntheticRegistry.domains.equipment.selectedId = options.entryId;
      return makeBridgeResult({ check, entryId: options.entryId });
    },
    loadRegistry: () => syntheticRegistry,
    refresh: () => ({ status: 'PASS_PROJECT_DOCTOR_D5_REFRESH', exitCode: 0 }),
    validateFreshness: () => ({ status: 'FRESH', exitCode: 0 }),
    projectStatusCheck: () => ({ pass: true }),
    snapshot: () => ({ fixture: true }),
    restore: () => {},
  });
  add('SYNTHETIC_FINAL_APPLY_SEQUENCE', result.status === 'PASS_STATUS_SOURCE_STAGE6_6_HANDOFF_APPLY' && result.entryId === syntheticRequest.entryId && result.boundaries.d5ResealPerformed === true && result.writePerformed === false, result);
} catch (error) {
  add('SYNTHETIC_FINAL_APPLY_SEQUENCE', false, error instanceof Error ? error.message : String(error));
}

const statusWorkflow = fs.readFileSync('.github/workflows/project-status-sync.yml', 'utf8');
add('PROJECT_STATUS_SYNC_RUNS_STAGE6_6_SELF_TEST', statusWorkflow.includes('validate-project-doctor-status-source-stage6-6-all-domain-closeout.mjs'));
add('REGISTRY_ENTRY_COUNT_UNCHANGED', registry.entryCount === 6 && registry.selectedCount === 6);
add('ALL_CURRENT_AUTHORITIES_UNCHANGED', contract.pipelines.every(pipeline => registry.domains[pipeline.domain]?.selectedId === pipeline.activeEntryId));

const failed = checks.filter(item => !item.pass);
const summary = {
  version: 1,
  schemaId: 'project-doctor-status-source-stage6-6-all-domain-closeout-validation/v1',
  stage: 'PROJECT-STATUS-STAGE6-6',
  status: failed.length === 0 ? 'PASS_STATUS_SOURCE_STAGE6_6_ALL_DOMAIN_CLOSEOUT' : 'FAIL_STATUS_SOURCE_STAGE6_6_ALL_DOMAIN_CLOSEOUT',
  completion: failed.length === 0 ? 'COMPLETE' : 'BLOCKED',
  checkCount: checks.length,
  passedCount: checks.length - failed.length,
  failedCount: failed.length,
  checks,
  boundaries: {
    realSuccessorPromotion: false,
    skinApply: false,
    authorityInference: false,
    rawConfigDataRead: false,
    semanticRecomputation: false,
    canonicalJoinRecomputation: false,
    fixtureRepositoryMutation: false,
  },
};
console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exitCode = 1;
