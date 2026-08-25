'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const configDir = path.join(dataDir, 'configdata');
const validationDir = path.join(dataDir, 'validation');

const masterRoot = JSON.parse(fs.readFileSync(path.join(dataDir, 'hero-name-master.v1.json'), 'utf8'));
const heroes = Array.isArray(masterRoot) ? masterRoot : (masterRoot.records || []);
const heroInfo = JSON.parse(fs.readFileSync(path.join(configDir, 'ConfigDataHeroInfo.json'), 'utf8'));
const charImageInfo = JSON.parse(fs.readFileSync(path.join(configDir, 'ConfigDataCharImageInfo.json'), 'utf8'));
const heroSkinInfo = JSON.parse(fs.readFileSync(path.join(configDir, 'ConfigDataHeroSkinInfo.json'), 'utf8'));
const outPath = path.join(validationDir, 'hero-page-stage5-5-2-artwork.v1.json');

if (!Array.isArray(heroInfo) || !Array.isArray(charImageInfo) || !Array.isArray(heroSkinInfo)) {
  throw new Error('Expected parsed ConfigData arrays');
}
if (heroes.length !== 267) throw new Error(`Expected 267 canonical heroes; got ${heroes.length}`);

function groupByInt(rows, field) {
  const m = new Map();
  for (const row of rows) {
    if (!row || !Number.isInteger(row[field])) continue;
    const list = m.get(row[field]) || [];
    list.push(row);
    m.set(row[field], list);
  }
  return m;
}
function text(v) { return typeof v === 'string' ? v.trim() : ''; }
function prefix(v) {
  const s = text(v);
  if (!s) return null;
  const slash = s.lastIndexOf('/');
  return slash >= 0 ? s.slice(0, slash + 1) : '(no-path-prefix)';
}

const heroInfoById = groupByInt(heroInfo, 'ID');
const charById = groupByInt(charImageInfo, 'ID');

const candidateFields = [
  'HeroPainting',
  'CardHeadImage',
  'SmallHeadImage',
  'RoundHeadImage',
  'SummonHeadImage',
  'Spine',
  'Spine2',
  'SpineBackground'
];

const baseRows = [];
const missingHeroInfoIds = [];
const duplicateHeroInfoIds = [];
const invalidCharImagePointerHeroIds = [];
const unresolvedCharImagePointers = [];
const duplicateCharImageIdsUsed = [];

for (const hero of heroes) {
  const heroId = Number(hero.heroId);
  const hRows = heroInfoById.get(heroId) || [];
  if (!hRows.length) { missingHeroInfoIds.push(heroId); continue; }
  if (hRows.length > 1) duplicateHeroInfoIds.push(heroId);
  const h = hRows[0];
  const charImageId = h.CharImage_ID;
  if (!Number.isInteger(charImageId) || charImageId <= 0) {
    invalidCharImagePointerHeroIds.push(heroId);
    continue;
  }
  const cRows = charById.get(charImageId) || [];
  if (!cRows.length) {
    unresolvedCharImagePointers.push({heroId, charImageId});
    continue;
  }
  if (cRows.length > 1) duplicateCharImageIdsUsed.push({heroId, charImageId, rowCount:cRows.length});
  baseRows.push({
    heroId,
    nameKr: hero.nameKr ?? null,
    nameCn: hero.nameCn ?? null,
    nameEn: hero.nameEn ?? null,
    charImageId,
    char: cRows[0],
  });
}

function summarizeField(rows, field, accessor) {
  const values = rows.map(r => text(accessor(r)?.[field]));
  const nonEmpty = values.filter(Boolean);
  const counts = new Map();
  for (const v of nonEmpty) counts.set(v, (counts.get(v) || 0) + 1);
  const prefixCounts = new Map();
  for (const v of nonEmpty) {
    const p = prefix(v);
    prefixCounts.set(p, (prefixCounts.get(p) || 0) + 1);
  }
  return {
    presentCount: nonEmpty.length,
    missingCount: rows.length - nonEmpty.length,
    distinctValueCount: counts.size,
    duplicateValueCount: [...counts.values()].filter(n => n > 1).length,
    topPathPrefixes: [...prefixCounts.entries()].sort((a,b)=>b[1]-a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, 12).map(([pathPrefix,count])=>({pathPrefix,count})),
    sampleValues: [...new Set(nonEmpty)].slice(0, 12),
  };
}

const baseFieldCoverage = Object.fromEntries(candidateFields.map(field => [field, summarizeField(baseRows, field, r => r.char)]));

const skinRows = [];
const invalidSkinResourceIds = [];
const unresolvedSkinResourceIds = [];
for (const skin of heroSkinInfo) {
  const resourceId = skin?.CharImageSkinResource_ID;
  if (!Number.isInteger(resourceId) || resourceId <= 0) {
    invalidSkinResourceIds.push(skin?.ID ?? null);
    continue;
  }
  const cRows = charById.get(resourceId) || [];
  if (!cRows.length) {
    unresolvedSkinResourceIds.push({skinId: skin.ID, specifiedHero: skin.SpecifiedHero ?? null, charImageSkinResourceId: resourceId});
    continue;
  }
  skinRows.push({
    skinId: skin.ID,
    skinName: skin.Name ?? null,
    specifiedHero: skin.SpecifiedHero ?? null,
    charImageSkinResourceId: resourceId,
    char: cRows[0],
    skin,
  });
}
const skinFieldCoverage = Object.fromEntries(candidateFields.map(field => [field, summarizeField(skinRows, field, r => r.char)]));

const representativeHeroIds = [1,6,10,25,69,79,134,99225,99232,99235,99276,99284];
const representativeHeroes = baseRows.filter(r => representativeHeroIds.includes(r.heroId)).map(r => ({
  heroId:r.heroId,
  nameKr:r.nameKr,
  charImageId:r.charImageId,
  values:Object.fromEntries(candidateFields.map(f => [f, text(r.char[f]) || null]))
}));

const representativeSkins = skinRows.slice(0, 16).map(r => ({
  skinId:r.skinId,
  skinName:r.skinName,
  specifiedHero:r.specifiedHero,
  charImageSkinResourceId:r.charImageSkinResourceId,
  skinInfoImages:{
    Icon:text(r.skin.Icon)||null,
    CardHeadImage:text(r.skin.CardHeadImage)||null,
    SmallHeadImage:text(r.skin.SmallHeadImage)||null,
    RoundHeadImage:text(r.skin.RoundHeadImage)||null,
  },
  charImageValues:Object.fromEntries(candidateFields.map(f => [f, text(r.char[f]) || null]))
}));

const errors = [];
if (missingHeroInfoIds.length) errors.push('canonical hero missing HeroInfo');
if (duplicateHeroInfoIds.length) errors.push('canonical HeroInfo ID duplicated');
if (invalidCharImagePointerHeroIds.length) errors.push('invalid base CharImage_ID');
if (unresolvedCharImagePointers.length) errors.push('base CharImage_ID does not resolve to CharImageInfo.ID');
if (duplicateCharImageIdsUsed.length) errors.push('used CharImageInfo.ID duplicated');
if (baseFieldCoverage.HeroPainting.presentCount !== heroes.length) errors.push('HeroPainting missing for canonical Hero');
if (baseFieldCoverage.HeroPainting.distinctValueCount !== heroes.length) errors.push('HeroPainting is not unique per canonical Hero');

const result = {
  version:1,
  status: errors.length ? 'FAIL' : 'PASS',
  purpose:'Validated final static Hero-detail artwork field and separation from thumbnails/Spine resources.',
  sourceJoin:'ConfigDataHeroInfo.CharImage_ID -> ConfigDataCharImageInfo.ID',
  designRequirement:'Hero detail header uses a large Hero illustration; skin navigation is a separate skin-resource problem.',
  coverage:{
    canonicalHeroCount:heroes.length,
    resolvedBaseCharImageRows:baseRows.length,
    missingHeroInfoIds,
    duplicateHeroInfoIds,
    invalidCharImagePointerHeroIds,
    unresolvedCharImagePointers,
    duplicateCharImageIdsUsed,
    heroSkinInfoRows:heroSkinInfo.length,
    skinResourceIdsAlsoPresentInCharImageInfo:skinRows.length,
    skinResourceIdsNotPresentInCharImageInfo:unresolvedSkinResourceIds.length,
    invalidSkinResourceIds,
  },
  baseFieldCoverage,
  skinCrossCheck:{
    note:'ConfigDataHeroSkinInfo.CharImageSkinResource_ID is not generally a foreign key to ConfigDataCharImageInfo.ID. Only a minority of values collide/resolve there, so this join must not be used for skin artwork.',
    resolvedCount:skinRows.length,
    unresolvedCount:unresolvedSkinResourceIds.length,
    resolvedFieldCoverage:skinFieldCoverage,
    unresolvedExamples:unresolvedSkinResourceIds.slice(0,20),
  },
  representativeHeroes,
  representativeSkins,
  interpretation:{
    acceptedHeroDetailArtworkField:'ConfigDataCharImageInfo.HeroPainting',
    acceptedBaseArtworkJoin:'ConfigDataHeroInfo.CharImage_ID -> ConfigDataCharImageInfo.ID -> HeroPainting',
    baseArtworkCoverage:'267/267 non-empty, 267 distinct values',
    fieldRoles:{
      HeroPainting:'large static Hero painting/prefab for Hero-detail display',
      CardHeadImage:'card head image; cropped/card presentation asset, not the full Hero painting',
      SmallHeadImage:'small Hero head icon',
      RoundHeadImage:'battle/round head icon',
      SummonHeadImage:'summon/card icon',
      Spine:'primary animated Spine character prefab; not the static header painting',
      Spine2:'optional secondary/bust Spine prefab; not universal',
      SpineBackground:'optional special Spine background, present only for a small subset; not a general Hero-detail background source'
    },
    skinArtworkStatus:'SEPARATE_SOURCE_REQUIRED',
    skinArtworkRule:'Do not resolve CharImageSkinResource_ID through ConfigDataCharImageInfo.ID. Skin main-artwork source must be traced separately in the skin semantics task.',
    backgroundRule:'Do not use SpineBackground as the general illustration backdrop because it is not universal; header background remains a separate presentation/resource decision.'
  },
  errors,
};

fs.mkdirSync(validationDir,{recursive:true});
fs.writeFileSync(outPath, JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({
  status:result.status,
  coverage:result.coverage,
  acceptedHeroDetailArtworkField:result.interpretation.acceptedHeroDetailArtworkField,
  baseArtworkCoverage:result.interpretation.baseArtworkCoverage,
  skinArtworkStatus:result.interpretation.skinArtworkStatus,
  baseFieldCoverage:result.baseFieldCoverage,
  output:path.relative(root,outPath),
}, null, 2));
if (errors.length) process.exitCode = 1;
