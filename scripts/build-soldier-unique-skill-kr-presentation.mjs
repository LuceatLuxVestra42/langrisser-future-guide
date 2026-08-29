import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');

const canonicalPath = 'data/generated/soldier-detail-stage5-3.v1.json';
const progressPath = 'data/checkpoints/soldier-unique-skill-translation-progress.v1.json';
const outputPath = 'data/generated/soldier-unique-skill-kr-final.v1.json';
const validationPath = 'data/validation/soldier-unique-skill-kr-final.v1.json';

const shardSpecs = [
  { path: 'data/presentation/soldier-unique-skill-kr.v1.json', expected: 50, role: 'consolidated-base' },
  { path: 'data/checkpoints/soldier-unique-skill-translation-batch5.v1.json', expected: 20, role: 'append-only-batch' },
  { path: 'data/checkpoints/soldier-unique-skill-translation-batch6.v1.json', expected: 20, role: 'append-only-batch' },
  { path: 'data/checkpoints/soldier-unique-skill-translation-batch7.v1.json', expected: 20, role: 'append-only-batch' },
  { path: 'data/checkpoints/soldier-unique-skill-translation-batch8.v1.json', expected: 35, role: 'append-only-batch' },
  { path: 'data/checkpoints/soldier-unique-skill-translation-batch9.v1.json', expected: 40, role: 'append-only-batch' },
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  throw new Error(`[soldier-skill-kr] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const canonical = readJson(canonicalPath);
const progress = readJson(progressPath);
const shards = shardSpecs.map((spec) => ({ ...spec, data: readJson(spec.path) }));

assert(Array.isArray(canonical.records), 'canonical records must be an array');

const canonicalTargets = canonical.records.filter((record) => {
  if (record?.identity?.isSp === true) return typeof record?.sp?.finalDescription === 'string' && record.sp.finalDescription.length > 0;
  return record?.identity?.tier === 3 && typeof record?.ability?.finalDescription === 'string' && record.ability.finalDescription.length > 0;
});

const canonicalById = new Map(canonicalTargets.map((record) => [record.soldierId, record]));
assert(canonicalTargets.length === 185, `canonical target count must be 185, got ${canonicalTargets.length}`);
assert(canonicalById.size === canonicalTargets.length, 'canonical target soldierIds must be unique');

const reviewReasonById = new Map();
const authoringRecords = [];
for (const shard of shards) {
  assert(Array.isArray(shard.data.records), `${shard.path}: records must be an array`);
  assert(shard.data.records.length === shard.expected, `${shard.path}: expected ${shard.expected} records, got ${shard.data.records.length}`);
  authoringRecords.push(...shard.data.records.map((record) => ({ ...record, __shard: shard.path })));

  if (Array.isArray(shard.data.reviewQueue)) {
    for (const item of shard.data.reviewQueue) {
      if (Number.isInteger(item?.soldierId) && typeof item?.reason === 'string' && item.reason.length > 0) {
        reviewReasonById.set(item.soldierId, item.reason);
      }
    }
  }
}

assert(authoringRecords.length === 185, `authoring record count must be 185, got ${authoringRecords.length}`);

const seen = new Set();
const normalizedRecords = [];
for (const record of authoringRecords) {
  const id = record?.soldierId;
  assert(Number.isInteger(id), `${record.__shard}: soldierId must be an integer`);
  assert(!seen.has(id), `duplicate translated soldierId ${id}`);
  seen.add(id);

  const source = canonicalById.get(id);
  assert(source, `translated soldierId ${id} is not in canonical target set`);
  assert(record.nameCn === source.identity.nameCn, `soldierId ${id}: nameCn mismatch (${record.nameCn} != ${source.identity.nameCn})`);
  assert(typeof record.descriptionKr === 'string' && record.descriptionKr.trim().length > 0, `soldierId ${id}: empty descriptionKr`);

  const status = record.translationStatus;
  const reviewTerms = Array.isArray(record.reviewTerms) ? record.reviewTerms : [];
  assert(status === 'PASS' || (typeof status === 'string' && status.startsWith('REVIEW_')), `soldierId ${id}: unsupported translationStatus ${status}`);
  if (status === 'PASS') assert(reviewTerms.length === 0, `soldierId ${id}: PASS must have empty reviewTerms`);
  else assert(reviewTerms.length > 0, `soldierId ${id}: REVIEW must have reviewTerms`);

  normalizedRecords.push({
    soldierId: id,
    nameKr: record.nameKr ?? source.identity.nameKr ?? null,
    nameCn: source.identity.nameCn,
    sourceType: source.identity.isSp === true ? 'sp' : 'normal-tier3',
    translationStatus: status,
    reviewTerms,
    descriptionKr: record.descriptionKr,
  });
}

normalizedRecords.sort((a, b) => a.soldierId - b.soldierId);

const canonicalTargetIds = [...canonicalById.keys()].sort((a, b) => a - b);
const translatedIds = normalizedRecords.map((record) => record.soldierId);
const missingIds = canonicalTargetIds.filter((id) => !seen.has(id));
const extraIds = translatedIds.filter((id) => !canonicalById.has(id));
assert(missingIds.length === 0, `missing canonical target IDs: ${missingIds.join(', ')}`);
assert(extraIds.length === 0, `extra translated IDs: ${extraIds.join(', ')}`);
assert(JSON.stringify(translatedIds) === JSON.stringify(canonicalTargetIds), 'translated soldierId set/order must match canonical target set');

const passCount = normalizedRecords.filter((record) => record.translationStatus === 'PASS').length;
const reviewCount = normalizedRecords.length - passCount;
assert(passCount === 109, `PASS count must be 109, got ${passCount}`);
assert(reviewCount === 76, `REVIEW count must be 76, got ${reviewCount}`);

assert(progress?.targetCount === 185, `progress targetCount must be 185, got ${progress?.targetCount}`);
assert(progress?.progress?.translatedCount === 185, `progress translatedCount must be 185, got ${progress?.progress?.translatedCount}`);
assert(progress?.progress?.passCount === passCount, 'progress PASS count mismatch');
assert(progress?.progress?.reviewCount === reviewCount, 'progress REVIEW count mismatch');
assert(progress?.progress?.remainingCount === 0, 'progress remainingCount must be 0');

const reviewQueue = normalizedRecords
  .filter((record) => record.translationStatus !== 'PASS')
  .map((record) => ({
    soldierId: record.soldierId,
    nameKr: record.nameKr,
    nameCn: record.nameCn,
    translationStatus: record.translationStatus,
    terms: record.reviewTerms,
    reason: reviewReasonById.get(record.soldierId) ?? 'Translation is complete; authoritative Korean terminology or mechanic wording still requires review.',
  }));

const finalPresentation = {
  version: 1,
  schemaId: 'soldier-unique-skill-kr-final/v1',
  date: '2026-08-29',
  status: 'PASS_WITH_REVIEW',
  source: {
    canonical: canonicalPath,
    progress: progressPath,
    authoringShards: shardSpecs.map(({ path: shardPath, expected, role }) => ({ path: shardPath, recordCount: expected, role })),
  },
  counts: {
    target: 185,
    records: normalizedRecords.length,
    pass: passCount,
    review: reviewCount,
    missing: missingIds.length,
    extra: extraIds.length,
  },
  policy: {
    canonicalChineseReadOnly: true,
    joinKey: 'soldierId',
    sourceTypeDerivedFromCanonicalIdentity: true,
    idArithmeticInference: false,
    sourceChineseDuplicatedInPresentation: false,
    reviewIsNonBlockingTranslationReview: true,
  },
  records: normalizedRecords,
  reviewQueue,
};

const validation = {
  version: 1,
  schemaId: 'soldier-unique-skill-kr-final-validation/v1',
  date: '2026-08-29',
  status: 'PASS_WITH_REVIEW',
  input: {
    canonical: canonicalPath,
    canonicalTargetCount: canonicalTargets.length,
    authoringShardCount: shardSpecs.length,
    authoringRecordCount: authoringRecords.length,
  },
  output: {
    path: outputPath,
    recordCount: normalizedRecords.length,
    passCount,
    reviewCount,
    reviewQueueCount: reviewQueue.length,
  },
  checks: {
    canonicalTargetCount185: true,
    shardCountsExact: true,
    translatedRecordCount185: true,
    uniqueSoldierIds185: seen.size === 185,
    canonicalSetParity: missingIds.length === 0 && extraIds.length === 0,
    descriptionsNonEmpty: true,
    statusReviewTermContract: true,
    nameCnCanonicalParity: true,
    progressParity: true,
    canonicalChineseReadOnly: true,
  },
  hardErrorCount: 0,
  reviewCount,
};

if (!checkOnly) {
  fs.mkdirSync(path.dirname(path.join(root, outputPath)), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, validationPath)), { recursive: true });
  fs.writeFileSync(path.join(root, outputPath), stableJson(finalPresentation));
  fs.writeFileSync(path.join(root, validationPath), stableJson(validation));
}

console.log(`[soldier-skill-kr] ${checkOnly ? 'CHECK' : 'BUILD'} PASS_WITH_REVIEW`);
console.log(`[soldier-skill-kr] records=${normalizedRecords.length} pass=${passCount} review=${reviewCount} missing=${missingIds.length} extra=${extraIds.length}`);
