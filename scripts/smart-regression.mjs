#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const defaultMapPath = path.join(repoRoot, 'data', 'contracts', 'regression-impact-map.v1.json');
const defaultBindingsPath = path.join(repoRoot, 'data', 'contracts', 'regression-bindings.sr3.v1.json');
const BLOCKED_EXIT_CODE = 2;
const VALIDATOR_FAILED_EXIT_CODE = 1;
const MAX_CHILD_BUFFER = 50 * 1024 * 1024;

function usage() {
  return `Smart Regression Runner — SR-3 selector + executor\n\nUsage:\n  node scripts/smart-regression.mjs --dry-run [--base <ref>] [--head <ref>]\n  node scripts/smart-regression.mjs --execute [--base <ref>] [--head <ref>]\n  node scripts/smart-regression.mjs --dry-run --file <path> [--file <path> ...]\n  node scripts/smart-regression.mjs --execute --files <path1,path2,...>\n\nOptions:\n  --base <ref>       Git diff base. Defaults to SMART_REGRESSION_BASE,\n                     origin/$GITHUB_BASE_REF, or HEAD~1.\n  --head <ref>       Git diff head. Defaults to SMART_REGRESSION_HEAD or HEAD.\n  --file <path>      Analyze one explicit changed path. Repeatable.\n  --files <csv>      Analyze comma-separated changed paths.\n  --map <path>       Override impact-map path.\n  --bindings <path>  Override SR-3 bindings path.\n  --json             Print machine-readable JSON report.\n  --dry-run          Select/report only. This is the default.\n  --execute          Execute the fully-bound selected command plan.\n  --help             Show this help.\n\nSafety:\n  Unknown paths and selected unresolved gates block before any command runs.\n  Validator failure stops the remaining command plan immediately.`;
}

function parseArgs(argv) {
  const args = {
    base: null,
    head: null,
    mapPath: defaultMapPath,
    bindingsPath: defaultBindingsPath,
    files: [],
    json: false,
    mode: 'dry-run',
    explicitMode: null,
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
      case '--base': args.base = next(); break;
      case '--head': args.head = next(); break;
      case '--map': args.mapPath = path.resolve(process.cwd(), next()); break;
      case '--bindings': args.bindingsPath = path.resolve(process.cwd(), next()); break;
      case '--file': args.files.push(next()); break;
      case '--files': args.files.push(...next().split(',').map((value) => value.trim()).filter(Boolean)); break;
      case '--json': args.json = true; break;
      case '--dry-run':
        if (args.explicitMode && args.explicitMode !== 'dry-run') throw new Error('Use only one of --dry-run or --execute.');
        args.mode = 'dry-run';
        args.explicitMode = 'dry-run';
        break;
      case '--execute':
        if (args.explicitMode && args.explicitMode !== 'execute') throw new Error('Use only one of --dry-run or --execute.');
        args.mode = 'execute';
        args.explicitMode = 'execute';
        break;
      case '--help':
      case '-h': args.help = true; break;
      default: throw new Error(`Unknown argument: ${token}`);
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
      } else source += '[^/]*';
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
function matchesAny(file, globs = []) { return globs.some((glob) => matchesGlob(file, glob)); }
function uniqueSorted(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }

async function loadJson(filePath, label) {
  let raw;
  try { raw = await readFile(filePath, 'utf8'); }
  catch (error) { throw new Error(`${label} read failed at ${filePath}: ${error.message}`); }
  try { return JSON.parse(raw); }
  catch (error) { throw new Error(`${label} JSON parse failed at ${filePath}: ${error.message}`); }
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

function validateAndApplyBindings(originalMap, bindings) {
  if (!bindings || typeof bindings !== 'object') throw new Error('SR-3 bindings must be a JSON object.');
  if (bindings.schemaVersion !== 1) throw new Error(`Unsupported bindings schemaVersion: ${String(bindings.schemaVersion)}`);
  if (bindings.impactMapId !== originalMap.id) throw new Error(`Bindings impactMapId ${bindings.impactMapId} != ${originalMap.id}`);
  if (!bindings.bindings || typeof bindings.bindings !== 'object' || Array.isArray(bindings.bindings)) throw new Error('SR-3 bindings.bindings must be an object.');
  if (!Array.isArray(bindings.unresolvedGateIds)) throw new Error('SR-3 bindings.unresolvedGateIds must be an array.');

  const sr1Unbound = Object.entries(originalMap.gates)
    .filter(([, gate]) => gate?.resolutionStatus === 'REQUIRES_SR2_BINDING' && gate?.executable !== true)
    .map(([gateId]) => gateId).sort();
  const boundIds = Object.keys(bindings.bindings).sort();
  const unresolvedIds = [...new Set(bindings.unresolvedGateIds)].sort();
  const overlap = boundIds.filter((gateId) => unresolvedIds.includes(gateId));
  if (overlap.length) throw new Error(`Bindings overlap bound/unresolved gates: ${overlap.join(', ')}`);
  const accounted = [...new Set([...boundIds, ...unresolvedIds])].sort();
  if (JSON.stringify(accounted) !== JSON.stringify(sr1Unbound)) {
    const missing = sr1Unbound.filter((gateId) => !accounted.includes(gateId));
    const extra = accounted.filter((gateId) => !sr1Unbound.includes(gateId));
    throw new Error(`SR-3 binding coverage drift. missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]`);
  }

  const map = JSON.parse(JSON.stringify(originalMap));
  for (const [gateId, binding] of Object.entries(bindings.bindings)) {
    const gate = map.gates[gateId];
    if (!gate) throw new Error(`Binding references unknown gate: ${gateId}`);
    if (Array.isArray(gate.members)) throw new Error(`Cannot bind composite gate to command: ${gateId}`);
    if (typeof binding.command !== 'string' || !binding.command.trim()) throw new Error(`Binding ${gateId} is missing command.`);
    gate.command = binding.command.trim();
    gate.executable = true;
    gate.resolutionStatus = 'SR3_VERIFIED_BINDING';
    gate.bindingId = bindings.id;
    gate.bindingEvidence = binding.evidence ?? null;
    gate.bindingScope = binding.scope ?? null;
  }
  return {
    map,
    bindingMeta: {
      id: bindings.id ?? null,
      status: bindings.status ?? null,
      boundGateIds: boundIds,
      unresolvedGateIds: unresolvedIds,
    },
  };
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
  const emptyBase = {
    ...meta,
    changedFiles,
    docsOnly: false,
    affectedDomains: [],
    matchedRules: [],
    unknownPaths: [],
    requestedGates: [],
    compositeGates: [],
    leafGates: [],
    executableGates: [],
    unboundGates: [],
    skippedByRule: [],
    execution: null,
  };
  if (changedFiles.length === 0) return { ...emptyBase, status: 'PASS_NO_CHANGES', note: 'No validator commands selected.' };

  const docsOnlyGlobs = map.docsOnly?.globs ?? [];
  const docsOnly = docsOnlyGlobs.length > 0 && changedFiles.every((file) => matchesAny(file, docsOnlyGlobs));
  if (docsOnly) {
    return { ...emptyBase, status: 'PASS_DOCS_ONLY', docsOnly: true, requestedGates: map.docsOnly?.selectedGates ?? [], note: 'Documentation-only bypass applied.' };
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
    const entry = {
      id: gateId,
      domain: gate.domain ?? null,
      kind: gate.kind ?? null,
      command: gate.command ?? null,
      resolutionStatus: gate.resolutionStatus ?? null,
      bindingId: gate.bindingId ?? null,
    };
    if (gate.domain) domains.push(gate.domain);
    if (gate.executable === true && typeof gate.command === 'string' && gate.command.trim()) executableGates.push(entry);
    else unboundGates.push(entry);
  }

  const selectedSet = new Set([...requestedGates, ...leafIds, ...compositeIds]);
  const skippedByRule = uniqueSorted(doNotSelectCandidates.filter((gateId) => !selectedSet.has(gateId)));
  let status = 'PASS';
  if (unknownPaths.length > 0) status = 'BLOCKED_UNKNOWN_PATH';
  else if (unboundGates.length > 0) status = 'BLOCKED_UNBOUND';
  return {
    ...emptyBase,
    status,
    affectedDomains: uniqueSorted(domains),
    matchedRules: uniqueSorted(matchedRuleIds),
    unknownPaths: uniqueSorted(unknownPaths),
    requestedGates,
    compositeGates: compositeIds,
    leafGates: leafIds,
    executableGates,
    unboundGates,
    skippedByRule,
    note: 'Selection complete.',
  };
}

function buildExecutionPlan(executableGates) {
  const byCommand = new Map();
  const plan = [];
  for (const gate of executableGates) {
    const command = gate.command.trim();
    if (!byCommand.has(command)) {
      const step = { command, gateIds: [gate.id] };
      byCommand.set(command, step);
      plan.push(step);
    } else byCommand.get(command).gateIds.push(gate.id);
  }
  return plan;
}
function commandTargetPreflight(command) {
  const match = command.match(/^(?:node|python|python3)\s+((?:scripts|tools)\/[^\s]+)$/);
  if (!match) return { checked: false, ok: true, target: null };
  const target = path.join(repoRoot, match[1]);
  return { checked: true, ok: existsSync(target), target: match[1] };
}

function executeSelected(report, jsonMode) {
  const plan = buildExecutionPlan(report.executableGates);
  const execution = {
    mode: 'execute',
    policy: 'FAIL_FAST',
    commandDeduplication: 'EXACT_COMMAND_STRING',
    plannedCommandCount: plan.length,
    results: [],
  };
  if (report.status.startsWith('BLOCKED_')) {
    execution.blockedBeforeExecution = true;
    execution.blockReason = report.status;
    return { ...report, execution };
  }
  if (report.status === 'PASS_NO_CHANGES' || report.status === 'PASS_DOCS_ONLY') {
    execution.blockedBeforeExecution = false;
    return { ...report, execution };
  }

  for (let index = 0; index < plan.length; index += 1) {
    const step = plan[index];
    const preflight = commandTargetPreflight(step.command);
    if (!preflight.ok) {
      execution.results.push({ ...step, status: 'FAIL', exitCode: null, error: `Command target missing: ${preflight.target}` });
      for (const remaining of plan.slice(index + 1)) execution.results.push({ ...remaining, status: 'NOT_RUN', exitCode: null, reason: 'FAIL_FAST' });
      return { ...report, status: 'FAILED_VALIDATOR', execution };
    }
    if (!jsonMode) process.stdout.write(`\n>>> ${step.gateIds.join(', ')}\n$ ${step.command}\n`);
    const child = spawnSync(step.command, {
      cwd: repoRoot,
      shell: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: MAX_CHILD_BUFFER,
    });
    if (!jsonMode) {
      if (child.stdout) process.stdout.write(child.stdout);
      if (child.stderr) process.stderr.write(child.stderr);
    }
    const exitCode = Number.isInteger(child.status) ? child.status : 1;
    const passed = !child.error && exitCode === 0;
    execution.results.push({
      ...step,
      status: passed ? 'PASS' : 'FAIL',
      exitCode,
      signal: child.signal ?? null,
      error: child.error?.message ?? null,
      stderrTail: passed ? null : (child.stderr ?? '').slice(-4000),
    });
    if (!passed) {
      for (const remaining of plan.slice(index + 1)) execution.results.push({ ...remaining, status: 'NOT_RUN', exitCode: null, reason: 'FAIL_FAST' });
      return { ...report, status: 'FAILED_VALIDATOR', execution };
    }
  }
  return { ...report, status: 'PASS_EXECUTED', execution };
}

function printSection(title, items, formatter = (value) => value) {
  console.log(`\n${title} (${items.length})`);
  if (items.length === 0) return console.log('  - none');
  for (const item of items) console.log(`  - ${formatter(item)}`);
}
function printHuman(report) {
  console.log('SMART REGRESSION RUNNER — SR-3');
  console.log(`MODE: ${report.mode}`);
  console.log(`MAP: ${report.mapId} / ${report.mapStatus}`);
  console.log(`BINDINGS: ${report.bindingId} / ${report.bindingStatus}`);
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
  printSection('EXECUTABLE GATES', report.executableGates, (gate) => `${gate.id} :: ${gate.command}`);
  printSection('UNBOUND GATES', report.unboundGates, (gate) => `${gate.id} :: ${gate.resolutionStatus ?? 'UNRESOLVED'}`);
  printSection('SKIPPED BY MATCHED RULE', report.skippedByRule);
  if (report.execution) {
    printSection('EXECUTION RESULTS', report.execution.results, (result) => {
      const gates = result.gateIds?.join(', ') ?? 'unknown';
      const code = result.exitCode == null ? '' : ` exit=${result.exitCode}`;
      return `${result.status}${code} :: ${gates} :: ${result.command}`;
    });
    if (report.execution.blockedBeforeExecution) console.log(`\nEXECUTION: blocked before command start (${report.execution.blockReason})`);
  } else console.log('\nEXECUTION: none (dry-run)');
  console.log(`RESULT: ${report.status}`);
}
function exitCodeFor(report) {
  if (report.status.startsWith('BLOCKED_')) return BLOCKED_EXIT_CODE;
  if (report.status === 'FAILED_VALIDATOR') return VALIDATOR_FAILED_EXIT_CODE;
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const originalMap = await loadJson(args.mapPath, 'Impact map');
  validateImpactMap(originalMap);
  const bindings = await loadJson(args.bindingsPath, 'SR-3 bindings');
  const { map, bindingMeta } = validateAndApplyBindings(originalMap, bindings);
  validateImpactMap(map);

  const explicitFiles = uniqueSorted(args.files.map(normalizeRepoPath).filter(Boolean));
  const refs = resolveDiffRefs(args);
  const changedFiles = explicitFiles.length > 0 ? explicitFiles : readChangedFilesFromGit(refs.base, refs.head);
  const changeSource = explicitFiles.length > 0 ? 'explicit-files' : 'git-diff';
  let report = analyzeChanges(changedFiles, map, {
    mode: args.mode,
    mapId: map.id ?? null,
    mapStatus: map.status ?? null,
    mapPath: path.relative(repoRoot, args.mapPath).replaceAll('\\', '/'),
    bindingId: bindingMeta.id,
    bindingStatus: bindingMeta.status,
    bindingPath: path.relative(repoRoot, args.bindingsPath).replaceAll('\\', '/'),
    globallyBoundGateIds: bindingMeta.boundGateIds,
    globallyUnresolvedGateIds: bindingMeta.unresolvedGateIds,
    changeSource,
    base: changeSource === 'git-diff' ? refs.base : null,
    head: changeSource === 'git-diff' ? refs.head : null,
  });
  if (args.mode === 'execute') report = executeSelected(report, args.json);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  return exitCodeFor(report);
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(`SMART REGRESSION ERROR: ${error.message}`);
  process.exitCode = 1;
});
