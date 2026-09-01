import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEFAULT_OWNER_MAP = 'tools/project-check/contracts/owners.v1.json';
export const DEFAULT_VALIDATOR_CATALOG = 'tools/project-check/contracts/validators.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export function normalizeRepositoryPath(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Invalid repository path: ${value}`);
  }
  return normalized;
}

export function assertRepositoryPath(repoRoot, relativePath) {
  const normalized = normalizeRepositoryPath(relativePath);
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, normalized);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Repository path escapes root: ${relativePath}`);
  }
  return absolute;
}

function regexEscape(character) {
  return /[\\^$+?.()|{}\[\]]/.test(character) ? `\\${character}` : character;
}

export function globToRegExp(pattern) {
  let source = '^';
  const text = normalizeRepositoryPath(pattern);
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (character === '*') {
      if (text[i + 1] === '*') {
        source += '.*';
        i += 1;
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += regexEscape(character);
    }
  }
  source += '$';
  return new RegExp(source);
}

export function pathMatchesPattern(filePath, pattern) {
  return globToRegExp(pattern).test(normalizeRepositoryPath(filePath));
}

function pathMatchesRule(filePath, rule) {
  const include = (rule.patterns ?? []).some(pattern => pathMatchesPattern(filePath, pattern));
  if (!include) return false;
  return !(rule.excludePatterns ?? []).some(pattern => pathMatchesPattern(filePath, pattern));
}

function duplicateIds(items = []) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    if (!item?.id) continue;
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates];
}

export function loadProjectCheckContracts({
  repoRoot = process.cwd(),
  ownerMapPath = DEFAULT_OWNER_MAP,
  validatorCatalogPath = DEFAULT_VALIDATOR_CATALOG,
} = {}) {
  const ownerMap = readJson(assertRepositoryPath(repoRoot, ownerMapPath));
  const validatorCatalog = readJson(assertRepositoryPath(repoRoot, validatorCatalogPath));
  validateProjectCheckContracts({ ownerMap, validatorCatalog });
  return { ownerMap, validatorCatalog };
}

export function validateProjectCheckContracts({ ownerMap, validatorCatalog }) {
  const failures = [];
  if (ownerMap?.schemaId !== 'project-check-owner-map/v1' || ownerMap.status !== 'DESIGN_FROZEN') {
    failures.push({ type: 'OWNER_MAP_INVALID', schemaId: ownerMap?.schemaId ?? null, status: ownerMap?.status ?? null });
  }
  if (validatorCatalog?.schemaId !== 'project-check-validator-catalog/v1' || validatorCatalog.status !== 'DESIGN_FROZEN') {
    failures.push({ type: 'VALIDATOR_CATALOG_INVALID', schemaId: validatorCatalog?.schemaId ?? null, status: validatorCatalog?.status ?? null });
  }
  for (const id of duplicateIds(ownerMap?.owners)) failures.push({ type: 'DUPLICATE_OWNER_ID', id });
  for (const id of duplicateIds(ownerMap?.pathRules)) failures.push({ type: 'DUPLICATE_PATH_RULE_ID', id });
  for (const id of duplicateIds(validatorCatalog?.validators)) failures.push({ type: 'DUPLICATE_VALIDATOR_ID', id });

  const owners = new Map((ownerMap?.owners ?? []).map(item => [item.id, item]));
  const validators = new Map((validatorCatalog?.validators ?? []).map(item => [item.id, item]));

  for (const rule of ownerMap?.pathRules ?? []) {
    if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) failures.push({ type: 'PATH_RULE_WITHOUT_PATTERNS', id: rule.id });
    if (!Array.isArray(rule.owners) || rule.owners.length === 0) failures.push({ type: 'PATH_RULE_WITHOUT_OWNERS', id: rule.id });
    for (const ownerId of rule.owners ?? []) {
      if (!owners.has(ownerId)) failures.push({ type: 'PATH_RULE_UNKNOWN_OWNER', ruleId: rule.id, ownerId });
    }
  }

  for (const owner of ownerMap?.owners ?? []) {
    for (const validatorId of owner.validators ?? []) {
      if (!validators.has(validatorId)) failures.push({ type: 'OWNER_UNKNOWN_VALIDATOR', ownerId: owner.id, validatorId });
    }
    if ((owner.validators ?? []).length === 0 && !owner.manualReview) {
      failures.push({ type: 'OWNER_WITHOUT_VALIDATOR_OR_MANUAL_BOUNDARY', ownerId: owner.id });
    }
  }

  for (const validator of validatorCatalog?.validators ?? []) {
    if (!['node', 'npm'].includes(validator.executable)) failures.push({ type: 'EXECUTABLE_NOT_ALLOWED', validatorId: validator.id, executable: validator.executable });
    if (!Number.isInteger(validator.phase)) failures.push({ type: 'VALIDATOR_PHASE_INVALID', validatorId: validator.id });
    if (!Array.isArray(validator.args) || validator.args.some(item => typeof item !== 'string')) failures.push({ type: 'VALIDATOR_ARGS_INVALID', validatorId: validator.id });
  }

  if (ownerMap?.policy?.ownerPropagation !== false) failures.push({ type: 'OWNER_PROPAGATION_MUST_BE_FALSE' });
  if (ownerMap?.policy?.changeClassFanOut !== false) failures.push({ type: 'CHANGE_CLASS_FANOUT_MUST_BE_FALSE' });
  if (validatorCatalog?.policy?.shellExecution !== false) failures.push({ type: 'SHELL_EXECUTION_MUST_BE_FALSE' });
  if (validatorCatalog?.policy?.legacyDoctorValidatorAllowed !== false) failures.push({ type: 'LEGACY_DOCTOR_VALIDATOR_MUST_BE_FALSE' });

  if (failures.length) throw new Error(`Project Check contract invalid: ${JSON.stringify(failures)}`);
  return { pass: true };
}

export function routeProjectCheckPaths(paths, { ownerMap, validatorCatalog }) {
  const normalizedPaths = [...new Set((paths ?? []).map(normalizeRepositoryPath))].sort();
  const ownersById = new Map(ownerMap.owners.map(item => [item.id, item]));
  const validatorsById = new Map(validatorCatalog.validators.map(item => [item.id, item]));
  const selectedValidatorIds = new Set();
  const selectedOwnerIds = new Set();
  const manualReviews = [];

  const files = normalizedPaths.map(filePath => {
    const matchedRules = ownerMap.pathRules.filter(rule => pathMatchesRule(filePath, rule));
    const ownerIds = [...new Set(matchedRules.flatMap(rule => rule.owners ?? []))].sort();
    if (ownerIds.length === 0) {
      manualReviews.push({ type: 'UNMATCHED_PATH', path: filePath, reason: 'No explicit Project Check owner rule matched this path.' });
      return { path: filePath, status: 'MANUAL_REVIEW', matchedRules: [], owners: [], validators: [] };
    }

    const validatorIds = new Set();
    const fileManual = [];
    for (const ownerId of ownerIds) {
      const owner = ownersById.get(ownerId);
      selectedOwnerIds.add(ownerId);
      for (const validatorId of owner.validators ?? []) {
        validatorIds.add(validatorId);
        selectedValidatorIds.add(validatorId);
      }
      if (owner.manualReview) {
        const review = { type: 'MANUAL_OWNER', path: filePath, ownerId, reason: owner.manualReview };
        manualReviews.push(review);
        fileManual.push(review);
      }
    }

    return {
      path: filePath,
      status: fileManual.length ? 'MANUAL_REVIEW' : 'MAPPED',
      matchedRules: matchedRules.map(rule => rule.id),
      owners: ownerIds,
      validators: [...validatorIds].sort(),
    };
  });

  const validators = [...selectedValidatorIds]
    .map(id => validatorsById.get(id))
    .sort((a, b) => a.phase - b.phase || a.id.localeCompare(b.id));

  return {
    version: 1,
    schemaId: 'project-check-route/v1',
    status: normalizedPaths.length === 0 ? 'NO_CHANGES' : manualReviews.length ? 'MANUAL_REVIEW' : 'PLAN_READY',
    changedFileCount: normalizedPaths.length,
    ownerCount: selectedOwnerIds.size,
    validatorCount: validators.length,
    files,
    owners: [...selectedOwnerIds].sort(),
    validators,
    manualReviews,
    boundaries: {
      ownerPropagationCount: 0,
      changeClassFanOutCount: 0,
      semanticRecomputationCount: 0,
      statusSourceMutationCount: 0,
      projectStatusMutationCount: 0,
    },
  };
}

export function preflightProjectCheck({ repoRoot = process.cwd(), validators = [] } = {}) {
  const failures = [];
  let packageJson = null;
  for (const validator of validators) {
    if (!['node', 'npm'].includes(validator.executable)) {
      failures.push({ type: 'EXECUTABLE_NOT_ALLOWED', validatorId: validator.id, executable: validator.executable });
      continue;
    }
    if (validator.executable === 'node') {
      const script = validator.args?.[0];
      if (!script || !fs.existsSync(assertRepositoryPath(repoRoot, script))) {
        failures.push({ type: 'NODE_SCRIPT_MISSING', validatorId: validator.id, script: script ?? null });
      }
    }
    if (validator.executable === 'npm') {
      if (validator.args?.length !== 2 || validator.args[0] !== 'run') {
        failures.push({ type: 'NPM_ARGV_INVALID', validatorId: validator.id, args: validator.args });
        continue;
      }
      packageJson ??= readJson(assertRepositoryPath(repoRoot, 'package.json'));
      const scriptName = validator.args[1];
      if (typeof packageJson.scripts?.[scriptName] !== 'string') {
        failures.push({ type: 'PACKAGE_SCRIPT_MISSING', validatorId: validator.id, scriptName });
      }
    }
  }
  return { pass: failures.length === 0, failures };
}

export function defaultValidatorExecutor(validator, { repoRoot = process.cwd(), stdio = 'inherit' } = {}) {
  const result = spawnSync(validator.executable, validator.args, {
    cwd: repoRoot,
    stdio,
    shell: false,
    env: process.env,
  });
  if (result.error) {
    return { validatorId: validator.id, exitCode: 2, signal: null, error: result.error.message };
  }
  return {
    validatorId: validator.id,
    exitCode: Number.isInteger(result.status) ? result.status : 2,
    signal: result.signal ?? null,
  };
}

export function executeProjectCheck(paths, runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const contracts = runtime.contracts ?? loadProjectCheckContracts({ repoRoot });
  const route = routeProjectCheckPaths(paths, contracts);

  if (route.status === 'NO_CHANGES') {
    return {
      version: 1,
      schemaId: 'project-check-result/v1',
      status: 'NO_CHANGES',
      completion: 'COMPLETE',
      exitCode: 0,
      route,
      preflight: { pass: true, failures: [] },
      executions: [],
    };
  }

  const preflight = runtime.preflight ?? preflightProjectCheck({ repoRoot, validators: route.validators });
  if (!preflight.pass) {
    return {
      version: 1,
      schemaId: 'project-check-result/v1',
      status: 'BLOCKER',
      completion: 'BLOCKED_PREFLIGHT',
      exitCode: 2,
      route,
      preflight,
      executions: [],
    };
  }

  if (runtime.planOnly === true) {
    return {
      version: 1,
      schemaId: 'project-check-result/v1',
      status: route.status === 'MANUAL_REVIEW' ? 'REVIEW' : 'PASS',
      completion: 'PLAN_ONLY',
      exitCode: route.status === 'MANUAL_REVIEW' ? 3 : 0,
      route,
      preflight,
      executions: [],
    };
  }

  const executor = runtime.executor ?? ((validator) => defaultValidatorExecutor(validator, { repoRoot }));
  const executions = [];
  for (const validator of route.validators) {
    const execution = executor(validator);
    executions.push(execution);
    if (execution.exitCode !== 0) {
      return {
        version: 1,
        schemaId: 'project-check-result/v1',
        status: 'BLOCKER',
        completion: 'BLOCKED_VALIDATOR',
        exitCode: 2,
        failedValidatorId: validator.id,
        route,
        preflight,
        executions,
      };
    }
  }

  const review = route.status === 'MANUAL_REVIEW';
  return {
    version: 1,
    schemaId: 'project-check-result/v1',
    status: review ? 'REVIEW' : 'PASS',
    completion: 'COMPLETE',
    exitCode: review ? 3 : 0,
    route,
    preflight,
    executions,
    boundaries: {
      legacyProjectDoctorRuntimeImports: 0,
      legacyD2RuntimeDependencies: 0,
      legacyD3RuntimeDependencies: 0,
      legacyD4RuntimeDependencies: 0,
      legacyD5RuntimeDependencies: 0,
      legacyD7RuntimeDependencies: 0,
      freshnessResealCount: 0,
      statusSourceMutationCount: 0,
      projectStatusNormalizationCount: 0,
    },
  };
}

export function collectChangedPaths({ repoRoot = process.cwd(), base, head = 'HEAD' } = {}) {
  if (!base) throw new Error('base is required for compare mode.');
  const comparison = `${base}...${head}`;
  const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', comparison], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`git diff failed (${comparison}): ${String(result.stderr ?? '').trim()}`);
  }
  return String(result.stdout ?? '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(normalizeRepositoryPath);
}
