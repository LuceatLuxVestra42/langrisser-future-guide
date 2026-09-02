import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-data-site-identity-stage11-a9.v1.json',
  a7: 'data/soldier-release-pre2020-event-boundary-stage11-a7.v1.json',
  a8: 'data/soldier-release-official-archive-gap-stage11-a8.v1.json',
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
const a8 = readJson(paths.a8);
const metadata = readJson(paths.metadata);
const list = readJson(paths.list);

if (evidence.version !== 1
  || evidence.schemaId !== 'soldier-release-official-data-site-identity-stage11-a9/v1'
  || evidence.stage !== '11-A9'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'OFFICIAL_DATA_SITE_IDENTITY_BATCH_FROZEN_NO_CHRONOLOGY_PROMOTION'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'IDENTITY_INVENTORY_ONLY_NO_RELEASE_DATE_PROMOTION') {
  fail('Stage 11-A9 identity/status drift');
}
if (evidence.capturedAgainstMain !== '47383cfba81eb51eb9483311469f1567eac5f710') fail('Stage 11-A9 captured main drift');
if (evidence.predecessors?.stage11A7Boundary !== paths.a7
  || evidence.predecessors?.stage11A8ArchiveGap !== paths.a8
  || evidence.predecessors?.releaseMetadata !== paths.metadata
  || evidence.predecessors?.soldierList !== paths.list) {
  fail('Stage 11-A9 predecessor path contract drift');
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
  fail('Stage 11-A9 coverage boundary drift');
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
if (a8.stage !== '11-A8' || a8.status !== 'PASS' || a8.archiveScan?.promotedRecordCount !== 0
  || a8.archiveScan?.qualifyingOfficialEventCountFound !== 0) {
  fail('Stage 11-A8 predecessor drift');
}

const policy = evidence.policy ?? {};
if (policy.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || policy.sourceAuthority !== 'OFFICIAL_CN_DATA_SITE'
  || policy.identityEvidenceMeaning !== 'OFFICIAL_LEGACY_DATA_SITE_PAGE_EXPLICITLY_NAMES_CANONICAL_SOLDIER_IDENTITY'
  || policy.identityMappingRequirement !== 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION'
  || policy.releaseChronologyAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
  || policy.legacyUrlPathDateMeaning !== 'LOCATOR_ONLY_NOT_RELEASE_OR_PUBLICATION_DATE'
  || policy.dataSiteIdentityMayPromoteReleaseDate !== false
  || policy.launchContextMayPromoteReleaseDate !== false
  || policy.allowNameSimilarity !== false
  || policy.allowIdArithmetic !== false
  || policy.allowFilenameOrPathChronologyInference !== false
  || policy.allowScreenOrArchiveOrderMapping !== false
  || policy.allowBatchCountToIdentityMapping !== false
  || policy.allowLaunchPopulationSubtraction !== false
  || policy.allowSamePatchOrderInference !== false) {
  fail('Stage 11-A9 policy boundary drift');
}

const launchContext = Array.isArray(evidence.launchContext) ? evidence.launchContext : [];
const expectedLaunchContext = new Map([
  ['official-cn-ios-open-2018-08-02', ['2018-08-02', 'https://mz.zlongame.com/jx/mzgg/20180725/5441.html', 'OFFICIAL_SERVICE_OPENING_CONTEXT_ONLY']],
  ['official-cn-all-platform-open-2018-08-16', ['2018-08-16', 'https://mz.zlongame.com/jx/mzhd/20180816/5586.html', 'OFFICIAL_ALL_PLATFORM_PUBLIC_TEST_CONTEXT_ONLY']],
  ['official-cn-training-ground-guide-2018-08-13', ['2018-08-13', 'https://mz.zlongame.com/jx/mzgl/20180813/5557.html', 'OFFICIAL_TRAINING_GROUND_SYSTEM_CONTEXT_ONLY']],
]);
if (launchContext.length !== 3) fail(`expected 3 launch context records, got ${launchContext.length}`);
for (const context of launchContext) {
  const expected = expectedLaunchContext.get(context.contextId);
  if (!expected) { fail(`unexpected launch context ${context.contextId}`); continue; }
  const [contextDate, url, meaning] = expected;
  if (context.contextDate !== contextDate || context.url !== url || context.meaning !== meaning
    || !isIsoDate(context.contextDate) || !officialUrl(context.url)
    || context.mapsInventoryRecordsToReleaseDate !== false
    || context.mapsInventoryRecordsToLaunchPopulation !== false) {
    fail(`launch context ${context.contextId} drift`);
  }
}

const listIndex = indexById(list.records, 'Stage 5-8 list');
const metadataIndex = indexById(metadata.records, 'release metadata');
const evidenceIndex = indexById(evidence.records, 'Stage 11-A9 evidence');
const expectedRecords = new Map([
  [112, ['熔岩巨人', 'https://mz.zlongame.com/jx/soliderQiangbing/20180603/5034.html', '2018-06-03']],
  [225, ['暗黑卫队', 'https://mz.zlongame.com/jx/soliderJianbing/20180529/4927.html', '2018-05-29']],
  [237, ['假面女仆', 'https://mz.zlongame.com/jx/soliderJianbing/20180529/4936.html', '2018-05-29']],
  [419, ['圣天马', 'https://mz.zlongame.com/jx/soliderFeibing/20180529/4964.html', '2018-05-29']],
  [805, ['神官骑士', 'https://mz.zlongame.com/jx/soliderSengb/20180529/4949.html', '2018-05-29']],
  [1006, ['重装骷髅', 'https://mz.zlongame.com/jx/soliderMowu/20180529/4945.html', '2018-05-29']],
]);
if (evidenceIndex.size !== expectedRecords.size) fail(`Stage 11-A9 record count must be ${expectedRecords.size}, got ${evidenceIndex.size}`);
const urls = new Set();
for (const [soldierId, [nameCn, pageUrl, locatorDate]] of expectedRecords) {
  const record = evidenceIndex.get(soldierId);
  const listRecord = listIndex.get(soldierId);
  const meta = metadataIndex.get(soldierId);
  if (!record) { fail(`missing Stage 11-A9 record ${soldierId}`); continue; }
  if (record.canonicalNameCn !== nameCn || record.officialPageHeading !== nameCn
    || record.officialPageUrl !== pageUrl || record.legacyUrlPathDate !== locatorDate
    || record.legacyUrlPathDateMeaning !== 'LOCATOR_ONLY_NOT_RELEASE_OR_PUBLICATION_DATE'
    || record.sourceAuthority !== 'OFFICIAL_CN_DATA_SITE'
    || record.identityMappingStatus !== 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION'
    || record.evidenceStatus !== 'OFFICIAL_DATA_SITE_EXACT_IDENTITY_PRESENT'
    || record.releaseDate !== null || record.patchGroup !== null || record.releasePromotionEligible !== false) {
    fail(`Stage 11-A9 record ${soldierId} evidence boundary drift`);
  }
  if (!officialUrl(record.officialPageUrl) || !isIsoDate(record.legacyUrlPathDate)) fail(`Stage 11-A9 record ${soldierId} invalid locator`);
  if (urls.has(record.officialPageUrl)) fail(`Stage 11-A9 duplicate official page URL ${record.officialPageUrl}`);
  urls.add(record.officialPageUrl);
  if (!listRecord || listRecord.nameCn !== nameCn || listRecord.tier !== 3 || listRecord.isSp !== false
    || listRecord.sortBucket !== 'NORMAL_TIER3_UNRESOLVED'
    || listRecord.release?.releaseStatus !== 'UNRESOLVED' || listRecord.release?.releaseDate !== null
    || listRecord.release?.patchGroup !== null) {
    fail(`Stage 11-A9 record ${soldierId} is no longer authoritative unresolved normal tier-3`);
  }
  if (!meta || meta.releaseStatus !== 'UNRESOLVED' || meta.releaseDate !== null || meta.patchGroup !== null
    || meta.sourceKind !== null || meta.mappingStatus !== null) {
    fail(`Stage 11-A9 record ${soldierId} release metadata was promoted or drifted`);
  }
}

if (!same(evidence.excludedLocatorExamples, [
  { soldierId: 1003, canonicalNameCn: '骷髅勇士', reason: 'LOWER_TIER_NOT_IN_NORMAL_TIER3_RELEASE_ACQUISITION_SCOPE' },
  { soldierId: 1108, canonicalNameCn: '女忍', reason: 'LOWER_TIER_NOT_IN_NORMAL_TIER3_RELEASE_ACQUISITION_SCOPE' },
])) fail('Stage 11-A9 lower-tier exclusion boundary drift');
for (const excluded of evidence.excludedLocatorExamples ?? []) {
  const listRecord = listIndex.get(excluded.soldierId);
  if (!listRecord || listRecord.nameCn !== excluded.canonicalNameCn || listRecord.tier === 3
    || listRecord.sortBucket !== 'LOWER_TIER_TECHNICAL') {
    fail(`Stage 11-A9 excluded locator ${excluded.soldierId} no longer lower-tier boundary`);
  }
}

if (!same(evidence.summary, {
  officialDataSiteRecordCount: 6,
  normalTier3UnresolvedSupported: 6,
  exactCanonicalLabelMatches: 6,
  promotedRecordCount: 0,
  coverageChanged: false,
})) fail('Stage 11-A9 summary drift');
for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A9 boundary ${key} must remain false`);
if (!Array.isArray(evidence.blockers) || evidence.blockers.length !== 0) fail('Stage 11-A9 must have zero blockers');
if (!Array.isArray(evidence.reviews) || evidence.reviews.length !== 0) fail('Stage 11-A9 adds no review entry');
if (evidence.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail('Stage 11-A9 next owner drift');
if (!Array.isArray(evidence.nextStartPoint) || evidence.nextStartPoint.length < 4) fail('Stage 11-A9 next start point missing');
if (!Array.isArray(evidence.reopenConditions) || evidence.reopenConditions.length < 3) fail('Stage 11-A9 reopen conditions missing');

if (errors.length) {
  console.error(`Soldier Stage 11-A9 official data-site identity batch: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A9 official data-site identity batch: PASS');
console.log('officialDataSiteRecords=6 / exactCanonicalLabels=6 / promotedRecords=0');
console.log('coverage=224 = 51 confirmed + 173 unresolved; normalTier3Unresolved=78');
console.log('legacy URL path dates remain locator-only and do not establish release chronology.');
