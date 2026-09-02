import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveConfigDataSourcePath } from '../../tools/configdata-lookup/lib/source-root.mjs';
import * as stage1 from './configdata-lookup-stage1.mjs';
import * as stage2 from './configdata-lookup-stage2.mjs';
import * as stage3 from './configdata-lookup-stage3.mjs';
import * as stage4 from './configdata-lookup-stage4.mjs';
import * as stage5 from './configdata-lookup-stage5.mjs';

export const STAGE6_CONTRACT_PATH = 'data/contracts/configdata-lookup-stage6-incremental-rebuild-contract.v1.json';

export function sha256Utf8(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function readTextMaybe(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function readJsonMaybe(filePath) {
  const text = await readTextMaybe(filePath);
  return text === null ? null : { text, value: JSON.parse(text) };
}

export async function hashFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return sha256Utf8(text);
}

export async function hashConfigDataSource(logicalPath) {
  const text = await fs.readFile(resolveConfigDataSourcePath(logicalPath), 'utf8');
  return sha256Utf8(text);
}

export async function writeIfChanged(filePath, text) {
  const previous = await readTextMaybe(filePath);
  if (previous === text) return false;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
  return true;
}

export async function loadStage6Contract() {
  return (await stage5.readJson(STAGE6_CONTRACT_PATH)).value;
}

export async function loadContracts() {
  const [s1, s2, s3, s4, s5, s6] = await Promise.all([
    stage1.loadStage1Contract(),
    stage2.loadStage2Contract(),
    stage3.loadStage3Contract(),
    stage4.loadStage4Contract(),
    stage5.loadStage5Contract(),
    loadStage6Contract(),
  ]);
  return { stage1: s1, stage2: s2, stage3: s3, stage4: s4, stage5: s5, stage6: s6 };
}

function unique(values) {
  return [...new Set(values)];
}

function reasonEntry(name, reasons) {
  return { name, reasons: unique(reasons) };
}

function baselineContractChanged(baseline, stageName, currentHash) {
  const prior = baseline?.contracts?.[stageName]?.sha256;
  return typeof prior === 'string' && prior !== currentHash;
}

async function inspectStage1(contract, contractChanged) {
  const dirty = [];
  for (const [entity, spec] of Object.entries(contract.entities)) {
    const reasons = [];
    const sourceText = await fs.readFile(resolveConfigDataSourcePath(spec.source), 'utf8');
    const currentSourceHash = sha256Utf8(sourceText);
    const output = await readJsonMaybe(spec.output);
    if (!output) reasons.push('MISSING_OUTPUT');
    else {
      if (output.value?.stage !== 'CONFIGDATA_LOOKUP_STAGE_1' || output.value?.entity !== entity) reasons.push('OUTPUT_IDENTITY_MISMATCH');
      if (output.value?.source?.sha256 !== currentSourceHash) reasons.push('SOURCE_HASH_MISMATCH');
      if (output.value?.source?.path !== spec.source) reasons.push('SOURCE_PATH_MISMATCH');
    }
    if (contractChanged) reasons.push('CONTRACT_HASH_CHANGED');
    if (reasons.length) dirty.push(reasonEntry(entity, reasons));
  }
  return dirty;
}

function stage2DomainSourceTypes(contract, domain) {
  const types = [];
  for (const relation of contract.relations) {
    if (relation.domain !== domain) continue;
    types.push(relation.sourceType, relation.targetType);
  }
  return unique(types);
}

async function inspectStage2(contract, contractChanged) {
  const dirty = [];
  for (const [domain, outputPath] of Object.entries(contract.outputs)) {
    if (domain === 'summary') continue;
    const reasons = [];
    const output = await readJsonMaybe(outputPath);
    if (!output) reasons.push('MISSING_OUTPUT');
    else {
      if (output.value?.stage !== 'CONFIGDATA_LOOKUP_STAGE_2' || output.value?.domain !== domain) reasons.push('OUTPUT_IDENTITY_MISMATCH');
      for (const type of stage2DomainSourceTypes(contract, domain)) {
        const sourcePath = contract.sourceTypes[type];
        const currentHash = await hashConfigDataSource(sourcePath);
        if (output.value?.sources?.[type]?.sha256 !== currentHash) reasons.push(`SOURCE_HASH_MISMATCH:${type}`);
      }
    }
    if (contractChanged) reasons.push('CONTRACT_HASH_CHANGED');
    if (reasons.length) dirty.push(reasonEntry(domain, reasons));
  }
  return dirty;
}

async function inspectStage3(contract, contractChanged) {
  const reasons = [];
  const manifest = await readJsonMaybe(contract.outputs.manifest);
  if (!manifest) reasons.push('MISSING_MANIFEST');
  else {
    for (const [domain, inputPath] of Object.entries(contract.inputs)) {
      const currentHash = await hashFile(inputPath);
      if (manifest.value?.inputs?.[domain]?.sha256 !== currentHash) reasons.push(`FORWARD_HASH_MISMATCH:${domain}`);
    }
    const predecessorContractHash = await hashFile(contract.predecessor.contract);
    const predecessorSummaryHash = await hashFile(contract.predecessor.summary);
    if (manifest.value?.predecessor?.stage2ContractSha256 !== predecessorContractHash) reasons.push('PREDECESSOR_CONTRACT_HASH_MISMATCH');
    if (manifest.value?.predecessor?.stage2SummarySha256 !== predecessorSummaryHash) reasons.push('PREDECESSOR_SUMMARY_HASH_MISMATCH');
  }
  for (const outputPath of Object.values(contract.outputs.targets)) {
    if ((await readTextMaybe(outputPath)) === null) reasons.push(`MISSING_TARGET:${outputPath}`);
  }
  if (contractChanged) reasons.push('CONTRACT_HASH_CHANGED');
  return reasonEntry('Stage3', reasons);
}

async function inspectStage4(contract, contractChanged) {
  const reasons = [];
  const manifest = await readJsonMaybe(contract.outputs.manifest);
  if (!manifest) reasons.push('MISSING_MANIFEST');
  else {
    for (const [name, spec] of Object.entries(contract.canonicalInputs)) {
      const currentHash = await hashFile(spec.path);
      if (manifest.value?.canonicalInputs?.[name]?.sha256 !== currentHash) reasons.push(`CANONICAL_HASH_MISMATCH:${name}`);
    }
    const predecessorContractHash = await hashFile(contract.predecessor.contract);
    const predecessorSummaryHash = await hashFile(contract.predecessor.summary);
    if (manifest.value?.predecessor?.stage3ContractSha256 !== predecessorContractHash) reasons.push('PREDECESSOR_CONTRACT_HASH_MISMATCH');
    if (manifest.value?.predecessor?.stage3SummarySha256 !== predecessorSummaryHash) reasons.push('PREDECESSOR_SUMMARY_HASH_MISMATCH');
  }
  for (const outputPath of Object.values(contract.outputs.domains)) {
    if ((await readTextMaybe(outputPath)) === null) reasons.push(`MISSING_DOMAIN:${outputPath}`);
  }
  if (contractChanged) reasons.push('CONTRACT_HASH_CHANGED');
  return reasonEntry('Stage4', reasons);
}

async function inspectStage5(contract, contractChanged) {
  const reasons = [];
  const predecessor = await stage5.loadStage5Predecessor(contract);
  const expected = stage5.renderJson(stage5.buildStage5Summary(contract, predecessor.summary));
  const current = await readTextMaybe(contract.outputs.summary);
  if (current === null) reasons.push('MISSING_SUMMARY');
  else if (current !== expected) reasons.push('SUMMARY_CONTENT_MISMATCH');
  if (contractChanged) reasons.push('CONTRACT_HASH_CHANGED');
  return reasonEntry('Stage5', reasons);
}

export async function buildDependencyManifest(contracts) {
  const contractPaths = {
    Stage1: stage1.STAGE1_CONTRACT_PATH,
    Stage2: stage2.STAGE2_CONTRACT_PATH,
    Stage3: stage3.STAGE3_CONTRACT_PATH,
    Stage4: stage4.STAGE4_CONTRACT_PATH,
    Stage5: stage5.STAGE5_CONTRACT_PATH,
    Stage6: STAGE6_CONTRACT_PATH,
  };
  const contractHashes = {};
  for (const [name, filePath] of Object.entries(contractPaths)) {
    contractHashes[name] = { path: filePath, sha256: await hashFile(filePath) };
  }

  const rawSourcePaths = unique([
    ...Object.values(contracts.stage1.entities).map((spec) => spec.source),
    ...Object.values(contracts.stage2.sourceTypes),
  ]).sort();
  const rawSources = {};
  for (const filePath of rawSourcePaths) rawSources[filePath] = await hashConfigDataSource(filePath);

  const stage1Manifest = {};
  for (const [entity, spec] of Object.entries(contracts.stage1.entities)) {
    stage1Manifest[entity] = {
      source: spec.source,
      sourceSha256: rawSources[spec.source],
      output: spec.output,
      outputSha256: await hashFile(spec.output),
    };
  }

  const stage2Manifest = {};
  for (const [domain, outputPath] of Object.entries(contracts.stage2.outputs)) {
    if (domain === 'summary') continue;
    const sourceTypes = stage2DomainSourceTypes(contracts.stage2, domain);
    stage2Manifest[domain] = {
      sourceTypes,
      sourceHashes: Object.fromEntries(sourceTypes.map((type) => [type, rawSources[contracts.stage2.sourceTypes[type]]])),
      output: outputPath,
      outputSha256: await hashFile(outputPath),
    };
  }

  const stage3Inputs = {};
  for (const [domain, filePath] of Object.entries(contracts.stage3.inputs)) stage3Inputs[domain] = { path: filePath, sha256: await hashFile(filePath) };
  const stage3Targets = {};
  for (const [targetType, filePath] of Object.entries(contracts.stage3.outputs.targets)) stage3Targets[targetType] = { path: filePath, sha256: await hashFile(filePath) };

  const canonicalInputs = {};
  for (const [name, spec] of Object.entries(contracts.stage4.canonicalInputs)) canonicalInputs[name] = { path: spec.path, sha256: await hashFile(spec.path) };
  const stage4Domains = {};
  for (const [domain, filePath] of Object.entries(contracts.stage4.outputs.domains)) stage4Domains[domain] = { path: filePath, sha256: await hashFile(filePath) };

  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_6',
    status: 'DEPENDENCY_MANIFEST_MATERIALIZED',
    contract: STAGE6_CONTRACT_PATH,
    contracts: contractHashes,
    rawSources,
    layers: {
      stage1: {
        entities: stage1Manifest,
        summary: { path: contracts.stage1.generation.summary, sha256: await hashFile(contracts.stage1.generation.summary) },
      },
      stage2: {
        domains: stage2Manifest,
        summary: { path: contracts.stage2.outputs.summary, sha256: await hashFile(contracts.stage2.outputs.summary) },
      },
      stage3: {
        inputs: stage3Inputs,
        targets: stage3Targets,
        manifest: { path: contracts.stage3.outputs.manifest, sha256: await hashFile(contracts.stage3.outputs.manifest) },
        summary: { path: contracts.stage3.outputs.summary, sha256: await hashFile(contracts.stage3.outputs.summary) },
      },
      stage4: {
        canonicalInputs,
        domains: stage4Domains,
        manifest: { path: contracts.stage4.outputs.manifest, sha256: await hashFile(contracts.stage4.outputs.manifest) },
        summary: { path: contracts.stage4.outputs.summary, sha256: await hashFile(contracts.stage4.outputs.summary) },
      },
      stage5: {
        summary: { path: contracts.stage5.outputs.summary, sha256: await hashFile(contracts.stage5.outputs.summary) },
      },
    },
    dependencyPolicy: {
      rawBytesHashedWithoutFullRelationRecomputation: true,
      stage1Granularity: 'ENTITY',
      stage2Granularity: 'DOMAIN',
      stage3Granularity: 'CONTENT_DIFF_TARGET_FILE',
      stage4Granularity: 'CONTENT_DIFF_DOMAIN_FILE',
      stage5Granularity: 'SUMMARY_ONLY',
      writesOnlyChangedArtifacts: true,
    },
  };
}

export function buildStage6Summary(contract, predecessorSummary, manifest) {
  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_6',
    status: 'PASS_CONFIGDATA_LOOKUP_STAGE6_INCREMENTAL_REBUILD',
    contract: STAGE6_CONTRACT_PATH,
    predecessorStatus: predecessorSummary.status,
    trackedContractCount: Object.keys(manifest.contracts).length,
    trackedRawSourceCount: Object.keys(manifest.rawSources).length,
    stage1EntityCount: Object.keys(manifest.layers.stage1.entities).length,
    stage2DomainCount: Object.keys(manifest.layers.stage2.domains).length,
    stage3TargetTypeCount: Object.keys(manifest.layers.stage3.targets).length,
    stage4DomainCount: Object.keys(manifest.layers.stage4.domains).length,
    semanticBoundary: {
      dependencyAware: true,
      sourceHashBased: true,
      boundedRawParsing: true,
      changedArtifactsOnlyWritten: true,
      rawConfigDataMutation: false,
      newRelationDiscovery: false,
      canonicalRelationRecomputation: false,
      nameJoinUsed: false,
      idArithmeticUsed: false,
      wallClockMetadataUsed: false,
    },
  };
}

export async function detectStalePlan(suppliedContracts = null) {
  const contracts = suppliedContracts ?? await loadContracts();
  const baselineArtifact = await readJsonMaybe(contracts.stage6.outputs.manifest);
  const baseline = baselineArtifact?.value ?? null;
  const contractHashes = {
    Stage1: await hashFile(stage1.STAGE1_CONTRACT_PATH),
    Stage2: await hashFile(stage2.STAGE2_CONTRACT_PATH),
    Stage3: await hashFile(stage3.STAGE3_CONTRACT_PATH),
    Stage4: await hashFile(stage4.STAGE4_CONTRACT_PATH),
    Stage5: await hashFile(stage5.STAGE5_CONTRACT_PATH),
    Stage6: await hashFile(STAGE6_CONTRACT_PATH),
  };

  const stage1Dirty = await inspectStage1(contracts.stage1, baselineContractChanged(baseline, 'Stage1', contractHashes.Stage1));
  const stage2Dirty = await inspectStage2(contracts.stage2, baselineContractChanged(baseline, 'Stage2', contractHashes.Stage2));
  const stage3Status = await inspectStage3(contracts.stage3, baselineContractChanged(baseline, 'Stage3', contractHashes.Stage3));
  const stage4Status = await inspectStage4(contracts.stage4, baselineContractChanged(baseline, 'Stage4', contractHashes.Stage4));
  const stage5Status = await inspectStage5(contracts.stage5, baselineContractChanged(baseline, 'Stage5', contractHashes.Stage5));

  const stage6Reasons = [];
  const expectedManifest = await buildDependencyManifest(contracts);
  const expectedManifestText = renderJson(expectedManifest);
  if (!baselineArtifact) stage6Reasons.push('MISSING_DEPENDENCY_MANIFEST');
  else if (baselineArtifact.text !== expectedManifestText) stage6Reasons.push('DEPENDENCY_MANIFEST_MISMATCH');
  if (baselineContractChanged(baseline, 'Stage6', contractHashes.Stage6)) stage6Reasons.push('CONTRACT_HASH_CHANGED');

  const predecessorSummary = (await stage5.readJson(contracts.stage5.outputs.summary)).value;
  const expectedSummaryText = renderJson(buildStage6Summary(contracts.stage6, predecessorSummary, expectedManifest));
  const currentSummary = await readTextMaybe(contracts.stage6.outputs.summary);
  if (currentSummary === null) stage6Reasons.push('MISSING_SUMMARY');
  else if (currentSummary !== expectedSummaryText) stage6Reasons.push('SUMMARY_CONTENT_MISMATCH');

  const staleCount = stage1Dirty.length + stage2Dirty.length
    + (stage3Status.reasons.length ? 1 : 0)
    + (stage4Status.reasons.length ? 1 : 0)
    + (stage5Status.reasons.length ? 1 : 0)
    + (stage6Reasons.length ? 1 : 0);

  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_6',
    status: staleCount === 0 ? 'CLEAN_CONFIGDATA_LOOKUP_STAGE6' : 'STALE_CONFIGDATA_LOOKUP_STAGE6',
    staleCount,
    stage1: { dirtyEntities: stage1Dirty },
    stage2: { dirtyDomains: stage2Dirty },
    stage3: stage3Status,
    stage4: stage4Status,
    stage5: stage5Status,
    stage6: reasonEntry('Stage6', stage6Reasons),
  };
}

async function loadExistingStage1Indexes(contract, dirtyEntities, changes) {
  const dirty = new Set(dirtyEntities.map((item) => item.name));
  const built = {};
  for (const [entity, spec] of Object.entries(contract.entities)) {
    if (dirty.has(entity)) {
      const index = await stage1.buildEntityIndex(entity, spec, contract);
      if (await writeIfChanged(spec.output, stage1.renderIndexJson(index))) changes.push(spec.output);
      built[entity] = index;
    } else {
      const current = await stage1.readJson(spec.output);
      built[entity] = current.value;
    }
  }
  if (dirty.size) {
    const summary = await stage1.buildSummary(contract, built);
    if (await writeIfChanged(contract.generation.summary, stage1.renderJson(summary))) changes.push(contract.generation.summary);
  }
}

async function rebuildStage2Domains(contract, dirtyDomains, changes) {
  const dirty = new Set(dirtyDomains.map((item) => item.name));
  if (!dirty.size) return;
  const selectedTypes = unique([...dirty].flatMap((domain) => stage2DomainSourceTypes(contract, domain)));
  const subContract = {
    ...contract,
    sourceTypes: Object.fromEntries(selectedTypes.map((type) => [type, contract.sourceTypes[type]])),
  };
  const loaded = await stage2.loadSourceTypes(subContract);
  const domainIndexes = {};
  for (const [domain, outputPath] of Object.entries(contract.outputs)) {
    if (domain === 'summary') continue;
    if (dirty.has(domain)) {
      const index = stage2.buildDomainIndex(domain, contract, loaded);
      if (await writeIfChanged(outputPath, stage2.renderForwardIndex(index))) changes.push(outputPath);
      domainIndexes[domain] = index;
    } else {
      domainIndexes[domain] = (await stage2.readJson(outputPath)).value;
    }
  }
  const summary = stage2.buildSummary(contract, domainIndexes);
  if (await writeIfChanged(contract.outputs.summary, stage2.renderJson(summary))) changes.push(contract.outputs.summary);
}

async function rebuildStage3IfNeeded(contract, shouldRebuild, changes) {
  if (!shouldRebuild) return;
  const artifacts = await stage3.loadStage2Artifacts(contract);
  const built = stage3.buildStage3Artifacts(contract, artifacts);
  for (const targetType of contract.targetTypeOrder) {
    const outputPath = contract.outputs.targets[targetType];
    if (await writeIfChanged(outputPath, stage3.renderReverseIndex(built.targetIndexes[targetType]))) changes.push(outputPath);
  }
  if (await writeIfChanged(contract.outputs.manifest, stage3.renderJson(built.manifest))) changes.push(contract.outputs.manifest);
  if (await writeIfChanged(contract.outputs.summary, stage3.renderJson(built.summary))) changes.push(contract.outputs.summary);
}

async function rebuildStage4IfNeeded(contract, shouldRebuild, changes) {
  if (!shouldRebuild) return;
  const inputs = await stage4.loadStage4Inputs(contract);
  const built = stage4.buildStage4Artifacts(contract, inputs);
  for (const [domain, index] of Object.entries(built.domains)) {
    const outputPath = contract.outputs.domains[domain];
    if (await writeIfChanged(outputPath, stage4.renderDomain(index))) changes.push(outputPath);
  }
  if (await writeIfChanged(contract.outputs.manifest, stage4.renderJson(built.manifest))) changes.push(contract.outputs.manifest);
  if (await writeIfChanged(contract.outputs.summary, stage4.renderJson(built.summary))) changes.push(contract.outputs.summary);
}

async function rebuildStage5IfNeeded(contract, shouldRebuild, changes) {
  if (!shouldRebuild) return;
  const predecessor = await stage5.loadStage5Predecessor(contract);
  const summary = stage5.buildStage5Summary(contract, predecessor.summary);
  if (await writeIfChanged(contract.outputs.summary, stage5.renderJson(summary))) changes.push(contract.outputs.summary);
}

export async function rebuildIncrementally(suppliedContracts = null) {
  const contracts = suppliedContracts ?? await loadContracts();
  const initialPlan = await detectStalePlan(contracts);
  const changes = [];

  await loadExistingStage1Indexes(contracts.stage1, initialPlan.stage1.dirtyEntities, changes);
  await rebuildStage2Domains(contracts.stage2, initialPlan.stage2.dirtyDomains, changes);

  const stage2Changed = changes.some((filePath) => filePath === contracts.stage2.outputs.summary
    || Object.values(contracts.stage2.outputs).includes(filePath));
  await rebuildStage3IfNeeded(
    contracts.stage3,
    initialPlan.stage3.reasons.length > 0 || stage2Changed,
    changes,
  );

  const stage3Changed = changes.some((filePath) => filePath === contracts.stage3.outputs.summary
    || filePath === contracts.stage3.outputs.manifest
    || Object.values(contracts.stage3.outputs.targets).includes(filePath));
  await rebuildStage4IfNeeded(
    contracts.stage4,
    initialPlan.stage4.reasons.length > 0 || stage3Changed,
    changes,
  );

  const stage4Changed = changes.some((filePath) => filePath === contracts.stage4.outputs.summary
    || filePath === contracts.stage4.outputs.manifest
    || Object.values(contracts.stage4.outputs.domains).includes(filePath));
  await rebuildStage5IfNeeded(
    contracts.stage5,
    initialPlan.stage5.reasons.length > 0 || stage4Changed,
    changes,
  );

  const manifest = await buildDependencyManifest(contracts);
  if (await writeIfChanged(contracts.stage6.outputs.manifest, renderJson(manifest))) changes.push(contracts.stage6.outputs.manifest);
  const predecessorSummary = (await stage5.readJson(contracts.stage5.outputs.summary)).value;
  const summary = buildStage6Summary(contracts.stage6, predecessorSummary, manifest);
  if (await writeIfChanged(contracts.stage6.outputs.summary, renderJson(summary))) changes.push(contracts.stage6.outputs.summary);

  const finalPlan = await detectStalePlan(contracts);
  if (finalPlan.staleCount !== 0) {
    throw new Error(`Stage 6 rebuild finished with ${finalPlan.staleCount} stale layer(s): ${JSON.stringify(finalPlan)}`);
  }

  return {
    status: summary.status,
    initialPlan,
    changedFileCount: changes.length,
    changedFiles: changes,
    finalPlan,
  };
}
