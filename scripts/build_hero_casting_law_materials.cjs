'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const OUTPUT = P('data/generated/hero-casting-law-materials.v1.json');
const SUMMARY = P('data/validation/hero-casting-law-materials-summary.v1.json');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function indexUnique(rows, label, errors) {
  const byId = new Map();
  for (const row of rows) {
    const id = row?.ID;
    if (!Number.isInteger(id) || id <= 0) {
      errors.push(`${label}: invalid ID=${String(id)}`);
      continue;
    }
    if (byId.has(id)) errors.push(`${label}: duplicate ID=${id}`);
    else byId.set(id, row);
  }
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
  const templateRows = loadArray('ConfigDataCastingLawTemplateInfo');
  const levelRows = loadArray('ConfigDataCastingLawLevelUpInfo');
  const itemRows = loadArray('ConfigDataItemInfo');

  const errors = [];
  const templateById = indexUnique(templateRows, 'ConfigDataCastingLawTemplateInfo', errors);
  const levelById = indexUnique(levelRows, 'ConfigDataCastingLawLevelUpInfo', errors);
  const itemById = indexUnique(itemRows, 'ConfigDataItemInfo', errors);

  if (templateRows.length !== 50) errors.push(`template count=${templateRows.length}, expected=50`);

  const usedLevelIds = new Set();
  const usedItemIds = new Set();
  const pre5ItemIds = new Set();
  const post5ItemIds = new Set();
  let materialEntryCount = 0;

  const templates = [...templateById.values()]
    .sort((a, b) => a.ID - b.ID)
    .map((template) => {
      const levelIds = Array.isArray(template.CastingLawLevelUpInfoList)
        ? template.CastingLawLevelUpInfoList.slice()
        : [];
      if (levelIds.length !== 10) {
        errors.push(`template ${template.ID}: level-info count=${levelIds.length}, expected=10`);
      }

      const levels = levelIds.map((levelInfoId, index) => {
        const level = index + 1;
        if (!Number.isInteger(levelInfoId) || levelInfoId <= 0) {
          errors.push(`template ${template.ID} level ${level}: invalid levelInfoId=${String(levelInfoId)}`);
        }
        if (usedLevelIds.has(levelInfoId)) {
          errors.push(`levelInfoId ${levelInfoId} is referenced by more than one template`);
        }
        usedLevelIds.add(levelInfoId);

        const source = levelById.get(levelInfoId);
        if (!source) {
          errors.push(`template ${template.ID} level ${level}: missing ConfigDataCastingLawLevelUpInfo ID=${levelInfoId}`);
          return {
            level,
            levelInfoId,
            nameCn: null,
            goldCost: null,
            predecessorLevelInfoId: null,
            properties: [],
            materials: [],
          };
        }

        if (index > 0) {
          const expectedPredecessor = levelIds[index - 1];
          if (source.PreCastingLawLevelID !== expectedPredecessor) {
            errors.push(`template ${template.ID} level ${level}: PreCastingLawLevelID=${String(source.PreCastingLawLevelID)}, expected=${expectedPredecessor}`);
          }
        }

        const sourceMaterials = Array.isArray(source.LevelupMaterialsCost) ? source.LevelupMaterialsCost : [];
        if (sourceMaterials.length === 0) errors.push(`template ${template.ID} level ${level}: material list empty`);

        const materials = sourceMaterials.map((goods, materialIndex) => {
          materialEntryCount += 1;
          const goodsType = goods?.GoodsType;
          const id = goods?.Id;
          const count = goods?.Count;
          if (goodsType !== 6 || !Number.isInteger(id) || id <= 0 || !Number.isInteger(count) || count <= 0) {
            errors.push(`template ${template.ID} level ${level} material[${materialIndex}]: malformed GoodsType/Id/Count`);
            return { goodsType: goodsType ?? null, id: id ?? null, count: count ?? null, item: null };
          }
          const item = itemById.get(id);
          if (!item) {
            errors.push(`template ${template.ID} level ${level} material[${materialIndex}]: missing ConfigDataItemInfo ID=${id}`);
            return { goodsType, id, count, item: null };
          }
          usedItemIds.add(id);
          (level <= 5 ? pre5ItemIds : post5ItemIds).add(id);
          return { goodsType, id, count, item: itemSnapshot(item) };
        });

        return {
          level,
          levelInfoId,
          nameCn: source.Name ?? null,
          goldCost: Number.isInteger(source.LevelUpGoldCost) ? source.LevelUpGoldCost : null,
          predecessorLevelInfoId: Number.isInteger(source.PreCastingLawLevelID) ? source.PreCastingLawLevelID : null,
          properties: propertySnapshot(source),
          materials,
        };
      });

      return {
        templateId: template.ID,
        nameCn: template.Name ?? null,
        equipmentType: Number.isInteger(template.EquipmentType) ? template.EquipmentType : null,
        icon: template.Icon ?? null,
        levelInfoIds: levelIds,
        levels,
      };
    });

  const expectedPost5 = [3308, 3309, 3310];
  const actualPost5 = [...post5ItemIds].sort((a, b) => a - b);
  if (JSON.stringify(actualPost5) !== JSON.stringify(expectedPost5)) {
    errors.push(`post-level-5 material IDs=${actualPost5.join(',')}, expected=${expectedPost5.join(',')}`);
  }

  const totalTemplateLevelCount = templates.reduce((sum, template) => sum + template.levels.length, 0);
  if (totalTemplateLevelCount !== 500) errors.push(`template-level count=${totalTemplateLevelCount}, expected=500`);
  if (usedLevelIds.size !== 500) errors.push(`unique referenced levelInfo count=${usedLevelIds.size}, expected=500`);

  const status = errors.length ? 'FAIL' : 'PASS';
  const output = {
    version: 1,
    domain: 'hero-casting-law-materials',
    status,
    source: {
      configDataContract: 'data/contracts/configdata-source-pack-contract.v1.json',
      templateTable: 'ConfigDataCastingLawTemplateInfo',
      levelTable: 'ConfigDataCastingLawLevelUpInfo',
      itemTable: 'ConfigDataItemInfo',
      heroAssignmentIncluded: false,
    },
    summary: {
      templateCount: templates.length,
      totalTemplateLevelCount,
      materialEntryCount,
      distinctMaterialItemCount: usedItemIds.size,
      preLevel6DistinctItemIds: [...pre5ItemIds].sort((a, b) => a - b),
      postLevel5CommonMaterialItemIds: actualPost5,
    },
    templates,
  };

  const summary = {
    version: 1,
    domain: 'hero-casting-law-materials',
    status,
    templateCount: templates.length,
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
    hardErrors: errors,
  };

  writeJson(OUTPUT, output);
  writeJson(SUMMARY, summary);
  console.log(`HERO CASTING LAW MATERIAL BUILD: ${status}`);
  console.log(`templates=${templates.length} levels=${totalTemplateLevelCount} materials=${materialEntryCount} distinctItems=${usedItemIds.size} post5=${actualPost5.join(',')} errors=${errors.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
