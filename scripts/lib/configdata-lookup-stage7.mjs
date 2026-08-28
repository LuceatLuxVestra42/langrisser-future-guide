import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

export const STAGE7_CONTRACT_PATH = 'data/contracts/configdata-lookup-stage7-smart-regression-contract.v1.json';

function normalizePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadStage7Inputs() {
  const contract = readJson(STAGE7_CONTRACT_PATH);
  return {
    contract,
    stage6Summary: readJson(contract.predecessor.summary),
    stage6Manifest: readJson(contract.predecessor.manifest),
    stage2Contract: readJson(contract.supportingContracts.stage2),
    stage4Contract: readJson(contract.supportingContracts.stage4),
  };
}

function collectDataPaths(value, out = new Set()) {
  if (typeof value === 'string') {
    if (value.startsWith('data/')) out.add(normalizePath(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectDataPaths(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectDataPaths(item, out);
  }
  return out;
}

export function collectTrackedLookupPaths(inputs) {
  const out = collectDataPaths(inputs.stage6Manifest);
  out.add(normalizePath(inputs.contract.predecessor.manifest));
  out.add(normalizePath(inputs.contract.predecessor.summary));
  out.add(normalizePath(inputs.contract.predecessor.contract));
  return out;
}

function addReason(reasons, pathValue, code, domain = null, detail = null) {
  reasons.push({
    path: pathValue,
    code,
    ...(domain ? { domain } : {}),
    ...(detail ? { detail } : {}),
  });
}

function domainOutputPathMap(domains, field = 'output') {
  const out = new Map();
  for (const [domain, spec] of Object.entries(domains || {})) {
    const value = spec?.[field] ?? spec?.path;
    if (typeof value === 'string') out.set(normalizePath(value), domain);
  }
  return out;
}

export function selectSmartRegression(changedPaths, inputs = loadStage7Inputs()) {
  const paths = [...new Set((changedPaths || []).map(normalizePath).filter(Boolean))].sort();
  const { contract, stage6Manifest, stage2Contract, stage4Contract } = inputs;
  const domainOrder = contract.selectionPolicy.pipelineOrder.filter((name) => name !== 'ConfigDataLookup');
  const trackedLookupPaths = collectTrackedLookupPaths(inputs);
  const sourceTypeByPath = new Map(
    Object.entries(stage2Contract.sourceTypes || {}).map(([type, sourcePath]) => [normalizePath(sourcePath), type]),
  );
  const stage2OutputDomains = domainOutputPathMap(stage6Manifest.layers?.stage2?.domains, 'output');
  const stage4OutputDomains = domainOutputPathMap(stage6Manifest.layers?.stage4?.domains, 'path');
  const canonicalByPath = new Map(
    Object.entries(stage4Contract.canonicalInputs || {}).map(([name, spec]) => [normalizePath(spec.path), name]),
  );

  let lookupAffected = false;
  let failClosed = false;
  const affectedDomains = new Set();
  const reasons = [];

  for (const changedPath of paths) {
    if (trackedLookupPaths.has(changedPath)) {
      lookupAffected = true;
      addReason(reasons, changedPath, 'LOOKUP_TRACKED_PATH');
    }

    const sourceType = sourceTypeByPath.get(changedPath);
    if (sourceType) {
      lookupAffected = true;
      for (const [domain, spec] of Object.entries(stage6Manifest.layers?.stage2?.domains || {})) {
        if ((spec.sourceTypes || []).includes(sourceType)) {
          affectedDomains.add(domain);
          addReason(reasons, changedPath, 'RAW_SOURCE_DOMAIN', domain, sourceType);
        }
      }
      continue;
    }

    if (/^data\/configdata\/ConfigData[^/]*\.json$/.test(changedPath)) {
      lookupAffected = true;
      failClosed = true;
      for (const domain of domainOrder) {
        affectedDomains.add(domain);
        addReason(reasons, changedPath, 'UNKNOWN_CONFIGDATA_FAIL_CLOSED', domain);
      }
      continue;
    }

    const stage2Domain = stage2OutputDomains.get(changedPath);
    if (stage2Domain) {
      lookupAffected = true;
      affectedDomains.add(stage2Domain);
      addReason(reasons, changedPath, 'STAGE2_DOMAIN_ARTIFACT', stage2Domain);
    }

    const canonicalName = canonicalByPath.get(changedPath);
    if (canonicalName) {
      lookupAffected = true;
      for (const domain of contract.canonicalImpact?.[canonicalName] || []) {
        affectedDomains.add(domain);
        addReason(reasons, changedPath, 'STAGE4_CANONICAL_INPUT', domain, canonicalName);
      }
    }

    const stage4Domain = stage4OutputDomains.get(changedPath);
    if (stage4Domain) {
      lookupAffected = true;
      affectedDomains.add(stage4Domain);
      addReason(reasons, changedPath, 'STAGE4_DOMAIN_ARTIFACT', stage4Domain);
    }
  }

  const selectedPipelines = [];
  if (lookupAffected) selectedPipelines.push('ConfigDataLookup');
  for (const domain of domainOrder) {
    if (affectedDomains.has(domain)) selectedPipelines.push(domain);
  }

  const pipelineDetails = selectedPipelines.map((name) => ({
    name,
    ...contract.pipelines[name],
  }));

  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_7',
    status: failClosed
      ? 'FAIL_CLOSED_ALL_KNOWN_DOMAINS'
      : selectedPipelines.length
        ? 'IMPACT_DETECTED'
        : 'NO_CONFIGDATA_IMPACT',
    changedPaths: paths,
    affectedDomains: domainOrder.filter((domain) => affectedDomains.has(domain)),
    selectedPipelines,
    pipelineDetails,
    failClosed,
    reasons: reasons.sort((a, b) =>
      a.path.localeCompare(b.path) ||
      a.code.localeCompare(b.code) ||
      String(a.domain || '').localeCompare(String(b.domain || '')) ||
      String(a.detail || '').localeCompare(String(b.detail || ''))),
  };
}

export function changedPathsFromGit(base, head) {
  if (!base || !head) throw new Error('Both --base and --head are required together.');
  const stdout = execFileSync('git', ['diff', '--name-only', '--no-renames', base, head], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function changedPathsFromWorkingTree() {
  const stdout = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const paths = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const raw = line.slice(3).trim();
    const value = raw.includes(' -> ') ? raw.split(' -> ').at(-1) : raw;
    if (value) paths.push(value.replace(/^"|"$/g, ''));
  }
  return paths;
}

export function renderPlan(plan) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function renderDoctor(plan) {
  const lines = [
    'PROJECT_DOCTOR_CONFIGDATA_STAGE7',
    `status=${plan.status}`,
    `changed=${plan.changedPaths.length}`,
    `domains=${plan.affectedDomains.length ? plan.affectedDomains.join(',') : '-'}`,
    `pipelines=${plan.selectedPipelines.length ? plan.selectedPipelines.join(',') : '-'}`,
    `failClosed=${plan.failClosed}`,
  ];
  for (const reason of plan.reasons) {
    lines.push(`- ${reason.path} :: ${reason.code}${reason.domain ? ` -> ${reason.domain}` : ''}${reason.detail ? ` (${reason.detail})` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

export function writeGitHubOutputs(filePath, plan) {
  const values = {
    status: plan.status,
    pipeline_count: String(plan.selectedPipelines.length),
    lookup: String(plan.selectedPipelines.includes('ConfigDataLookup')),
    hero: String(plan.selectedPipelines.includes('Hero')),
    soldier: String(plan.selectedPipelines.includes('Soldier')),
    equipment: String(plan.selectedPipelines.includes('Equipment')),
    fail_closed: String(plan.failClosed),
  };
  fs.appendFileSync(filePath, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
}

function runArgv(argv) {
  if (!Array.isArray(argv) || argv.length < 2 || argv.some((value) => typeof value !== 'string' || !value)) {
    throw new Error(`Invalid allowlisted command argv: ${JSON.stringify(argv)}`);
  }
  const result = spawnSync(argv[0], argv.slice(1), { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function runSelectedPipelines(plan, inputs = loadStage7Inputs()) {
  if (!plan.selectedPipelines.length) {
    return { status: 'NO_CONFIGDATA_IMPACT', executed: [] };
  }

  const { contract } = inputs;
  const allowedOrder = contract.selectionPolicy.pipelineOrder;
  for (const name of plan.selectedPipelines) {
    if (!allowedOrder.includes(name) || !contract.pipelines[name]) {
      throw new Error(`Selected pipeline is not allowlisted by Stage 7 contract: ${name}`);
    }
  }

  if (plan.selectedPipelines.includes('ConfigDataLookup')) {
    const cleanStatus = runArgv(['node', 'scripts/configdata-lookup-stage6.mjs', 'check']);
    if (cleanStatus === 2) {
      return {
        status: 'DEFERRED_STAGE6_STALE',
        executed: [],
        deferred: plan.selectedPipelines,
      };
    }
    if (cleanStatus !== 0) throw new Error(`Stage 6 clean check failed with exit code ${cleanStatus}`);
  }

  const executed = [];
  for (const name of allowedOrder) {
    if (!plan.selectedPipelines.includes(name)) continue;
    const pipeline = contract.pipelines[name];
    const status = runArgv(pipeline.command);
    if (status !== 0) throw new Error(`${name} validation pipeline failed with exit code ${status}`);
    executed.push(name);
  }
  return { status: 'PASS_SELECTED_SMART_REGRESSION', executed };
}

export function buildStage7Summary(inputs = loadStage7Inputs()) {
  const { contract, stage6Summary, stage6Manifest, stage4Contract } = inputs;
  const domainPipelines = contract.selectionPolicy.pipelineOrder.filter((name) => name !== 'ConfigDataLookup');
  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_7',
    status: contract.validation.passStatus,
    contract: STAGE7_CONTRACT_PATH,
    predecessorStatus: stage6Summary.status,
    dependencyManifestStatus: stage6Manifest.status,
    pipelineCount: Object.keys(contract.pipelines).length,
    domainPipelineCount: domainPipelines.length,
    domainPipelines,
    trackedRawSourceCount: Object.keys(stage6Manifest.rawSources || {}).length,
    canonicalInputCount: Object.keys(stage4Contract.canonicalInputs || {}).length,
    executionMode: 'VALIDATION_ONLY',
    semanticBoundary: {
      dependencyManifestDriven: true,
      explicitDomainOwnershipOnly: true,
      unknownConfigDataFailsClosed: true,
      allowlistedCommandsOnly: true,
      workflowDispatch: false,
      semanticRebuild: false,
      newRelationDiscovery: false,
      canonicalRelationRecomputation: false,
      rawConfigDataMutation: false,
      nameJoinUsed: false,
      idArithmeticUsed: false,
      transitiveExpansion: false,
      wallClockMetadataUsed: false,
    },
  };
}
