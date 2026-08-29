import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bridgeStatusSource } from './bridge-project-doctor-status-source.mjs';
import { refreshFreshness } from './run-project-doctor-d5-refresh-active.mjs';
import { validateFreshness } from './validate-project-doctor-d5.mjs';
import {
  verifyCommittedSource,
  snapshotRepositoryState,
  restoreRepositoryState,
} from './apply-project-doctor-status-source-handoff.mjs';
import { renderCloseoutRequest } from './render-project-doctor-status-source-closeout-request.mjs';

export const DEFAULT_STAGE6_6_CONTRACT = 'data/contracts/project-doctor-status-source-stage6-6-all-domain-closeout.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const normalizeRepositoryPath = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
const safeId = value => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value ?? ''));

export const parseStage6_6Args = argv => {
  const options = { check: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      options.check = true;
      continue;
    }
    if (arg === '--apply') {
      options.check = false;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg !== '--pipeline') throw new Error(`Unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${arg}`);
    index += 1;
    options.pipelineId = value;
  }
  if (!options.help && !options.pipelineId) throw new Error('--pipeline is required.');
  return options;
};

const defaultProjectStatusCheck = () => {
  const result = spawnSync(process.execPath, ['scripts/build-project-status.mjs', '--check'], {
    stdio: 'inherit',
    shell: false,
  });
  return { pass: result.status === 0, exitCode: result.status ?? 1, error: result.error?.message ?? null };
};

const currentBranchName = runtime => {
  if (runtime.branchName) return runtime.branchName;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  const result = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8', shell: false });
  return result.status === 0 ? String(result.stdout ?? '').trim() : '';
};

const validateContracts = ({ contract, legacyContract, bridgeContract, registry }) => {
  const failures = [];
  if (contract.status !== 'DESIGN_FROZEN') failures.push('STAGE6_6_NOT_FROZEN');
  if (legacyContract.status !== 'DESIGN_FROZEN') failures.push('STAGE6_5_NOT_FROZEN');
  if (bridgeContract.status !== 'DESIGN_FROZEN') failures.push('STAGE5_BRIDGE_NOT_FROZEN');
  if (registry.status !== 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY') failures.push('REGISTRY_NOT_ACCEPTED');
  const ids = (contract.pipelines ?? []).map(item => item.pipelineId);
  if (ids.length !== 6 || new Set(ids).size !== 6) failures.push('PIPELINE_COVERAGE_NOT_SIX_UNIQUE');
  for (const pipeline of contract.pipelines ?? []) {
    const bridge = (bridgeContract.pipelines ?? []).find(item => item.id === pipeline.pipelineId);
    if (!bridge || bridge.domain !== pipeline.domain || bridge.producerId !== pipeline.producerId) {
      failures.push(`BRIDGE_BINDING_${pipeline.pipelineId}`);
    }
    const active = registry?.domains?.[pipeline.domain];
    if (!active || active.selectedId !== pipeline.activeEntryId || normalizeRepositoryPath(active.sourcePath) !== normalizeRepositoryPath(pipeline.activeSourcePath)) {
      failures.push(`ACTIVE_BASELINE_${pipeline.pipelineId}`);
    }
    if (pipeline.mode === contract.policy.legacyMode) {
      const legacy = (legacyContract.pipelines ?? []).find(item => item.pipelineId === pipeline.pipelineId);
      if (!legacy || legacy.domain !== pipeline.domain || legacy.producerId !== pipeline.producerId || legacy.completionWorkflow !== pipeline.completionWorkflow || normalizeRepositoryPath(legacy.requestPath) !== normalizeRepositoryPath(pipeline.requestPath)) {
        failures.push(`LEGACY_BINDING_${pipeline.pipelineId}`);
      }
    }
  }
  return failures;
};

const validateBridgeResult = ({ result, mode, entryId }) => {
  const item = result?.results?.[0];
  const promotion = item?.submission?.promotion;
  if (result?.pipelineCount !== 1 || item?.entryId !== entryId) {
    throw new Error(`Unexpected Stage 5 bridge result: ${JSON.stringify(result)}`);
  }
  if (mode === 'CHECK_ONLY') {
    if (result.status !== 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_CHECK' || item.mode !== 'CHECK_ONLY' || promotion?.writePerformed !== false) {
      throw new Error(`Stage 5 preview was not a zero-write check: ${JSON.stringify(result)}`);
    }
  } else if (result.status !== 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_APPLY' || item.mode !== 'APPLY') {
    throw new Error(`Stage 5 apply did not complete: ${JSON.stringify(result)}`);
  }
  return { item, promotion };
};

const selectedIdFor = (registry, domain) => registry?.domains?.[domain]?.selectedId ?? null;

const validateRequest = ({ contract, pipeline, request, registry }) => {
  const failures = [];
  if (request.schemaId !== 'project-doctor-status-source-stage6-6-closeout-request/v1') failures.push('schemaId');
  if (request.stage !== 'PROJECT-STATUS-STAGE6-6') failures.push('stage');
  if (request.pipelineId !== pipeline.pipelineId) failures.push('pipelineId');
  if (request.domain !== pipeline.domain) failures.push('domain');
  if (request.producerId !== pipeline.producerId) failures.push('producerId');
  if (request.mode !== pipeline.mode) failures.push('mode');
  if (!safeId(request.predecessorId)) failures.push('predecessorId');
  if (!safeId(request.entryId)) failures.push('entryId');
  const sourcePath = normalizeRepositoryPath(request.sourcePath);
  if (!sourcePath.startsWith('data/validation/') || !sourcePath.endsWith('.json')) failures.push('sourcePath');
  if (typeof request.note !== 'string' || request.note.trim().length === 0 || /[\r\n]/.test(request.note)) failures.push('note');

  if (pipeline.mode === contract.policy.finalMode) {
    if (request.state !== contract.policy.finalRequestState) failures.push('state');
    if (request.authorityDecision !== 'EXPLICIT_CLOSEOUT_REQUEST') failures.push('authorityDecision');
    if (request.requestedByWorkflow !== pipeline.completionWorkflow) failures.push('requestedByWorkflow');
  } else if (pipeline.mode === contract.policy.readinessMode) {
    if (request.state !== contract.policy.readinessRequestState) failures.push('state');
    if (request.authorityDecision !== 'EXPLICIT_READINESS_CHECK') failures.push('authorityDecision');
    if (request.requestedByWorkflow !== null || pipeline.completionWorkflow !== null) failures.push('requestedByWorkflow');
    if (request.expectedSourceStatus !== pipeline.expectedSourceStatus) failures.push('expectedSourceStatus');
    if (request.blocker !== pipeline.blocker) failures.push('blocker');
  } else {
    failures.push('unsupportedMode');
  }

  if (failures.length > 0) {
    throw new Error(`Stage 6-6 closeout request blocked (${pipeline.pipelineId}): ${failures.join(',')}`);
  }

  const active = registry?.domains?.[pipeline.domain];
  if (!active?.selectedId || !active?.sourcePath) throw new Error(`Active registry domain missing: ${pipeline.domain}`);
  if (request.predecessorId !== active.selectedId) {
    throw new Error(`Stage 6-6 stale predecessor: expected active ${active.selectedId}, request ${request.predecessorId}`);
  }
  if (request.entryId === request.predecessorId && sourcePath !== normalizeRepositoryPath(active.sourcePath)) {
    throw new Error(`Stage 6-6 idempotent request source mismatch: active ${active.sourcePath}, request ${sourcePath}`);
  }
  return { active, sourcePath };
};

export const runStage6_6Closeout = (options, runtime = {}) => {
  const contract = runtime.contract ?? readJson(runtime.contractPath ?? DEFAULT_STAGE6_6_CONTRACT);
  const legacyContract = runtime.legacyContract ?? readJson(contract.legacyStage6_5Contract);
  const bridgeContract = runtime.bridgeContract ?? readJson(contract.bridgeContract);
  const registryAtStart = runtime.registry ?? readJson(contract.activeRegistry);
  const contractFailures = validateContracts({ contract, legacyContract, bridgeContract, registry: registryAtStart });
  if (contractFailures.length > 0) throw new Error(`Stage 6-6 contract blocked: ${contractFailures.join(',')}`);

  const pipeline = (contract.pipelines ?? []).find(item => item.pipelineId === options.pipelineId);
  if (!pipeline) throw new Error(`Stage 6-6 pipeline not registered: ${options.pipelineId}`);

  if (pipeline.mode === contract.policy.legacyMode) {
    if (options.check === false) {
      throw new Error(`Stage 6-6 legacy apply blocked: ${pipeline.pipelineId} remains owned by Stage 6-5 declaration -> Stage 6-3 handoff.`);
    }
    const legacyCheck = runtime.renderLegacy ?? (pipelineId => renderCloseoutRequest({ pipelineId, check: true }));
    const legacy = legacyCheck(pipeline.pipelineId);
    return {
      version: 1,
      schemaId: 'project-doctor-status-source-stage6-6-all-domain-closeout-result/v1',
      stage: 'PROJECT-STATUS-STAGE6-6',
      status: 'PASS_STATUS_SOURCE_STAGE6_6_LEGACY_CHECK',
      completion: 'COMPLETE',
      mode: pipeline.mode,
      pipelineId: pipeline.pipelineId,
      domain: pipeline.domain,
      entryId: pipeline.activeEntryId,
      sourcePath: pipeline.activeSourcePath,
      writePerformed: false,
      legacy,
      boundaries: {
        legacyPathPreserved: true,
        d5ResealPerformed: false,
        rawConfigDataRead: false,
        semanticRecomputation: false,
        canonicalJoinRecomputation: false,
      },
    };
  }

  const requestPath = normalizeRepositoryPath(pipeline.requestPath);
  const request = runtime.request ?? readJson(requestPath);
  const { active, sourcePath } = validateRequest({
    contract,
    pipeline,
    request,
    registry: registryAtStart,
  });

  const verify = runtime.verifyCommittedSource ?? verifyCommittedSource;
  const requestVerification = verify(requestPath);
  if (!requestVerification.pass) throw new Error(`Stage 6-6 request file blocked: ${JSON.stringify(requestVerification)}`);
  const sourceVerification = verify(sourcePath);
  if (!sourceVerification.pass) throw new Error(`Stage 6-6 candidate source blocked: ${JSON.stringify(sourceVerification)}`);

  if (pipeline.mode === contract.policy.readinessMode && options.check === false) {
    throw new Error(`Stage 6-6 Skin apply blocked: readiness ${request.expectedSourceStatus}; ${request.blocker}`);
  }

  const bridge = runtime.bridge ?? bridgeStatusSource;
  const bridgeOptions = {
    pipelineId: pipeline.pipelineId,
    entryId: request.entryId,
    sourcePath,
    note: request.note,
  };
  const preview = bridge({ ...bridgeOptions, check: true });
  validateBridgeResult({ result: preview, mode: 'CHECK_ONLY', entryId: request.entryId });

  if (pipeline.mode === contract.policy.readinessMode) {
    const source = runtime.source ?? readJson(sourcePath);
    if (source.status !== request.expectedSourceStatus) {
      throw new Error(`Stage 6-6 readiness status mismatch: expected ${request.expectedSourceStatus}, actual ${source.status}`);
    }
  }

  const idempotentBaseline = request.entryId === active.selectedId && sourcePath === normalizeRepositoryPath(active.sourcePath);
  if (options.check !== false) {
    return {
      version: 1,
      schemaId: 'project-doctor-status-source-stage6-6-all-domain-closeout-result/v1',
      stage: 'PROJECT-STATUS-STAGE6-6',
      status: pipeline.mode === contract.policy.readinessMode
        ? 'PASS_STATUS_SOURCE_STAGE6_6_READINESS_CHECK'
        : 'PASS_STATUS_SOURCE_STAGE6_6_HANDOFF_CHECK',
      completion: 'COMPLETE',
      mode: pipeline.mode,
      pipelineId: pipeline.pipelineId,
      domain: pipeline.domain,
      expectedPredecessorId: request.predecessorId,
      entryId: request.entryId,
      sourcePath,
      idempotentBaseline,
      writePerformed: false,
      preview,
      boundaries: {
        applyAllowed: pipeline.mode === contract.policy.finalMode,
        d5ResealPerformed: false,
        rawConfigDataRead: false,
        semanticRecomputation: false,
        canonicalJoinRecomputation: false,
      },
    };
  }

  const branchName = currentBranchName(runtime);
  if (!/^work\//.test(branchName)) {
    throw new Error(`Stage 6-6 apply requires work/* branch; current=${branchName || '(detached/unknown)'}`);
  }

  const loadRegistry = runtime.loadRegistry ?? (() => readJson(contract.activeRegistry));
  const beforeApply = loadRegistry();
  if (selectedIdFor(beforeApply, pipeline.domain) !== request.predecessorId) {
    throw new Error(`Stage 6-6 CAS predecessor mismatch at APPLY: expected ${request.predecessorId}, actual ${selectedIdFor(beforeApply, pipeline.domain)}`);
  }

  const refresh = runtime.refresh ?? (() => refreshFreshness({ contractPath: contract.d5Contract }));
  const freshnessValidate = runtime.validateFreshness ?? (() => validateFreshness({ contractPath: contract.d5Contract }));
  const projectStatusCheck = runtime.projectStatusCheck ?? defaultProjectStatusCheck;
  const snapshot = runtime.snapshot ?? (() => snapshotRepositoryState(contract));
  const restore = runtime.restore ?? restoreRepositoryState;
  const repositorySnapshot = snapshot();

  try {
    const applied = bridge({ ...bridgeOptions, check: false });
    const appliedResult = validateBridgeResult({ result: applied, mode: 'APPLY', entryId: request.entryId });
    const postApply = loadRegistry();
    const postSelectedId = selectedIdFor(postApply, pipeline.domain);
    if (postSelectedId !== request.entryId) {
      throw new Error(`Stage 6-6 post-apply registry selected ${postSelectedId}, expected ${request.entryId}`);
    }

    const refreshResult = refresh();
    if (refreshResult?.status !== 'PASS_PROJECT_DOCTOR_D5_REFRESH' || refreshResult?.exitCode !== 0) {
      throw new Error(`Stage 6-6 D5 explicit refresh failed: ${JSON.stringify(refreshResult)}`);
    }
    const freshness = freshnessValidate();
    if (freshness?.status !== 'FRESH' || freshness?.exitCode !== 0) {
      throw new Error(`Stage 6-6 D5 freshness validation failed after apply: ${JSON.stringify(freshness)}`);
    }
    const projectStatus = projectStatusCheck();
    if (!projectStatus?.pass) {
      throw new Error(`Stage 6-6 Project Status projection is not current after apply: ${JSON.stringify(projectStatus)}`);
    }

    return {
      version: 1,
      schemaId: 'project-doctor-status-source-stage6-6-all-domain-closeout-result/v1',
      stage: 'PROJECT-STATUS-STAGE6-6',
      status: 'PASS_STATUS_SOURCE_STAGE6_6_HANDOFF_APPLY',
      completion: 'COMPLETE',
      mode: pipeline.mode,
      pipelineId: pipeline.pipelineId,
      domain: pipeline.domain,
      expectedPredecessorId: request.predecessorId,
      entryId: request.entryId,
      sourcePath,
      idempotentBaseline,
      writePerformed: appliedResult.promotion?.writePerformed === true,
      alreadyActive: appliedResult.promotion?.alreadyActive === true,
      refresh: refreshResult,
      freshness,
      projectStatus,
      boundaries: {
        d5ResealPerformed: true,
        rawConfigDataRead: false,
        semanticRecomputation: false,
        canonicalJoinRecomputation: false,
      },
    };
  } catch (error) {
    try {
      restore(repositorySnapshot);
    } catch (rollbackError) {
      throw new Error(`Stage 6-6 apply failed and rollback also failed. apply=${error instanceof Error ? error.message : String(error)} rollback=${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    throw new Error(`Stage 6-6 apply failed; working tree rolled back. ${error instanceof Error ? error.message : String(error)}`);
  }
};

const usage = () => console.log('Usage: node scripts/apply-project-doctor-status-source-stage6-6-all-domain-closeout.mjs --pipeline <hero|soldier|equipment|hero-soldier|banner|skin> [--check|--apply]');
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseStage6_6Args(process.argv.slice(2));
    if (options.help) usage();
    else console.log(JSON.stringify(runStage6_6Closeout(options), null, 2));
  } catch (error) {
    console.error(`[status-source-stage6-6-all-domain-closeout] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
