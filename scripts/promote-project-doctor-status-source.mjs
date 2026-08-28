import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildRegistry,
  resolveRegistry,
  jsonPointer,
} from './build-project-doctor-active-source-registry.mjs';

const PROMOTION_CONTRACT = 'data/contracts/project-doctor-status-source-promotion.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const parseScalar = raw => {
  const text = String(raw).trim();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const parseAssignment = (raw, mode) => {
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
};

export const parsePromotionArgs = argv => {
  const options = { equals: [], in: [], check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      options.check = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    const needsValue = new Set(['--domain', '--id', '--source', '--facet', '--equals', '--in', '--projection-file', '--note']);
    if (!needsValue.has(arg)) throw new Error(`Unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${arg}`);
    index += 1;
    if (arg === '--domain') options.domain = value;
    else if (arg === '--id') options.id = value;
    else if (arg === '--source') options.sourcePath = value;
    else if (arg === '--facet') options.facet = value;
    else if (arg === '--equals') options.equals.push(parseAssignment(value, arg));
    else if (arg === '--in') options.in.push(parseAssignment(value, arg));
    else if (arg === '--projection-file') options.projectionFile = value;
    else if (arg === '--note') options.note = value;
  }
  return options;
};

const loadEntries = entryDirectory => {
  if (!fs.existsSync(entryDirectory)) throw new Error(`Entry directory missing: ${entryDirectory}`);
  const files = fs.readdirSync(entryDirectory)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => path.posix.join(entryDirectory.replaceAll('\\', '/'), name));
  const entries = [];
  for (const file of files) {
    const parsed = readJson(file);
    const rows = Array.isArray(parsed.entries) ? parsed.entries : parsed.entry ? [parsed.entry] : [];
    if (rows.length === 0) throw new Error(`Status source file has no entries: ${file}`);
    for (const row of rows) entries.push({ ...row, sourceEntryFile: file });
  }
  return { files, entries };
};

const selectValues = (source, selectors = {}) => Object.fromEntries(
  Object.entries(selectors).map(([key, pointer]) => [key, jsonPointer(source, pointer)]),
);

const expectedValueForKey = (expectedKey, primarySelected, supplements) => {
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
};

export const preflightEffectiveDomain = spec => {
  const failures = [];
  let primary;
  try {
    primary = readJson(spec.primaryStatusSource);
  } catch (error) {
    return {
      pass: false,
      failures: [{ type: 'PRIMARY_SOURCE_UNREADABLE', sourcePath: spec.primaryStatusSource, error: error instanceof Error ? error.message : String(error) }],
    };
  }

  const primarySelected = selectValues(primary, spec.requiredSelectors);
  for (const [key, value] of Object.entries(primarySelected)) {
    if (value === undefined) failures.push({ type: 'PRIMARY_SELECTOR_MISSING', key, pointer: spec.requiredSelectors[key] });
  }

  const supplements = [];
  for (const supplementalSpec of spec.supplementalSources ?? []) {
    try {
      const source = readJson(supplementalSpec.path);
      const selected = selectValues(source, supplementalSpec.selectors);
      for (const [key, value] of Object.entries(selected)) {
        if (value === undefined) failures.push({ type: 'SUPPLEMENTAL_SELECTOR_MISSING', sourcePath: supplementalSpec.path, key, pointer: supplementalSpec.selectors[key] });
      }
      supplements.push({ role: supplementalSpec.role, selected });
    } catch (error) {
      failures.push({ type: 'SUPPLEMENTAL_SOURCE_UNREADABLE', sourcePath: supplementalSpec.path, error: error instanceof Error ? error.message : String(error) });
      supplements.push({ role: supplementalSpec.role, selected: {} });
    }
  }

  for (const [key, expected] of Object.entries(spec.expected ?? {})) {
    const actual = expectedValueForKey(key, primarySelected, supplements);
    if (actual === undefined) failures.push({ type: 'EXPECTED_VALUE_MISSING', key, expected });
    else if (actual !== expected) failures.push({ type: 'EXPECTED_VALUE_MISMATCH', key, expected, actual });
  }

  for (const pointer of spec.zeroRequiredSelectors ?? []) {
    const value = jsonPointer(primary, pointer);
    if (value === undefined) failures.push({ type: 'ZERO_REQUIRED_SELECTOR_MISSING', pointer });
    else if (value !== 0) failures.push({ type: 'ZERO_REQUIRED_SELECTOR_NONZERO', pointer, value });
  }

  const rawStatus = primarySelected.rawStatus;
  const acceptedStatus = typeof rawStatus === 'string'
    && (rawStatus.toUpperCase().startsWith('PASS') || rawStatus === 'READY_FOR_ASSET_EVIDENCE');
  if (!acceptedStatus) failures.push({ type: 'D1_STATUS_NOT_ACCEPTED', rawStatus });

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
  };
};

const safeEntryToken = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
const outputFileFor = (entryDirectory, domain, id) => path.posix.join(entryDirectory.replaceAll('\\', '/'), `promotion.${domain}.${id}.v1.json`);

const projectionOverrideFrom = (predecessor, options) => {
  if (options.projectionFile) {
    const value = readJson(options.projectionFile);
    if (!isObject(value)) throw new Error('Projection override file must contain a JSON object.');
    return clone(value);
  }
  return predecessor.projectionOverride === undefined ? undefined : clone(predecessor.projectionOverride);
};

const explicitAdmissionFrom = options => [...(options.equals ?? []), ...(options.in ?? [])];

const runOrThrow = (script, args = []) => {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${script} exited with code ${result.status}`);
};

const writeEntryFile = (outputPath, entry) => {
  const persisted = clone(entry);
  delete persisted.sourceEntryFile;
  fs.writeFileSync(outputPath, `${JSON.stringify({
    version: 1,
    schemaId: 'project-doctor-active-source-entries/v1',
    stage: 'PROJECT-STATUS-STAGE3',
    entry: persisted,
  }, null, 2)}\n`);
};

export const promoteStatusSource = (options, runtime = {}) => {
  const promotionContract = runtime.promotionContract ?? readJson(PROMOTION_CONTRACT);
  if (promotionContract.status !== 'DESIGN_FROZEN') throw new Error(`Promotion contract is not frozen: ${promotionContract.status}`);
  if (!options.domain || !options.id || !options.sourcePath) throw new Error('--domain, --id, and --source are required.');
  if (!safeEntryToken(options.id)) throw new Error(`Unsafe entry id: ${options.id}`);
  if (!fs.existsSync(options.sourcePath)) throw new Error(`Source file does not exist: ${options.sourcePath}`);

  const { contract: registryContract, d1Contract, result: currentRegistry } = buildRegistry({
    contractPath: promotionContract.registryContract,
    write: false,
  });
  if (currentRegistry.status !== 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY') {
    throw new Error(`Current registry is blocked: ${currentRegistry.status}`);
  }
  const activeMeta = currentRegistry.domains?.[options.domain];
  if (!activeMeta) throw new Error(`Unknown Project Doctor domain: ${options.domain}`);

  const loaded = loadEntries(registryContract.entryDirectory);
  const existingById = loaded.entries.find(entry => entry.id === options.id);
  if (activeMeta.selectedId === options.id) {
    if (!existingById || existingById.domain !== options.domain || existingById.sourcePath !== options.sourcePath) {
      throw new Error(`Requested id is already active with a different declaration: ${options.id}`);
    }
    const effectiveSpec = currentRegistry.effectiveDomains[options.domain];
    const d1Preflight = preflightEffectiveDomain(effectiveSpec);
    if (!d1Preflight.pass) throw new Error(`Already-active source fails D1 preflight: ${JSON.stringify(d1Preflight.failures)}`);
    return {
      status: 'PASS_STATUS_SOURCE_PROMOTION_ALREADY_ACTIVE',
      completion: 'COMPLETE',
      writePerformed: false,
      alreadyActive: true,
      domain: options.domain,
      selectedId: options.id,
      sourcePath: options.sourcePath,
      outputPath: existingById.sourceEntryFile,
      d1Preflight,
    };
  }
  if (existingById) throw new Error(`Entry id already exists but is not active: ${options.id}`);

  const predecessor = loaded.entries.find(entry => entry.id === activeMeta.selectedId);
  if (!predecessor) throw new Error(`Current selected entry declaration not found: ${activeMeta.selectedId}`);

  const explicitAdmission = explicitAdmissionFrom(options);
  const admission = explicitAdmission.length > 0 ? explicitAdmission : clone(predecessor.admission);
  if (!Array.isArray(admission) || admission.length === 0) throw new Error('Promotion admission cannot be empty.');
  const projectionOverride = projectionOverrideFrom(predecessor, options);
  const outputPath = outputFileFor(registryContract.entryDirectory, options.domain, options.id);
  if (fs.existsSync(outputPath)) throw new Error(`Promotion output already exists: ${outputPath}`);

  const entry = {
    id: options.id,
    domain: options.domain,
    state: 'APPROVED',
    sourcePath: options.sourcePath,
    facet: options.facet ?? predecessor.facet ?? activeMeta.facet ?? null,
    successorOf: activeMeta.selectedId,
    admission,
    ...(projectionOverride === undefined ? {} : { projectionOverride }),
    note: options.note ?? `Stage 3 guarded promotion from ${activeMeta.selectedId}.`,
    sourceEntryFile: outputPath,
  };

  const candidateRegistry = resolveRegistry({
    contract: registryContract,
    d1Contract,
    entries: [...loaded.entries, entry],
  });
  if (candidateRegistry.status !== 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY') {
    throw new Error(`Candidate registry blocked: ${JSON.stringify(candidateRegistry.failures)}`);
  }
  if (candidateRegistry.domains?.[options.domain]?.selectedId !== options.id) {
    throw new Error(`Candidate was not selected as terminal active source for ${options.domain}.`);
  }

  const effectiveSpec = candidateRegistry.effectiveDomains[options.domain];
  const d1Preflight = preflightEffectiveDomain(effectiveSpec);
  if (!d1Preflight.pass) {
    throw new Error(`Candidate fails effective D1 projection: ${JSON.stringify(d1Preflight.failures)}`);
  }

  const summary = {
    status: options.check ? 'PASS_STATUS_SOURCE_PROMOTION_CHECK' : 'PASS_STATUS_SOURCE_PROMOTION',
    completion: 'COMPLETE',
    writePerformed: !options.check,
    alreadyActive: false,
    domain: options.domain,
    predecessorId: activeMeta.selectedId,
    selectedId: options.id,
    sourcePath: options.sourcePath,
    outputPath,
    admissionMode: explicitAdmission.length > 0 ? 'EXPLICIT' : 'INHERITED',
    projectionMode: options.projectionFile ? 'EXPLICIT_FILE' : (predecessor.projectionOverride === undefined ? 'NONE' : 'INHERITED'),
    d1Preflight,
    boundaries: {
      rawConfigDataRead: false,
      semanticRecomputation: false,
      canonicalJoinRecomputation: false,
      filenameInference: false,
      chronologyInference: false,
    },
  };

  if (options.check) return summary;

  writeEntryFile(outputPath, entry);
  try {
    const rebuilt = buildRegistry({ contractPath: promotionContract.registryContract, write: true }).result;
    if (rebuilt.status !== 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY' || rebuilt.domains?.[options.domain]?.selectedId !== options.id) {
      throw new Error(`Post-write registry did not select ${options.id}.`);
    }
    runOrThrow('scripts/run-project-doctor-d1-3.mjs');
    runOrThrow('scripts/build-project-status.mjs');
    return summary;
  } catch (error) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    try {
      buildRegistry({ contractPath: promotionContract.registryContract, write: true });
      runOrThrow('scripts/run-project-doctor-d1-3.mjs');
      runOrThrow('scripts/build-project-status.mjs');
    } catch {
      // Preserve the original promotion failure. The follow-up Doctor run will expose any remaining stale output.
    }
    throw error;
  }
};

const usage = () => {
  console.log('Usage: node scripts/promote-project-doctor-status-source.mjs --domain <domain> --id <entry-id> --source <validated-json> [--facet <facet>] [--equals /pointer=value] [--in /pointer=a,b] [--projection-file file.json] [--note text] [--check]');
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parsePromotionArgs(process.argv.slice(2));
    if (options.help) {
      usage();
    } else {
      const result = promoteStatusSource(options);
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(`[status-source-promotion] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
