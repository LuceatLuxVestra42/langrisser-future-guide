import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-archive-gap-stage11-a12.v1.json',
  a7: 'data/soldier-release-pre2020-event-boundary-stage11-a7.v1.json',
  a8: 'data/soldier-release-official-archive-gap-stage11-a8.v1.json',
  metadata: 'data/generated/soldier-release-metadata.v1.json',
  list: 'data/generated/soldier-list-stage5-8.v1.json',
};
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const fail = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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
const a8 = readJson(paths.a8);
const metadata = readJson(paths.metadata);
const list = readJson(paths.list);

if (evidence.version !== 1
  || evidence.schemaId !== 'soldier-release-official-archive-gap-stage11-a12/v1'
  || evidence.stage !== '11-A12'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'PRE2_OFFICIAL_ARCHIVE_WINDOW_SCANNED_NO_QUALIFYING_EVENT_FOUND'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'OFFICIAL_ARCHIVE_GAP_INVENTORY_NO_RELEASE_PROMOTION') {
  fail('Stage 11-A12 identity/status drift');
}
if (evidence.capturedAgainstMain !== '3a23088a28a3bf2c76bd650b67fce16f334581a0') fail('Stage 11-A12 captured main drift');
if (evidence.predecessors?.stage11A7Boundary !== paths.a7
  || evidence.predecessors?.stage11A8ArchiveGap !== paths.a8
  || evidence.predecessors?.releaseMetadata !== paths.metadata
  || evidence.predecessors?.soldierList !== paths.list) {
  fail('Stage 11-A12 predecessor path contract drift');
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
  fail('Stage 11-A12 coverage boundary drift');
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
if (a7.stage !== '11-A7' || a7.status !== 'PASS') fail('Stage 11-A7 predecessor drift');
if (a8.stage !== '11-A8' || a8.status !== 'PASS'
  || a8.archiveScan?.windowStart !== '2019-10-01'
  || a8.archiveScan?.windowEnd !== '2020-07-31'
  || a8.archiveScan?.qualifyingOfficialEventCountFound !== 0
  || a8.archiveScan?.promotedRecordCount !== 0) {
  fail('Stage 11-A8 predecessor drift');
}

const policy = evidence.policy ?? {};
if (policy.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || policy.promotionAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
  || policy.qualifyingEventRequirement !== 'OFFICIAL_UPDATE_TEXT_EXPLICITLY_ADDS_OR_UNLOCKS_NEW_SOLDIERS_IN_TRAINING_GROUND'
  || policy.heroProfessionSoldierUnlockIsReleaseEvidence !== false
  || policy.trainingGuideIsReleaseEvidence !== false
  || policy.negativeSearchMeaning !== 'NO_QUALIFYING_EVENT_FOUND_IN_CAPTURED_OFFICIAL_ARCHIVE_SEARCH_WINDOW'
  || policy.negativeSearchMayProveAbsoluteNonexistence !== false
  || policy.negativeSearchMayAssignReleaseDate !== false
  || policy.negativeSearchMayInferLaunchPopulation !== false
  || policy.allowNameSimilarity !== false
  || policy.allowIdArithmetic !== false
  || policy.allowFilenameSimilarity !== false
  || policy.allowArchiveOrderInference !== false
  || policy.allowBatchCountToIdentityMapping !== false
  || policy.allowLaunchPopulationSubtraction !== false
  || policy.allowSamePatchOrderInference !== false) {
  fail('Stage 11-A12 policy boundary drift');
}

const scan = evidence.archiveScan ?? {};
if (scan.officialArchiveUrl !== 'https://mz.zlongame.com/jx/mzgg/'
  || scan.windowStart !== '2018-08-16'
  || scan.windowEnd !== '2019-08-14'
  || scan.method !== 'OFFICIAL_ARCHIVE_TERM_SEARCH_PLUS_BOUNDARY_AND_REPRESENTATIVE_NOTICE_REVIEW'
  || !same(scan.terms, ['练兵场', '全新兵种', '新增兵种', '添加全新兵种', '解锁全新小兵', '解锁兵种'])
  || scan.qualifyingOfficialEventCountFound !== 0
  || scan.promotedRecordCount !== 0
  || scan.conclusion !== 'NO_QUALIFYING_TRAINING_GROUND_NEW_SOLDIER_RELEASE_EVENT_FOUND_IN_CAPTURED_PRE2_ARCHIVE_WINDOW') {
  fail('Stage 11-A12 archive scan drift');
}

const start = evidence.boundaryAnchors?.windowStartContext;
const next = evidence.boundaryAnchors?.nextQualifyingEvent;
if (start?.sourceId !== 'official-cn-all-platform-open-2018-08-16'
  || start?.contextDate !== '2018-08-16'
  || start?.url !== 'https://mz.zlongame.com/jx/mzhd/20180816/5586.html'
  || start?.meaning !== 'OFFICIAL_ALL_PLATFORM_PUBLIC_TEST_CONTEXT_ONLY'
  || start?.mapsSoldiersToReleaseDate !== false
  || start?.mapsLaunchPopulation !== false
  || !officialUrl(start?.url)) {
  fail('Stage 11-A12 start boundary drift');
}
if (next?.sourceId !== 'official-cn-2019-08-15'
  || next?.releaseDate !== '2019-08-15'
  || next?.url !== 'https://mz.zlongame.com/jx/mzgg/20190814/7403.html'
  || next?.identityStatus !== 'EVENT_CONFIRMED_IDENTITY_UNRESOLVED'
  || next?.officialNewSoldierCount !== 6
  || next?.sourceCheckpoint !== '11-A7'
  || !officialUrl(next?.url)) {
  fail('Stage 11-A12 next qualifying boundary drift');
}

const expectedNotices = [
  ['2018-09-05', '梦幻模拟战9月6日更新维护公告', 'https://mz.zlongame.com/jx/mzgg/20180905/5728.html'],
  ['2018-10-17', '梦幻模拟战10月18日更新维护公告', 'https://mz.zlongame.com/jx/mzgg/20181017/5894.html'],
  ['2019-02-13', '2月14日更新维护公告', 'https://mz.zlongame.com/jx/mzgg/20190213/6419.html'],
  ['2019-04-03', '4月4日更新维护公告', 'https://mz.zlongame.com/jx/mzgg/20190403/6624.html'],
  ['2019-07-24', '7月25日更新维护公告', 'https://mz.zlongame.com/jx/mzgg/20190724/7300.html'],
];
const notices = evidence.representativeNonQualifyingNotices ?? [];
if (notices.length !== expectedNotices.length) fail(`Stage 11-A12 representative notice count must be ${expectedNotices.length}`);
for (let i = 0; i < expectedNotices.length; i += 1) {
  const [date, title, url] = expectedNotices[i];
  const notice = notices[i];
  if (!notice || notice.noticePublishedAt !== date || notice.title !== title || notice.url !== url
    || !officialUrl(notice.url)
    || notice.reviewResult !== 'HERO_PROFESSION_SOLDIER_UNLOCK_NOT_TRAINING_GROUND_NEW_SOLDIER_RELEASE'
    || !Array.isArray(notice.observedSoldierText) || notice.observedSoldierText.length < 1) {
    fail(`Stage 11-A12 representative notice ${i + 1} drift`);
  }
}

const guide = evidence.supportingSystemContext ?? {};
if (guide.title !== '士兵的试炼：练兵场'
  || guide.publishedAt !== '2018-08-13'
  || guide.url !== 'https://mz.zlongame.com/jx/mzgl/20180813/5557.html'
  || guide.meaning !== 'PRE_LAUNCH_TRAINING_GROUND_SYSTEM_GUIDE_ONLY'
  || guide.mapsSoldiersToReleaseDate !== false
  || guide.mapsLaunchPopulation !== false
  || !officialUrl(guide.url)) {
  fail('Stage 11-A12 training guide boundary drift');
}

for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A12 boundary ${key} must remain false`);
if (!Array.isArray(evidence.blockers) || evidence.blockers.length !== 0) fail('Stage 11-A12 must have zero blockers');
if (!Array.isArray(evidence.reviews) || evidence.reviews.length !== 0) fail('Stage 11-A12 adds no review entry');
if (evidence.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail('Stage 11-A12 next owner drift');
if (!Array.isArray(evidence.nextStartPoint) || evidence.nextStartPoint.length < 4) fail('Stage 11-A12 next start point missing');
if (!Array.isArray(evidence.reopenConditions) || evidence.reopenConditions.length < 3) fail('Stage 11-A12 reopen conditions missing');

if (errors.length) {
  console.error(`Soldier Stage 11-A12 pre-2.0 official archive gap: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A12 pre-2.0 official archive gap: PASS');
console.log('window=2018-08-16..2019-08-14 / qualifyingEvents=0 / promotedRecords=0');
console.log('coverage=224 = 51 confirmed + 173 unresolved; normalTier3Unresolved=78');
console.log('Hero profession Soldier unlocks and the pre-launch Training Ground guide remain non-release evidence.');
