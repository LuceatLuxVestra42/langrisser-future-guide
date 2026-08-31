import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const catalog = JSON.parse(fs.readFileSync('tools/project-check/contracts/validators.v1.json', 'utf8'));
const byId = new Map(catalog.validators.map(item => [item.id, item]));

const directValidatorIds = [
  'status-source-selection',
  'status-source-promotion',
  'status-source-producer-gate',
  'status-source-artifact-bridge',
  'status-source-lifecycle',
  'project-status-parity',
  'project-check-self-test',
  'regression-runner-self-test',
  'route-hosted-qa-self-test',
  'configdata-lookup-self-test',
  'configdata-integrity',
  'hero-assets',
  'equipment-assets',
  'asset-intake',
  'skin-stage3-2-evidence',
  'localization-audit',
  'production-build',
];

function trackedState() {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) throw new Error(`git status failed: ${String(result.stderr ?? '').trim()}`);
  return String(result.stdout ?? '').split(/\r?\n/).filter(Boolean).sort();
}

const baseline = trackedState();
const executions = [];

for (const id of directValidatorIds) {
  const validator = byId.get(id);
  if (!validator) throw new Error(`Missing catalog validator: ${id}`);
  const result = spawnSync(validator.executable, validator.args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const exitCode = Number.isInteger(result.status) ? result.status : 2;
  executions.push({ id, exitCode });
  if (exitCode !== 0) {
    console.error(JSON.stringify({ status: 'FAIL', failedValidatorId: id, executions }, null, 2));
    process.exit(2);
  }
  const after = trackedState();
  if (JSON.stringify(after) !== JSON.stringify(baseline)) {
    console.error(JSON.stringify({ status: 'FAIL_TRACKED_MUTATION', failedValidatorId: id, baseline, after, executions }, null, 2));
    process.exit(3);
  }
}

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'POST_REINSTALL_DIRECT_TOOL_MATRIX',
  directValidatorCount: directValidatorIds.length,
  directValidatorIds,
  regressionRunnerCoreValidatorParityCount: 9,
  trackedMutationCount: 0,
  executions,
}, null, 2));
