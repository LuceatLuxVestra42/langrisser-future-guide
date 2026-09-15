'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const UPSTREAM = P('data/generated/hero-basic-combat.v1.json');
const OUTPUT = P('data/generated/hero-awakening-materials.v1.json');
const SUMMARY = P('data/validation/hero-awakening-materials-summary.v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function indexUnique(rows, label) {
  const byId = new Map();
  const duplicates = [];
  for (const row of rows) {
    const id = row?.ID;
    if (!Number.isInteger(id) || id <= 0) continue;
    if (byId.has(id)) duplicates.push(id);
    else byId.set(id, row);
  }
  if (duplicates.length) throw new Error(`${label} duplicate IDs: ${[...new Set(duplicates)].sort((a,b)=>a-b).join(', ')}`);
  return byId;
}
function itemSnapshot(row) {
  return {
    itemId: row.ID,
    nameCn: row.Name ?? '',
    descriptionCn: row.Desc ?? '',
    rank: Number.isInteger(row.Rank) ? row.Rank : null,
    icon: row.Icon ?? null,
    getPathDescriptionCn: row.GetPathDesc ?? null,
  };
}

function main() {
  const upstream = readJson(UPSTREAM);
  if (upstream?.status !== 'PASS') throw new Error(`hero-basic-combat status=${upstream?.status ?? 'missing'}`);
  if (!Array.isArray(upstream.records)) throw new Error('hero-basic-combat records missing');

  const awakenRows = loadArray('ConfigDataAwakenInfo');
  const itemRows = loadArray('ConfigDataItemInfo');
  const awakenById = indexUnique(awakenRows, 'ConfigDataAwakenInfo');
  const itemById = indexUnique(itemRows, 'ConfigDataItemInfo');
  const hardErrors = [];
  const usedItemIds = new Set();
  let definedAwakeningCount = 0;
  let undefinedAwakeningCount = 0;
  let materialEntryCount = 0;

  const seenHeroIds = new Set();
  const records = upstream.records.map((hero) => {
    const heroId = hero?.heroId;
    if (!Number.isInteger(heroId) || heroId <= 0 || seenHeroIds.has(heroId)) {
      hardErrors.push(`invalid or duplicate canonical heroId=${String(heroId)}`);
    } else {
      seenHeroIds.add(heroId);
    }

    const source = awakenById.get(heroId);
    const skillId = source?.Level2SkillID;
    if (!Number.isInteger(skillId) || skillId <= 0) {
      undefinedAwakeningCount += 1;
      return {
        heroId,
        nameKr: hero?.nameKr ?? null,
        nameCn: hero?.nameCn ?? null,
        nameEn: hero?.nameEn ?? null,
        sourceState: source ? 'LEVEL2_SKILL_NOT_DEFINED' : 'AWAKEN_INFO_NOT_FOUND',
        awakening: null,
      };
    }

    definedAwakeningCount += 1;
    const sourceMaterials = source.Awaken2Material;
    if (!Array.isArray(sourceMaterials) || sourceMaterials.length === 0) {
      hardErrors.push(`heroId ${heroId} Level2SkillID ${skillId}: Awaken2Material missing or empty`);
    }
    const materials = (Array.isArray(sourceMaterials) ? sourceMaterials : []).map((goods, index) => {
      materialEntryCount += 1;
      const goodsType = goods?.GoodsType;
      const id = goods?.Id;
      const count = goods?.Count;
      if (!Number.isInteger(goodsType) || !Number.isInteger(id) || id <= 0 || !Number.isInteger(count) || count <= 0) {
        hardErrors.push(`heroId ${heroId} Awaken2Material[${index}]: malformed Goods record`);
        return { goodsType: goodsType ?? null, id: id ?? null, count: count ?? null, item: null };
      }
      if (goodsType !== 6) {
        hardErrors.push(`heroId ${heroId} Awaken2Material[${index}]: unsupported GoodsType ${goodsType}`);
        return { goodsType, id, count, item: null };
      }
      const master = itemById.get(id);
      if (!master) {
        hardErrors.push(`heroId ${heroId} Awaken2Material[${index}]: missing Item ${id}`);
        return { goodsType, id, count, item: null };
      }
      usedItemIds.add(id);
      return { goodsType, id, count, item: itemSnapshot(master) };
    });

    return {
      heroId,
      nameKr: hero?.nameKr ?? null,
      nameCn: hero?.nameCn ?? null,
      nameEn: hero?.nameEn ?? null,
      sourceState: 'LEVEL2_SKILL_DEFINED',
      awakening: {
        skillId,
        awaken2LevelId: Number.isInteger(source.Awaken2LevelID) ? source.Awaken2LevelID : null,
        awaken2Unlock: typeof source.Awaken2Unlock === 'boolean' ? source.Awaken2Unlock : null,
        materials,
      },
    };
  });

  const status = hardErrors.length ? 'FAIL' : 'PASS';
  const output = {
    version: 1,
    domain: 'hero-awakening-materials',
    status,
    source: {
      upstream: 'data/generated/hero-basic-combat.v1.json',
      configDataContract: 'data/contracts/configdata-source-pack-contract.v1.json',
      awakenTable: 'ConfigDataAwakenInfo',
      itemTable: 'ConfigDataItemInfo',
      materialField: 'Awaken2Material',
      skillField: 'Level2SkillID',
    },
    recordCount: records.length,
    records,
  };
  const summary = {
    version: 1,
    domain: 'hero-awakening-materials',
    status,
    heroCount: records.length,
    definedAwakeningCount,
    undefinedAwakeningCount,
    materialEntryCount,
    distinctItemCount: usedItemIds.size,
    sourceRecordCounts: {
      awakenInfo: awakenRows.length,
      itemInfo: itemRows.length,
    },
    hardErrors,
  };
  writeJson(OUTPUT, output);
  writeJson(SUMMARY, summary);
  console.log(`HERO AWAKENING MATERIAL BUILD: ${status}`);
  console.log(`heroes=${records.length} defined=${definedAwakeningCount} undefined=${undefinedAwakeningCount} materials=${materialEntryCount} distinctItems=${usedItemIds.size} errors=${hardErrors.length}`);
  if (hardErrors.length) {
    for (const error of hardErrors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
