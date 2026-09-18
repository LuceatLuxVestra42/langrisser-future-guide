'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const UPSTREAM = P('data/generated/hero-basic-combat.v1.json');
const OUTPUT = P('data/generated/hero-awakening-materials.v1.json');
const SUMMARY = P('data/validation/hero-awakening-materials-summary.v1.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function indexUnique(rows, label, errors) {
  const map = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (map.has(row.ID)) errors.push(`${label} duplicate ID=${row.ID}`);
    else map.set(row.ID, row);
  }
  return map;
}
function snapshot(row) {
  return {
    itemId: row.ID,
    nameCn: row.Name ?? '',
    descriptionCn: row.Desc ?? '',
    rank: Number.isInteger(row.Rank) ? row.Rank : null,
    icon: row.Icon ?? null,
    getPathDescriptionCn: row.GetPathDesc ?? null,
  };
}
function expectedMaterials({ heroId, field, sourceMaterials, itemById, errors, usedItemIds }) {
  if (!Array.isArray(sourceMaterials) || sourceMaterials.length === 0) {
    errors.push(`heroId ${heroId}: source ${field} missing or empty`);
    return [];
  }
  const out = [];
  for (let i = 0; i < sourceMaterials.length; i += 1) {
    const goods = sourceMaterials[i];
    if (!Number.isInteger(goods?.GoodsType) || goods.GoodsType !== 6) {
      errors.push(`heroId ${heroId} ${field}[${i}]: unsupported GoodsType=${String(goods?.GoodsType)}`);
      continue;
    }
    if (!Number.isInteger(goods?.Id) || goods.Id <= 0 || !Number.isInteger(goods?.Count) || goods.Count <= 0) {
      errors.push(`heroId ${heroId} ${field}[${i}]: malformed Goods`);
      continue;
    }
    const master = itemById.get(goods.Id);
    if (!master) {
      errors.push(`heroId ${heroId} ${field}[${i}]: missing Item ${goods.Id}`);
      continue;
    }
    usedItemIds.add(goods.Id);
    out.push({ goodsType: goods.GoodsType, id: goods.Id, count: goods.Count, item: snapshot(master) });
  }
  return out;
}

function main() {
  const errors = [];
  const upstream = read(UPSTREAM);
  const output = read(OUTPUT);
  const summary = read(SUMMARY);
  const awakenRows = loadArray('ConfigDataAwakenInfo');
  const itemRows = loadArray('ConfigDataItemInfo');
  const awakenById = indexUnique(awakenRows, 'AwakenInfo', errors);
  const itemById = indexUnique(itemRows, 'ItemInfo', errors);

  if (upstream.status !== 'PASS') errors.push(`upstream status=${upstream.status}`);
  if (output.status !== 'PASS') errors.push(`output status=${output.status}`);
  if (summary.status !== 'PASS') errors.push(`summary status=${summary.status}`);

  const expectedHeroes = Array.isArray(upstream.records) ? upstream.records : [];
  const actualHeroes = Array.isArray(output.records) ? output.records : [];
  if (actualHeroes.length !== expectedHeroes.length) errors.push(`hero count=${actualHeroes.length}, expected=${expectedHeroes.length}`);

  const actualByHero = new Map();
  for (const hero of actualHeroes) {
    if (!Number.isInteger(hero?.heroId) || hero.heroId <= 0) { errors.push(`generated invalid heroId=${String(hero?.heroId)}`); continue; }
    if (actualByHero.has(hero.heroId)) errors.push(`generated duplicate heroId=${hero.heroId}`);
    else actualByHero.set(hero.heroId, hero);
  }

  let stage1DefinedCount = 0;
  let stage1MaterialEntryCount = 0;
  const stage1ItemIds = new Set();
  let definedAwakeningCount = 0;
  let undefinedAwakeningCount = 0;
  let materialEntryCount = 0;
  const stage2ItemIds = new Set();

  for (const expectedHero of expectedHeroes) {
    const heroId = expectedHero?.heroId;
    const actual = actualByHero.get(heroId);
    if (!actual) { errors.push(`missing heroId=${heroId}`); continue; }
    const source = awakenById.get(heroId);
    if (!source) {
      errors.push(`heroId ${heroId}: source AwakenInfo missing`);
      continue;
    }

    for (const key of ['heroId', 'nameKr', 'nameCn', 'nameEn']) {
      const expected = key === 'heroId' ? heroId : (expectedHero?.[key] ?? null);
      if (actual[key] !== expected) errors.push(`heroId ${heroId}: ${key} mismatch`);
    }

    const awaken1LevelId = source.Awaken1LevelID;
    if (!Number.isInteger(awaken1LevelId) || awaken1LevelId <= 0) {
      errors.push(`heroId ${heroId}: source Awaken1LevelID missing or invalid`);
    } else {
      const materials = expectedMaterials({
        heroId,
        field: 'Awaken1Material',
        sourceMaterials: source.Awaken1Material,
        itemById,
        errors,
        usedItemIds: stage1ItemIds,
      });
      stage1DefinedCount += 1;
      stage1MaterialEntryCount += materials.length;
      if (!same(actual.stage1, { awaken1LevelId, materials })) errors.push(`heroId ${heroId}: stage1 payload mismatch`);
    }

    const skillId = source.Level2SkillID;
    if (!Number.isInteger(skillId) || skillId <= 0) {
      undefinedAwakeningCount += 1;
      if (actual.sourceState !== 'LEVEL2_SKILL_NOT_DEFINED') errors.push(`heroId ${heroId}: sourceState mismatch`);
      if (actual.awakening !== null) errors.push(`heroId ${heroId}: stage2 awakening must be null`);
      continue;
    }

    definedAwakeningCount += 1;
    if (actual.sourceState !== 'LEVEL2_SKILL_DEFINED') errors.push(`heroId ${heroId}: defined sourceState mismatch`);
    const materials = expectedMaterials({
      heroId,
      field: 'Awaken2Material',
      sourceMaterials: source.Awaken2Material,
      itemById,
      errors,
      usedItemIds: stage2ItemIds,
    });
    materialEntryCount += materials.length;
    const expectedAwakening = {
      skillId,
      awaken2LevelId: Number.isInteger(source.Awaken2LevelID) ? source.Awaken2LevelID : null,
      awaken2Unlock: typeof source.Awaken2Unlock === 'boolean' ? source.Awaken2Unlock : null,
      materials,
    };
    if (!same(actual.awakening, expectedAwakening)) errors.push(`heroId ${heroId}: awakening payload mismatch`);
  }

  if (output.version !== 1 || output.domain !== 'hero-awakening-materials') errors.push('output contract identity mismatch');
  if (output.recordCount !== expectedHeroes.length) errors.push(`output.recordCount=${output.recordCount}, expected=${expectedHeroes.length}`);
  const expectedSummary = {
    heroCount: expectedHeroes.length,
    stage1DefinedCount,
    stage1MaterialEntryCount,
    stage1DistinctItemCount: stage1ItemIds.size,
    definedAwakeningCount,
    undefinedAwakeningCount,
    materialEntryCount,
    distinctItemCount: stage2ItemIds.size,
  };
  for (const [key, value] of Object.entries(expectedSummary)) {
    if (summary[key] !== value) errors.push(`summary.${key}=${summary[key]}, expected=${value}`);
  }
  if (summary.sourceRecordCounts?.awakenInfo !== awakenRows.length) errors.push('summary source AwakenInfo count mismatch');
  if (summary.sourceRecordCounts?.itemInfo !== itemRows.length) errors.push('summary source ItemInfo count mismatch');
  if ((summary.hardErrors || []).length !== 0) errors.push(`summary hardErrors=${(summary.hardErrors || []).length}`);

  console.log(`HERO AWAKENING MATERIAL VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
  console.log(`heroes=${expectedHeroes.length} stage1=${stage1DefinedCount}/${stage1MaterialEntryCount}/${stage1ItemIds.size} stage2=${definedAwakeningCount}/${materialEntryCount}/${stage2ItemIds.size} undefined2=${undefinedAwakeningCount} errors=${errors.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
