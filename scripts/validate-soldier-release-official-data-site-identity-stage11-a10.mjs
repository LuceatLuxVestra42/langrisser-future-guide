import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-data-site-identity-stage11-a10.v1.json',
  a9: 'data/soldier-release-official-data-site-identity-stage11-a9.v1.json',
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
const a9 = readJson(paths.a9);
const a8 = readJson(paths.a8);
const metadata = readJson(paths.metadata);
const list = readJson(paths.list);

if (evidence.version !== 1
  || evidence.schemaId !== 'soldier-release-official-data-site-identity-stage11-a10/v1'
  || evidence.stage !== '11-A10'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'OFFICIAL_DATA_SITE_IDENTITY_BATCH_2_FROZEN_NO_CHRONOLOGY_PROMOTION'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'IDENTITY_INVENTORY_ONLY_NO_RELEASE_DATE_PROMOTION') {
  fail('Stage 11-A10 identity/status drift');
}
if (evidence.capturedAgainstMain !== 'a12b7c903fb1e1d7c86030e6cdd3685df3fa9a74') fail('Stage 11-A10 captured main drift');
if (evidence.predecessors?.stage11A9IdentityBatch1 !== paths.a9
  || evidence.predecessors?.stage11A8ArchiveGap !== paths.a8
  || evidence.predecessors?.releaseMetadata !== paths.metadata
  || evidence.predecessors?.soldierList !== paths.list) {
  fail('Stage 11-A10 predecessor path contract drift');
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
  fail('Stage 11-A10 coverage boundary drift');
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
if (a9.stage !== '11-A9' || a9.status !== 'PASS'
  || a9.summary?.officialDataSiteRecordCount !== 6
  || a9.summary?.promotedRecordCount !== 0
  || a9.records?.length !== 6) {
  fail('Stage 11-A9 predecessor drift');
}
if (a8.stage !== '11-A8' || a8.status !== 'PASS'
  || a8.archiveScan?.promotedRecordCount !== 0
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
  || policy.allowNameSimilarity !== false
  || policy.allowIdArithmetic !== false
  || policy.allowFilenameOrPathChronologyInference !== false
  || policy.allowScreenOrArchiveOrderMapping !== false
  || policy.allowBatchCountToIdentityMapping !== false
  || policy.allowLaunchPopulationSubtraction !== false
  || policy.allowSamePatchOrderInference !== false) {
  fail('Stage 11-A10 policy boundary drift');
}

const listIndex = indexById(list.records, 'Stage 5-8 list');
const metadataIndex = indexById(metadata.records, 'release metadata');
const a9Index = indexById(a9.records, 'Stage 11-A9 evidence');
const evidenceIndex = indexById(evidence.records, 'Stage 11-A10 evidence');
const expectedRecords = new Map([
  [216, ['狂兽人', 'https://mz.zlongame.com/jx/soliderJianbing/20180529/4933.html', '2018-05-29']],
  [413, ['石像鬼', 'https://mz.zlongame.com/jx/soliderFeibing/20180529/4967.html', '2018-05-29']],
]);
if (evidenceIndex.size !== expectedRecords.size) fail(`Stage 11-A10 record count must be ${expectedRecords.size}, got ${evidenceIndex.size}`);
const urls = new Set();
for (const [soldierId, [nameCn, pageUrl, locatorDate]] of expectedRecords) {
  const record = evidenceIndex.get(soldierId);
  const listRecord = listIndex.get(soldierId);
  const meta = metadataIndex.get(soldierId);
  if (!record) { fail(`missing Stage 11-A10 record ${soldierId}`); continue; }
  if (a9Index.has(soldierId)) fail(`Stage 11-A10 record ${soldierId} duplicates Stage 11-A9 batch 1`);
  if (record.canonicalNameCn !== nameCn || record.officialPageHeading !== nameCn
    || record.officialPageUrl !== pageUrl || record.legacyUrlPathDate !== locatorDate
    || record.legacyUrlPathDateMeaning !== 'LOCATOR_ONLY_NOT_RELEASE_OR_PUBLICATION_DATE'
    || record.sourceAuthority !== 'OFFICIAL_CN_DATA_SITE'
    || record.identityMappingStatus !== 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION'
    || record.evidenceStatus !== 'OFFICIAL_DATA_SITE_EXACT_IDENTITY_PRESENT'
    || record.releaseDate !== null || record.patchGroup !== null || record.releasePromotionEligible !== false) {
    fail(`Stage 11-A10 record ${soldierId} evidence boundary drift`);
  }
  if (!officialUrl(record.officialPageUrl) || !isIsoDate(record.legacyUrlPathDate)) fail(`Stage 11-A10 record ${soldierId} invalid locator`);
  if (urls.has(record.officialPageUrl)) fail(`Stage 11-A10 duplicate official page URL ${record.officialPageUrl}`);
  urls.add(record.officialPageUrl);
  if (!listRecord || listRecord.nameCn !== nameCn || listRecord.tier !== 3 || listRecord.isSp !== false
    || listRecord.sortBucket !== 'NORMAL_TIER3_UNRESOLVED'
    || listRecord.release?.releaseStatus !== 'UNRESOLVED' || listRecord.release?.releaseDate !== null
    || listRecord.release?.patchGroup !== null) {
    fail(`Stage 11-A10 record ${soldierId} is no longer authoritative unresolved normal tier-3`);
  }
  if (!meta || meta.releaseStatus !== 'UNRESOLVED' || meta.releaseDate !== null || meta.patchGroup !== null
    || meta.sourceKind !== null || meta.mappingStatus !== null) {
    fail(`Stage 11-A10 record ${soldierId} release metadata was promoted or drifted`);
  }
}

const cumulativeIds = new Set([...a9Index.keys(), ...evidenceIndex.keys()]);
if (cumulativeIds.size !== 8) fail(`expected 8 cumulative official data-site IDs, got ${cumulativeIds.size}`);

const expectedExcluded = [
  { soldierId: 201, canonicalNameCn: '精锐步兵', officialPageUrl: 'https://mz.zlongame.com/jx/soliderJianbing/20180529/4926.html', reason: 'LOWER_TIER_NOT_IN_NORMAL_TIER3_RELEASE_ACQUISITION_SCOPE' },
  { soldierId: 1003, canonicalNameCn: '骷髅勇士', officialPageUrl: 'https://mz.zlongame.com/jx/soliderMowu/20180529/4941.html', reason: 'LOWER_TIER_NOT_IN_NORMAL_TIER3_RELEASE_ACQUISITION_SCOPE' },
];
if (!same(evidence.excludedLocatorExamples, expectedExcluded)) fail('Stage 11-A10 lower-tier exclusion boundary drift');
for (const excluded of evidence.excludedLocatorExamples ?? []) {
  const listRecord = listIndex.get(excluded.soldierId);
  if (!listRecord || listRecord.nameCn !== excluded.canonicalNameCn || listRecord.tier === 3
    || listRecord.sortBucket !== 'LOWER_TIER_TECHNICAL' || !officialUrl(excluded.officialPageUrl)) {
    fail(`Stage 11-A10 excluded locator ${excluded.soldierId} no longer lower-tier boundary`);
  }
}

if (!same(evidence.summary, {
  officialDataSiteRecordCount: 2,
  cumulativeOfficialDataSiteRecordCount: 8,
  normalTier3UnresolvedSupported: 2,
  exactCanonicalLabelMatches: 2,
  promotedRecordCount: 0,
  coverageChanged: false,
})) fail('Stage 11-A10 summary drift');
for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A10 boundary ${key} must remain false`);
if (!Array.isArray(evidence.blockers) || evidence.blockers.length !== 0) fail('Stage 11-A10 must have zero blockers');
if (!Array.isArray(evidence.reviews) || evidence.reviews.length !== 0) fail('Stage 11-A10 adds no review entry');
if (evidence.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail('Stage 11-A10 next owner drift');
if (!Array.isArray(evidence.nextStartPoint) || evidence.nextStartPoint.length < 4) fail('Stage 11-A10 next start point missing');
if (!Array.isArray(evidence.reopenConditions) || evidence.reopenConditions.length < 3) fail('Stage 11-A10 reopen conditions missing');

if (errors.length) {
  console.error(`Soldier Stage 11-A10 official data-site identity batch 2: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A10 official data-site identity batch 2: PASS');
console.log('officialDataSiteRecords=2 / cumulativeOfficialDataSiteRecords=8 / promotedRecords=0');
console.log('coverage=224 = 51 confirmed + 173 unresolved; normalTier3Unresolved=78');
console.log('legacy URL path dates remain locator-only and do not establish release chronology.');
