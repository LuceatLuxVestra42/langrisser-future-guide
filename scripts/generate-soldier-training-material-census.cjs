const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const SOURCE = 'data/generated/soldier-detail-stage5-4.v1.json';
const OUTPUT = 'data/generated/soldier-training-material-census.v1.json';
const VALIDATION = 'data/validation/soldier-training-material-census.v1.json';

function abs(relativePath) {
  return path.join(rootDir, relativePath);
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  const filePath = abs(relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function gitBlobSha(relativePath) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${relativePath}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function isValidMaterial(material) {
  return Number.isInteger(material?.goodsType)
    && Number.isInteger(material?.itemId)
    && typeof material?.count === 'number'
    && Number.isFinite(material.count);
}

function sortedNumericObject(map) {
  return Object.fromEntries(
    [...map.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([key, value]) => [String(key), value]),
  );
}

function main() {
  const source = loadJson(SOURCE);
  const records = Array.isArray(source.records) ? source.records : [];
  const targetRecords = records.filter(
    (record) => record?.identity?.isSp !== true && record?.identity?.tier === 3,
  );

  const malformed = [];
  const goodsTypeCounts = new Map();
  const itemStats = new Map();
  let trainingLevelCount = 0;
  let materialEntryCount = 0;
  let targetWithTrainingCount = 0;
  let targetWithoutTenLevelsCount = 0;

  for (const record of targetRecords) {
    const levels = Array.isArray(record?.training?.perLevelCost)
      ? record.training.perLevelCost
      : [];

    if (levels.length > 0) targetWithTrainingCount += 1;
    if (levels.length !== 10) targetWithoutTenLevelsCount += 1;
    trainingLevelCount += levels.length;

    for (const level of levels) {
      const materials = Array.isArray(level?.materials) ? level.materials : [];
      for (let materialIndex = 0; materialIndex < materials.length; materialIndex += 1) {
        const material = materials[materialIndex];
        materialEntryCount += 1;

        if (!isValidMaterial(material)) {
          malformed.push({
            soldierId: record.soldierId ?? null,
            level: level?.level ?? null,
            materialIndex,
            material,
          });
          continue;
        }

        goodsTypeCounts.set(material.goodsType, (goodsTypeCounts.get(material.goodsType) ?? 0) + 1);

        if (material.goodsType !== 6) continue;
        const previous = itemStats.get(material.itemId) ?? {
          itemId: material.itemId,
          occurrenceCount: 0,
          totalRequiredCount: 0,
        };
        previous.occurrenceCount += 1;
        previous.totalRequiredCount += material.count;
        itemStats.set(material.itemId, previous);
      }
    }
  }

  const items = [...itemStats.values()].sort((a, b) => a.itemId - b.itemId);
  const uniqueItemIds = items.map((item) => item.itemId);
  const goodsType6EntryCount = goodsTypeCounts.get(6) ?? 0;
  const nonGoodsType6EntryCount = [...goodsTypeCounts.entries()]
    .filter(([goodsType]) => goodsType !== 6)
    .reduce((sum, [, count]) => sum + count, 0);

  const checks = {
    sourceStatusNotPass: source.status === 'PASS' ? 0 : 1,
    sourceSchemaMismatch: source.schemaId === 'soldier-detail-training/v1' ? 0 : 1,
    normalTier3CountMismatch: targetRecords.length === 129 ? 0 : 1,
    trainingPopulatedCountMismatch: targetWithTrainingCount === 129 ? 0 : 1,
    trainingLevelCountMismatch: trainingLevelCount === 1290 ? 0 : 1,
    targetWithoutTenLevels: targetWithoutTenLevelsCount,
    malformedMaterialEntries: malformed.length,
    nonGoodsType6Entries: nonGoodsType6EntryCount,
    emptyGoodsType6ItemPopulation: uniqueItemIds.length > 0 ? 0 : 1,
  };

  const failureCount = Object.values(checks).reduce((sum, value) => sum + (value ?? 0), 0);
  const status = failureCount === 0 ? 'PASS' : 'FAIL';
  const sourceRef = {
    path: SOURCE,
    gitBlobSha: gitBlobSha(SOURCE),
    schemaId: source.schemaId ?? null,
    stage: source.stage ?? null,
    status: source.status ?? null,
  };

  const output = {
    version: 1,
    schemaId: 'soldier-training-material-census/v1',
    status,
    generatedAt: new Date().toISOString(),
    scope: 'normal tier-3 Soldier Lv1-10 training per-level material costs',
    source: sourceRef,
    method: {
      targetFilter: 'identity.isSp !== true && identity.tier === 3',
      materialSource: 'training.perLevelCost[].materials[]',
      itemFilter: 'goodsType === 6',
      uniqueKey: 'itemId',
      noRangeAssumption: true,
    },
    summary: {
      normalTier3Count: targetRecords.length,
      trainingPopulatedCount: targetWithTrainingCount,
      trainingLevelCount,
      materialEntryCount,
      goodsTypeCounts: sortedNumericObject(goodsTypeCounts),
      goodsType6EntryCount,
      nonGoodsType6EntryCount,
      uniqueItemIdCount: uniqueItemIds.length,
      malformedMaterialEntryCount: malformed.length,
    },
    uniqueItemIds,
    items,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-training-material-census-validation/v1',
    status,
    generatedAt: output.generatedAt,
    source: sourceRef,
    checks,
    observed: output.summary,
    malformed,
    failureCount,
  };

  writeJson(OUTPUT, output);
  writeJson(VALIDATION, validation);

  console.log(JSON.stringify({
    status,
    source: sourceRef,
    summary: output.summary,
    uniqueItemIds,
    items,
    checks,
  }, null, 2));

  if (status !== 'PASS') process.exitCode = 1;
}

main();
