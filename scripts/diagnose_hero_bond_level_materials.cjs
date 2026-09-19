'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const ids = (v) => (Array.isArray(v) ? v : []).filter(Number.isInteger).filter((x) => x > 0);
const materials = (rows) => (Array.isArray(rows) ? rows : []).map((x) => ({
  level: Number(x?.Level),
  itemType: Number(x?.ItemType),
  itemId: Number(x?.ItemId),
  count: Number(x?.Count),
}));

const master = readJson('data/hero-name-master.v1.json');
const heroInfo = loadArray('ConfigDataHeroInfo');
const heroInformation = loadArray('ConfigDataHeroInformationInfo');
const fetters = loadArray('ConfigDataHeroFetterInfo');
const hearts = loadArray('ConfigDataHeroHeartFetterInfo');
const items = loadArray('ConfigDataItemInfo');

const heroById = new Map(heroInfo.filter((x) => Number.isInteger(x?.ID)).map((x) => [x.ID, x]));
const infoById = new Map(heroInformation.filter((x) => Number.isInteger(x?.ID)).map((x) => [x.ID, x]));
const fetterById = new Map(fetters.filter((x) => Number.isInteger(x?.ID)).map((x) => [x.ID, x]));
const heartById = new Map(hearts.filter((x) => Number.isInteger(x?.ID)).map((x) => [x.ID, x]));
const itemById = new Map(items.filter((x) => Number.isInteger(x?.ID)).map((x) => [x.ID, x]));

const errors = [];
const referencedFetters = new Set();
const referencedHearts = new Set();
for (const hero of master.records) {
  const raw = heroById.get(hero.heroId);
  if (!raw) { errors.push(`hero ${hero.heroId}: HeroInfo missing`); continue; }
  const info = infoById.get(raw.HeroInformation_ID);
  if (!info) { errors.push(`hero ${hero.heroId}: HeroInformation ${raw.HeroInformation_ID} missing`); continue; }
  for (const id of ids(info.HeroFetters_ID)) {
    referencedFetters.add(id);
    if (!fetterById.has(id)) errors.push(`hero ${hero.heroId}: Fetter ${id} missing`);
  }
  if (!Number.isInteger(info.HeroHeartFetterId) || info.HeroHeartFetterId <= 0) errors.push(`hero ${hero.heroId}: invalid HeroHeartFetterId=${info.HeroHeartFetterId}`);
  else {
    referencedHearts.add(info.HeroHeartFetterId);
    if (!heartById.has(info.HeroHeartFetterId)) errors.push(`hero ${hero.heroId}: HeartFetter ${info.HeroHeartFetterId} missing`);
  }
}

const itemIds = new Set();
for (const id of referencedFetters) for (const m of materials(fetterById.get(id)?.LevelUpMaterials)) itemIds.add(m.itemId);
for (const id of referencedHearts) for (const m of materials(heartById.get(id)?.LevelUpMaterials)) itemIds.add(m.itemId);

const itemLookup = [...itemIds].sort((a,b)=>a-b).map((id) => {
  const row = itemById.get(id);
  return {
    itemId:id,
    name: row?.Name ?? null,
    description: row?.Description ?? row?.Desc ?? null,
    icon: row?.Icon ?? null,
    keys: row ? Object.keys(row).filter((k)=>/(name|desc|icon|type|id)/i.test(k)).sort() : [],
  };
});

function costShape(row) {
  return {
    id: row.ID,
    name: row.Name ?? null,
    maxLevel: row.MaxLevel,
    reward: row.Reward ?? null,
    gotSkills: row.GotSkills_ID ?? null,
    levelUpGold: row.LevelUpGold ?? null,
    levelUpMaterials: materials(row.LevelUpMaterials),
  };
}

const sampleHeroIds = [1, 6, 40, 144, 286];
const samples = sampleHeroIds.filter((id)=>master.records.some((x)=>x.heroId===id)).map((heroId) => {
  const hero = master.records.find((x)=>x.heroId===heroId);
  const raw = heroById.get(heroId);
  const info = infoById.get(raw.HeroInformation_ID);
  return {
    heroId,
    nameKr: hero.nameKr,
    heroInformationId: raw.HeroInformation_ID,
    heroFetterIds: ids(info.HeroFetters_ID),
    heroHeartFetterId: info.HeroHeartFetterId,
    fetters: ids(info.HeroFetters_ID).map((id)=>costShape(fetterById.get(id))),
    heart: costShape(heartById.get(info.HeroHeartFetterId)),
  };
});

const fetterSignatureCounts = new Map();
for (const id of referencedFetters) {
  const row=fetterById.get(id);
  const sig=JSON.stringify({g:row.LevelUpGold,m:materials(row.LevelUpMaterials).map(x=>[x.level,x.itemType,x.itemId,x.count])});
  fetterSignatureCounts.set(sig,(fetterSignatureCounts.get(sig)||0)+1);
}
const heartSignatureCounts = new Map();
for (const id of referencedHearts) {
  const row=heartById.get(id);
  const sig=JSON.stringify({g:row.LevelUpGold,m:materials(row.LevelUpMaterials).map(x=>[x.level,x.itemType,x.itemId,x.count])});
  heartSignatureCounts.set(sig,(heartSignatureCounts.get(sig)||0)+1);
}

console.log(JSON.stringify({
  status: errors.length ? 'FAIL' : 'PASS',
  canonicalHeroCount: master.records.length,
  sourceCounts: { heroInfo: heroInfo.length, heroInformation: heroInformation.length, fetter: fetters.length, heartFetter: hearts.length, item: items.length },
  referenceCounts: { uniqueFetterIds: referencedFetters.size, uniqueHeartFetterIds: referencedHearts.size },
  costSignatureCounts: { fetterUnique: fetterSignatureCounts.size, heartUnique: heartSignatureCounts.size },
  itemLookup,
  samples,
  errors,
}, null, 2));
