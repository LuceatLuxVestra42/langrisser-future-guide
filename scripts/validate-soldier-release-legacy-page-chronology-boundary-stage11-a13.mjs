import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-legacy-page-chronology-boundary-stage11-a13.v1.json',
  a9: 'data/soldier-release-official-data-site-identity-stage11-a9.v1.json',
  a10: 'data/soldier-release-official-data-site-identity-stage11-a10.v1.json',
  metadata: 'data/generated/soldier-release-metadata.v1.json',
  list: 'data/generated/soldier-list-stage5-8.v1.json',
};
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const fail = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const officialLegacyUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'mz.zlongame.com' && url.pathname.includes('/jx/solider');
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
const a10 = readJson(paths.a10);
const metadata = readJson(paths.metadata);
const list = readJson(paths.list);

if (evidence.version !== 1
  || evidence.schemaId !== 'soldier-release-legacy-page-chronology-boundary-stage11-a13/v1'
  || evidence.stage !== '11-A13'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'LEGACY_PAGE_DISPLAYED_TEXT_CHRONOLOGY_BOUNDARY_FROZEN'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'LEGACY_OFFICIAL_PAGE_DISPLAYED_TEXT_INSPECTION_NO_RELEASE_PROMOTION') {
  fail('Stage 11-A13 identity/status drift');
}
if (evidence.capturedAgainstMain !== '4ed4e25fcf3fa72baad87b7c47faa2ffb992ede8') fail('Stage 11-A13 captured main drift');
if (evidence.predecessors?.stage11A9LegacyIdentityBatch1 !== paths.a9
  || evidence.predecessors?.stage11A10LegacyIdentityBatch2 !== paths.a10
  || evidence.predecessors?.releaseMetadata !== paths.metadata
  || evidence.predecessors?.soldierList !== paths.list) {
  fail('Stage 11-A13 predecessor path contract drift');
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
if (!same(evidence.coverageBefore, expectedCoverage) || !same(evidence.coverageAfter, expectedCoverage)) fail('Stage 11-A13 coverage drift');
if (list.status !== 'PASS'
  || list.summary?.recordCount !== 224
  || list.summary?.confirmedReleaseCount !== 51
  || list.summary?.unresolvedNormalTier3Count !== 78
  || list.summary?.spCount !== 56
  || list.summary?.lowerTierCount !== 39) fail('authoritative Stage 5-8 list coverage drift');
if (metadata.status !== 'PASS'
  || metadata.summary?.canonicalSoldiers !== 224
  || metadata.summary?.confirmedReleaseRecords !== 51
  || metadata.summary?.unresolvedReleaseRecords !== 173
  || metadata.summary?.normalTier3Confirmed !== 51
  || metadata.summary?.normalTier3Unresolved !== 78
  || metadata.summary?.spSoldiers !== 56
  || metadata.summary?.lowerTierNormal !== 39) fail('authoritative release metadata coverage drift');
if (a9.stage !== '11-A9' || a9.status !== 'PASS' || a9.records?.length !== 6 || a9.summary?.promotedRecordCount !== 0) fail('Stage 11-A9 predecessor drift');
if (a10.stage !== '11-A10' || a10.status !== 'PASS' || a10.records?.length !== 2 || a10.summary?.promotedRecordCount !== 0) fail('Stage 11-A10 predecessor drift');

const policy = evidence.policy ?? {};
if (policy.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || policy.releaseChronologyAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
  || policy.inspectionScope !== 'RETRIEVED_OR_INDEXED_VISIBLE_PAGE_TEXT_ONLY'
  || policy.htmlMetaTagAuditPerformed !== false
  || policy.httpHeaderAuditPerformed !== false
  || policy.cmsDatabaseAuditPerformed !== false
  || policy.legacyUrlPathDateMeaning !== 'LOCATOR_ONLY_NOT_RELEASE_OR_PUBLICATION_DATE'
  || policy.visiblePageTextMayPromoteLegacyUrlPathDate !== false
  || policy.absenceOfDisplayedDateMayProvePageCreationDate !== false
  || policy.allowNameSimilarity !== false
  || policy.allowIdArithmetic !== false
  || policy.allowFilenameOrPathChronologyInference !== false
  || policy.allowArchiveOrderInference !== false
  || policy.allowLaunchPopulationInference !== false
  || policy.allowSamePatchOrderInference !== false) fail('Stage 11-A13 policy drift');

const a9Index = indexById(a9.records, 'A9');
const a10Index = indexById(a10.records, 'A10');
const evidenceIndex = indexById(evidence.records, 'A13');
const predecessorIndex = new Map([...a9Index, ...a10Index]);
if (predecessorIndex.size !== 8) fail(`A9+A10 expected 8 distinct records, got ${predecessorIndex.size}`);
if (evidenceIndex.size !== 8) fail(`A13 expected 8 records, got ${evidenceIndex.size}`);

for (const [soldierId, record] of evidenceIndex) {
  const predecessor = predecessorIndex.get(soldierId);
  if (!predecessor) { fail(`A13 record ${soldierId} absent from A9/A10`); continue; }
  if (record.canonicalNameCn !== predecessor.canonicalNameCn
    || record.url !== predecessor.officialPageUrl
    || !officialLegacyUrl(record.url)
    || record.visibleHeadingExactMatch !== true
    || !['DIRECT_PAGE_CONTENT', 'SEARCH_INDEXED_PAGE_CONTENT_AFTER_DIRECT_CACHE_MISS'].includes(record.retrievalMode)
    || record.displayedPublishDatePresent !== false
    || record.displayedReleaseDatePresent !== false
    || record.displayedReleaseEventWordingPresent !== false
    || record.pathDate !== predecessor.legacyUrlPathDate
    || record.pathDateMeaning !== 'LOCATOR_ONLY_NOT_RELEASE_OR_PUBLICATION_DATE'
    || record.releasePromotionEligible !== false) {
    fail(`A13 record ${soldierId} chronology boundary drift`);
  }
  const listRecord = (list.records ?? []).find(item => item.soldierId === soldierId);
  const meta = (metadata.records ?? []).find(item => item.soldierId === soldierId);
  if (!listRecord || listRecord.nameCn !== record.canonicalNameCn || listRecord.tier !== 3 || listRecord.isSp !== false
    || listRecord.sortBucket !== 'NORMAL_TIER3_UNRESOLVED'
    || listRecord.release?.releaseStatus !== 'UNRESOLVED' || listRecord.release?.releaseDate !== null || listRecord.release?.patchGroup !== null) {
    fail(`A13 record ${soldierId} no longer unresolved normal tier-3`);
  }
  if (!meta || meta.releaseStatus !== 'UNRESOLVED' || meta.releaseDate !== null || meta.patchGroup !== null || meta.sourceKind !== null) {
    fail(`A13 record ${soldierId} release metadata promotion/drift`);
  }
}

if (!same(evidence.summary, {
  inspectedLegacyOfficialPages: 8,
  exactVisibleHeadingMatches: 8,
  displayedPublishDateCount: 0,
  displayedReleaseDateCount: 0,
  displayedReleaseEventWordingCount: 0,
  promotedRecordCount: 0,
  coverageChanged: false,
  conclusion: 'VISIBLE_PAGE_TEXT_DOES_NOT_SUPPORT_PROMOTING_LEGACY_URL_PATH_DATES_TO_RELEASE_CHRONOLOGY',
})) fail('Stage 11-A13 summary drift');
for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A13 boundary ${key} must remain false`);
if (!Array.isArray(evidence.blockers) || evidence.blockers.length !== 0) fail('Stage 11-A13 must have zero blockers');
if (!Array.isArray(evidence.reviews) || evidence.reviews.length !== 0) fail('Stage 11-A13 adds no review entry');
if (evidence.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail('Stage 11-A13 next owner drift');
if (!Array.isArray(evidence.nextStartPoint) || evidence.nextStartPoint.length < 4) fail('Stage 11-A13 next start point missing');
if (!Array.isArray(evidence.reopenConditions) || evidence.reopenConditions.length < 3) fail('Stage 11-A13 reopen conditions missing');

if (errors.length) {
  console.error(`Soldier Stage 11-A13 legacy page chronology boundary: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A13 legacy page chronology boundary: PASS');
console.log('legacyPages=8 / displayedPublishDates=0 / displayedReleaseDates=0 / promotedRecords=0');
console.log('coverage=224 = 51 confirmed + 173 unresolved; normalTier3Unresolved=78');
console.log('legacy URL path dates remain locator-only based on visible/indexed page text inspection.');
