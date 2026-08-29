import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CLOSEOUT_STEPS = [
  { id: 'd1-status', script: 'scripts/run-project-doctor-d1-3.mjs', passthrough: false },
  { id: 'd5-freshness', script: 'scripts/validate-project-doctor-d5.mjs', passthrough: false },
  { id: 'd5-self-test', script: 'scripts/validate-project-doctor-d5-fixtures.mjs', passthrough: false },
  { id: 'd4-self-test', script: 'scripts/validate-project-doctor-d4-v3.mjs', passthrough: false },
  { id: 'd4-run', script: 'scripts/run-project-doctor-d4-v3.mjs', passthrough: true },
];

const defaultExecutor = (step, args) => spawnSync(process.execPath, [step.script, ...args], { stdio: 'inherit', shell: false });

export const executeCloseout = ({ argv = [], executor = defaultExecutor } = {}) => {
  const executions = [];
  for (const step of CLOSEOUT_STEPS) {
    const args = step.passthrough ? argv : [];
    const result = executor(step, args);
    const exitCode = result?.status ?? 1;
    executions.push({ id: step.id, script: step.script, args, exitCode, error: result?.error?.message ?? null });
    if (result?.error || exitCode !== 0) {
      return { status: 'FAIL_CLOSEOUT_STEP', exitCode, failedStep: step.id, executions };
    }
  }
  return { status: 'PASS_PROJECT_DOCTOR_CLOSEOUT', exitCode: 0, executions };
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: npm run doctor -- [--dry-run] [--json] [D3/D4 changed-file source options]');
    console.log('Runs D1 status refresh, validates the existing D5 freshness seal without resealing, runs D5 and current D4 v3 self-tests, then executes the D3 v3-selected D4 v3 plan.');
    process.exit(0);
  }
  const result = executeCloseout({ argv: process.argv.slice(2) });
  process.exitCode = result.exitCode;
}
