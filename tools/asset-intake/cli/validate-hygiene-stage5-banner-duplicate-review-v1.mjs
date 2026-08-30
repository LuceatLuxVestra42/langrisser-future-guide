import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PATHS, buildStage5BannerDuplicateReview } from '../core/hygiene-stage5-banner-duplicate-review-v1.mjs';

const REPO_ROOT = process.cwd();
const readJson = async repositoryPath => JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
const readText = async repositoryPath => readFile(path.join(REPO_ROOT, repositoryPath), 'utf8');

try {
  const contract = await readJson(PATHS.contract);
  const committedReview = await readJson(PATHS.review);
  const committedSummary = await readJson(PATHS.summary);
  const committedCheckpoint = await readText(PATHS.checkpoint);
  const fresh = await buildStage5BannerDuplicateReview({ write: false });

  assert.deepEqual(committedReview, fresh.review, 'committed duplicate review must be deterministic');
  assert.deepEqual(committedSummary, fresh.summary, 'committed duplicate summary must be deterministic');
  assert.equal(committedCheckpoint, fresh.checkpoint, 'committed duplicate checkpoint must be deterministic');

  assert.equal(committedSummary.status, contract.finalState.status);
  assert.equal(committedSummary.completion, contract.finalState.completion);
  assert.equal(committedSummary.freezeState, contract.finalState.freezeState);
  assert.equal(committedSummary.targetGroupCount, 1);
  assert.equal(committedSummary.targetAssetCount, 2);
  assert.equal(committedSummary.exactByteEquality, true);
  assert.equal(committedSummary.currentReferenceCount, 0);
  assert.equal(committedSummary.currentBannerResolvedRelationCount, 0);
  assert.equal(committedSummary.sameImportBatch, true);
  assert.equal(committedSummary.semanticIdentityProven, false);
  assert.equal(committedSummary.roleEquivalenceProven, false);
  assert.equal(committedSummary.ownerEquivalenceProven, false);
  assert.equal(committedSummary.deleteEligible, false);
  assert.equal(committedSummary.deleteApproved, false);
  assert.equal(committedSummary.decision, contract.finalState.decision);
  assert.equal(committedSummary.hardErrorCount, 0);
  assert.equal(committedSummary.blockers.length, 0);

  assert.equal(committedReview.status, 'REVIEW_FROZEN_NO_DELETE_APPROVAL');
  assert.equal(committedReview.members.length, 2);
  assert.equal(committedReview.evidence.exactByteEquality, true);
  assert.equal(committedReview.evidence.allCurrentReferencesAbsent, true);
  assert.equal(committedReview.evidence.allCurrentBannerResolvedRelationsAbsent, true);
  assert.equal(committedReview.evidence.sameIntroductionCommit, true);
  assert.equal(committedReview.evidence.sameIntroductionMessage, true);
  assert.equal(committedReview.evidence.bannerStage1CanonicalAssetOwnershipDeferred, true);
  assert.equal(committedReview.evidence.bannerStage1ReverseAssetReuseInferenceForbidden, true);
  assert.equal(committedReview.evidence.bannerStage3CanonicalAssetOwnerFalse, true);
  assert.equal(committedReview.evidence.bannerStage3AssetMayMergeBannerDefinitionsFalse, true);
  assert.equal(committedReview.importEvidence.commit, contract.target.expectedIntroductionCommit);
  assert.equal(committedReview.importEvidence.message, contract.target.expectedIntroductionMessage);
  assert.equal(committedReview.deleteEligible, false);
  assert.equal(committedReview.deleteApproved, false);
  assert.equal(committedReview.reviewRequired, true);
  assert.equal(committedReview.reviewIsBlocking, false);

  for (const member of committedReview.members) {
    assert.equal(member.sha256, contract.target.sha256);
    assert.equal(member.primaryClass, 'UNREFERENCED');
    assert.equal(member.destructiveState, 'REVIEW_CANDIDATE_UNREFERENCED');
    assert.equal(member.currentReferenceCount, 0);
    assert.equal(member.currentBannerResolvedRelation, false);
    assert.equal(member.gitPathHistory.length, 1);
  }

  for (const count of Object.values(committedSummary.forbiddenOperationCounts)) assert.equal(count, 0);

  process.stdout.write(`${JSON.stringify({
    status: 'PASS_ASSET_HYGIENE_STAGE5_BANNER_DUPLICATE_REVIEW',
    completion: committedSummary.completion,
    freezeState: committedSummary.freezeState,
    decision: committedSummary.decision,
    deleteApproved: committedSummary.deleteApproved,
    blockerCount: committedSummary.blockers.length,
  }, null, 2)}\n`);
} catch (error) {
  console.error(`[asset-hygiene-stage5-banner-duplicate-review-validate] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 2;
}
