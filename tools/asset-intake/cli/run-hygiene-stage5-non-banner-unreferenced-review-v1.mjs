#!/usr/bin/env node
import { buildStage5NonBannerUnreferencedReview } from '../core/hygiene-stage5-non-banner-unreferenced-review-v1.mjs';

const result = await buildStage5NonBannerUnreferencedReview({ write: true });
console.log(JSON.stringify({
  stage: result.summary.stage,
  status: result.summary.status,
  completion: result.summary.completion,
  freezeState: result.summary.freezeState,
  reviewedAssetCount: result.summary.reviewedAssetCount,
  evidenceCounts: result.summary.evidenceCounts,
  decisionCounts: result.summary.decisionCounts,
  stage5ReviewClosure: result.summary.stage5ReviewClosure,
  deleteApprovedCount: result.summary.deleteApprovedCount,
  hardErrorCount: result.summary.hardErrorCount,
  nextStartPoint: result.summary.nextStartPoint,
}, null, 2));
