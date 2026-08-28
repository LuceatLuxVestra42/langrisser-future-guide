#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const defaultMapPath = path.join(repoRoot, 'data', 'contracts', 'regression-impact-map.v1.json');
const BLOCKED_EXIT_CODE = 2;

function usage() {
  return `Smart Regression Runner — SR-2 dry-run selector\n\nUsage:\n  node scripts/smart-regression.mjs --dry-run [--base <ref>] [--head <ref>]\n  node scripts/smart-regression.mjs --dry-run --file <path> [--file <path> ...]\n  node scripts/smart-regression.mjs --dry-run --files <path1,path2,...>\n\nOptions:\n  --base <ref>       Git diff base. Defaults to SMART_REGRESSION_BASE,\n                     origin/$GITHUB_BASE_REF, or HEAD~1.\n  --head <ref>       Git diff head. Defaults to SMART_REGRESSION_HEAD or HEAD.\n  --file <path>      Analyze one explicit changed path. Repeatable.\n  --files <csv>      Analyze comma-separated changed paths.\n  --map <path>       Override impact-map path.\n  --json             Print machine-readable JSON only.\n  --dry-run          Explicitly request selector-only mode (default in SR-2).\n  --help             Show this help.\n\nSR-2 never executes validator commands. Unknown paths and required unbound gates\nfail closed with exit code ${BLOCKED_EXIT_CODE}.`;
}

function parseArgs(argv) {
  const args = {
    base: null,
    head: null,
    mapPath: defaultMapPath,
    files: [],
    json: false,
    dryRun: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
      return value;
    };

    switch (token) {
      case '--base':
        args.base = next();
        break;
      case '--head':
        args.head = next();
        break;
      case '--map':
        args.mapPath = path.resolve(process.cwd(), next());
        break;
      case '--file':
        args.files.push(next());
        break;
      case '--files':
        args.files.push(...next().split(',').map((value) => value.trim()).filter(Boolean));
        break;
      case '--json':
        args.json = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--execute':
        throw new Error('SR-2 is dry-run only. Validator execution is introduced in SR-3.');
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function normalizeRepoPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
}

const globCache = new Map();

function globToRegExp(glob) {
  let source = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          source += '(?:.*/)?';
          i += 2;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    if ('\\.^$+{}()|[]'.includes(char)) source += `\\${char}`;
    else source += char;
  }
  source += '$';
  return new RegExp(source);
}

function matchesGlob(file, glob) {
  if (!globCache.has(glob)) globCache.set(glob, globToRegExp(glob));
  return globCache.get(glob).test(file);
}

function matchesAny(file, globs = []) {
  return globs.some((glob) => matchesGlob(file, glob));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

async function loadImpactMap(mapPath) {
  const raw = await readFile(mapPath, 'utf8');
  const map = JSON.parse(raw);
  validateImpactMap(map);
  return map;
}

function validateImpactMap(map) {
  if (!map || typeof map !== 'object') throw new Error('Impact map must be a JSON object.');
  if (map.schemaVersion !== 1) throw new Error(`Unsupported impact-map schemaVersion: ${String(map.schemaVersion)}`);
  if (!map.gates || typeof map.gates !== 'object') throw new Error('Impact map is missing gates.');
  if (!Array.isArray(map.rules)) throw new Error('Impact map is missing rules.');

  const gateIds = new Set(Object.keys(map.gates));
  const assertGate = (gateId, owner) => {
    if (!gateIds.has(gateId)) throw new Error(`${owner} references unknown gate: ${gateId}`);
  };

  for (const [gateId, gate] of Object.entries(map.gates)) {
    if (gate.members !== undefined) {
      if (!Array.isArray(gate.members) || gate.members.length === 0) throw new Error(`Composite gate ${gateId} must have non-empty members.`);
      for (const member of gate.members) assertGate(member, `gate ${gateId}`);
    }
  }

  for (const rule of map.rules) {
    if (!rule.id || !Array.isArray(rule.match) || !Array.isArray(rule.select)) throw new Error(`Invalid rule shape: ${JSON.stringify(rule)}`);
    for (const gateId of rule.select) assertGate(gateId, `rule ${rule.id}`);
    for (const gateId of rule.doNotSelect ?? []) assertGate(gateId, `rule ${rule.id}`);
  }

  for (const gateId of map.fallback?.unknownPath ?? []) assertGate(gateId, 'fallback.unknownPath');
}

function resolveDiffRefs(args) {
  const base = args.base ?? process.env.SMART_REGRESSION_BASE ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD~1');
  const head = args.head ?? process.env.SMART_REGRESSION_HEAD ?? 'HEAD';
  return { base, head };
}

function readChangedFilesFromGit(base, head) {
  const diffSpec = `${base}...${head}`;
  const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMRD', '--relative', diffSpec], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || 'unknown git diff error';
    throw new Error(`git diff failed for ${diffSpec}: ${stderr}`);
  }
  return result.stdout.split(/\r?\n/u).map(normalizeRepoPath).filter(Boolean);
}

function expandRequestedGates(requestedGateIds, gates) {
  const leafIds = [];
  const compositeIds = [];
  const seenLeaf = new Set();
  const seenComposite = new Set();

  const visit = (gateId, stack = []) => {
    if (stack.includes(gateId)) throw new Error(`Composite gate cycle: ${[...stack, gateId].join(' -> ')}`);
    const gate = gates[gateId];
    if (!gate) throw new Error(`Unknown gate during expansion: ${gateId}`);
    if (Array.isArray(gate.members)) {
      if (!seenComposite.has(gateId)) {
        seenComposite.add(gateId);
        compositeIds.push(gateId);
      }
      for (const member of gate.members) visit(member, [...stack, gateId]);
      return;
    }
    if (!seenLeaf.has(gateId)) {
      seenLeaf.add(gateId);
      leafIds.push(gateId);
    }
  };

  for (const gateId of requestedGateIds) visit(gateId);
  return { leafIds, compositeIds };
}

function analyzeChanges(files, map, meta) {
  const changedFiles = uniqueSorted(files.map(normalizeRepoPath).filter(Boolean));
  if (changedFiles.length === 0) {
    return { ...meta, dryRun: true, status: 'PASS_NO_CHANGES', changedFiles, docsOnly: false, affectedDomains: [], matchedRules: [], unknownPaths: [], requestedGates: [], compositeGates: [], leafGates: [], executableGates: [], unboundGates: [], skippedByRule: [], note: 'No validator commands were executed.' };
  }

  const docsOnlyGlobs = map.docsOnly?.globs ?? [];
  const docsOnly = docsOnlyGlobs.length > 0 && changedFiles.every((file) => matchesAny(file, docsOnlyGlobs));
  if (docsOnly) {
    return { ...meta, dryRun: true, status: 'PASS_DOCS_ONLY', changedFiles, docsOnly: true, affectedDomains: [], matchedRules: [], unknownPaths: [], requestedGates: map.docsOnly?.selectedGates ?? [], compositeGates: [], leafGates: [], executableGates: [], unboundGates: [], skippedByRule: [], note: 'Documentation-only bypass applied. No validator commands were executed.' };
  }

  const matchedRuleIds = [];
  const domains = [];
  const requestedGateIds = [];
  const doNotSelectCandidates = [];
  const unknownPaths = [];

  for (const file of changedFiles) {
    const rules = map.rules.filter((rule) => matchesAny(file, rule.match));
    if (rules.length === 0) {
      unknownPaths.push(file);
      continue;
    }
    for (const rule of rules) {
      matchedRuleIds.push(rule.id);
      if (rule.domain) domains.push(rule.domain);
      requestedGateIds.push(...rule.select);
      doNotSelectCandidates.push(...(rule.doNotSelect ?? []));
    }
  }

  if (unknownPaths.length > 0) {
    requestedGateIds.push(...(map.fallback?.unknownPath ?? []));
    domains.push('global');
  }

  const requestedGates = [...new Set(requestedGateIds)];
  const { leafIds, compositeIds } = expandRequestedGates(requestedGates, map.gates);
  const executableGates = [];
  const unboundGates = [];

  for (const gateId of leafIds) {
    const gate = map.gates[gateId];
    const entry = { id: gateId, domain: gate.domain ?? null, kind: gate.kind ?? null, command: gate.command ?? null, resolutionStatus: gate.resolutionStatus ?? null };
    if (gate.domain) domains.push(gate.domain);
    if (gate.executable === true && typeof gate.command === 'string' && gate.command.trim()) executableGates.push(entry);
    else unboundGates.push(entry);
  }

  const selectedSet = new Set([...requestedGates, ...leafIds, ...compositeIds]);
  const skippedByRule = uniqueSorted(doNotSelectCandidates.filter((gateId) => !selectedSet.has(gateId)));
  let status = 'PASS';
  if (unknownPaths.length > 0) status = 'BLOCKED_UNKNOWN_PATH';
  else if (unboundGates.length > 0) status = 'BLOCKED_UNBOUND';

  return { ...meta, dryRun: true, status, changedFiles, docsOnly: false, affectedDomains: uniqueSorted(domains), matchedRules: uniqueSorted(matchedRuleIds), unknownPaths: uniqueSorted(unknownPaths), requestedGates, compositeGates: compositeIds, leafGates: leafIds, executableGates, unboundGates, skippedByRule, note: 'SR-2 selection only. Validator commands were not executed.' };
}

function printSection(title, items, formatter = (value) => value) {
  console.log(`\n${title} (${items.length})`);
  if (items.length === 0) {
    console.log('  - none');
    return;
  }
  for (const item of items) console.log(`  - ${formatter(item)}`);
}

function printHuman(report) {
  console.log('SMART REGRESSION RUNNER — SR-2 DRY RUN');
  console.log(`MAP: ${report.mapId} / ${report.mapStatus}`);
  console.log(`SOURCE: ${report.changeSource}`);
  if (report.base) console.log(`BASE: ${report.base}`);
  if (report.head) console.log(`HEAD: ${report.head}`);
  printSection('CHANGED FILES', report.changedFiles);
  if (report.status === 'PASS_DOCS_ONLY') {
    console.log('\nPOLICY: documentation-only bypass');
    console.log('EXECUTION: none');
    console.log(`RESULT: ${report.status}`);
    return;
  }
  printSection('AFFECTED DOMAINS', report.affectedDomains);
  printSection('MATCHED RULES', report.matchedRules);
  printSection('UNKNOWN PATHS', report.unknownPaths);
  printSection('REQUESTED GATES', report.requestedGates);
  printSection('COMPOSITE GATES', report.compositeGates);
  printSection('EXPANDED LEAF GATES', report.leafGates);
  printSection('EXECUTABLE GATES (NOT EXECUTED)', report.executableGates, (gate) => `${gate.id} :: ${gate.command}`);
  printSection('UNBOUND GATES', report.unboundGates, (gate) => `${gate.id} :: ${gate.resolutionStatus ?? 'UNRESOLVED'}`);
  printSection('SKIPPED BY MATCHED RULE', report.skippedByRule);
  console.log('\nEXECUTION: none (SR-2 dry-run only)');
  console.log(`RESULT: ${report.status}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const map = await loadImpactMap(args.mapPath);
  const explicitFiles = uniqueSorted(args.files.map(normalizeRepoPath).filter(Boolean));
  const refs = resolveDiffRefs(args);
  const changedFiles = explicitFiles.length > 0 ? explicitFiles : readChangedFilesFromGit(refs.base, refs.head);
  const changeSource = explicitFiles.length > 0 ? 'explicit-files' : 'git-diff';
  const report = analyzeChanges(changedFiles, map, {
    mapId: map.id ?? null,
    mapStatus: map.status ?? null,
    mapPath: path.relative(repoRoot, args.mapPath).replaceAll('\\', '/'),
    changeSource,
    base: changeSource === 'git-diff' ? refs.base : null,
    head: changeSource === 'git-diff' ? refs.head : null,
  });
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  return report.status.startsWith('BLOCKED_') ? BLOCKED_EXIT_CODE : 0;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(`SMART REGRESSION ERROR: ${error.message}`);
  process.exitCode = 1;
});
