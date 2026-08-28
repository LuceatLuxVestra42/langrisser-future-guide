import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePromotionArgs,
  promoteStatusSource,
} from './promote-project-doctor-status-source.mjs';

export const DEFAULT_PRODUCER_CONTRACT = 'data/contracts/project-doctor-status-source-producers.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const normalizeRepositoryPath = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');

export const parseSubmissionArgs = argv => {
  const producerIndex = argv.indexOf('--producer');
  if (producerIndex === -1 || argv[producerIndex + 1] === undefined) {
    throw new Error('--producer is required.');
  }
  const producerId = argv[producerIndex + 1];
  const promotionArgv = argv.filter((_, index) => index !== producerIndex && index !== producerIndex + 1);
  return { producerId, promotionOptions: parsePromotionArgs(promotionArgv) };
};

export const validateProducerSubmission = ({ contract, producerId, promotionOptions }) => {
  const failures = [];
  if (contract.status !== 'DESIGN_FROZEN') {
    failures.push({ type: 'PRODUCER_CONTRACT_NOT_FROZEN', actual: contract.status });
  }
  const producers = Array.isArray(contract.producers) ? contract.producers : [];
  const producer = producers.find(item => item.id === producerId);
  if (!producer) {
    failures.push({ type: 'PRODUCER_NOT_REGISTERED', producerId });
    return { pass: false, producer: null, failures };
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

  const sourcePath = normalizeRepositoryPath(promotionOptions.sourcePath);
  if (!sourcePath) failures.push({ type: 'SOURCE_PATH_REQUIRED', producerId });
  else {
    let pattern;
    try {
      pattern = new RegExp(producer.allowedSourcePattern);
    } catch (error) {
      failures.push({ type: 'PRODUCER_SOURCE_PATTERN_INVALID', producerId, error: error instanceof Error ? error.message : String(error) });
    }
    if (pattern && !pattern.test(sourcePath)) {
      failures.push({
        type: 'SOURCE_PATH_OUTSIDE_PRODUCER_FAMILY',
        producerId,
        sourcePath,
        allowedSourcePattern: producer.allowedSourcePattern,
      });
    }
  }

  if (!promotionOptions.id) failures.push({ type: 'ENTRY_ID_REQUIRED', producerId });

  return {
    pass: failures.length === 0,
    producer,
    failures,
    normalizedSourcePath: sourcePath,
  };
};

export const submitStatusSource = (submission, runtime = {}) => {
  const contractPath = runtime.contractPath ?? DEFAULT_PRODUCER_CONTRACT;
  const contract = runtime.contract ?? readJson(contractPath);
  const gate = validateProducerSubmission({
    contract,
    producerId: submission.producerId,
    promotionOptions: submission.promotionOptions,
  });
  if (!gate.pass) throw new Error(`Producer gate blocked: ${JSON.stringify(gate.failures)}`);

  const promotionOptions = {
    ...submission.promotionOptions,
    domain: gate.producer.domain,
    sourcePath: gate.normalizedSourcePath,
  };
  const promotion = (runtime.promote ?? promoteStatusSource)(promotionOptions, runtime.promotionRuntime ?? {});
  return {
    version: 1,
    schemaId: 'project-doctor-status-source-producer-submission/v1',
    stage: 'PROJECT-STATUS-STAGE4',
    status: promotionOptions.check ? 'PASS_STATUS_SOURCE_PRODUCER_CHECK' : 'PASS_STATUS_SOURCE_PRODUCER_SUBMISSION',
    completion: 'COMPLETE',
    producerId: gate.producer.id,
    domain: gate.producer.domain,
    sourcePath: promotionOptions.sourcePath,
    entryId: promotionOptions.id,
    delegatedToStage3: true,
    promotion,
    boundaries: {
      rawConfigDataRead: false,
      semanticRecomputation: false,
      canonicalJoinRecomputation: false,
      filenameAuthorityInference: false,
      chronologyAuthorityInference: false,
    },
  };
};

const usage = () => {
  console.log('Usage: node scripts/submit-project-doctor-status-source.mjs --producer <producer-id> --id <entry-id> --source <validated-json> [Stage 3 promotion options]');
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      usage();
      process.exit(0);
    }
    const submission = parseSubmissionArgs(process.argv.slice(2));
    const result = submitStatusSource(submission);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[status-source-producer] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
