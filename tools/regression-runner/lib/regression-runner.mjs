import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEFAULT_PROFILES = 'tools/regression-runner/contracts/profiles.v1.json';
export const DEFAULT_VALIDATOR_CATALOG = 'tools/project-check/contracts/validators.v1.json';
export const DEFAULT_PROFILE_ID = 'core-regression-v1';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

function repositoryPath(repoRoot, relativePath) {
  const text = String(relativePath ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!text || text.startsWith('/') || text === '..' || text.startsWith('../') || text.includes('/../')) {
    throw new Error(`Invalid repository path: ${relativePath}`);
  }
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, text);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Repository path escapes root: ${relativePath}`);
  }
  return absolute;
}

function duplicateValues(values = []) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function validateRegressionRunnerContracts({ profilesContract, validatorCatalog }) {
  const failures = [];
  if (profilesContract?.schemaId !== 'regression-runner-profiles/v1' || profilesContract?.status !== 'DESIGN_FROZEN') {
    failures.push({ type: 'PROFILES_CONTRACT_INVALID', schemaId: profilesContract?.schemaId ?? null, status: profilesContract?.status ?? null });
  }
  if (validatorCatalog?.schemaId !== 'project-check-validator-catalog/v1' || validatorCatalog?.status !== 'DESIGN_FROZEN') {
    failures.push({ type: 'VALIDATOR_CATALOG_INVALID', schemaId: validatorCatalog?.schemaId ?? null, status: validatorCatalog?.status ?? null });
  }
  if (profilesContract?.validatorCatalog !== DEFAULT_VALIDATOR_CATALOG) {
    failures.push({ type: 'VALIDATOR_CATALOG_PATH_INVALID', value: profilesContract?.validatorCatalog ?? null });
  }

  const catalogPolicy = validatorCatalog?.policy ?? {};
  if (catalogPolicy.shellExecution !== false) failures.push({ type: 'CATALOG_SHELL_EXECUTION_MUST_BE_FALSE' });
  if (catalogPolicy.commandsMustBeCatalogued !== true) failures.push({ type: 'CATALOG_COMMAND_AUTHORITY_REQUIRED' });
  if (catalogPolicy.legacyDoctorValidatorAllowed !== false) failures.push({ type: 'LEGACY_DOCTOR_VALIDATOR_MUST_BE_FALSE' });
  if (catalogPolicy.legacyD2D3D4D5D7Allowed !== false) failures.push({ type: 'LEGACY_D2_D7_MUST_BE_FALSE' });

  const validators = Array.isArray(validatorCatalog?.validators) ? validatorCatalog.validators : [];
  const validatorIds = validators.map(item => item?.id).filter(Boolean);
  for (const id of duplicateValues(validatorIds)) failures.push({ type: 'DUPLICATE_CATALOG_VALIDATOR_ID', id });
  const validatorsById = new Map(validators.map(item => [item.id, item]));

  const profiles = Array.isArray(profilesContract?.profiles) ? profilesContract.profiles : [];
  for (const id of duplicateValues(profiles.map(item => item?.id).filter(Boolean))) failures.push({ type: 'DUPLICATE_PROFILE_ID', id });
  for (const profile of profiles) {
    const selectedIds = Array.isArray(profile?.validatorIds) ? profile.validatorIds : [];
    if (!profile?.id || selectedIds.length === 0) failures.push({ type: 'PROFILE_INVALID', profileId: profile?.id ?? null });
    for (const id of duplicateValues(selectedIds)) failures.push({ type: 'DUPLICATE_PROFILE_VALIDATOR_ID', profileId: profile?.id ?? null, validatorId: id });
    for (const validatorId of selectedIds) {
      if (!validatorsById.has(validatorId)) failures.push({ type: 'UNKNOWN_PROFILE_VALIDATOR_ID', profileId: profile?.id ?? null, validatorId });
    }
    for (const forbiddenKey of ['executable', 'args', 'command', 'commands', 'script', 'scripts']) {
      if (Object.hasOwn(profile ?? {}, forbiddenKey)) failures.push({ type: 'PROFILE_COMMAND_METADATA_FORBIDDEN', profileId: profile?.id ?? null, key: forbiddenKey });
    }
  }

  const policy = profilesContract?.policy ?? {};
  if (policy.profileCarriesExecutableOrArgs !== false) failures.push({ type: 'PROFILE_COMMAND_METADATA_POLICY_INVALID' });
  if (policy.automaticCoverageExpansion !== false) failures.push({ type: 'AUTOMATIC_COVERAGE_EXPANSION_MUST_BE_FALSE' });
  if (policy.legacyProjectDoctorRuntimeAllowed !== false) failures.push({ type: 'LEGACY_PROJECT_DOCTOR_RUNTIME_MUST_BE_FALSE' });
  if (policy.legacyRegressionAdmissionAuditReimplemented !== false) failures.push({ type: 'LEGACY_ADMISSION_REIMPLEMENTATION_MUST_BE_FALSE' });

  if (failures.length) throw new Error(`Regression Runner contract invalid: ${JSON.stringify(failures)}`);
  return { pass: true };
}

export function loadRegressionRunnerContracts({
  repoRoot = process.cwd(),
  profilesPath = DEFAULT_PROFILES,
  validatorCatalogPath = DEFAULT_VALIDATOR_CATALOG,
} = {}) {
  const profilesContract = readJson(repositoryPath(repoRoot, profilesPath));
  const validatorCatalog = readJson(repositoryPath(repoRoot, validatorCatalogPath));
  validateRegressionRunnerContracts({ profilesContract, validatorCatalog });
  return { profilesContract, validatorCatalog };
}

export function planRegressionRun({ profileId = DEFAULT_PROFILE_ID, contracts } = {}) {
  if (!contracts) throw new Error('contracts are required');
  validateRegressionRunnerContracts(contracts);
  const profile = contracts.profilesContract.profiles.find(item => item.id === profileId);
  if (!profile) throw new Error(`Unknown regression profile: ${profileId}`);
  const validatorsById = new Map(contracts.validatorCatalog.validators.map(item => [item.id, item]));
  const validators = profile.validatorIds
    .map(id => validatorsById.get(id))
    .sort((a, b) => a.phase - b.phase || a.id.localeCompare(b.id));
  return {
    version: 1,
    schemaId: 'regression-runner-plan/v1',
    status: 'PLAN_READY',
    profileId,
    validatorCount: validators.length,
    validatorIds: validators.map(item => item.id),
    validators: validators.map(item => ({
      id: item.id,
      phase: item.phase,
      executable: item.executable,
      args: [...item.args],
      owner: item.owner,
    })),
    authority: DEFAULT_VALIDATOR_CATALOG,
  };
}

export function preflightRegressionRun({ repoRoot = process.cwd(), plan } = {}) {
  if (!plan) throw new Error('plan is required');
  const failures = [];
  let packageJson = null;
  for (const validator of plan.validators) {
    if (!['node', 'npm'].includes(validator.executable)) {
      failures.push({ type: 'EXECUTABLE_NOT_ALLOWED', validatorId: validator.id, executable: validator.executable });
      continue;
    }
    if (validator.executable === 'node') {
      const script = validator.args?.[0];
      if (!script || !fs.existsSync(repositoryPath(repoRoot, script))) {
        failures.push({ type: 'NODE_SCRIPT_MISSING', validatorId: validator.id, script: script ?? null });
      }
    }
    if (validator.executable === 'npm') {
      if (validator.args?.length !== 2 || validator.args[0] !== 'run') {
        failures.push({ type: 'NPM_ARGV_INVALID', validatorId: validator.id, args: validator.args });
        continue;
      }
      packageJson ??= readJson(repositoryPath(repoRoot, 'package.json'));
      const scriptName = validator.args[1];
      if (typeof packageJson.scripts?.[scriptName] !== 'string') {
        failures.push({ type: 'PACKAGE_SCRIPT_MISSING', validatorId: validator.id, scriptName });
      }
    }
  }
  return { pass: failures.length === 0, failures };
}

export function snapshotTrackedState({ repoRoot = process.cwd() } = {}) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) throw new Error(`git status failed: ${String(result.stderr ?? '').trim()}`);
  return String(result.stdout ?? '')
    .split(/\r?\n/)
    .map(item => item.trimEnd())
    .filter(Boolean)
    .sort();
}

export function defaultRegressionValidatorExecutor(validator, { repoRoot = process.cwd(), stdio = 'inherit' } = {}) {
  const result = spawnSync(validator.executable, validator.args, {
    cwd: repoRoot,
    stdio,
    shell: false,
    env: process.env,
  });
  if (result.error) return { validatorId: validator.id, exitCode: 2, signal: null, error: result.error.message };
  return {
    validatorId: validator.id,
    exitCode: Number.isInteger(result.status) ? result.status : 2,
    signal: result.signal ?? null,
  };
}

function sameTrackedState(before, after) {
  return JSON.stringify(before) === JSON.stringify(after);
}

export function executeRegressionRun(runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const contracts = runtime.contracts ?? loadRegressionRunnerContracts({ repoRoot });
  const plan = runtime.plan ?? planRegressionRun({ profileId: runtime.profileId ?? DEFAULT_PROFILE_ID, contracts });
  const preflight = runtime.preflight ?? preflightRegressionRun({ repoRoot, plan });
  if (!preflight.pass) {
    return {
      version: 1,
      schemaId: 'regression-runner-result/v1',
      status: 'BLOCKER',
      completion: 'BLOCKED_PREFLIGHT',
      exitCode: 2,
      plan,
      preflight,
      executions: [],
    };
  }
  if (runtime.planOnly === true) {
    return {
      version: 1,
      schemaId: 'regression-runner-result/v1',
      status: 'PASS',
      completion: 'PLAN_ONLY',
      exitCode: 0,
      plan,
      preflight,
      executions: [],
    };
  }

  const snapshot = runtime.snapshotTrackedState ?? (() => snapshotTrackedState({ repoRoot }));
  const executor = runtime.executor ?? (validator => defaultRegressionValidatorExecutor(validator, { repoRoot }));
  const before = snapshot();
  const executions = [];

  for (const validator of plan.validators) {
    const execution = executor(validator);
    executions.push(execution);
    const after = snapshot();
    if (!sameTrackedState(before, after)) {
      return {
        version: 1,
        schemaId: 'regression-runner-result/v1',
        status: 'BLOCKER',
        completion: 'BLOCKED_TRACKED_MUTATION',
        exitCode: 2,
        failedValidatorId: validator.id,
        plan,
        preflight,
        executions,
        trackedState: { before, after },
      };
    }
    if (execution.exitCode !== 0) {
      return {
        version: 1,
        schemaId: 'regression-runner-result/v1',
        status: 'BLOCKER',
        completion: 'BLOCKED_VALIDATOR',
        exitCode: 2,
        failedValidatorId: validator.id,
        plan,
        preflight,
        executions,
      };
    }
  }

  return {
    version: 1,
    schemaId: 'regression-runner-result/v1',
    status: 'PASS',
    completion: 'COMPLETE',
    exitCode: 0,
    plan,
    preflight,
    executions,
    boundaries: {
      semanticRecomputationCount: 0,
      canonicalWriteCount: 0,
      frozenWriteCount: 0,
      generatedDomainWriteCount: 0,
      statusSourceMutationCount: 0,
      projectStatusMutationCount: 0,
      legacyProjectDoctorRuntimeDependencyCount: 0,
      legacyRegressionAdmissionAuditCount: 0,
    },
  };
}
