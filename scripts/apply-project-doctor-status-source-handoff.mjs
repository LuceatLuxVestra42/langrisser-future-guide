import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bridgeStatusSource } from './bridge-project-doctor-status-source.mjs';
import { refreshFreshness } from './run-project-doctor-d5-refresh-active.mjs';
import { validateFreshness } from './validate-project-doctor-d5.mjs';

export const DEFAULT_HANDOFF_CONTRACT = 'data/contracts/project-doctor-status-source-stage6-3-apply-handoff.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const normalizeRepositoryPath = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');

export const parseHandoffArgs = argv => {
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
    if (!['--pipeline', '--expected-predecessor', '--id', '--source', '--note'].includes(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${arg}`);
    index += 1;
    if (arg === '--pipeline') options.pipelineId = value;
    else if (arg === '--expected-predecessor') options.expectedPredecessorId = value;
    else if (arg === '--id') options.entryId = value;
    else if (arg === '--source') options.sourcePath = normalizeRepositoryPath(value);
    else if (arg === '--note') options.note = value;
  }
  if (!options.help) {
    for (const [flag, value] of [
      ['--pipeline', options.pipelineId],
      ['--expected-predecessor', options.expectedPredecessorId],
      ['--id', options.entryId],
      ['--source', options.sourcePath],
    ]) {
      if (!value) throw new Error(`${flag} is required.`);
    }
  }
  return options;
};

const gitOk = args => spawnSync('git', args, { stdio: 'ignore', shell: false }).status === 0;

export const verifyCommittedSource = sourcePath => {
  const normalized = normalizeRepositoryPath(sourcePath);
  if (!normalized || !fs.existsSync(normalized)) {
    return { pass: false, reason: 'SOURCE_MISSING', sourcePath: normalized };
  }
  if (!gitOk(['cat-file', '-e', `HEAD:${normalized}`])) {
    return { pass: false, reason: 'SOURCE_NOT_COMMITTED_AT_HEAD', sourcePath: normalized };
  }
  if (!gitOk(['diff', '--quiet', '--', normalized]) || !gitOk(['diff', '--cached', '--quiet', '--', normalized])) {
    return { pass: false, reason: 'SOURCE_WORKTREE_NOT_CLEAN', sourcePath: normalized };
  }
  return { pass: true, sourcePath: normalized };
};

const fileSnapshot = filePath => fs.existsSync(filePath)
  ? { exists: true, content: fs.readFileSync(filePath).toString('base64') }
  : { exists: false, content: null };

export const snapshotRepositoryState = contract => {
  const statusDirectory = 'data/status-sources';
  const statusSourceFiles = fs.existsSync(statusDirectory)
    ? fs.readdirSync(statusDirectory).filter(name => name.endsWith('.json')).sort()
      .map(name => path.posix.join(statusDirectory, name))
    : [];
  return {
    statusSourceFiles: Object.fromEntries(statusSourceFiles.map(filePath => [filePath, fileSnapshot(filePath)])),
    mutablePaths: Object.fromEntries((contract.mutablePaths ?? []).map(filePath => [filePath, fileSnapshot(filePath)])),
  };
};

const restoreFile = (filePath, snapshot) => {
  if (snapshot.exists) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(snapshot.content, 'base64'));
  } else if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

export const restoreRepositoryState = snapshot => {
  const statusDirectory = 'data/status-sources';
  const previous = new Set(Object.keys(snapshot.statusSourceFiles ?? {}));
  if (fs.existsSync(statusDirectory)) {
    for (const name of fs.readdirSync(statusDirectory).filter(item => item.endsWith('.json'))) {
      const filePath = path.posix.join(statusDirectory, name);
      if (!previous.has(filePath)) fs.unlinkSync(filePath);
    }
  }
  for (const [filePath, meta] of Object.entries(snapshot.statusSourceFiles ?? {})) restoreFile(filePath, meta);
  for (const [filePath, meta] of Object.entries(snapshot.mutablePaths ?? {})) restoreFile(filePath, meta);
};

const defaultProjectStatusCheck = () => {
  const result = spawnSync(process.execPath, ['scripts/build-project-status.mjs', '--check'], { stdio: 'inherit', shell: false });
  return { pass: result.status === 0, exitCode: result.status ?? 1, error: result.error?.message ?? null };
};

const validateContracts = ({ contract, stage6_2, bridgeContract }) => {
  const failures = [];
  if (contract.status !== 'DESIGN_FROZEN') failures.push({ type: 'HANDOFF_CONTRACT_NOT_FROZEN', actual: contract.status });
  if (stage6_2.status !== 'DESIGN_FROZEN') failures.push({ type: 'STAGE6_2_CONTRACT_NOT_FROZEN', actual: stage6_2.status });
  if (bridgeContract.status !== 'DESIGN_FROZEN') failures.push({ type: 'BRIDGE_CONTRACT_NOT_FROZEN', actual: bridgeContract.status });
  for (const pipeline of contract.pipelines ?? []) {
    const stage6Pipeline = (stage6_2.pipelines ?? []).find(item => item.pipelineId === pipeline.pipelineId);
    const bridgePipeline = (bridgeContract.pipelines ?? []).find(item => item.id === pipeline.pipelineId);
    if (!stage6Pipeline || stage6Pipeline.producerId !== pipeline.producerId || stage6Pipeline.workflowPath !== pipeline.completionWorkflow) {
      failures.push({ type: 'STAGE6_2_PIPELINE_MISMATCH', pipelineId: pipeline.pipelineId });
    }
    if (!bridgePipeline || bridgePipeline.domain !== pipeline.domain || bridgePipeline.producerId !== pipeline.producerId) {
      failures.push({ type: 'STAGE5_PIPELINE_MISMATCH', pipelineId: pipeline.pipelineId });
    }
  }
  return { pass: failures.length === 0, failures };
};

const selectedIdFor = (registry, domain) => registry?.domains?.[domain]?.selectedId ?? null;

const requireCas = ({ registry, domain, expectedPredecessorId, phase }) => {
  const actual = selectedIdFor(registry, domain);
  if (actual !== expectedPredecessorId) {
    throw new Error(`CAS predecessor mismatch at ${phase}: expected ${expectedPredecessorId}, actual ${actual}`);
  }
  return actual;
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

export const handoffStatusSource = (options, runtime = {}) => {
  const contract = runtime.contract ?? readJson(runtime.contractPath ?? DEFAULT_HANDOFF_CONTRACT);
  const stage6_2 = runtime.stage6_2 ?? readJson(contract.stage6_2Contract);
  const bridgeContract = runtime.bridgeContract ?? readJson(contract.bridgeContract);
  const contractValidation = validateContracts({ contract, stage6_2, bridgeContract });
  if (!contractValidation.pass) throw new Error(`Stage 6-3 contract blocked: ${JSON.stringify(contractValidation.failures)}`);

  const pipeline = (contract.pipelines ?? []).find(item => item.pipelineId === options.pipelineId);
  if (!pipeline) throw new Error(`Stage 6-3 pipeline not registered: ${options.pipelineId}`);

  const sourcePath = normalizeRepositoryPath(options.sourcePath);
  const verifySource = runtime.verifyCommittedSource ?? verifyCommittedSource;
  const sourceVerification = verifySource(sourcePath);
  if (!sourceVerification.pass) throw new Error(`Candidate source blocked: ${JSON.stringify(sourceVerification)}`);

  const loadRegistry = runtime.loadRegistry ?? (() => readJson(contract.activeRegistry));
  const bridge = runtime.bridge ?? bridgeStatusSource;
  const refresh = runtime.refresh ?? (() => refreshFreshness({ contractPath: contract.d5Contract }));
  const freshnessValidate = runtime.validateFreshness ?? (() => validateFreshness({ contractPath: contract.d5Contract }));
  const projectStatusCheck = runtime.projectStatusCheck ?? defaultProjectStatusCheck;
  const snapshot = runtime.snapshot ?? (() => snapshotRepositoryState(contract));
  const restore = runtime.restore ?? restoreRepositoryState;

  const currentRegistry = loadRegistry();
  requireCas({
    registry: currentRegistry,
    domain: pipeline.domain,
    expectedPredecessorId: options.expectedPredecessorId,
    phase: 'PREVIEW',
  });

  const bridgeOptions = {
    pipelineId: pipeline.pipelineId,
    entryId: options.entryId,
    sourcePath,
    ...(options.note ? { note: options.note } : {}),
  };
  const preview = bridge({ ...bridgeOptions, check: true });
  validateBridgeResult({ result: preview, mode: 'CHECK_ONLY', entryId: options.entryId });

  if (options.check !== false) {
    return {
      version: 1,
      schemaId: 'project-doctor-status-source-stage6-3-handoff-result/v1',
      stage: 'PROJECT-STATUS-STAGE6-3',
      status: 'PASS_STATUS_SOURCE_STAGE6_3_HANDOFF_CHECK',
      completion: 'COMPLETE',
      mode: 'CHECK_ONLY',
      pipelineId: pipeline.pipelineId,
      domain: pipeline.domain,
      expectedPredecessorId: options.expectedPredecessorId,
      entryId: options.entryId,
      sourcePath,
      writePerformed: false,
      preview,
      boundaries: {
        d5ResealPerformed: false,
        rawConfigDataRead: false,
        semanticRecomputation: false,
        canonicalJoinRecomputation: false,
      },
    };
  }

  const beforeApplyRegistry = loadRegistry();
  requireCas({
    registry: beforeApplyRegistry,
    domain: pipeline.domain,
    expectedPredecessorId: options.expectedPredecessorId,
    phase: 'APPLY',
  });

  const repositorySnapshot = snapshot();
  try {
    const applied = bridge({ ...bridgeOptions, check: false });
    const appliedResult = validateBridgeResult({ result: applied, mode: 'APPLY', entryId: options.entryId });

    const postApplyRegistry = loadRegistry();
    const postSelectedId = selectedIdFor(postApplyRegistry, pipeline.domain);
    if (postSelectedId !== options.entryId) {
      throw new Error(`Post-apply registry selected ${postSelectedId}, expected ${options.entryId}`);
    }

    const refreshResult = refresh();
    if (refreshResult?.status !== 'PASS_PROJECT_DOCTOR_D5_REFRESH' || refreshResult?.exitCode !== 0) {
      throw new Error(`D5 explicit refresh failed: ${JSON.stringify(refreshResult)}`);
    }
    const freshness = freshnessValidate();
    if (freshness?.status !== 'FRESH' || freshness?.exitCode !== 0) {
      throw new Error(`D5 freshness validation failed after apply: ${JSON.stringify(freshness)}`);
    }
    const projectStatus = projectStatusCheck();
    if (!projectStatus?.pass) {
      throw new Error(`Project Status projection is not current after apply: ${JSON.stringify(projectStatus)}`);
    }

    return {
      version: 1,
      schemaId: 'project-doctor-status-source-stage6-3-handoff-result/v1',
      stage: 'PROJECT-STATUS-STAGE6-3',
      status: 'PASS_STATUS_SOURCE_STAGE6_3_HANDOFF_APPLY',
      completion: 'COMPLETE',
      mode: 'APPLY',
      pipelineId: pipeline.pipelineId,
      domain: pipeline.domain,
      expectedPredecessorId: options.expectedPredecessorId,
      entryId: options.entryId,
      sourcePath,
      writePerformed: appliedResult.promotion?.writePerformed === true,
      alreadyActive: appliedResult.promotion?.alreadyActive === true,
      applied,
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
      throw new Error(`Stage 6-3 apply failed and rollback also failed. apply=${error instanceof Error ? error.message : String(error)} rollback=${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    throw new Error(`Stage 6-3 apply failed; working tree rolled back. ${error instanceof Error ? error.message : String(error)}`);
  }
};

const usage = () => {
  console.log('Usage: node scripts/apply-project-doctor-status-source-handoff.mjs --pipeline <hero|soldier> --expected-predecessor <active-entry-id> --id <entry-id> --source <validated-json> [--note text] [--check|--apply]');
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseHandoffArgs(process.argv.slice(2));
    if (options.help) usage();
    else console.log(JSON.stringify(handoffStatusSource(options), null, 2));
  } catch (error) {
    console.error(`[status-source-stage6-3-handoff] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
