import fs from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_SOURCE_PREFIXES,
  STATUS_SOURCE_DECLARATION_SCHEMA,
  assertRepositoryPath,
  getJsonPointer,
  loadStatusSourceEntries,
  resolveActiveSources,
  selectActiveSources,
} from './select-active-sources.mjs';

export const DEFAULT_PROMOTION_COMPATIBILITY = 'tools/status-source/contracts/promotion-compatibility.v1.json';
const PROMOTION_STAGE = 'R1-2';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(Object(value), key);

function readRepoJson(repoRoot, relativePath) {
  return readJson(assertRepositoryPath(repoRoot, relativePath));
}

function safeEntryToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function outputFileFor(declarationDir, domain, id) {
  return path.posix.join(declarationDir.replaceAll('\\', '/'), `promotion.${domain}.${id}.v1.json`);
}

function assertAllowedSourcePath(sourcePath) {
  if (!ALLOWED_SOURCE_PREFIXES.some(prefix => sourcePath?.startsWith(prefix))) {
    throw new Error(`Status source path is outside allowed prefixes: ${sourcePath}`);
  }
}

function validateProjectionOverride(override, compatibilityContract) {
  if (override === undefined) return;
  if (!isObject(override)) throw new Error('Projection override must be a JSON object.');
  const allowed = new Set(compatibilityContract.policy?.projectionOverrideAllowedKeys ?? []);
  for (const key of Object.keys(override)) {
    if (!allowed.has(key)) throw new Error(`Projection override key is not allowed: ${key}`);
  }
}

function mergeCompatibilityGuard(baseline, override) {
  return {
    ...clone(baseline),
    ...(override === undefined ? {} : clone(override)),
  };
}

function selectValues(source, selectors = {}) {
  return Object.fromEntries(
    Object.entries(selectors).map(([key, pointer]) => [key, getJsonPointer(source, pointer)]),
  );
}

function expectedValueForKey(expectedKey, primarySelected, supplements) {
  if (primarySelected[expectedKey] !== undefined) return primarySelected[expectedKey];
  for (const supplement of supplements) {
    if (supplement.selected[expectedKey] !== undefined) return supplement.selected[expectedKey];
  }
  const stageMatch = expectedKey.match(/^stage(\d+)(.+)$/i);
  if (!stageMatch) return undefined;
  const digits = stageMatch[1];
  const stageTokens = [`stage${digits}`];
  if (digits.length === 2) stageTokens.push(`stage${digits[0]}_${digits[1]}`, `stage${digits[0]}-${digits[1]}`);
  const selectorKey = stageMatch[2].charAt(0).toLowerCase() + stageMatch[2].slice(1);
  const supplement = supplements.find(item => stageTokens.some(token => item.role.toLowerCase().includes(token.toLowerCase())));
  return supplement?.selected?.[selectorKey];
}

export function loadPromotionCompatibility({ repoRoot = process.cwd(), contractPath = DEFAULT_PROMOTION_COMPATIBILITY } = {}) {
  const contract = readRepoJson(repoRoot, contractPath);
  if (contract?.schemaId !== 'status-source-promotion-compatibility/v1') {
    throw new Error(`Unsupported promotion compatibility schema: ${contract?.schemaId ?? 'missing'}`);
  }
  if (contract.status !== 'DESIGN_FROZEN') throw new Error(`Promotion compatibility contract is not frozen: ${contract.status}`);
  return contract;
}

export function preflightPromotionCompatibility({
  repoRoot = process.cwd(),
  domain,
  sourcePath,
  projectionOverride,
  compatibilityContract,
} = {}) {
  const contract = compatibilityContract ?? loadPromotionCompatibility({ repoRoot });
  const baseline = contract.domains?.[domain];
  if (!baseline) {
    return { pass: false, failures: [{ type: 'PROMOTION_COMPATIBILITY_DOMAIN_MISSING', domain }] };
  }
  validateProjectionOverride(projectionOverride, contract);
  const effective = mergeCompatibilityGuard(baseline, projectionOverride);
  const failures = [];
  let primary;
  try {
    primary = readRepoJson(repoRoot, sourcePath);
  } catch (error) {
    return {
      pass: false,
      failures: [{ type: 'PRIMARY_SOURCE_UNREADABLE', sourcePath, error: error instanceof Error ? error.message : String(error) }],
    };
  }

  const primarySelected = selectValues(primary, effective.requiredSelectors);
  for (const [key, value] of Object.entries(primarySelected)) {
    if (value === undefined) failures.push({ type: 'PRIMARY_SELECTOR_MISSING', key, pointer: effective.requiredSelectors[key] });
  }

  const supplements = [];
  for (const supplementalSpec of effective.supplementalSources ?? []) {
    try {
      const source = readRepoJson(repoRoot, supplementalSpec.path);
      const selected = selectValues(source, supplementalSpec.selectors);
      for (const [key, value] of Object.entries(selected)) {
        if (value === undefined) failures.push({ type: 'SUPPLEMENTAL_SELECTOR_MISSING', sourcePath: supplementalSpec.path, key, pointer: supplementalSpec.selectors[key] });
      }
      supplements.push({ role: supplementalSpec.role ?? '', selected });
    } catch (error) {
      failures.push({ type: 'SUPPLEMENTAL_SOURCE_UNREADABLE', sourcePath: supplementalSpec.path, error: error instanceof Error ? error.message : String(error) });
      supplements.push({ role: supplementalSpec.role ?? '', selected: {} });
    }
  }

  for (const [key, expected] of Object.entries(effective.expected ?? {})) {
    const actual = expectedValueForKey(key, primarySelected, supplements);
    if (actual === undefined) failures.push({ type: 'EXPECTED_VALUE_MISSING', key, expected });
    else if (!Object.is(actual, expected)) failures.push({ type: 'EXPECTED_VALUE_MISMATCH', key, expected, actual });
  }

  for (const pointer of effective.zeroRequiredSelectors ?? []) {
    const value = getJsonPointer(primary, pointer);
    if (value === undefined) failures.push({ type: 'ZERO_REQUIRED_SELECTOR_MISSING', pointer });
    else if (!Object.is(value, 0)) failures.push({ type: 'ZERO_REQUIRED_SELECTOR_NONZERO', pointer, value });
  }

  const rawStatus = primarySelected.rawStatus;
  const acceptedStatus = typeof rawStatus === 'string'
    && (rawStatus.toUpperCase().startsWith('PASS') || rawStatus === 'READY_FOR_ASSET_EVIDENCE');
  if (!acceptedStatus) failures.push({ type: 'PRIMARY_STATUS_NOT_ACCEPTED', rawStatus });

  if (typeof primarySelected.hardErrorCount === 'number' && primarySelected.hardErrorCount > 0) {
    failures.push({ type: 'HARD_ERROR_COUNT_NONZERO', value: primarySelected.hardErrorCount });
  }
  if (Array.isArray(primarySelected.errors) && primarySelected.errors.length > 0) {
    failures.push({ type: 'ERROR_ARRAY_NONEMPTY', count: primarySelected.errors.length });
  }
  for (const [key, value] of Object.entries(primarySelected)) {
    if (/failedCheckCount/i.test(key) && typeof value === 'number' && value > 0) {
      failures.push({ type: 'FAILED_CHECK_COUNT_NONZERO', key, value });
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    selected: primarySelected,
    effectiveExpected: clone(effective.expected ?? {}),
    supplementalSourceCount: (effective.supplementalSources ?? []).length,
  };
}

function explicitAdmissionFrom(options) {
  return [...(options.equals ?? []), ...(options.in ?? [])];
}

function projectionOverrideFrom(repoRoot, predecessor, options, compatibilityContract) {
  if (options.projectionFile) {
    const value = readRepoJson(repoRoot, options.projectionFile);
    validateProjectionOverride(value, compatibilityContract);
    return clone(value);
  }
  const inherited = predecessor.projectionOverride === undefined ? undefined : clone(predecessor.projectionOverride);
  validateProjectionOverride(inherited, compatibilityContract);
  return inherited;
}

function writePromotionFile(repoRoot, outputPath, entry) {
  const persisted = clone(entry);
  delete persisted.sourceEntryFile;
  const absolute = assertRepositoryPath(repoRoot, outputPath);
  fs.writeFileSync(absolute, `${JSON.stringify({
    version: 1,
    schemaId: STATUS_SOURCE_DECLARATION_SCHEMA,
    stage: PROMOTION_STAGE,
    entry: persisted,
  }, null, 2)}\n`);
}

export function promoteStatusSource(options, runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const declarationDir = runtime.declarationDir ?? 'data/status-sources';
  const compatibilityContract = runtime.compatibilityContract
    ?? loadPromotionCompatibility({ repoRoot, contractPath: runtime.compatibilityContractPath ?? DEFAULT_PROMOTION_COMPATIBILITY });

  if (!options?.domain || !options?.id || !options?.sourcePath) throw new Error('--domain, --id, and --source are required.');
  if (!safeEntryToken(options.id)) throw new Error(`Unsafe entry id: ${options.id}`);
  assertAllowedSourcePath(options.sourcePath);
  const sourceAbsolute = assertRepositoryPath(repoRoot, options.sourcePath);
  if (!fs.existsSync(sourceAbsolute)) throw new Error(`Source file does not exist: ${options.sourcePath}`);

  const currentSelection = selectActiveSources({ repoRoot, declarationDir });
  if (currentSelection.status !== 'PASS') throw new Error(`Current Status Source selection is blocked: ${currentSelection.status}`);
  const activeMeta = currentSelection.domains?.[options.domain];
  if (!activeMeta) throw new Error(`Unknown Status Source domain: ${options.domain}`);

  const { declarationFiles, entries } = loadStatusSourceEntries({ repoRoot, declarationDir });
  const existingById = entries.find(entry => entry.id === options.id);
  const activeEntry = entries.find(entry => entry.id === activeMeta.selectedId);
  if (!activeEntry) throw new Error(`Current selected entry declaration not found: ${activeMeta.selectedId}`);

  if (activeMeta.selectedId === options.id) {
    if (!existingById || existingById.domain !== options.domain || existingById.sourcePath !== options.sourcePath) {
      throw new Error(`Requested id is already active with a different declaration: ${options.id}`);
    }
    const compatibility = preflightPromotionCompatibility({
      repoRoot,
      domain: options.domain,
      sourcePath: options.sourcePath,
      projectionOverride: existingById.projectionOverride,
      compatibilityContract,
    });
    if (!compatibility.pass) throw new Error(`Already-active source fails promotion compatibility: ${JSON.stringify(compatibility.failures)}`);
    return {
      status: 'PASS_STATUS_SOURCE_PROMOTION_ALREADY_ACTIVE',
      completion: 'COMPLETE',
      mode: options.apply ? 'APPLY' : 'CHECK',
      writePerformed: false,
      alreadyActive: true,
      domain: options.domain,
      selectedId: options.id,
      sourcePath: options.sourcePath,
      outputPath: existingById.sourceEntryFile,
      compatibility,
      boundaries: promotionBoundaries(),
    };
  }
  if (existingById) throw new Error(`Entry id already exists but is not active: ${options.id}`);

  const explicitAdmission = explicitAdmissionFrom(options);
  const admission = explicitAdmission.length > 0 ? clone(explicitAdmission) : clone(activeEntry.admission);
  if (!Array.isArray(admission) || admission.length === 0) throw new Error('Promotion admission cannot be empty.');
  const projectionOverride = projectionOverrideFrom(repoRoot, activeEntry, options, compatibilityContract);
  const outputPath = outputFileFor(declarationDir, options.domain, options.id);
  const outputAbsolute = assertRepositoryPath(repoRoot, outputPath);
  if (fs.existsSync(outputAbsolute)) throw new Error(`Promotion output already exists: ${outputPath}`);

  const entry = {
    id: options.id,
    domain: options.domain,
    state: 'APPROVED',
    sourcePath: options.sourcePath,
    facet: options.facet ?? activeEntry.facet ?? activeMeta.facet ?? null,
    successorOf: activeMeta.selectedId,
    admission,
    ...(projectionOverride === undefined ? {} : { projectionOverride }),
    note: options.note ?? `R1-2 guarded promotion from ${activeMeta.selectedId}.`,
    sourceEntryFile: outputPath,
  };

  const candidateSelection = resolveActiveSources({
    repoRoot,
    entries: [...entries, entry],
    declarationFiles: [...declarationFiles, outputPath].sort(),
  });
  if (candidateSelection.status !== 'PASS') throw new Error(`Candidate Status Source selection is blocked: ${candidateSelection.status}`);
  if (candidateSelection.domains?.[options.domain]?.selectedId !== options.id) {
    throw new Error(`Candidate was not selected as terminal active source for ${options.domain}.`);
  }

  const compatibility = preflightPromotionCompatibility({
    repoRoot,
    domain: options.domain,
    sourcePath: options.sourcePath,
    projectionOverride,
    compatibilityContract,
  });
  if (!compatibility.pass) throw new Error(`Candidate fails promotion compatibility: ${JSON.stringify(compatibility.failures)}`);

  const summary = {
    status: options.apply ? 'PASS_STATUS_SOURCE_PROMOTION_APPLY' : 'PASS_STATUS_SOURCE_PROMOTION_CHECK',
    completion: 'COMPLETE',
    mode: options.apply ? 'APPLY' : 'CHECK',
    writePerformed: Boolean(options.apply),
    alreadyActive: false,
    domain: options.domain,
    predecessorId: activeMeta.selectedId,
    selectedId: options.id,
    sourcePath: options.sourcePath,
    outputPath,
    admissionMode: explicitAdmission.length > 0 ? 'EXPLICIT' : 'INHERITED',
    projectionMode: options.projectionFile ? 'EXPLICIT_FILE' : (activeEntry.projectionOverride === undefined ? 'BASELINE_COMPATIBILITY' : 'INHERITED'),
    compatibility,
    boundaries: promotionBoundaries(),
  };

  if (!options.apply) return summary;

  writePromotionFile(repoRoot, outputPath, entry);
  try {
    const postWriteSelection = selectActiveSources({ repoRoot, declarationDir });
    if (postWriteSelection.domains?.[options.domain]?.selectedId !== options.id) {
      throw new Error(`Post-write selection did not select ${options.id}.`);
    }
    const postWriteCompatibility = preflightPromotionCompatibility({
      repoRoot,
      domain: options.domain,
      sourcePath: options.sourcePath,
      projectionOverride,
      compatibilityContract,
    });
    if (!postWriteCompatibility.pass) {
      throw new Error(`Post-write compatibility failed: ${JSON.stringify(postWriteCompatibility.failures)}`);
    }
    if (typeof runtime.postWriteHook === 'function') runtime.postWriteHook({ summary, postWriteSelection, postWriteCompatibility });
    return summary;
  } catch (error) {
    if (fs.existsSync(outputAbsolute)) fs.unlinkSync(outputAbsolute);
    let rollbackFailure = null;
    try {
      const rollbackSelection = selectActiveSources({ repoRoot, declarationDir });
      if (rollbackSelection.domains?.[options.domain]?.selectedId !== activeMeta.selectedId) {
        throw new Error(`Rollback selection is ${rollbackSelection.domains?.[options.domain]?.selectedId ?? 'missing'}, expected ${activeMeta.selectedId}.`);
      }
    } catch (rollbackError) {
      rollbackFailure = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
    }
    const original = error instanceof Error ? error.message : String(error);
    if (rollbackFailure) throw new Error(`Promotion apply failed: ${original}; rollback validation failed: ${rollbackFailure}`);
    throw new Error(`Promotion apply failed and declaration was rolled back: ${original}`);
  }
}

function promotionBoundaries() {
  return {
    legacyProjectDoctorRuntimeImports: 0,
    legacyGeneratedStatusDependencies: 0,
    d1RuntimeDependencies: 0,
    d2RuntimeDependencies: 0,
    d3RuntimeDependencies: 0,
    d4RuntimeDependencies: 0,
    d5RuntimeDependencies: 0,
    d7RuntimeDependencies: 0,
    rawConfigDataReadCount: 0,
    semanticRecomputationCount: 0,
    canonicalJoinRecomputationCount: 0,
    domainValidatorExecutionCount: 0,
    projectStatusWriteCount: 0,
    legacyGeneratedWriteCount: 0,
    statusSourceDeclarationWriteCount: 1,
  };
}

export function parseScalar(raw) {
  const text = String(raw).trim();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function parseAdmissionAssignment(raw, mode) {
  const index = String(raw).indexOf('=');
  if (index <= 0) throw new Error(`${mode} requires /json/pointer=value`);
  const pointer = String(raw).slice(0, index);
  const rhs = String(raw).slice(index + 1);
  if (!pointer.startsWith('/')) throw new Error(`${mode} pointer must start with /: ${pointer}`);
  if (mode === '--equals') return { pointer, equals: parseScalar(rhs) };
  const values = rhs.trim().startsWith('[')
    ? parseScalar(rhs)
    : rhs.split(',').map(item => parseScalar(item));
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${mode} requires one or more values`);
  return { pointer, in: values };
}
