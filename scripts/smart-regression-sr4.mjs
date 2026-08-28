#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const defaultMapPath = path.join(repoRoot, 'data', 'contracts', 'regression-impact-map.v1.json');
const defaultPolicyPath = path.join(repoRoot, 'data', 'contracts', 'regression-fallback-policy.sr4.v1.json');
const runnerPath = path.join(repoRoot, 'scripts', 'smart-regression.mjs');

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

function parseWrapperArgs(argv) {
  const parsed = {
    base: null,
    head: null,
    files: [],
    mapPath: defaultMapPath,
    policyPath: defaultPolicyPath,
    help: false,
  };
  const forwarded = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const take = () => {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
      return value;
    };

    if (token === '--base') {
      const value = take();
      parsed.base = value;
      forwarded.push(token, value);
    } else if (token === '--head') {
      const value = take();
      parsed.head = value;
      forwarded.push(token, value);
    } else if (token === '--file') {
      const value = take();
      parsed.files.push(value);
      forwarded.push(token, value);
    } else if (token === '--files') {
      const value = take();
      parsed.files.push(...value.split(',').map((x) => x.trim()).filter(Boolean));
      forwarded.push(token, value);
    } else if (token === '--map') {
      parsed.mapPath = path.resolve(process.cwd(), take());
    } else if (token === '--fallback-policy') {
      parsed.policyPath = path.resolve(process.cwd(), take());
    } else if (token === '--help' || token === '-h') {
      parsed.help = true;
      forwarded.push(token);
    } else {
      forwarded.push(token);
    }
  }

  return { parsed, forwarded };
}

function resolveDiffRefs(parsed) {
  const base = parsed.base ?? process.env.SMART_REGRESSION_BASE ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD~1');
  const head = parsed.head ?? process.env.SMART_REGRESSION_HEAD ?? 'HEAD';
  return { base, head };
}

function readChangedFiles(parsed) {
  const explicit = [...new Set(parsed.files.map(normalizeRepoPath).filter(Boolean))].sort();
  if (explicit.length) return explicit;

  const { base, head } = resolveDiffRefs(parsed);
  const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMRD', '--relative', `${base}...${head}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`git diff failed for ${base}...${head}: ${result.stderr?.trim() || 'unknown error'}`);
  }
  return [...new Set(result.stdout.split(/\r?\n/u).map(normalizeRepoPath).filter(Boolean))].sort();
}

function loadJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} load failed at ${filePath}: ${error.message}`);
  }
}

function validatePolicy(policy, map) {
  if (policy?.schemaVersion !== 1) throw new Error(`Unsupported SR-4 policy schemaVersion: ${String(policy?.schemaVersion)}`);
  if (policy?.impactMapId !== map.id) throw new Error(`SR-4 policy impactMapId ${policy?.impactMapId} != ${map.id}`);
  if (!Array.isArray(policy.catchAllRuleIds)) throw new Error('SR-4 policy catchAllRuleIds must be an array.');
  if (!Array.isArray(policy.canonicalRules)) throw new Error('SR-4 policy canonicalRules must be an array.');

  const ruleIds = new Set(map.rules.map((rule) => rule.id));
  for (const ruleId of policy.catchAllRuleIds) {
    if (!ruleIds.has(ruleId)) throw new Error(`Unknown catch-all rule id: ${ruleId}`);
  }

  const gateIds = new Set(Object.keys(map.gates));
  for (const rule of policy.canonicalRules) {
    if (!rule.id || !Array.isArray(rule.match) || !Array.isArray(rule.select)) {
      throw new Error(`Invalid SR-4 canonical rule: ${JSON.stringify(rule)}`);
    }
    for (const gateId of rule.select) {
      if (!gateIds.has(gateId)) throw new Error(`SR-4 canonical rule ${rule.id} references unknown gate: ${gateId}`);
    }
  }
  for (const gateId of policy.safeFallbackMembers ?? []) {
    if (!gateIds.has(gateId)) throw new Error(`SR-4 safe fallback references unknown gate: ${gateId}`);
  }
}

function makeEffectiveMap(baseMap, policy, changedFiles) {
  validatePolicy(policy, baseMap);
  const map = JSON.parse(JSON.stringify(baseMap));
  const catchAllSet = new Set(policy.catchAllRuleIds);
  const baseOwnerRules = map.rules.filter((rule) => !catchAllSet.has(rule.id));
  const canonicalRules = policy.canonicalRules.map((rule) => ({ ...rule, sr4RuleClass: 'CANONICAL_OWNER' }));
  const ownerRules = [...canonicalRules, ...baseOwnerRules];
  const catchAllRules = map.rules.filter((rule) => catchAllSet.has(rule.id));
  const generatedFallbackRules = [];

  for (const file of changedFiles) {
    const ownerMatches = ownerRules.filter((rule) => matchesAny(file, rule.match));
    if (ownerMatches.length > 0) continue;

    for (const rule of catchAllRules.filter((candidate) => matchesAny(file, candidate.match))) {
      const selectOverride = policy.catchAllSelectOverrides?.[rule.id];
      generatedFallbackRules.push({
        ...rule,
        id: `sr4-fallback:${rule.id}:${file}`,
        match: [file],
        select: Array.isArray(selectOverride) ? selectOverride : rule.select,
        reason: `SR-4 fallback because no specific/canonical owner rule matched ${file}. ${rule.reason ?? ''}`.trim(),
        sr4RuleClass: 'FALLBACK_IF_UNOWNED',
      });
    }
  }

  map.rules = [...canonicalRules, ...baseOwnerRules, ...generatedFallbackRules];

  if (map.gates?.['global.safe-fallback'] && Array.isArray(policy.safeFallbackMembers)) {
    map.gates['global.safe-fallback'].members = [...policy.safeFallbackMembers];
  }

  map.fallback = {
    ...(map.fallback ?? {}),
    unknownPath: [...(policy.unknownPathGates ?? map.fallback?.unknownPath ?? [])],
    reason: policy.unknownPathReason ?? map.fallback?.reason ?? null,
  };
  map.status = 'SR4_FALLBACK_OVERLAY';
  map.pathMatching = {
    ...(map.pathMatching ?? {}),
    evaluation: 'SPECIFIC_AND_CANONICAL_OWNER_RULES_PLUS_FALLBACK_IF_UNOWNED',
    sr4CatchAllRuleIds: [...policy.catchAllRuleIds],
  };
  map.sr4 = {
    policyId: policy.id,
    policyStatus: policy.status,
    changedFileCount: changedFiles.length,
    generatedFallbackRuleCount: generatedFallbackRules.length,
  };

  return map;
}

function main() {
  const { parsed, forwarded } = parseWrapperArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log('Smart Regression Runner — SR-4 fallback overlay');
    console.log('Additional option: --fallback-policy <path>');
    const result = spawnSync(process.execPath, [runnerPath, '--help'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    return Number.isInteger(result.status) ? result.status : 1;
  }

  const baseMap = loadJson(parsed.mapPath, 'Impact map');
  const policy = loadJson(parsed.policyPath, 'SR-4 fallback policy');
  const changedFiles = readChangedFiles(parsed);
  const effectiveMap = makeEffectiveMap(baseMap, policy, changedFiles);
  const tempDir = mkdtempSync(path.join(tmpdir(), 'smart-regression-sr4-'));
  const effectiveMapPath = path.join(tempDir, 'regression-impact-map.sr4-effective.json');
  writeFileSync(effectiveMapPath, `${JSON.stringify(effectiveMap, null, 2)}\n`);

  try {
    const result = spawnSync(process.execPath, [runnerPath, ...forwarded, '--map', effectiveMapPath], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, SMART_REGRESSION_SR4_POLICY: policy.id ?? 'unknown' },
    });
    if (result.error) throw result.error;
    return Number.isInteger(result.status) ? result.status : 1;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`SMART REGRESSION SR-4 ERROR: ${error.message}`);
  process.exitCode = 1;
}
