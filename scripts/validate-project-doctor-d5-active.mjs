import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export const DEFAULT_D5_CONTRACT_PATH = 'data/contracts/project-doctor-d5-freshness.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const uniqSorted = values => [...new Set(values.filter(Boolean))].sort();
const stableEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const safeRelative = value => typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]+/).includes('..');

export const gitBlobSha = buffer => crypto.createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');

const legacySourcePaths = d1Contract => uniqSorted(Object.values(d1Contract.domains ?? {}).flatMap(spec => [
  spec?.primaryStatusSource,
  ...(spec?.supplementalSources ?? []).map(item => item?.path),
]));

const registryEntryFiles = registryContract => {
  if (!registryContract?.entryDirectory || !fs.existsSync(registryContract.entryDirectory)) return [];
  return fs.readdirSync(registryContract.entryDirectory)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => path.posix.join(registryContract.entryDirectory.replaceAll('\\', '/'), name));
};

const registryDeclaredSources = (registryContract, entryFiles) => {
  const paths = [];
  for (const filePath of entryFiles) {
    try {
      const parsed = readJson(filePath);
      const entries = Array.isArray(parsed.entries) ? parsed.entries : parsed.entry ? [parsed.entry] : [];
      for (const entry of entries) if (entry?.state === (registryContract.policy?.entryStateRequired ?? 'APPROVED')) paths.push(entry.sourcePath);
    } catch {
      paths.push(filePath);
    }
  }
  return uniqSorted(paths);
};

const supplementalSourcePaths = d1Contract => uniqSorted(Object.values(d1Contract.domains ?? {}).flatMap(spec =>
  (spec?.supplementalSources ?? []).map(item => item?.path),
));

const loadRegistryContext = d5Contract => {
  if (!d5Contract.activeSourceRegistryContract) return null;
  const registryContract = readJson(d5Contract.activeSourceRegistryContract);
  const entryFiles = registryEntryFiles(registryContract);
  const declaredSourcePaths = registryDeclaredSources(registryContract, entryFiles);
  let registry = null;
  try { registry = readJson(registryContract.outputPath); } catch { registry = null; }
  return { registryContract, entryFiles, declaredSourcePaths, registry };
};

export const collectAuthoritativeSourcePaths = (d1Contract, d5Contract = null) => {
  if (!d5Contract?.activeSourceRegistryContract) return legacySourcePaths(d1Contract);
  try {
    const context = loadRegistryContext(d5Contract);
    if (context?.registry?.status === 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY') {
      return uniqSorted([
        ...Object.values(context.registry.domains ?? {}).map(item => item?.sourcePath),
        ...supplementalSourcePaths(d1Contract),
      ]);
    }
  } catch {
    // Validation will report path/output mismatches. Fall back to the frozen D1 roots here.
  }
  return legacySourcePaths(d1Contract);
};

export const buildExpectedPathSets = ({ d5Contract, d1Contract, contractPath }) => {
  let registryInputs = [];
  let declaredSources = [];
  if (d5Contract.activeSourceRegistryContract) {
    try {
      const context = loadRegistryContext(d5Contract);
      registryInputs = [d5Contract.activeSourceRegistryContract, ...(context?.entryFiles ?? [])];
      declaredSources = context?.declaredSourcePaths ?? [];
    } catch {
      registryInputs = [d5Contract.activeSourceRegistryContract];
    }
  }
  return {
    authoritativeSourcePaths: collectAuthoritativeSourcePaths(d1Contract, d5Contract),
    declaredSourcePaths: uniqSorted(declaredSources),
    registryEntryPaths: uniqSorted(registryInputs.slice(1)),
    inputPaths: uniqSorted([
      contractPath,
      ...(d5Contract.coreInputPaths ?? []),
      ...registryInputs,
      ...declaredSources,
      ...supplementalSourcePaths(d1Contract),
      ...(d5Contract.activeSourceRegistryContract ? [] : legacySourcePaths(d1Contract)),
    ]),
    outputPaths: uniqSorted(d5Contract.outputPaths ?? []),
  };
};

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
      failures.push({ path: rule.path, field: rule.field, expected: rule.equals, actual: 'UNREADABLE', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return failures;
};

const unsafePaths = expected => uniqSorted([...expected.inputPaths, ...expected.outputPaths]).filter(filePath => !safeRelative(filePath));

export const validateFreshness = ({ contractPath = DEFAULT_D5_CONTRACT_PATH } = {}) => {
  let d5Contract;
  let d1Contract;
  let manifest;
  try {
    d5Contract = readJson(contractPath);
    d1Contract = readJson(d5Contract.d1Contract);
    manifest = readJson(d5Contract.manifestPath);
  } catch (error) {
    return { status: 'INVALID_INPUT', exitCode: 2, error: error instanceof Error ? error.message : String(error), staleReasonCount: 0, reasons: [] };
  }
  if (d5Contract.status !== 'DESIGN_FROZEN' || d1Contract.status !== 'DESIGN_FROZEN') {
    return { status: 'INVALID_INPUT', exitCode: 2, error: 'D5 and D1 contracts must both be DESIGN_FROZEN.', staleReasonCount: 0, reasons: [] };
  }

  const expected = buildExpectedPathSets({ d5Contract, d1Contract, contractPath });
  const invalidPaths = unsafePaths(expected);
  if (invalidPaths.length > 0) return { status: 'INVALID_INPUT', exitCode: 2, error: 'D5 path sets must contain repository-relative paths without parent traversal.', invalidPaths, staleReasonCount: 0, reasons: [] };

  const currentInputs = snapshotPaths(expected.inputPaths);
  const currentOutputs = snapshotPaths(expected.outputPaths);
  const reasons = [];
  if (manifest.status !== 'FRESH_SNAPSHOT') reasons.push({ type: 'MANIFEST_STATUS', actual: manifest.status });
  if (!stableEqual(manifest.authoritativeSourcePaths, expected.authoritativeSourcePaths)) reasons.push({ type: 'AUTHORITATIVE_SOURCE_SET_CHANGED', expected: manifest.authoritativeSourcePaths, current: expected.authoritativeSourcePaths });
  if (!stableEqual(manifest.inputPaths, expected.inputPaths)) reasons.push({ type: 'INPUT_PATH_SET_CHANGED', expected: manifest.inputPaths, current: expected.inputPaths });
  if (!stableEqual(manifest.outputPaths, expected.outputPaths)) reasons.push({ type: 'OUTPUT_PATH_SET_CHANGED', expected: manifest.outputPaths, current: expected.outputPaths });
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
    declaredSourceCount: expected.declaredSourcePaths.length,
    registryEntryCount: expected.registryEntryPaths.length,
    monitoredInputCount: expected.inputPaths.length,
    monitoredOutputCount: expected.outputPaths.length,
    staleReasonCount: reasons.length,
    reasons,
  };
};
