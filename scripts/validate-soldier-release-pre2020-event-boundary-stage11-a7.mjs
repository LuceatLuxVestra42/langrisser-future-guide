import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-pre2020-event-boundary-stage11-a7.v1.json',
  list: 'data/generated/soldier-list-stage5-8.v1.json',
  metadata: 'data/generated/soldier-release-metadata.v1.json',
  a1: 'data/soldier-release-official-notice-evidence-stage11-a1.v1.json',
  a5: 'data/validation/soldier-release-metadata-stage11-a5-correction.v1.json',
};
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const fail = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isIsoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
function indexById(records, label) {
  const map = new Map();
  for (const record of records ?? []) {
    if (!Number.isInteger(record?.soldierId)) { fail(`${label} invalid soldierId`); continue; }
    if (map.has(record.soldierId)) fail(`${label} duplicate soldierId ${record.soldierId}`);
    else map.set(record.soldierId, record);
  }
  return map;
}

const evidence = readJson(paths.evidence);
const list = readJson(paths.list);
const metadata = readJson(paths.metadata);
const a1 = readJson(paths.a1);
const a5 = readJson(paths.a5);

if (evidence.version !== 1
  || evidence.schemaId !== 'soldier-release-pre2020-event-boundary-stage11-a7/v1'
  || evidence.stage !== '11-A7'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'PRE2020_EVENT_BOUNDARY_INVENTORIED_NO_PROMOTION'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'OFFICIAL_EVENT_CONFIRMED_IDENTITY_NOT_ADMITTED_NO_STAGE5_8_PROMOTION') {
  fail('Stage 11-A7 identity/status drift');
}
if (evidence.capturedAgainstMain !== '3bf81c06fb68a253c7657b2ab63b2e84822d566c') fail('Stage 11-A7 captured main drift');
if (evidence.predecessors?.releaseMetadata !== paths.metadata
  || evidence.predecessors?.soldierList !== paths.list
  || evidence.predecessors?.stage11A1Evidence !== paths.a1
  || evidence.predecessors?.stage11A5Checkpoint !== paths.a5) {
  fail('Stage 11-A7 predecessor path contract drift');
}

const expectedCoverage = {
  canonicalSoldiers: 224,
  confirmedReleaseRecords: 51,
  unresolvedReleaseRecords: 173,
  normalTier3Confirmed: 51,
  normalTier3Unresolved: 78,
  sp: 56,
  lowerTier: 39,
};
if (!same(evidence.coverageBefore, expectedCoverage)) fail('Stage 11-A7 frozen coverage drift');
if (list.status !== 'PASS'
  || list.summary?.recordCount !== 224
  || list.summary?.confirmedReleaseCount !== 51
  || list.summary?.unresolvedNormalTier3Count !== 78
  || list.summary?.spCount !== 56
  || list.summary?.lowerTierCount !== 39) {
  fail('authoritative Stage 5-8 list coverage drift');
}
if (metadata.status !== 'PASS'
  || metadata.summary?.canonicalSoldiers !== 224
  || metadata.summary?.confirmedReleaseRecords !== 51
  || metadata.summary?.unresolvedReleaseRecords !== 173
  || metadata.summary?.normalTier3Confirmed !== 51
  || metadata.summary?.normalTier3Unresolved !== 78
  || metadata.summary?.spSoldiers !== 56
  || metadata.summary?.lowerTierNormal !== 39) {
  fail('authoritative release metadata coverage drift');
}
if (a1.stage !== '11-A1' || a1.status !== 'FROZEN_ADMITTED' || a1.records?.length !== 40 || a1.sources?.length !== 19) {
  fail('Stage 11-A1 predecessor drift');
}
if (a5.stage !== '11-A5' || a5.status !== 'PASS' || a5.completion !== 'CN_CHRONOLOGY_SOURCE_CORRECTION_COMPLETE'
  || a5.coverage?.confirmed !== 51 || a5.coverage?.unresolved !== 173 || a5.coverage?.normalTier3Unresolved !== 78) {
  fail('Stage 11-A5 predecessor drift');
}

const policy = evidence.policy ?? {};
if (policy.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || policy.promotionAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
  || policy.secondarySourceRole !== 'LOCATOR_AND_SUPPORTING_EVIDENCE_ONLY'
  || policy.secondarySourceMayPromote !== false
  || policy.hybridOfficialEventPlusSecondaryIdentityMayPromote !== false
  || policy.allowNameSimilarity !== false
  || policy.allowIdArithmetic !== false
  || policy.allowFilenameSimilarity !== false
  || policy.allowScreenOrRowOrderMapping !== false
  || policy.allowBatchCountToIdentityMapping !== false
  || policy.allowSamePatchOrderInference !== false) {
  fail('Stage 11-A7 policy boundary drift');
}

const events = Array.isArray(evidence.officialEvents) ? evidence.officialEvents : [];
const eventMap = new Map();
if (events.length !== 2) fail(`expected 2 official events, got ${events.length}`);
for (const event of events) {
  if (!event.sourceId || eventMap.has(event.sourceId)) { fail(`invalid/duplicate official event ${event.sourceId}`); continue; }
  eventMap.set(event.sourceId, event);
  if (!isIsoDate(event.noticePublishedAt) || !isIsoDate(event.releaseDate) || event.noticePublishedAt > event.releaseDate) {
    fail(`${event.sourceId} invalid date contract`);
  }
  try {
    const url = new URL(event.url);
    if (url.protocol !== 'https:' || url.hostname !== 'mz.zlongame.com') fail(`${event.sourceId} must use official mz.zlongame.com`);
  } catch {
    fail(`${event.sourceId} invalid URL`);
  }
  if (event.eventKind !== 'TRAINING_GROUND_NEW_SOLDIERS'
    || event.officialTextListsSoldierNames !== false
    || event.admissionStatus !== 'EVENT_CONFIRMED_IDENTITY_UNRESOLVED') {
    fail(`${event.sourceId} event/identity boundary drift`);
  }
}
const aug = eventMap.get('official-cn-2019-08-15');
const sep = eventMap.get('official-cn-2019-09-12');
if (aug?.releaseDate !== '2019-08-15' || aug?.officialNewSoldierCount !== 6) fail('2019-08-15 official event drift');
if (sep?.releaseDate !== '2019-09-12' || sep?.officialNewSoldierCount !== 7) fail('2019-09-12 official event drift');

const supporting = Array.isArray(evidence.supportingSources) ? evidence.supportingSources : [];
const supportingMap = new Map();
if (supporting.length !== 3) fail(`expected 3 supporting sources, got ${supporting.length}`);
for (const source of supporting) {
  if (!source.sourceId || supportingMap.has(source.sourceId)) { fail(`invalid/duplicate supporting source ${source.sourceId}`); continue; }
  supportingMap.set(source.sourceId, source);
  if (source.authority !== 'NON_AUTHORITATIVE_SECONDARY') fail(`${source.sourceId} may not be authoritative`);
  if (!isIsoDate(source.publishedAt)) fail(`${source.sourceId} invalid publishedAt`);
  const event = eventMap.get(source.relatedOfficialEvent);
  if (!event) fail(`${source.sourceId} unknown related event`);
  else if (source.publishedAt >= event.releaseDate) fail(`${source.sourceId} must remain contemporaneous pre-release support`);
  try {
    const url = new URL(source.url);
    if (!['m.ali213.net', 'www.hackhome.com'].includes(url.hostname)) fail(`${source.sourceId} unexpected secondary host ${url.hostname}`);
  } catch {
    fail(`${source.sourceId} invalid URL`);
  }
}
if (!same(supportingMap.get('secondary-ali213-2019-07-29')?.listedSoldierLabels, [
  '地精骑士', '蛛魔精灵', '钢翼勇士', '素体改造人', '水晶塑造者', '独角兽',
])) fail('2019-08 secondary candidate label list drift');
const expectedSepLabels = ['王女亲卫', '树人守卫', '魔蝎', '潮汐精灵', '矮人冒险者', '森林祭司', '魔晶术士'];
for (const sourceId of ['secondary-ali213-2019-09-06', 'secondary-hackhome-2019-09-10']) {
  if (!same(supportingMap.get(sourceId)?.listedSoldierLabels, expectedSepLabels)) fail(`${sourceId} candidate label list drift`);
}

const listIndex = indexById(list.records, 'Stage 5-8 list');
const metadataIndex = indexById(metadata.records, 'release metadata');
const candidateIndex = indexById(evidence.candidateRecords, 'Stage 11-A7 candidates');
const expectedCandidates = new Map([
  [1112, ['地精骑士', '地精骑士', 'official-cn-2019-08-15', true]],
  [1031, ['蛛魔精灵', '蛛魔精灵', 'official-cn-2019-08-15', true]],
  [420, ['钢翼勇士', '钢翼勇士', 'official-cn-2019-08-15', true]],
  [244, ['素体改造人', '素体改造人', 'official-cn-2019-08-15', true]],
  [128, ['水晶塑型者', '水晶塑造者', 'official-cn-2019-08-15', false]],
  [333, ['独角兽', '独角兽', 'official-cn-2019-08-15', true]],
  [245, ['王女亲卫', '王女亲卫', 'official-cn-2019-09-12', true]],
  [129, ['树人守卫', '树人守卫', 'official-cn-2019-09-12', true]],
  [334, ['魔蝎', '魔蝎', 'official-cn-2019-09-12', true]],
  [511, ['潮汐精灵', '潮汐精灵', 'official-cn-2019-09-12', true]],
  [635, ['矮人冒险者', '矮人冒险者', 'official-cn-2019-09-12', true]],
  [813, ['森林祭司', '森林祭司', 'official-cn-2019-09-12', true]],
  [636, ['魔晶术士', '魔晶术士', 'official-cn-2019-09-12', true]],
]);
if (candidateIndex.size !== 13) fail(`candidate unique count must be 13, got ${candidateIndex.size}`);
let exactMatches = 0;
let mismatches = 0;
const byEvent = new Map();
for (const [soldierId, expected] of expectedCandidates) {
  const [canonicalNameCn, secondaryLabel, eventId, exact] = expected;
  const candidate = candidateIndex.get(soldierId);
  const listRecord = listIndex.get(soldierId);
  const meta = metadataIndex.get(soldierId);
  if (!candidate) { fail(`missing candidate ${soldierId}`); continue; }
  if (candidate.canonicalNameCn !== canonicalNameCn
    || candidate.secondaryLabel !== secondaryLabel
    || candidate.officialEventSourceId !== eventId
    || candidate.canonicalExactLabelMatch !== exact) {
    fail(`candidate ${soldierId} frozen identity boundary drift`);
  }
  if (!listRecord || listRecord.nameCn !== canonicalNameCn || listRecord.tier !== 3 || listRecord.isSp !== false
    || listRecord.release?.releaseStatus !== 'UNRESOLVED' || listRecord.sortBucket !== 'NORMAL_TIER3_UNRESOLVED') {
    fail(`candidate ${soldierId} is no longer authoritative unresolved normal tier-3`);
  }
  if (!meta || meta.releaseStatus !== 'UNRESOLVED' || meta.releaseDate !== null || meta.sourceKind !== null) {
    fail(`candidate ${soldierId} release metadata was promoted or drifted`);
  }
  if (!eventMap.has(eventId)) fail(`candidate ${soldierId} unknown official event`);
  const ids = byEvent.get(eventId) ?? [];
  ids.push(soldierId);
  byEvent.set(eventId, ids);
  for (const supportingId of candidate.supportingSourceIds ?? []) if (!supportingMap.has(supportingId)) fail(`candidate ${soldierId} unknown supporting source ${supportingId}`);
  if (!candidate.admissionStatus?.startsWith('NOT_ADMITTED_')) fail(`candidate ${soldierId} must remain NOT_ADMITTED`);
  if (exact) exactMatches += 1; else mismatches += 1;
}
if (byEvent.get('official-cn-2019-08-15')?.length !== 6) fail('2019-08 candidate count must remain 6');
if (byEvent.get('official-cn-2019-09-12')?.length !== 7) fail('2019-09 candidate count must remain 7');
const crystal = candidateIndex.get(128);
if (crystal?.labelConflict !== 'SECONDARY_VARIANT_DIFFERS_FROM_CANONICAL_CN_LABEL'
  || crystal?.admissionStatus !== 'NOT_ADMITTED_PRIMARY_IDENTITY_PROVENANCE_MISSING_AND_LABEL_MISMATCH') {
  fail('Soldier 128 label mismatch boundary drift');
}
if (exactMatches !== 12 || mismatches !== 1) fail(`candidate exact/mismatch split must be 12/1, got ${exactMatches}/${mismatches}`);

const a1Ids = new Set((a1.records ?? []).map(record => record.soldierId));
for (const soldierId of candidateIndex.keys()) if (a1Ids.has(soldierId)) fail(`Stage 11-A7 candidate ${soldierId} overlaps admitted Stage 11-A1 evidence`);

if (!same(evidence.summary, {
  officialEventCount: 2,
  officialNewSoldierCountTotal: 13,
  candidateRecordCount: 13,
  candidateExactCanonicalLabelMatches: 12,
  candidateCanonicalLabelMismatches: 1,
  promotedRecordCount: 0,
  coverageChanged: false,
})) fail('Stage 11-A7 summary drift');
for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A7 boundary ${key} must remain false`);
if (!Array.isArray(evidence.blockers) || evidence.blockers.length !== 0) fail('Stage 11-A7 must have zero blockers');
if (!same(evidence.reviews, [{ code: 'PRE2020_OFFICIAL_EVENT_IDENTITY_PROVENANCE_MISSING', count: 13, classification: 'REVIEW' }])) {
  fail('Stage 11-A7 review boundary drift');
}
if (evidence.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail('Stage 11-A7 next owner drift');

if (errors.length) {
  console.error(`Soldier Stage 11-A7 pre-2020 release event boundary: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A7 pre-2020 release event boundary: PASS');
console.log('officialEvents=2 / officialNewSoldierCount=13');
console.log('candidateRecords=13 / exactCanonicalLabels=12 / labelMismatch=1');
console.log('promotedRecords=0 / coverage=51 confirmed + 173 unresolved / normalTier3Unresolved=78');
console.log('nextOwner=soldier-release-metadata-evidence-acquisition');
