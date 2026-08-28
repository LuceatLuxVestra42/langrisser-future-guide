import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_D5_CONTRACT_PATH,
  buildExpectedPathSets,
  snapshotPaths,
  validateFreshness,
} from './validate-project-doctor-d5.mjs';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const stableEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const changedSnapshots = (before, after) => Object.keys(before).filter(filePath => !stableEqual(before[filePath], after[filePath]));
const defaultRunStatus = script => spawnSync(process.execPath, [script], { stdio: 'inherit', shell: false });

export const refreshFreshness = ({ contractPath = DEFAULT_D5_CONTRACT_PATH, runStatus = defaultRunStatus } = {}) => {
  let d5Contract;
  let d1Contract;
  try {
    d5Contract = readJson(contractPath);
    d1Contract = readJson(d5Contract.d1Contract);
  } catch (error) {
    return { status: 'INVALID_INPUT', exitCode: 2, error: error instanceof Error ? error.message : String(error) };
  }

  if (d5Contract.status !== 'DESIGN_FROZEN' || d1Contract.status !== 'DESIGN_FROZEN') {
    return { status: 'INVALID_INPUT', exitCode: 2, error: 'D5 and D1 contracts must both be DESIGN_FROZEN.' };
  }

  const expected = buildExpectedPathSets({ d5Contract, d1Contract, contractPath });
  const before = snapshotPaths(expected.inputPaths);
  const missingBefore = Object.entries(before).filter(([, meta]) => !meta.exists).map(([filePath]) => filePath);
  if (missingBefore.length > 0) {
    return { status: 'INVALID_INPUT', exitCode: 2, error: 'Monitored inputs are missing.', missingInputs: missingBefore };
  }

  const statusResult = runStatus(d5Contract.d1StatusRunner);
  const statusExitCode = statusResult?.status ?? 1;
  if (statusResult?.error || statusExitCode !== 0) {
    return {
      status: 'D1_STATUS_FAILED',
      exitCode: statusExitCode,
      error: statusResult?.error?.message ?? null,
    };
  }

  const after = snapshotPaths(expected.inputPaths);
  const changedDuringRefresh = changedSnapshots(before, after);
  if (changedDuringRefresh.length > 0) {
    return { status: 'SOURCE_CHANGED_DURING_REFRESH', exitCode: 5, changedDuringRefresh };
  }

  const outputs = snapshotPaths(expected.outputPaths);
  const missingOutputs = Object.entries(outputs).filter(([, meta]) => !meta.exists).map(([filePath]) => filePath);
  if (missingOutputs.length > 0) {
    return { status: 'OUTPUT_MISSING_AFTER_REFRESH', exitCode: 2, missingOutputs };
  }

  const manifest = {
    version: 1,
    schemaId: 'project-doctor-d5-freshness-manifest/v1',
    stage: 'D5',
    status: 'FRESH_SNAPSHOT',
    contract: contractPath,
    d1Contract: d5Contract.d1Contract,
    authoritativeSourcePaths: expected.authoritativeSourcePaths,
    inputPaths: expected.inputPaths,
    outputPaths: expected.outputPaths,
    inputs: after,
    outputs,
  };

  fs.mkdirSync(path.dirname(d5Contract.manifestPath), { recursive: true });
  fs.writeFileSync(d5Contract.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const validation = validateFreshness({ contractPath });
  return {
    status: validation.status === 'FRESH' ? 'PASS_PROJECT_DOCTOR_D5_REFRESH' : 'FAIL_PROJECT_DOCTOR_D5_REFRESH',
    exitCode: validation.exitCode,
    validation,
  };
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const result = refreshFreshness();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}
