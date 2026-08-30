#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildStage5BannerUnreferencedReview, PATHS } from '../core/hygiene-stage5-banner-unreferenced-review-v1.mjs';

const REPO_ROOT = process.cwd();
const load = async (repositoryPath) => JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
const fail = (message) => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };

const built = await buildStage5BannerUnreferencedReview({ write: false });
const [committedReview, committedSummary] = await Promise.all([
  load(PATHS.review),
  load(PATHS.summary),
]);

check(JSON.stringify(committedReview) === JSON.stringify(built.review), 'committed AH-5-2 review differs from deterministic rebuild');
check(JSON.stringify(committedSummary) === JSON.stringify(built.summary), 'committed AH-5-2 summary differs from deterministic rebuild');

const summary = committedSummary;
check(summary.status === 'PASS_WITH_REVIEW', `unexpected status ${summary.status}`);
check(summary.completion === 'COMPLETE', `unexpected completion ${summary.completion}`);
check(summary.freezeState === 'ASSET_HYGIENE_STAGE5_BANNER_UNREFERENCED_REVIEW_FROZEN', `unexpected freeze ${summary.freezeState}`);
check(summary.targetAssetCount === 431, `target count ${summary.targetAssetCount}`);
check(summary.reviewedAssetCount === 431, `reviewed count ${summary.reviewedAssetCount}`);
check(summary.currentReferenceCount === 0, `current reference count ${summary.currentReferenceCount}`);
check(summary.currentBannerResolvedRelationCount === 0, `current Banner relation count ${summary.currentBannerResolvedRelationCount}`);
check(summary.bannerCurrentBoundary.physicalAssetCount === 501, `physical Banner count ${summary.bannerCurrentBoundary.physicalAssetCount}`);
check(summary.bannerCurrentBoundary.currentResolvedUniquePathCount === 70, `current resolved count ${summary.bannerCurrentBoundary.currentResolvedUniquePathCount}`);
check(summary.bannerCurrentBoundary.resolvedPlusUnreferencedCount === 501, `resolved + unreferenced ${summary.bannerCurrentBoundary.resolvedPlusUnreferencedCount}`);
check(summary.bannerCurrentBoundary.partitionParity === true, 'Banner 501 = 70 + 431 partition parity failed');
check(summary.pathHistoryCoverageCount === 431, `path history coverage ${summary.pathHistoryCoverageCount}`);
check(summary.introductionEvidenceCoverageCount === 431, `introduction evidence coverage ${summary.introductionEvidenceCoverageCount}`);
check(summary.introductionBatchCount === 1, `introduction batch count ${summary.introductionBatchCount}`);
check(summary.introductionBatches.length === 1, `introduction batch rows ${summary.introductionBatches.length}`);
check(summary.introductionBatches[0].commit === 'e8d63e15179636461c795f94336a231020de3893', `introduction commit ${summary.introductionBatches[0].commit}`);
check(summary.introductionBatches[0].message === 'add banner assets', `introduction message ${summary.introductionBatches[0].message}`);
check(summary.introductionBatches[0].assetCount === 431, `introduction batch asset count ${summary.introductionBatches[0].assetCount}`);
check(summary.postIntroductionChangedAssetCount === 8, `post-introduction changed asset count ${summary.postIntroductionChangedAssetCount}`);
check((summary.decisionCounts.RETAIN_PENDING_ROLE_OR_OWNER_EQUIVALENCE_EVIDENCE ?? 0) === 2, 'AH-5-1 duplicate retain decision must cover exactly 2 assets');
check((summary.decisionCounts.RETAIN_REVIEW_ONLY_UNREFERENCED ?? 0) === 429, 'non-duplicate Banner review decision must cover exactly 429 assets');
check(summary.deleteEligibleCount === 0, `delete eligible count ${summary.deleteEligibleCount}`);
check(summary.deleteApprovedCount === 0, `delete approved count ${summary.deleteApprovedCount}`);
check(summary.hardErrorCount === 0, `hard error count ${summary.hardErrorCount}`);
check(summary.blockers.length === 0, `blocker count ${summary.blockers.length}`);

for (const [operation, count] of Object.entries(summary.forbiddenOperationCounts)) {
  check(count === 0, `forbidden operation ${operation} count ${count}`);
}

const review = committedReview;
check(review.recordCount === 431, `review record count ${review.recordCount}`);
check(review.records.length === 431, `review records length ${review.records.length}`);
check(new Set(review.records.map((record) => record.repositoryPath)).size === 431, 'duplicate repositoryPath in AH-5-2 review');
check(review.records.every((record) => record.currentReferenceCount === 0), 'AH-5-2 record with current reference present');
check(review.records.every((record) => record.currentBannerResolvedRelation === false), 'AH-5-2 record with current Banner relation present');
check(review.records.every((record) => record.gitPathHistoryCount > 0), 'AH-5-2 record missing Git path history');
check(review.records.every((record) => record.currentPathIntroduction?.commit), 'AH-5-2 record missing introduction commit evidence');
check(review.records.filter((record) => record.postIntroductionChangeCount > 0).length === 8, 'AH-5-2 post-introduction changed record count mismatch');
check(review.records.every((record) => record.postIntroductionHistory.length === record.postIntroductionChangeCount), 'AH-5-2 post-introduction history count mismatch');
check(review.records.every((record) => record.deleteEligible === false && record.deleteApproved === false), 'AH-5-2 destructive approval detected');

console.log(JSON.stringify({
  validator: 'PASS_ASSET_HYGIENE_STAGE5_BANNER_UNREFERENCED_REVIEW',
  targetAssetCount: summary.targetAssetCount,
  physicalFamilyCounts: summary.targetPhysicalFamilyCounts,
  currentResolvedPhysicalFamilyCounts: summary.bannerCurrentBoundary.currentResolvedPhysicalFamilyCounts,
  introductionBatchCount: summary.introductionBatchCount,
  postIntroductionChangedAssetCount: summary.postIntroductionChangedAssetCount,
  decisionCounts: summary.decisionCounts,
  deleteApprovedCount: summary.deleteApprovedCount,
  hardErrorCount: summary.hardErrorCount,
}, null, 2));
