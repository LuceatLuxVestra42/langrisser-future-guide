'use strict';

const fs = require('fs');
const path = require('path');

const heroInfo = JSON.parse(fs.readFileSync('data/configdata/ConfigDataHeroInfo.json', 'utf8'));
const master = JSON.parse(fs.readFileSync('data/hero-name-master.v1.json', 'utf8'));
const rows = Array.isArray(master) ? master : master.records;
const names = new Map(rows.map(r => [Number(r.heroId), r.nameKr]));
const playable = heroInfo.filter(h => h && h.Useable === true && names.has(Number(h.ID)));
const representativeIds = [1, 6, 10, 25, 51, 60, 69, 79, 93, 110, 131, 134, 137, 143, 99164, 99207, 99230].filter(id => names.has(id));

function kind(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

const keys = [...new Set(playable.flatMap(h => Object.keys(h)))].sort();
const profiles = [];
for (const key of keys) {
  const values = playable.map(h => h[key]).filter(v => v !== undefined);
  const kindCounts = {};
  for (const v of values) kindCounts[kind(v)] = (kindCounts[kind(v)] || 0) + 1;

  const profile = {
    field: key,
    presentCount: values.length,
    missingCount: playable.length - values.length,
    kindCounts
  };

  if (values.some(Array.isArray)) {
    const arrays = values.filter(Array.isArray);
    const lengths = {};
    const members = [];
    for (const a of arrays) {
      lengths[a.length] = (lengths[a.length] || 0) + 1;
      members.push(...a);
    }
    profile.arrayLengthCounts = lengths;
    const distinctMembers = [...new Set(members.map(v => JSON.stringify(v)))];
    profile.distinctArrayMemberCount = distinctMembers.length;
    profile.sampleArrayMembers = distinctMembers.slice(0, 40).map(v => JSON.parse(v));
  } else {
    const distinct = [...new Set(values.map(v => JSON.stringify(v)))];
    profile.distinctValueCount = distinct.length;
    if (distinct.length <= 60) profile.distinctValues = distinct.map(v => JSON.parse(v));
    else profile.sampleValues = distinct.slice(0, 20).map(v => JSON.parse(v));
  }

  profile.representativeValues = representativeIds.map(heroId => {
    const h = playable.find(x => Number(x.ID) === heroId);
    return { heroId, nameKr: names.get(heroId), value: h ? (h[key] ?? null) : null };
  });
  profiles.push(profile);
}

const likelyMultiValueCandidates = profiles
  .filter(p => p.kindCounts.array || (p.distinctValueCount && p.distinctValueCount <= 40))
  .map(p => p.field);

const focusFields = [
  'HeroBelongProduction', 'HeroGameActors', 'TeamShow', 'HeroRelateBattle', 'OwningClause',
  'Rank', 'Star', 'StarToRank', 'ExchangedFragmentCount', 'AnnualTagId', 'GameplayAnnualTagId',
  'HeroArchiveShow', 'Sex', 'CharImage_ID'
];
const focusedProfiles = focusFields.map(field => profiles.find(p => p.field === field)).filter(Boolean);

const out = {
  version: 1,
  playableHeroCount: playable.length,
  representativeIds,
  focusedProfiles,
  likelyMultiValueCandidates,
  profiles
};
const outPath = 'data/validation/hero-page-stage5-5-2-field-profile.v1.json';
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ playableHeroCount: playable.length, fieldCount: profiles.length, focusFields, likelyMultiValueCandidates }, null, 2));
