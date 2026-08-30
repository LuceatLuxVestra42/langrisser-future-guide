import { spawnSync } from 'node:child_process';

export const CLOSEOUT_STEPS_V7 = [
  { id: 'd1-status', script: 'scripts/run-project-doctor-d1-3.mjs', passthrough: false },
  { id: 'd5-freshness', script: 'scripts/validate-project-doctor-d5.mjs', passthrough: false },
  { id: 'd5-self-test', script: 'scripts/validate-project-doctor-d5-fixtures.mjs', passthrough: false },
  { id: 'frozen-freshness-v2-self-test', script: 'scripts/validate-project-doctor-frozen-freshness-v2.mjs', passthrough: false },
  { id: 'd4-self-test', script: 'scripts/validate-project-doctor-d4-v7.mjs', passthrough: false },
  { id: 'd4-run', script: 'scripts/run-project-doctor-d4-v7.mjs', passthrough: true },
];

const defaultExecutor = (step, args) => spawnSync(process.execPath, [step.script, ...args], { stdio: 'inherit', shell: false });

export const executeCloseoutV7 = ({ argv = [], executor = defaultExecutor } = {}) => {
  const executions = [];
  for (const step of CLOSEOUT_STEPS_V7) {
    const args = step.passthrough ? argv : [];
    const result = executor(step, args);
    const exitCode = result?.status ?? 1;
    executions.push({ id: step.id, script: step.script, args, exitCode, error: result?.error?.message ?? null });
    if (result?.error || exitCode !== 0) return { status: 'FAIL_CLOSEOUT_STEP', exitCode, failedStep: step.id, executions };
  }
  return { status: 'PASS_PROJECT_DOCTOR_CLOSEOUT_V7', exitCode: 0, executions };
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npm run doctor -- [--dry-run] [--json] [D3/D4 changed-file source options]');
  process.exit(0);
}
const result = executeCloseoutV7({ argv: process.argv.slice(2) });
process.exitCode = result.exitCode;
