'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const OUTPUT = P('data/generated/hero-casting-law-materials.v1.json');
const SUMMARY = P('data/validation/hero-casting-law-materials-summary.v1.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function indexUnique(rows, label, errors) {
  const map = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) {
      errors.push(`${label}: invalid ID=${String(row?.ID)}`);
      continue;
    }
    if (map.has(row.ID)) errors.push(`${label}: duplicate ID=${row.ID}`);
    else map.set(row.ID, row);
  }
  return map;
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
function propertySnapshot(row) {
  const out = [];
  for (let i = 1; i <= 8; i += 1) {
    const propertyId = row[`Property${i}_ID`];
    const value = row[`Property${i}_Value`];
    if (propertyId === undefined && value === undefined) continue;
    out.push({
      slot: i,
      propertyId: Number.isInteger(propertyId) ? propertyId : null,
      value: Number.isFinite(value) ? value : null,
    });
  }
  return out;
}

function main() {
  const errors = [];
  const output = readJson(OUTPUT);
  const summary = readJson(SUMMARY);
  const templateRows = loadArray('ConfigDataCastingLawTemplateInfo');
  const levelRows = loadArray('ConfigDataCastingLawLevelUpInfo');
  const itemRows = loadArray('ConfigDataItemInfo');

  const templateById = indexUnique(templateRows, 'TemplateInfo', errors);
  const levelById = indexUnique(levelRows, 'LevelUpInfo', errors);
  const itemById = indexUnique(itemRows, 'ItemInfo', errors);

  if (output?.version !== 1 || output?.domain !== 'hero-casting-law-materials' || output?.status !== 'PASS') {
    errors.push('generated artifact identity/status mismatch');
  }
  if (summary?.version !== 1 || summary?.domain !== 'hero-casting-law-materials' || summary?.status !== 'PASS') {
    errors.push('summary identity/status mismatch');
  }
  if (!Array.isArray(output?.templates)) errors.push('generated templates missing');

  const expectedTemplates = [];
  const referencedLevelIds = new Set();
  const usedItemIds = new Set();
  const pre5ItemIds = new Set();
  const post5ItemIds = new Set();
  let materialEntryCount = 0;

  for (const template of [...templateById.values()].sort((a, b) => a.ID - b.ID)) {
    const levelInfoIds = Array.isArray(template.CastingLawLevelUpInfoList)
      ? template.CastingLawLevelUpInfoList.slice()
      : [];
    if (levelInfoIds.length !== 10) errors.push(`template ${template.ID}: expected 10 level IDs, got ${levelInfoIds.length}`);

    const levels = [];
    for (let index = 0; index < levelInfoIds.length; index += 1) {
      const displayLevel = index + 1;
      const levelInfoId = levelInfoIds[index];
      if (!Number.isInteger(levelInfoId) || levelInfoId <= 0) {
        errors.push(`template ${template.ID} level ${displayLevel}: invalid levelInfoId`);
      }
      if (referencedLevelIds.has(levelInfoId)) errors.push(`levelInfoId ${levelInfoId}: duplicate template reference`);
      referencedLevelIds.add(levelInfoId);

      const source = levelById.get(levelInfoId);
      if (!source) {
        errors.push(`template ${template.ID} level ${displayLevel}: source level missing`);
        continue;
      }
      if (index > 0 && source.PreCastingLawLevelID !== levelInfoIds[index - 1]) {
        errors.push(`template ${template.ID} level ${displayLevel}: predecessor mismatch`);
      }

      const sourceMaterials = Array.isArray(source.LevelupMaterialsCost) ? source.LevelupMaterialsCost : [];
      if (sourceMaterials.length === 0) errors.push(`template ${template.ID} level ${displayLevel}: no source materials`);
      const materials = sourceMaterials.map((goods, materialIndex) => {
        materialEntryCount += 1;
        if (goods?.GoodsType !== 6 || !Number.isInteger(goods?.Id) || goods.Id <= 0 || !Number.isInteger(goods?.Count) || goods.Count <= 0) {
          errors.push(`template ${template.ID} level ${displayLevel} material[${materialIndex}]: invalid goods`);
          return { goodsType: goods?.GoodsType ?? null, id: goods?.Id ?? null, count: goods?.Count ?? null, item: null };
        }
        const item = itemById.get(goods.Id);
        if (!item) {
          errors.push(`template ${template.ID} level ${displayLevel} material[${materialIndex}]: unresolved Item ${goods.Id}`);
          return { goodsType: goods.GoodsType, id: goods.Id, count: goods.Count, item: null };
        }
        usedItemIds.add(goods.Id);
        (displayLevel <= 5 ? pre5ItemIds : post5ItemIds).add(goods.Id);
        return {
          goodsType: goods.GoodsType,
          id: goods.Id,
          count: goods.Count,
          item: itemSnapshot(item),
        };
      });

      levels.push({
        level: displayLevel,
        levelInfoId,
        nameCn: source.Name ?? null,
        goldCost: Number.isInteger(source.LevelUpGoldCost) ? source.LevelUpGoldCost : null,
        predecessorLevelInfoId: Number.isInteger(source.PreCastingLawLevelID) ? source.PreCastingLawLevelID : null,
        properties: propertySnapshot(source),
        materials,
      });
    }

    expectedTemplates.push({
      templateId: template.ID,
      nameCn: template.Name ?? null,
      equipmentType: Number.isInteger(template.EquipmentType) ? template.EquipmentType : null,
      icon: template.Icon ?? null,
      levelInfoIds,
      levels,
    });
  }

  const expectedPost5 = [3308, 3309, 3310];
  const actualPost5 = [...post5ItemIds].sort((a, b) => a - b);
  const actualPre5 = [...pre5ItemIds].sort((a, b) => a - b);
  const totalTemplateLevelCount = expectedTemplates.reduce((sum, template) => sum + template.levels.length, 0);

  if (templateRows.length !== 50) errors.push(`source template count=${templateRows.length}, expected=50`);
  if (levelRows.length !== 500) errors.push(`source level row count=${levelRows.length}, expected=500`);
  if (expectedTemplates.length !== 50) errors.push(`expected template count=${expectedTemplates.length}, expected=50`);
  if (totalTemplateLevelCount !== 500) errors.push(`expected template-level count=${totalTemplateLevelCount}, expected=500`);
  if (referencedLevelIds.size !== 500) errors.push(`referenced level ID count=${referencedLevelIds.size}, expected=500`);
  if (JSON.stringify(actualPost5) !== JSON.stringify(expectedPost5)) {
    errors.push(`post-level-5 material IDs=${actualPost5.join(',')}, expected=${expectedPost5.join(',')}`);
  }
  if (!same(output.templates, expectedTemplates)) errors.push('generated templates differ from direct ConfigData reconstruction');

  const expectedOutputSummary = {
    templateCount: expectedTemplates.length,
    totalTemplateLevelCount,
    materialEntryCount,
    distinctMaterialItemCount: usedItemIds.size,
    preLevel6DistinctItemIds: actualPre5,
    postLevel5CommonMaterialItemIds: actualPost5,
  };
  if (!same(output.summary, expectedOutputSummary)) errors.push('generated summary differs from reconstructed source summary');

  const expectedSummaryFields = {
    templateCount: expectedTemplates.length,
    levelsPerTemplate: 10,
    totalTemplateLevelCount,
    materialEntryCount,
    distinctMaterialItemCount: usedItemIds.size,
    preLevel6DistinctItemCount: pre5ItemIds.size,
    postLevel5CommonMaterialItemIds: actualPost5,
    sourceRecordCounts: {
      templates: templateRows.length,
      levels: levelRows.length,
      items: itemRows.length,
    },
  };
  for (const [key, expected] of Object.entries(expectedSummaryFields)) {
    if (!same(summary[key], expected)) errors.push(`summary.${key} mismatch`);
  }
  if (!Array.isArray(summary.hardErrors) || summary.hardErrors.length !== 0) {
    errors.push(`summary hardErrors=${Array.isArray(summary.hardErrors) ? summary.hardErrors.length : 'missing'}`);
  }

  console.log(`HERO CASTING LAW MATERIAL VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
  console.log(`templates=${expectedTemplates.length} levels=${totalTemplateLevelCount} materials=${materialEntryCount} distinctItems=${usedItemIds.size} pre5Distinct=${pre5ItemIds.size} post5=${actualPost5.join(',')} errors=${errors.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
