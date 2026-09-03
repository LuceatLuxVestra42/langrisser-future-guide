import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const rel = p => path.join(root, p);
const readJson = p => JSON.parse(fs.readFileSync(rel(p), 'utf8'));
const writeJson = (p, value) => fs.writeFileSync(rel(p), `${JSON.stringify(value, null, 2)}\n`);
const fail = message => { throw new Error(message); };
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const gitBlobSha = p => git('rev-parse', `HEAD:${p}`);

const paths = {
  a17: 'data/validation/soldier-release-metadata-stage11-a17-promotion.v1.json',
  checkpoint60: 'data/validation/soldier-stage6-0-checkpoint.v1.json',
  list58: 'data/generated/soldier-list-stage5-8.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  validation58: 'data/validation/soldier-stage5-8-release.v1.json',
  generated61: 'data/generated/soldier-stage6-1-full-records.v1.json',
  validation61: 'data/validation/soldier-stage6-1-full-records.v1.json',
  generated62: 'data/generated/soldier-stage6-2-classification.v1.json',
  validation62: 'data/validation/soldier-stage6-2-classification.v1.json',
  validation63: 'data/validation/soldier-stage6-3-representative-qa.v1.json',
  validation64: 'data/validation/soldier-stage6-4-filter-qa.v1.json',
  validation65: 'data/validation/soldier-stage6-5-reciprocal-links.v1.json',
  validation66: 'data/validation/soldier-stage6-6-expansion-basis.v1.json',
  generated67: 'data/generated/soldier-stage6-7-site-admission.v1.json',
  validation67: 'data/validation/soldier-stage6-7-site-admission.v1.json',
  a18: 'data/validation/soldier-release-metadata-stage11-a18-site-admission-refresh.v1.json',
};

const a17 = readJson(paths.a17);
if (a17.schemaId !== 'soldier-release-metadata-stage11-a17-promotion/v1'
  || a17.status !== 'PASS'
  || a17.completion !== 'SOLDIER_RELEASE_METADATA_2022_10_PROMOTION_COMPLETE'
  || a17.owner !== 'soldier-release-metadata-promotion'
  || a17.nextOwner !== 'soldier-site-admission-refresh') {
  fail('Stage 11-A17 predecessor is not a completed handoff to soldier-site-admission-refresh');
}
if (a17.coverageAfter?.canonicalSoldiers !== 224
  || a17.coverageAfter?.confirmedReleaseRecords !== 53
  || a17.coverageAfter?.unresolvedReleaseRecords !== 171
  || a17.coverageAfter?.normalTier3Unresolved !== 76
  || a17.coverageAfter?.sp !== 56
  || a17.coverageAfter?.lowerTier !== 39) {
  fail('Stage 11-A17 coverage drift');
}

const checkpoint = readJson(paths.checkpoint60);
if (checkpoint.schemaId !== 'soldier-stage6-0-checkpoint/v1' || checkpoint.status !== 'PASS') {
  fail('Stage 6-0 checkpoint identity/status drift');
}
if (checkpoint.expectedCoverage?.canonicalSoldiers !== 224
  || checkpoint.expectedCoverage?.spSoldiers !== 56
  || checkpoint.expectedCoverage?.heroSoldierRelationEdges !== 5977) {
  fail('Stage 6-0 semantic population/relation baseline drift');
}

checkpoint.frozenAt = new Date().toISOString().slice(0, 10);
checkpoint.baseline = {
  commitSha: git('rev-parse', 'HEAD'),
  treeSha: git('rev-parse', 'HEAD^{tree}'),
  commitMessage: git('log', '-1', '--pretty=%s'),
};
checkpoint.generatedBaseline.soldierListFinal.gitBlobSha = gitBlobSha(paths.list58);
checkpoint.generatedBaseline.soldierReleaseMetadata.gitBlobSha = gitBlobSha(paths.releaseMetadata);
checkpoint.validationBaseline.stage5_8.gitBlobSha = gitBlobSha(paths.validation58);
checkpoint.expectedCoverage.confirmedReleaseCount = 53;
checkpoint.expectedCoverage.unresolvedReleaseCount = 171;
checkpoint.expectedCoverage.unresolvedNormalTier3ReleaseCount = 76;
const releaseReview = checkpoint.knownReviews?.find(item => item.code === 'RELEASE_DATE_UNRESOLVED');
if (!releaseReview) fail('Stage 6-0 RELEASE_DATE_UNRESOLVED review is missing');
releaseReview.count = 171;
checkpoint.refresh = {
  stage: '11-A18',
  predecessor: paths.a17,
  reason: 'REFRESH_RELEASE_METADATA_ONLY_AFTER_FROZEN_STAGE11_A17_PROMOTION',
  canonicalPopulationRecomputed: false,
  heroSoldierRelationRecomputed: false,
  releaseCoverageBefore: { confirmed: 51, unresolved: 173, unresolvedNormalTier3: 78 },
  releaseCoverageAfter: { confirmed: 53, unresolved: 171, unresolvedNormalTier3: 76 },
};
writeJson(paths.checkpoint60, checkpoint);

const finalizers = [
  'scripts/finalize-soldier-stage6-1-full-records.cjs',
  'scripts/finalize-soldier-stage6-2-classification.cjs',
  'scripts/finalize-soldier-stage6-3-representative-qa.cjs',
  'scripts/finalize-soldier-stage6-4-filter-qa.cjs',
  'scripts/finalize-soldier-stage6-5-reciprocal-links.cjs',
  'scripts/finalize-soldier-stage6-6-expansion-basis.cjs',
  'scripts/finalize-soldier-stage6-7-site-admission.cjs',
];
for (const script of finalizers) {
  console.log(`Running ${script}`);
  execFileSync('node', [script], { cwd: root, stdio: 'inherit' });
}

const v61 = readJson(paths.validation61);
const v62 = readJson(paths.validation62);
const v63 = readJson(paths.validation63);
const v64 = readJson(paths.validation64);
const v65 = readJson(paths.validation65);
const v66 = readJson(paths.validation66);
const g67 = readJson(paths.generated67);
const v67 = readJson(paths.validation67);
const requiredPass = [
  [paths.validation61, v61.status],
  [paths.validation62, v62.status],
  [paths.validation63, v63.status],
  [paths.validation64, v64.status],
  [paths.validation65, v65.status],
  [paths.validation66, v66.status],
  [paths.generated67, g67.status],
  [paths.validation67, v67.status],
];
const nonPass = requiredPass.filter(([, status]) => status !== 'PASS');
if (nonPass.length) fail(`Stage 11-A18 downstream refresh has non-PASS outputs: ${JSON.stringify(nonPass)}`);

const coverage67 = v67.coverage ?? {};
if (coverage67.canonicalSoldiers !== 224
  || coverage67.normalSoldiers !== 168
  || coverage67.spSoldiers !== 56
  || coverage67.heroSoldierRelations !== 5977) {
  fail(`Stage 6-7 canonical/relation coverage drift: ${JSON.stringify(coverage67)}`);
}
const releaseReview67 = (v67.reviews ?? []).find(item => item.code === 'RELEASE_DATE_UNRESOLVED');
if (!releaseReview67 || releaseReview67.count !== 171) {
  fail(`Stage 6-7 release review must refresh to 171, got ${JSON.stringify(releaseReview67)}`);
}

const a18 = {
  version: 1,
  schemaId: 'soldier-release-metadata-stage11-a18-site-admission-refresh/v1',
  stage: '11-A18',
  status: 'PASS',
  completion: 'SOLDIER_SITE_ADMISSION_RELEASE_REFRESH_COMPLETE',
  owner: 'soldier-site-admission-refresh',
  predecessor: {
    path: paths.a17,
    gitBlobSha: gitBlobSha(paths.a17),
    status: a17.status,
    completion: a17.completion,
  },
  scope: {
    releaseMetadataOnly: true,
    confirmedReleaseBefore: 51,
    confirmedReleaseAfter: 53,
    unresolvedReleaseBefore: 173,
    unresolvedReleaseAfter: 171,
    unresolvedNormalTier3Before: 78,
    unresolvedNormalTier3After: 76,
    promotedSoldierIds: [514, 816],
  },
  invariants: {
    canonicalSoldiers: 224,
    normalSoldiers: 168,
    spSoldiers: 56,
    heroSoldierRelations: 5977,
    canonicalPopulationRecomputed: false,
    heroSoldierRelationRecomputed: false,
    spChronologyChanged: false,
    lowerTierChronologyChanged: false,
    samePatchOrderInferred: false,
  },
  downstream: {
    stage61: v61.status,
    stage62: v62.status,
    stage63: v63.status,
    stage64: v64.status,
    stage65: v65.status,
    stage66: v66.status,
    stage67Generated: g67.status,
    stage67Validation: v67.status,
    releaseDateUnresolvedReviewCount: releaseReview67.count,
  },
  blockers: [],
  reviews: [
    '76 normal tier-3 Soldier release dates remain unresolved for future evidence acquisition.',
    'SP chronology remains a separate owner scope.',
    'Same-patch internal release order remains unresolved.',
  ],
  nextOwner: 'status-source',
  nextStartPoint: 'Refresh only the Soldier Status Source provenance/declaration projection for the newly frozen Stage 6-7 validation artifact. Do not reopen canonical Soldier or Hero-Soldier relation semantics.',
};
writeJson(paths.a18, a18);

console.log('Soldier Stage 11-A18 site-admission refresh: PASS');
console.log('releaseCoverage=53 confirmed / 171 unresolved / 76 unresolved normal tier-3');
console.log('canonicalSoldiers=224 heroSoldierRelations=5977');
