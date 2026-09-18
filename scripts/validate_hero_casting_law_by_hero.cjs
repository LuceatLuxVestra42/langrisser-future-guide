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
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function addMaterial(target, id, count) { target[id] = (target[id] || 0) + count; }
function orderedMaterials(map) {
  return Object.entries(map).map(([itemId, count]) => ({ itemId: Number(itemId), count })).sort((a, b) => a.itemId - b.itemId);
}
function sum(template, from, to) {
  let gold = 0;
  const materials = {};
  for (const level of template.levels || []) {
    if (level.level < from || level.level > to) continue;
    gold += level.goldCost;
    for (const material of level.materials || []) addMaterial(materials, material.id, material.count);
  }
  return { gold, materials: orderedMaterials(materials) };
}
function signature(template) {
  return JSON.stringify((template.levels || []).map((level) => ({
    gold: level.goldCost,
    counts: (level.materials || []).map((material) => material.count),
  })));
}
const expectedProfiles = new Map([
  [JSON.stringify([
    {gold:25000,counts:[20]},{gold:35000,counts:[18,25]},{gold:60000,counts:[15,24,30]},{gold:100000,counts:[20,30,40]},{gold:150000,counts:[25,36,50]},
    {gold:190000,counts:[8]},{gold:230000,counts:[4,10]},{gold:280000,counts:[6,12]},{gold:330000,counts:[4,8,15]},{gold:400000,counts:[5,10,20]},
  ]), 'A'],
  [JSON.stringify([
    {gold:50000,counts:[40]},{gold:70000,counts:[36,50]},{gold:120000,counts:[30,48,60]},{gold:200000,counts:[40,60,80]},{gold:300000,counts:[50,72,100]},
    {gold:380000,counts:[16]},{gold:460000,counts:[8,20]},{gold:560000,counts:[12,24]},{gold:660000,counts:[8,16,30]},{gold:800000,counts:[10,20,40]},
  ]), 'B'],
  [JSON.stringify([
    {gold:50000,counts:[20]},{gold:70000,counts:[18,25]},{gold:120000,counts:[15,24,30]},{gold:200000,counts:[20,30,40]},{gold:300000,counts:[25,36,50]},
    {gold:380000,counts:[8]},{gold:460000,counts:[4,10]},{gold:560000,counts:[6,12]},{gold:660000,counts:[4,8,15]},{gold:800000,counts:[5,10,20]},
  ]), 'C'],
]);
function profileOf(template) { return expectedProfiles.get(signature(template)) ?? null; }
function mergeTotals(target, value) {
  target.gold += value.gold;
  for (const material of value.materials) addMaterial(target.materials, material.itemId, material.count);
}
function finishTotals(target) { return { gold: target.gold, materials: orderedMaterials(target.materials) }; }

function main() {
  const errors = [];
  const master = readJson(HERO_MASTER);
  const catalog = readJson(CATALOG);
  const output = readJson(OUTPUT);
  const summary = readJson(SUMMARY);
  const heroRows = loadArray('ConfigDataHeroInfo');

  if (master?.recordCount !== 267 || !Array.isArray(master?.records) || master.records.length !== 267) errors.push('canonical Hero master mismatch');
  if (catalog?.status !== 'PASS' || !Array.isArray(catalog?.templates) || catalog.templates.length !== 50) errors.push('Casting Law material catalog mismatch');
  if (output?.version !== 1 || output?.domain !== 'hero-casting-law-by-hero' || output?.status !== 'PASS') errors.push('generated artifact identity/status mismatch');
  if (summary?.version !== 1 || summary?.domain !== 'hero-casting-law-by-hero' || summary?.status !== 'PASS') errors.push('summary identity/status mismatch');

  const heroById = new Map();
  for (const row of heroRows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (heroById.has(row.ID)) errors.push(`ConfigDataHeroInfo duplicate ID=${row.ID}`);
    else heroById.set(row.ID, row);
  }
  const templateById = new Map();
  for (const template of catalog.templates || []) {
    if (!Number.isInteger(template?.templateId) || template.templateId <= 0) { errors.push('catalog invalid template ID'); continue; }
    if (templateById.has(template.templateId)) errors.push(`catalog duplicate templateId=${template.templateId}`);
    else templateById.set(template.templateId, template);
  }

  const profileTemplateCounts = { A: 0, B: 0, C: 0 };
  for (const template of templateById.values()) {
    const profile = profileOf(template);
    if (!profile) errors.push(`template ${template.templateId}: no exact A/B/C cost profile`);
    else profileTemplateCounts[profile] += 1;
  }
  if (!same(profileTemplateCounts, {A:25,B:21,C:4})) errors.push(`profile template counts mismatch: ${JSON.stringify(profileTemplateCounts)}`);

  const outputRecords = Array.isArray(output?.records) ? output.records : [];
  if (outputRecords.length !== master.records.length) errors.push(`generated Hero count=${outputRecords.length}, expected=${master.records.length}`);
  const actualByHero = new Map();
  for (const row of outputRecords) {
    if (!Number.isInteger(row?.heroId) || row.heroId <= 0) { errors.push('generated invalid heroId'); continue; }
    if (actualByHero.has(row.heroId)) errors.push(`generated duplicate heroId=${row.heroId}`);
    else actualByHero.set(row.heroId, row);
  }

  let templateReferenceCount = 0;
  let emptyTemplateHeroCount = 0;
  let weaponSlotCount = 0;

  for (const hero of master.records) {
    const heroId = hero.heroId;
    const raw = heroById.get(heroId);
    const actual = actualByHero.get(heroId);
    if (!raw) { errors.push(`heroId ${heroId}: source row missing`); continue; }
    if (!actual) { errors.push(`heroId ${heroId}: generated row missing`); continue; }

    for (const key of ['nameKr','nameCn','nameEn']) {
      if ((actual[key] ?? null) !== (hero[key] ?? null)) errors.push(`heroId ${heroId}: ${key} mismatch`);
    }
    if (actual.sourceState !== 'RESOLVED') errors.push(`heroId ${heroId}: sourceState=${String(actual.sourceState)}`);

    const sourceList = Array.isArray(raw.CastingLawTemplates_ID) ? raw.CastingLawTemplates_ID : [];
    const templateIds = sourceList.filter((value) => Number.isInteger(value) && value > 0).map(Number);
    if (!same(actual.templateIds, templateIds)) errors.push(`heroId ${heroId}: templateIds source-order mismatch`);
    if (templateIds.length === 0) emptyTemplateHeroCount += 1;

    const expectedSlots = [];
    let weaponOrdinal = 0;
    const total15 = { gold:0, materials:{} };
    const total610 = { gold:0, materials:{} };
    const total110 = { gold:0, materials:{} };

    for (let sourceIndex = 0; sourceIndex < templateIds.length; sourceIndex += 1) {
      const templateId = templateIds[sourceIndex];
      templateReferenceCount += 1;
      const template = templateById.get(templateId);
      if (!template) { errors.push(`heroId ${heroId}: unresolved templateId=${templateId}`); continue; }
      const costProfile = profileOf(template);
      if (!costProfile) { errors.push(`heroId ${heroId}: template ${templateId} profile missing`); continue; }

      let slotType;
      if (template.equipmentType === 1) slotType = 'ARMOR';
      else if (template.equipmentType === 2) slotType = 'HEAD';
      else if (template.equipmentType === 3) slotType = 'ACCESSORY';
      else { weaponOrdinal += 1; weaponSlotCount += 1; slotType = `WEAPON_${weaponOrdinal}`; }

      const level1to5 = sum(template,1,5);
      const level6to10 = sum(template,6,10);
      const level1to10 = sum(template,1,10);
      mergeTotals(total15, level1to5);
      mergeTotals(total610, level6to10);
      mergeTotals(total110, level1to10);
      expectedSlots.push({
        sourceIndex,
        templateId,
        slotType,
        costProfile,
        templateNameCn: template.nameCn ?? null,
        equipmentType: Number.isInteger(template.equipmentType) ? template.equipmentType : null,
        level1to5,
        level6to10,
        level1to10,
      });
    }

    if (!same(actual.slots, expectedSlots)) errors.push(`heroId ${heroId}: slot payload mismatch`);
    const expectedTotals = {
      level1to5: finishTotals(total15),
      level6to10: finishTotals(total610),
      level1to10: finishTotals(total110),
    };
    if (!same(actual.totals, expectedTotals)) errors.push(`heroId ${heroId}: aggregate totals mismatch`);
  }

  const expectedSummary = {
    heroCount: master.records.length,
    sourceHeroInfoCount: heroRows.length,
    materialCatalogTemplateCount: templateById.size,
    templateReferenceCount,
    emptyTemplateHeroCount,
    weaponSlotCount,
    profileTemplateCounts,
  };
  for (const [key, expected] of Object.entries(expectedSummary)) {
    if (!same(summary[key], expected)) errors.push(`summary.${key} mismatch`);
  }
  if (!Array.isArray(summary.hardErrors) || summary.hardErrors.length !== 0) errors.push('summary hardErrors must be empty');
  if (!same(output.summary, {
    heroCount: master.records.length,
    templateReferenceCount,
    emptyTemplateHeroCount,
    weaponSlotCount,
    profileTemplateCounts,
  })) errors.push('generated summary mismatch');

  console.log(`HERO CASTING LAW BY HERO VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
  console.log(`heroes=${master.records.length} refs=${templateReferenceCount} empty=${emptyTemplateHeroCount} weapons=${weaponSlotCount} profiles=A:${profileTemplateCounts.A},B:${profileTemplateCounts.B},C:${profileTemplateCounts.C} errors=${errors.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
