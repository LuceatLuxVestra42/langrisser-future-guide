import fs from 'node:fs';
import path from 'node:path';

const inventoryPath = 'data/generated/skin-stage3-1-asset-inventory.v1.json';
const sourceDir = 'data/evidence/skin-stage3-3-model-resource-source-index';
const outputPath = '/tmp/skin-stage3-3-preplan.json';

const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const shardFiles = fs.readdirSync(sourceDir)
  .filter((name) => /^model-resource-\d{4}-\d{4}\.v1\.json$/.test(name))
  .sort();

const sourceRows = [];
for (const name of shardFiles) {
  const shard = JSON.parse(fs.readFileSync(path.join(sourceDir, name), 'utf8'));
  sourceRows.push(...shard.records);
}

const sourceById = new Map();
for (const row of sourceRows) {
  if (sourceById.has(row.skinResourceId)) {
    throw new Error(`duplicate source skinResourceId ${row.skinResourceId}`);
  }
  sourceById.set(row.skinResourceId, row);
}
if (sourceRows.length !== 977 || sourceById.size !== 977) {
  throw new Error(`source index mismatch rows=${sourceRows.length} unique=${sourceById.size}`);
}
if (inventory.counts?.skinCount !== 540 || inventory.counts?.uniqueModelResourceIdCount !== 789) {
  throw new Error('frozen Stage 3-1 inventory counts changed');
}

function pair(base) {
  return [`begin_${base}`, base];
}
function staticCandidates(p) {
  const m = /^UI\/Icon\/(HeroSkin2?_ABS)\//i.exec(p);
  if (!m) return { class: 'NONSTANDARD', proposed: [] };
  return { class: 'STANDARD', proposed: pair(`ui_icon_${m[1].replace(/_ABS$/i, '').toLowerCase()}_abs.b`) };
}
function charCandidates(p) {
  const m = /^Spine\/Char\/([^/]+)_ABS\//i.exec(p);
  if (!m) return { class: 'NONSTANDARD', proposed: [] };
  return { class: 'STANDARD', proposed: pair(`spine_char_${m[1].toLowerCase()}_abs.b`) };
}
function modelCandidates(p) {
  let m = /^Spine\/General\/([^/]+)_ABS\//i.exec(p);
  if (m) return { rootClass: 'GENERAL', class: 'STANDARD', proposed: pair(`spine_general_${m[1].toLowerCase()}_abs.b`) };
  m = /^Spine\/Soldier\/(?:[^/]+\/)?([^/]+)_ABS\//i.exec(p);
  if (m) return { rootClass: 'SOLDIER', class: 'STANDARD', proposed: pair(`spine_soldier_${m[1].toLowerCase()}_abs.b`) };
  if (/^Spine\/Bust\//i.test(p)) return { rootClass: 'BUST', class: 'NONSTANDARD', proposed: [] };
  return { rootClass: 'OTHER', class: 'NONSTANDARD', proposed: [] };
}

const selectedIds = new Set();
const rootCounts = { GENERAL: 0, SOLDIER: 0, BUST: 0, OTHER: 0 };
const selectedSourceRows = [];
const missingIds = [];
const primaryPathToIds = new Map();
const proposedBundles = new Set();
const records = [];

for (const record of inventory.records) {
  const staticInfo = staticCandidates(record.static.sourceImagePath);
  const charInfo = charCandidates(record.spine.sourceSpinePath);
  staticInfo.proposed.forEach((x) => proposedBundles.add(x));
  charInfo.proposed.forEach((x) => proposedBundles.add(x));

  const modelResources = [];
  for (const id of record.modelResourceIds) {
    selectedIds.add(id);
    const source = sourceById.get(id);
    if (!source) {
      missingIds.push(id);
      modelResources.push({ skinResourceId: id, sourceMapStatus: 'MISSING' });
      continue;
    }
    const candidate = modelCandidates(source.primaryPrefabPath);
    rootCounts[candidate.rootClass] += 1;
    candidate.proposed.forEach((x) => proposedBundles.add(x));
    selectedSourceRows.push(source);
    const ids = primaryPathToIds.get(source.primaryPrefabPath) ?? [];
    ids.push(id);
    primaryPathToIds.set(source.primaryPrefabPath, ids);
    modelResources.push({
      skinResourceId: id,
      sourceRecordIndexZeroBased: source.sourceRecordIndexZeroBased,
      primaryPrefabPath: source.primaryPrefabPath,
      additionalPrefabPathFields: source.additionalPrefabPathFields ?? [],
      candidate
    });
  }
  records.push({
    skinId: record.skinId,
    heroId: record.heroId,
    sourceOrder: record.sourceOrder,
    static: { sourceImagePath: record.static.sourceImagePath, candidate: staticInfo },
    spine: { sourceSpinePath: record.spine.sourceSpinePath, candidate: charInfo },
    modelResourceIds: [...record.modelResourceIds],
    modelResources
  });
}

const duplicatePrimaryPathGroups = [...primaryPathToIds.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([primaryPrefabPath, skinResourceIds]) => ({ primaryPrefabPath, skinResourceIds }))
  .sort((a, b) => a.primaryPrefabPath.localeCompare(b.primaryPrefabPath));

const uniqueSelectedPrimaryPaths = new Set(selectedSourceRows.map((r) => r.primaryPrefabPath));
const result = {
  schemaVersion: 1,
  stage: 'skin-page-3',
  substage: '3-3-1',
  artifactClass: 'FROZEN_INVENTORY_EXACT_JOIN_PREPLAN',
  frozenSource: inventoryPath,
  sourceShardFiles: shardFiles,
  counts: {
    skinCount: records.length,
    selectedUniqueModelResourceIds: selectedIds.size,
    mappedUniqueModelResourceIds: selectedIds.size - new Set(missingIds).size,
    missingUniqueModelResourceIds: new Set(missingIds).size,
    uniqueSelectedPrimaryPrefabPaths: uniqueSelectedPrimaryPaths.size,
    duplicateSelectedPrimaryPathGroupCount: duplicatePrimaryPathGroups.length,
    proposedBundleFilenameCount: proposedBundles.size
  },
  modelRootCounts: rootCounts,
  missingModelResourceIds: [...new Set(missingIds)].sort((a, b) => a - b),
  duplicatePrimaryPathGroups,
  proposedBundleFilenames: [...proposedBundles].sort(),
  records
};
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...result.counts, modelRootCounts: result.modelRootCounts }, null, 2));
