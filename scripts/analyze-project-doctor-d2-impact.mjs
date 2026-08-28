import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CONTRACT_PATH = 'data/contracts/project-doctor-d2-impact-contract.v1.json';

const escapeRegex = value => value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
export const globToRegex = glob => {
  let out = '^';
  for (let i = 0; i < glob.length;) {
    if (glob.slice(i, i + 2) === '**') {
      out += '.*';
      i += 2;
    } else if (glob[i] === '*') {
      out += '[^/]*';
      i += 1;
    } else if (glob[i] === '?') {
      out += '[^/]';
      i += 1;
    } else {
      out += escapeRegex(glob[i]);
      i += 1;
    }
  }
  return new RegExp(`${out}$`);
};

export const normalizeRepositoryPath = value => {
  if (typeof value !== 'string') return null;
  let normalized = value.trim().replaceAll('\\', '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  normalized = normalized.replace(/\/+/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null;
  if (normalized.split('/').some(segment => segment === '..')) return null;
  return normalized;
};

const matchesAny = (repositoryPath, patterns = []) => patterns.some(pattern => globToRegex(pattern).test(repositoryPath));

export const buildEffectiveMap = (baseMap, impactContract) => {
  const overlayRules = impactContract.pathRuleOverlays ?? [];
  const knownNodes = new Set(Object.keys(baseMap.impactNodes ?? {}));
  for (const rule of overlayRules) {
    for (const node of rule.directNodes ?? []) {
      if (!knownNodes.has(node)) throw new Error(`Impact overlay ${rule.id} references unknown node: ${node}`);
    }
  }
  return {
    ...baseMap,
    pathRules: [...(baseMap.pathRules ?? []), ...overlayRules],
  };
};

export const analyzePath = (repositoryPath, map) => {
  const normalizedPath = normalizeRepositoryPath(repositoryPath);
  if (!normalizedPath) {
    return {
      inputPath: repositoryPath,
      path: null,
      status: 'INVALID_PATH',
      matchedRuleIds: [],
      changeClasses: [],
      directNodes: [],
      propagatedNodes: [],
      impactedNodes: [],
      domains: [],
      reason: 'Input must be a repository-relative path without parent traversal.',
    };
  }

  const matchedRules = [];
  const directNodes = new Set();
  const changeClasses = new Set();
  for (const rule of map.pathRules ?? []) {
    const included = matchesAny(normalizedPath, rule.patterns ?? []);
    const excluded = matchesAny(normalizedPath, rule.excludePatterns ?? []);
    if (!included || excluded) continue;
    matchedRules.push(rule);
    for (const node of rule.directNodes ?? []) directNodes.add(node);
    if (rule.changeClass) changeClasses.add(rule.changeClass);
  }

  if (directNodes.size === 0) {
    const isConfigData = normalizedPath.startsWith('data/configdata/ConfigData') && normalizedPath.endsWith('.json');
    return {
      inputPath: repositoryPath,
      path: normalizedPath,
      status: 'MANUAL_REVIEW',
      matchedRuleIds: matchedRules.map(rule => rule.id),
      changeClasses: [...changeClasses].sort(),
      directNodes: [],
      propagatedNodes: [],
      impactedNodes: [],
      domains: [],
      reason: isConfigData
        ? (map.mappingPolicy?.unmatchedConfigData ?? 'MANUAL_REVIEW')
        : (map.mappingPolicy?.unmatchedPath ?? 'MANUAL_REVIEW'),
    };
  }

  const impactedNodes = new Set(directNodes);
  const queue = [...directNodes];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const edge of map.propagationEdges ?? []) {
      if (edge.from !== current || impactedNodes.has(edge.to)) continue;
      impactedNodes.add(edge.to);
      queue.push(edge.to);
    }
  }

  const domains = new Set();
  for (const node of impactedNodes) {
    for (const domain of map.impactNodes?.[node]?.domains ?? []) domains.add(domain);
  }
  const propagatedNodes = [...impactedNodes].filter(node => !directNodes.has(node));

  return {
    inputPath: repositoryPath,
    path: normalizedPath,
    status: 'MAPPED',
    matchedRuleIds: matchedRules.map(rule => rule.id),
    changeClasses: [...changeClasses].sort(),
    directNodes: [...directNodes].sort(),
    propagatedNodes: propagatedNodes.sort(),
    impactedNodes: [...impactedNodes].sort(),
    domains: [...domains].sort(),
  };
};

export const analyzePaths = (paths, map) => {
  const uniqueInputs = [];
  const seen = new Set();
  for (const input of paths) {
    const normalized = normalizeRepositoryPath(input);
    const dedupeKey = normalized ?? `INVALID:${String(input)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    uniqueInputs.push(input);
  }

  const files = uniqueInputs.map(input => analyzePath(input, map));
  const aggregateNodes = new Set();
  const aggregateDirectNodes = new Set();
  const aggregateDomains = new Set();
  const aggregateClasses = new Set();
  for (const file of files) {
    for (const node of file.directNodes) aggregateDirectNodes.add(node);
    for (const node of file.impactedNodes) aggregateNodes.add(node);
    for (const domain of file.domains) aggregateDomains.add(domain);
    for (const changeClass of file.changeClasses) aggregateClasses.add(changeClass);
  }

  return {
    version: 1,
    schemaId: 'project-doctor-d2-impact/v1',
    stage: 'D2-IMPACT',
    status: files.some(file => file.status === 'INVALID_PATH')
      ? 'INVALID_INPUT'
      : files.some(file => file.status === 'MANUAL_REVIEW')
        ? 'MANUAL_REVIEW'
        : 'MAPPED',
    mapStatus: map.status ?? null,
    changedFileCount: files.length,
    mappedFileCount: files.filter(file => file.status === 'MAPPED').length,
    manualReviewFileCount: files.filter(file => file.status === 'MANUAL_REVIEW').length,
    invalidFileCount: files.filter(file => file.status === 'INVALID_PATH').length,
    directNodes: [...aggregateDirectNodes].sort(),
    impactedNodes: [...aggregateNodes].sort(),
    domains: [...aggregateDomains].sort(),
    changeClasses: [...aggregateClasses].sort(),
    files,
  };
};

export const parseStdinText = text => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.some(value => typeof value !== 'string')) {
      throw new Error('stdin JSON must be an array of repository-relative path strings.');
    }
    return parsed;
  }
  return trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
};

const parseCli = argv => {
  const options = { contractPath: DEFAULT_CONTRACT_PATH, json: false, stdin: false, paths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--stdin') options.stdin = true;
    else if (arg === '--contract') {
      options.contractPath = argv[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else options.paths.push(arg);
  }
  return options;
};

const printHuman = result => {
  console.log('PROJECT DOCTOR IMPACT');
  console.log(`Changed files : ${result.changedFileCount}`);
  console.log(`Status        : ${result.status}`);
  console.log(`Domains       : ${result.domains.length ? result.domains.join(', ') : '-'}`);
  console.log(`Impact nodes  : ${result.impactedNodes.length ? result.impactedNodes.join(', ') : '-'}`);
  for (const file of result.files) {
    console.log(`\n${file.path ?? file.inputPath}`);
    console.log(`  status  : ${file.status}`);
    console.log(`  direct  : ${file.directNodes.length ? file.directNodes.join(', ') : '-'}`);
    console.log(`  domains : ${file.domains.length ? file.domains.join(', ') : '-'}`);
    if (file.status !== 'MAPPED') console.log(`  reason  : ${file.reason}`);
  }
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/analyze-project-doctor-d2-impact.mjs [--json] [--stdin] [--contract PATH] <changed-path...>');
    console.log('Example: npm run doctor:impact -- public/images/heroes/cards/6.png src/routes/heroes.tsx');
    process.exit(0);
  }

  const contract = JSON.parse(fs.readFileSync(options.contractPath, 'utf8'));
  if (contract.status !== 'DESIGN_FROZEN') {
    console.error(`[doctor:impact] impact contract is not frozen: ${contract.status}`);
    process.exit(2);
  }
  const baseMap = JSON.parse(fs.readFileSync(contract.baseMap, 'utf8'));
  if (baseMap.status !== 'DESIGN_FROZEN') {
    console.error(`[doctor:impact] dependency map is not frozen: ${baseMap.status}`);
    process.exit(2);
  }
  const effectiveMap = buildEffectiveMap(baseMap, contract);
  const stdinPaths = options.stdin ? parseStdinText(fs.readFileSync(0, 'utf8')) : [];
  const inputs = [...options.paths, ...stdinPaths];
  if (inputs.length === 0) {
    console.error('[doctor:impact] no changed paths supplied. Pass repository-relative paths or use --stdin.');
    process.exit(2);
  }

  const result = analyzePaths(inputs, effectiveMap);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  if (result.status === 'INVALID_INPUT') process.exitCode = contract.exitPolicy?.INVALID_INPUT ?? 2;
  else if (result.status === 'MANUAL_REVIEW') process.exitCode = contract.exitPolicy?.MANUAL_REVIEW ?? 3;
}
