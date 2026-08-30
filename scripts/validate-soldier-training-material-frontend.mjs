import fs from 'node:fs';
import path from 'node:path';

const DETAIL_PATH = 'public/data/soldier-detail-stage5-6.v1.json';
const MANIFEST_PATH = 'data/generated/soldier-training-material-web-manifest.v1.json';
const OUT_PATH = 'data/validation/soldier-training-material-frontend-preflight.v1.json';

const detail = JSON.parse(fs.readFileSync(DETAIL_PATH, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const errors = [];

if (manifest.status !== 'PASS_SOLDIER_TRAINING_MATERIAL_WEBP' || manifest.assetsReady !== true) {
  errors.push(`web manifest not ready: ${manifest.status}`);
}
if (manifest.coverage?.expectedCount !== 24 || manifest.coverage?.resolvedCount !== 24 || manifest.coverage?.unresolvedCount !== 0) {
  errors.push(`web manifest coverage mismatch: ${JSON.stringify(manifest.coverage)}`);
}

const manifestById = new Map();
for (const record of manifest.records ?? []) {
  if (manifestById.has(record.itemId)) errors.push(`duplicate manifest itemId ${record.itemId}`);
  manifestById.set(record.itemId, record);
  if (!Number.isInteger(record.width) || !Number.isInteger(record.height) || record.width <= 0 || record.height <= 0) {
    errors.push(`invalid dimensions for item ${record.itemId}`);
  }
  if (record.pixelParity !== 'EXACT_RGBA') errors.push(`pixel parity not exact for item ${record.itemId}`);
  const webPath = record.webRepositoryPath;
  const sourcePath = record.sourceRepositoryPath;
  if (!fs.existsSync(webPath)) errors.push(`missing web asset ${webPath}`);
  if (!fs.existsSync(sourcePath)) errors.push(`missing source asset ${sourcePath}`);
}

let trainingProfileCount = 0;
let trainingLevelRecordCount = 0;
let materialEntryCount = 0;
const goodsTypeCounts = new Map();
const trainingItemIds = new Set();
const missingManifestItemIds = new Set();

for (const record of detail.records ?? []) {
  const levels = record?.training?.perLevelCost;
  if (!Array.isArray(levels) || levels.length === 0) continue;
  trainingProfileCount += 1;
  trainingLevelRecordCount += levels.length;
  for (const level of levels) {
    if (!Array.isArray(level.materials)) {
      errors.push(`Soldier ${record.soldierId} level ${level.level} materials is not an array`);
      continue;
    }
    for (const material of level.materials) {
      materialEntryCount += 1;
      goodsTypeCounts.set(material.goodsType, (goodsTypeCounts.get(material.goodsType) ?? 0) + 1);
      if (material.goodsType === 6) {
        trainingItemIds.add(material.itemId);
        if (!manifestById.has(material.itemId)) missingManifestItemIds.add(material.itemId);
      }
    }
  }
}

const expectedCounts = {
  trainingProfileCount: 129,
  trainingLevelRecordCount: 1290,
  materialEntryCount: 3505,
  uniqueTrainingItemCount: 24,
};

for (const [key, expected] of Object.entries(expectedCounts)) {
  const actual = {
    trainingProfileCount,
    trainingLevelRecordCount,
    materialEntryCount,
    uniqueTrainingItemCount: trainingItemIds.size,
  }[key];
  if (actual !== expected) errors.push(`${key}: expected ${expected}, got ${actual}`);
}

if (goodsTypeCounts.size !== 1 || goodsTypeCounts.get(6) !== 3505) {
  errors.push(`goodsType distribution mismatch: ${JSON.stringify(Object.fromEntries([...goodsTypeCounts].sort((a,b)=>a[0]-b[0])))}`);
}
if (missingManifestItemIds.size) {
  errors.push(`missing manifest item IDs: ${[...missingManifestItemIds].sort((a,b)=>a-b).join(',')}`);
}

const extraManifestItemIds = [...manifestById.keys()].filter((itemId) => !trainingItemIds.has(itemId)).sort((a,b)=>a-b);
if (extraManifestItemIds.length) errors.push(`manifest contains non-training item IDs: ${extraManifestItemIds.join(',')}`);

const status = errors.length === 0 ? 'PASS_SOLDIER_TRAINING_MATERIAL_FRONTEND_PREFLIGHT' : 'FAIL_SOLDIER_TRAINING_MATERIAL_FRONTEND_PREFLIGHT';
const output = {
  schemaId: 'soldier-training-material-frontend-preflight/v1',
  status,
  source: {
    soldierDetailConsumer: DETAIL_PATH,
    assetManifest: MANIFEST_PATH,
  },
  counts: {
    trainingProfileCount,
    trainingLevelRecordCount,
    materialEntryCount,
    goodsTypeCounts: Object.fromEntries([...goodsTypeCounts].sort((a,b)=>a[0]-b[0])),
    uniqueTrainingItemCount: trainingItemIds.size,
    manifestItemCount: manifestById.size,
    missingManifestItemCount: missingManifestItemIds.size,
    extraManifestItemCount: extraManifestItemIds.length,
  },
  trainingItemIds: [...trainingItemIds].sort((a,b)=>a-b),
  errors,
  productionBoundary: {
    rawConfigDataRuntimeRead: false,
    nameJoin: false,
    idArithmetic: false,
    assetResolverUsesFrozenManifest: true,
    semanticReopenAllowed: false,
  },
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ status, counts: output.counts }));
if (errors.length) process.exitCode = 1;
