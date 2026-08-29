import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCommittedSource } from './apply-project-doctor-status-source-handoff.mjs';

export const DEFAULT_STAGE6_4_CONTRACT = 'data/contracts/project-doctor-status-source-stage6-4-producer-declarations.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const normalizeRepositoryPath = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
const safeId = value => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value ?? ''));

export const parseDeclarationArgs = argv => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--github-output') {
      options.githubOutput = true;
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

const validateFrozenBindings = ({ contract, stage6_3 }) => {
  if (contract.status !== 'DESIGN_FROZEN') throw new Error(`Stage 6-4 contract is not frozen: ${contract.status}`);
  if (stage6_3.status !== 'DESIGN_FROZEN') throw new Error(`Stage 6-3 contract is not frozen: ${stage6_3.status}`);
};

export const resolveStatusSourceDeclaration = (options, runtime = {}) => {
  const contract = runtime.contract ?? readJson(runtime.contractPath ?? DEFAULT_STAGE6_4_CONTRACT);
  const stage6_3 = runtime.stage6_3 ?? readJson(contract.stage6_3Contract);
  const registry = runtime.registry ?? readJson(contract.activeRegistry);
  validateFrozenBindings({ contract, stage6_3 });

  const pipeline = (contract.pipelines ?? []).find(item => item.pipelineId === options.pipelineId);
  if (!pipeline) throw new Error(`Stage 6-4 pipeline not registered: ${options.pipelineId}`);
  const stage6Pipeline = (stage6_3.pipelines ?? []).find(item => item.pipelineId === pipeline.pipelineId);
  if (!stage6Pipeline || stage6Pipeline.domain !== pipeline.domain || stage6Pipeline.producerId !== pipeline.producerId || stage6Pipeline.completionWorkflow !== pipeline.completionWorkflow) {
    throw new Error(`Stage 6-4 binding mismatch for ${pipeline.pipelineId}`);
  }

  const declarationPath = normalizeRepositoryPath(pipeline.declarationPath);
  const declaration = runtime.declaration ?? readJson(declarationPath);
  const expectedState = contract.policy?.declarationState;
  const failures = [];
  if (declaration.schemaId !== 'project-doctor-status-source-stage6-4-producer-declaration/v1') failures.push('schemaId');
  if (declaration.stage !== 'PROJECT-STATUS-STAGE6-4') failures.push('stage');
  if (declaration.state !== expectedState) failures.push('state');
  if (declaration.pipelineId !== pipeline.pipelineId) failures.push('pipelineId');
  if (declaration.domain !== pipeline.domain) failures.push('domain');
  if (declaration.producerId !== pipeline.producerId) failures.push('producerId');
  if (declaration.requestedByWorkflow !== pipeline.completionWorkflow) failures.push('requestedByWorkflow');
  if (declaration.authorityDecision !== 'EXPLICIT_PRODUCER_DECLARATION') failures.push('authorityDecision');
  if (!safeId(declaration.predecessorId)) failures.push('predecessorId');
  if (!safeId(declaration.entryId)) failures.push('entryId');
  const sourcePath = normalizeRepositoryPath(declaration.sourcePath);
  if (!sourcePath.startsWith('data/validation/') || !sourcePath.endsWith('.json')) failures.push('sourcePath');
  if (failures.length > 0) throw new Error(`Stage 6-4 declaration blocked (${pipeline.pipelineId}): ${failures.join(',')}`);

  const active = registry?.domains?.[pipeline.domain];
  if (!active?.selectedId || !active?.sourcePath) throw new Error(`Active registry domain missing: ${pipeline.domain}`);
  if (declaration.predecessorId !== active.selectedId) {
    throw new Error(`Stage 6-4 stale predecessor: expected active ${active.selectedId}, declaration ${declaration.predecessorId}`);
  }
  if (declaration.entryId === declaration.predecessorId && sourcePath !== normalizeRepositoryPath(active.sourcePath)) {
    throw new Error(`Stage 6-4 idempotent declaration source mismatch: active ${active.sourcePath}, declaration ${sourcePath}`);
  }

  const verify = runtime.verifyCommittedSource ?? verifyCommittedSource;
  const declarationVerification = verify(declarationPath);
  if (!declarationVerification.pass) throw new Error(`Stage 6-4 declaration file blocked: ${JSON.stringify(declarationVerification)}`);
  const sourceVerification = verify(sourcePath);
  if (!sourceVerification.pass) throw new Error(`Stage 6-4 candidate source blocked: ${JSON.stringify(sourceVerification)}`);

  return {
    version: 1,
    schemaId: 'project-doctor-status-source-stage6-4-declaration-result/v1',
    stage: 'PROJECT-STATUS-STAGE6-4',
    status: 'PASS_STATUS_SOURCE_STAGE6_4_DECLARATION',
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
    boundaries: {
      authorityInference: false,
      rawConfigDataRead: false,
      semanticRecomputation: false,
      canonicalJoinRecomputation: false,
    },
  };
};

export const writeGitHubOutput = (result, outputPath = process.env.GITHUB_OUTPUT) => {
  if (!outputPath) throw new Error('GITHUB_OUTPUT is not available.');
  const values = {
    ready: 'true',
    pipeline: result.pipelineId,
    expected_predecessor: result.expectedPredecessorId,
    entry_id: result.entryId,
    source_path: result.sourcePath,
  };
  for (const [key, value] of Object.entries(values)) {
    const text = String(value);
    if (text.includes('\n') || text.includes('\r')) throw new Error(`Unsafe GitHub output value for ${key}`);
    fs.appendFileSync(outputPath, `${key}=${text}\n`);
  }
  return values;
};

const usage = () => console.log('Usage: node scripts/resolve-project-doctor-status-source-declaration.mjs --pipeline <hero|soldier> [--github-output]');
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseDeclarationArgs(process.argv.slice(2));
    if (options.help) usage();
    else {
      const result = resolveStatusSourceDeclaration(options);
      if (options.githubOutput) writeGitHubOutput(result);
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(`[status-source-stage6-4-declaration] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
