import fs from 'node:fs';

const CONTRACT_PATH = 'data/contracts/skin-stage3-1-asset-inventory.v1.json';
const load = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => {
  fs.mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
const numericAsc = (a, b) => Number(a) - Number(b);
const uniqueNumeric = values => [...new Set(values.map(Number))].sort(numericAsc);
const stable = value => JSON.stringify(value);

const contract = load(CONTRACT_PATH);
const stage30 = load(contract.inputs.stage30);
const sourceMetadata = load(contract.inputs.sourceMetadata);
const relation = load(contract.inputs.relation);
const inventory = load(contract.outputs.inventory);
const expected = contract.canonicalExpectations;

const checks = [];
const failures = [];
const addCheck = (name, pass, detail = null) => {
  const row = { name, pass: Boolean(pass), detail };
  checks.push(row);
  if (!row.pass) failures.push(row);
};

addCheck('contract accepted', contract.status === 'ACCEPTED', contract.status);
addCheck('contract substage 3-1', contract.substage === '3-1', contract.substage);
addCheck('Stage 3-0 PASS', stage30.status === 'PASS', stage30.status);
addCheck('Stage 3-0 complete', stage30.completion === 'SKIN_STAGE3_0_COMPLETE', stage30.completion);
addCheck('source metadata record count 540', sourceMetadata.records?.length === expected.skinCount, sourceMetadata.records?.length);
addCheck('relation bySkinId count 540', Object.keys(relation.bySkinId ?? {}).length === expected.skinCount, Object.keys(relation.bySkinId ?? {}).length);
addCheck('relation byHeroId count 267', Object.keys(relation.byHeroId ?? {}).length === expected.heroCount, Object.keys(relation.byHeroId ?? {}).length);
addCheck('inventory GENERATED', inventory.status === 'GENERATED', inventory.status);
addCheck('inventory substage 3-1', inventory.substage === '3-1', inventory.substage);
addCheck('inventory record count 540', inventory.records?.length === expected.skinCount, inventory.records?.length);

const sourceById = new Map((sourceMetadata.records ?? []).map(row => [Number(row.skinId), row]));
const inventoryById = new Map((inventory.records ?? []).map(row => [Number(row.skinId), row]));
const sourceIds = [...sourceById.keys()].sort(numericAsc);
const inventoryIds = [...inventoryById.keys()].sort(numericAsc);
const duplicateInventorySkinIds = (inventory.records?.length ?? 0) - inventoryById.size;

addCheck('inventory skinId unique', duplicateInventorySkinIds === 0, duplicateInventorySkinIds);
addCheck('inventory skinId set exact', stable(inventoryIds) === stable(sourceIds), {
  source: sourceIds.length,
  inventory: inventoryIds.length
});

const projectionMismatchSkinIds = [];
const ownerMismatchSkinIds = [];
const sourceOrderMismatchSkinIds = [];
let actualBindingEdgeCount = 0;
const actualModelResourceSet = new Set();

const expectedStatic = new Map();
const expectedSpine = new Map();
const expectedModel = new Map();
const addSet = (map, key, value) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(Number(value));
};

for (const source of sourceMetadata.records ?? []) {
  const skinId = Number(source.skinId);
  const inv = inventoryById.get(skinId);
  const rel = relation.bySkinId?.[String(skinId)];
  if (!inv || !rel) {
    projectionMismatchSkinIds.push(skinId);
    continue;
  }

  if (Number(inv.heroId) !== Number(rel.heroId)) ownerMismatchSkinIds.push(skinId);
  if (Number(inv.sourceOrder) !== Number(rel.sourceOrder)) sourceOrderMismatchSkinIds.push(skinId);

  const sourceBindings = (source.heroSkinSource?.modelBindings ?? []).map(row => ({
    jobConnectionId: Number(row.jobConnectionId),
    skinResourceId: Number(row.skinResourceId)
  }));
  const expectedResourceIds = uniqueNumeric(sourceBindings.map(row => row.skinResourceId));
  const expectedProjection = {
    skinId,
    heroId: Number(rel.heroId),
    sourceOrder: Number(rel.sourceOrder),
    static: { sourceImagePath: source.artworkSource?.sourceImagePath },
    spine: { sourceSpinePath: source.artworkSource?.sourceSpinePath },
    modelBindings: sourceBindings,
    modelResourceIds: expectedResourceIds
  };
  if (stable(inv) !== stable(expectedProjection)) projectionMismatchSkinIds.push(skinId);

  addSet(expectedStatic, source.artworkSource.sourceImagePath, skinId);
  addSet(expectedSpine, source.artworkSource.sourceSpinePath, skinId);

  for (const binding of sourceBindings) {
    actualBindingEdgeCount += 1;
    actualModelResourceSet.add(binding.skinResourceId);
    if (!expectedModel.has(binding.skinResourceId)) expectedModel.set(binding.skinResourceId, []);
    expectedModel.get(binding.skinResourceId).push({ skinId, jobConnectionId: binding.jobConnectionId });
  }
}

addCheck('per-skin source projection exact', projectionMismatchSkinIds.length === 0, projectionMismatchSkinIds.length);
addCheck('Stage 2 owner parity exact', ownerMismatchSkinIds.length === 0, ownerMismatchSkinIds.length);
addCheck('Stage 2 sourceOrder parity exact', sourceOrderMismatchSkinIds.length === 0, sourceOrderMismatchSkinIds.length);
addCheck('model binding edges 2277', actualBindingEdgeCount === expected.modelBindingEdgeCount, actualBindingEdgeCount);
addCheck('unique model resource IDs 789', actualModelResourceSet.size === expected.uniqueModelResourceIdCount, actualModelResourceSet.size);

const normalizePathIndex = map => Object.fromEntries(
  [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, skinSet]) => {
      const skinIds = [...skinSet].sort(numericAsc);
      return [path, { skinIds, skinCount: skinIds.length }];
    })
);

const normalizeModelIndex = map => Object.fromEntries(
  [...map.entries()]
    .sort(([a], [b]) => numericAsc(a, b))
    .map(([resourceId, bindings]) => {
      const sortedBindings = [...bindings].sort((a, b) => a.skinId - b.skinId || a.jobConnectionId - b.jobConnectionId);
      const skinIds = uniqueNumeric(sortedBindings.map(row => row.skinId));
      const jobConnectionIds = uniqueNumeric(sortedBindings.map(row => row.jobConnectionId));
      return [String(resourceId), {
        skinIds,
        jobConnectionIds,
        bindings: sortedBindings,
        skinCount: skinIds.length,
        bindingCount: sortedBindings.length
      }];
    })
);

const expectedByStaticPath = normalizePathIndex(expectedStatic);
const expectedBySpinePath = normalizePathIndex(expectedSpine);
const expectedByModelResourceId = normalizeModelIndex(expectedModel);

addCheck('byStaticPath exact reverse index', stable(inventory.byStaticPath) === stable(expectedByStaticPath), Object.keys(inventory.byStaticPath ?? {}).length);
addCheck('bySpinePath exact reverse index', stable(inventory.bySpinePath) === stable(expectedBySpinePath), Object.keys(inventory.bySpinePath ?? {}).length);
addCheck('byModelResourceId exact reverse index', stable(inventory.byModelResourceId) === stable(expectedByModelResourceId), Object.keys(inventory.byModelResourceId ?? {}).length);

const staticEntries = Object.entries(expectedByStaticPath);
const spineEntries = Object.entries(expectedBySpinePath);
const modelEntries = Object.entries(expectedByModelResourceId);
const sharedStatic = staticEntries.filter(([, value]) => value.skinCount > 1);
const sharedSpine = spineEntries.filter(([, value]) => value.skinCount > 1);
const sharedModelAcrossSkins = modelEntries.filter(([, value]) => value.skinCount > 1);
const sharedModelAcrossBindings = modelEntries.filter(([, value]) => value.bindingCount > 1);
const skinResourceCounts = (inventory.records ?? []).map(row => row.modelResourceIds.length);
const skinBindingCounts = (inventory.records ?? []).map(row => row.modelBindings.length);

const recomputedCounts = {
  skinCount: inventory.records?.length ?? 0,
  heroCount: Object.keys(relation.byHeroId ?? {}).length,
  staticReferenceEdgeCount: staticEntries.reduce((sum, [, value]) => sum + value.skinCount, 0),
  uniqueStaticPathCount: staticEntries.length,
  sharedStaticPathCount: sharedStatic.length,
  skinRefsOnSharedStaticPaths: sharedStatic.reduce((sum, [, value]) => sum + value.skinCount, 0),
  spineReferenceEdgeCount: spineEntries.reduce((sum, [, value]) => sum + value.skinCount, 0),
  uniqueSpinePathCount: spineEntries.length,
  sharedSpinePathCount: sharedSpine.length,
  skinRefsOnSharedSpinePaths: sharedSpine.reduce((sum, [, value]) => sum + value.skinCount, 0),
  modelBindingEdgeCount: modelEntries.reduce((sum, [, value]) => sum + value.bindingCount, 0),
  uniqueModelResourceIdCount: modelEntries.length,
  modelResourceIdsSharedAcrossSkins: sharedModelAcrossSkins.length,
  modelResourceIdsSharedAcrossBindings: sharedModelAcrossBindings.length,
  skinsWithMultipleModelResourceIds: skinResourceCounts.filter(count => count > 1).length,
  maxModelResourceIdsPerSkin: Math.max(...skinResourceCounts),
  maxModelBindingsPerSkin: Math.max(...skinBindingCounts),
  maxSkinsPerModelResource: Math.max(...modelEntries.map(([, value]) => value.skinCount)),
  maxBindingsPerModelResource: Math.max(...modelEntries.map(([, value]) => value.bindingCount))
};

for (const [name, value] of Object.entries(recomputedCounts)) {
  addCheck(`count parity: ${name}`, Number(inventory.counts?.[name]) === Number(value), {
    inventory: inventory.counts?.[name],
    recomputed: value
  });
}

addCheck('static reverse refs total 540', recomputedCounts.staticReferenceEdgeCount === expected.skinCount, recomputedCounts.staticReferenceEdgeCount);
addCheck('Spine reverse refs total 540', recomputedCounts.spineReferenceEdgeCount === expected.skinCount, recomputedCounts.spineReferenceEdgeCount);
addCheck('model reverse binding refs total 2277', recomputedCounts.modelBindingEdgeCount === expected.modelBindingEdgeCount, recomputedCounts.modelBindingEdgeCount);
addCheck('model reverse unique keys 789', recomputedCounts.uniqueModelResourceIdCount === expected.uniqueModelResourceIdCount, recomputedCounts.uniqueModelResourceIdCount);

const staticRoundTripMismatch = [];
const spineRoundTripMismatch = [];
const modelRoundTripMismatch = [];
for (const row of inventory.records ?? []) {
  if (!inventory.byStaticPath?.[row.static.sourceImagePath]?.skinIds?.includes(row.skinId)) staticRoundTripMismatch.push(row.skinId);
  if (!inventory.bySpinePath?.[row.spine.sourceSpinePath]?.skinIds?.includes(row.skinId)) spineRoundTripMismatch.push(row.skinId);
  for (const binding of row.modelBindings) {
    const index = inventory.byModelResourceId?.[String(binding.skinResourceId)];
    const exists = index?.bindings?.some(edge => Number(edge.skinId) === Number(row.skinId) && Number(edge.jobConnectionId) === Number(binding.jobConnectionId));
    if (!exists) modelRoundTripMismatch.push({ skinId: row.skinId, ...binding });
  }
}

addCheck('static round-trip exact', staticRoundTripMismatch.length === 0, staticRoundTripMismatch.length);
addCheck('Spine round-trip exact', spineRoundTripMismatch.length === 0, spineRoundTripMismatch.length);
addCheck('model-binding round-trip exact', modelRoundTripMismatch.length === 0, modelRoundTripMismatch.length);

const forbiddenKeys = new Set([
  'localExtractPath', 'exportPath', 'webPath', 'releaseStatus', 'cnReleaseStatus', 'krReleaseStatus',
  'krFuture', 'displayTarget', 'nameKr', 'acquisitionClass'
]);
const forbiddenOccurrences = [];
const scanKeys = (value, path = '$') => {
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanKeys(child, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) forbiddenOccurrences.push(`${path}.${key}`);
      scanKeys(child, `${path}.${key}`);
    }
  }
};
scanKeys(inventory.records);

addCheck('no extraction/export/web fields', forbiddenOccurrences.filter(path => /localExtractPath|exportPath|webPath/.test(path)).length === 0, forbiddenOccurrences.length);
addCheck('no release/localization/acquisition enrichment fields', forbiddenOccurrences.length === 0, forbiddenOccurrences.length);
addCheck('policy raw ConfigData not rescanned', inventory.policy?.rawConfigDataRescanned === false, inventory.policy?.rawConfigDataRescanned);
addCheck('policy extraction not performed', inventory.policy?.assetExtractionPerformed === false, inventory.policy?.assetExtractionPerformed);
addCheck('policy ownership not rediscovered', inventory.policy?.ownershipRediscovered === false, inventory.policy?.ownershipRediscovered);
addCheck('policy sourceOrder not recomputed', inventory.policy?.sourceOrderRecomputed === false, inventory.policy?.sourceOrderRecomputed);
addCheck('next action points to Stage 3-2', typeof inventory.nextAction === 'string' && inventory.nextAction.includes('Stage 3-2'), inventory.nextAction);

const status = failures.length === 0 ? 'PASS' : 'FAIL';
const summary = {
  version: 1,
  stage: 'skin-page-3',
  substage: '3-1',
  checkpoint: 'asset-locator-resource-inventory-final',
  status,
  completion: status === 'PASS' ? 'SKIN_STAGE3_1_COMPLETE' : null,
  purpose: contract.purpose,
  metrics: {
    checkCount: checks.length,
    passedCheckCount: checks.filter(row => row.pass).length,
    failedCheckCount: failures.length,
    ...recomputedCounts,
    ownerMismatchCount: ownerMismatchSkinIds.length,
    sourceOrderMismatchCount: sourceOrderMismatchSkinIds.length,
    projectionMismatchCount: projectionMismatchSkinIds.length,
    staticRoundTripMismatchCount: staticRoundTripMismatch.length,
    spineRoundTripMismatchCount: spineRoundTripMismatch.length,
    modelRoundTripMismatchCount: modelRoundTripMismatch.length,
    forbiddenFieldOccurrenceCount: forbiddenOccurrences.length
  },
  workUnitInterpretation: {
    staticWorkUnits: recomputedCounts.uniqueStaticPathCount,
    spineWorkUnits: recomputedCounts.uniqueSpinePathCount,
    modelWorkUnits: recomputedCounts.uniqueModelResourceIdCount,
    note: 'These are deduplicated source-locator/resource work units for Stage 3 processing, not release/display chronology.'
  },
  sharedWorkUnits: {
    staticPathCount: recomputedCounts.sharedStaticPathCount,
    spinePathCount: recomputedCounts.sharedSpinePathCount,
    modelResourceAcrossSkinCount: recomputedCounts.modelResourceIdsSharedAcrossSkins,
    modelResourceAcrossBindingCount: recomputedCounts.modelResourceIdsSharedAcrossBindings
  },
  checks,
  failures: {
    failedChecks: failures,
    duplicateInventorySkinIds,
    projectionMismatchSkinIds,
    ownerMismatchSkinIds,
    sourceOrderMismatchSkinIds,
    staticRoundTripMismatch,
    spineRoundTripMismatch,
    modelRoundTripMismatch,
    forbiddenOccurrences
  },
  officialInventory: contract.outputs.inventory,
  nextAction: contract.nextAction
};

write(contract.outputs.validation, summary);
console.log(JSON.stringify(summary, null, 2));
if (status !== 'PASS') process.exitCode = 1;
