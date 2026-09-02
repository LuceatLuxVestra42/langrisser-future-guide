import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  checkpoint: 'data/validation/soldier-release-metadata-stage11-a3-site-admission-refresh.v1.json',
  stage11A2: 'data/validation/soldier-release-metadata-stage11-a2-promotion.v1.json',
  stage6_0: 'data/validation/soldier-stage6-0-checkpoint.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  stage5_8: 'data/validation/soldier-stage5-8-release.v1.json',
  stage6_1: 'data/generated/soldier-stage6-1-full-records.v1.json',
  stage6_1Validation: 'data/validation/soldier-stage6-1-full-records.v1.json',
  stage6_2: 'data/generated/soldier-stage6-2-classification.v1.json',
  stage6_2Validation: 'data/validation/soldier-stage6-2-classification.v1.json',
  stage6_3: 'data/validation/soldier-stage6-3-representative-qa.v1.json',
  stage6_4: 'data/validation/soldier-stage6-4-filter-qa.v1.json',
  stage6_5: 'data/validation/soldier-stage6-5-reciprocal-links.v1.json',
  stage6_6: 'data/validation/soldier-stage6-6-expansion-basis.v1.json',
  stage6_7Output: 'data/generated/soldier-stage6-7-site-admission.v1.json',
  stage6_7Validation: 'data/validation/soldier-stage6-7-site-admission.v1.json',
};
const load = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const fail = message => errors.push(message);
const findReview = (reviews, code) => (reviews ?? []).find(review => review?.code === code);

const checkpoint = load(paths.checkpoint);
const a2 = load(paths.stage11A2);
const s60 = load(paths.stage6_0);
const release = load(paths.releaseMetadata);
const s58 = load(paths.stage5_8);
const s61 = load(paths.stage6_1);
const s61v = load(paths.stage6_1Validation);
const s62 = load(paths.stage6_2);
const s62v = load(paths.stage6_2Validation);
const s63 = load(paths.stage6_3);
const s64 = load(paths.stage6_4);
const s65 = load(paths.stage6_5);
const s66 = load(paths.stage6_6);
const s67 = load(paths.stage6_7Output);
const s67v = load(paths.stage6_7Validation);

if (checkpoint.schemaId !== 'soldier-release-metadata-stage11-a3-site-admission-refresh/v1'
  || checkpoint.stage !== '11-A3'
  || checkpoint.status !== 'PASS'
  || checkpoint.completion !== 'STAGE6_DOWNSTREAM_RELEASE_REFRESH_COMPLETE'
  || checkpoint.owner !== 'soldier-site-admission-refresh') fail('Stage 11-A3 checkpoint identity/status drift');
if (a2.status !== 'PASS' || a2.completion !== 'RELEASE_METADATA_PROMOTION_COMPLETE') fail('Stage 11-A2 predecessor must be complete PASS');

const expected = checkpoint.expected ?? {};
if (expected.canonicalSoldiers !== 224 || expected.normalSoldiers !== 168 || expected.spSoldiers !== 56
  || expected.heroSoldierRelations !== 5977 || expected.confirmedReleaseRecords !== 51
  || expected.unresolvedReleaseRecords !== 173 || expected.normalTier3Unresolved !== 78
  || expected.spReleaseReview !== 56 || expected.lowerTierReleaseBoundary !== 39
  || expected.samePatchOrder !== 'UNRESOLVED') fail('Stage 11-A3 expected coverage contract drift');

if (s60.status !== 'PASS') fail('Stage 6-0 checkpoint must remain PASS');
const ec = s60.expectedCoverage ?? {};
if (ec.canonicalSoldiers !== 224 || ec.normalSoldiers !== 168 || ec.spSoldiers !== 56
  || ec.heroSoldierRelationEdges !== 5977 || ec.confirmedReleaseCount !== 51
  || ec.unresolvedReleaseCount !== 173 || ec.unresolvedNormalTier3ReleaseCount !== 78
  || ec.lowerTierReleaseBucketCount !== 39) fail(`Stage 6-0 refreshed expected coverage mismatch: ${JSON.stringify(ec)}`);
if (findReview(s60.knownReviews, 'RELEASE_DATE_UNRESOLVED')?.count !== 173) fail('Stage 6-0 release review count must be 173');
if (findReview(s60.knownReviews, 'SP_INTERNAL_RELEASE_ORDER_UNRESOLVED')?.count !== 56) fail('Stage 6-0 SP review count must remain 56');
if (findReview(s60.knownReviews, 'LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED')?.count !== 39) fail('Stage 6-0 lower-tier boundary count must remain 39');

if (release.status !== 'PASS' || release.summary?.canonicalSoldiers !== 224
  || release.summary?.confirmedReleaseRecords !== 51 || release.summary?.unresolvedReleaseRecords !== 173
  || release.summary?.normalTier3Unresolved !== 78 || release.summary?.spSoldiers !== 56 || release.summary?.lowerTierNormal !== 39) {
  fail('promoted Stage 5-8 release metadata coverage drift');
}
if (s58.status !== 'PASS' || s58.coverage?.canonicalSoldiers !== 224
  || s58.coverage?.confirmedReleaseCount !== 51 || s58.coverage?.unresolvedReleaseCount !== 173
  || s58.coverage?.unresolvedNormalTier3Count !== 78 || s58.coverage?.spCount !== 56 || s58.coverage?.lowerTierCount !== 39) {
  fail('promoted Stage 5-8 validation coverage drift');
}

for (const [name, artifact] of [
  ['stage6_1', s61], ['stage6_1Validation', s61v], ['stage6_2', s62], ['stage6_2Validation', s62v],
  ['stage6_3', s63], ['stage6_4', s64], ['stage6_5', s65], ['stage6_6', s66],
  ['stage6_7Output', s67], ['stage6_7Validation', s67v],
]) {
  if (artifact.status !== 'PASS') fail(`${name} must be PASS, got ${artifact.status}`);
}
if (s62.classificationStatus !== 'PASS_WITH_REVIEW' || s67.admissionStatus !== 'READY_WITH_REVIEW' || s67v.admissionStatus !== 'READY_WITH_REVIEW') {
  fail('Stage 6 classification/admission lifecycle drift');
}

const s61Records = Array.isArray(s61.records) ? s61.records : [];
if (s61Records.length !== 224) fail(`Stage 6-1 record count must remain 224, got ${s61Records.length}`);
const confirmedInFull = s61Records.filter(record => record?.release?.releaseStatus === 'CONFIRMED').length;
const unresolvedInFull = s61Records.filter(record => record?.release?.releaseStatus === 'UNRESOLVED').length;
if (confirmedInFull !== 51 || unresolvedInFull !== 173) fail(`Stage 6-1 release projection must be 51/173, got ${confirmedInFull}/${unresolvedInFull}`);
if (s61v.coverage?.canonicalSoldiers !== 224 || s61v.coverage?.generatedRecords !== 224
  || s61v.coverage?.normalCount !== 168 || s61v.coverage?.spCount !== 56 || s61v.coverage?.normalTier3Count !== 129) {
  fail('Stage 6-1 canonical coverage changed during release-only refresh');
}
if (Object.values(s61v.checks ?? {}).some(value => typeof value === 'number' && value !== 0)) fail('Stage 6-1 validation has non-zero checks');

const releaseReason = s62v.coverage?.reviewReasonCounts?.RELEASE_DATE_UNRESOLVED;
if (releaseReason !== 173) fail(`Stage 6-2 RELEASE_DATE_UNRESOLVED must be 173, got ${releaseReason}`);
if (s62v.coverage?.reviewReasonCounts?.SP_INTERNAL_RELEASE_ORDER_UNRESOLVED !== 56) fail('Stage 6-2 SP review must remain 56');
if (s62v.coverage?.reviewReasonCounts?.LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED !== 39) fail('Stage 6-2 lower-tier boundary must remain 39');
if (s62v.coverage?.canonicalSoldiers !== 224 || s62v.coverage?.failRecords !== 0) fail('Stage 6-2 canonical/fail coverage drift');
if (findReview(s62v.reviews, 'RELEASE_DATE_UNRESOLVED')?.count !== 173) fail('Stage 6-2 review summary must project 173 unresolved release records');
if (s62v.checks?.baselineMismatches !== 0) fail('Stage 6-2 refreshed baseline must have zero mismatch');

if (s63.checks?.failedFixtures !== 0 || s63.coverage?.passedFixtures !== s63.coverage?.fixtureCategories) fail('Stage 6-3 representative QA failed');
if (s64.coverage?.failedTests !== 0 || s64.coverage?.passedTests !== s64.coverage?.testCount) fail('Stage 6-4 filter QA failed');
if (s65.coverage?.canonicalRelationCount !== 5977 || s65.checks?.reciprocalPagePairMismatch !== 0) fail('Stage 6-5 Hero-Soldier relation parity changed');
if (s66.coverage?.canonicalSoldiers !== 224 || s66.coverage?.relationEdges !== 5977) fail('Stage 6-6 expansion foundation canonical/relation coverage changed');

const s67summary = s67.summary ?? {};
if (s67summary.canonicalSoldiers !== 224 || s67summary.normalSoldiers !== 168 || s67summary.spSoldiers !== 56
  || s67summary.heroSoldierRelations !== 5977) fail('Stage 6-7 canonical/relation summary changed during release-only refresh');
if (findReview(s67.reviews, 'RELEASE_DATE_UNRESOLVED')?.count !== 173
  || findReview(s67v.reviews, 'RELEASE_DATE_UNRESOLVED')?.count !== 173) fail('Stage 6-7 must project RELEASE_DATE_UNRESOLVED=173');
if (s67v.checks?.sourceSemanticDependencyFailures !== 0 || s67v.checks?.coverageMismatches !== 0
  || s67v.checks?.admissionGateFailures !== 0) fail('Stage 6-7 refreshed semantic freshness/admission gate must be clean');
if (s67.admissionGates?.sourceSnapshotsFrozen !== 'PASS' || s67.admissionGates?.listAndRelease !== 'PASS') fail('Stage 6-7 release/freshness gates must PASS');

for (const [key, value] of Object.entries(checkpoint.boundaries ?? {})) if (value !== false) fail(`forbidden Stage 11-A3 boundary changed: ${key}`);
if (checkpoint.nextOwner !== 'soldier-release-metadata-evidence-acquisition') fail(`unexpected nextOwner ${checkpoint.nextOwner}`);
if (!Array.isArray(checkpoint.blockers) || checkpoint.blockers.length !== 0) fail('Stage 11-A3 checkpoint must have zero blockers');

if (errors.length) {
  console.error(`Soldier Stage 11-A3 downstream refresh: FAIL (${errors.length})`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A3 downstream refresh: PASS');
console.log('releaseCoverage=51 confirmed / 173 unresolved / 78 normal tier-3 unresolved');
console.log('canonical=224 normal=168 sp=56 heroSoldierRelations=5977');
console.log('nextOwner=soldier-release-metadata-evidence-acquisition');
