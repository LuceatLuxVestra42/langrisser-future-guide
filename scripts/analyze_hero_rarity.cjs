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
const outPath = path.join(validationDir, 'hero-page-stage5-5-2-rarity.v1.json');

if (!Array.isArray(heroInfo)) throw new Error('ConfigDataHeroInfo must be an array');
if (heroes.length !== 267) throw new Error(`Expected 267 canonical heroes; got ${heroes.length}`);

const names = new Map(heroes.map(h => [Number(h.heroId), {
  nameKr: h.nameKr ?? null,
  nameCn: h.nameCn ?? null,
  nameEn: h.nameEn ?? null,
}]));
const byId = new Map();
for (const row of heroInfo) {
  if (!row || !Number.isInteger(row.ID)) continue;
  const list = byId.get(row.ID) || [];
  list.push(row);
  byId.set(row.ID, list);
}

const mapped = [];
const missing = [];
const duplicate = [];
for (const hero of heroes) {
  const heroId = Number(hero.heroId);
  const rows = byId.get(heroId) || [];
  if (!rows.length) { missing.push(heroId); continue; }
  if (rows.length > 1) duplicate.push(heroId);
  const r = rows[0];
  mapped.push({ heroId, ...names.get(heroId), rank: r.Rank ?? null, star: r.Star ?? null, exchangedFragmentCount: r.ExchangedFragmentCount ?? null });
}

function group(field) {
  const m = new Map();
  for (const row of mapped) {
    const v = row[field];
    const k = String(v);
    const list = m.get(k) || [];
    list.push(row);
    m.set(k, list);
  }
  return [...m.entries()].map(([value, rows]) => ({
    value: Number.isNaN(Number(value)) ? value : Number(value),
    heroCount: rows.length,
    starDistribution: Object.fromEntries([...new Set(rows.map(r => r.star))].sort((a,b)=>a-b).map(s => [String(s), rows.filter(r => r.star === s).length])),
    fragmentDistribution: Object.fromEntries([...new Set(rows.map(r => r.exchangedFragmentCount))].sort((a,b)=>a-b).map(x => [String(x), rows.filter(r => r.exchangedFragmentCount === x).length])),
    sampleHeroes: rows.slice(0, 20).map(r => ({heroId:r.heroId,nameKr:r.nameKr,nameCn:r.nameCn,nameEn:r.nameEn,star:r.star,exchangedFragmentCount:r.exchangedFragmentCount})),
    heroIds: rows.map(r => r.heroId).sort((a,b)=>a-b),
    heroNamesKr: rows.map(r => r.nameKr),
  })).sort((a,b)=>Number(a.value)-Number(b.value));
}

const pairCounts = {};
for (const r of mapped) {
  const k = `rank=${r.rank}|star=${r.star}`;
  pairCounts[k] = (pairCounts[k] || 0) + 1;
}

const anchors = [1,2,3,4,5,6,10,25,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,60,69,79,93,110,131,134,137,143,99164,99207,99230];
const anchorRows = mapped.filter(r => anchors.includes(r.heroId));

const result = {
  version: 1,
  status: missing.length || duplicate.length ? 'REVIEW_WITH_ISSUES' : 'REVIEW',
  purpose: 'Measure rarity-like fields before assigning display labels.',
  source: 'ConfigDataHeroInfo',
  canonicalHeroCount: heroes.length,
  mappedHeroCount: mapped.length,
  missingHeroIds: missing,
  duplicateHeroIds: duplicate,
  fields: {
    Rank: {presentCount: mapped.filter(r => Number.isInteger(r.rank)).length, groups: group('rank')},
    Star: {presentCount: mapped.filter(r => Number.isInteger(r.star)).length, groups: group('star')},
    ExchangedFragmentCount: {note: 'Previously rejected as rarity source; included only for cross-check.', groups: group('exchangedFragmentCount')},
  },
  rankStarPairCounts: pairCounts,
  anchors: anchorRows,
  interpretation: {
    acceptedRarityField: null,
    labels: null,
    rule: 'Do not promote Rank or Star to rarity labels until group membership is independently validated against known rarity examples.'
  }
};

fs.mkdirSync(validationDir, {recursive:true});
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  status: result.status,
  mappedHeroCount: mapped.length,
  rankGroups: result.fields.Rank.groups.map(g=>({rank:g.value,count:g.heroCount,stars:g.starDistribution,samples:g.sampleHeroes.slice(0,8).map(x=>x.nameKr)})),
  rankStarPairCounts: pairCounts,
  output: path.relative(root,outPath)
}, null, 2));
