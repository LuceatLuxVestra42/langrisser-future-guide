import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertRepositoryPath,
  selectActiveSources,
} from './select-active-sources.mjs';
import {
  bridgeStatusSource,
  loadArtifactBridgeContract,
} from './bridge-status-source.mjs';

export const DEFAULT_LIFECYCLE_CONTRACT = 'tools/status-source/contracts/lifecycle.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const safeId = value => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value ?? ''));

export const normalizeRepositoryPath = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');

const gitOk = (repoRoot, args) => spawnSync('git', args, {
  cwd: repoRoot,
  stdio: 'ignore',
  shell: false,
}).status === 0;

export function verifyCommittedPath(relativePath, { repoRoot = process.cwd() } = {}) {
  const normalized = normalizeRepositoryPath(relativePath);
  try {
    const absolute = assertRepositoryPath(repoRoot, normalized);
    if (!fs.existsSync(absolute)) return { pass: false, reason: 'PATH_MISSING', path: normalized };
  } catch (error) {
    return {
      pass: false,
      reason: 'PATH_INVALID',
      path: normalized,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (!gitOk(repoRoot, ['cat-file', '-e', `HEAD:${normalized}`])) {
    return { pass: false, reason: 'PATH_NOT_COMMITTED_AT_HEAD', path: normalized };
  }
  if (!gitOk(repoRoot, ['diff', '--quiet', '--', normalized]) || !gitOk(repoRoot, ['diff', '--cached', '--quiet', '--', normalized])) {
    return { pass: false, reason: 'PATH_WORKTREE_NOT_CLEAN', path: normalized };
  }
  return { pass: true, path: normalized };
}

export function loadLifecycleContract({
  repoRoot = process.cwd(),
  contractPath = DEFAULT_LIFECYCLE_CONTRACT,
} = {}) {
  const contract = readJson(assertRepositoryPath(repoRoot, contractPath));
  if (contract?.schemaId !== 'status-source-lifecycle/v1') {
    throw new Error(`Unsupported lifecycle schema: ${contract?.schemaId ?? 'missing'}`);
  }
  if (contract.status !== 'DESIGN_FROZEN') {
    throw new Error(`Lifecycle contract is not frozen: ${contract.status ?? 'missing'}`);
  }
  return contract;
}

function findPipeline(contract, pipelineId) {
  const pipeline = (contract.pipelines ?? []).find(item => item.pipelineId === pipelineId);
  if (!pipeline) throw new Error(`Lifecycle pipeline not registered: ${pipelineId}`);
  return pipeline;
}

function validatePipelineBinding({ pipeline, bridgeContract }) {
  const bridgePipeline = (bridgeContract.pipelines ?? []).find(item => item.id === pipeline.pipelineId);
  if (!bridgePipeline) throw new Error(`R1-4 bridge pipeline missing: ${pipeline.pipelineId}`);
  if (bridgePipeline.domain !== pipeline.domain || bridgePipeline.producerId !== pipeline.producerId) {
    throw new Error(`Lifecycle/bridge binding mismatch: ${pipeline.pipelineId}`);
  }
  return bridgePipeline;
}

function selectedFor(selection, domain) {
  return selection?.domains?.[domain] ?? null;
}

function requireCas({ selection, domain, expectedPredecessorId, phase }) {
  const selected = selectedFor(selection, domain);
  const actual = selected?.selectedId ?? null;
  if (actual !== expectedPredecessorId) {
    throw new Error(`CAS predecessor mismatch at ${phase}: expected ${expectedPredecessorId}, actual ${actual}`);
  }
  return selected;
}

function validateBridgeResult({ result, mode, entryId }) {
  const item = result?.results?.[0];
  if (result?.pipelineCount !== 1 || item?.entryId !== entryId) {
    throw new Error(`Unexpected R1-4 bridge result: ${JSON.stringify(result)}`);
  }
  if (mode === 'CHECK') {
    if (result.status !== 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_CHECK' || item.mode !== 'CHECK') {
      throw new Error(`R1-4 preview did not complete in CHECK mode: ${JSON.stringify(result)}`);
    }
    if (Number(result.boundaries?.statusSourceDeclarationWriteCount ?? 0) !== 0) {
      throw new Error(`R1-4 preview performed a declaration write: ${JSON.stringify(result)}`);
    }
  } else if (result.status !== 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_APPLY' || item.mode !== 'APPLY') {
    throw new Error(`R1-4 apply did not complete: ${JSON.stringify(result)}`);
  }
  return item;
}

export function handoffStatusSource(options = {}, runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const contract = runtime.contract ?? loadLifecycleContract({ repoRoot });
  const bridgeContract = runtime.bridgeContract ?? loadArtifactBridgeContract({
    repoRoot,
    contractPath: contract.bridgeContract,
  });
  const pipeline = findPipeline(contract, options.pipelineId);
  validatePipelineBinding({ pipeline, bridgeContract });

  for (const [name, value] of [
    ['expectedPredecessorId', options.expectedPredecessorId],
    ['entryId', options.entryId],
    ['sourcePath', options.sourcePath],
  ]) {
    if (!value) throw new Error(`${name} is required.`);
  }
  if (!safeId(options.expectedPredecessorId)) throw new Error(`Unsafe predecessor id: ${options.expectedPredecessorId}`);
  if (!safeId(options.entryId)) throw new Error(`Unsafe entry id: ${options.entryId}`);

  const sourcePath = normalizeRepositoryPath(options.sourcePath);
  const verify = runtime.verifyCommittedPath ?? ((value) => verifyCommittedPath(value, { repoRoot }));
  const sourceVerification = verify(sourcePath);
  if (!sourceVerification.pass) throw new Error(`Candidate source blocked: ${JSON.stringify(sourceVerification)}`);

  const select = runtime.select ?? (() => selectActiveSources({ repoRoot }));
  const bridge = runtime.bridge ?? bridgeStatusSource;
  const bridgeRuntime = runtime.bridgeRuntime ?? { repoRoot };

  const previewSelection = select();
  requireCas({
    selection: previewSelection,
    domain: pipeline.domain,
    expectedPredecessorId: options.expectedPredecessorId,
    phase: 'PREVIEW',
  });

  const bridgeOptions = {
    pipelineId: pipeline.pipelineId,
    entryId: options.entryId,
    sourcePath,
    apply: false,
    ...(options.note ? { note: options.note } : {}),
  };
  const preview = bridge(bridgeOptions, bridgeRuntime);
  validateBridgeResult({ result: preview, mode: 'CHECK', entryId: options.entryId });

  if (options.apply !== true) {
    return {
      version: 1,
      schemaId: 'status-source-handoff-result/v1',
      stage: 'R1-5',
      status: 'PASS_STATUS_SOURCE_HANDOFF_CHECK',
      completion: 'COMPLETE',
      mode: 'CHECK',
      pipelineId: pipeline.pipelineId,
      domain: pipeline.domain,
      expectedPredecessorId: options.expectedPredecessorId,
      entryId: options.entryId,
      sourcePath,
      writePerformed: false,
      preview,
      boundaries: lifecycleBoundaries({ statusSourceDeclarationWriteCount: 0 }),
    };
  }

  const applySelection = select();
  requireCas({
    selection: applySelection,
    domain: pipeline.domain,
    expectedPredecessorId: options.expectedPredecessorId,
    phase: 'APPLY',
  });

  const applied = bridge({ ...bridgeOptions, apply: true }, bridgeRuntime);
  const appliedItem = validateBridgeResult({ result: applied, mode: 'APPLY', entryId: options.entryId });
  const postSelection = select();
  const post = selectedFor(postSelection, pipeline.domain);
  if (post?.selectedId !== options.entryId || normalizeRepositoryPath(post?.sourcePath) !== sourcePath) {
    throw new Error(`Post-apply selection mismatch: expected ${options.entryId} / ${sourcePath}, actual ${post?.selectedId ?? null} / ${post?.sourcePath ?? null}`);
  }

  return {
    version: 1,
    schemaId: 'status-source-handoff-result/v1',
    stage: 'R1-5',
    status: 'PASS_STATUS_SOURCE_HANDOFF_APPLY',
    completion: 'COMPLETE',
    mode: 'APPLY',
    pipelineId: pipeline.pipelineId,
    domain: pipeline.domain,
    expectedPredecessorId: options.expectedPredecessorId,
    entryId: options.entryId,
    sourcePath,
    writePerformed: appliedItem?.submission?.promotion?.writePerformed === true,
    alreadyActive: appliedItem?.submission?.promotion?.alreadyActive === true,
    applied,
    postSelection: post,
    boundaries: lifecycleBoundaries({
      statusSourceDeclarationWriteCount: Number(applied.boundaries?.statusSourceDeclarationWriteCount ?? 0),
    }),
  };
}

function validateDeclarationShape({ declaration, pipeline, contract }) {
  const failures = [];
  if (declaration?.schemaId !== 'status-source-producer-declaration/v1') failures.push('schemaId');
  if (declaration?.stage !== 'R1-5') failures.push('stage');
  if (declaration?.state !== contract.policy?.producerDeclaration?.state) failures.push('state');
  if (declaration?.pipelineId !== pipeline.pipelineId) failures.push('pipelineId');
  if (declaration?.domain !== pipeline.domain) failures.push('domain');
  if (declaration?.producerId !== pipeline.producerId) failures.push('producerId');
  if (declaration?.requestedByWorkflow !== pipeline.completionWorkflow) failures.push('requestedByWorkflow');
  if (declaration?.authorityDecision !== 'EXPLICIT_PRODUCER_DECLARATION') failures.push('authorityDecision');
  if (!safeId(declaration?.predecessorId)) failures.push('predecessorId');
  if (!safeId(declaration?.entryId)) failures.push('entryId');
  const sourcePath = normalizeRepositoryPath(declaration?.sourcePath);
  if (!sourcePath.startsWith('data/validation/') || !sourcePath.endsWith('.json')) failures.push('sourcePath');
  if (typeof declaration?.note !== 'string' || declaration.note.trim().length === 0 || /[\r\n]/.test(declaration.note)) failures.push('note');
  return { failures, sourcePath };
}

export function resolveProducerDeclaration(options = {}, runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const contract = runtime.contract ?? loadLifecycleContract({ repoRoot });
  const bridgeContract = runtime.bridgeContract ?? loadArtifactBridgeContract({
    repoRoot,
    contractPath: contract.bridgeContract,
  });
  const pipeline = findPipeline(contract, options.pipelineId);
  validatePipelineBinding({ pipeline, bridgeContract });

  const declarationPath = normalizeRepositoryPath(pipeline.declarationPath);
  const declaration = runtime.declaration ?? readJson(assertRepositoryPath(repoRoot, declarationPath));
  const { failures, sourcePath } = validateDeclarationShape({ declaration, pipeline, contract });
  if (failures.length) throw new Error(`Producer declaration blocked (${pipeline.pipelineId}): ${failures.join(',')}`);

  const selection = runtime.selection ?? selectActiveSources({ repoRoot });
  const active = selectedFor(selection, pipeline.domain);
  if (!active?.selectedId || !active?.sourcePath) throw new Error(`Active selection missing: ${pipeline.domain}`);
  if (declaration.predecessorId !== active.selectedId) {
    throw new Error(`Stale producer declaration: active ${active.selectedId}, declaration ${declaration.predecessorId}`);
  }
  if (declaration.entryId === declaration.predecessorId && sourcePath !== normalizeRepositoryPath(active.sourcePath)) {
    throw new Error(`Idempotent producer declaration source mismatch: active ${active.sourcePath}, declaration ${sourcePath}`);
  }

  const verify = runtime.verifyCommittedPath ?? ((value) => verifyCommittedPath(value, { repoRoot }));
  const declarationVerification = verify(declarationPath);
  if (!declarationVerification.pass) throw new Error(`Producer declaration file blocked: ${JSON.stringify(declarationVerification)}`);
  const sourceVerification = verify(sourcePath);
  if (!sourceVerification.pass) throw new Error(`Producer declaration source blocked: ${JSON.stringify(sourceVerification)}`);

  return {
    version: 1,
    schemaId: 'status-source-producer-declaration-result/v1',
    stage: 'R1-5',
    status: 'PASS_STATUS_SOURCE_PRODUCER_DECLARATION',
    completion: 'COMPLETE',
    pipelineId: pipeline.pipelineId,
    domain: pipeline.domain,
    producerId: pipeline.producerId,
    declarationPath,
    expectedPredecessorId: declaration.predecessorId,
    entryId: declaration.entryId,
    sourcePath,
    idempotentBaseline: declaration.entryId === active.selectedId && sourcePath === normalizeRepositoryPath(active.sourcePath),
    writePerformed: false,
    boundaries: lifecycleBoundaries({ statusSourceDeclarationWriteCount: 0 }),
  };
}

function validateCloseoutShape({ request, pipeline, contract }) {
  const failures = [];
  if (request?.schemaId !== 'status-source-closeout-request/v1') failures.push('schemaId');
  if (request?.stage !== 'R1-5') failures.push('stage');
  if (request?.state !== contract.policy?.closeoutRequest?.state) failures.push('state');
  if (request?.pipelineId !== pipeline.pipelineId) failures.push('pipelineId');
  if (request?.domain !== pipeline.domain) failures.push('domain');
  if (request?.producerId !== pipeline.producerId) failures.push('producerId');
  if (request?.requestedByWorkflow !== pipeline.completionWorkflow) failures.push('requestedByWorkflow');
  if (normalizeRepositoryPath(request?.declarationPath) !== normalizeRepositoryPath(pipeline.declarationPath)) failures.push('declarationPath');
  if (request?.authorityDecision !== 'EXPLICIT_CLOSEOUT_REQUEST') failures.push('authorityDecision');
  if (!safeId(request?.predecessorId)) failures.push('predecessorId');
  if (!safeId(request?.entryId)) failures.push('entryId');
  const sourcePath = normalizeRepositoryPath(request?.sourcePath);
  if (!sourcePath.startsWith('data/validation/') || !sourcePath.endsWith('.json')) failures.push('sourcePath');
  if (typeof request?.declarationNote !== 'string' || request.declarationNote.trim().length === 0 || /[\r\n]/.test(request.declarationNote)) failures.push('declarationNote');
  return { failures, sourcePath };
}

export function buildProducerDeclarationFromRequest(request, contract) {
  return {
    version: 1,
    schemaId: 'status-source-producer-declaration/v1',
    stage: 'R1-5',
    state: contract.policy.producerDeclaration.state,
    pipelineId: request.pipelineId,
    domain: request.domain,
    producerId: request.producerId,
    requestedByWorkflow: request.requestedByWorkflow,
    predecessorId: request.predecessorId,
    entryId: request.entryId,
    sourcePath: normalizeRepositoryPath(request.sourcePath),
    authorityDecision: 'EXPLICIT_PRODUCER_DECLARATION',
    note: request.declarationNote,
  };
}

export function renderCloseoutRequest(options = {}, runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const contract = runtime.contract ?? loadLifecycleContract({ repoRoot });
  const bridgeContract = runtime.bridgeContract ?? loadArtifactBridgeContract({
    repoRoot,
    contractPath: contract.bridgeContract,
  });
  const pipeline = findPipeline(contract, options.pipelineId);
  validatePipelineBinding({ pipeline, bridgeContract });

  const requestPath = normalizeRepositoryPath(pipeline.closeoutRequestPath);
  const declarationPath = normalizeRepositoryPath(pipeline.declarationPath);
  const request = runtime.request ?? readJson(assertRepositoryPath(repoRoot, requestPath));
  const { failures, sourcePath } = validateCloseoutShape({ request, pipeline, contract });
  if (failures.length) throw new Error(`Closeout request blocked (${pipeline.pipelineId}): ${failures.join(',')}`);

  const selection = runtime.selection ?? selectActiveSources({ repoRoot });
  const active = selectedFor(selection, pipeline.domain);
  if (!active?.selectedId || !active?.sourcePath) throw new Error(`Active selection missing: ${pipeline.domain}`);
  if (request.predecessorId !== active.selectedId) {
    throw new Error(`Stale closeout request: active ${active.selectedId}, request ${request.predecessorId}`);
  }
  if (request.entryId === request.predecessorId && sourcePath !== normalizeRepositoryPath(active.sourcePath)) {
    throw new Error(`Idempotent closeout request source mismatch: active ${active.sourcePath}, request ${sourcePath}`);
  }

  const verify = runtime.verifyCommittedPath ?? ((value) => verifyCommittedPath(value, { repoRoot }));
  const requestVerification = verify(requestPath);
  if (!requestVerification.pass) throw new Error(`Closeout request file blocked: ${JSON.stringify(requestVerification)}`);
  const sourceVerification = verify(sourcePath);
  if (!sourceVerification.pass) throw new Error(`Closeout request source blocked: ${JSON.stringify(sourceVerification)}`);

  const declaration = buildProducerDeclarationFromRequest({ ...request, sourcePath }, contract);
  const expectedText = `${JSON.stringify(declaration, null, 2)}\n`;
  const declarationAbsolute = assertRepositoryPath(repoRoot, declarationPath);
  const readDeclaration = runtime.readDeclaration ?? (() => fs.existsSync(declarationAbsolute) ? fs.readFileSync(declarationAbsolute, 'utf8') : null);
  const actualText = readDeclaration(declarationPath);
  const projectionCurrentBefore = actualText === expectedText;

  let writePerformed = false;
  if (options.write !== true) {
    if (!projectionCurrentBefore) throw new Error(`Closeout declaration projection stale (${pipeline.pipelineId}): ${declarationPath}`);
  } else if (!projectionCurrentBefore) {
    const writeDeclaration = runtime.writeDeclaration ?? ((targetPath, content) => {
      const absolute = assertRepositoryPath(repoRoot, targetPath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content);
    });
    writeDeclaration(declarationPath, expectedText);
    writePerformed = true;
  }

  let declarationRevalidation = null;
  if (options.write !== true) {
    declarationRevalidation = resolveProducerDeclaration({ pipelineId: pipeline.pipelineId }, {
      repoRoot,
      contract,
      bridgeContract,
      selection,
      ...(runtime.declarationRevalidationRuntime ?? {}),
    });
  }

  return {
    version: 1,
    schemaId: 'status-source-closeout-request-result/v1',
    stage: 'R1-5',
    status: options.write === true
      ? 'PASS_STATUS_SOURCE_CLOSEOUT_RENDER'
      : 'PASS_STATUS_SOURCE_CLOSEOUT_CHECK',
    completion: 'COMPLETE',
    mode: options.write === true ? 'WRITE' : 'CHECK',
    pipelineId: pipeline.pipelineId,
    domain: pipeline.domain,
    producerId: pipeline.producerId,
    requestPath,
    declarationPath,
    expectedPredecessorId: request.predecessorId,
    entryId: request.entryId,
    sourcePath,
    idempotentBaseline: request.entryId === active.selectedId && sourcePath === normalizeRepositoryPath(active.sourcePath),
    projectionCurrentBefore,
    writePerformed,
    declarationRevalidation,
    downstreamCommittedDeclarationRevalidationRequired: options.write === true && writePerformed,
    boundaries: lifecycleBoundaries({
      statusSourceDeclarationWriteCount: 0,
      producerDeclarationWriteCount: writePerformed ? 1 : 0,
    }),
  };
}

export function lifecycleSummary(contract) {
  const pipelines = Array.isArray(contract?.pipelines) ? contract.pipelines : [];
  return {
    pipelineCount: pipelines.length,
    domains: Object.fromEntries(pipelines.map(item => [item.domain, item.producerId])),
    productionWriterActivation: contract?.policy?.transport?.productionWriterActivation ?? null,
  };
}

function lifecycleBoundaries(overrides = {}) {
  return {
    legacyProjectDoctorRuntimeImports: 0,
    legacyGeneratedStatusDependencies: 0,
    legacyActiveRegistryDependencies: 0,
    d1RuntimeDependencies: 0,
    d2RuntimeDependencies: 0,
    d3RuntimeDependencies: 0,
    d4RuntimeDependencies: 0,
    d5RuntimeDependencies: 0,
    d7RuntimeDependencies: 0,
    rawConfigDataReadCount: 0,
    semanticRecomputationCount: 0,
    canonicalJoinRecomputationCount: 0,
    domainValidatorExecutionCount: 0,
    projectStatusReadCount: 0,
    projectStatusWriteCount: 0,
    legacyGeneratedWriteCount: 0,
    productionWriterWorkflowActivated: false,
    producerDeclarationWriteCount: 0,
    statusSourceDeclarationWriteCount: 0,
    ...overrides,
  };
}
