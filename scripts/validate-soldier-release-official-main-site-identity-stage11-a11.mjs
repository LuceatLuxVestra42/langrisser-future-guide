import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-main-site-identity-stage11-a11.v1.json',
  a9: 'data/soldier-release-official-data-site-identity-stage11-a9.v1.json',
  a10: 'data/soldier-release-official-data-site-identity-stage11-a10.v1.json',
  metadata: 'data/generated/soldier-release-metadata.v1.json',
  list: 'data/generated/soldier-list-stage5-8.v1.json',
};
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const fail = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const officialMainUrl = value => value === 'https://mz.zlongame.com/main.shtml';
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
  || evidence.schemaId !== 'soldier-release-official-main-site-identity-stage11-a11/v1'
  || evidence.stage !== '11-A11'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'OFFICIAL_MAIN_SITE_SOLDIER_IDENTITY_BATCH_FROZEN_NO_CHRONOLOGY_PROMOTION'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'IDENTITY_INVENTORY_ONLY_NO_RELEASE_DATE_PROMOTION') {
  fail('Stage 11-A11 identity/status drift');
}
if (evidence.capturedAgainstMain !== '0f4c55dec91d0d034ff0c230249fc4541a320c71') fail('Stage 11-A11 captured main drift');
if (evidence.predecessors?.stage11A9LegacyIdentityBatch1 !== paths.a9
  || evidence.predecessors?.stage11A10LegacyIdentityBatch2 !== paths.a10
  || evidence.predecessors?.releaseMetadata !== paths.metadata
  || evidence.predecessors?.soldierList !== paths.list) {
  fail('Stage 11-A11 predecessor path contract drift');
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
  fail('Stage 11-A11 coverage boundary drift');
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
if (a9.stage !== '11-A9' || a9.status !== 'PASS' || a9.records?.length !== 6 || a9.summary?.promotedRecordCount !== 0) {
  fail('Stage 11-A9 predecessor drift');
}
if (a10.stage !== '11-A10' || a10.status !== 'PASS' || a10.records?.length !== 2
  || a10.summary?.cumulativeOfficialDataSiteRecordCount !== 8 || a10.summary?.promotedRecordCount !== 0) {
  fail('Stage 11-A10 predecessor drift');
}

const source = evidence.source ?? {};
if (source.authority !== 'OFFICIAL_CN_MAIN_SITE_SOLDIER_CARD'
  || !officialMainUrl(source.url)
  || source.section !== '作战资料 / 兵种'
  || source.observedAt !== '2026-09-02'
  || source.meaning !== 'CURRENT_OFFICIAL_MAIN_SITE_SOLDIER_CARD_EXPLICITLY_NAMES_IDENTITY_ONLY') {
  fail('Stage 11-A11 source contract drift');
}
const policy = evidence.policy ?? {};
if (policy.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || policy.identityEvidenceMeaning !== 'OFFICIAL_MAIN_SITE_SOLDIER_CARD_EXPLICITLY_NAMES_CANONICAL_SOLDIER_IDENTITY'
  || policy.identityMappingRequirement !== 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION'
  || policy.releaseChronologyAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
  || policy.mainSiteCardMayPromoteReleaseDate !== false
  || policy.mainSiteCardMayDefineLaunchPopulation !== false
  || policy.allowNameSimilarity !== false
  || policy.allowIdArithmetic !== false
  || policy.allowScreenOrCardOrderMapping !== false
  || policy.allowCurrentPresenceToInferReleaseDate !== false
  || policy.allowBatchCountToIdentityMapping !== false
  || policy.allowLaunchPopulationSubtraction !== false
  || policy.allowSamePatchOrderInference !== false) {
  fail('Stage 11-A11 policy boundary drift');
}

const listIndex = indexById(list.records, 'Stage 5-8 list');
const metadataIndex = indexById(metadata.records, 'release metadata');
const a9Index = indexById(a9.records, 'Stage 11-A9 evidence');
const a10Index = indexById(a10.records, 'Stage 11-A10 evidence');
const evidenceIndex = indexById(evidence.records, 'Stage 11-A11 evidence');
const legacyIds = new Set([...a9Index.keys(), ...a10Index.keys()]);
if (legacyIds.size !== 8) fail(`expected 8 distinct A9-A10 legacy data-site IDs, got ${legacyIds.size}`);

const expectedRecords = new Map([
  [311, '骨犀'],
  [314, '地狱犬'],
  [317, '近卫骑兵'],
  [320, '皇家骑兵'],
  [326, '圣殿骑士'],
]);
if (evidenceIndex.size !== expectedRecords.size) fail(`Stage 11-A11 record count must be ${expectedRecords.size}, got ${evidenceIndex.size}`);
for (const [soldierId, nameCn] of expectedRecords) {
  const record = evidenceIndex.get(soldierId);
  const listRecord = listIndex.get(soldierId);
  const meta = metadataIndex.get(soldierId);
  if (!record) { fail(`missing Stage 11-A11 record ${soldierId}`); continue; }
  if (legacyIds.has(soldierId)) fail(`Stage 11-A11 record ${soldierId} duplicates A9-A10 legacy data-site evidence`);
  if (record.canonicalNameCn !== nameCn || record.officialCardLabel !== nameCn
    || record.sourceAuthority !== 'OFFICIAL_CN_MAIN_SITE_SOLDIER_CARD'
    || !officialMainUrl(record.sourceUrl)
    || record.evidenceStatus !== 'OFFICIAL_MAIN_SITE_SOLDIER_CARD_EXACT_IDENTITY_PRESENT'
    || record.identityMappingStatus !== 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION'
    || record.releaseDate !== null || record.patchGroup !== null || record.releasePromotionEligible !== false) {
    fail(`Stage 11-A11 record ${soldierId} evidence boundary drift`);
  }
  if (!listRecord || listRecord.nameCn !== nameCn || listRecord.tier !== 3 || listRecord.isSp !== false
    || listRecord.sortBucket !== 'NORMAL_TIER3_UNRESOLVED'
    || listRecord.release?.releaseStatus !== 'UNRESOLVED' || listRecord.release?.releaseDate !== null
    || listRecord.release?.patchGroup !== null) {
    fail(`Stage 11-A11 record ${soldierId} is no longer authoritative unresolved normal tier-3`);
  }
  if (!meta || meta.releaseStatus !== 'UNRESOLVED' || meta.releaseDate !== null || meta.patchGroup !== null
    || meta.sourceKind !== null || meta.mappingStatus !== null) {
    fail(`Stage 11-A11 record ${soldierId} release metadata was promoted or drifted`);
  }
}

const allIdentityIds = new Set([...legacyIds, ...evidenceIndex.keys()]);
if (allIdentityIds.size !== 13) fail(`expected 13 distinct A9-A11 official identity-evidence IDs, got ${allIdentityIds.size}`);
if (!same(evidence.summary, {
  officialMainSiteRecordCount: 5,
  legacyDataSitePredecessorRecordCount: 8,
  distinctOfficialIdentityEvidenceRecordCount: 13,
  normalTier3UnresolvedSupported: 5,
  exactCanonicalLabelMatches: 5,
  promotedRecordCount: 0,
  coverageChanged: false,
})) fail('Stage 11-A11 summary drift');
for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A11 boundary ${key} must remain false`);
if (!Array.isArray(evidence.blockers) || evidence.blockers.length !== 0) fail('Stage 11-A11 must have zero blockers');
if (!Array.isArray(evidence.reviews) || evidence.reviews.length !== 0) fail('Stage 11-A11 adds no review entry');
if (evidence.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail('Stage 11-A11 next owner drift');
if (!Array.isArray(evidence.nextStartPoint) || evidence.nextStartPoint.length < 4) fail('Stage 11-A11 next start point missing');
if (!Array.isArray(evidence.reopenConditions) || evidence.reopenConditions.length < 3) fail('Stage 11-A11 reopen conditions missing');

if (errors.length) {
  console.error(`Soldier Stage 11-A11 official main-site identity batch: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A11 official main-site identity batch: PASS');
console.log('officialMainSiteRecords=5 / distinctA9-A11OfficialIdentityEvidenceRecords=13 / promotedRecords=0');
console.log('coverage=224 = 51 confirmed + 173 unresolved; normalTier3Unresolved=78');
console.log('current official main-site Soldier-card presence remains identity evidence only.');
