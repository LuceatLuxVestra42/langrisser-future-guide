'use strict';

const fs = require('fs');
const path = require('path');

const heroInfoPath = path.join('data', 'configdata', 'ConfigDataHeroInfo.json');
const heroMasterPath = path.join('data', 'hero-name-master.v1.json');
const outPath = path.join('data', 'validation', 'hero-page-stage5-5-2-display-semantics.v1.json');

const heroInfo = JSON.parse(fs.readFileSync(heroInfoPath, 'utf8'));
const master = JSON.parse(fs.readFileSync(heroMasterPath, 'utf8'));
const masterRows = Array.isArray(master) ? master : master.records;
const names = new Map(masterRows.map(r => [Number(r.heroId), {
  nameKr: r.nameKr ?? null,
  nameCn: r.nameCn ?? null,
  nameEn: r.nameEn ?? null
}]));

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null) return [];
  return [v];
}

const playableRaw = heroInfo.filter(h => h && h.Useable === true && names.has(Number(h.ID)));
const fieldShapeCounts = { array: 0, scalar: 0, missing: 0 };
for (const h of playableRaw) {
  if (Array.isArray(h.HeroBelongProduction)) fieldShapeCounts.array++;
  else if (h.HeroBelongProduction === undefined || h.HeroBelongProduction === null) fieldShapeCounts.missing++;
  else fieldShapeCounts.scalar++;
}

const playable = playableRaw.map(h => ({
  heroId: Number(h.ID),
  ...names.get(Number(h.ID)),
  heroBelongProduction: asArray(h.HeroBelongProduction).map(Number),
  heroGameActors: h.HeroGameActors ?? null,
  teamShow: h.TeamShow ?? null,
  heroRelateBattle: h.HeroRelateBattle ?? null
}));

const productionGroups = new Map();
for (const h of playable) {
  for (const id of h.heroBelongProduction) {
    if (!productionGroups.has(id)) productionGroups.set(id, []);
    productionGroups.get(id).push({
      heroId: h.heroId,
      nameKr: h.nameKr,
      nameCn: h.nameCn,
      nameEn: h.nameEn
    });
  }
}

const groups = [...productionGroups.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([productionId, heroes]) => ({
    productionId,
    heroCount: heroes.length,
    heroes: heroes.sort((a, b) => a.heroId - b.heroId)
  }));

const productionGroupSamples = groups.map(g => ({
  productionId: g.productionId,
  heroCount: g.heroCount,
  sampleNamesKr: g.heroes.slice(0, 6).map(h => h.nameKr),
  sampleNamesCn: g.heroes.slice(0, 6).map(h => h.nameCn)
}));

const multiProductionHeroes = playable
  .filter(h => h.heroBelongProduction.length > 1)
  .sort((a, b) => a.heroId - b.heroId);

const actorValueCounts = {};
const teamShowValueCounts = {};
for (const h of playable) {
  const actorKey = JSON.stringify(h.heroGameActors);
  const teamKey = JSON.stringify(h.teamShow);
  actorValueCounts[actorKey] = (actorValueCounts[actorKey] || 0) + 1;
  teamShowValueCounts[teamKey] = (teamShowValueCounts[teamKey] || 0) + 1;
}

const out = {
  version: 1,
  purpose: 'Semantic investigation only; no labels are asserted by this artifact.',
  source: {
    heroInfo: 'data/configdata/ConfigDataHeroInfo.json',
    heroNames: 'data/hero-name-master.v1.json'
  },
  playableHeroCount: playable.length,
  heroBelongProductionFieldShape: fieldShapeCounts,
  productionPointerCount: playable.reduce((n, h) => n + h.heroBelongProduction.length, 0),
  distinctProductionIds: groups.length,
  multiProductionHeroCount: multiProductionHeroes.length,
  productionGroupSamples,
  multiProductionHeroes,
  productionGroups: groups,
  heroGameActorsValueCounts: actorValueCounts,
  teamShowValueCounts
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({
  playableHeroCount: out.playableHeroCount,
  heroBelongProductionFieldShape: out.heroBelongProductionFieldShape,
  productionPointerCount: out.productionPointerCount,
  distinctProductionIds: out.distinctProductionIds,
  multiProductionHeroCount: out.multiProductionHeroCount,
  productionGroupSamples: out.productionGroupSamples,
  output: outPath
}, null, 2));
