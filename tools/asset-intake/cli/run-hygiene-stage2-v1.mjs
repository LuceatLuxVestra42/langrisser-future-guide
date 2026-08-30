import { buildStage2ReferenceMap } from '../core/hygiene-stage2-reference-map-v1.mjs';

const { summary } = await buildStage2ReferenceMap({ write: true });
console.log(JSON.stringify({
  status: summary.status,
  completion: summary.completion,
  freezeState: summary.freezeState,
  coverage: summary.coverage,
  hardErrorCount: summary.hardErrorCount,
  nextStartPoint: summary.nextStartPoint,
}, null, 2));

if (summary.hardErrorCount !== 0) process.exitCode = 1;
