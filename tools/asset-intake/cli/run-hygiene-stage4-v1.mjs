import { buildStage4ProductionAdmission } from '../core/hygiene-stage4-production-admission-v1.mjs';

try {
  const { summary } = await buildStage4ProductionAdmission({ write: true });
  process.stdout.write(`${JSON.stringify({
    status: summary.status,
    completion: summary.completion,
    freezeState: summary.freezeState,
    coverage: summary.coverage,
    routerChecks: summary.routerChecks,
    hardErrorCount: summary.hardErrorCount,
  }, null, 2)}\n`);
  process.exitCode = summary.hardErrorCount === 0 ? 0 : 2;
} catch (error) {
  console.error(`[asset-hygiene-stage4] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
