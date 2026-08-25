'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const configDir = path.join(dataDir, 'configdata');
const validationDir = path.join(dataDir, 'validation');

const masterRoot = JSON.parse(fs.readFileSync(path.join(dataDir, 'hero-name-master.v1.json'), 'utf8'));
const heroes = Array.isArray(masterRoot) ? masterRoot : (masterRoot.records || []);
const heroInfo = JSON.parse(fs.readFileSync(path.join(configDir, 'ConfigDataHeroInfo.json'), 'utf8'));
const charImageInfo = JSON.parse(fs.readFileSync(path.join(configDir, 'ConfigDataCharImageInfo.json'), 'utf8'));
const outPath = path.join(validationDir, 'hero-page-stage5-5-2-cv.v1.json');

if (!Array.isArray(heroInfo)) throw new Error('ConfigDataHeroInfo must be an array');
if (!Array.isArray(charImageInfo)) throw new Error('ConfigDataCharImageInfo must be an array');
if (heroes.length !== 267) throw new Error(`Expected 267 canonical heroes; got ${heroes.length}`);

const NO_VOICE_ACTOR_MARKER = '■■■■';
const CONFIRMED_NO_VOICE_ACTOR_HERO_IDS = new Set([99235, 99236, 99276]);

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

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

const heroInfoById = groupByInt(heroInfo, 'ID');
const charImageById = groupByInt(charImageInfo, 'ID');
const charImageFieldNames = [...new Set(charImageInfo.slice(0, 5000).flatMap(r => r && typeof r === 'object' ? Object.keys(r) : []))].sort();

const missingHeroInfoIds = [];
const duplicateHeroInfoIds = [];
const invalidCharImagePointerHeroIds = [];
const unresolvedCharImagePointers = [];
const duplicateCharImageIdsUsed = [];
const missingCvHeroIds = [];
const unexpectedNoVoiceActorMarkerHeroIds = [];
const confirmedNoVoiceActorRows = [];
const mapped = [];
const cvNameCounts = new Map();
const charImagePointerOwners = new Map();

for (const hero of heroes) {
  const heroId = Number(hero.heroId);
  const hRows = heroInfoById.get(heroId) || [];
  if (hRows.length === 0) {
    missingHeroInfoIds.push(heroId);
    continue;
  }
  if (hRows.length > 1) duplicateHeroInfoIds.push(heroId);
  const h = hRows[0];
  const charImageId = h.CharImage_ID;
  if (!Number.isInteger(charImageId) || charImageId <= 0) {
    invalidCharImagePointerHeroIds.push(heroId);
    mapped.push({ heroId, nameKr: hero.nameKr || null, nameCn: hero.nameCn || null, nameEn: hero.nameEn || null, charImageId: null, cvNameRaw: null, voiceActorStatus: 'UNRESOLVED' });
    continue;
  }
  const owners = charImagePointerOwners.get(charImageId) || [];
  owners.push(heroId);
  charImagePointerOwners.set(charImageId, owners);

  const cRows = charImageById.get(charImageId) || [];
  if (cRows.length === 0) {
    unresolvedCharImagePointers.push({ heroId, charImageId });
    mapped.push({ heroId, nameKr: hero.nameKr || null, nameCn: hero.nameCn || null, nameEn: hero.nameEn || null, charImageId, cvNameRaw: null, voiceActorStatus: 'UNRESOLVED' });
    continue;
  }
  if (cRows.length > 1) duplicateCharImageIdsUsed.push({ heroId, charImageId, rowCount: cRows.length });
  const c = cRows[0];
  const cvName = cleanString(c.CVName);
  if (!cvName) missingCvHeroIds.push(heroId);

  const isNoVoiceActorMarker = cvName === NO_VOICE_ACTOR_MARKER;
  const confirmedNoVoiceActor = isNoVoiceActorMarker && CONFIRMED_NO_VOICE_ACTOR_HERO_IDS.has(heroId);
  if (isNoVoiceActorMarker && !confirmedNoVoiceActor) unexpectedNoVoiceActorMarkerHeroIds.push(heroId);
  if (confirmedNoVoiceActor) {
    confirmedNoVoiceActorRows.push({
      heroId,
      nameKr: hero.nameKr || null,
      nameCn: hero.nameCn || null,
      nameEn: hero.nameEn || null,
      charImageId,
      sourceValue: cvName,
    });
  }

  if (cvName) cvNameCounts.set(cvName, (cvNameCounts.get(cvName) || 0) + 1);
  mapped.push({
    heroId,
    nameKr: hero.nameKr || null,
    nameCn: hero.nameCn || null,
    nameEn: hero.nameEn || null,
    charImageId,
    cvNameRaw: cvName || null,
    voiceActorStatus: confirmedNoVoiceActor ? 'NONE_CONFIRMED' : (cvName ? 'PRESENT' : 'UNRESOLVED'),
  });
}

const sharedCharImagePointers = [...charImagePointerOwners.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([charImageId, heroIds]) => ({ charImageId, heroIds: [...heroIds].sort((a,b) => a-b) }))
  .sort((a,b) => a.charImageId-b.charImageId);

const cvNameDistribution = [...cvNameCounts.entries()]
  .map(([cvNameRaw, heroCount]) => ({ cvNameRaw, heroCount }))
  .sort((a,b) => b.heroCount-a.heroCount || a.cvNameRaw.localeCompare(b.cvNameRaw));

const structuralErrors = [];
if (missingHeroInfoIds.length) structuralErrors.push('canonical heroes missing ConfigDataHeroInfo row');
if (duplicateHeroInfoIds.length) structuralErrors.push('canonical hero IDs duplicated in ConfigDataHeroInfo');
if (invalidCharImagePointerHeroIds.length) structuralErrors.push('canonical HeroInfo has missing/invalid CharImage_ID');
if (unresolvedCharImagePointers.length) structuralErrors.push('HeroInfo.CharImage_ID does not resolve to ConfigDataCharImageInfo.ID');
if (duplicateCharImageIdsUsed.length) structuralErrors.push('used ConfigDataCharImageInfo.ID is duplicated');
if (unexpectedNoVoiceActorMarkerHeroIds.length) structuralErrors.push('unexpected Hero CVName uses the no-voice-actor marker');

const heroesWithNamedVoiceActor = mapped.filter(r => r.voiceActorStatus === 'PRESENT').length;
const heroesWithoutVoiceActor = mapped.filter(r => r.voiceActorStatus === 'NONE_CONFIRMED').length;

const result = {
  version: 1,
  status: structuralErrors.length === 0 ? (missingCvHeroIds.length === 0 ? 'PASS' : 'PASS_WITH_MISSING_CV') : 'FAIL',
  semantics: {
    acceptedJoin: 'ConfigDataHeroInfo.CharImage_ID -> ConfigDataCharImageInfo.ID',
    cvField: 'ConfigDataCharImageInfo.CVName',
    cvFieldType: 'string',
    cvMeaning: 'voice actor display name stored by ConfigDataCharImageInfo',
    normalization: 'trim whitespace only; preserve source spelling',
    noVoiceActorRule: `For canonical Hero IDs 99235, 99236 and 99276, source value ${NO_VOICE_ACTOR_MARKER} is confirmed to mean no voice actor and must not be treated as unresolved or masked actor data.`,
    localizationRule: 'Preserve source CVName spelling in this artifact. Korean voice-actor display-name localization is a separate later task and must not change the source join semantics.',
  },
  sourceCounts: {
    canonicalHeroCount: heroes.length,
    heroInfoRows: heroInfo.length,
    charImageInfoRows: charImageInfo.length,
    charImageFieldNames,
  },
  coverage: {
    mappedHeroCount: mapped.length,
    heroesWithCvFieldValue: mapped.filter(r => r.cvNameRaw).length,
    heroesWithNamedVoiceActor,
    heroesWithoutVoiceActor,
    confirmedNoVoiceActorHeroIds: confirmedNoVoiceActorRows.map(r => r.heroId).sort((a,b)=>a-b),
    confirmedNoVoiceActorRows,
    heroesWithoutCvFieldValue: missingCvHeroIds.length,
    missingCvHeroIds: [...missingCvHeroIds].sort((a,b)=>a-b),
    unexpectedNoVoiceActorMarkerHeroIds: [...unexpectedNoVoiceActorMarkerHeroIds].sort((a,b)=>a-b),
    missingHeroInfoIds: [...missingHeroInfoIds].sort((a,b)=>a-b),
    duplicateHeroInfoIds: [...duplicateHeroInfoIds].sort((a,b)=>a-b),
    invalidCharImagePointerHeroIds: [...invalidCharImagePointerHeroIds].sort((a,b)=>a-b),
    unresolvedCharImagePointers,
    duplicateCharImageIdsUsed,
    sharedCharImagePointers,
    distinctCvFieldValueCount: cvNameCounts.size,
  },
  cvNameDistribution,
  heroes: mapped,
  structuralErrors,
};

fs.mkdirSync(validationDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  status: result.status,
  canonicalHeroCount: heroes.length,
  mappedHeroCount: result.coverage.mappedHeroCount,
  heroesWithNamedVoiceActor: result.coverage.heroesWithNamedVoiceActor,
  heroesWithoutVoiceActor: result.coverage.heroesWithoutVoiceActor,
  confirmedNoVoiceActorHeroIds: result.coverage.confirmedNoVoiceActorHeroIds,
  heroesWithoutCvFieldValue: result.coverage.heroesWithoutCvFieldValue,
  distinctCvFieldValueCount: result.coverage.distinctCvFieldValueCount,
  unresolvedCharImagePointers: result.coverage.unresolvedCharImagePointers.length,
  duplicateCharImageIdsUsed: result.coverage.duplicateCharImageIdsUsed.length,
  sharedCharImagePointers: result.coverage.sharedCharImagePointers.length,
  output: path.relative(rootDir, outPath),
}, null, 2));
if (structuralErrors.length) process.exitCode = 1;
