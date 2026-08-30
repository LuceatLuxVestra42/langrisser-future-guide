import { buildStage5BannerDuplicateReview } from '../core/hygiene-stage5-banner-duplicate-review-v1.mjs';

try {
  const { summary } = await buildStage5BannerDuplicateReview({ write: true });
  process.stdout.write(`${JSON.stringify({
    status: summary.status,
    completion: summary.completion,
    freezeState: summary.freezeState,
    targetAssetCount: summary.targetAssetCount,
    currentReferenceCount: summary.currentReferenceCount,
    sameImportBatch: summary.sameImportBatch,
    semanticIdentityProven: summary.semanticIdentityProven,
    roleEquivalenceProven: summary.roleEquivalenceProven,
    ownerEquivalenceProven: summary.ownerEquivalenceProven,
    deleteEligible: summary.deleteEligible,
    deleteApproved: summary.deleteApproved,
    decision: summary.decision,
    hardErrorCount: summary.hardErrorCount,
  }, null, 2)}\n`);
  process.exitCode = summary.hardErrorCount === 0 ? 0 : 2;
} catch (error) {
  console.error(`[asset-hygiene-stage5-banner-duplicate-review] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
