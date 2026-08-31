import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const catalog = JSON.parse(fs.readFileSync('tools/project-check/contracts/validators.v1.json', 'utf8'));
const byId = new Map(catalog.validators.map(item => [item.id, item]));

// configdata-integrity is deliberately excluded from the blocking direct queue here.
// PR #338 proved that the same validator already fails on the exact authoritative
// F3 main baseline (6ae0898d...) with the 753/753 array-root signature, so it is
// carried as REVIEW_EXISTING_DRIFT rather than misclassified as a Doctor v2 regression.
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
  status: 'PASS_WITH_REVIEW',
  checkpoint: 'POST_REINSTALL_DIRECT_TOOL_MATRIX',
  directValidatorPassCount: directValidatorIds.length,
  directValidatorIds,
  regressionRunnerCoreValidatorParityCount: 9,
  trackedMutationCount: 0,
  executions,
  reviews: [
    {
      code: 'CONFIGDATA_INTEGRITY_ARRAY_ROOT_VALIDATOR_DRIFT',
      classification: 'REVIEW_EXISTING_DRIFT',
      blocking: false,
      owner: 'configdata-validator-maintenance',
      proof: {
        pr: 338,
        runId: 33449443541,
        jobId: 99675789734,
        authoritativeMain: '6ae0898d12e142f707a8ac9721270d2b4cb3c2ce',
        totalJsonFiles: 753,
        pass: 0,
        suspect: 0,
        broken: 753,
        signature: 'JSON root is not an object',
      },
      reason: 'The validator already fails on the exact authoritative main baseline and the F4 matrix does not change ConfigData or the validator. Do not reopen ConfigData semantics from this acceptance run.',
    },
  ],
}, null, 2));
