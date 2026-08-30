import fs from 'node:fs';
import path from 'node:path';

const DECLARATION_SCHEMA = 'project-doctor-active-source-entries/v1';
const DEFAULT_DECLARATION_DIR = 'data/status-sources';
const ALLOWED_SOURCE_PREFIXES = ['data/validation/', 'data/checkpoints/'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function decodePointerToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function getJsonPointer(document, pointer) {
  if (pointer === '' || pointer === '/') return pointer === '' ? document : document[''];
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    throw new Error(`Invalid JSON pointer: ${pointer}`);
  }
  let value = document;
  for (const token of pointer.slice(1).split('/').map(decodePointerToken)) {
    if (value === null || value === undefined || typeof value !== 'object' || !(token in value)) {
      return undefined;
    }
    value = value[token];
  }
  return value;
}

function assertRepositoryPath(repoRoot, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.length || path.isAbsolute(relativePath)) {
    throw new Error(`Source path must be repository-relative: ${relativePath}`);
  }
  const absolute = path.resolve(repoRoot, relativePath);
  const root = path.resolve(repoRoot) + path.sep;
  if (!absolute.startsWith(root)) throw new Error(`Source path escapes repository: ${relativePath}`);
  return absolute;
}

function normalizeDeclaration(document, sourceEntryFile) {
  if (document?.schemaId !== DECLARATION_SCHEMA) {
    throw new Error(`Unsupported declaration schema in ${sourceEntryFile}: ${document?.schemaId ?? 'missing'}`);
  }
  const rows = Array.isArray(document.entries)
    ? document.entries
    : document.entry && typeof document.entry === 'object'
      ? [document.entry]
      : [];
  if (!rows.length) throw new Error(`No status-source entries in ${sourceEntryFile}`);
  return rows.map(entry => ({ ...entry, sourceEntryFile }));
}

function evaluateAdmission(source, rule) {
  const actual = getJsonPointer(source, rule.pointer);
  if (Object.prototype.hasOwnProperty.call(rule, 'equals')) {
    return {
      pass: Object.is(actual, rule.equals),
      pointer: rule.pointer,
      operator: 'equals',
      expected: rule.equals,
      actual
    };
  }
  if (Object.prototype.hasOwnProperty.call(rule, 'in')) {
    if (!Array.isArray(rule.in)) throw new Error(`Admission 'in' must be an array at ${rule.pointer}`);
    return {
      pass: rule.in.some(expected => Object.is(actual, expected)),
      pointer: rule.pointer,
      operator: 'in',
      expected: rule.in,
      actual
    };
  }
  throw new Error(`Unsupported admission operator at ${rule.pointer}`);
}

function validateEntrySource(repoRoot, entry) {
  if (!ALLOWED_SOURCE_PREFIXES.some(prefix => entry.sourcePath?.startsWith(prefix))) {
    throw new Error(`Status source path is outside allowed prefixes: ${entry.sourcePath}`);
  }
  const absolute = assertRepositoryPath(repoRoot, entry.sourcePath);
  if (!fs.existsSync(absolute)) throw new Error(`Status source does not exist: ${entry.sourcePath}`);
  const source = readJson(absolute);
  const admission = (entry.admission ?? []).map(rule => evaluateAdmission(source, rule));
  const failed = admission.filter(item => !item.pass);
  if (failed.length) {
    throw new Error(`Admission failed for ${entry.id}: ${failed.map(item => item.pointer).join(', ')}`);
  }
  return { readable: true, admission };
}

export function discoverStatusSourceDeclarations(repoRoot, declarationDir = DEFAULT_DECLARATION_DIR) {
  const absoluteDir = assertRepositoryPath(repoRoot, declarationDir);
  if (!fs.existsSync(absoluteDir)) throw new Error(`Declaration directory does not exist: ${declarationDir}`);
  return fs.readdirSync(absoluteDir, { withFileTypes: true })
    .filter(item => item.isFile() && item.name.endsWith('.json'))
    .map(item => path.posix.join(declarationDir, item.name))
    .sort();
}

export function selectActiveSources({ repoRoot = process.cwd(), declarationDir = DEFAULT_DECLARATION_DIR } = {}) {
  const declarationFiles = discoverStatusSourceDeclarations(repoRoot, declarationDir);
  const entries = [];
  for (const relativePath of declarationFiles) {
    const document = readJson(assertRepositoryPath(repoRoot, relativePath));
    entries.push(...normalizeDeclaration(document, relativePath));
  }

  const byId = new Map();
  for (const entry of entries) {
    if (!entry.id || !entry.domain || !entry.sourcePath) throw new Error(`Malformed status-source entry in ${entry.sourceEntryFile}`);
    if (byId.has(entry.id)) throw new Error(`Duplicate status-source entry id: ${entry.id}`);
    byId.set(entry.id, entry);
  }

  const approved = entries.filter(entry => entry.state === 'APPROVED');
  const roots = approved.filter(entry => entry.successorOf === null);
  if (!roots.length) throw new Error('No APPROVED status-source roots found.');

  const rootsByDomain = new Map();
  for (const root of roots) {
    const list = rootsByDomain.get(root.domain) ?? [];
    list.push(root);
    rootsByDomain.set(root.domain, list);
  }
  for (const [domain, domainRoots] of rootsByDomain) {
    if (domainRoots.length !== 1) throw new Error(`Expected exactly one APPROVED root for ${domain}, found ${domainRoots.length}`);
  }

  const successors = new Map();
  for (const entry of approved) {
    if (entry.successorOf === null) continue;
    const predecessor = byId.get(entry.successorOf);
    if (!predecessor) throw new Error(`Missing predecessor ${entry.successorOf} for ${entry.id}`);
    if (predecessor.domain !== entry.domain) throw new Error(`Cross-domain successor is forbidden: ${entry.id}`);
    const list = successors.get(entry.successorOf) ?? [];
    list.push(entry);
    successors.set(entry.successorOf, list);
  }
  for (const [id, list] of successors) {
    if (list.length > 1) throw new Error(`Multiple APPROVED successors for ${id}: ${list.map(item => item.id).join(', ')}`);
  }

  const admissionEvidence = new Map();
  for (const entry of approved) admissionEvidence.set(entry.id, validateEntrySource(repoRoot, entry));

  const domains = {};
  const visitedGlobal = new Set();
  for (const root of roots) {
    const lineage = [];
    const visitedLocal = new Set();
    let current = root;
    while (current) {
      if (visitedLocal.has(current.id)) throw new Error(`Status-source cycle detected at ${current.id}`);
      visitedLocal.add(current.id);
      visitedGlobal.add(current.id);
      lineage.push(current.id);
      const next = successors.get(current.id) ?? [];
      current = next[0] ?? null;
    }
    const selected = byId.get(lineage[lineage.length - 1]);
    domains[root.domain] = {
      rootId: root.id,
      selectedId: selected.id,
      sourcePath: selected.sourcePath,
      facet: selected.facet ?? null,
      sourceEntryFile: selected.sourceEntryFile,
      lineage,
      projectionOverride: selected.projectionOverride ?? null,
      admissionEvidence: admissionEvidence.get(selected.id)
    };
  }

  for (const entry of approved) {
    if (!visitedGlobal.has(entry.id)) throw new Error(`APPROVED entry is not reachable from a declared root: ${entry.id}`);
  }

  return {
    version: 1,
    schemaId: 'status-source-selection/v1',
    status: 'PASS',
    completion: 'SELECTION_COMPLETE',
    derivedOnly: true,
    declarationFiles,
    entryCount: approved.length,
    selectedCount: Object.keys(domains).length,
    rawConfigDataReadCount: 0,
    semanticRecomputationCount: 0,
    domainValidatorExecutionCount: 0,
    legacyStateMutationCount: 0,
    domains
  };
}
