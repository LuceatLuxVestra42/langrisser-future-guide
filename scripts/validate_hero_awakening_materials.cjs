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
  if (!Array.isArray(upstream.records)) errors.push('upstream records missing');
  if (!Array.isArray(output.records)) errors.push('output records missing');

  const expectedHeroes = Array.isArray(upstream.records) ? upstream.records : [];
  const actualHeroes = Array.isArray(output.records) ? output.records : [];
  if (actualHeroes.length !== expectedHeroes.length) errors.push(`hero count=${actualHeroes.length}, expected=${expectedHeroes.length}`);

  const actualByHero = new Map();
  for (const hero of actualHeroes) {
    if (!Number.isInteger(hero?.heroId) || hero.heroId <= 0) { errors.push(`generated invalid heroId=${String(hero?.heroId)}`); continue; }
    if (actualByHero.has(hero.heroId)) errors.push(`generated duplicate heroId=${hero.heroId}`);
    else actualByHero.set(hero.heroId, hero);
  }

  let definedAwakeningCount = 0;
  let undefinedAwakeningCount = 0;
  let materialEntryCount = 0;
  const usedItemIds = new Set();

  for (const expectedHero of expectedHeroes) {
    const heroId = expectedHero?.heroId;
    const actual = actualByHero.get(heroId);
    if (!actual) { errors.push(`missing heroId=${heroId}`); continue; }
    const source = awakenById.get(heroId);
    const skillId = source?.Level2SkillID;

    const identityExpected = {
      heroId,
      nameKr: expectedHero?.nameKr ?? null,
      nameCn: expectedHero?.nameCn ?? null,
      nameEn: expectedHero?.nameEn ?? null,
    };
    for (const key of ['heroId', 'nameKr', 'nameCn', 'nameEn']) {
      if (actual[key] !== identityExpected[key]) errors.push(`heroId ${heroId}: ${key} mismatch`);
    }

    if (!Number.isInteger(skillId) || skillId <= 0) {
      undefinedAwakeningCount += 1;
      const expectedState = source ? 'LEVEL2_SKILL_NOT_DEFINED' : 'AWAKEN_INFO_NOT_FOUND';
      if (actual.sourceState !== expectedState) errors.push(`heroId ${heroId}: sourceState=${actual.sourceState}, expected=${expectedState}`);
      if (actual.awakening !== null) errors.push(`heroId ${heroId}: awakening must be null`);
      continue;
    }

    definedAwakeningCount += 1;
    if (actual.sourceState !== 'LEVEL2_SKILL_DEFINED') errors.push(`heroId ${heroId}: defined sourceState mismatch`);
    const sourceMaterials = source.Awaken2Material;
    if (!Array.isArray(sourceMaterials) || sourceMaterials.length === 0) {
      errors.push(`heroId ${heroId} Level2SkillID ${skillId}: source Awaken2Material missing or empty`);
      continue;
    }
    const expectedMaterials = [];
    for (let i = 0; i < sourceMaterials.length; i += 1) {
      materialEntryCount += 1;
      const goods = sourceMaterials[i];
      if (!Number.isInteger(goods?.GoodsType) || goods.GoodsType !== 6) {
        errors.push(`heroId ${heroId} Awaken2Material[${i}]: unsupported GoodsType=${String(goods?.GoodsType)}`);
        continue;
      }
      if (!Number.isInteger(goods?.Id) || goods.Id <= 0 || !Number.isInteger(goods?.Count) || goods.Count <= 0) {
        errors.push(`heroId ${heroId} Awaken2Material[${i}]: malformed Goods`);
        continue;
      }
      const master = itemById.get(goods.Id);
      if (!master) {
        errors.push(`heroId ${heroId} Awaken2Material[${i}]: missing Item ${goods.Id}`);
        continue;
      }
      usedItemIds.add(goods.Id);
      expectedMaterials.push({ goodsType: goods.GoodsType, id: goods.Id, count: goods.Count, item: snapshot(master) });
    }
    const expectedAwakening = {
      skillId,
      awaken2LevelId: Number.isInteger(source.Awaken2LevelID) ? source.Awaken2LevelID : null,
      awaken2Unlock: typeof source.Awaken2Unlock === 'boolean' ? source.Awaken2Unlock : null,
      materials: expectedMaterials,
    };
    if (!same(actual.awakening, expectedAwakening)) errors.push(`heroId ${heroId}: awakening payload mismatch`);
  }

  if (output.version !== 1 || output.domain !== 'hero-awakening-materials') errors.push('output contract identity mismatch');
  if (output.recordCount !== expectedHeroes.length) errors.push(`output.recordCount=${output.recordCount}, expected=${expectedHeroes.length}`);
  if (summary.heroCount !== expectedHeroes.length) errors.push(`summary.heroCount=${summary.heroCount}, expected=${expectedHeroes.length}`);
  if (summary.definedAwakeningCount !== definedAwakeningCount) errors.push(`summary.definedAwakeningCount=${summary.definedAwakeningCount}, expected=${definedAwakeningCount}`);
  if (summary.undefinedAwakeningCount !== undefinedAwakeningCount) errors.push(`summary.undefinedAwakeningCount=${summary.undefinedAwakeningCount}, expected=${undefinedAwakeningCount}`);
  if (summary.materialEntryCount !== materialEntryCount) errors.push(`summary.materialEntryCount=${summary.materialEntryCount}, expected=${materialEntryCount}`);
  if (summary.distinctItemCount !== usedItemIds.size) errors.push(`summary.distinctItemCount=${summary.distinctItemCount}, expected=${usedItemIds.size}`);
  if (summary.sourceRecordCounts?.awakenInfo !== awakenRows.length) errors.push('summary source AwakenInfo count mismatch');
  if (summary.sourceRecordCounts?.itemInfo !== itemRows.length) errors.push('summary source ItemInfo count mismatch');
  if ((summary.hardErrors || []).length !== 0) errors.push(`summary hardErrors=${(summary.hardErrors || []).length}`);

  console.log(`HERO AWAKENING MATERIAL VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
  console.log(`heroes=${expectedHeroes.length} defined=${definedAwakeningCount} undefined=${undefinedAwakeningCount} materials=${materialEntryCount} distinctItems=${usedItemIds.size} errors=${errors.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
