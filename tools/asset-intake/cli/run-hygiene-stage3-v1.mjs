import { buildStage3Classification } from '../core/hygiene-stage3-classification-v1.mjs';

const { summary } = await buildStage3Classification({ write: true });
console.log(JSON.stringify({
  status: summary.status,
  completion: summary.completion,
  freezeState: summary.freezeState,
  coverage: summary.coverage,
  primaryClassCounts: summary.primaryClassCounts,
  flagCounts: summary.flagCounts,
  reviewQueueCounts: summary.reviewQueueCounts,
  verifiedEvidenceIndex: summary.verifiedEvidenceIndex,
  hardErrorCount: summary.hardErrorCount,
  nextStartPoint: summary.nextStartPoint,
}, null, 2));

if (summary.hardErrorCount !== 0) process.exitCode = 1;
