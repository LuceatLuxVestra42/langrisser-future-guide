import fs from 'node:fs';

const CONTRACT_PATH = 'data/contracts/skin-stage3-1-asset-inventory.v1.json';

const load = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => {
  fs.mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const numericAsc = (a, b) => Number(a) - Number(b);
const uniqueNumeric = values => [...new Set(values.map(Number))].sort(numericAsc);

const contract = load(CONTRACT_PATH);
const stage30 = load(contract.inputs.stage30);
const sourceMetadata = load(contract.inputs.sourceMetadata);
const relation = load(contract.inputs.relation);
const expected = contract.canonicalExpectations;

check(stage30.status === 'PASS' && stage30.completion === 'SKIN_STAGE3_0_COMPLETE', 'Stage 3-0 is not complete');
check(sourceMetadata.status === 'GENERATED', 'Stage 1 source metadata is not GENERATED');
check(Array.isArray(sourceMetadata.records), 'source metadata records missing');
check(sourceMetadata.records.length === expected.skinCount, `source metadata count ${sourceMetadata.records.length}`);
check(relation.status === 'ACCEPTED' && relation.completion === 'SKIN_STAGE2_3_COMPLETE', 'Stage 2 relation is not accepted');
check(Object.keys(relation.bySkinId ?? {}).length === expected.skinCount, 'relation bySkinId count mismatch');
check(Object.keys(relation.byHeroId ?? {}).length === expected.heroCount, 'relation byHeroId count mismatch');

const staticMap = new Map();
const spineMap = new Map();
const modelMap = new Map();
const records = [];
let modelBindingEdgeCount = 0;

const addPathRef = (map, path, skinId) => {
  if (!map.has(path)) map.set(path, new Set());
  map.get(path).add(Number(skinId));
};

for (const source of sourceMetadata.records) {
  const skinId = Number(source.skinId);
  const rel = relation.bySkinId?.[String(skinId)];
  check(rel, `skin ${skinId}: Stage 2 relation missing`);
  check(Number(rel.heroId) === Number(source.heroId), `skin ${skinId}: owner mismatch`);
  check(Number(rel.sourceOrder) === Number(source.sourceOrder), `skin ${skinId}: sourceOrder mismatch`);

  const sourceImagePath = source.artworkSource?.sourceImagePath;
  const sourceSpinePath = source.artworkSource?.sourceSpinePath;
  const bindings = source.heroSkinSource?.modelBindings;

  check(typeof sourceImagePath === 'string' && sourceImagePath.length > 0, `skin ${skinId}: sourceImagePath missing`);
  check(typeof sourceSpinePath === 'string' && sourceSpinePath.length > 0, `skin ${skinId}: sourceSpinePath missing`);
  check(Array.isArray(bindings) && bindings.length > 0, `skin ${skinId}: modelBindings missing`);

  addPathRef(staticMap, sourceImagePath, skinId);
  addPathRef(spineMap, sourceSpinePath, skinId);

  const projectedBindings = [];
  for (const binding of bindings) {
    const jobConnectionId = Number(binding.jobConnectionId);
    const skinResourceId = Number(binding.skinResourceId);
    check(Number.isFinite(jobConnectionId), `skin ${skinId}: invalid jobConnectionId`);
    check(Number.isFinite(skinResourceId), `skin ${skinId}: invalid skinResourceId`);

    modelBindingEdgeCount += 1;
    projectedBindings.push({ jobConnectionId, skinResourceId });

    if (!modelMap.has(skinResourceId)) modelMap.set(skinResourceId, []);
    modelMap.get(skinResourceId).push({ skinId, jobConnectionId });
  }

  records.push({
    skinId,
    heroId: Number(rel.heroId),
    sourceOrder: Number(rel.sourceOrder),
    static: { sourceImagePath },
    spine: { sourceSpinePath },
    modelBindings: projectedBindings,
    modelResourceIds: uniqueNumeric(projectedBindings.map(row => row.skinResourceId))
  });
}

check(modelBindingEdgeCount === expected.modelBindingEdgeCount, `model binding edge count ${modelBindingEdgeCount}`);
check(modelMap.size === expected.uniqueModelResourceIdCount, `unique model resource count ${modelMap.size}`);

const byStaticPath = {};
for (const [path, skinSet] of [...staticMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const skinIds = [...skinSet].sort(numericAsc);
  byStaticPath[path] = { skinIds, skinCount: skinIds.length };
}

const bySpinePath = {};
for (const [path, skinSet] of [...spineMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const skinIds = [...skinSet].sort(numericAsc);
  bySpinePath[path] = { skinIds, skinCount: skinIds.length };
}

const byModelResourceId = {};
for (const [resourceId, bindings] of [...modelMap.entries()].sort(([a], [b]) => numericAsc(a, b))) {
  const skinIds = uniqueNumeric(bindings.map(row => row.skinId));
  const jobConnectionIds = uniqueNumeric(bindings.map(row => row.jobConnectionId));
  const sortedBindings = [...bindings].sort((a, b) => a.skinId - b.skinId || a.jobConnectionId - b.jobConnectionId);
  byModelResourceId[String(resourceId)] = {
    skinIds,
    jobConnectionIds,
    bindings: sortedBindings,
    skinCount: skinIds.length,
    bindingCount: sortedBindings.length
  };
}

const staticEntries = Object.entries(byStaticPath);
const spineEntries = Object.entries(bySpinePath);
const modelEntries = Object.entries(byModelResourceId);
const sharedStatic = staticEntries.filter(([, value]) => value.skinCount > 1);
const sharedSpine = spineEntries.filter(([, value]) => value.skinCount > 1);
const modelSharedAcrossSkins = modelEntries.filter(([, value]) => value.skinCount > 1);
const modelSharedAcrossBindings = modelEntries.filter(([, value]) => value.bindingCount > 1);
const skinModelResourceCounts = records.map(row => ({ skinId: row.skinId, count: row.modelResourceIds.length }));
const skinBindingCounts = records.map(row => ({ skinId: row.skinId, count: row.modelBindings.length }));

const counts = {
  skinCount: records.length,
  heroCount: Object.keys(relation.byHeroId).length,
  staticReferenceEdgeCount: records.length,
  uniqueStaticPathCount: staticEntries.length,
  sharedStaticPathCount: sharedStatic.length,
  skinRefsOnSharedStaticPaths: sharedStatic.reduce((sum, [, value]) => sum + value.skinCount, 0),
  spineReferenceEdgeCount: records.length,
  uniqueSpinePathCount: spineEntries.length,
  sharedSpinePathCount: sharedSpine.length,
  skinRefsOnSharedSpinePaths: sharedSpine.reduce((sum, [, value]) => sum + value.skinCount, 0),
  modelBindingEdgeCount,
  uniqueModelResourceIdCount: modelEntries.length,
  modelResourceIdsSharedAcrossSkins: modelSharedAcrossSkins.length,
  modelResourceIdsSharedAcrossBindings: modelSharedAcrossBindings.length,
  skinsWithMultipleModelResourceIds: skinModelResourceCounts.filter(row => row.count > 1).length,
  maxModelResourceIdsPerSkin: Math.max(...skinModelResourceCounts.map(row => row.count)),
  maxModelBindingsPerSkin: Math.max(...skinBindingCounts.map(row => row.count)),
  maxSkinsPerModelResource: Math.max(...modelEntries.map(([, value]) => value.skinCount)),
  maxBindingsPerModelResource: Math.max(...modelEntries.map(([, value]) => value.bindingCount))
};

const notable = {
  sharedStaticPaths: sharedStatic.map(([path, value]) => ({ path, ...value })),
  sharedSpinePaths: sharedSpine.map(([path, value]) => ({ path, ...value })),
  modelResourcesSharedAcrossSkins: modelSharedAcrossSkins.map(([skinResourceId, value]) => ({ skinResourceId: Number(skinResourceId), ...value })),
  highestBindingModelResources: modelEntries
    .map(([skinResourceId, value]) => ({ skinResourceId: Number(skinResourceId), skinCount: value.skinCount, bindingCount: value.bindingCount }))
    .sort((a, b) => b.bindingCount - a.bindingCount || b.skinCount - a.skinCount || a.skinResourceId - b.skinResourceId)
    .slice(0, 20),
  skinsWithMostBindings: skinBindingCounts
    .sort((a, b) => b.count - a.count || a.skinId - b.skinId)
    .slice(0, 20)
};

const inventory = {
  version: 1,
  stage: 'skin-page-3',
  substage: '3-1',
  status: 'GENERATED',
  purpose: contract.purpose,
  sources: {
    stage30: contract.inputs.stage30,
    sourceMetadata: contract.inputs.sourceMetadata,
    relation: contract.inputs.relation
  },
  serializationPolicy: {
    skinRecordOrder: 'preserve Stage 1 source-metadata record order',
    reverseIndexOrder: 'deterministic serialization only; never release/display chronology',
    modelWorkUnit: 'deduplicated skinResourceId'
  },
  counts,
  records,
  byStaticPath,
  bySpinePath,
  byModelResourceId,
  notable,
  policy: {
    rawConfigDataRescanned: false,
    assetExtractionPerformed: false,
    exportPathAssigned: false,
    webPathAssigned: false,
    releaseStatusInferred: false,
    ownershipRediscovered: false,
    sourceOrderRecomputed: false
  },
  nextAction: contract.nextAction
};

write(contract.outputs.inventory, inventory);
console.log(JSON.stringify({
  status: inventory.status,
  output: contract.outputs.inventory,
  counts
}, null, 2));
