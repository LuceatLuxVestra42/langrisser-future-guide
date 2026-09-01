import fs from 'node:fs';
import {
  assertRepositoryPath,
  selectActiveSources,
} from './select-active-sources.mjs';
import {
  loadProducerGateContract,
  submitStatusSource,
} from './submit-status-source.mjs';

export const DEFAULT_BRIDGE_CONTRACT = 'tools/status-source/contracts/artifact-bridge.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const normalizeRepositoryPath = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');

export function loadArtifactBridgeContract({
  repoRoot = process.cwd(),
  contractPath = DEFAULT_BRIDGE_CONTRACT,
} = {}) {
  const contract = readJson(assertRepositoryPath(repoRoot, contractPath));
  if (contract?.schemaId !== 'status-source-artifact-bridge/v1') {
    throw new Error(`Unsupported artifact bridge schema: ${contract?.schemaId ?? 'missing'}`);
  }
  if (contract.status !== 'DESIGN_FROZEN') {
    throw new Error(`Artifact bridge contract is not frozen: ${contract.status ?? 'missing'}`);
  }
  return contract;
}

function duplicateFailures(items, key, type) {
  const failures = [];
  const seen = new Set();
  for (const item of items) {
    const value = item?.[key];
    if (!value) continue;
    if (seen.has(value)) failures.push({ type, key, value });
    seen.add(value);
  }
  return failures;
}

export function validateArtifactBridge({
  contract,
  producerContract,
  selection,
  repoRoot = process.cwd(),
} = {}) {
  const failures = [];
  if (contract?.schemaId !== 'status-source-artifact-bridge/v1') {
    failures.push({ type: 'BRIDGE_CONTRACT_SCHEMA_INVALID', actual: contract?.schemaId ?? null });
  }
  if (contract?.status !== 'DESIGN_FROZEN') {
    failures.push({ type: 'BRIDGE_CONTRACT_NOT_FROZEN', actual: contract?.status ?? null });
  }
  if (producerContract?.schemaId !== 'status-source-producer-gate/v1') {
    failures.push({ type: 'PRODUCER_CONTRACT_SCHEMA_INVALID', actual: producerContract?.schemaId ?? null });
  }
  if (producerContract?.status !== 'DESIGN_FROZEN') {
    failures.push({ type: 'PRODUCER_CONTRACT_NOT_FROZEN', actual: producerContract?.status ?? null });
  }
  if (selection?.status !== 'PASS') {
    failures.push({ type: 'R1_1_SELECTION_NOT_PASS', actual: selection?.status ?? null });
  }

  const pipelines = Array.isArray(contract?.pipelines) ? contract.pipelines : [];
  if (pipelines.length !== 6) {
    failures.push({ type: 'PIPELINE_COUNT_MISMATCH', expected: 6, actual: pipelines.length });
  }
  failures.push(...duplicateFailures(pipelines, 'id', 'DUPLICATE_PIPELINE_ID'));
  failures.push(...duplicateFailures(pipelines, 'domain', 'DUPLICATE_PIPELINE_DOMAIN'));
  failures.push(...duplicateFailures(pipelines, 'producerId', 'DUPLICATE_PIPELINE_PRODUCER'));

  const producers = Array.isArray(producerContract?.producers) ? producerContract.producers : [];
  for (const pipeline of pipelines) {
    const producer = producers.find(item => item.id === pipeline.producerId);
    if (!producer) {
      failures.push({ type: 'PIPELINE_PRODUCER_NOT_REGISTERED', pipelineId: pipeline.id, producerId: pipeline.producerId });
      continue;
    }
    if (producer.enabled !== true) {
      failures.push({ type: 'PIPELINE_PRODUCER_DISABLED', pipelineId: pipeline.id, producerId: producer.id });
    }
    if (pipeline.domain !== producer.domain) {
      failures.push({
        type: 'PIPELINE_DOMAIN_PRODUCER_MISMATCH',
        pipelineId: pipeline.id,
        pipelineDomain: pipeline.domain,
        producerDomain: producer.domain,
      });
    }

    const baselineSourcePath = normalizeRepositoryPath(pipeline.baselineSourcePath);
    try {
      const absolute = assertRepositoryPath(repoRoot, baselineSourcePath);
      if (!fs.existsSync(absolute)) {
        failures.push({ type: 'BASELINE_SOURCE_MISSING', pipelineId: pipeline.id, sourcePath: baselineSourcePath });
      } else if (pipeline.expectedSourceStatus) {
        const source = readJson(absolute);
        if (source.status !== pipeline.expectedSourceStatus) {
          failures.push({
            type: 'BASELINE_SOURCE_STATUS_MISMATCH',
            pipelineId: pipeline.id,
            expected: pipeline.expectedSourceStatus,
            actual: source.status,
          });
        }
      }
    } catch (error) {
      failures.push({
        type: 'BASELINE_SOURCE_PATH_INVALID',
        pipelineId: pipeline.id,
        sourcePath: baselineSourcePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const pattern = new RegExp(producer.allowedSourcePattern);
      if (!pattern.test(baselineSourcePath)) {
        failures.push({
          type: 'BASELINE_SOURCE_OUTSIDE_PRODUCER_FAMILY',
          pipelineId: pipeline.id,
          sourcePath: baselineSourcePath,
          allowedSourcePattern: producer.allowedSourcePattern,
        });
      }
    } catch (error) {
      failures.push({
        type: 'PRODUCER_SOURCE_PATTERN_INVALID',
        producerId: producer.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const active = selection?.domains?.[pipeline.domain];
    if (!active) {
      failures.push({ type: 'ACTIVE_DOMAIN_MISSING', pipelineId: pipeline.id, domain: pipeline.domain });
    } else {
      if (active.selectedId !== pipeline.baselineEntryId) {
        failures.push({
          type: 'BASELINE_ENTRY_NOT_ACTIVE',
          pipelineId: pipeline.id,
          expected: pipeline.baselineEntryId,
          actual: active.selectedId,
        });
      }
      if (normalizeRepositoryPath(active.sourcePath) !== baselineSourcePath) {
        failures.push({
          type: 'BASELINE_SOURCE_NOT_ACTIVE',
          pipelineId: pipeline.id,
          expected: baselineSourcePath,
          actual: active.sourcePath,
        });
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    pipelineCount: pipelines.length,
  };
}

export function bridgeStatusSource(options = {}, runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const contract = runtime.contract ?? loadArtifactBridgeContract({
    repoRoot,
    contractPath: runtime.contractPath ?? DEFAULT_BRIDGE_CONTRACT,
  });
  const producerContract = runtime.producerContract ?? loadProducerGateContract({
    repoRoot,
    contractPath: contract.producerContract,
  });
  const selection = runtime.selection ?? selectActiveSources({ repoRoot });

  const validation = validateArtifactBridge({ contract, producerContract, selection, repoRoot });
  if (!validation.pass) throw new Error(`Artifact bridge blocked: ${JSON.stringify(validation.failures)}`);

  if (options.all && options.pipelineId) throw new Error('--all and pipelineId cannot be used together.');
  if (!options.all && !options.pipelineId) throw new Error('pipelineId or all=true is required.');
  if (options.all && (options.entryId || options.sourcePath || options.note)) {
    throw new Error('Candidate overrides cannot be used with all=true.');
  }
  if ((options.entryId && !options.sourcePath) || (!options.entryId && options.sourcePath)) {
    throw new Error('entryId and sourcePath must be provided together.');
  }

  const pipelines = options.all
    ? contract.pipelines
    : contract.pipelines.filter(item => item.id === options.pipelineId);
  if (!pipelines.length) throw new Error(`Pipeline not registered: ${options.pipelineId}`);

  const results = [];
  for (const pipeline of pipelines) {
    const entryId = options.entryId ?? pipeline.baselineEntryId;
    const sourcePath = normalizeRepositoryPath(options.sourcePath ?? pipeline.baselineSourcePath);
    const promotionOptions = {
      id: entryId,
      sourcePath,
      apply: options.apply === true,
      ...(options.note ? { note: options.note } : {}),
    };
    const submissionRuntime = {
      repoRoot,
      contract: producerContract,
      ...(runtime.submissionRuntime ?? {}),
    };
    const submission = (runtime.submit ?? submitStatusSource)(
      { producerId: pipeline.producerId, promotionOptions },
      submissionRuntime,
    );
    results.push({
      pipelineId: pipeline.id,
      domain: pipeline.domain,
      producerId: pipeline.producerId,
      semanticRole: pipeline.semanticRole,
      entryId,
      sourcePath,
      mode: promotionOptions.apply ? 'APPLY' : 'CHECK',
      submission,
    });
  }

  const declarationWrites = results.reduce(
    (sum, item) => sum + Number(item.submission?.boundaries?.statusSourceDeclarationWriteCount ?? 0),
    0,
  );

  return {
    version: 1,
    schemaId: 'status-source-artifact-bridge-result/v1',
    stage: 'R1-4',
    status: options.apply === true
      ? 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_APPLY'
      : 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_CHECK',
    completion: 'COMPLETE',
    mode: options.apply === true ? 'APPLY' : 'CHECK',
    pipelineCount: results.length,
    delegatedToR1_3ProducerGate: true,
    results,
    boundaries: {
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
      owningValidatorInferenceCount: 0,
      projectStatusWriteCount: 0,
      legacyGeneratedWriteCount: 0,
      statusSourceDeclarationWriteCount: declarationWrites,
    },
  };
}

export function artifactBridgeSummary(contract) {
  const pipelines = Array.isArray(contract?.pipelines) ? contract.pipelines : [];
  return {
    pipelineCount: pipelines.length,
    domains: Object.fromEntries(pipelines.map(item => [item.domain, item.producerId])),
  };
}
