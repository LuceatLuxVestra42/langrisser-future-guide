import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitStatusSource } from './submit-project-doctor-status-source.mjs';

export const DEFAULT_BRIDGE_CONTRACT = 'data/contracts/project-doctor-status-source-artifact-bridge.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const normalizeRepositoryPath = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');

export const parseBridgeArgs = argv => {
  const options = { check: true, all: false };
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
    if (arg === '--all') {
      options.all = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (!['--pipeline', '--id', '--source', '--note'].includes(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${arg}`);
    index += 1;
    if (arg === '--pipeline') options.pipelineId = value;
    else if (arg === '--id') options.entryId = value;
    else if (arg === '--source') options.sourcePath = normalizeRepositoryPath(value);
    else if (arg === '--note') options.note = value;
  }

  if (!options.help) {
    if (options.all && options.pipelineId) throw new Error('--all and --pipeline cannot be used together.');
    if (!options.all && !options.pipelineId) throw new Error('--pipeline or --all is required.');
    if (options.all && (options.entryId || options.sourcePath || options.note)) {
      throw new Error('--id, --source, and --note cannot override individual pipelines when --all is used.');
    }
    if ((options.entryId && !options.sourcePath) || (!options.entryId && options.sourcePath)) {
      throw new Error('--id and --source must be provided together for a candidate artifact.');
    }
  }
  return options;
};

export const validateBridgeContract = ({ contract, producerContract, registry }) => {
  const failures = [];
  if (contract.status !== 'DESIGN_FROZEN') failures.push({ type: 'BRIDGE_CONTRACT_NOT_FROZEN', actual: contract.status });
  if (producerContract.status !== 'DESIGN_FROZEN') failures.push({ type: 'PRODUCER_CONTRACT_NOT_FROZEN', actual: producerContract.status });
  if (registry.status !== 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY') failures.push({ type: 'ACTIVE_REGISTRY_NOT_PASS', actual: registry.status });

  const pipelines = Array.isArray(contract.pipelines) ? contract.pipelines : [];
  if (pipelines.length !== 6) failures.push({ type: 'PIPELINE_COUNT_MISMATCH', expected: 6, actual: pipelines.length });

  const duplicateValues = (key, type) => {
    const seen = new Set();
    for (const item of pipelines) {
      if (!item?.[key]) continue;
      if (seen.has(item[key])) failures.push({ type, key, value: item[key] });
      seen.add(item[key]);
    }
  };
  duplicateValues('id', 'DUPLICATE_PIPELINE_ID');
  duplicateValues('domain', 'DUPLICATE_PIPELINE_DOMAIN');
  duplicateValues('producerId', 'DUPLICATE_PIPELINE_PRODUCER');

  const producers = Array.isArray(producerContract.producers) ? producerContract.producers : [];
  for (const pipeline of pipelines) {
    const producer = producers.find(item => item.id === pipeline.producerId);
    if (!producer) {
      failures.push({ type: 'PIPELINE_PRODUCER_NOT_REGISTERED', pipelineId: pipeline.id, producerId: pipeline.producerId });
      continue;
    }
    if (producer.enabled !== true) failures.push({ type: 'PIPELINE_PRODUCER_DISABLED', pipelineId: pipeline.id, producerId: pipeline.producerId });
    if (pipeline.domain !== producer.domain) {
      failures.push({
        type: 'PIPELINE_DOMAIN_PRODUCER_MISMATCH',
        pipelineId: pipeline.id,
        pipelineDomain: pipeline.domain,
        producerDomain: producer.domain,
      });
    }
  }

  return { pass: failures.length === 0, failures };
};

export const validatePipelineBinding = ({ pipeline, producerContract, registry }) => {
  const failures = [];
  const producer = (producerContract.producers ?? []).find(item => item.id === pipeline.producerId);
  if (!producer) return { pass: false, failures: [{ type: 'PRODUCER_NOT_REGISTERED', producerId: pipeline.producerId }] };

  const baselineSourcePath = normalizeRepositoryPath(pipeline.baselineSourcePath);
  if (!fs.existsSync(baselineSourcePath)) failures.push({ type: 'BASELINE_SOURCE_MISSING', pipelineId: pipeline.id, sourcePath: baselineSourcePath });

  try {
    const sourcePattern = new RegExp(producer.allowedSourcePattern);
    if (!sourcePattern.test(baselineSourcePath)) {
      failures.push({
        type: 'BASELINE_SOURCE_OUTSIDE_PRODUCER_FAMILY',
        pipelineId: pipeline.id,
        sourcePath: baselineSourcePath,
        allowedSourcePattern: producer.allowedSourcePattern,
      });
    }
  } catch (error) {
    failures.push({ type: 'PRODUCER_SOURCE_PATTERN_INVALID', producerId: producer.id, error: error instanceof Error ? error.message : String(error) });
  }

  const active = registry.domains?.[pipeline.domain];
  if (!active) failures.push({ type: 'ACTIVE_DOMAIN_MISSING', pipelineId: pipeline.id, domain: pipeline.domain });
  else {
    if (active.selectedId !== pipeline.baselineEntryId) {
      failures.push({ type: 'BASELINE_ENTRY_NOT_ACTIVE', pipelineId: pipeline.id, expected: pipeline.baselineEntryId, actual: active.selectedId });
    }
    if (normalizeRepositoryPath(active.sourcePath) !== baselineSourcePath) {
      failures.push({ type: 'BASELINE_SOURCE_NOT_ACTIVE', pipelineId: pipeline.id, expected: baselineSourcePath, actual: active.sourcePath });
    }
  }

  if (pipeline.expectedSourceStatus && fs.existsSync(baselineSourcePath)) {
    const source = readJson(baselineSourcePath);
    if (source.status !== pipeline.expectedSourceStatus) {
      failures.push({
        type: 'BASELINE_SOURCE_STATUS_MISMATCH',
        pipelineId: pipeline.id,
        expected: pipeline.expectedSourceStatus,
        actual: source.status,
      });
    }
  }

  return { pass: failures.length === 0, failures };
};

export const bridgeStatusSource = (options, runtime = {}) => {
  const contractPath = runtime.contractPath ?? DEFAULT_BRIDGE_CONTRACT;
  const contract = runtime.contract ?? readJson(contractPath);
  const producerContract = runtime.producerContract ?? readJson(contract.producerContract);
  const registry = runtime.registry ?? readJson(contract.activeRegistry);

  const contractValidation = validateBridgeContract({ contract, producerContract, registry });
  if (!contractValidation.pass) throw new Error(`Artifact bridge contract blocked: ${JSON.stringify(contractValidation.failures)}`);

  const pipelines = options.all
    ? contract.pipelines
    : contract.pipelines.filter(item => item.id === options.pipelineId);
  if (pipelines.length === 0) throw new Error(`Pipeline not registered: ${options.pipelineId}`);

  const results = [];
  for (const pipeline of pipelines) {
    const bindingValidation = validatePipelineBinding({ pipeline, producerContract, registry });
    if (!bindingValidation.pass) throw new Error(`Artifact bridge binding blocked: ${JSON.stringify(bindingValidation.failures)}`);

    const entryId = options.entryId ?? pipeline.baselineEntryId;
    const sourcePath = options.sourcePath ?? normalizeRepositoryPath(pipeline.baselineSourcePath);
    const promotionOptions = {
      id: entryId,
      sourcePath,
      check: options.check !== false,
      ...(options.note ? { note: options.note } : {}),
    };

    const submission = (runtime.submit ?? submitStatusSource)(
      { producerId: pipeline.producerId, promotionOptions },
      runtime.submissionRuntime ?? {},
    );
    results.push({
      pipelineId: pipeline.id,
      domain: pipeline.domain,
      producerId: pipeline.producerId,
      entryId,
      sourcePath,
      mode: promotionOptions.check ? 'CHECK_ONLY' : 'APPLY',
      submission,
    });
  }

  return {
    version: 1,
    schemaId: 'project-doctor-status-source-artifact-bridge-result/v1',
    stage: 'PROJECT-STATUS-STAGE5',
    status: options.check === false ? 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_APPLY' : 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_CHECK',
    completion: 'COMPLETE',
    pipelineCount: results.length,
    results,
    boundaries: {
      rawConfigDataRead: false,
      semanticRecomputation: false,
      canonicalJoinRecomputation: false,
      owningValidatorExecution: false,
      filenameAuthorityInference: false,
      stageNumberAuthorityInference: false,
      chronologyAuthorityInference: false,
    },
  };
};

const usage = () => {
  console.log('Usage: node scripts/bridge-project-doctor-status-source.mjs (--pipeline <pipeline-id> | --all) [--id <entry-id> --source <validated-json>] [--check | --apply] [--note text]');
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseBridgeArgs(process.argv.slice(2));
    if (options.help) usage();
    else console.log(JSON.stringify(bridgeStatusSource(options), null, 2));
  } catch (error) {
    console.error(`[status-source-artifact-bridge] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
