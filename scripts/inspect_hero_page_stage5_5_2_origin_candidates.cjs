const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const configDir = path.join(rootDir, 'data', 'configdata');
const heroInfoPath = path.join(configDir, 'ConfigDataHeroInfo.json');
const outputPath = path.join(rootDir, 'data', 'validation', 'hero-page-stage5-5-2-origin-candidates.v1.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function scalarSample(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      out[key] = value;
    }
  }
  return out;
}

function main() {
  const heroInfo = loadJson(heroInfoPath);
  if (!Array.isArray(heroInfo)) throw new Error('ConfigDataHeroInfo must be an array');

  const productionValues = [];
  const heroIdsByProductionId = new Map();
  for (const row of heroInfo) {
    if (!Number.isInteger(row?.ID) || !Array.isArray(row?.HeroBelongProduction)) continue;
    for (const productionId of row.HeroBelongProduction) {
      if (!Number.isInteger(productionId)) continue;
      productionValues.push(productionId);
      const heroIds = heroIdsByProductionId.get(productionId) || [];
      heroIds.push(row.ID);
      heroIdsByProductionId.set(productionId, heroIds);
    }
  }

  const targetIds = [...new Set(productionValues)].sort((a, b) => a - b);
  const targetSet = new Set(targetIds);
  const candidates = [];
  const parseFailures = [];

  for (const name of fs.readdirSync(configDir).filter((x) => x.endsWith('.json')).sort()) {
    if (name === 'ConfigDataHeroInfo.json') continue;
    const filePath = path.join(configDir, name);
    let rows;
    try {
      rows = loadJson(filePath);
    } catch (error) {
      parseFailures.push({ file: name, error: String(error.message || error) });
      continue;
    }
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const byId = new Map();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || !Number.isInteger(row.ID)) continue;
      const existing = byId.get(row.ID) || [];
      existing.push(row);
      byId.set(row.ID, existing);
    }
    if (byId.size === 0) continue;

    const matchedIds = targetIds.filter((id) => byId.has(id));
    if (matchedIds.length === 0) continue;

    const matchedRows = matchedIds.flatMap((id) => byId.get(id) || []);
    const keyFrequency = new Map();
    for (const row of matchedRows) {
      for (const key of Object.keys(row)) keyFrequency.set(key, (keyFrequency.get(key) || 0) + 1);
    }

    const stringFields = new Set();
    for (const row of matchedRows) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string' && value.trim()) stringFields.add(key);
      }
    }

    candidates.push({
      file: name,
      rowCount: rows.length,
      distinctIntegerIds: byId.size,
      matchedTargetIds: matchedIds,
      matchedTargetCount: matchedIds.length,
      targetCount: targetIds.length,
      targetCoverage: targetIds.length ? matchedIds.length / targetIds.length : 0,
      duplicateMatchedIds: matchedIds.filter((id) => (byId.get(id) || []).length > 1),
      matchedRowKeys: [...keyFrequency.keys()].sort(),
      nonEmptyStringFields: [...stringFields].sort(),
      samples: matchedIds.slice(0, 3).map((id) => ({
        targetId: id,
        rows: (byId.get(id) || []).slice(0, 2).map(scalarSample),
      })),
    });
  }

  candidates.sort((a, b) =>
    b.targetCoverage - a.targetCoverage ||
    b.nonEmptyStringFields.length - a.nonEmptyStringFields.length ||
    a.rowCount - b.rowCount ||
    a.file.localeCompare(b.file)
  );

  const result = {
    version: 1,
    stage: 'hero-page-5-5',
    substage: '5-5-2',
    checkpoint: 'origin-candidate-scan',
    source: 'ConfigDataHeroInfo.HeroBelongProduction[]',
    productionPointerCount: productionValues.length,
    distinctProductionIds: targetIds,
    distinctProductionIdCount: targetIds.length,
    heroIdsByProductionId: Object.fromEntries(
      [...heroIdsByProductionId.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([id, heroIds]) => [id, [...new Set(heroIds)].sort((a, b) => a - b)])
    ),
    candidateCount: candidates.length,
    candidates,
    parseFailureCount: parseFailures.length,
    parseFailures,
    interpretationRule: 'ID overlap is candidate evidence only. Do not promote a ConfigData file to the production-title dictionary without semantic evidence from matched fields or another authoritative source.',
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`HeroBelongProduction distinct IDs: ${targetIds.join(', ')}`);
  console.log(`Positive candidate files: ${candidates.length}`);
  for (const candidate of candidates.slice(0, 20)) {
    console.log(`${candidate.file}: ${candidate.matchedTargetCount}/${candidate.targetCount} (${(candidate.targetCoverage * 100).toFixed(1)}%), stringFields=${candidate.nonEmptyStringFields.join(',') || '-'}`);
  }
  console.log(`Output: ${path.relative(rootDir, outputPath)}`);
}

main();
