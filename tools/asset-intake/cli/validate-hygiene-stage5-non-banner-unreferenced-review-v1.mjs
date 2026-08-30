#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildStage5NonBannerUnreferencedReview, PATHS } from '../core/hygiene-stage5-non-banner-unreferenced-review-v1.mjs';

const REPO_ROOT = process.cwd();
const load = async (repositoryPath) => JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
const fail = (message) => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };

const built = await buildStage5NonBannerUnreferencedReview({ write: false });
const [review, summary] = await Promise.all([load(PATHS.review), load(PATHS.summary)]);

check(JSON.stringify(review) === JSON.stringify(built.review), 'committed AH-5-3 review differs from deterministic rebuild');
check(JSON.stringify(summary) === JSON.stringify(built.summary), 'committed AH-5-3 summary differs from deterministic rebuild');
check(summary.status === 'PASS_WITH_REVIEW', `unexpected status ${summary.status}`);
check(summary.completion === 'COMPLETE', `unexpected completion ${summary.completion}`);
check(summary.freezeState === 'ASSET_HYGIENE_STAGE5_NON_BANNER_UNREFERENCED_REVIEW_FROZEN', `unexpected freeze ${summary.freezeState}`);
check(summary.targetAssetCount === 26, `target asset count ${summary.targetAssetCount}`);
check(summary.reviewedAssetCount === 26, `reviewed asset count ${summary.reviewedAssetCount}`);
check(summary.currentReferenceCount === 0, `current reference count ${summary.currentReferenceCount}`);
check(summary.pathHistoryCoverageCount === 26, `path history coverage ${summary.pathHistoryCoverageCount}`);
check(summary.introductionEvidenceCoverageCount === 26, `introduction evidence coverage ${summary.introductionEvidenceCoverageCount}`);

const expectedSubscopes = {
  PUBLIC_ROOT: 1,
  HERO_PORTRAIT_SAMPLES_ROOT: 5,
  SHARED_MOVEMENT_ROOT: 5,
  SHARED_STATS_ROOT: 5,
  SRC_ASSETS_ROOT: 9,
  SPINE_RENDERER_INPUT_ROOT: 1,
};
check(JSON.stringify(summary.physicalSubscopeCounts) === JSON.stringify(expectedSubscopes), `physical subscope counts ${JSON.stringify(summary.physicalSubscopeCounts)}`);
check(summary.evidenceCounts.currentToolExactRequiredInput === 1, `tool exact input count ${summary.evidenceCounts.currentToolExactRequiredInput}`);
check(summary.evidenceCounts.movementContractIdentifierMatch === 5, `movement identifier match count ${summary.evidenceCounts.movementContractIdentifierMatch}`);
check(summary.evidenceCounts.movementRepositoryDeliveryBindingProven === 0, `movement delivery binding inference ${summary.evidenceCounts.movementRepositoryDeliveryBindingProven}`);
check((summary.decisionCounts.RETAIN_CURRENT_TOOL_INPUT ?? 0) === 1, 'current tooling input decision must cover exactly 1 asset');
check((summary.decisionCounts.RETAIN_PENDING_MOVEMENT_ASSET_DELIVERY_BINDING ?? 0) === 5, 'movement pending binding decision must cover exactly 5 assets');
check((summary.decisionCounts.RETAIN_REVIEW_ONLY_UNREFERENCED ?? 0) === 20, 'default non-Banner review decision must cover exactly 20 assets');
check(summary.deleteEligibleCount === 0, `delete eligible count ${summary.deleteEligibleCount}`);
check(summary.deleteApprovedCount === 0, `delete approved count ${summary.deleteApprovedCount}`);
check(summary.hardErrorCount === 0, `hard error count ${summary.hardErrorCount}`);
check(summary.blockers.length === 0, `blocker count ${summary.blockers.length}`);
check(summary.stage5ReviewClosure.totalUnreferencedPopulation === 457, 'AH-5 frozen unreferenced population changed');
check(summary.stage5ReviewClosure.bannerReviewed === 431, 'AH-5-2 Banner reviewed count changed');
check(summary.stage5ReviewClosure.nonBannerReviewed === 26, 'AH-5-3 non-Banner reviewed count changed');
check(summary.stage5ReviewClosure.totalReviewed === 457, 'AH-5 total reviewed count mismatch');
check(summary.stage5ReviewClosure.allFrozenUnreferencedReviewed === true, 'AH-5 unreferenced review closure not complete');
check(summary.nextStartPoint === 'STOP_AH5_REVIEW_FROZEN_NO_DESTRUCTIVE_APPROVALS', `unexpected next start point ${summary.nextStartPoint}`);

for (const [operation, count] of Object.entries(summary.forbiddenOperationCounts)) {
  check(count === 0, `forbidden operation/inference ${operation} count ${count}`);
}

check(review.recordCount === 26 && review.records.length === 26, `review population ${review.records.length}`);
check(new Set(review.records.map((record) => record.repositoryPath)).size === 26, 'duplicate repositoryPath in AH-5-3 review');
check(review.records.every((record) => record.currentReferenceCount === 0), 'AH-5-3 record with current AH-2 reference');
check(review.records.every((record) => record.gitPathHistoryCount > 0), 'AH-5-3 record missing Git path history');
check(review.records.every((record) => record.currentPathIntroduction?.commit), 'AH-5-3 record missing introduction evidence');
check(review.records.every((record) => record.deleteEligible === false && record.deleteApproved === false), 'AH-5-3 destructive approval detected');

const tool = review.records.find((record) => record.repositoryPath === 'tools/spine-renderer/input/Ymir_Skin01.png');
check(tool?.evidence.currentToolExactRequiredInput === true, 'Spine texture current exact tooling input evidence missing');
check(tool?.decision === 'RETAIN_CURRENT_TOOL_INPUT', `Spine texture decision ${tool?.decision}`);
check(tool?.reviewRequired === false, 'current exact tooling input should be resolved as protected, not pending review');

const movement = review.records.filter((record) => record.physicalSubscope === 'SHARED_MOVEMENT_ROOT');
check(movement.length === 5, `movement record count ${movement.length}`);
check(movement.every((record) => record.evidence.movementContractIdentifierMatch === true), 'movement file missing current source identifier match');
check(movement.every((record) => record.evidence.movementRepositoryDeliveryBindingProven === false), 'movement repository delivery binding was inferred');
check(movement.every((record) => record.decision === 'RETAIN_PENDING_MOVEMENT_ASSET_DELIVERY_BINDING'), 'movement decision mismatch');

console.log(JSON.stringify({
  validator: 'PASS_ASSET_HYGIENE_STAGE5_NON_BANNER_UNREFERENCED_REVIEW',
  reviewedAssetCount: summary.reviewedAssetCount,
  physicalSubscopeCounts: summary.physicalSubscopeCounts,
  evidenceCounts: summary.evidenceCounts,
  decisionCounts: summary.decisionCounts,
  postIntroductionChangedAssetCount: summary.postIntroductionChangedAssetCount,
  introductionBatchCount: summary.introductionBatchCount,
  stage5ReviewClosure: summary.stage5ReviewClosure,
  deleteApprovedCount: summary.deleteApprovedCount,
  hardErrorCount: summary.hardErrorCount,
}, null, 2));
