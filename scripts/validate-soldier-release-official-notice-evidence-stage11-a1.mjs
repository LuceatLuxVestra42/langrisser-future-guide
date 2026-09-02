import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-notice-evidence-stage11-a1.v1.json',
  stage11A: 'data/validation/soldier-release-metadata-stage11-a-inventory.v1.json',
  canonical: 'data/generated/soldier-list-stage5-7.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
};
const loadJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const error = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
}
function indexById(records, label) {
  const map = new Map();
  for (const record of records ?? []) {
    if (!Number.isInteger(record?.soldierId)) { error(`${label} invalid soldierId`); continue; }
    if (map.has(record.soldierId)) error(`${label} duplicate soldierId ${record.soldierId}`);
    else map.set(record.soldierId, record);
  }
  return map;
}

const evidence = loadJson(paths.evidence);
const stage11A = loadJson(paths.stage11A);
const canonical = loadJson(paths.canonical);
const releaseMetadata = loadJson(paths.releaseMetadata);

if (evidence.version !== 1 || evidence.schemaId !== 'soldier-release-official-notice-evidence/v1'
  || evidence.stage !== '11-A1' || evidence.status !== 'FROZEN_ADMITTED'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'SUPPLEMENTAL_OFFICIAL_RELEASE_EVIDENCE_NO_STAGE5_8_PROMOTION') {
  error('Stage 11-A1 evidence identity/status drift');
}
if (stage11A.status !== 'PASS' || stage11A.stage !== '11-A'
  || stage11A.coverage?.canonicalSoldiers !== 224
  || stage11A.coverage?.normalTier3Unresolved !== 118
  || stage11A.coverage?.unresolvedReleaseRecords !== 213) {
  error('Stage 11-A historical inventory predecessor drift');
}
if (canonical.status !== 'PASS' || canonical.summary?.recordCount !== 224) error('canonical Stage 5-7 must remain PASS with 224 records');
if (releaseMetadata.status !== 'PASS') error('current release metadata must remain PASS');

const policy = evidence.policy ?? {};
for (const key of ['allowNameSimilarity','allowIdArithmetic','allowFilenameSimilarity','allowScreenOrRowOrderMapping','allowAbilityTextSimilarityMapping','allowSamePatchOrderInference','promoteIntoStage5_8']) {
  if (policy[key] !== false) error(`policy.${key} must remain false in the historical acquisition checkpoint`);
}
if (policy.sourceAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE' || policy.sourceHost !== 'mz.zlongame.com'
  || policy.eventToCanonicalIdentity !== 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION') {
  error('Stage 11-A1 evidence authority/identity policy drift');
}

const sources = Array.isArray(evidence.sources) ? evidence.sources : [];
const records = Array.isArray(evidence.records) ? evidence.records : [];
if (sources.length !== 19) error(`expected 19 official release events, got ${sources.length}`);
if (records.length !== 40) error(`expected 40 admitted records, got ${records.length}`);
const sourceMap = new Map();
const sourceUrls = new Set();
let declaredLabelCount = 0;
for (const source of sources) {
  if (typeof source?.sourceId !== 'string' || !source.sourceId) { error('official source without sourceId'); continue; }
  if (sourceMap.has(source.sourceId)) error(`duplicate sourceId ${source.sourceId}`);
  sourceMap.set(source.sourceId, source);
  if (!isIsoDate(source.releaseDate) || !isIsoDate(source.noticePublishedAt) || source.noticePublishedAt > source.releaseDate) error(`${source.sourceId} invalid notice/release date`);
  if (!Array.isArray(source.newSoldierLabels) || !source.newSoldierLabels.length
    || source.newSoldierLabels.some(label => typeof label !== 'string' || !label)
    || new Set(source.newSoldierLabels).size !== source.newSoldierLabels.length) error(`${source.sourceId} invalid newSoldierLabels`);
  else declaredLabelCount += source.newSoldierLabels.length;
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.hostname !== 'mz.zlongame.com') error(`${source.sourceId} source URL is not official https mz.zlongame.com`);
    if (sourceUrls.has(source.url)) error(`duplicate source URL ${source.url}`);
    sourceUrls.add(source.url);
  } catch { error(`${source.sourceId} invalid URL`); }
}
if (declaredLabelCount !== 40) error(`official source labels must total 40, got ${declaredLabelCount}`);

const canonicalIndex = indexById(canonical.records, 'canonical');
const releaseIndex = indexById(releaseMetadata.records, 'release metadata');
const evidenceIndex = indexById(records, 'evidence');
const sourceRecordLabels = new Map();
let unresolvedCandidates = 0;
let promotedCandidates = 0;

for (const record of records) {
  const base = canonicalIndex.get(record.soldierId);
  const current = releaseIndex.get(record.soldierId);
  const source = sourceMap.get(record.sourceId);
  if (!base) { error(`evidence soldierId ${record.soldierId} absent from canonical Stage 5-7`); continue; }
  if (base.tier !== 3 || base.isSp !== false) error(`evidence soldierId ${record.soldierId} is not normal tier-3`);
  if (record.canonicalNameCn !== base.nameCn) error(`evidence soldierId ${record.soldierId} canonicalNameCn mismatch`);
  if (!source) error(`evidence soldierId ${record.soldierId} references unknown sourceId ${record.sourceId}`);
  else {
    if (record.releaseDate !== source.releaseDate) error(`evidence soldierId ${record.soldierId} releaseDate differs from source`);
    if (!source.newSoldierLabels.includes(record.canonicalNameCn)) error(`${source.sourceId} does not explicitly list ${record.canonicalNameCn}`);
    const labels = sourceRecordLabels.get(source.sourceId) ?? [];
    labels.push(record.canonicalNameCn);
    sourceRecordLabels.set(source.sourceId, labels);
  }
  if (record.mappingStatus !== 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION' || record.samePatchOrder !== null) {
    error(`evidence soldierId ${record.soldierId} mapping/samePatchOrder drift`);
  }
  if (!current) { error(`evidence soldierId ${record.soldierId} absent from current release metadata`); continue; }
  if (current.releaseStatus === 'UNRESOLVED') {
    unresolvedCandidates += 1;
  } else if (current.releaseStatus === 'CONFIRMED') {
    const expected = {
      soldierId: record.soldierId,
      releaseStatus: 'CONFIRMED',
      releaseDate: record.releaseDate,
      patchGroup: record.releaseDate,
      samePatchOrder: null,
      sourceKind: 'OFFICIAL_CN_RELEASE_NOTICE',
      sourceLabel: record.canonicalNameCn,
      sourceRows: null,
      mappingStatus: 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION',
    };
    if (!same(current, expected)) error(`promoted evidence soldierId ${record.soldierId} does not exactly match admitted A1 evidence`);
    else promotedCandidates += 1;
  } else {
    error(`evidence soldierId ${record.soldierId} unexpected releaseStatus ${current.releaseStatus}`);
  }
}
if (evidenceIndex.size !== 40) error(`evidence unique soldierId count must be 40, got ${evidenceIndex.size}`);
for (const source of sources) {
  const actual = [...(sourceRecordLabels.get(source.sourceId) ?? [])].sort();
  const declared = [...source.newSoldierLabels].sort();
  if (!same(actual, declared)) error(`${source.sourceId} records do not exactly exhaust declared official labels`);
}

let mode = null;
if (unresolvedCandidates === 40 && promotedCandidates === 0) mode = 'PRE_PROMOTION';
else if (unresolvedCandidates === 0 && promotedCandidates === 40) mode = 'PROMOTED_11_A2';
else error(`Stage 11-A1 candidates must be atomically all unresolved or all promoted; unresolved=${unresolvedCandidates}, promoted=${promotedCandidates}`);

if (mode === 'PRE_PROMOTION') {
  if (releaseMetadata.summary?.normalTier3Unresolved !== 118 || releaseMetadata.summary?.unresolvedReleaseRecords !== 213
    || releaseMetadata.summary?.confirmedReleaseRecords !== 11) error('pre-promotion Stage 5-8 coverage mismatch');
}
if (mode === 'PROMOTED_11_A2') {
  if (releaseMetadata.summary?.normalTier3Unresolved !== 78 || releaseMetadata.summary?.unresolvedReleaseRecords !== 173
    || releaseMetadata.summary?.confirmedReleaseRecords !== 51
    || releaseMetadata.sources?.officialNoticeEvidence?.path !== paths.evidence) error('promoted Stage 5-8 coverage/provenance mismatch');
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
if (!same(summary, expectedSummary)) error('Stage 11-A1 frozen projection summary drift');
for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) error(`historical boundary ${key} must remain false`);

if (errors.length) {
  console.error(`Soldier Stage 11-A1 official release evidence: FAIL (${errors.length})`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A1 official release evidence: PASS');
console.log(`state=${mode}`);
console.log('officialEvents=19');
console.log('candidatePromotionRecords=40');
