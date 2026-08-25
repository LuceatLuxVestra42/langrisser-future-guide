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

const RARITY_BY_RANK = Object.freeze({1:'N', 2:'R', 3:'SR', 4:'SSR', 6:'LLR'});
const EXPECTED_STAR_BY_RANK = Object.freeze({1:1, 2:2, 3:2, 4:3, 6:3});
const EXPECTED_LLR_IDS = Object.freeze([99225, 99232, 99242, 99251, 99264, 99281]);

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
const unknownRankHeroIds = [];
const rankStarMismatches = [];
for (const hero of heroes) {
  const heroId = Number(hero.heroId);
  const rows = byId.get(heroId) || [];
  if (!rows.length) { missing.push(heroId); continue; }
  if (rows.length > 1) duplicate.push(heroId);
  const r = rows[0];
  const rank = r.Rank ?? null;
  const star = r.Star ?? null;
  const rarity = RARITY_BY_RANK[rank] ?? null;
  if (!rarity) unknownRankHeroIds.push(heroId);
  if (rarity && star !== EXPECTED_STAR_BY_RANK[rank]) rankStarMismatches.push({heroId, rank, star, expectedStar: EXPECTED_STAR_BY_RANK[rank]});
  mapped.push({ heroId, ...names.get(heroId), rank, rarity, star, exchangedFragmentCount: r.ExchangedFragmentCount ?? null, starToRank: r.StarToRank ?? null });
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
    rarity: field === 'rank' ? (RARITY_BY_RANK[Number(value)] ?? null) : null,
    heroCount: rows.length,
    starDistribution: Object.fromEntries([...new Set(rows.map(r => r.star))].sort((a,b)=>a-b).map(s => [String(s), rows.filter(r => r.star === s).length])),
    fragmentDistribution: Object.fromEntries([...new Set(rows.map(r => r.exchangedFragmentCount))].sort((a,b)=>a-b).map(x => [String(x), rows.filter(r => r.exchangedFragmentCount === x).length])),
    sampleHeroes: rows.slice(0, 20).map(r => ({heroId:r.heroId,nameKr:r.nameKr,nameCn:r.nameCn,nameEn:r.nameEn,star:r.star,rarity:r.rarity,exchangedFragmentCount:r.exchangedFragmentCount})),
    heroIds: rows.map(r => r.heroId).sort((a,b)=>a-b),
    heroNamesKr: rows.map(r => r.nameKr),
  })).sort((a,b)=>Number(a.value)-Number(b.value));
}

const pairCounts = {};
for (const r of mapped) {
  const k = `rank=${r.rank}|star=${r.star}`;
  pairCounts[k] = (pairCounts[k] || 0) + 1;
}

const llrIds = mapped.filter(r => r.rank === 6).map(r => r.heroId).sort((a,b)=>a-b);
const llrSetMatches = JSON.stringify(llrIds) === JSON.stringify([...EXPECTED_LLR_IDS]);
const protagonistProgression = mapped
  .filter(r => [1,3,4].includes(r.heroId))
  .map(r => ({heroId:r.heroId,nameKr:r.nameKr,initialRank:r.rank,initialStar:r.star,starToRank:r.starToRank}))
  .sort((a,b)=>a.heroId-b.heroId);

const structuralErrors = [];
if (missing.length) structuralErrors.push('canonical heroes missing ConfigDataHeroInfo row');
if (duplicate.length) structuralErrors.push('canonical hero IDs duplicated in ConfigDataHeroInfo');
if (unknownRankHeroIds.length) structuralErrors.push('canonical heroes contain an unrecognized Rank value');
if (rankStarMismatches.length) structuralErrors.push('Rank/Star pair violates validated rarity/star pattern');
if (!llrSetMatches) structuralErrors.push('Rank=6 Hero set no longer matches validated LLR set');

const result = {
  version: 1,
  status: structuralErrors.length ? 'FAIL' : 'PASS',
  purpose: 'Validated Hero rarity mapping for Stage 5-5-2 header display.',
  semantics: {
    acceptedRarityField: 'ConfigDataHeroInfo.Rank',
    rankToRarity: RARITY_BY_RANK,
    unusedObservedRankValues: [],
    unobservedRank5Meaning: 'UNRESOLVED_AND_UNUSED',
    starField: 'ConfigDataHeroInfo.Star',
    starMeaning: 'initial/current base star count; not the rarity label',
    protagonistEvidence: 'Matthew/Grenier/Almeda start at Rank=1, Star=1 and StarToRank promotes them through Rank 2/3/4 at higher stars, directly separating rarity Rank from star count.',
    llrEvidence: 'Rank=6 contains exactly the six canonical LLR Heroes currently present in the dataset.',
    rejectedRaritySource: 'ConfigDataHeroInfo.ExchangedFragmentCount',
    rejectedReason: 'Duplicate-acquisition fragment quantity correlates with ordinary rarity but has distribution/event exceptions and is not the rarity enum.'
  },
  canonicalHeroCount: heroes.length,
  mappedHeroCount: mapped.length,
  missingHeroIds: missing,
  duplicateHeroIds: duplicate,
  unknownRankHeroIds,
  rankStarMismatches,
  llrValidation: {
    expectedHeroIds: EXPECTED_LLR_IDS,
    actualHeroIds: llrIds,
    exactMatch: llrSetMatches,
    heroes: mapped.filter(r => r.rank === 6).map(r => ({heroId:r.heroId,nameKr:r.nameKr,nameCn:r.nameCn,nameEn:r.nameEn,rank:r.rank,star:r.star,rarity:r.rarity}))
  },
  protagonistProgression,
  fields: {
    Rank: {presentCount: mapped.filter(r => Number.isInteger(r.rank)).length, groups: group('rank')},
    Star: {presentCount: mapped.filter(r => Number.isInteger(r.star)).length, groups: group('star')},
    ExchangedFragmentCount: {note: 'Rejected as rarity source; retained only as a diagnostic cross-check.', groups: group('exchangedFragmentCount')},
  },
  rankStarPairCounts: pairCounts,
  heroes: mapped.map(r => ({heroId:r.heroId,nameKr:r.nameKr,nameCn:r.nameCn,nameEn:r.nameEn,rank:r.rank,rarity:r.rarity,star:r.star})),
  structuralErrors,
};

fs.mkdirSync(validationDir, {recursive:true});
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  status: result.status,
  mappedHeroCount: mapped.length,
  rankGroups: result.fields.Rank.groups.map(g=>({rank:g.value,rarity:g.rarity,count:g.heroCount,stars:g.starDistribution,samples:g.sampleHeroes.slice(0,8).map(x=>x.nameKr)})),
  rankStarPairCounts: pairCounts,
  llrExactMatch: llrSetMatches,
  unknownRankHeroIds,
  rankStarMismatches: rankStarMismatches.length,
  output: path.relative(root,outPath)
}, null, 2));
if (structuralErrors.length) process.exitCode = 1;
