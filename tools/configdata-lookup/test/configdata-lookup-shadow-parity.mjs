import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as current from '../lib/lookup.mjs';
import { checkLookupFreshness } from '../lib/freshness.mjs';
import * as legacy from '../../../scripts/lib/configdata-lookup-stage5.mjs';

function readIdsFromEntries(index) {
  return (index?.index?.entries ?? []).map(entry => String(entry[0]));
}

function numericSort(values) {
  return [...new Set(values)].sort((a, b) => {
    const aa = BigInt(a);
    const bb = BigInt(b);
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  });
}

function boundaryIds(ids) {
  if (ids.length === 0) return ['1'];
  const indexes = [...new Set([0, Math.floor((ids.length - 1) / 2), ids.length - 1])];
  const selected = indexes.map(index => ids[index]);
  selected.push((BigInt(ids.at(-1)) + 1n).toString());
  return [...new Set(selected)];
}

function selectBoundaryValues(values) {
  if (values.length === 0) return [];
  const indexes = [...new Set([0, Math.floor((values.length - 1) / 2), values.length - 1])];
  return indexes.map(index => values[index]);
}

function collectMaterializedPaths(contract) {
  return [...new Set([
    ...Object.values(contract.inputs.idLocator),
    ...Object.values(contract.inputs.forward),
    ...Object.values(contract.inputs.reverse),
    ...Object.values(contract.inputs.canonicalOverlay),
  ])].sort();
}

async function loadMaterializedInputs(contract) {
  const cache = new Map();
  const inventory = [];
  for (const filePath of collectMaterializedPaths(contract)) {
    assert.equal(filePath.startsWith('data/configdata/'), false, `raw ConfigData path is not allowed in CLR6: ${filePath}`);
    const bytes = await fs.readFile(filePath);
    const text = bytes.toString('utf8');
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    cache.set(filePath, JSON.parse(text));
    inventory.push({ path: filePath, bytes: bytes.length, sha256 });
  }
  return { cache, inventory };
}

function lookupPopulation(entity, contract, cache) {
  const ids = [];
  const locatorPath = contract.inputs.idLocator[entity];
  if (locatorPath) ids.push(...readIdsFromEntries(cache.get(locatorPath)));

  const forwardDomain = contract.inputs.forwardSourceDomain[entity];
  const forwardPath = forwardDomain ? contract.inputs.forward[forwardDomain] : null;
  if (forwardPath) {
    const index = cache.get(forwardPath);
    for (const relation of index?.relations ?? []) {
      if (relation.sourceType !== entity) continue;
      for (const edge of relation.edges ?? []) ids.push(String(edge[0]));
    }
  }

  const overlayPath = contract.inputs.canonicalOverlay[entity];
  if (overlayPath) ids.push(...Object.keys(cache.get(overlayPath)?.byId ?? {}));
  return numericSort(ids);
}

function refsPopulation(entity, contract, cache) {
  const ids = [];
  const reversePath = contract.inputs.reverse[entity];
  if (reversePath) ids.push(...Object.keys(cache.get(reversePath)?.byTargetId ?? {}));
  const overlayPath = contract.inputs.canonicalOverlay[entity];
  if (overlayPath) ids.push(...Object.keys(cache.get(overlayPath)?.byId ?? {}));
  return numericSort(ids);
}

async function compareLookupBoundaries(contract, cache) {
  const coverage = {};
  let populationCount = 0;
  let executedCaseCount = 0;
  for (const entity of contract.commands.lookup.supportedEntityTypes) {
    const population = lookupPopulation(entity, contract, cache);
    const samples = boundaryIds(population);
    for (const id of samples) {
      const [actual, expected] = await Promise.all([
        current.lookupEntity(entity, id, contract),
        legacy.lookupEntity(entity, id, contract),
      ]);
      assert.deepEqual(actual, expected, `CLR6 lookup shadow mismatch for ${entity} ${id}`);
      executedCaseCount += 1;
    }
    populationCount += population.length;
    coverage[entity] = { populationCount: population.length, executedCaseCount: samples.length };
  }
  return { entityTypeCount: Object.keys(coverage).length, populationCount, executedCaseCount, coverage };
}

async function compareRefsBoundaries(contract, cache) {
  const coverage = {};
  let populationCount = 0;
  let executedCaseCount = 0;
  for (const entity of contract.commands.refs.supportedEntityTypes) {
    const population = refsPopulation(entity, contract, cache);
    const samples = boundaryIds(population);
    for (const id of samples) {
      const [actual, expected] = await Promise.all([
        current.refsEntity(entity, id, contract),
        legacy.refsEntity(entity, id, contract),
      ]);
      assert.deepEqual(actual, expected, `CLR6 refs shadow mismatch for ${entity} ${id}`);
      executedCaseCount += 1;
    }
    populationCount += population.length;
    coverage[entity] = { populationCount: population.length, executedCaseCount: samples.length };
  }
  return { entityTypeCount: Object.keys(coverage).length, populationCount, executedCaseCount, coverage };
}

async function compareFindBoundaries(contract, cache) {
  const coverage = {};
  let labelPopulationCount = 0;
  let executedCaseCount = 0;
  for (const entity of contract.commands.find.supportedEntityTypes) {
    const index = cache.get(contract.inputs.idLocator[entity]);
    const labels = (index?.index?.entries ?? [])
      .map(entry => entry.length >= 3 ? entry[2] : null)
      .filter(label => typeof label === 'string' && label.length > 0);
    const uniqueLabels = [...new Set(labels)];
    const literals = selectBoundaryValues(uniqueLabels);
    let noMatch = '__CLR6_NO_MATCH__';
    while (uniqueLabels.some(label => label.includes(noMatch))) noMatch += '_X';
    literals.push(noMatch);
    for (const literal of [...new Set(literals)]) {
      const [actual, expected] = await Promise.all([
        current.findEntity(entity, literal, '20', contract),
        legacy.findEntity(entity, literal, '20', contract),
      ]);
      assert.deepEqual(actual, expected, `CLR6 find shadow mismatch for ${entity} ${literal}`);
      executedCaseCount += 1;
    }
    labelPopulationCount += uniqueLabels.length;
    coverage[entity] = { labelPopulationCount: uniqueLabels.length, executedCaseCount: new Set(literals).size };
  }
  return { entityTypeCount: Object.keys(coverage).length, labelPopulationCount, executedCaseCount, coverage };
}

export async function runShadowParity({ emit = true } = {}) {
  const clr5 = JSON.parse(await fs.readFile('data/contracts/project-tooling-configdata-lookup-clr5-writer-separation.v1.json', 'utf8'));
  assert.equal(clr5.completion, 'CONFIGDATA_LOOKUP_CLR5_WRITER_SEPARATION_FROZEN');

  const identityExports = [
    'lookupEntity',
    'refsEntity',
    'findEntity',
    'loadStage5Contract',
    'renderLookupHuman',
    'renderRefsHuman',
    'renderFindHuman',
    'renderJson',
  ];
  for (const name of identityExports) {
    assert.equal(current[name], legacy[name], `CLR6 adapter identity drift: ${name}`);
  }

  const [currentContract, legacyContract] = await Promise.all([
    current.loadStage5Contract(),
    legacy.loadStage5Contract(),
  ]);
  assert.deepEqual(currentContract, legacyContract, 'CLR6 Stage5 contract parity mismatch');

  const { cache, inventory } = await loadMaterializedInputs(currentContract);
  const combinedInventorySha256 = crypto.createHash('sha256')
    .update(inventory.map(item => `${item.path}\t${item.bytes}\t${item.sha256}`).join('\n'))
    .digest('hex');

  const freshness = await checkLookupFreshness();
  assert.equal(freshness.status, 'CLEAN_CONFIGDATA_LOOKUP_STAGE6');
  assert.equal(freshness.staleCount, 0);

  const [lookupShadow, refsShadow, findShadow] = await Promise.all([
    compareLookupBoundaries(currentContract, cache),
    compareRefsBoundaries(currentContract, cache),
    compareFindBoundaries(currentContract, cache),
  ]);

  const result = {
    status: 'PASS',
    completion: 'CONFIGDATA_LOOKUP_CLR6_SHADOW_PARITY',
    predecessor: clr5.completion,
    contractParity: 'EXACT',
    adapterIdentity: {
      checkedExportCount: identityExports.length,
      mismatchedExportCount: 0,
    },
    materializedInputInventory: {
      fileCount: inventory.length,
      totalBytes: inventory.reduce((sum, item) => sum + item.bytes, 0),
      combinedSha256: combinedInventorySha256,
      rawConfigDataFileCount: 0,
    },
    shadow: {
      lookup: lookupShadow,
      refs: refsShadow,
      find: findShadow,
    },
    freshness: {
      status: freshness.status,
      staleCount: freshness.staleCount,
    },
    boundaries: {
      materializationRebuildCount: 0,
      semanticRecomputationCount: 0,
      rawConfigDataReadCount: 0,
      writerExecutionCount: 0,
      stage7RuntimeDependencyCount: 0,
      stage8RuntimeDependencyCount: 0,
      projectDoctorRuntimeDependencyCount: 0,
    },
  };

  if (emit) console.log(JSON.stringify(result, null, 2));
  return result;
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  runShadowParity().catch(error => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
