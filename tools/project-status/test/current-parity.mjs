import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadProjectStatusContract,
  loadReviewLifecycleContract,
  normalizeProjectStatus,
  writeProjectStatusArtifacts,
} from '../lib/normalize-project-status.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fail = message => { throw new Error(message); };

const contract = loadProjectStatusContract({ repoRoot });
const reviewContract = loadReviewLifecycleContract({ repoRoot, contract });
const normalized = normalizeProjectStatus({ repoRoot, contract, reviewContract });

if (normalized?.schemaId !== 'project-status-normalized/v1') fail(`unexpected normalized schema: ${normalized?.schemaId}`);
if (normalized?.status !== 'PASS') fail(`normalized Project Status is not PASS: ${normalized?.status}`);
if (normalized?.completion !== 'COMPLETE') fail(`normalized Project Status is not COMPLETE: ${normalized?.completion}`);
if (normalized?.domains?.length !== 6) fail(`expected 6 domains, got ${normalized?.domains?.length}`);

const reviews = normalized.domains.flatMap(domain => domain.reviews ?? []);
if (reviews.length !== 29) fail(`expected 29 normalized reviews, got ${reviews.length}`);
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

if (!releaseReview || releaseReview.reportedCount !== 171 || releaseReview.resolvedCount !== 0 || releaseReview.remainingCount !== 171
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
  fail(`Soldier portrait review must be resolved by current evidence: ${JSON.stringify(portraitReview)}`);
}
if (lowerTierBoundary?.lifecycle !== 'BOUNDARY_NOTE' || lowerTierBoundary.healthImpact !== false
  || lowerTierBoundary.issueKey !== 'SOLDIER_LOWER_TIER_RELEASE_BOUNDARY') {
  fail(`Soldier lower-tier release review must remain a boundary: ${JSON.stringify(lowerTierBoundary)}`);
}
if (samePatchBoundary?.lifecycle !== 'BOUNDARY_NOTE' || samePatchBoundary.healthImpact !== false
  || samePatchBoundary.issueKey !== 'SOLDIER_SAME_PATCH_RELEASE_BOUNDARY') {
  fail(`Soldier same-patch release review must remain a boundary: ${JSON.stringify(samePatchBoundary)}`);
}

const equipment = normalized.domains.find(item => item.domain === 'equipment');
const equipmentReleaseReview = equipment?.reviews.find(review => review.code === 'EQUIPMENT_RELEASE_DATE_UNRESOLVED');
if (!equipmentReleaseReview || equipmentReleaseReview.reportedCount !== 153 || equipmentReleaseReview.resolvedCount !== 0
  || equipmentReleaseReview.remainingCount !== 153 || equipmentReleaseReview.lifecycle !== 'ACTIVE_REVIEW'
  || equipmentReleaseReview.issueKey !== 'EQUIPMENT_RELEASE_DATE_METADATA') {
  fail(`Equipment release review drift: ${JSON.stringify(equipmentReleaseReview)}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'project-status-parity-'));
try {
  const result = writeProjectStatusArtifacts({ repoRoot, contract, reviewContract, outputDir: tmp });
  if (result.status !== 'PASS_PROJECT_STATUS_WRITE') fail(`writer status drift: ${result.status}`);
  const normalizedWritten = JSON.parse(fs.readFileSync(path.join(tmp, 'project-status.normalized.v1.json'), 'utf8'));
  assert.deepEqual(normalizedWritten, normalized);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('PASS_PROJECT_STATUS_R2_CURRENT_PARITY');
console.log(JSON.stringify({
  domains: normalized.domains.length,
  reviews: reviews.length,
  assignedIssues: new Set(reviews.map(review => review.issueKey).filter(Boolean)).size,
  soldierReleaseRemaining: releaseReview.remainingCount,
}, null, 2));
