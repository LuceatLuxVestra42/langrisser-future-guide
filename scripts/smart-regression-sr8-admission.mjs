#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const selectorPath = path.join(repoRoot, 'scripts', 'smart-regression-sr4.mjs');
const defaultPolicyPath = path.join(repoRoot, 'data', 'contracts', 'regression-partial-replacement.sr8.v1.json');
const MAX_BUFFER = 50 * 1024 * 1024;

function usage() {
  return [
    'Smart Regression SR-8 partial replacement admission',
    '',
    'Usage:',
    '  node scripts/smart-regression-sr8-admission.mjs --dry-run [selector diff args]',
    '  node scripts/smart-regression-sr8-admission.mjs --execute [selector diff args]',
    '',
    'SR-8 options:',
    '  --policy <path>   Partial replacement policy JSON',
    '  --json            Machine-readable output',
    '  --dry-run         Classify only',
    '  --execute         Execute Smart Regression only when replacement-eligible',
    '',
    'Other arguments are forwarded to the SR-4 selector, for example:',
    '  --base <ref> --head <ref>',
    '  --file <path>',
    '  --files <comma-separated paths>',
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    mode: 'dry-run',
    json: false,
    policyPath: defaultPolicyPath,
    help: false,
    selectorArgs: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const take = () => {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
      return value;
    };

    if (token === '--dry-run') parsed.mode = 'dry-run';
    else if (token === '--execute') parsed.mode = 'execute';
    else if (token === '--json') parsed.json = true;
    else if (token === '--policy') parsed.policyPath = path.resolve(process.cwd(), take());
    else if (token === '--help' || token === '-h') parsed.help = true;
    else if (['--base', '--head', '--file', '--files', '--map', '--fallback-policy', '--bindings'].includes(token)) {
      const value = take();
      parsed.selectorArgs.push(token, value);
    } else throw new Error(`Unknown SR-8 option: ${token}`);
  }
  return parsed;
}

function loadPolicy(filePath) {
  const policy = JSON.parse(readFileSync(filePath, 'utf8'));
  if (policy?.schemaVersion !== 1 || !Array.isArray(policy.classes)) {
    throw new Error(`Invalid SR-8 policy: ${filePath}`);
  }
  if (!Number.isInteger(policy.fallbackExitCode)) {
    throw new Error('SR-8 policy fallbackExitCode must be an integer.');
  }
  return policy;
}

function runSelector(mode, selectorArgs) {
  const child = spawnSync(process.execPath, [
    selectorPath,
    mode === 'execute' ? '--execute' : '--dry-run',
    '--json',
    ...selectorArgs,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  });

  let report = null;
  try {
    report = JSON.parse(child.stdout || '{}');
  } catch (error) {
    throw new Error(`Selector JSON parse failed: ${error.message}; stderr=${(child.stderr ?? '').slice(-2000)}`);
  }

  return {
    exitCode: Number.isInteger(child.status) ? child.status : 1,
    stderrTail: (child.stderr ?? '').slice(-4000),
    report,
  };
}

function sameSet(left = [], right = []) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function subsetOf(values = [], allowed = []) {
  const allow = new Set(allowed);
  return values.every((value) => allow.has(value));
}

function evaluateClass(report, rule) {
  const reasons = [];
  const requested = report.requestedGates ?? [];
  const composite = report.compositeGates ?? [];
  const leaf = report.leafGates ?? [];
  const domains = report.affectedDomains ?? [];
  const unknown = report.unknownPaths ?? [];
  const unbound = report.unboundGates ?? [];

  if (!(rule.allowedSelectorStatuses ?? ['PASS']).includes(report.status)) {
    reasons.push(`selector-status:${String(report.status)}`);
  }
  if (rule.requireUnknownPathsEmpty && unknown.length > 0) {
    reasons.push(`unknown-paths:${unknown.length}`);
  }
  if (rule.requireUnboundGatesEmpty && unbound.length > 0) {
    reasons.push(`unbound-gates:${unbound.length}`);
  }
  if (!sameSet(leaf, rule.exactLeafGates ?? [])) {
    reasons.push(`leaf-set:${leaf.join(',') || 'none'}`);
  }
  if (!subsetOf(domains, rule.allowedDomains ?? [])) {
    reasons.push(`domains:${domains.join(',') || 'none'}`);
  }
  for (const gateId of rule.forbidRequestedGates ?? []) {
    if (requested.includes(gateId)) reasons.push(`forbidden-requested:${gateId}`);
  }
  for (const gateId of rule.forbidCompositeGates ?? []) {
    if (composite.includes(gateId)) reasons.push(`forbidden-composite:${gateId}`);
  }

  return { eligible: reasons.length === 0, reasons };
}

function classify(report, policy) {
  const evaluations = policy.classes.map((rule) => ({
    id: rule.id,
    ...evaluateClass(report, rule),
  }));
  const matched = evaluations.find((row) => row.eligible) ?? null;
  return {
    replacementEligible: Boolean(matched),
    replacementClassId: matched?.id ?? null,
    evaluations,
  };
}

function compactSelector(report) {
  return {
    status: report.status ?? null,
    changeSource: report.changeSource ?? null,
    base: report.base ?? null,
    head: report.head ?? null,
    changedFiles: report.changedFiles ?? [],
    affectedDomains: report.affectedDomains ?? [],
    matchedRules: report.matchedRules ?? [],
    requestedGates: report.requestedGates ?? [],
    compositeGates: report.compositeGates ?? [],
    leafGates: report.leafGates ?? [],
    executableGateIds: report.executableGates?.map((row) => row.id) ?? [],
    unboundGateIds: report.unboundGates?.map((row) => row.id) ?? [],
    unknownPaths: report.unknownPaths ?? [],
  };
}

function printHuman(summary) {
  console.log('SMART REGRESSION — SR-8 PARTIAL REPLACEMENT');
  console.log(`MODE: ${summary.mode}`);
  console.log(`DECISION: ${summary.decision}`);
  console.log(`CLASS: ${summary.replacementClassId ?? 'none'}`);
  console.log(`SELECTOR: ${summary.selector.status}`);
  if (summary.execution) console.log(`EXECUTION: ${summary.execution.status}`);
  if (!summary.replacementEligible) {
    const reasons = summary.evaluations.flatMap((row) => row.reasons.map((reason) => `${row.id}:${reason}`));
    console.log(`REASONS: ${reasons.join(' | ') || 'no allowlisted replacement class matched'}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }

  const policy = loadPolicy(args.policyPath);
  const selection = runSelector('dry-run', args.selectorArgs);
  if (![0, 2].includes(selection.exitCode)) {
    throw new Error(`SR-4 selector failed before admission, exit=${selection.exitCode}: ${selection.stderrTail}`);
  }

  const admission = classify(selection.report, policy);
  const summary = {
    version: 1,
    stage: 'SMART_REGRESSION_SR8',
    mode: args.mode,
    policyId: policy.id,
    policyStatus: policy.status,
    decision: admission.replacementEligible ? 'REPLACEMENT_ELIGIBLE' : policy.defaultDecision,
    replacementEligible: admission.replacementEligible,
    replacementClassId: admission.replacementClassId,
    evaluations: admission.evaluations,
    selectorExitCode: selection.exitCode,
    selector: compactSelector(selection.report),
    execution: null,
  };

  if (!admission.replacementEligible) {
    if (args.json) console.log(JSON.stringify(summary, null, 2));
    else printHuman(summary);
    return policy.fallbackExitCode;
  }

  if (args.mode === 'execute') {
    const execution = runSelector('execute', args.selectorArgs);
    summary.execution = {
      exitCode: execution.exitCode,
      status: execution.report.status ?? null,
      plannedCommandCount: execution.report.execution?.plannedCommandCount ?? null,
      results: execution.report.execution?.results ?? [],
      stderrTail: execution.stderrTail || null,
    };
    summary.decision = execution.exitCode === 0 && execution.report.status === 'PASS_EXECUTED'
      ? 'REPLACEMENT_EXECUTED'
      : 'REPLACEMENT_FAILED';

    if (args.json) console.log(JSON.stringify(summary, null, 2));
    else printHuman(summary);
    return summary.decision === 'REPLACEMENT_EXECUTED' ? 0 : 1;
  }

  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printHuman(summary);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`SMART REGRESSION SR-8 ERROR: ${error.message}`);
  process.exitCode = 1;
}
