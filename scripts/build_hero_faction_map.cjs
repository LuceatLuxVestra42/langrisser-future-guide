'use strict';

const fs = require('fs');
const path = require('path');

const tags = JSON.parse(fs.readFileSync('data/configdata/ConfigDataHeroTagInfo.json', 'utf8'));
const master = JSON.parse(fs.readFileSync('data/hero-name-master.v1.json', 'utf8'));
const heroes = Array.isArray(master) ? master : master.records;
const playableIds = new Set(heroes.map(h => Number(h.heroId)).filter(Number.isFinite));
const names = new Map(heroes.map(h => [Number(h.heroId), {
  nameKr: h.nameKr ?? null,
  nameCn: h.nameCn ?? null,
  nameEn: h.nameEn ?? null
}]));

const byHero = new Map([...playableIds].map(id => [id, []]));
const superByHero = new Map([...playableIds].map(id => [id, []]));
const factionSummaries = [];
const membershipHeroIds = new Set();
const superHeroIds = new Set();
const superHeroNotMember = [];

for (const tag of tags) {
  const members = Array.isArray(tag.RelatedHeros_ID) ? tag.RelatedHeros_ID.map(Number) : [];
  const supers = Array.isArray(tag.SuperHero_ID) ? tag.SuperHero_ID.map(Number) : [];
  const memberSet = new Set(members);
  for (const id of members) {
    if (!playableIds.has(id)) continue;
    membershipHeroIds.add(id);
    byHero.get(id).push(Number(tag.ID));
  }
  for (const id of supers) {
    if (!memberSet.has(id)) superHeroNotMember.push({ factionId: Number(tag.ID), heroId: id });
    if (!playableIds.has(id)) continue;
    superHeroIds.add(id);
    superByHero.get(id).push(Number(tag.ID));
  }
  factionSummaries.push({
    factionId: Number(tag.ID),
    nameCn: tag.Name,
    descriptionCn: tag.Desc,
    icon: tag.Icon,
    playableMemberCount: members.filter(id => playableIds.has(id)).length,
    rawMemberCount: members.length,
    playableSuperHeroCount: supers.filter(id => playableIds.has(id)).length,
    rawSuperHeroCount: supers.length,
    superHeroIds: supers,
    superHeroes: supers.filter(id => names.has(id)).map(id => ({ heroId: id, ...names.get(id) }))
  });
}

const heroRecords = heroes
  .map(h => Number(h.heroId))
  .filter(Number.isFinite)
  .sort((a, b) => a - b)
  .map(heroId => ({
    heroId,
    ...names.get(heroId),
    factionIds: (byHero.get(heroId) || []).sort((a, b) => a - b),
    factionsCn: (byHero.get(heroId) || []).sort((a, b) => a - b).map(id => tags.find(t => Number(t.ID) === id)?.Name ?? null),
    superFactionIds: (superByHero.get(heroId) || []).sort((a, b) => a - b),
    isSuperHero: (superByHero.get(heroId) || []).length > 0
  }));

const membershipCountDistribution = {};
for (const r of heroRecords) membershipCountDistribution[r.factionIds.length] = (membershipCountDistribution[r.factionIds.length] || 0) + 1;
const superFactionCountDistribution = {};
for (const r of heroRecords) superFactionCountDistribution[r.superFactionIds.length] = (superFactionCountDistribution[r.superFactionIds.length] || 0) + 1;

const representativeHeroIds = [1, 6, 10, 25, 51, 60, 69, 79, 93, 110, 134, 99164, 99207, 99230];
const representatives = heroRecords.filter(r => representativeHeroIds.includes(r.heroId));

const out = {
  version: 1,
  status: membershipHeroIds.size === playableIds.size && superHeroNotMember.length === 0 ? 'PASS' : 'REVIEW',
  semantics: {
    sourceTable: 'ConfigDataHeroTagInfo',
    factionRecordId: 'ID',
    factionName: 'Name',
    factionDescription: 'Desc',
    factionIcon: 'Icon',
    factionMembership: 'RelatedHeros_ID',
    factionBuffHeroes: 'SuperHero_ID'
  },
  summary: {
    factionCount: tags.length,
    playableHeroCount: playableIds.size,
    heroesWithAtLeastOneFaction: membershipHeroIds.size,
    heroesWithoutFaction: [...playableIds].filter(id => !membershipHeroIds.has(id)).sort((a, b) => a - b),
    membershipCountDistribution,
    uniqueSuperHeroCount: superHeroIds.size,
    superFactionCountDistribution,
    superHeroNotMember
  },
  factions: factionSummaries,
  representatives,
  heroes: heroRecords
};

const outPath = 'data/validation/hero-page-stage5-5-2-factions.v1.json';
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ status: out.status, summary: out.summary, factions: factionSummaries.map(f => ({ factionId: f.factionId, nameCn: f.nameCn, playableMemberCount: f.playableMemberCount, playableSuperHeroCount: f.playableSuperHeroCount })), representatives }, null, 2));
