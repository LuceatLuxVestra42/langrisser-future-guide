#!/usr/bin/env node
import { buildStage5BannerUnreferencedReview } from '../core/hygiene-stage5-banner-unreferenced-review-v1.mjs';

const { summary } = await buildStage5BannerUnreferencedReview({ write: true });
console.log(JSON.stringify({
  stage: summary.stage,
  status: summary.status,
  completion: summary.completion,
  freezeState: summary.freezeState,
  targetAssetCount: summary.targetAssetCount,
  reviewedAssetCount: summary.reviewedAssetCount,
  currentReferenceCount: summary.currentReferenceCount,
  currentBannerResolvedRelationCount: summary.currentBannerResolvedRelationCount,
  pathHistoryCoverageCount: summary.pathHistoryCoverageCount,
  introductionEvidenceCoverageCount: summary.introductionEvidenceCoverageCount,
  introductionBatchCount: summary.introductionBatchCount,
  decisionCounts: summary.decisionCounts,
  deleteApprovedCount: summary.deleteApprovedCount,
  hardErrorCount: summary.hardErrorCount,
  nextStartPoint: summary.nextStartPoint,
}, null, 2));
if (summary.hardErrorCount !== 0) process.exitCode = 1;
