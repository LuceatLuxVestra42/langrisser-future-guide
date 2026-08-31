import fs from 'node:fs';
import path from 'node:path';
import {
  assertRepositoryPath,
} from './select-active-sources.mjs';
import {
  promoteStatusSource,
} from './promote-status-source.mjs';

export const DEFAULT_PRODUCER_CONTRACT = 'tools/status-source/contracts/producer-gate.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const normalizeRepositoryPath = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');

export function loadProducerGateContract({
  repoRoot = process.cwd(),
  contractPath = DEFAULT_PRODUCER_CONTRACT,
} = {}) {
  const contract = readJson(assertRepositoryPath(repoRoot, contractPath));
  if (contract?.schemaId !== 'status-source-producer-gate/v1') {
    throw new Error(`Unsupported producer gate schema: ${contract?.schemaId ?? 'missing'}`);
  }
  if (contract.status !== 'DESIGN_FROZEN') {
    throw new Error(`Producer gate contract is not frozen: ${contract.status ?? 'missing'}`);
  }
  return contract;
}

export function validateProducerSubmission({
  contract,
  producerId,
  promotionOptions = {},
  repoRoot = process.cwd(),
} = {}) {
  const failures = [];
  if (contract?.schemaId !== 'status-source-producer-gate/v1') {
    failures.push({ type: 'PRODUCER_CONTRACT_SCHEMA_INVALID', actual: contract?.schemaId ?? null });
  }
  if (contract?.status !== 'DESIGN_FROZEN') {
    failures.push({ type: 'PRODUCER_CONTRACT_NOT_FROZEN', actual: contract?.status ?? null });
  }

  const producers = Array.isArray(contract?.producers) ? contract.producers : [];
  const producer = producers.find(item => item.id === producerId);
  if (!producer) {
    failures.push({ type: 'PRODUCER_NOT_REGISTERED', producerId });
    return { pass: false, producer: null, failures, normalizedSourcePath: '' };
  }
  if (producer.enabled !== true) failures.push({ type: 'PRODUCER_DISABLED', producerId });

  if (promotionOptions.domain && promotionOptions.domain !== producer.domain) {
    failures.push({
      type: 'PRODUCER_DOMAIN_OVERRIDE_FORBIDDEN',
      producerId,
      producerDomain: producer.domain,
      requestedDomain: promotionOptions.domain,
    });
  }

  if (typeof promotionOptions.id !== 'string' || promotionOptions.id.length === 0) {
    failures.push({ type: 'ENTRY_ID_REQUIRED', producerId });
  }

  const sourcePath = normalizeRepositoryPath(promotionOptions.sourcePath);
  if (!sourcePath) {
    failures.push({ type: 'SOURCE_PATH_REQUIRED', producerId });
  } else {
    let pattern = null;
    try {
      pattern = new RegExp(producer.allowedSourcePattern);
    } catch (error) {
      failures.push({
        type: 'PRODUCER_SOURCE_PATTERN_INVALID',
        producerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (pattern && !pattern.test(sourcePath)) {
      failures.push({
        type: 'SOURCE_PATH_OUTSIDE_PRODUCER_FAMILY',
        producerId,
        sourcePath,
        allowedSourcePattern: producer.allowedSourcePattern,
      });
    }

    try {
      const sourceAbsolute = assertRepositoryPath(repoRoot, sourcePath);
      if (!fs.existsSync(sourceAbsolute)) {
        failures.push({ type: 'SOURCE_FILE_MISSING', producerId, sourcePath });
      }
    } catch (error) {
      failures.push({
        type: 'SOURCE_PATH_INVALID',
        producerId,
        sourcePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    pass: failures.length === 0,
    producer,
    failures,
    normalizedSourcePath: sourcePath,
  };
}

export function submitStatusSource(submission, runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const contract = runtime.contract ?? loadProducerGateContract({
    repoRoot,
    contractPath: runtime.contractPath ?? DEFAULT_PRODUCER_CONTRACT,
  });
  const promotionOptions = submission?.promotionOptions ?? {};
  const gate = validateProducerSubmission({
    contract,
    producerId: submission?.producerId,
    promotionOptions,
    repoRoot,
  });
  if (!gate.pass) throw new Error(`Producer gate blocked: ${JSON.stringify(gate.failures)}`);

  const delegatedOptions = {
    ...promotionOptions,
    domain: gate.producer.domain,
    sourcePath: gate.normalizedSourcePath,
  };
  const promotion = (runtime.promote ?? promoteStatusSource)(
    delegatedOptions,
    runtime.promotionRuntime ?? { repoRoot },
  );

  return {
    version: 1,
    schemaId: 'status-source-producer-submission/v1',
    stage: 'R1-3',
    status: delegatedOptions.apply
      ? 'PASS_STATUS_SOURCE_PRODUCER_APPLY'
      : 'PASS_STATUS_SOURCE_PRODUCER_CHECK',
    completion: 'COMPLETE',
    mode: delegatedOptions.apply ? 'APPLY' : 'CHECK',
    producerId: gate.producer.id,
    producerRole: gate.producer.role,
    domain: gate.producer.domain,
    sourcePath: delegatedOptions.sourcePath,
    entryId: delegatedOptions.id,
    delegatedToR1_2Promotion: true,
    promotion,
    boundaries: {
      legacyProjectDoctorRuntimeImports: 0,
      legacyGeneratedStatusDependencies: 0,
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
      projectStatusWriteCount: 0,
      legacyGeneratedWriteCount: 0,
      statusSourceDeclarationWriteCount: promotion?.writePerformed ? 1 : 0,
    },
  };
}

export function producerGateSummary(contract) {
  const producers = Array.isArray(contract?.producers) ? contract.producers : [];
  return {
    producerCount: producers.length,
    enabledProducerCount: producers.filter(item => item.enabled === true).length,
    domains: Object.fromEntries(producers.map(item => [item.domain, item.id])),
  };
}
