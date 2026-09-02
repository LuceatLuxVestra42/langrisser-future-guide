import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-taptap-primary-boundary-stage11-a16.v1.json',
  a7: 'data/soldier-release-pre2020-event-boundary-stage11-a7.v1.json',
  a15: 'data/soldier-release-official-wechat-mirror-boundary-stage11-a15.v1.json',
  metadata: 'data/generated/soldier-release-metadata.v1.json',
  list: 'data/generated/soldier-list-stage5-8.v1.json',
};
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const fail = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...values].sort((a, b) => a - b);
const tapTapUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.taptap.cn';
  } catch { return false; }
};
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
const a7 = readJson(paths.a7);
const a15 = readJson(paths.a15);
const metadata = readJson(paths.metadata);
const list = readJson(paths.list);

if (evidence.version !== 1
  || evidence.schemaId !== 'soldier-release-official-taptap-primary-boundary-stage11-a16/v1'
  || evidence.stage !== '11-A16'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'OFFICIAL_TAPTAP_PRIMARY_ROUTE_SCANNED_NO_A7_IDENTITY_PROMOTION'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'A7_OFFICIAL_TAPTAP_PRIMARY_ROUTE_NO_RELEASE_PROMOTION') {
  fail('Stage 11-A16 identity/status drift');
}
if (evidence.capturedAgainstMain !== '00a8cfd9cba598a8fc28fcd6d61fbd3a6b196674') fail('Stage 11-A16 captured main drift');
if (evidence.predecessors?.stage11A7Boundary !== paths.a7
  || evidence.predecessors?.stage11A15WechatBoundary !== paths.a15
  || evidence.predecessors?.releaseMetadata !== paths.metadata
  || evidence.predecessors?.soldierList !== paths.list) fail('Stage 11-A16 predecessor drift');

const expectedCoverage = {
  canonicalSoldiers: 224,
  confirmedReleaseRecords: 51,
  unresolvedReleaseRecords: 173,
  normalTier3Confirmed: 51,
  normalTier3Unresolved: 78,
  sp: 56,
  lowerTier: 39,
};
if (!same(evidence.coverageBefore, expectedCoverage) || !same(evidence.coverageAfter, expectedCoverage)) fail('Stage 11-A16 coverage drift');
if (list.status !== 'PASS' || list.summary?.recordCount !== 224 || list.summary?.confirmedReleaseCount !== 51
  || list.summary?.unresolvedNormalTier3Count !== 78 || list.summary?.spCount !== 56 || list.summary?.lowerTierCount !== 39) {
  fail('authoritative Stage 5-8 list coverage drift');
}
if (metadata.status !== 'PASS' || metadata.summary?.canonicalSoldiers !== 224 || metadata.summary?.confirmedReleaseRecords !== 51
  || metadata.summary?.unresolvedReleaseRecords !== 173 || metadata.summary?.normalTier3Confirmed !== 51
  || metadata.summary?.normalTier3Unresolved !== 78 || metadata.summary?.spSoldiers !== 56 || metadata.summary?.lowerTierNormal !== 39) {
  fail('authoritative release metadata coverage drift');
}
if (a7.stage !== '11-A7' || a7.status !== 'PASS' || a7.summary?.candidateRecordCount !== 13 || a7.summary?.promotedRecordCount !== 0) fail('Stage 11-A7 predecessor drift');
if (a15.stage !== '11-A15' || a15.status !== 'PASS' || a15.a7CandidateBoundary?.candidateRecordCount !== 13
  || a15.a7CandidateBoundary?.primaryWechatIdentityRecoveredCount !== 0 || a15.a7CandidateBoundary?.promotedRecordCount !== 0) fail('Stage 11-A15 predecessor drift');

const policy = evidence.policy ?? {};
if (policy.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || policy.promotionAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE_OR_EQUIVALENT_PRIMARY_PUBLISHER_SOURCE'
  || policy.officialPlatformPublisherPostMayBePrimary !== true
  || policy.platformOfficialStatusRequirement !== 'OFFICIAL_ENTRY_AND_PUBLISHER_IDENTITY_MUST_BE_VISIBLE'
  || policy.canonicalIdentityRequirement !== 'PRIMARY_POST_MUST_EXPLICITLY_IDENTIFY_EACH_PROMOTED_SOLDIER'
  || policy.officialBatchCountWithoutNamesMayPromote !== false
  || policy.collectionIndexWithoutExactIdentityContentMayPromote !== false
  || policy.candidateNameSearchMissMayProveNonexistence !== false
  || policy.secondarySourceMayPromote !== false
  || policy.hybridOfficialEventPlusSecondaryIdentityMayPromote !== false
  || policy.allowNameSimilarity !== false || policy.allowIdArithmetic !== false
  || policy.allowBatchCountToIdentityMapping !== false || policy.allowSamePatchOrderInference !== false) fail('Stage 11-A16 policy drift');

const platform = evidence.officialTapTapPlatform ?? {};
if (platform.gamePageUrl !== 'https://www.taptap.cn/app/61035' || platform.gameTitle !== '梦幻模拟战'
  || platform.officialEntryDisplayed !== true || platform.officialEntryLabel !== '官方入驻'
  || platform.publisherDisplayed !== '紫龙游戏' || platform.supplierDisplayed !== '上海紫舜信息技术有限公司'
  || platform.developerContactDomain !== 'zlongame.com' || platform.publisherPlatformStatus !== 'OFFICIAL_PUBLISHER_CHANNEL_VERIFIED'
  || !tapTapUrl(platform.gamePageUrl)) fail('Stage 11-A16 official TapTap platform provenance drift');

const august = evidence.augustOfficialPost ?? {};
const expectedAugustSearch = {
  '地精骑士': false,
  '蛛魔精灵': false,
  '钢翼勇士': false,
  '素体改造人': false,
  '水晶塑型者_or_水晶塑造者': false,
  '独角兽': false,
};
if (august.relatedOfficialEventSourceId !== 'official-cn-2019-08-15'
  || august.url !== 'https://www.taptap.cn/moment/15209104423259386'
  || august.title !== '全新大陆、超限觉醒、练兵升级…全新2.0版本火热来袭！'
  || august.author !== '光辉军团新兵' || august.displayedDate !== '2019-08-15'
  || august.officialNewSoldierCount !== 6 || august.retrievedBody !== true
  || !same(august.candidateNameSearch, expectedAugustSearch)
  || august.explicitNewSoldierNamesListed !== false || august.primaryIdentityRecoveredCount !== 0
  || august.releasePromotionEligible !== false || !tapTapUrl(august.url)) fail('Stage 11-A16 August TapTap boundary drift');

const september = evidence.septemberOfficialPostIndex ?? {};
const expectedSeptemberSearch = {
  '王女亲卫': false,
  '树人守卫': false,
  '魔蝎': false,
  '潮汐精灵': false,
  '矮人冒险者': false,
  '森林祭司': false,
  '魔晶术士': false,
};
if (september.relatedOfficialEventSourceId !== 'official-cn-2019-09-12'
  || september.collectionUrl !== 'https://www.taptap.cn/app/61035/strategy/collection/2?page=3'
  || september.title !== '新英雄女神化身、艾米莉亚登场，资料片“少女的旅途”火热降临！'
  || september.author !== '光辉军团新兵' || september.displayedDate !== '2019-09-11'
  || september.officialNewSoldierCount !== 7 || september.exactMomentUrlRecovered !== false
  || september.fullPostBodyRecoveredInCurrentSearch !== false
  || !same(september.indexedCollectionCandidateNameSearch, expectedSeptemberSearch)
  || september.siteCandidateSearchRecovered2019OfficialIdentityPostCount !== 0
  || september.primaryIdentityRecoveredCount !== 0 || september.releasePromotionEligible !== false
  || !tapTapUrl(september.collectionUrl)) fail('Stage 11-A16 September TapTap boundary drift');

const augustIds = [1112, 1031, 420, 244, 128, 333];
const septemberIds = [245, 129, 334, 511, 635, 813, 636];
const allIds = [...augustIds, ...septemberIds];
const boundary = evidence.a7CandidateBoundary ?? {};
if (boundary.candidateRecordCount !== 13 || !same(boundary.augustCandidateIds, augustIds)
  || !same(boundary.septemberCandidateIds, septemberIds) || boundary.primaryTapTapIdentityRecoveredCount !== 0
  || boundary.promotedRecordCount !== 0 || boundary.allRemainUnresolved !== true) fail('Stage 11-A16 candidate boundary drift');
if (!same(sorted(a7.candidateRecords.map(record => record.soldierId)), sorted(allIds))) fail('Stage 11-A16 A7 candidate set drift');

const listIndex = indexById(list.records, 'Stage 5-8 list');
const metadataIndex = indexById(metadata.records, 'release metadata');
for (const soldierId of allIds) {
  const listRecord = listIndex.get(soldierId);
  const meta = metadataIndex.get(soldierId);
  if (!listRecord || listRecord.tier !== 3 || listRecord.isSp !== false || listRecord.sortBucket !== 'NORMAL_TIER3_UNRESOLVED'
    || listRecord.release?.releaseStatus !== 'UNRESOLVED' || listRecord.release?.releaseDate !== null || listRecord.release?.patchGroup !== null) {
    fail(`Stage 11-A16 candidate ${soldierId} is no longer unresolved normal tier-3`);
  }
  if (!meta || meta.releaseStatus !== 'UNRESOLVED' || meta.releaseDate !== null || meta.patchGroup !== null || meta.sourceKind !== null || meta.mappingStatus !== null) {
    fail(`Stage 11-A16 candidate ${soldierId} release metadata was promoted or drifted`);
  }
}

for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A16 boundary ${key} must remain false`);
if (!Array.isArray(evidence.blockers) || evidence.blockers.length !== 0) fail('Stage 11-A16 must have zero blockers');
if (!Array.isArray(evidence.reviews) || evidence.reviews.length !== 0) fail('Stage 11-A16 adds no review entry');
if (evidence.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail('Stage 11-A16 next owner drift');
if (!Array.isArray(evidence.nextStartPoint) || evidence.nextStartPoint.length < 4) fail('Stage 11-A16 next start point missing');
if (!Array.isArray(evidence.reopenConditions) || evidence.reopenConditions.length < 3) fail('Stage 11-A16 reopen conditions missing');

if (errors.length) {
  console.error(`Soldier Stage 11-A16 official TapTap primary boundary: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A16 official TapTap primary boundary: PASS');
console.log('officialTapTapChannel=true / A7PrimaryIdentityRecovered=0 / promotedRecords=0');
console.log('coverage=224 = 51 confirmed + 173 unresolved; normalTier3Unresolved=78');
