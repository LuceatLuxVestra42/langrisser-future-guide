'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const HERO_MASTER = P('data/hero-name-master.v1.json');
const CATALOG = P('data/generated/hero-casting-law-materials.v1.json');
const OUTPUT = P('data/generated/hero-casting-law-by-hero.v1.json');
const SUMMARY = P('data/validation/hero-casting-law-by-hero-summary.v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function addMaterial(target, id, count) {
  target[id] = (target[id] || 0) + count;
}
function orderedMaterialTotals(map) {
  return Object.entries(map)
    .map(([itemId, count]) => ({ itemId: Number(itemId), count }))
    .sort((a, b) => a.itemId - b.itemId);
}
function exactSignature(template) {
  return JSON.stringify(template.levels.map((level) => ({
    gold: level.goldCost,
    counts: level.materials.map((material) => material.count),
  })));
}

const PROFILE_SIGNATURES = {
  A: JSON.stringify([
    { gold:25000,counts:[20] },
    { gold:35000,counts:[18,25] },
    { gold:60000,counts:[15,24,30] },
    { gold:100000,counts:[20,30,40] },
    { gold:150000,counts:[25,36,50] },
    { gold:190000,counts:[8] },
    { gold:230000,counts:[4,10] },
    { gold:280000,counts:[6,12] },
    { gold:330000,counts:[4,8,15] },
    { gold:400000,counts:[5,10,20] },
  ]),
  B: JSON.stringify([
    { gold:50000,counts:[40] },
    { gold:70000,counts:[36,50] },
    { gold:120000,counts:[30,48,60] },
    { gold:200000,counts:[40,60,80] },
    { gold:300000,counts:[50,72,100] },
    { gold:380000,counts:[16] },
    { gold:460000,counts:[8,20] },
    { gold:560000,counts:[12,24] },
    { gold:660000,counts:[8,16,30] },
    { gold:800000,counts:[10,20,40] },
  ]),
  C: JSON.stringify([
    { gold:50000,counts:[20] },
    { gold:70000,counts:[18,25] },
    { gold:120000,counts:[15,24,30] },
    { gold:200000,counts:[20,30,40] },
    { gold:300000,counts:[25,36,50] },
    { gold:380000,counts:[8] },
    { gold:460000,counts:[4,10] },
    { gold:560000,counts:[6,12] },
    { gold:660000,counts:[4,8,15] },
    { gold:800000,counts:[5,10,20] },
  ]),
};

function classifyProfile(template) {
  const signature = exactSignature(template);
  const matches = Object.entries(PROFILE_SIGNATURES)
    .filter(([, expected]) => signature === expected)
    .map(([profile]) => profile);
  return matches.length === 1 ? matches[0] : null;
}

function sumTemplateRange(template, from, to) {
  let gold = 0;
  const materials = {};
  for (const level of template.levels) {
    if (level.level < from || level.level > to) continue;
    gold += level.goldCost;
    for (const material of level.materials) addMaterial(materials, material.id, material.count);
  }
  return { gold, materials: orderedMaterialTotals(materials) };
}

function addTotals(target, part) {
  target.gold += part.gold;
  for (const material of part.materials) addMaterial(target.materials, material.itemId, material.count);
}

function finalizeTotals(target) {
  return { gold: target.gold, materials: orderedMaterialTotals(target.materials) };
}

function main() {
  const master = readJson(HERO_MASTER);
  const catalog = readJson(CATALOG);
  const heroRows = loadArray('ConfigDataHeroInfo');
  const errors = [];

  if (master?.recordCount !== 267 || !Array.isArray(master?.records) || master.records.length !== 267) {
    errors.push('hero-name-master canonical population is not 267');
  }
  if (catalog?.status !== 'PASS' || !Array.isArray(catalog?.templates)) {
    errors.push('hero-casting-law-materials catalog is not PASS');
  }

  const heroById = new Map();
  for (const row of heroRows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (heroById.has(row.ID)) errors.push(`ConfigDataHeroInfo duplicate ID=${row.ID}`);
    else heroById.set(row.ID, row);
  }

  const templateById = new Map();
  for (const template of catalog.templates || []) {
    if (!Number.isInteger(template?.templateId) || template.templateId <= 0) {
      errors.push(`catalog invalid templateId=${String(template?.templateId)}`);
      continue;
    }
    if (templateById.has(template.templateId)) errors.push(`catalog duplicate templateId=${template.templateId}`);
    else templateById.set(template.templateId, template);
  }

  const profileCounts = { A: 0, B: 0, C: 0 };
  for (const template of templateById.values()) {
    const profile = classifyProfile(template);
    if (!profile) errors.push(`template ${template.templateId}: cost signature is not exactly A/B/C`);
    else profileCounts[profile] += 1;
  }

  let templateReferenceCount = 0;
  let emptyTemplateHeroCount = 0;
  let weaponSlotCount = 0;
  const records = [];

  for (const hero of master.records || []) {
    const heroId = hero.heroId;
    const raw = heroById.get(heroId);
    if (!raw) {
      errors.push(`heroId ${heroId}: ConfigDataHeroInfo not found`);
      records.push({
        heroId,
        nameKr: hero.nameKr ?? null,
        nameCn: hero.nameCn ?? null,
        nameEn: hero.nameEn ?? null,
        sourceState: 'HERO_INFO_NOT_FOUND',
        templateIds: [],
        slots: [],
        totals: null,
      });
      continue;
    }

    const sourceList = Array.isArray(raw.CastingLawTemplates_ID) ? raw.CastingLawTemplates_ID : [];
    const templateIds = sourceList.filter((value) => Number.isInteger(value) && value > 0).map(Number);
    if (templateIds.length === 0) emptyTemplateHeroCount += 1;

    let weaponOrdinal = 0;
    const aggregate15 = { gold: 0, materials: {} };
    const aggregate610 = { gold: 0, materials: {} };
    const aggregate110 = { gold: 0, materials: {} };

    const slots = templateIds.map((templateId, sourceIndex) => {
      templateReferenceCount += 1;
      const template = templateById.get(templateId);
      if (!template) {
        errors.push(`heroId ${heroId}: unresolved CastingLaw templateId=${templateId}`);
        return {
          sourceIndex,
          templateId,
          slotType: 'UNRESOLVED',
          costProfile: null,
          templateNameCn: null,
          equipmentType: null,
          level1to5: null,
          level6to10: null,
          level1to10: null,
        };
      }

      const profile = classifyProfile(template);
      if (!profile) errors.push(`heroId ${heroId}: template ${templateId} has unclassified cost signature`);
      let slotType;
      if (template.equipmentType === 1) slotType = 'ARMOR';
      else if (template.equipmentType === 2) slotType = 'HEAD';
      else if (template.equipmentType === 3) slotType = 'ACCESSORY';
      else {
        weaponOrdinal += 1;
        weaponSlotCount += 1;
        slotType = `WEAPON_${weaponOrdinal}`;
      }

      const level1to5 = sumTemplateRange(template, 1, 5);
      const level6to10 = sumTemplateRange(template, 6, 10);
      const level1to10 = sumTemplateRange(template, 1, 10);
      addTotals(aggregate15, level1to5);
      addTotals(aggregate610, level6to10);
      addTotals(aggregate110, level1to10);

      return {
        sourceIndex,
        templateId,
        slotType,
        costProfile: profile,
        templateNameCn: template.nameCn ?? null,
        equipmentType: Number.isInteger(template.equipmentType) ? template.equipmentType : null,
        level1to5,
        level6to10,
        level1to10,
      };
    });

    records.push({
      heroId,
      nameKr: hero.nameKr ?? null,
      nameCn: hero.nameCn ?? null,
      nameEn: hero.nameEn ?? null,
      sourceState: 'RESOLVED',
      templateIds,
      slots,
      totals: {
        level1to5: finalizeTotals(aggregate15),
        level6to10: finalizeTotals(aggregate610),
        level1to10: finalizeTotals(aggregate110),
      },
    });
  }

  const status = errors.length ? 'FAIL' : 'PASS';
  const output = {
    version: 1,
    domain: 'hero-casting-law-by-hero',
    status,
    source: {
      heroMaster: 'data/hero-name-master.v1.json',
      configDataContract: 'data/contracts/configdata-source-pack-contract.v1.json',
      heroTable: 'ConfigDataHeroInfo',
      templateField: 'CastingLawTemplates_ID',
      materialCatalog: 'data/generated/hero-casting-law-materials.v1.json',
    },
    summary: {
      heroCount: records.length,
      templateReferenceCount,
      emptyTemplateHeroCount,
      weaponSlotCount,
      profileTemplateCounts: profileCounts,
    },
    records,
  };
  const summary = {
    version: 1,
    domain: 'hero-casting-law-by-hero',
    status,
    heroCount: records.length,
    sourceHeroInfoCount: heroRows.length,
    materialCatalogTemplateCount: templateById.size,
    templateReferenceCount,
    emptyTemplateHeroCount,
    weaponSlotCount,
    profileTemplateCounts: profileCounts,
    hardErrors: errors,
  };

  writeJson(OUTPUT, output);
  writeJson(SUMMARY, summary);
  console.log(`HERO CASTING LAW BY HERO BUILD: ${status}`);
  console.log(`heroes=${records.length} refs=${templateReferenceCount} empty=${emptyTemplateHeroCount} profiles=A:${profileCounts.A},B:${profileCounts.B},C:${profileCounts.C} errors=${errors.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
