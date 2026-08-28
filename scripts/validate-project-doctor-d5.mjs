import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_D5_CONTRACT_PATH = 'data/contracts/project-doctor-d5-freshness.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const uniqSorted = values => [...new Set(values.filter(Boolean))].sort();
const stableEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const safeRelative = value => typeof value === 'string'
  && value.length > 0
  && !path.isAbsolute(value)
  && !value.split(/[\\/]+/).includes('..');

export const gitBlobSha = buffer => crypto
  .createHash('sha1')
  .update(`blob ${buffer.length}\0`)
  .update(buffer)
  .digest('hex');

export const collectAuthoritativeSourcePaths = d1Contract => uniqSorted(
  Object.values(d1Contract.domains ?? {}).flatMap(spec => [
    spec?.primaryStatusSource,
    ...(spec?.supplementalSources ?? []).map(item => item?.path),
  ]),
);

export const buildExpectedPathSets = ({ d5Contract, d1Contract, contractPath }) => ({
  authoritativeSourcePaths: collectAuthoritativeSourcePaths(d1Contract),
  inputPaths: uniqSorted([
    contractPath,
    ...(d5Contract.coreInputPaths ?? []),
    ...collectAuthoritativeSourcePaths(d1Contract),
  ]),
  outputPaths: uniqSorted(d5Contract.outputPaths ?? []),
});

export const snapshotPaths = paths => Object.fromEntries(paths.map(filePath => {
  if (!safeRelative(filePath)) return [filePath, { exists: false, gitBlobSha: null, invalidPath: true }];
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return [filePath, { exists: false, gitBlobSha: null }];
    const buffer = fs.readFileSync(filePath);
    return [filePath, { exists: true, gitBlobSha: gitBlobSha(buffer) }];
  } catch {
    return [filePath, { exists: false, gitBlobSha: null }];
  }
}));

const compareSnapshots = (expected, current) => {
  const mismatches = [];
  for (const filePath of uniqSorted([...Object.keys(expected ?? {}), ...Object.keys(current ?? {})])) {
    const before = expected?.[filePath] ?? null;
    const now = current?.[filePath] ?? null;
    if (!stableEqual(before, now)) mismatches.push({ path: filePath, expected: before, current: now });
  }
  return mismatches;
};

const verifyOutputStatuses = d5Contract => {
  const failures = [];
  for (const rule of d5Contract.outputStatusRules ?? []) {
    try {
      const value = readJson(rule.path)?.[rule.field];
      if (value !== rule.equals) failures.push({ path: rule.path, field: rule.field, expected: rule.equals, actual: value });
    } catch (error) {
      failures.push({
        path: rule.path,
        field: rule.field,
        expected: rule.equals,
        actual: 'UNREADABLE',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return failures;
};

const unsafePaths = expected => uniqSorted([
  ...expected.inputPaths,
  ...expected.outputPaths,
]).filter(filePath => !safeRelative(filePath));

export const validateFreshness = ({ contractPath = DEFAULT_D5_CONTRACT_PATH } = {}) => {
  let d5Contract;
  let d1Contract;
  let manifest;
  try {
    d5Contract = readJson(contractPath);
    d1Contract = readJson(d5Contract.d1Contract);
    manifest = readJson(d5Contract.manifestPath);
  } catch (error) {
    return {
      status: 'INVALID_INPUT',
      exitCode: 2,
      error: error instanceof Error ? error.message : String(error),
      staleReasonCount: 0,
      reasons: [],
    };
  }

  if (d5Contract.status !== 'DESIGN_FROZEN' || d1Contract.status !== 'DESIGN_FROZEN') {
    return {
      status: 'INVALID_INPUT',
      exitCode: 2,
      error: 'D5 and D1 contracts must both be DESIGN_FROZEN.',
      staleReasonCount: 0,
      reasons: [],
    };
  }

  const expected = buildExpectedPathSets({ d5Contract, d1Contract, contractPath });
  const invalidPaths = unsafePaths(expected);
  if (invalidPaths.length > 0) {
    return {
      status: 'INVALID_INPUT',
      exitCode: 2,
      error: 'D5 path sets must contain repository-relative paths without parent traversal.',
      invalidPaths,
      staleReasonCount: 0,
      reasons: [],
    };
  }

  const currentInputs = snapshotPaths(expected.inputPaths);
  const currentOutputs = snapshotPaths(expected.outputPaths);
  const reasons = [];

  if (manifest.status !== 'FRESH_SNAPSHOT') reasons.push({ type: 'MANIFEST_STATUS', actual: manifest.status });
  if (!stableEqual(manifest.authoritativeSourcePaths, expected.authoritativeSourcePaths)) {
    reasons.push({ type: 'AUTHORITATIVE_SOURCE_SET_CHANGED', expected: manifest.authoritativeSourcePaths, current: expected.authoritativeSourcePaths });
  }
  if (!stableEqual(manifest.inputPaths, expected.inputPaths)) {
    reasons.push({ type: 'INPUT_PATH_SET_CHANGED', expected: manifest.inputPaths, current: expected.inputPaths });
  }
  if (!stableEqual(manifest.outputPaths, expected.outputPaths)) {
    reasons.push({ type: 'OUTPUT_PATH_SET_CHANGED', expected: manifest.outputPaths, current: expected.outputPaths });
  }
  reasons.push(...compareSnapshots(manifest.inputs, currentInputs).map(item => ({ type: 'INPUT_HASH_MISMATCH', ...item })));
  reasons.push(...compareSnapshots(manifest.outputs, currentOutputs).map(item => ({ type: 'OUTPUT_HASH_MISMATCH', ...item })));
  reasons.push(...verifyOutputStatuses(d5Contract).map(item => ({ type: 'OUTPUT_STATUS_MISMATCH', ...item })));

  const stale = reasons.length > 0;
  return {
    version: 1,
    schemaId: 'project-doctor-d5-freshness-result/v1',
    stage: 'D5',
    status: stale ? 'STALE' : 'FRESH',
    exitCode: stale ? 4 : 0,
    hashAlgorithm: 'git-blob-sha1',
    authoritativeSourceCount: expected.authoritativeSourcePaths.length,
    monitoredInputCount: expected.inputPaths.length,
    monitoredOutputCount: expected.outputPaths.length,
    staleReasonCount: reasons.length,
    reasons,
  };
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const result = validateFreshness();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}
