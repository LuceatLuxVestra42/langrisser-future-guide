import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REGISTRY_CONTRACT = 'data/contracts/project-doctor-active-source-registry.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(Object(value), key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeRelative = value => typeof value === 'string'
  && value.length > 0
  && !path.isAbsolute(value)
  && !value.split(/[\\/]+/).includes('..');

export const jsonPointer = (value, pointer) => {
  if (pointer === '' || pointer === '/') return value;
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return undefined;
  let current = value;
  for (const token of pointer.slice(1).split('/')) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || current === undefined || !hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
};

const stableClone = value => JSON.parse(JSON.stringify(value));
const sortedUnique = values => [...new Set(values)].sort();

const readEntryFiles = entryDirectory => {
  if (!fs.existsSync(entryDirectory)) return { entries: [], files: [], readFailures: [{ path: entryDirectory, error: 'ENTRY_DIRECTORY_MISSING' }] };
  const files = fs.readdirSync(entryDirectory)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => path.posix.join(entryDirectory.replaceAll('\\', '/'), name));
  const entries = [];
  const readFailures = [];
  for (const filePath of files) {
    try {
      const parsed = readJson(filePath);
      const rows = Array.isArray(parsed.entries) ? parsed.entries : parsed.entry ? [parsed.entry] : [];
      if (rows.length === 0) {
        readFailures.push({ path: filePath, error: 'NO_ENTRIES' });
        continue;
      }
      for (const entry of rows) entries.push({ ...entry, sourceEntryFile: filePath });
    } catch (error) {
      readFailures.push({ path: filePath, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { entries, files, readFailures };
};

const admissionResult = (source, rule) => {
  const actual = jsonPointer(source, rule.pointer);
  if (hasOwn(rule, 'equals')) {
    return { pass: actual === rule.equals, pointer: rule.pointer, operator: 'equals', expected: rule.equals, actual };
  }
  if (Array.isArray(rule.in)) {
    return { pass: rule.in.includes(actual), pointer: rule.pointer, operator: 'in', expected: rule.in, actual };
  }
  return { pass: false, pointer: rule.pointer ?? null, operator: 'INVALID', expected: null, actual };
};

const validateProjectionOverride = (entry, contract, failures) => {
  if (entry.projectionOverride === undefined) return;
  if (!isObject(entry.projectionOverride)) {
    failures.push({ type: 'INVALID_PROJECTION_OVERRIDE', entryId: entry.id });
    return;
  }
  const allowed = new Set(contract.entrySchema?.projectionOverrideAllowedKeys ?? []);
  for (const key of Object.keys(entry.projectionOverride)) {
    if (!allowed.has(key)) failures.push({ type: 'PROJECTION_OVERRIDE_KEY_NOT_ALLOWED', entryId: entry.id, key });
  }
};

const mergeDomainSpec = (baseline, selected) => {
  const override = selected.projectionOverride ?? {};
  return {
    ...stableClone(baseline),
    ...stableClone(override),
    primaryStatusSource: selected.sourcePath,
    primaryFacet: override.primaryFacet ?? selected.facet ?? baseline.primaryFacet,
  };
};

export const resolveRegistry = ({ contract, d1Contract, entries, sourceLoader = readJson }) => {
  const failures = [];
  const expectedDomains = d1Contract.scope?.domains ?? [];
  const expectedDomainSet = new Set(expectedDomains);
  const approvedState = contract.policy?.entryStateRequired ?? 'APPROVED';
  const allowedPrefixes = contract.policy?.allowedSourcePrefixes ?? [];
  const approved = entries.filter(entry => entry?.state === approvedState);

  if (contract.status !== 'DESIGN_FROZEN') failures.push({ type: 'CONTRACT_NOT_FROZEN', actual: contract.status });
  if (d1Contract.status !== 'DESIGN_FROZEN') failures.push({ type: 'D1_CONTRACT_NOT_FROZEN', actual: d1Contract.status });
  if (approved.length !== entries.length) {
    failures.push({ type: 'NON_APPROVED_ENTRY_PRESENT', count: entries.length - approved.length });
  }

  const byId = new Map();
  for (const entry of approved) {
    if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
      failures.push({ type: 'ENTRY_ID_INVALID', entry });
      continue;
    }
    if (byId.has(entry.id)) failures.push({ type: 'DUPLICATE_ENTRY_ID', entryId: entry.id });
    byId.set(entry.id, entry);
    if (!expectedDomainSet.has(entry.domain)) failures.push({ type: 'UNKNOWN_DOMAIN', entryId: entry.id, domain: entry.domain });
    if (!safeRelative(entry.sourcePath) || !allowedPrefixes.some(prefix => entry.sourcePath.startsWith(prefix))) {
      failures.push({ type: 'SOURCE_PATH_NOT_ALLOWED', entryId: entry.id, sourcePath: entry.sourcePath });
    }
    if (!Array.isArray(entry.admission) || entry.admission.length === 0) failures.push({ type: 'ADMISSION_REQUIRED', entryId: entry.id });
    validateProjectionOverride(entry, contract, failures);
  }

  const childrenByParent = new Map();
  for (const entry of approved) {
    if (entry.successorOf === null) continue;
    if (typeof entry.successorOf !== 'string' || !byId.has(entry.successorOf)) {
      failures.push({ type: 'PREDECESSOR_MISSING', entryId: entry.id, successorOf: entry.successorOf });
      continue;
    }
    const predecessor = byId.get(entry.successorOf);
    if (predecessor.domain !== entry.domain) {
      failures.push({ type: 'CROSS_DOMAIN_SUCCESSOR', entryId: entry.id, successorOf: entry.successorOf });
      continue;
    }
    const children = childrenByParent.get(entry.successorOf) ?? [];
    children.push(entry.id);
    childrenByParent.set(entry.successorOf, children);
  }
  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) failures.push({ type: 'MULTIPLE_SUCCESSORS', parentId, children: [...children].sort() });
  }

  const sourceEvidence = new Map();
  for (const entry of approved) {
    try {
      const source = sourceLoader(entry.sourcePath);
      const admission = (entry.admission ?? []).map(rule => admissionResult(source, rule));
      sourceEvidence.set(entry.id, { readable: true, admission });
      if (admission.some(item => !item.pass)) failures.push({ type: 'ADMISSION_FAILED', entryId: entry.id, sourcePath: entry.sourcePath, admission });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sourceEvidence.set(entry.id, { readable: false, error: message, admission: [] });
      failures.push({ type: 'SOURCE_UNREADABLE', entryId: entry.id, sourcePath: entry.sourcePath, error: message });
    }
  }

  const domains = {};
  const effectiveDomains = {};
  for (const domain of expectedDomains) {
    const roots = approved.filter(entry => entry.domain === domain && entry.successorOf === null);
    if (roots.length !== 1) {
      failures.push({ type: 'ROOT_COUNT_INVALID', domain, expected: 1, actual: roots.length });
      continue;
    }
    const root = roots[0];
    const baseline = d1Contract.domains?.[domain];
    if (!baseline) {
      failures.push({ type: 'D1_DOMAIN_SPEC_MISSING', domain });
      continue;
    }
    if (root.sourcePath !== baseline.primaryStatusSource) {
      failures.push({ type: 'ROOT_D1_SOURCE_MISMATCH', domain, expected: baseline.primaryStatusSource, actual: root.sourcePath });
    }

    const lineage = [];
    const visited = new Set();
    let current = root;
    while (current) {
      if (visited.has(current.id)) {
        failures.push({ type: 'SUCCESSOR_CYCLE', domain, entryId: current.id, lineage: [...lineage] });
        break;
      }
      visited.add(current.id);
      lineage.push(current.id);
      const children = childrenByParent.get(current.id) ?? [];
      current = children.length === 1 ? byId.get(children[0]) : null;
    }
    const selected = byId.get(lineage[lineage.length - 1]);
    if (!selected) continue;
    domains[domain] = {
      rootId: root.id,
      selectedId: selected.id,
      sourcePath: selected.sourcePath,
      facet: selected.facet ?? baseline.primaryFacet ?? null,
      sourceEntryFile: selected.sourceEntryFile ?? null,
      lineage,
      admissionEvidence: sourceEvidence.get(selected.id) ?? null,
    };
    effectiveDomains[domain] = mergeDomainSpec(baseline, selected);
  }

  const selectedIds = new Set(Object.values(domains).map(item => item.selectedId));
  for (const entry of approved) {
    const reachable = Object.values(domains).some(item => item.lineage.includes(entry.id));
    if (!reachable) failures.push({ type: 'UNREACHABLE_APPROVED_ENTRY', entryId: entry.id, domain: entry.domain });
  }

  const pass = failures.length === 0;
  return {
    version: 1,
    schemaId: 'project-doctor-active-source-registry/v1',
    stage: 'PROJECT-STATUS-STAGE2',
    checkpoint: 'PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY',
    status: pass ? 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY' : 'FAIL_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY',
    completion: pass ? 'COMPLETE' : 'BLOCKED',
    contract: DEFAULT_REGISTRY_CONTRACT,
    derivedOnly: true,
    rawConfigDataReadCount: 0,
    semanticRecomputationCount: 0,
    canonicalJoinRecomputationCount: 0,
    entryCount: approved.length,
    selectedCount: selectedIds.size,
    domains,
    effectiveDomains,
    failures,
    hardErrorCount: failures.length,
  };
};

export const buildRegistry = ({ contractPath = DEFAULT_REGISTRY_CONTRACT, write = true } = {}) => {
  const contract = readJson(contractPath);
  const d1Contract = readJson(contract.d1Contract);
  const loaded = readEntryFiles(contract.entryDirectory);
  const result = resolveRegistry({ contract, d1Contract, entries: loaded.entries });
  if (loaded.readFailures.length > 0) {
    result.failures.push(...loaded.readFailures.map(item => ({ type: 'ENTRY_FILE_READ_FAILURE', ...item })));
    result.hardErrorCount = result.failures.length;
    result.status = 'FAIL_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY';
    result.completion = 'BLOCKED';
  }
  result.contract = contractPath;
  result.entryFiles = loaded.files;
  if (write) {
    fs.mkdirSync(path.dirname(contract.outputPath), { recursive: true });
    fs.writeFileSync(contract.outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  return { contract, d1Contract, result };
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const { result } = buildRegistry();
    console.log(result.status);
    process.exitCode = result.hardErrorCount === 0 ? 0 : 1;
  } catch (error) {
    console.error(`[active-source-registry] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
