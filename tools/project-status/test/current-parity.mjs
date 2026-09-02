import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProjectStatus } from '../lib/project-status-view.mjs';
import { loadReviewLifecycleContract, normalizeProjectStatus } from '../lib/normalize-project-status.mjs';
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

for (const [label, actual, expected] of [
  ['read-only', normalized.readOnly, true],
  ['validator executions', normalized.validatorExecutionCount, 0],
  ['raw ConfigData reads', normalized.rawConfigDataReadCount, 0],
  ['semantic recomputation', normalized.semanticRecomputationCount, 0],
  ['canonical JOIN recomputation', normalized.canonicalJoinRecomputationCount, 0],
  ['legacy Doctor imports', normalized.legacyProjectDoctorRuntimeImportCount, 0],
  ['legacy generated status reads', normalized.legacyGeneratedStatusReadCount, 0],
]) {
  if (actual !== expected) fail(`${label} mismatch: ${actual}`);
}
if (normalized.sourceAuthority?.schemaId !== 'status-source-selection/v1' || normalized.sourceAuthority?.selectedCount !== 6) {
  fail('R1 Status Source selection must remain the six-domain predecessor');
}
if (normalizationContract.policy?.reviewPresenceAloneDoesNotForceReviewHealth !== true
  || normalizationContract.policy?.reviewHealthRequiresHealthImpact !== true) {
  fail('domain REVIEW health must depend on health-impact reviews');
}
if (normalized.reviewLifecycleAuthority?.schemaId !== 'project-status-review-lifecycle/v1'
  || normalized.reviewLifecycleAuthority?.ruleCount !== 27) {
  fail(`corrected lifecycle authority mismatch: ${JSON.stringify(normalized.reviewLifecycleAuthority)}`);
}

const reviews = normalized.domains.flatMap(record => record.reviews ?? []);
if (reviews.length !== 28) fail(`must preserve 28 reported review entries, got ${reviews.length}`);
const reviewKeys = reviews.map(review => review.reviewKey);
if (reviewKeys.some(key => typeof key !== 'string' || key.length === 0) || new Set(reviewKeys).size !== 28) {
  fail('reviewKey values must be stable and unique');
}
for (const review of reviews) {
  for (const field of ['reportedCount', 'resolvedCount', 'remainingCount', 'issueKey']) {
    if (!Object.prototype.hasOwnProperty.call(review, field)) fail(`review missing ${field}: ${review.reviewKey}`);
  }
  if (!Array.isArray(review.resolutionEvidence)) fail(`review missing resolutionEvidence: ${review.reviewKey}`);
}

same({
  ACTIVE_REVIEW: reviews.filter(review => review.lifecycle === 'ACTIVE_REVIEW').length,
  RESOLVED_BY_EVIDENCE: reviews.filter(review => review.lifecycle === 'RESOLVED_BY_EVIDENCE').length,
  DEFERRED_NON_ERROR: reviews.filter(review => review.lifecycle === 'DEFERRED_NON_ERROR').length,
  BOUNDARY_NOTE: reviews.filter(review => review.lifecycle === 'BOUNDARY_NOTE').length,
}, {
  ACTIVE_REVIEW: 8,
  RESOLVED_BY_EVIDENCE: 2,
  DEFERRED_NON_ERROR: 8,
  BOUNDARY_NOTE: 10,
}, 'Stage 11-0 lifecycle counts');
if (reviews.filter(review => review.healthImpact === true).length !== 8) fail('health-impact review entry count must be 8 after Stage 11-0');
if (reviews.filter(review => typeof review.issueKey === 'string' && review.issueKey.length > 0).length !== 27) fail('assigned review entry count must be 27');
if (reviews.filter(review => review.issueKey === null).length !== 1) fail('only the Hero mixed publication umbrella may remain unassigned');
if (new Set(reviews.map(review => review.issueKey).filter(Boolean)).size !== 25) fail('unique assigned issue count must be 25');

const hero = normalized.domains.find(item => item.domain === 'hero');
const heroMixed = hero.reviews.find(review => review.reviewKey.endsWith('/nonBlockingReviews[0]'));
const heroBoundary = hero.reviews.find(review => review.reviewKey.endsWith('/nonBlockingReviews[1]'));
if (heroMixed?.lifecycle !== 'ACTIVE_REVIEW' || heroMixed.healthImpact !== true || heroMixed.issueKey !== null) {
  fail(`Hero mixed publication umbrella must remain active/unassigned: ${JSON.stringify(heroMixed)}`);
}
if (heroBoundary?.lifecycle !== 'BOUNDARY_NOTE' || heroBoundary.healthImpact !== false || heroBoundary.issueKey !== 'HERO_FRONTEND_ASSET_BOUNDARY') {
  fail(`Hero frontend/asset review must remain a boundary: ${JSON.stringify(heroBoundary)}`);
}

const soldier = normalized.domains.find(item => item.domain === 'soldier');
if (!soldier || soldier.supplementalSources?.length !== 3) fail('Soldier must include corrected Stage 10 supplemental evidence');
const soldierByCode = code => soldier.reviews.find(review => review.code === code);
const releaseReview = soldierByCode('RELEASE_DATE_UNRESOLVED');
const displayReview = soldierByCode('HERO_PAGE_SOLDIER_DISPLAY_NAME_REVIEW');
const identityReview = soldierByCode('IDENTITY_PRESENTATION_REVIEW');
const krNameReview = soldierByCode('KR_NAME_UNRESOLVED');
const portraitReview = soldierByCode('REPRESENTATIVE_ASSET_ID_UNFROZEN');
const lowerTierBoundary = soldierByCode('LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED');
const samePatchBoundary = soldierByCode('SAME_PATCH_ORDER_UNRESOLVED');

if (!releaseReview || releaseReview.reportedCount !== 173 || releaseReview.resolvedCount !== 0 || releaseReview.remainingCount !== 173
  || releaseReview.lifecycle !== 'ACTIVE_REVIEW' || releaseReview.issueKey !== 'SOLDIER_RELEASE_DATE_METADATA') {
  fail(`Soldier release review drift: ${JSON.stringify(releaseReview)}`);
}
if (!displayReview || displayReview.reportedCount !== 41 || displayReview.resolvedCount !== 41 || displayReview.remainingCount !== 0
  || displayReview.lifecycle !== 'RESOLVED_BY_EVIDENCE' || displayReview.healthImpact !== false
  || displayReview.issueKey !== 'SOLDIER_KR_NAME_DISPLAY_COVERAGE'
  || displayReview.resolutionEvidence.length !== 4 || displayReview.resolutionEvidence.some(item => item.pass !== true)) {
  fail(`historical Soldier display-gap review must be resolved by current evidence: ${JSON.stringify(displayReview)}`);
}
if (!identityReview || identityReview.reportedCount !== 41 || identityReview.resolvedCount !== 41 || identityReview.remainingCount !== 0
  || identityReview.lifecycle !== 'BOUNDARY_NOTE' || identityReview.healthImpact !== false
  || identityReview.issueKey !== 'SOLDIER_IDENTITY_PRESENTATION_BOUNDARY'
  || identityReview.resolutionEvidence.length !== 3 || identityReview.resolutionEvidence.some(item => item.pass !== true)) {
  fail(`Soldier identity/presentation review must be a boundary: ${JSON.stringify(identityReview)}`);
}
if (!krNameReview || krNameReview.reportedCount !== 41 || krNameReview.resolvedCount !== 39 || krNameReview.remainingCount !== 2
  || krNameReview.lifecycle !== 'ACTIVE_REVIEW' || krNameReview.healthImpact !== true
  || krNameReview.issueKey !== 'SOLDIER_KR_NAME_OFFICIAL_CONFIRMATION'
  || krNameReview.countEvidence?.sourceRole !== 'CURRENT_SOLDIER_NAME_RECONCILIATION'
  || krNameReview.countEvidence?.key !== 'officialKoreanNameUnresolvedCount'
  || krNameReview.countEvidence?.actual !== 2 || krNameReview.countEvidence?.pass !== true
  || krNameReview.resolutionEvidence.length !== 3 || krNameReview.resolutionEvidence.some(item => item.pass !== true)) {
  fail(`historical Soldier Korean-name review must project 41 reported / 39 resolved / 2 remaining: ${JSON.stringify(krNameReview)}`);
}
if (portraitReview?.lifecycle !== 'RESOLVED_BY_EVIDENCE' || portraitReview.healthImpact !== false
  || portraitReview.issueKey !== 'SOLDIER_PORTRAIT_COVERAGE'
  || portraitReview.resolutionEvidence.length !== 4 || portraitReview.resolutionEvidence.some(item => item.pass !== true)) {
  fail(`Soldier portrait review drift: ${JSON.stringify(portraitReview)}`);
}
if (lowerTierBoundary?.lifecycle !== 'BOUNDARY_NOTE' || lowerTierBoundary.healthImpact !== false
  || lowerTierBoundary.remainingCount !== 0 || lowerTierBoundary.resolvedCount !== 39) {
  fail(`lower-tier chronology boundary drift: ${JSON.stringify(lowerTierBoundary)}`);
}
if (samePatchBoundary?.lifecycle !== 'BOUNDARY_NOTE' || samePatchBoundary.healthImpact !== false
  || samePatchBoundary.issueKey !== 'SOLDIER_SAME_PATCH_ORDER') {
  fail(`same-patch chronology must be a non-health boundary: ${JSON.stringify(samePatchBoundary)}`);
}

const heroSoldier = normalized.domains.find(item => item.domain === 'hero-soldier');
if (!heroSoldier || heroSoldier.supplementalSources?.length !== 1) fail('Hero-Soldier must include corrected Stage 10 supplemental evidence');
const heroSoldierKr = heroSoldier.reviews.find(review => review.code === 'SOLDIER_KR_NAME_UNRESOLVED');
const heroSoldierRelease = heroSoldier.reviews.find(review => review.code === 'RELEASE_DATE_UNRESOLVED');
if (!heroSoldierKr || heroSoldierKr.issueKey !== krNameReview.issueKey
  || heroSoldierKr.reportedCount !== 41 || heroSoldierKr.resolvedCount !== 39 || heroSoldierKr.remainingCount !== 2
  || heroSoldierKr.lifecycle !== 'ACTIVE_REVIEW' || heroSoldierKr.healthImpact !== true
  || heroSoldierKr.countEvidence?.sourceRole !== 'CURRENT_SOLDIER_NAME_RECONCILIATION'
  || heroSoldierKr.countEvidence?.actual !== 2 || heroSoldierKr.countEvidence?.pass !== true) {
  fail(`Hero-Soldier duplicated name review must share corrected 41 -> 2 issue: ${JSON.stringify(heroSoldierKr)}`);
}
if (heroSoldierRelease?.issueKey !== releaseReview.issueKey) fail('Hero-Soldier release review issueKey drift');
for (const code of ['ROUTE_IMPLEMENTATION_SEPARATE_FROM_IDENTITY', 'PRESENTATION_METADATA_INCOMPLETE', 'HERO_SOLDIER_FRONTEND_NOT_YET_IMPLEMENTED']) {
  const review = heroSoldier.reviews.find(item => item.code === code);
  if (review?.lifecycle !== 'BOUNDARY_NOTE' || review.healthImpact !== false) fail(`Hero-Soldier ${code} must remain a non-health boundary`);
}

const banner = normalized.domains.find(item => item.domain === 'banner');
const manualBannerImage = banner.reviews.find(review => review.code === 'MANUAL_BANNER_IMAGE_PENDING');
if (manualBannerImage?.lifecycle !== 'ACTIVE_REVIEW' || manualBannerImage.healthImpact !== true || manualBannerImage.remainingCount !== 1) {
  fail(`manual Banner image review drift: ${JSON.stringify(manualBannerImage)}`);
}
const deferredBannerReviews = banner.reviews.filter(review => review.code !== 'MANUAL_BANNER_IMAGE_PENDING');
if (deferredBannerReviews.length !== 7 || deferredBannerReviews.some(review => review.lifecycle !== 'DEFERRED_NON_ERROR' || review.healthImpact !== false)) {
  fail('seven Banner deferred non-errors must remain non-health');
}

same({
  reported: projected.reportedReviewTotal,
  active: projected.activeReviewTotal,
  resolved: projected.resolvedReviewTotal,
  deferred: projected.deferredReviewTotal,
  boundary: projected.boundaryNoteTotal,
  healthImpact: projected.healthImpactReviewTotal,
  assigned: projected.assignedIssueReviewTotal,
  unassigned: projected.unassignedReviewTotal,
  uniqueIssues: projected.uniqueIssueTotal,
  healthImpactIssues: projected.healthImpactIssueTotal,
}, {
  reported: 28,
  active: 8,
  resolved: 2,
  deferred: 8,
  boundary: 10,
  healthImpact: 8,
  assigned: 27,
  unassigned: 1,
  uniqueIssues: 25,
  healthImpactIssues: 5,
}, 'corrected projected review aggregates');

const projectedSoldier = projected.domains.find(item => item.domain === 'soldier');
same({
  active: projectedSoldier.activeReviewTotal,
  resolved: projectedSoldier.resolvedReviewTotal,
  deferred: projectedSoldier.deferredReviewTotal,
  boundary: projectedSoldier.boundaryNoteTotal,
  healthImpact: projectedSoldier.healthImpactReviewTotal,
}, { active: 3, resolved: 2, deferred: 1, boundary: 6, healthImpact: 3 }, 'Stage 11-0 Soldier projected lifecycle aggregates');

const reviewLifecycleContract = loadReviewLifecycleContract({ repoRoot });
const syntheticPartial = normalizeProjectStatus({
  repoRoot,
  reviewLifecycleContract: {
    ...reviewLifecycleContract,
    rules: [{
      id: 'synthetic-soldier-kr-name-partial',
      domain: 'soldier',
      match: { code: 'KR_NAME_UNRESOLVED' },
      lifecycle: 'ACTIVE_REVIEW',
      healthImpact: true,
      issueKey: 'SOLDIER_KR_LOCALIZATION',
      evidence: [{ sourceRole: 'CURRENT_PRESENTATION_REVIEW', key: 'rawStatus', equals: 'PASS' }],
      remainingCountFromEvidence: { sourceRole: 'CURRENT_PRESENTATION_REVIEW', key: 'officialNameUnresolvedCount' },
    }],
  },
});
const partialSoldier = syntheticPartial.domains.find(item => item.domain === 'soldier');
const partialNameReview = partialSoldier.reviews.find(review => review.code === 'KR_NAME_UNRESOLVED');
if (partialNameReview?.reportedCount !== 41 || partialNameReview.resolvedCount !== 39 || partialNameReview.remainingCount !== 2
  || partialNameReview.lifecycle !== 'ACTIVE_REVIEW' || partialNameReview.healthImpact !== true
  || partialNameReview.countEvidence?.actual !== 2 || partialNameReview.countEvidence?.pass !== true) {
  fail(`partial resolution mechanism drift: ${JSON.stringify(partialNameReview)}`);
}

const invalidPartial = normalizeProjectStatus({
  repoRoot,
  reviewLifecycleContract: {
    ...reviewLifecycleContract,
    rules: [{
      id: 'synthetic-invalid-count',
      domain: 'soldier',
      match: { code: 'KR_NAME_UNRESOLVED' },
      lifecycle: 'ACTIVE_REVIEW',
      healthImpact: true,
      remainingCount: 42,
      evidence: [],
    }],
  },
});
const invalidSoldier = invalidPartial.domains.find(item => item.domain === 'soldier');
const invalidReview = invalidSoldier.reviews.find(review => review.code === 'KR_NAME_UNRESOLVED');
if (invalidReview?.remainingCount !== 41 || invalidReview.resolvedCount !== 0 || invalidSoldier.health !== 'INCONSISTENT') {
  fail('out-of-bounds partial resolution must fail closed');
}
if (!invalidSoldier.notes.flatMap(note => note.reviewLifecycleRuleFailures ?? [])
  .some(item => item.type === 'REVIEW_LIFECYCLE_COUNT_INVALID' && item.reason === 'REMAINING_COUNT_OUT_OF_BOUNDS')) {
  fail('invalid partial-count failure must be explicit');
}

const badEvidence = normalizeProjectStatus({
  repoRoot,
  reviewLifecycleContract: {
    ...reviewLifecycleContract,
    rules: [{
      id: 'synthetic-stage10-bad-evidence',
      domain: 'soldier',
      match: { code: 'KR_NAME_UNRESOLVED' },
      lifecycle: 'ACTIVE_REVIEW',
      healthImpact: true,
      evidence: [{ sourceRole: 'CURRENT_SOLDIER_NAME_RECONCILIATION', key: 'lowerTierPresentationUnresolvedCount', equals: 1 }],
      remainingCountFromEvidence: { sourceRole: 'CURRENT_SOLDIER_NAME_RECONCILIATION', key: 'officialKoreanNameUnresolvedCount' },
    }],
  },
});
const badEvidenceSoldier = badEvidence.domains.find(item => item.domain === 'soldier');
const badEvidenceReview = badEvidenceSoldier.reviews.find(review => review.code === 'KR_NAME_UNRESOLVED');
if (badEvidenceReview?.remainingCount !== 41 || badEvidenceReview.resolvedCount !== 0 || badEvidenceSoldier.health !== 'INCONSISTENT') {
  fail('unsatisfied Stage 10 evidence must fail closed');
}
if (!badEvidenceSoldier.notes.flatMap(note => note.reviewLifecycleRuleFailures ?? [])
  .some(item => item.type === 'REVIEW_LIFECYCLE_EVIDENCE_NOT_SATISFIED')) {
  fail('Stage 10 evidence failure must be explicit');
}

const nonHealthBanner = normalizeProjectStatus({
  repoRoot,
  reviewLifecycleContract: {
    ...reviewLifecycleContract,
    rules: reviewLifecycleContract.rules.map(rule => rule.id === 'banner-manual-image-active'
      ? { ...rule, lifecycle: 'DEFERRED_NON_ERROR', healthImpact: false, remainingCount: 0 }
      : rule),
  },
}).domains.find(item => item.domain === 'banner');
if (nonHealthBanner.reviewCount !== 8 || nonHealthBanner.reviews.some(review => review.healthImpact === true) || nonHealthBanner.health !== 'PASS') {
  fail('health cutover must allow PASS with reported non-health reviews');
}

for (const key of ['projectHealth', 'healthCounts', 'lifecycleCounts', 'knownHardErrorTotal', 'reviewTotal', 'blockerTotal']) {
  same(projected[key], fixture[key], `aggregate ${key}`);
}
if (projected.domains.length !== 6) fail(`expected six projected domains, got ${projected.domains.length}`);
for (const record of projected.domains) {
  const expected = fixture.domains[record.domain];
  if (!expected) fail(`unexpected domain ${record.domain}`);
  for (const [actualKey, expectedKey] of [
    ['activeSourceId', 'selectedId'], ['activeSource', 'activeSource'], ['lifecycle', 'lifecycle'],
    ['health', 'health'], ['status', 'status'], ['completion', 'completion'], ['freezeState', 'freezeState'],
    ['population', 'population'], ['reviewCount', 'reviewCount'], ['blockerCount', 'blockerCount'],
  ]) same(record[actualKey], expected[expectedKey], `${record.domain} ${actualKey}`);
  same(record.supplementalSources.length, expected.supplementalCount, `${record.domain} supplementalCount`);
}

const equipment = projected.domains.find(item => item.domain === 'equipment');
same({ canonical: equipment.population.canonical, public: equipment.population.public, general: equipment.population.general, exclusive: equipment.population.exclusive },
  { canonical: 390, public: 365, general: 198, exclusive: 167 }, 'Equipment successor projection');
const skin = projected.domains.find(item => item.domain === 'skin');
if (skin.lifecycle !== 'COMPLETE' || skin.health !== 'PASS' || skin.status !== 'PASS'
  || skin.completion !== 'SKIN_STAGE3_2_COMPLETE' || skin.reviewCount !== 0 || skin.blockerCount !== 0) {
  fail('Skin projection must remain COMPLETE/PASS');
}

const canonicalProjectStatus = readJson('data/generated/project-status.v1.json');
if (canonicalProjectStatus.schemaId !== 'project-status/v1') fail('canonical Project Status schema must remain project-status/v1');
if (!allowStaleCanonical) {
  for (const key of ['version', 'schemaId', 'derivedOnly', 'rawConfigDataReadCount', 'semanticRecomputationCount', 'projectHealth', 'healthCounts', 'lifecycleCounts', 'knownHardErrorTotal', 'reviewTotal', 'blockerTotal']) {
    same(projected[key], canonicalProjectStatus[key], `canonical compatibility ${key}`);
  }
  for (const canonicalDomain of canonicalProjectStatus.domains ?? []) {
    const successor = projected.domains.find(item => item.domain === canonicalDomain.domain);
    if (!successor) fail(`missing canonical domain ${canonicalDomain.domain}`);
    for (const [key, value] of Object.entries(canonicalDomain)) same(successor[key], value, `canonical domain compatibility ${canonicalDomain.domain}.${key}`);
  }
}
if (projected.source?.authoritySchemaId !== 'status-source-selection/v1' || projected.readOnly !== true || projected.canonicalJoinRecomputationCount !== 0) {
  fail('Project Status authority/read-only boundary drift');
}

const writerContract = loadProjectStatusWriterContract({ repoRoot });
if (!['CUTOVER_DEFERRED', 'ACTIVE'].includes(writerContract.state)) fail(`unexpected writer state ${writerContract.state}`);
if (allowStaleCanonical && writerContract.state !== 'ACTIVE') fail('stale canonical allowance is valid only for ACTIVE writer repair');
same(writerContract.canonicalTargets, { json: 'data/generated/project-status.v1.json', markdown: 'PROJECT_STATUS.md' }, 'writer canonical targets');
if (writerContract.activation?.maximumActiveWriterCount !== 1) fail('Project Status writer must cap active writer count at one');
const writerCheck = writeProjectStatus({}, { repoRoot, contract: writerContract });
if (writerCheck.writePerformed !== false || writerCheck.boundaries.projectStatusWriteCount !== 0) fail('writer CHECK must not mutate repository');

const syntheticWrites = [];
const syntheticApply = writeProjectStatus({ apply: true }, {
  repoRoot,
  contract: { ...writerContract, state: 'ACTIVE' },
  readText: () => 'synthetic-stale',
  writeText: (targetPath, content) => syntheticWrites.push({ targetPath, content }),
});
if (syntheticApply.writePerformed !== true || syntheticApply.boundaries.projectStatusWriteCount !== 2) fail('synthetic active writer must write exactly two canonical targets');
same(syntheticWrites.map(item => item.targetPath), ['data/generated/project-status.v1.json', 'PROJECT_STATUS.md'], 'synthetic writer target set');
for (const key of ['statusSourceMutationCount', 'legacyProjectDoctorRuntimeDependencyCount', 'legacyD1RuntimeDependencyCount', 'legacyD5RuntimeDependencyCount', 'legacyGeneratedStatusReadCount', 'rawConfigDataReadCount', 'semanticRecomputationCount', 'canonicalJoinRecomputationCount', 'domainValidatorExecutionCount']) {
  if (syntheticApply.boundaries[key] !== 0) fail(`Project Status writer side-effect boundary violated: ${key}`);
}

for (const relative of ['tools/project-status/lib/normalize-project-status.mjs', 'tools/project-status/lib/project-status-view.mjs', 'tools/project-status/cli/status.mjs']) {
  const text = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  if (/from\s+['"][^'"]*project-doctor/i.test(text)) fail(`${relative} imports legacy Project Doctor runtime`);
  if (/data\/generated\/project-doctor/i.test(text)) fail(`${relative} reads legacy Doctor generated state`);
  if (/data\/generated\/project-status\.v1\.json/.test(text)) fail(`${relative} reads canonical Project Status output`);
  if (/PROJECT_STATUS\.md/.test(text)) fail(`${relative} reads PROJECT_STATUS.md`);
  if (/data\/configdata\//i.test(text)) fail(`${relative} reads raw ConfigData`);
  if (/writeFileSync|appendFileSync|rmSync|unlinkSync|renameSync/.test(text)) fail(`${relative} contains repository writer primitive`);
}
const writerRuntimeText = [
  fs.readFileSync(path.join(repoRoot, 'tools/project-status/lib/write-project-status.mjs'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'tools/project-status/cli/write.mjs'), 'utf8'),
].join('\n');
for (const forbidden of ['data/generated/project-doctor', 'data/configdata/', 'scripts/', 'doctor:status', 'run-project-doctor', 'build-project-status.mjs']) {
  if (writerRuntimeText.includes(forbidden)) fail(`writer runtime must not depend on ${forbidden}`);
}
if (!first.markdown.includes('NEW Status Source authority') || !first.markdown.includes('raw ConfigData')) fail('markdown safety/authority copy drift');

console.log('[project-status-r2] PASS: Stage 11-0 same-patch chronology boundary, Stage 10 Soldier naming lifecycle, canonical compatibility, writer boundary, and runtime independence verified.');
console.log(JSON.stringify({
  projectHealth: projected.projectHealth,
  reviewTotal: projected.reviewTotal,
  blockerTotal: projected.blockerTotal,
  reviewModel: {
    lifecycleContractRuleCount: normalized.reviewLifecycleAuthority.ruleCount,
    soldierDisplayResolvedCount: displayReview.resolvedCount,
    soldierKrReportedCount: krNameReview.reportedCount,
    soldierKrResolvedCount: krNameReview.resolvedCount,
    soldierKrRemainingCount: krNameReview.remainingCount,
    activeReviewTotal: projected.activeReviewTotal,
    resolvedReviewTotal: projected.resolvedReviewTotal,
    boundaryNoteTotal: projected.boundaryNoteTotal,
    unassignedReviewTotal: projected.unassignedReviewTotal,
    uniqueIssueTotal: projected.uniqueIssueTotal,
    healthImpactIssueTotal: projected.healthImpactIssueTotal,
  },
  writer: {
    state: writerContract.state,
    changedTargetCount: writerCheck.changedTargetCount,
    allowStaleCanonical,
  },
}, null, 2));
