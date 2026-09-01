import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProjectStatus } from '../lib/project-status-view.mjs';
import {
  loadReviewLifecycleContract,
  normalizeProjectStatus,
} from '../lib/normalize-project-status.mjs';
import { loadProjectStatusWriterContract, writeProjectStatus } from '../lib/write-project-status.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
const fixture = readJson('tools/project-status/fixtures/current-project-status.v1.json');
const normalizationContract = readJson('tools/project-status/contracts/normalization.v1.json');
const allowStaleCanonical = process.env.PROJECT_STATUS_ALLOW_STALE_CANONICAL === '1';

const fail = message => { throw new Error(message); };
const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
};

const first = buildProjectStatus({ repoRoot });
const second = buildProjectStatus({ repoRoot });
same(first.normalized, second.normalized, 'deterministic normalized output');
same(first.projectStatus, second.projectStatus, 'deterministic projected output');
if (first.markdown !== second.markdown) fail('deterministic markdown output mismatch');

const normalized = first.normalized;
const projected = first.projectStatus;

if (normalized.readOnly !== true) fail('normalized output must be read-only');
if (normalized.validatorExecutionCount !== 0) fail('domain validator execution must remain zero');
if (normalized.rawConfigDataReadCount !== 0) fail('raw ConfigData reads must remain zero');
if (normalized.semanticRecomputationCount !== 0) fail('semantic recomputation must remain zero');
if (normalized.canonicalJoinRecomputationCount !== 0) fail('canonical JOIN recomputation must remain zero');
if (normalized.legacyProjectDoctorRuntimeImportCount !== 0) fail('legacy Doctor runtime imports must remain zero');
if (normalized.legacyGeneratedStatusReadCount !== 0) fail('legacy Doctor generated status reads must remain zero');
if (normalized.sourceAuthority?.schemaId !== 'status-source-selection/v1') fail('R1 Status Source selection must be the authority predecessor');
if (normalized.sourceAuthority?.selectedCount !== 6) fail('R1 Status Source selection must provide six domains');
if (normalizationContract.policy?.reviewPresenceAloneDoesNotForceReviewHealth !== true
  || normalizationContract.policy?.reviewHealthRequiresHealthImpact !== true) {
  fail('Stage 7 normalization contract must make domain REVIEW health depend on health-impact reviews, not raw review presence');
}
if (normalized.reviewLifecycleAuthority?.schemaId !== 'project-status-review-lifecycle/v1') fail('review lifecycle authority must be the explicit Project Status contract');
if (normalized.reviewLifecycleAuthority?.ruleCount !== 25) fail(`Stage 6 must expose 25 explicit lifecycle rules, got ${normalized.reviewLifecycleAuthority?.ruleCount}`);

const normalizedReviews = normalized.domains.flatMap(record => record.reviews ?? []);
if (normalizedReviews.length !== 28) fail(`Stage 6 must preserve the 28 reported review entries, got ${normalizedReviews.length}`);
const reviewKeys = normalizedReviews.map(review => review.reviewKey);
if (reviewKeys.some(key => typeof key !== 'string' || key.length === 0)) fail('every normalized review must have a stable reviewKey');
if (new Set(reviewKeys).size !== reviewKeys.length) fail('normalized reviewKey values must be unique across current sources');
for (const review of normalizedReviews) {
  if (!Object.prototype.hasOwnProperty.call(review, 'reportedCount')) fail(`review missing reportedCount: ${review.reviewKey}`);
  if (!Object.prototype.hasOwnProperty.call(review, 'resolvedCount')) fail(`review missing resolvedCount: ${review.reviewKey}`);
  if (!Object.prototype.hasOwnProperty.call(review, 'remainingCount')) fail(`review missing remainingCount: ${review.reviewKey}`);
  if (!Array.isArray(review.resolutionEvidence)) fail(`review missing resolutionEvidence: ${review.reviewKey}`);
  if (!Object.prototype.hasOwnProperty.call(review, 'issueKey')) fail(`review missing issueKey: ${review.reviewKey}`);
}

const lifecycleCounts = {
  ACTIVE_REVIEW: normalizedReviews.filter(review => review.lifecycle === 'ACTIVE_REVIEW').length,
  RESOLVED_BY_EVIDENCE: normalizedReviews.filter(review => review.lifecycle === 'RESOLVED_BY_EVIDENCE').length,
  DEFERRED_NON_ERROR: normalizedReviews.filter(review => review.lifecycle === 'DEFERRED_NON_ERROR').length,
  BOUNDARY_NOTE: normalizedReviews.filter(review => review.lifecycle === 'BOUNDARY_NOTE').length,
};
same(lifecycleCounts, {
  ACTIVE_REVIEW: 11,
  RESOLVED_BY_EVIDENCE: 1,
  DEFERRED_NON_ERROR: 8,
  BOUNDARY_NOTE: 8,
}, 'Stage 6 lifecycle counts');
if (normalizedReviews.filter(review => review.healthImpact === true).length !== 11) fail('Stage 6 must retain health impact on exactly 11 active review entries');
if (normalizedReviews.filter(review => typeof review.issueKey === 'string' && review.issueKey.length > 0).length !== 25) fail('Stage 6 must assign issueKey to exactly 25 explicitly classified entries');
if (normalizedReviews.filter(review => review.issueKey === null).length !== 3) fail('Stage 6 must leave exactly three mixed/ambiguous entries unassigned');
if (new Set(normalizedReviews.map(review => review.issueKey).filter(Boolean)).size !== 23) fail('Stage 6 exact issueKey reconciliation must yield 23 unique assigned issues');

const normalizedHero = normalized.domains.find(item => item.domain === 'hero');
const heroReviewKeys = normalizedHero.reviews.map(review => review.reviewKey);
if (!heroReviewKeys.includes('data/validation/hero-stage6-4-final.v1.json#/nonBlockingReviews[0]')
  || !heroReviewKeys.includes('data/validation/hero-stage6-4-final.v1.json#/nonBlockingReviews[1]')) {
  fail(`code-less Hero reviews must use selector/index review keys: ${JSON.stringify(heroReviewKeys)}`);
}
const heroMixedReview = normalizedHero.reviews.find(review => review.reviewKey.endsWith('/nonBlockingReviews[0]'));
const heroBoundaryReview = normalizedHero.reviews.find(review => review.reviewKey.endsWith('/nonBlockingReviews[1]'));
if (heroMixedReview?.lifecycle !== 'ACTIVE_REVIEW' || heroMixedReview.healthImpact !== true || heroMixedReview.issueKey !== null) {
  fail(`mixed Hero publication review must remain active/unassigned: ${JSON.stringify(heroMixedReview)}`);
}
if (heroBoundaryReview?.lifecycle !== 'BOUNDARY_NOTE' || heroBoundaryReview.healthImpact !== false || heroBoundaryReview.issueKey !== 'HERO_FRONTEND_ASSET_BOUNDARY') {
  fail(`Hero frontend/asset note must be an explicit non-health boundary: ${JSON.stringify(heroBoundaryReview)}`);
}

const normalizedSoldier = normalized.domains.find(item => item.domain === 'soldier');
const releaseReview = normalizedSoldier.reviews.find(review => review.code === 'RELEASE_DATE_UNRESOLVED');
if (!releaseReview || releaseReview.reportedCount !== 213 || releaseReview.resolvedCount !== 0 || releaseReview.remainingCount !== 213
  || releaseReview.lifecycle !== 'ACTIVE_REVIEW' || releaseReview.issueKey !== 'SOLDIER_RELEASE_DATE_METADATA') {
  fail(`Soldier release review must remain active with preserved count metadata: ${JSON.stringify(releaseReview)}`);
}
const krNameReview = normalizedSoldier.reviews.find(review => review.code === 'KR_NAME_UNRESOLVED');
if (!krNameReview || krNameReview.reportedCount !== 41 || krNameReview.resolvedCount !== 0 || krNameReview.remainingCount !== 41
  || krNameReview.lifecycle !== 'ACTIVE_REVIEW' || krNameReview.issueKey !== 'SOLDIER_KR_NAME_PRESENTATION_COVERAGE') {
  fail(`Stage 6 must not collapse the primary 41-name review to the T3-only 2-name evidence scope: ${JSON.stringify(krNameReview)}`);
}
const portraitReview = normalizedSoldier.reviews.find(review => review.code === 'REPRESENTATIVE_ASSET_ID_UNFROZEN');
if (portraitReview?.lifecycle !== 'RESOLVED_BY_EVIDENCE'
  || portraitReview.healthImpact !== false
  || portraitReview.issueKey !== 'SOLDIER_PORTRAIT_COVERAGE'
  || portraitReview.resolutionEvidence.length !== 4
  || portraitReview.resolutionEvidence.some(item => item.pass !== true)) {
  fail(`current full portrait coverage must resolve the stale representative asset review: ${JSON.stringify(portraitReview)}`);
}
const lowerTierBoundary = normalizedSoldier.reviews.find(review => review.code === 'LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED');
if (lowerTierBoundary?.lifecycle !== 'BOUNDARY_NOTE' || lowerTierBoundary.healthImpact !== false
  || lowerTierBoundary.remainingCount !== 0 || lowerTierBoundary.resolvedCount !== 39) {
  fail(`lower-tier non-required chronology must be classified as a non-health boundary: ${JSON.stringify(lowerTierBoundary)}`);
}

const normalizedHeroSoldier = normalized.domains.find(item => item.domain === 'hero-soldier');
const heroSoldierKr = normalizedHeroSoldier.reviews.find(review => review.code === 'SOLDIER_KR_NAME_UNRESOLVED');
const heroSoldierRelease = normalizedHeroSoldier.reviews.find(review => review.code === 'RELEASE_DATE_UNRESOLVED');
if (heroSoldierKr?.issueKey !== krNameReview.issueKey || heroSoldierRelease?.issueKey !== releaseReview.issueKey) {
  fail(`Hero-Soldier inherited presentation reviews must share only their explicitly declared Soldier issue keys: ${JSON.stringify({ heroSoldierKr, heroSoldierRelease })}`);
}
for (const code of ['ROUTE_IMPLEMENTATION_SEPARATE_FROM_IDENTITY', 'PRESENTATION_METADATA_INCOMPLETE', 'HERO_SOLDIER_FRONTEND_NOT_YET_IMPLEMENTED']) {
  const review = normalizedHeroSoldier.reviews.find(item => item.code === code);
  if (review?.lifecycle !== 'BOUNDARY_NOTE' || review.healthImpact !== false) fail(`Hero-Soldier ${code} must be a non-health ownership boundary`);
}

const normalizedBanner = normalized.domains.find(item => item.domain === 'banner');
const manualBannerImage = normalizedBanner.reviews.find(review => review.code === 'MANUAL_BANNER_IMAGE_PENDING');
if (manualBannerImage?.lifecycle !== 'ACTIVE_REVIEW' || manualBannerImage.healthImpact !== true || manualBannerImage.remainingCount !== 1) {
  fail(`manual Banner image gap must remain an active user-facing review: ${JSON.stringify(manualBannerImage)}`);
}
const deferredBannerReviews = normalizedBanner.reviews.filter(review => review.code !== 'MANUAL_BANNER_IMAGE_PENDING');
if (deferredBannerReviews.length !== 7 || deferredBannerReviews.some(review => review.lifecycle !== 'DEFERRED_NON_ERROR' || review.healthImpact !== false)) {
  fail(`the seven explicitly frozen Banner deferred non-errors must not affect active review health: ${JSON.stringify(deferredBannerReviews)}`);
}

if (projected.reportedReviewTotal !== 28
  || projected.activeReviewTotal !== 11
  || projected.resolvedReviewTotal !== 1
  || projected.deferredReviewTotal !== 8
  || projected.boundaryNoteTotal !== 8
  || projected.healthImpactReviewTotal !== 11
  || projected.assignedIssueReviewTotal !== 25
  || projected.unassignedReviewTotal !== 3
  || projected.uniqueIssueTotal !== 23
  || projected.healthImpactIssueTotal !== 6) {
  fail(`Stage 6 projected review aggregates mismatch: ${JSON.stringify({
    reportedReviewTotal: projected.reportedReviewTotal,
    activeReviewTotal: projected.activeReviewTotal,
    resolvedReviewTotal: projected.resolvedReviewTotal,
    deferredReviewTotal: projected.deferredReviewTotal,
    boundaryNoteTotal: projected.boundaryNoteTotal,
    healthImpactReviewTotal: projected.healthImpactReviewTotal,
    assignedIssueReviewTotal: projected.assignedIssueReviewTotal,
    unassignedReviewTotal: projected.unassignedReviewTotal,
    uniqueIssueTotal: projected.uniqueIssueTotal,
    healthImpactIssueTotal: projected.healthImpactIssueTotal,
  })}`);
}

const reviewLifecycleContract = loadReviewLifecycleContract({ repoRoot });
const syntheticResolvedContract = {
  ...reviewLifecycleContract,
  rules: [
    {
      id: 'synthetic-soldier-portrait-resolved',
      domain: 'soldier',
      match: { code: 'REPRESENTATIVE_ASSET_ID_UNFROZEN' },
      lifecycle: 'RESOLVED_BY_EVIDENCE',
      healthImpact: false,
      issueKey: 'SOLDIER_PORTRAIT_COVERAGE',
      evidence: [
        { sourceRole: 'CURRENT_SOLDIER_FRONTEND_PORTRAIT_COVERAGE', key: 'rawStatus', equals: 'PASS' },
        { sourceRole: 'CURRENT_SOLDIER_FRONTEND_PORTRAIT_COVERAGE', key: 'missingPortraitCount', equals: 0 },
      ],
    },
    {
      id: 'synthetic-hero-boundary-by-key',
      domain: 'hero',
      match: { reviewKey: 'data/validation/hero-stage6-4-final.v1.json#/nonBlockingReviews[1]' },
      lifecycle: 'BOUNDARY_NOTE',
      healthImpact: false,
      issueKey: 'HERO_FRONTEND_BOUNDARY',
      evidence: [],
    },
  ],
};
const syntheticResolved = normalizeProjectStatus({ repoRoot, reviewLifecycleContract: syntheticResolvedContract });
const syntheticSoldier = syntheticResolved.domains.find(item => item.domain === 'soldier');
const syntheticPortraitReview = syntheticSoldier.reviews.find(review => review.code === 'REPRESENTATIVE_ASSET_ID_UNFROZEN');
if (syntheticPortraitReview?.lifecycle !== 'RESOLVED_BY_EVIDENCE'
  || syntheticPortraitReview.healthImpact !== false
  || syntheticPortraitReview.remainingCount !== 0
  || syntheticPortraitReview.resolvedCount !== syntheticPortraitReview.reportedCount
  || syntheticPortraitReview.issueKey !== 'SOLDIER_PORTRAIT_COVERAGE'
  || syntheticPortraitReview.lifecycleRuleId !== 'synthetic-soldier-portrait-resolved'
  || syntheticPortraitReview.resolutionEvidence.length !== 2
  || syntheticPortraitReview.resolutionEvidence.some(item => item.pass !== true)) {
  fail(`contract evidence must resolve the targeted Soldier review: ${JSON.stringify(syntheticPortraitReview)}`);
}
const syntheticHero = syntheticResolved.domains.find(item => item.domain === 'hero');
const syntheticHeroBoundary = syntheticHero.reviews.find(review => review.reviewKey === 'data/validation/hero-stage6-4-final.v1.json#/nonBlockingReviews[1]');
if (syntheticHeroBoundary?.lifecycle !== 'BOUNDARY_NOTE'
  || syntheticHeroBoundary.healthImpact !== false
  || syntheticHeroBoundary.issueKey !== 'HERO_FRONTEND_BOUNDARY') {
  fail(`reviewKey rules must classify code-less Hero reviews: ${JSON.stringify(syntheticHeroBoundary)}`);
}
if (syntheticResolved.reviewTotal !== 28 || syntheticSoldier.health !== 'REVIEW') {
  fail('synthetic lifecycle classification must preserve raw review entry counting while active health-impact reviews remain REVIEW');
}

const syntheticPartialContract = {
  ...reviewLifecycleContract,
  rules: [
    {
      id: 'synthetic-soldier-kr-name-partial',
      domain: 'soldier',
      match: { code: 'KR_NAME_UNRESOLVED' },
      lifecycle: 'ACTIVE_REVIEW',
      healthImpact: true,
      issueKey: 'SOLDIER_KR_LOCALIZATION',
      evidence: [
        { sourceRole: 'CURRENT_PRESENTATION_REVIEW', key: 'rawStatus', equals: 'PASS' },
      ],
      remainingCountFromEvidence: {
        sourceRole: 'CURRENT_PRESENTATION_REVIEW',
        key: 'officialNameUnresolvedCount'
      }
    }
  ]
};
const syntheticPartial = normalizeProjectStatus({ repoRoot, reviewLifecycleContract: syntheticPartialContract });
const partialSoldier = syntheticPartial.domains.find(item => item.domain === 'soldier');
const partialNameReview = partialSoldier.reviews.find(review => review.code === 'KR_NAME_UNRESOLVED');
if (partialNameReview?.reportedCount !== 41
  || partialNameReview.resolvedCount !== 39
  || partialNameReview.remainingCount !== 2
  || partialNameReview.lifecycle !== 'ACTIVE_REVIEW'
  || partialNameReview.healthImpact !== true
  || partialNameReview.issueKey !== 'SOLDIER_KR_LOCALIZATION'
  || partialNameReview.countEvidence?.sourceRole !== 'CURRENT_PRESENTATION_REVIEW'
  || partialNameReview.countEvidence?.key !== 'officialNameUnresolvedCount'
  || partialNameReview.countEvidence?.actual !== 2
  || partialNameReview.countEvidence?.pass !== true) {
  fail(`partial resolution mechanism must derive 41 -> 39 resolved / 2 remaining when a caller explicitly supplies that scoped rule: ${JSON.stringify(partialNameReview)}`);
}
if (partialSoldier.health !== 'REVIEW' || syntheticPartial.reviewTotal !== 28) {
  fail('partial resolution must preserve ACTIVE_REVIEW health and raw review entry count');
}

const syntheticInvalidPartialContract = {
  ...reviewLifecycleContract,
  rules: [
    {
      id: 'synthetic-soldier-kr-name-invalid-count',
      domain: 'soldier',
      match: { code: 'KR_NAME_UNRESOLVED' },
      lifecycle: 'ACTIVE_REVIEW',
      healthImpact: true,
      remainingCount: 42,
      evidence: []
    }
  ]
};
const syntheticInvalidPartial = normalizeProjectStatus({ repoRoot, reviewLifecycleContract: syntheticInvalidPartialContract });
const invalidPartialSoldier = syntheticInvalidPartial.domains.find(item => item.domain === 'soldier');
const invalidPartialReview = invalidPartialSoldier.reviews.find(review => review.code === 'KR_NAME_UNRESOLVED');
if (invalidPartialReview?.remainingCount !== 41 || invalidPartialReview.resolvedCount !== 0 || invalidPartialSoldier.health !== 'INCONSISTENT') {
  fail(`out-of-bounds partial count must fail closed: ${JSON.stringify(invalidPartialReview)}/${invalidPartialSoldier.health}`);
}
const invalidPartialFailures = invalidPartialSoldier.notes.flatMap(note => note.reviewLifecycleRuleFailures ?? []);
if (!invalidPartialFailures.some(item => item.type === 'REVIEW_LIFECYCLE_COUNT_INVALID' && item.reason === 'REMAINING_COUNT_OUT_OF_BOUNDS')) {
  fail(`missing invalid partial-count failure: ${JSON.stringify(invalidPartialSoldier.notes)}`);
}

const syntheticHiddenPartialContract = {
  ...reviewLifecycleContract,
  rules: [
    {
      id: 'synthetic-soldier-kr-name-hidden-partial',
      domain: 'soldier',
      match: { code: 'KR_NAME_UNRESOLVED' },
      lifecycle: 'ACTIVE_REVIEW',
      healthImpact: false,
      remainingCount: 2,
      evidence: []
    }
  ]
};
const syntheticHiddenPartial = normalizeProjectStatus({ repoRoot, reviewLifecycleContract: syntheticHiddenPartialContract });
const hiddenPartialSoldier = syntheticHiddenPartial.domains.find(item => item.domain === 'soldier');
const hiddenPartialReview = hiddenPartialSoldier.reviews.find(review => review.code === 'KR_NAME_UNRESOLVED');
if (hiddenPartialReview?.remainingCount !== 41 || hiddenPartialReview.healthImpact !== true || hiddenPartialSoldier.health !== 'INCONSISTENT') {
  fail(`partial resolution may not hide remaining work from health: ${JSON.stringify(hiddenPartialReview)}/${hiddenPartialSoldier.health}`);
}

const syntheticFailClosedContract = {
  ...reviewLifecycleContract,
  rules: [
    {
      id: 'synthetic-soldier-portrait-bad-evidence',
      domain: 'soldier',
      match: { code: 'REPRESENTATIVE_ASSET_ID_UNFROZEN' },
      lifecycle: 'RESOLVED_BY_EVIDENCE',
      healthImpact: false,
      evidence: [
        { sourceRole: 'CURRENT_SOLDIER_FRONTEND_PORTRAIT_COVERAGE', key: 'missingPortraitCount', equals: 1 },
      ],
    },
  ],
};
const syntheticFailClosed = normalizeProjectStatus({ repoRoot, reviewLifecycleContract: syntheticFailClosedContract });
const failClosedSoldier = syntheticFailClosed.domains.find(item => item.domain === 'soldier');
const failClosedReview = failClosedSoldier.reviews.find(review => review.code === 'REPRESENTATIVE_ASSET_ID_UNFROZEN');
if (failClosedReview?.lifecycle !== 'ACTIVE_REVIEW' || failClosedReview.healthImpact !== true) {
  fail(`unsatisfied resolution evidence must fail closed to ACTIVE_REVIEW: ${JSON.stringify(failClosedReview)}`);
}
if (failClosedSoldier.health !== 'INCONSISTENT') {
  fail(`unsatisfied lifecycle evidence must surface as INCONSISTENT, got ${failClosedSoldier.health}`);
}
const failClosedNotes = failClosedSoldier.notes.flatMap(note => note.reviewLifecycleRuleFailures ?? []);
if (!failClosedNotes.some(item => item.type === 'REVIEW_LIFECYCLE_EVIDENCE_NOT_SATISFIED')) {
  fail(`missing fail-closed lifecycle evidence note: ${JSON.stringify(failClosedSoldier.notes)}`);
}

const syntheticNonHealthBannerContract = {
  ...reviewLifecycleContract,
  rules: reviewLifecycleContract.rules.map(rule => (
    rule.id === 'banner-manual-image-active'
      ? {
        ...rule,
        lifecycle: 'DEFERRED_NON_ERROR',
        healthImpact: false,
        remainingCount: 0,
      }
      : rule
  )),
};
const syntheticNonHealthBanner = normalizeProjectStatus({ repoRoot, reviewLifecycleContract: syntheticNonHealthBannerContract });
const nonHealthBanner = syntheticNonHealthBanner.domains.find(item => item.domain === 'banner');
if (nonHealthBanner.reviewCount !== 8
  || nonHealthBanner.reviews.some(review => review.healthImpact === true)
  || nonHealthBanner.health !== 'PASS') {
  fail(`Stage 7 must allow a PASS domain with reported non-health reviews: ${JSON.stringify({
    reviewCount: nonHealthBanner.reviewCount,
    health: nonHealthBanner.health,
    healthImpactReviews: nonHealthBanner.reviews.filter(review => review.healthImpact === true).length,
  })}`);
}
if (syntheticNonHealthBanner.reviewTotal !== 28 || syntheticNonHealthBanner.projectHealth !== 'REVIEW') {
  fail('Stage 7 health cutover must preserve raw review totals and leave unrelated active-review domains unchanged');
}

for (const key of ['projectHealth', 'healthCounts', 'lifecycleCounts', 'knownHardErrorTotal', 'reviewTotal', 'blockerTotal']) {
  same(projected[key], fixture[key], `aggregate ${key}`);
}

if (projected.domains.length !== 6) fail(`expected six projected domains, got ${projected.domains.length}`);
for (const record of projected.domains) {
  const expected = fixture.domains[record.domain];
  if (!expected) fail(`unexpected domain ${record.domain}`);
  same(record.activeSourceId, expected.selectedId, `${record.domain} selectedId`);
  same(record.activeSource, expected.activeSource, `${record.domain} activeSource`);
  same(record.lifecycle, expected.lifecycle, `${record.domain} lifecycle`);
  same(record.health, expected.health, `${record.domain} health`);
  same(record.status, expected.status, `${record.domain} status`);
  same(record.completion, expected.completion, `${record.domain} completion`);
  same(record.freezeState, expected.freezeState, `${record.domain} freezeState`);
  same(record.population, expected.population, `${record.domain} population`);
  same(record.reviewCount, expected.reviewCount, `${record.domain} reviewCount`);
  same(record.blockerCount, expected.blockerCount, `${record.domain} blockerCount`);
  same(record.supplementalSources.length, expected.supplementalCount, `${record.domain} supplementalCount`);
}

const equipment = projected.domains.find(item => item.domain === 'equipment');
same(
  { canonical: equipment.population.canonical, public: equipment.population.public, general: equipment.population.general, exclusive: equipment.population.exclusive },
  { canonical: 390, public: 365, general: 198, exclusive: 167 },
  'Equipment successor projection',
);

const skin = projected.domains.find(item => item.domain === 'skin');
if (skin.lifecycle !== 'COMPLETE'
  || skin.health !== 'PASS'
  || skin.status !== 'PASS'
  || skin.completion !== 'SKIN_STAGE3_2_COMPLETE'
  || skin.reviewCount !== 0
  || skin.blockerCount !== 0) {
  fail('Skin completed asset-evidence projection must be COMPLETE/PASS with no review or blocker');
}

const canonicalProjectStatus = readJson('data/generated/project-status.v1.json');
if (canonicalProjectStatus.schemaId !== 'project-status/v1') fail('canonical Project Status schema must remain project-status/v1');
if (!allowStaleCanonical) {
  for (const key of [
    'version',
    'schemaId',
    'derivedOnly',
    'rawConfigDataReadCount',
    'semanticRecomputationCount',
    'projectHealth',
    'healthCounts',
    'lifecycleCounts',
    'knownHardErrorTotal',
    'reviewTotal',
    'blockerTotal',
  ]) {
    same(projected[key], canonicalProjectStatus[key], `canonical compatibility ${key}`);
  }
  for (const canonicalDomain of canonicalProjectStatus.domains ?? []) {
    const successor = projected.domains.find(item => item.domain === canonicalDomain.domain);
    if (!successor) fail(`NEW Project Status missing canonical domain ${canonicalDomain.domain}`);
    for (const [key, value] of Object.entries(canonicalDomain)) {
      same(successor[key], value, `canonical domain compatibility ${canonicalDomain.domain}.${key}`);
    }
  }
}
if (projected.source?.authoritySchemaId !== 'status-source-selection/v1') fail('NEW canonical Project Status must identify R1 Status Source authority');
if (projected.readOnly !== true || projected.canonicalJoinRecomputationCount !== 0) fail('NEW canonical Project Status must add explicit safe projection boundaries');

const writerContract = loadProjectStatusWriterContract({ repoRoot });
if (!['CUTOVER_DEFERRED', 'ACTIVE'].includes(writerContract.state)) fail(`unexpected writer state ${writerContract.state}`);
if (allowStaleCanonical && writerContract.state !== 'ACTIVE') fail('stale canonical allowance is valid only for the active writer repair path');
same(writerContract.canonicalTargets, {
  json: 'data/generated/project-status.v1.json',
  markdown: 'PROJECT_STATUS.md',
}, 'writer canonical targets');
if (writerContract.activation?.maximumActiveWriterCount !== 1) fail('Project Status writer must cap active writer count at one');

const writerCheck = writeProjectStatus({}, { repoRoot, contract: writerContract });
if (writerCheck.writePerformed !== false || writerCheck.boundaries.projectStatusWriteCount !== 0) fail('Project Status writer CHECK must not mutate repository');
same(writerCheck.canonicalTargets, ['data/generated/project-status.v1.json', 'PROJECT_STATUS.md'], 'writer check target set');

if (writerContract.state === 'CUTOVER_DEFERRED') {
  let deferredApplyBlocked = false;
  try {
    writeProjectStatus({ apply: true }, {
      repoRoot,
      contract: writerContract,
      readText: () => null,
      writeText: () => fail('deferred writer must not write'),
    });
  } catch (error) {
    deferredApplyBlocked = String(error).includes('apply is disabled');
  }
  if (!deferredApplyBlocked) fail('deferred Project Status writer APPLY must be blocked');
}

const syntheticWrites = [];
const syntheticActiveContract = { ...writerContract, state: 'ACTIVE' };
const syntheticApply = writeProjectStatus({ apply: true }, {
  repoRoot,
  contract: syntheticActiveContract,
  readText: () => 'synthetic-stale',
  writeText: (targetPath, content) => syntheticWrites.push({ targetPath, content }),
});
if (syntheticApply.writePerformed !== true || syntheticApply.boundaries.projectStatusWriteCount !== 2) fail('synthetic active writer must write exactly two canonical targets');
same(syntheticWrites.map(item => item.targetPath), ['data/generated/project-status.v1.json', 'PROJECT_STATUS.md'], 'synthetic writer target set');
if (syntheticApply.boundaries.statusSourceMutationCount !== 0
  || syntheticApply.boundaries.legacyProjectDoctorRuntimeDependencyCount !== 0
  || syntheticApply.boundaries.legacyD1RuntimeDependencyCount !== 0
  || syntheticApply.boundaries.legacyD5RuntimeDependencyCount !== 0
  || syntheticApply.boundaries.legacyGeneratedStatusReadCount !== 0
  || syntheticApply.boundaries.rawConfigDataReadCount !== 0
  || syntheticApply.boundaries.semanticRecomputationCount !== 0
  || syntheticApply.boundaries.canonicalJoinRecomputationCount !== 0
  || syntheticApply.boundaries.domainValidatorExecutionCount !== 0) {
  fail('Project Status writer side-effect boundary violated');
}

const runtimeFiles = [
  'tools/project-status/lib/normalize-project-status.mjs',
  'tools/project-status/lib/project-status-view.mjs',
  'tools/project-status/cli/status.mjs',
];
for (const relative of runtimeFiles) {
  const text = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  if (/from\s+['"][^'"]*project-doctor/i.test(text)) fail(`${relative} imports legacy Project Doctor runtime`);
  if (/data\/generated\/project-doctor/i.test(text)) fail(`${relative} reads legacy Doctor generated state`);
  if (/data\/generated\/project-status\.v1\.json/.test(text)) fail(`${relative} reads canonical Project Status generated output`);
  if (/PROJECT_STATUS\.md/.test(text)) fail(`${relative} reads PROJECT_STATUS.md`);
  if (/data\/configdata\//i.test(text)) fail(`${relative} reads raw ConfigData`);
  if (/writeFileSync|appendFileSync|rmSync|unlinkSync|renameSync/.test(text)) fail(`${relative} contains repository writer primitive`);
}

const writerRuntimeText = [
  fs.readFileSync(path.join(repoRoot, 'tools/project-status/lib/write-project-status.mjs'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'tools/project-status/cli/write.mjs'), 'utf8'),
].join('\n');
for (const forbidden of [
  'data/generated/project-doctor',
  'data/configdata/',
  'scripts/',
  'doctor:status',
  'run-project-doctor',
  'build-project-status.mjs',
]) {
  if (writerRuntimeText.includes(forbidden)) fail(`Project Status writer runtime must not depend on ${forbidden}`);
}

if (!first.markdown.includes('NEW Status Source authority')) fail('markdown must identify NEW Status Source authority');
if (!first.markdown.includes('raw ConfigData')) fail('markdown must preserve no-raw-ConfigData boundary');

console.log('[project-status-r2] PASS: Stage 7 health-impact review cutover, Stage 6 reconciliation, partial review resolution safety, review lifecycle contract, canonical compatibility, writer boundary, and runtime independence verified.');
console.log(JSON.stringify({
  projectHealth: projected.projectHealth,
  healthCounts: projected.healthCounts,
  lifecycleCounts: projected.lifecycleCounts,
  reviewTotal: projected.reviewTotal,
  blockerTotal: projected.blockerTotal,
  reviewModel: {
    normalizedReviewCount: normalizedReviews.length,
    uniqueReviewKeyCount: new Set(reviewKeys).size,
    heroCodeLessReviewKeyCount: heroReviewKeys.length,
    soldierReleaseReportedCount: releaseReview.reportedCount,
    lifecycleContractRuleCount: normalized.reviewLifecycleAuthority.ruleCount,
    activeReviewTotal: projected.activeReviewTotal,
    resolvedReviewTotal: projected.resolvedReviewTotal,
    deferredReviewTotal: projected.deferredReviewTotal,
    boundaryNoteTotal: projected.boundaryNoteTotal,
    assignedIssueReviewTotal: projected.assignedIssueReviewTotal,
    unassignedReviewTotal: projected.unassignedReviewTotal,
    uniqueIssueTotal: projected.uniqueIssueTotal,
    healthImpactIssueTotal: projected.healthImpactIssueTotal,
    syntheticResolvedLifecycle: syntheticPortraitReview.lifecycle,
    syntheticPartialReportedCount: partialNameReview.reportedCount,
    syntheticPartialResolvedCount: partialNameReview.resolvedCount,
    syntheticPartialRemainingCount: partialNameReview.remainingCount,
    syntheticInvalidPartialHealth: invalidPartialSoldier.health,
    syntheticFailClosedHealth: failClosedSoldier.health,
    syntheticNonHealthBannerHealth: nonHealthBanner.health,
  },
  selectedDomains: Object.fromEntries(projected.domains.map(item => [item.domain, item.activeSourceId])),
  equipment: {
    canonical: equipment.population.canonical,
    public: equipment.population.public,
    general: equipment.population.general,
    exclusive: equipment.population.exclusive,
  },
  skin: {
    lifecycle: skin.lifecycle,
    health: skin.health,
    status: skin.status,
    completion: skin.completion,
    blockerCount: skin.blockerCount,
  },
  writer: {
    state: writerContract.state,
    canonicalTargets: writerCheck.canonicalTargets,
    changedTargetCount: writerCheck.changedTargetCount,
    checkWrites: writerCheck.boundaries.projectStatusWriteCount,
    syntheticApplyWrites: syntheticApply.boundaries.projectStatusWriteCount,
    maxActiveWriterCount: writerContract.activation.maximumActiveWriterCount,
    allowStaleCanonical,
  },
}, null, 2));
