import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCommittedSource } from './apply-project-doctor-status-source-handoff.mjs';

export const DEFAULT_STAGE6_5_CONTRACT = 'data/contracts/project-doctor-status-source-stage6-5-closeout-requests.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const normalizeRepositoryPath = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
const safeId = value => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value ?? ''));

export const parseCloseoutRequestArgs = argv => {
  const options = { check: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      options.check = true;
      continue;
    }
    if (arg === '--write') {
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

const validateFrozenBindings = ({ contract, stage6_4, registry }) => {
  if (contract.status !== 'DESIGN_FROZEN') throw new Error(`Stage 6-5 contract is not frozen: ${contract.status}`);
  if (stage6_4.status !== 'DESIGN_FROZEN') throw new Error(`Stage 6-4 contract is not frozen: ${stage6_4.status}`);
  if (registry.status !== 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY') throw new Error(`Active Source Registry is not accepted: ${registry.status}`);
};

const buildDeclaration = ({ request, stage6_4 }) => ({
  version: 1,
  schemaId: 'project-doctor-status-source-stage6-4-producer-declaration/v1',
  stage: 'PROJECT-STATUS-STAGE6-4',
  state: stage6_4.policy.declarationState,
  pipelineId: request.pipelineId,
  domain: request.domain,
  producerId: request.producerId,
  requestedByWorkflow: request.requestedByWorkflow,
  predecessorId: request.predecessorId,
  entryId: request.entryId,
  sourcePath: normalizeRepositoryPath(request.sourcePath),
  authorityDecision: 'EXPLICIT_PRODUCER_DECLARATION',
  note: request.declarationNote,
});

export const renderCloseoutRequest = (options, runtime = {}) => {
  const contract = runtime.contract ?? readJson(runtime.contractPath ?? DEFAULT_STAGE6_5_CONTRACT);
  const stage6_4 = runtime.stage6_4 ?? readJson(contract.stage6_4Contract);
  const registry = runtime.registry ?? readJson(contract.activeRegistry);
  validateFrozenBindings({ contract, stage6_4, registry });

  const pipeline = (contract.pipelines ?? []).find(item => item.pipelineId === options.pipelineId);
  if (!pipeline) throw new Error(`Stage 6-5 pipeline not registered: ${options.pipelineId}`);
  const stage6Pipeline = (stage6_4.pipelines ?? []).find(item => item.pipelineId === pipeline.pipelineId);
  if (!stage6Pipeline || stage6Pipeline.domain !== pipeline.domain || stage6Pipeline.producerId !== pipeline.producerId || stage6Pipeline.completionWorkflow !== pipeline.completionWorkflow || normalizeRepositoryPath(stage6Pipeline.declarationPath) !== normalizeRepositoryPath(pipeline.declarationPath)) {
    throw new Error(`Stage 6-5 binding mismatch for ${pipeline.pipelineId}`);
  }

  const requestPath = normalizeRepositoryPath(pipeline.requestPath);
  const declarationPath = normalizeRepositoryPath(pipeline.declarationPath);
  const request = runtime.request ?? readJson(requestPath);
  const failures = [];
  if (request.schemaId !== 'project-doctor-status-source-stage6-5-closeout-request/v1') failures.push('schemaId');
  if (request.stage !== 'PROJECT-STATUS-STAGE6-5') failures.push('stage');
  if (request.state !== contract.policy.requestState) failures.push('state');
  if (request.pipelineId !== pipeline.pipelineId) failures.push('pipelineId');
  if (request.domain !== pipeline.domain) failures.push('domain');
  if (request.producerId !== pipeline.producerId) failures.push('producerId');
  if (request.requestedByWorkflow !== pipeline.completionWorkflow) failures.push('requestedByWorkflow');
  if (normalizeRepositoryPath(request.declarationPath) !== declarationPath) failures.push('declarationPath');
  if (request.authorityDecision !== 'EXPLICIT_CLOSEOUT_REQUEST') failures.push('authorityDecision');
  if (!safeId(request.predecessorId)) failures.push('predecessorId');
  if (!safeId(request.entryId)) failures.push('entryId');
  const sourcePath = normalizeRepositoryPath(request.sourcePath);
  if (!sourcePath.startsWith('data/validation/') || !sourcePath.endsWith('.json')) failures.push('sourcePath');
  if (typeof request.declarationNote !== 'string' || request.declarationNote.trim().length === 0 || /[\r\n]/.test(request.declarationNote)) failures.push('declarationNote');
  if (failures.length > 0) throw new Error(`Stage 6-5 closeout request blocked (${pipeline.pipelineId}): ${failures.join(',')}`);

  const active = registry?.domains?.[pipeline.domain];
  if (!active?.selectedId || !active?.sourcePath) throw new Error(`Active registry domain missing: ${pipeline.domain}`);
  if (request.predecessorId !== active.selectedId) {
    throw new Error(`Stage 6-5 stale predecessor: expected active ${active.selectedId}, request ${request.predecessorId}`);
  }
  if (request.entryId === request.predecessorId && sourcePath !== normalizeRepositoryPath(active.sourcePath)) {
    throw new Error(`Stage 6-5 idempotent request source mismatch: active ${active.sourcePath}, request ${sourcePath}`);
  }

  const verify = runtime.verifyCommittedSource ?? verifyCommittedSource;
  const requestVerification = verify(requestPath);
  if (!requestVerification.pass) throw new Error(`Stage 6-5 request file blocked: ${JSON.stringify(requestVerification)}`);
  const sourceVerification = verify(sourcePath);
  if (!sourceVerification.pass) throw new Error(`Stage 6-5 candidate source blocked: ${JSON.stringify(sourceVerification)}`);

  const declaration = buildDeclaration({ request: { ...request, sourcePath }, stage6_4 });
  const expectedText = `${JSON.stringify(declaration, null, 2)}\n`;
  const readDeclaration = runtime.readDeclaration ?? (filePath => fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null);
  const actualText = readDeclaration(declarationPath);
  const projectionCurrent = actualText === expectedText;

  let writePerformed = false;
  if (options.check !== false) {
    if (!projectionCurrent) throw new Error(`Stage 6-5 declaration projection stale (${pipeline.pipelineId}): ${declarationPath}`);
  } else if (!projectionCurrent) {
    const writeDeclaration = runtime.writeDeclaration ?? ((filePath, content) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    });
    writeDeclaration(declarationPath, expectedText);
    writePerformed = true;
  }

  return {
    version: 1,
    schemaId: 'project-doctor-status-source-stage6-5-closeout-request-result/v1',
    stage: 'PROJECT-STATUS-STAGE6-5',
    status: options.check !== false ? 'PASS_STATUS_SOURCE_STAGE6_5_CLOSEOUT_REQUEST_CHECK' : 'PASS_STATUS_SOURCE_STAGE6_5_CLOSEOUT_REQUEST_RENDER',
    completion: 'COMPLETE',
    pipelineId: pipeline.pipelineId,
    domain: pipeline.domain,
    producerId: pipeline.producerId,
    requestPath,
    declarationPath,
    expectedPredecessorId: request.predecessorId,
    entryId: request.entryId,
    sourcePath,
    idempotentBaseline: request.entryId === active.selectedId && sourcePath === normalizeRepositoryPath(active.sourcePath),
    projectionCurrent,
    writePerformed,
    boundaries: {
      authorityInference: false,
      promotionPerformed: false,
      rawConfigDataRead: false,
      semanticRecomputation: false,
      canonicalJoinRecomputation: false
    }
  };
};

const usage = () => console.log('Usage: node scripts/render-project-doctor-status-source-closeout-request.mjs --pipeline <hero|soldier> [--check|--write]');
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseCloseoutRequestArgs(process.argv.slice(2));
    if (options.help) usage();
    else console.log(JSON.stringify(renderCloseoutRequest(options), null, 2));
  } catch (error) {
    console.error(`[status-source-stage6-5-closeout-request] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
