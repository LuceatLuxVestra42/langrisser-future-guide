import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-archive-gap-stage11-a8.v1.json',
  a7: 'data/soldier-release-pre2020-event-boundary-stage11-a7.v1.json',
  a1: 'data/soldier-release-official-notice-evidence-stage11-a1.v1.json',
  metadata: 'data/generated/soldier-release-metadata.v1.json',
  list: 'data/generated/soldier-list-stage5-8.v1.json',
};
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const fail = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isIsoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const officialUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'mz.zlongame.com';
  } catch {
    return false;
  }
};

const evidence = readJson(paths.evidence);
const a7 = readJson(paths.a7);
const a1 = readJson(paths.a1);
const metadata = readJson(paths.metadata);
const list = readJson(paths.list);

if (evidence.version !== 1
  || evidence.schemaId !== 'soldier-release-official-archive-gap-stage11-a8/v1'
  || evidence.stage !== '11-A8'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'OFFICIAL_ARCHIVE_WINDOW_SCANNED_NO_QUALIFYING_EVENT_FOUND'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'OFFICIAL_ARCHIVE_GAP_INVENTORY_NO_RELEASE_PROMOTION') {
  fail('Stage 11-A8 identity/status drift');
}
if (evidence.capturedAgainstMain !== 'b6e87c65078ba233a99d42bc496575cd04c87aab') fail('Stage 11-A8 captured main drift');
if (evidence.predecessors?.stage11A7Boundary !== paths.a7
  || evidence.predecessors?.stage11A1Evidence !== paths.a1
  || evidence.predecessors?.releaseMetadata !== paths.metadata
  || evidence.predecessors?.soldierList !== paths.list) {
  fail('Stage 11-A8 predecessor path contract drift');
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
if (!same(evidence.coverageBefore, expectedCoverage) || !same(evidence.coverageAfter, expectedCoverage)) {
  fail('Stage 11-A8 coverage boundary drift');
}
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
if (a7.stage !== '11-A7' || a7.status !== 'PASS' || a7.summary?.promotedRecordCount !== 0 || a7.candidateRecords?.length !== 13) {
  fail('Stage 11-A7 predecessor drift');
}
if (a1.stage !== '11-A1' || a1.status !== 'FROZEN_ADMITTED' || a1.records?.length !== 40 || a1.sources?.length !== 19) {
  fail('Stage 11-A1 predecessor drift');
}

const policy = evidence.policy ?? {};
if (policy.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || policy.promotionAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
  || policy.qualifyingEventRequirement !== 'OFFICIAL_UPDATE_TEXT_EXPLICITLY_ADDS_OR_UNLOCKS_NEW_SOLDIERS'
  || policy.negativeSearchMeaning !== 'NO_QUALIFYING_EVENT_FOUND_IN_CAPTURED_OFFICIAL_ARCHIVE_SEARCH_WINDOW'
  || policy.negativeSearchMayProveAbsoluteNonexistence !== false
  || policy.negativeSearchMayAssignReleaseDate !== false
  || policy.negativeSearchMayInferLaunchPopulation !== false
  || policy.allowNameSimilarity !== false
  || policy.allowIdArithmetic !== false
  || policy.allowFilenameSimilarity !== false
  || policy.allowArchiveOrderInference !== false
  || policy.allowBatchCountToIdentityMapping !== false
  || policy.allowSamePatchOrderInference !== false) {
  fail('Stage 11-A8 policy boundary drift');
}

const scan = evidence.archiveScan ?? {};
if (scan.officialArchiveUrl !== 'https://mz.zlongame.com/jx/mzgg/'
  || scan.windowStart !== '2019-10-01'
  || scan.windowEnd !== '2020-07-31'
  || scan.method !== 'OFFICIAL_ARCHIVE_TERM_SEARCH_PLUS_BOUNDARY_AND_REPRESENTATIVE_NOTICE_REVIEW'
  || !same(scan.terms, ['练兵场', '全新兵种', '新增兵种', '新增科技兵种', '解锁全新小兵'])
  || scan.qualifyingOfficialEventCountFound !== 0
  || scan.promotedRecordCount !== 0
  || scan.conclusion !== 'NO_QUALIFYING_SOLDIER_RELEASE_EVENT_FOUND_IN_CAPTURED_OFFICIAL_ARCHIVE_SEARCH_WINDOW') {
  fail('Stage 11-A8 archive scan contract drift');
}
if (!isIsoDate(scan.windowStart) || !isIsoDate(scan.windowEnd) || scan.windowStart > scan.windowEnd) fail('Stage 11-A8 invalid scan window');
if (!officialUrl(scan.officialArchiveUrl)) fail('Stage 11-A8 archive must remain official');

const previous = evidence.boundaryAnchors?.previousQualifyingEvent;
const next = evidence.boundaryAnchors?.nextQualifyingEvent;
const a7Sep = (a7.officialEvents ?? []).find(event => event.sourceId === 'official-cn-2019-09-12');
const a1Aug = (a1.sources ?? []).find(event => event.sourceId === 'official-cn-2020-08-20');
if (!previous || previous.sourceId !== 'official-cn-2019-09-12' || previous.releaseDate !== '2019-09-12'
  || previous.url !== a7Sep?.url || previous.officialNewSoldierCount !== 7
  || previous.identityStatus !== 'EVENT_CONFIRMED_IDENTITY_UNRESOLVED' || previous.sourceCheckpoint !== '11-A7') {
  fail('Stage 11-A8 previous boundary anchor drift');
}
if (!next || next.sourceId !== 'official-cn-2020-08-20' || next.releaseDate !== '2020-08-20'
  || next.url !== a1Aug?.url || !same(next.newSoldierLabels, ['洗罪者', '机械骑士'])
  || !same(next.newSoldierLabels, a1Aug?.newSoldierLabels)
  || next.identityStatus !== 'PRIMARY_SOURCE_NAMES_EXPLICIT' || next.sourceCheckpoint !== '11-A1') {
  fail('Stage 11-A8 next boundary anchor drift');
}
if (!(previous.releaseDate < scan.windowStart && scan.windowEnd < next.releaseDate)) fail('Stage 11-A8 boundary anchors do not bracket scan window');

const notices = Array.isArray(evidence.representativeNonQualifyingNotices) ? evidence.representativeNonQualifyingNotices : [];
const expectedNotices = [
  ['2019-10-09', 'https://mz.zlongame.com/jx/mzgg/20191009/10697.html'],
  ['2019-11-13', 'https://mz.zlongame.com/jx/mzgg/20191113/11212.html'],
  ['2020-02-26', 'https://mz.zlongame.com/jx/mzgg/20200226/11692.html'],
  ['2020-03-04', 'https://mz.zlongame.com/jx/mzgg/20200304/11713.html'],
  ['2020-04-15', 'https://mz.zlongame.com/jx/mzgg/20200415/11874.html'],
  ['2020-05-27', 'https://mz.zlongame.com/jx/mzgg/20200527/12068.html'],
  ['2020-07-22', 'https://mz.zlongame.com/jx/mzgg/20200722/12315.html'],
  ['2020-07-29', 'https://mz.zlongame.com/jx/mzgg/20200729/12338.html'],
];
if (notices.length !== expectedNotices.length) fail(`expected ${expectedNotices.length} representative notices, got ${notices.length}`);
for (let i = 0; i < expectedNotices.length; i += 1) {
  const notice = notices[i];
  const [date, url] = expectedNotices[i];
  if (!notice || notice.noticePublishedAt !== date || notice.url !== url
    || notice.reviewResult !== 'NO_TRAINING_GROUND_NEW_SOLDIER_ADDITION_FOUND'
    || !isIsoDate(notice.noticePublishedAt) || !officialUrl(notice.url)
    || notice.noticePublishedAt < scan.windowStart || notice.noticePublishedAt > scan.windowEnd) {
    fail(`representative notice ${i + 1} drift`);
  }
}

for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A8 boundary ${key} must remain false`);
if (!Array.isArray(evidence.blockers) || evidence.blockers.length !== 0) fail('Stage 11-A8 must have zero blockers');
if (!Array.isArray(evidence.reviews) || evidence.reviews.length !== 0) fail('Stage 11-A8 adds no new review entry');
if (evidence.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail('Stage 11-A8 next owner drift');
if (!Array.isArray(evidence.nextStartPoint) || evidence.nextStartPoint.length < 3) fail('Stage 11-A8 next start point missing');
if (!Array.isArray(evidence.reopenConditions) || evidence.reopenConditions.length < 3) fail('Stage 11-A8 reopen conditions missing');

if (errors.length) {
  console.error(`Soldier Stage 11-A8 official archive gap: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A8 official archive gap: PASS');
console.log('window=2019-10-01..2020-07-31 / qualifyingEventsFound=0 / promotedRecords=0');
console.log('coverage=224 = 51 confirmed + 173 unresolved; normalTier3Unresolved=78');
console.log('negative archive evidence remains non-promotional and may not infer launch population.');
