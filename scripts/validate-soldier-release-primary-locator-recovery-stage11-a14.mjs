import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-primary-locator-recovery-stage11-a14.v1.json',
  a7: 'data/soldier-release-pre2020-event-boundary-stage11-a7.v1.json',
  a13: 'data/soldier-release-legacy-page-chronology-boundary-stage11-a13.v1.json',
  metadata: 'data/generated/soldier-release-metadata.v1.json',
  list: 'data/generated/soldier-list-stage5-8.v1.json',
};
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const fail = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...values].sort((a, b) => a - b);
const officialNewsUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'news.zlongame.com';
  } catch {
    return false;
  }
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
const a13 = readJson(paths.a13);
const metadata = readJson(paths.metadata);
const list = readJson(paths.list);

if (evidence.version !== 1
  || evidence.schemaId !== 'soldier-release-primary-locator-recovery-stage11-a14/v1'
  || evidence.stage !== '11-A14'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'PRIMARY_LOCATOR_RECOVERED_BODY_IDENTITY_NOT_RETRIEVED_NO_PROMOTION'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'A7_PRIMARY_IDENTITY_LOCATOR_RECOVERY_ONLY_NO_RELEASE_PROMOTION') {
  fail('Stage 11-A14 identity/status drift');
}
if (evidence.capturedAgainstMain !== 'f32c9aeab762c6a4eed44d178062d9f79b9eb64b') fail('Stage 11-A14 captured main drift');
if (evidence.predecessors?.stage11A7Boundary !== paths.a7
  || evidence.predecessors?.stage11A13LegacyPageBoundary !== paths.a13
  || evidence.predecessors?.releaseMetadata !== paths.metadata
  || evidence.predecessors?.soldierList !== paths.list) {
  fail('Stage 11-A14 predecessor path contract drift');
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
  fail('Stage 11-A14 coverage boundary drift');
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
if (a7.stage !== '11-A7' || a7.status !== 'PASS'
  || a7.summary?.officialEventCount !== 2
  || a7.summary?.officialNewSoldierCountTotal !== 13
  || a7.summary?.candidateRecordCount !== 13
  || a7.summary?.promotedRecordCount !== 0
  || a7.candidateRecords?.length !== 13) {
  fail('Stage 11-A7 predecessor drift');
}
if (a13.stage !== '11-A13' || a13.status !== 'PASS'
  || a13.summary?.inspectedLegacyOfficialPages !== 8
  || a13.summary?.promotedRecordCount !== 0) {
  fail('Stage 11-A13 predecessor drift');
}

const policy = evidence.policy ?? {};
if (policy.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || policy.promotionAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE_OR_EQUIVALENT_PRIMARY_PUBLISHER_SOURCE'
  || policy.canonicalIdentityRequirement !== 'PRIMARY_SOURCE_MUST_EXPLICITLY_IDENTIFY_EACH_PROMOTED_SOLDIER'
  || policy.primaryLocatorWithoutBodyMayPromote !== false
  || policy.officialEventCountWithoutNamesMayPromote !== false
  || policy.incidentalSoldierMentionMayIdentifyUnnamedReleaseBatch !== false
  || policy.secondarySourceMayPromote !== false
  || policy.hybridOfficialEventPlusSecondaryIdentityMayPromote !== false
  || policy.allowNameSimilarity !== false
  || policy.allowIdArithmetic !== false
  || policy.allowFilenameOrUrlInference !== false
  || policy.allowBatchCountToIdentityMapping !== false
  || policy.allowSamePatchOrderInference !== false) {
  fail('Stage 11-A14 policy boundary drift');
}

const locator = evidence.primaryLocatorRecovery ?? {};
if (locator.relatedOfficialEventSourceId !== 'official-cn-2019-08-15'
  || locator.officialTagIndexUrl !== 'https://news.zlongame.com/tag/3693.jspx'
  || locator.officialTagLabel !== '兵种'
  || locator.listingCategory !== '招募计划'
  || locator.listingTitle !== '战术布局再升级----70级、英雄觉醒、全新兵种'
  || locator.listingSourceLabel !== '本站原创'
  || locator.listingPublishedAtText !== '2019-08-09 13:53:52'
  || locator.articleUrl !== 'https://news.zlongame.com/jx/mzplan/20190809/7386.html'
  || locator.tagIndexRetrievalStatus !== 'RETRIEVED'
  || locator.articleBodyRetrievalStatus !== 'NOT_RETRIEVED_IN_CAPTURED_CURRENT_WEB_ACCESS'
  || locator.articleBodyRetrievalFailure !== 'CACHE_MISS'
  || locator.primaryIdentityContentStatus !== 'NOT_RETRIEVED'
  || locator.explicitCandidateSoldierNamesRetrieved !== false
  || locator.releasePromotionEligible !== false) {
  fail('Stage 11-A14 August primary locator drift');
}
if (!officialNewsUrl(locator.officialTagIndexUrl) || !officialNewsUrl(locator.articleUrl)) fail('Stage 11-A14 August official URL drift');

const september = evidence.septemberPrimaryConfirmation ?? {};
if (september.relatedOfficialEventSourceId !== 'official-cn-2019-09-12'
  || september.url !== 'https://news.zlongame.com/jx/mzInfoNews/20190917/10597.html'
  || september.title !== '“少女的旅途”版本更新内容'
  || september.sectionHeading !== '练兵场新兵种解锁'
  || september.officialNewSoldierCount !== 7
  || september.officialEventClaim !== '更新完成后，练兵场中将添加7个全新兵种。'
  || september.explicitNewSoldierNamesListed !== false
  || september.releasePromotionEligible !== false
  || !same(september.incidentalSoldierMentions, [{ label: '地精骑士', context: 'SKILL_DESCRIPTION_ADJUSTMENT', mayIdentifySevenNewSoldiers: false }])) {
  fail('Stage 11-A14 September primary confirmation drift');
}
if (!officialNewsUrl(september.url)) fail('Stage 11-A14 September official URL drift');

const augustIds = [1112, 1031, 420, 244, 128, 333];
const septemberIds = [245, 129, 334, 511, 635, 813, 636];
const allIds = [...augustIds, ...septemberIds];
const boundary = evidence.a7CandidateBoundary ?? {};
if (boundary.candidateRecordCount !== 13
  || !same(boundary.augustCandidateIds, augustIds)
  || !same(boundary.septemberCandidateIds, septemberIds)
  || boundary.primaryIdentityRecoveredCount !== 0
  || boundary.promotedRecordCount !== 0
  || boundary.allRemainUnresolved !== true) {
  fail('Stage 11-A14 A7 candidate boundary drift');
}
const a7Ids = a7.candidateRecords.map(record => record.soldierId);
if (!same(sorted(a7Ids), sorted(allIds))) fail('Stage 11-A14 candidate set no longer matches A7');

const listIndex = indexById(list.records, 'Stage 5-8 list');
const metadataIndex = indexById(metadata.records, 'release metadata');
const a7Index = indexById(a7.candidateRecords, 'Stage 11-A7 candidates');
for (const soldierId of allIds) {
  const candidate = a7Index.get(soldierId);
  const listRecord = listIndex.get(soldierId);
  const meta = metadataIndex.get(soldierId);
  if (!candidate || !String(candidate.admissionStatus ?? '').startsWith('NOT_ADMITTED_')) fail(`A7 candidate ${soldierId} admission drift`);
  if (!listRecord || listRecord.tier !== 3 || listRecord.isSp !== false
    || listRecord.sortBucket !== 'NORMAL_TIER3_UNRESOLVED'
    || listRecord.release?.releaseStatus !== 'UNRESOLVED'
    || listRecord.release?.releaseDate !== null
    || listRecord.release?.patchGroup !== null) {
    fail(`A7 candidate ${soldierId} is no longer authoritative unresolved normal tier-3`);
  }
  if (!meta || meta.releaseStatus !== 'UNRESOLVED' || meta.releaseDate !== null || meta.patchGroup !== null
    || meta.sourceKind !== null || meta.mappingStatus !== null) {
    fail(`A7 candidate ${soldierId} release metadata was promoted or drifted`);
  }
}

for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A14 boundary ${key} must remain false`);
if (!Array.isArray(evidence.blockers) || evidence.blockers.length !== 0) fail('Stage 11-A14 must have zero blockers');
if (!Array.isArray(evidence.reviews) || evidence.reviews.length !== 0) fail('Stage 11-A14 adds no review entry');
if (evidence.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail('Stage 11-A14 next owner drift');
if (!Array.isArray(evidence.nextStartPoint) || evidence.nextStartPoint.length < 4) fail('Stage 11-A14 next start point missing');
if (!Array.isArray(evidence.reopenConditions) || evidence.reopenConditions.length < 3) fail('Stage 11-A14 reopen conditions missing');

if (errors.length) {
  console.error(`Soldier Stage 11-A14 primary locator recovery: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A14 primary locator recovery: PASS');
console.log('officialPrimaryLocators=1 / primaryIdentityRecovered=0 / A7Candidates=13 / promotedRecords=0');
console.log('coverage=224 = 51 confirmed + 173 unresolved; normalTier3Unresolved=78');
console.log('2019-08 article body remains unretrieved; 2019-09 official page confirms seven without naming them.');
