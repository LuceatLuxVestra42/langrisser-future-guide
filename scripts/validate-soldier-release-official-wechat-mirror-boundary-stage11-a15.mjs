import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-wechat-mirror-boundary-stage11-a15.v1.json',
  a7: 'data/soldier-release-pre2020-event-boundary-stage11-a7.v1.json',
  a14: 'data/soldier-release-primary-locator-recovery-stage11-a14.v1.json',
  metadata: 'data/generated/soldier-release-metadata.v1.json',
  list: 'data/generated/soldier-list-stage5-8.v1.json',
};
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const fail = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...values].sort((a, b) => a - b);
const officialHost = value => {
  try {
    const host = new URL(value).hostname;
    return host === 'www.zlongame.com' || host === 'mz.zlongame.com' || host === 'news.zlongame.com';
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
const a14 = readJson(paths.a14);
const metadata = readJson(paths.metadata);
const list = readJson(paths.list);

if (evidence.version !== 1
  || evidence.schemaId !== 'soldier-release-official-wechat-mirror-boundary-stage11-a15/v1'
  || evidence.stage !== '11-A15'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'OFFICIAL_WECHAT_ACCOUNT_VERIFIED_MIRROR_NOT_PRIMARY_ADMITTED_NO_PROMOTION'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'A7_OFFICIAL_WECHAT_MIRROR_PROVENANCE_BOUNDARY_NO_RELEASE_PROMOTION') {
  fail('Stage 11-A15 identity/status drift');
}
if (evidence.capturedAgainstMain !== 'f18baf749a84e0ae6fd1145f492c0d45f833a45c') fail('Stage 11-A15 captured main drift');
if (evidence.predecessors?.stage11A7Boundary !== paths.a7
  || evidence.predecessors?.stage11A14PrimaryLocator !== paths.a14
  || evidence.predecessors?.releaseMetadata !== paths.metadata
  || evidence.predecessors?.soldierList !== paths.list) fail('Stage 11-A15 predecessor drift');

const expectedCoverage = {
  canonicalSoldiers: 224,
  confirmedReleaseRecords: 51,
  unresolvedReleaseRecords: 173,
  normalTier3Confirmed: 51,
  normalTier3Unresolved: 78,
  sp: 56,
  lowerTier: 39,
};
if (!same(evidence.coverageBefore, expectedCoverage) || !same(evidence.coverageAfter, expectedCoverage)) fail('Stage 11-A15 coverage drift');
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
if (a14.stage !== '11-A14' || a14.status !== 'PASS' || a14.a7CandidateBoundary?.candidateRecordCount !== 13
  || a14.a7CandidateBoundary?.primaryIdentityRecoveredCount !== 0 || a14.a7CandidateBoundary?.promotedRecordCount !== 0) fail('Stage 11-A14 predecessor drift');

const policy = evidence.policy ?? {};
if (policy.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || policy.promotionAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE_OR_EQUIVALENT_PRIMARY_PUBLISHER_SOURCE'
  || policy.officialWechatAccountMayBePrimary !== true
  || policy.thirdPartyMirrorRequiresAccountIdentityAndArticleProvenance !== true
  || policy.displayNameMatchAloneMayEstablishEquivalentPrimary !== false
  || policy.publisherEmailMarkerAloneMayEstablishEquivalentPrimary !== false
  || policy.mirrorWithoutOfficialWechatIdMayPromote !== false
  || policy.mirrorWithoutRecovered2019ArticleMayPromote !== false
  || policy.secondarySourceMayPromote !== false
  || policy.hybridOfficialEventPlusMirrorInferenceMayPromote !== false
  || policy.allowNameSimilarity !== false || policy.allowIdArithmetic !== false
  || policy.allowBatchCountToIdentityMapping !== false || policy.allowSamePatchOrderInference !== false) fail('Stage 11-A15 policy drift');

const account = evidence.officialWechatAccount ?? {};
if (account.accountDisplayName !== '梦幻模拟战手游' || account.wechatId !== 'mhmnzsy'
  || account.authority !== 'OFFICIAL_ZLONGAME_PUBLISHER_SOURCE' || account.primaryAccountIdentityStatus !== 'VERIFIED'
  || !Array.isArray(account.officialSourceUrls) || account.officialSourceUrls.length !== 3
  || account.officialSourceUrls.some(url => !officialHost(url))) fail('Stage 11-A15 official WeChat account provenance drift');

const mirror = evidence.mirrorCandidate ?? {};
if (mirror.service !== 'FreeWeChat'
  || mirror.profileUrl !== 'https://freewechat.com/profile/MzI4ODY2MjA4NA=='
  || mirror.displayName !== '梦幻模拟战手游'
  || mirror.authority !== 'THIRD_PARTY_ARCHIVE_MIRROR'
  || mirror.displayNameMatchesOfficialAccount !== true
  || !same(mirror.officialContentMarkersObserved, ['langrisser_mkt@zlongame.com', 'official recharge/payment wording', 'official event and update copy'])
  || mirror.officialWechatIdDisplayedInRetrievedProfile !== false || mirror.retrievedOfficialWechatId !== null
  || mirror.currentVisibleArchiveOldestObserved !== '2025-09-10'
  || mirror.retrieved2019Archive !== false || mirror.retrieved2019A7Article !== false
  || mirror.equivalentPrimaryAdmissionStatus !== 'NOT_ADMITTED_ACCOUNT_ID_AND_2019_ARTICLE_PROVENANCE_NOT_RECOVERED'
  || mirror.releasePromotionEligible !== false) fail('Stage 11-A15 mirror boundary drift');
try {
  const url = new URL(mirror.profileUrl);
  if (url.hostname !== 'freewechat.com') fail('Stage 11-A15 mirror host drift');
} catch { fail('Stage 11-A15 mirror URL invalid'); }

const outcome = evidence.searchOutcome ?? {};
if (outcome.searchedOfficialAccountDisplayNameWithA7Titles !== true
  || outcome.searchedOfficialAccountDisplayNameWithA7CandidateNames !== true
  || outcome.searchedMirrorProfileIdentifierWith2019Keywords !== true
  || outcome.recoveredA7PrimaryIdentityArticleCount !== 0
  || outcome.recoveredA7CandidateIdentityCount !== 0
  || outcome.negativeSearchMayProveArticleNeverExisted !== false) fail('Stage 11-A15 search outcome drift');

const augustIds = [1112, 1031, 420, 244, 128, 333];
const septemberIds = [245, 129, 334, 511, 635, 813, 636];
const allIds = [...augustIds, ...septemberIds];
const boundary = evidence.a7CandidateBoundary ?? {};
if (boundary.candidateRecordCount !== 13 || !same(boundary.augustCandidateIds, augustIds)
  || !same(boundary.septemberCandidateIds, septemberIds) || boundary.primaryWechatIdentityRecoveredCount !== 0
  || boundary.promotedRecordCount !== 0 || boundary.allRemainUnresolved !== true) fail('Stage 11-A15 candidate boundary drift');
if (!same(sorted(a7.candidateRecords.map(record => record.soldierId)), sorted(allIds))) fail('Stage 11-A15 A7 candidate set drift');

const listIndex = indexById(list.records, 'Stage 5-8 list');
const metadataIndex = indexById(metadata.records, 'release metadata');
for (const soldierId of allIds) {
  const listRecord = listIndex.get(soldierId);
  const meta = metadataIndex.get(soldierId);
  if (!listRecord || listRecord.tier !== 3 || listRecord.isSp !== false || listRecord.sortBucket !== 'NORMAL_TIER3_UNRESOLVED'
    || listRecord.release?.releaseStatus !== 'UNRESOLVED' || listRecord.release?.releaseDate !== null || listRecord.release?.patchGroup !== null) {
    fail(`Stage 11-A15 candidate ${soldierId} is no longer unresolved normal tier-3`);
  }
  if (!meta || meta.releaseStatus !== 'UNRESOLVED' || meta.releaseDate !== null || meta.patchGroup !== null || meta.sourceKind !== null || meta.mappingStatus !== null) {
    fail(`Stage 11-A15 candidate ${soldierId} release metadata was promoted or drifted`);
  }
}

for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A15 boundary ${key} must remain false`);
if (!Array.isArray(evidence.blockers) || evidence.blockers.length !== 0) fail('Stage 11-A15 must have zero blockers');
if (!Array.isArray(evidence.reviews) || evidence.reviews.length !== 0) fail('Stage 11-A15 adds no review entry');
if (evidence.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail('Stage 11-A15 next owner drift');
if (!Array.isArray(evidence.nextStartPoint) || evidence.nextStartPoint.length < 4) fail('Stage 11-A15 next start point missing');
if (!Array.isArray(evidence.reopenConditions) || evidence.reopenConditions.length < 3) fail('Stage 11-A15 reopen conditions missing');

if (errors.length) {
  console.error(`Soldier Stage 11-A15 official WeChat mirror boundary: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A15 official WeChat mirror boundary: PASS');
console.log('officialWechat=mhmnzsy verified / mirrorPrimaryAdmission=false / recovered2019A7Articles=0');
console.log('A7Candidates=13 / promotedRecords=0 / normalTier3Unresolved=78');
