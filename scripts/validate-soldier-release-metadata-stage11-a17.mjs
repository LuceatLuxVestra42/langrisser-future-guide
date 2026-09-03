import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const paths = {
  evidence: 'data/soldier-release-official-notice-extension-stage11-a16.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  list: 'data/generated/soldier-list-stage5-8.v1.json',
  releaseValidation: 'data/validation/soldier-stage5-8-release.v1.json',
  promotionValidation: 'data/validation/soldier-release-metadata-stage11-a17-promotion.v1.json',
};

const evidence = readJson(paths.evidence);
const releaseMetadata = readJson(paths.releaseMetadata);
const list = readJson(paths.list);
const releaseValidation = readJson(paths.releaseValidation);
const promotion = readJson(paths.promotionValidation);

if (promotion.schemaId !== 'soldier-release-metadata-stage11-a17-promotion/v1'
  || promotion.stage !== '11-A17'
  || promotion.status !== 'PASS'
  || promotion.completion !== 'SOLDIER_RELEASE_METADATA_2022_10_PROMOTION_COMPLETE'
  || promotion.owner !== 'soldier-release-metadata-promotion') {
  fail('Stage 11-A17 promotion checkpoint identity/status drift');
}
if (evidence.schemaId !== 'soldier-release-official-notice-extension-stage11-a16/v1'
  || evidence.status !== 'PASS'
  || evidence.policy?.sourceAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE') {
  fail('Stage 11-A16 evidence predecessor drift');
}

const expected = new Map([
  [514, { nameCn: '海洋祭师', releaseDate: '2022-10-20' }],
  [816, { nameCn: '圣卫术师', releaseDate: '2022-10-20' }],
]);
const byMetadata = new Map(releaseMetadata.records.map(record => [record.soldierId, record]));
const byList = new Map(list.records.map(record => [record.soldierId, record]));
if (promotion.promotedRecords?.length !== 2) fail('A17 must freeze exactly two promoted records');

for (const [soldierId, target] of expected) {
  const metadata = byMetadata.get(soldierId);
  const listRecord = byList.get(soldierId);
  const promoted = promotion.promotedRecords.find(record => record.soldierId === soldierId);
  if (!metadata || !listRecord || !promoted) fail(`A17 target ${soldierId} missing from promotion outputs`);
  if (listRecord.nameCn !== target.nameCn || promoted.canonicalNameCn !== target.nameCn) fail(`A17 target ${soldierId} canonical label drift`);
  if (metadata.releaseStatus !== 'CONFIRMED' || metadata.releaseDate !== target.releaseDate || metadata.patchGroup !== target.releaseDate) fail(`A17 target ${soldierId} release metadata mismatch`);
  if (metadata.sourceKind !== 'OFFICIAL_CN_RELEASE_NOTICE' || metadata.sourceLabel !== target.nameCn) fail(`A17 target ${soldierId} provenance mismatch`);
  if (metadata.samePatchOrder !== null || listRecord.release?.samePatchOrder !== null || promoted.samePatchOrder !== null) fail(`A17 target ${soldierId} invents same-patch order`);
  if (listRecord.sortBucket !== 'NORMAL_TIER3_CONFIRMED_RELEASE') fail(`A17 target ${soldierId} sort bucket mismatch`);
  if (!same({ soldierId, ...listRecord.release }, metadata)) fail(`A17 target ${soldierId} release/list parity mismatch`);
}

const summary = releaseMetadata.summary ?? {};
if (summary.confirmedReleaseRecords !== 53
  || summary.unresolvedReleaseRecords !== 171
  || summary.normalTier3Confirmed !== 53
  || summary.normalTier3Unresolved !== 76
  || summary.spSoldiers !== 56
  || summary.lowerTierNormal !== 39) {
  fail(`A17 release metadata coverage drift: ${JSON.stringify(summary)}`);
}
if (list.summary?.recordCount !== 224
  || list.summary?.normalCount !== 168
  || list.summary?.spCount !== 56
  || list.summary?.normalTier3Count !== 129
  || list.summary?.confirmedReleaseCount !== 53
  || list.summary?.unresolvedNormalTier3Count !== 76) {
  fail('A17 Stage 5-8 list coverage drift');
}
if (releaseValidation.coverage?.confirmedReleaseCount !== 53
  || releaseValidation.coverage?.unresolvedReleaseCount !== 171
  || releaseValidation.coverage?.unresolvedNormalTier3Count !== 76
  || releaseValidation.coverage?.stage11A17PromotedCount !== 2) {
  fail('A17 Stage 5-8 validation coverage drift');
}
if (!same(promotion.coverageAfter, {
  canonicalSoldiers: 224,
  confirmedReleaseRecords: 53,
  unresolvedReleaseRecords: 171,
  normalTier3Confirmed: 53,
  normalTier3Unresolved: 76,
  sp: 56,
  lowerTier: 39,
})) fail('A17 promotion checkpoint coverage drift');

const group = list.sortBuckets?.normalTier3ConfirmedReleaseGroups?.find(item => item.releaseDate === '2022-10-20');
if (!group || !same(group.soldierIds, [514, 816]) || group.samePatchOrderStatus !== 'UNRESOLVED') fail('A17 exact 2022-10-20 patch group mismatch');
const unresolved = new Set(list.sortBuckets?.normalTier3UnresolvedSoldierIds ?? []);
if (unresolved.size !== 76 || unresolved.has(514) || unresolved.has(816)) fail('A17 unresolved normal tier-3 set mismatch');
if ((list.sortBuckets?.spSoldierIds ?? []).length !== 56 || (list.sortBuckets?.lowerTierSoldierIds ?? []).length !== 39) fail('A17 SP/lower-tier boundary drift');
if (releaseMetadata.records.filter(record => record.releaseStatus === 'CONFIRMED').some(record => record.samePatchOrder !== null)) fail('A17 confirmed records may not assert same-patch order');
if (releaseMetadata.records.filter(record => record.releaseStatus === 'CONFIRMED' && record.sourceKind === 'OFFICIAL_CN_RELEASE_NOTICE').length !== 53) fail('A17 final confirmed provenance must be official CN notice for all 53 records');
if (promotion.blockers?.length !== 0) fail('A17 promotion checkpoint has blockers');
if (promotion.nextOwner !== 'soldier-site-admission-refresh') fail('A17 must hand off to soldier-site-admission-refresh');

console.log('Soldier Stage 11-A17 promotion validation: PASS');
console.log('coverage=53 confirmed / 171 unresolved / 76 unresolved normal tier-3');
console.log('promoted=514,816 @ 2022-10-20');
console.log('samePatchOrder=UNRESOLVED');
