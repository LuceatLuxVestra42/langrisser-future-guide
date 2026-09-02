import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-notice-evidence-stage11-a1.v1.json',
  stage11A: 'data/validation/soldier-release-metadata-stage11-a-inventory.v1.json',
  canonical: 'data/generated/soldier-list-stage5-7.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
};

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}
function isIsoDate(v) {
  return typeof v === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
}
function indexByInteger(records, key, errors, label) {
  const map = new Map();
  for (const record of records) {
    const id = record?.[key];
    if (!Number.isInteger(id)) {
      errors.push(`${label} has non-integer ${key}: ${String(id)}`);
      continue;
    }
    if (map.has(id)) errors.push(`${label} duplicate ${key}: ${id}`);
    else map.set(id, record);
  }
  return map;
}
function uniqStrings(values) {
  return Array.isArray(values)
    && values.length > 0
    && values.every(v => typeof v === 'string' && v.length > 0)
    && new Set(values).size === values.length;
}

const evidence = loadJson(paths.evidence);
const stage11A = loadJson(paths.stage11A);
const canonical = loadJson(paths.canonical);
const releaseMetadata = loadJson(paths.releaseMetadata);
const errors = [];

if (evidence.version !== 1) errors.push(`evidence version must be 1, got ${evidence.version}`);
if (evidence.schemaId !== 'soldier-release-official-notice-evidence/v1') errors.push(`unexpected evidence schemaId: ${evidence.schemaId}`);
if (evidence.stage !== '11-A1') errors.push(`evidence stage must be 11-A1, got ${evidence.stage}`);
if (evidence.status !== 'FROZEN_ADMITTED') errors.push(`evidence status must be FROZEN_ADMITTED, got ${evidence.status}`);
if (evidence.owner !== 'soldier-release-metadata-evidence-acquisition') errors.push(`unexpected evidence owner: ${evidence.owner}`);
if (evidence.scope !== 'SUPPLEMENTAL_OFFICIAL_RELEASE_EVIDENCE_NO_STAGE5_8_PROMOTION') errors.push(`unexpected evidence scope: ${evidence.scope}`);

if (stage11A.status !== 'PASS' || stage11A.stage !== '11-A') errors.push('Stage 11-A inventory predecessor is not PASS/11-A');
if (stage11A?.coverage?.canonicalSoldiers !== 224) errors.push(`Stage 11-A canonicalSoldiers must remain 224, got ${stage11A?.coverage?.canonicalSoldiers}`);
if (stage11A?.coverage?.normalTier3Unresolved !== 118) errors.push(`Stage 11-A normalTier3Unresolved must be 118, got ${stage11A?.coverage?.normalTier3Unresolved}`);
if (stage11A?.coverage?.unresolvedReleaseRecords !== 213) errors.push(`Stage 11-A unresolvedReleaseRecords must be 213, got ${stage11A?.coverage?.unresolvedReleaseRecords}`);

if (canonical.status !== 'PASS') errors.push(`canonical Stage 5-7 must be PASS, got ${canonical.status}`);
if (canonical?.summary?.recordCount !== 224) errors.push(`canonical Stage 5-7 recordCount must be 224, got ${canonical?.summary?.recordCount}`);
if (releaseMetadata.status !== 'PASS') errors.push(`release metadata must be PASS, got ${releaseMetadata.status}`);
if (releaseMetadata?.summary?.normalTier3Unresolved !== 118) errors.push(`release metadata normalTier3Unresolved must be 118, got ${releaseMetadata?.summary?.normalTier3Unresolved}`);
if (releaseMetadata?.summary?.unresolvedReleaseRecords !== 213) errors.push(`release metadata unresolvedReleaseRecords must be 213, got ${releaseMetadata?.summary?.unresolvedReleaseRecords}`);

const policy = evidence.policy ?? {};
for (const key of [
  'allowNameSimilarity',
  'allowIdArithmetic',
  'allowFilenameSimilarity',
  'allowScreenOrRowOrderMapping',
  'allowAbilityTextSimilarityMapping',
  'allowSamePatchOrderInference',
  'promoteIntoStage5_8',
]) {
  if (policy[key] !== false) errors.push(`policy.${key} must be false`);
}
if (policy.sourceAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE') errors.push(`unexpected sourceAuthority: ${policy.sourceAuthority}`);
if (policy.sourceHost !== 'mz.zlongame.com') errors.push(`unexpected sourceHost: ${policy.sourceHost}`);
if (policy.eventToCanonicalIdentity !== 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION') {
  errors.push(`unexpected eventToCanonicalIdentity: ${policy.eventToCanonicalIdentity}`);
}

const sources = Array.isArray(evidence.sources) ? evidence.sources : [];
const records = Array.isArray(evidence.records) ? evidence.records : [];
if (sources.length !== 19) errors.push(`expected 19 official release events, got ${sources.length}`);
if (records.length !== 40) errors.push(`expected 40 candidate promotion records, got ${records.length}`);

const allowedKinds = new Set([
  'TRAINING_GROUND_NEW_SOLDIERS',
  'TRAINING_GROUND_NEW_TECH_SOLDIERS',
  'OFFICIAL_PREVIEW_EXPLICIT_UPDATE_UNLOCK',
]);
const sourceMap = new Map();
const sourceUrls = new Set();
let sourceLabelCount = 0;
for (const source of sources) {
  if (typeof source?.sourceId !== 'string' || !source.sourceId) {
    errors.push('source without sourceId');
    continue;
  }
  if (sourceMap.has(source.sourceId)) errors.push(`duplicate sourceId: ${source.sourceId}`);
  else sourceMap.set(source.sourceId, source);

  if (!isIsoDate(source.releaseDate)) errors.push(`${source.sourceId} invalid releaseDate`);
  if (!isIsoDate(source.noticePublishedAt)) errors.push(`${source.sourceId} invalid noticePublishedAt`);
  if (isIsoDate(source.releaseDate) && isIsoDate(source.noticePublishedAt) && source.noticePublishedAt > source.releaseDate) {
    errors.push(`${source.sourceId} noticePublishedAt is after releaseDate`);
  }
  if (!allowedKinds.has(source.eventKind)) errors.push(`${source.sourceId} unsupported eventKind: ${source.eventKind}`);
  if (!uniqStrings(source.newSoldierLabels)) errors.push(`${source.sourceId} newSoldierLabels must be nonempty unique strings`);
  else sourceLabelCount += source.newSoldierLabels.length;

  try {
    const u = new URL(source.url);
    if (u.protocol !== 'https:' || u.hostname !== 'mz.zlongame.com') errors.push(`${source.sourceId} is not an official mz.zlongame.com https URL`);
    if (sourceUrls.has(source.url)) errors.push(`duplicate source URL: ${source.url}`);
    sourceUrls.add(source.url);
  } catch {
    errors.push(`${source.sourceId} invalid URL`);
  }
}
if (sourceLabelCount !== 40) errors.push(`official event labels must total 40, got ${sourceLabelCount}`);

const canonicalIndex = indexByInteger(Array.isArray(canonical.records) ? canonical.records : [], 'soldierId', errors, 'canonical');
const releaseIndex = indexByInteger(Array.isArray(releaseMetadata.records) ? releaseMetadata.records : [], 'soldierId', errors, 'release metadata');
const evidenceIndex = indexByInteger(records, 'soldierId', errors, 'evidence');

const sourceRecordLabels = new Map();
for (const record of records) {
  const sid = record?.soldierId;
  const base = canonicalIndex.get(sid);
  const release = releaseIndex.get(sid);
  const source = sourceMap.get(record?.sourceId);

  if (!base) {
    errors.push(`evidence soldierId ${sid} absent from canonical Stage 5-7`);
    continue;
  }
  if (base.tier !== 3 || base.isSp !== false) errors.push(`evidence soldierId ${sid} is not unresolved normal tier-3`);
  if (record.canonicalNameCn !== base.nameCn) {
    errors.push(`evidence soldierId ${sid} canonicalNameCn mismatch: ${record.canonicalNameCn} != ${base.nameCn}`);
  }

  if (!release) errors.push(`evidence soldierId ${sid} absent from current release metadata`);
  else if (release.releaseStatus !== 'UNRESOLVED') errors.push(`evidence soldierId ${sid} is already ${release.releaseStatus} in current release metadata`);

  if (!source) {
    errors.push(`evidence soldierId ${sid} references unknown sourceId ${record?.sourceId}`);
    continue;
  }
  if (record.releaseDate !== source.releaseDate) errors.push(`evidence soldierId ${sid} releaseDate differs from source`);
  if (!source.newSoldierLabels.includes(record.canonicalNameCn)) errors.push(`source ${source.sourceId} does not explicitly list ${record.canonicalNameCn}`);
  if (record.mappingStatus !== 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION') {
    errors.push(`evidence soldierId ${sid} has unsupported mappingStatus`);
  }
  if (record.samePatchOrder !== null) errors.push(`evidence soldierId ${sid} invents samePatchOrder`);

  const labels = sourceRecordLabels.get(source.sourceId) ?? [];
  labels.push(record.canonicalNameCn);
  sourceRecordLabels.set(source.sourceId, labels);
}
if (evidenceIndex.size !== 40) errors.push(`evidence unique soldierId count must be 40, got ${evidenceIndex.size}`);

for (const source of sources) {
  const actual = [...(sourceRecordLabels.get(source.sourceId) ?? [])].sort();
  const declared = [...source.newSoldierLabels].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared)) {
    errors.push(`${source.sourceId} record labels do not exactly exhaust declared official newSoldierLabels`);
  }
}

const summary = evidence.summary ?? {};
const expectedSummary = {
  officialEventCount: 19,
  candidatePromotionRecordCount: 40,
  baselineNormalTier3Unresolved: 118,
  projectedNormalTier3UnresolvedAfterPromotion: 78,
  baselineTotalUnresolved: 213,
  projectedTotalUnresolvedAfterPromotion: 173,
  spUnresolvedUnchanged: 56,
  lowerTierReleaseOrderNotRequiredUnchanged: 39,
};
for (const [key, expected] of Object.entries(expectedSummary)) {
  if (summary[key] !== expected) errors.push(`summary.${key} must be ${expected}, got ${summary[key]}`);
}
if (summary.baselineNormalTier3Unresolved - summary.candidatePromotionRecordCount !== summary.projectedNormalTier3UnresolvedAfterPromotion) {
  errors.push('normal tier-3 projection arithmetic mismatch');
}
if (summary.baselineTotalUnresolved - summary.candidatePromotionRecordCount !== summary.projectedTotalUnresolvedAfterPromotion) {
  errors.push('total unresolved projection arithmetic mismatch');
}

const boundaries = evidence.boundaries ?? {};
for (const [key, value] of Object.entries(boundaries)) {
  if (value !== false) errors.push(`boundary ${key} must remain false`);
}

if (errors.length) {
  console.error(`Soldier Stage 11-A1 official release evidence: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Soldier Stage 11-A1 official release evidence: PASS');
console.log(`officialEvents=${sources.length}`);
console.log(`candidatePromotionRecords=${records.length}`);
console.log(`projectedNormalTier3Unresolved=${summary.projectedNormalTier3UnresolvedAfterPromotion}`);
console.log(`projectedTotalUnresolved=${summary.projectedTotalUnresolvedAfterPromotion}`);
