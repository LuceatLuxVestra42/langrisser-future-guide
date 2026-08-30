import { buildStage5ScopeFreeze } from '../core/hygiene-stage5-scope-freeze-v1.mjs';

try {
  const { summary } = await buildStage5ScopeFreeze({ write: true });
  process.stdout.write(`${JSON.stringify({
    status: summary.status,
    completion: summary.completion,
    freezeState: summary.freezeState,
    coverage: summary.coverage,
    exactDuplicateReview: summary.exactDuplicateReview,
    unreferencedByRoot: summary.unreferencedByRoot,
    hardErrorCount: summary.hardErrorCount,
  }, null, 2)}\n`);
  process.exitCode = summary.hardErrorCount === 0 ? 0 : 2;
} catch (error) {
  console.error(`[asset-hygiene-stage5-scope] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
