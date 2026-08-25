const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const configDir = path.join(dataDir, 'configdata');
const validationDir = path.join(dataDir, 'validation');

const PATHS = {
  master: path.join(dataDir, 'hero-name-master.v1.json'),
  heroInfo: path.join(configDir, 'ConfigDataHeroInfo.json'),
  heroSkinInfo: path.join(configDir, 'ConfigDataHeroSkinInfo.json'),
  sourceTrace: path.join(validationDir, 'hero-page-stage5-5-2-source-trace.v1.json'),
  output: path.join(validationDir, 'hero-page-stage5-5-2-coverage.v1.json'),
};

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be a parsed JSON array`);
  return value;
}

function groupByIntegerId(rows, field) {
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !Number.isInteger(row[field])) continue;
    const list = map.get(row[field]) || [];
    list.push(row);
    map.set(row[field], list);
  }
  return map;
}

function sortedNumbers(values) { return [...values].sort((a, b) => a - b); }

function countByInteger(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = row?.[field];
    if (!Number.isInteger(value)) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0] - b[0]));
}

function validPositiveInteger(value) { return Number.isInteger(value) && value > 0; }
function validIntegerArray(value) { return Array.isArray(value) && value.every(Number.isInteger); }

function describeInvalidArrayValue(value) {
  if (value === undefined) return { valueType: 'undefined', value: null };
  if (value === null) return { valueType: 'null', value: null };
  if (Array.isArray(value)) return { valueType: 'array', value };
  return { valueType: typeof value, value };
}

function main() {
  const master = loadJson(PATHS.master);
  const sourceTrace = loadJson(PATHS.sourceTrace);
  const heroInfo = requireArray(loadJson(PATHS.heroInfo), 'ConfigDataHeroInfo');
  const heroSkinInfo = requireArray(loadJson(PATHS.heroSkinInfo), 'ConfigDataHeroSkinInfo');

  const heroes = Array.isArray(master.records) ? master.records : [];
  if (heroes.length !== 267) throw new Error(`canonical Hero master count=${heroes.length}; expected 267`);

  const canonicalIds = heroes.map((hero) => hero.heroId);
  if (canonicalIds.some((id) => !Number.isInteger(id))) throw new Error('canonical Hero master contains non-integer heroId');
  if (new Set(canonicalIds).size !== canonicalIds.length) throw new Error('canonical Hero master contains duplicate heroId values');

  const heroInfoById = groupByIntegerId(heroInfo, 'ID');
  const skinById = groupByIntegerId(heroSkinInfo, 'ID');
  const skinIdsBySpecifiedHero = new Map();
  for (const skin of heroSkinInfo) {
    if (!Number.isInteger(skin?.SpecifiedHero) || !Number.isInteger(skin?.ID)) continue;
    const ids = skinIdsBySpecifiedHero.get(skin.SpecifiedHero) || [];
    ids.push(skin.ID);
    skinIdsBySpecifiedHero.set(skin.SpecifiedHero, ids);
  }

  const missingHeroInfoIds = [];
  const duplicateHeroInfoIds = [];
  const canonicalHeroInfoRows = [];
  const useableMismatchHeroIds = [];

  for (const hero of heroes) {
    const matches = heroInfoById.get(hero.heroId) || [];
    if (matches.length === 0) { missingHeroInfoIds.push(hero.heroId); continue; }
    if (matches.length > 1) duplicateHeroInfoIds.push(hero.heroId);
    const row = matches[0];
    canonicalHeroInfoRows.push(row);
    if (row.Useable !== true) useableMismatchHeroIds.push(hero.heroId);
  }

  const originMissingHeroIds = [];
  const originInvalidHeroIds = [];
  const originIds = new Set();
  const artworkMissingHeroIds = [];
  const skinListInvalidHeroIds = [];
  const skinListInvalidDetails = [];
  const skinListNormalizedEmptyHeroIds = [];
  const skinNoRefsHeroIds = [];
  const unresolvedSkinRefs = [];
  const specifiedHeroMismatches = [];
  const duplicateSkinRecordIds = [];
  const skinGetPathTypeMissingIds = new Set();
  const skinImagePointerMissingIds = new Set();
  const referencedSkinOwners = new Map();

  let originPointerValues = 0;
  let artworkPointerHeroes = 0;
  let totalSkinRefs = 0;
  let resolvedSkinRefs = 0;

  for (const [skinId, rows] of skinById.entries()) if (rows.length > 1) duplicateSkinRecordIds.push(skinId);

  for (const row of canonicalHeroInfoRows) {
    const heroId = row.ID;

    if (!Array.isArray(row.HeroBelongProduction) || row.HeroBelongProduction.length === 0) {
      originMissingHeroIds.push(heroId);
    } else if (row.HeroBelongProduction.length !== 1 || !row.HeroBelongProduction.every(validPositiveInteger)) {
      originInvalidHeroIds.push(heroId);
    } else {
      originPointerValues += 1;
      originIds.add(row.HeroBelongProduction[0]);
    }

    if (!validPositiveInteger(row.CharImage_ID)) artworkMissingHeroIds.push(heroId);
    else artworkPointerHeroes += 1;

    let skinIds = row.Skins_ID;
    if (skinIds === undefined) {
      const reverseOwnedSkinIds = sortedNumbers(skinIdsBySpecifiedHero.get(heroId) || []);
      if (reverseOwnedSkinIds.length === 0) {
        skinListNormalizedEmptyHeroIds.push(heroId);
        skinIds = [];
      } else {
        skinListInvalidHeroIds.push(heroId);
        skinListInvalidDetails.push({ heroId, ...describeInvalidArrayValue(skinIds), reason: 'OMITTED_SKINS_ID_WITH_REVERSE_OWNER_ROWS', reverseOwnedSkinIds });
        continue;
      }
    } else if (!validIntegerArray(skinIds)) {
      skinListInvalidHeroIds.push(heroId);
      skinListInvalidDetails.push({ heroId, ...describeInvalidArrayValue(skinIds), reason: 'SKINS_ID_IS_NOT_AN_INTEGER_ARRAY' });
      continue;
    }

    if (skinIds.length === 0) skinNoRefsHeroIds.push(heroId);

    for (const skinId of skinIds) {
      totalSkinRefs += 1;
      const owners = referencedSkinOwners.get(skinId) || new Set();
      owners.add(heroId);
      referencedSkinOwners.set(skinId, owners);
      const skinRows = skinById.get(skinId) || [];
      if (skinRows.length === 0) { unresolvedSkinRefs.push({ heroId, skinId }); continue; }
      resolvedSkinRefs += 1;
      const skin = skinRows[0];
      if (Number.isInteger(skin.SpecifiedHero) && skin.SpecifiedHero !== heroId) specifiedHeroMismatches.push({ heroId, skinId, specifiedHero: skin.SpecifiedHero });
      if (!Number.isInteger(skin.GetPathType)) skinGetPathTypeMissingIds.add(skinId);
      if (!validPositiveInteger(skin.CharImageSkinResource_ID)) skinImagePointerMissingIds.add(skinId);
    }
  }

  const sharedSkinRefs = [...referencedSkinOwners.entries()]
    .filter(([, owners]) => owners.size > 1)
    .map(([skinId, owners]) => ({ skinId, heroIds: sortedNumbers(owners) }))
    .sort((a, b) => a.skinId - b.skinId);

  const hardErrors = [];
  if (missingHeroInfoIds.length) hardErrors.push('canonical Hero IDs missing from ConfigDataHeroInfo');
  if (duplicateHeroInfoIds.length) hardErrors.push('canonical Hero IDs duplicated in ConfigDataHeroInfo');
  if (skinListInvalidHeroIds.length) hardErrors.push('canonical Hero rows contain invalid Skins_ID values');
  if (duplicateSkinRecordIds.length) hardErrors.push('ConfigDataHeroSkinInfo contains duplicate ID values');

  const coverageIssues = [];
  if (originMissingHeroIds.length || originInvalidHeroIds.length) coverageIssues.push('origin pointer coverage is incomplete');
  if (artworkMissingHeroIds.length) coverageIssues.push('artwork pointer coverage is incomplete');
  if (unresolvedSkinRefs.length) coverageIssues.push('some HeroInfo.Skins_ID references do not resolve');
  if (specifiedHeroMismatches.length) coverageIssues.push('some resolved skin rows disagree with SpecifiedHero');

  const rarityTrace = sourceTrace?.fields?.rarity || {};
  const factionsTrace = sourceTrace?.fields?.factions || {};
  const cvTrace = sourceTrace?.fields?.cv || {};
  const originTrace = sourceTrace?.fields?.origin || {};

  const unresolvedSemanticFields = [];
  if (!String(rarityTrace.status || '').includes('CONFIRMED')) unresolvedSemanticFields.push('rarity');
  if (!String(factionsTrace.status || '').includes('CONFIRMED')) unresolvedSemanticFields.push('factions');
  if (!String(cvTrace.status || '').includes('CONFIRMED')) unresolvedSemanticFields.push('cv');
  if (!String(originTrace.status || '').includes('CONFIRMED')) unresolvedSemanticFields.push('origin.displayDictionary');
  unresolvedSemanticFields.push('artwork.displaySemantics', 'skins.orderingSemantics', 'skins.acquisitionSemantics');

  const result = {
    version: 1,
    stage: 'hero-page-5-5',
    substage: '5-5-2',
    checkpoint: 'coverage',
    status: hardErrors.length === 0 && coverageIssues.length === 0 ? 'REVIEW' : 'REVIEW_WITH_ISSUES',
    completion: 'COVERAGE_MEASURED_SEMANTICS_PARTIAL',
    sourceTraceStatus: sourceTrace.status,
    canonicalHeroCount: heroes.length,
    sourceCounts: { heroInfoRows: heroInfo.length, heroSkinInfoRows: heroSkinInfo.length, canonicalHeroInfoRows: canonicalHeroInfoRows.length },
    heroInfoIdentityCoverage: {
      resolved: canonicalHeroInfoRows.length,
      missingHeroIds: sortedNumbers(missingHeroInfoIds),
      duplicateHeroIds: sortedNumbers(duplicateHeroInfoIds),
      useableMismatchHeroIds: sortedNumbers(useableMismatchHeroIds),
    },
    fields: {
      rarity: {
        status: rarityTrace.status || 'UNRESOLVED', acceptedSource: rarityTrace.source || null,
        rankToRarity: rarityTrace.rankToRarity || null, rankDistribution: countByInteger(canonicalHeroInfoRows, 'Rank'),
        starDistribution: countByInteger(canonicalHeroInfoRows, 'Star'), validation: rarityTrace.validation || null, rule: rarityTrace.rule || null,
      },
      factions: { status: factionsTrace.status || 'UNRESOLVED', acceptedSource: factionsTrace.source || null, validation: factionsTrace.validation || null },
      cv: { status: cvTrace.status || 'UNRESOLVED', acceptedSource: cvTrace.source || null, join: cvTrace.join || null, validation: cvTrace.validation || null },
      origin: {
        status: originTrace.status || 'POINTER_CONFIRMED',
        source: 'ConfigDataHeroInfo.HeroBelongProduction',
        heroesWithNonEmptyValidPointers: canonicalHeroInfoRows.length - originMissingHeroIds.length - originInvalidHeroIds.length,
        pointerValueCount: originPointerValues,
        distinctProductionIdCount: originIds.size,
        observedProductionIds: sortedNumbers(originIds),
        missingHeroIds: sortedNumbers(originMissingHeroIds),
        invalidHeroIds: sortedNumbers(originInvalidHeroIds),
        displayDictionaryStatus: String(originTrace.status || '').includes('DICTIONARY_CONFIRMED') ? 'SOURCE_CONFIRMED' : 'UNRESOLVED',
        validation: originTrace.dictionary || null,
        rule: originTrace.rule || null,
      },
      artwork: {
        status: 'POINTER_CONFIRMED', source: 'ConfigDataHeroInfo.CharImage_ID', heroesWithValidPointer: artworkPointerHeroes,
        missingOrInvalidHeroIds: sortedNumbers(artworkMissingHeroIds), displaySemantics: 'UNRESOLVED',
      },
      skins: {
        status: 'SOURCE_JOIN_CONFIRMED', join: 'ConfigDataHeroInfo.Skins_ID[] -> ConfigDataHeroSkinInfo.ID',
        normalizationRule: 'An omitted Skins_ID is normalized to [] only when ConfigDataHeroSkinInfo has no row with SpecifiedHero equal to that canonical Hero ID; omitted lists with reverse owner rows remain a hard error.',
        heroesWithValidSkinList: canonicalHeroInfoRows.length - skinListInvalidHeroIds.length,
        heroesWithExplicitValidSkinList: canonicalHeroInfoRows.length - skinListInvalidHeroIds.length - skinListNormalizedEmptyHeroIds.length,
        heroesWithNormalizedEmptySkinList: skinListNormalizedEmptyHeroIds.length,
        heroIdsWithNormalizedEmptySkinList: sortedNumbers(skinListNormalizedEmptyHeroIds),
        heroIdsWithInvalidSkinList: sortedNumbers(skinListInvalidHeroIds), invalidSkinListDetails: skinListInvalidDetails.sort((a, b) => a.heroId - b.heroId),
        heroesWithNoSkinRefs: skinNoRefsHeroIds.length, heroIdsWithNoSkinRefs: sortedNumbers(skinNoRefsHeroIds),
        totalSkinRefs, resolvedSkinRefs, unresolvedSkinRefs, specifiedHeroMismatches, sharedSkinRefs,
        duplicateSkinRecordIds: sortedNumbers(duplicateSkinRecordIds), getPathTypeMissingSkinIds: sortedNumbers(skinGetPathTypeMissingIds),
        charImageSkinResourceMissingSkinIds: sortedNumbers(skinImagePointerMissingIds), orderingSemantics: 'UNRESOLVED', acquisitionSemantics: 'UNRESOLVED',
      },
    },
    hardErrors,
    coverageIssues,
    unresolvedSemanticFields,
    readyForDisplayEnrichment: false,
    nextAction: 'Resolve final artwork display semantics and skin ordering/acquisition semantics without reopening confirmed rarity, faction, CV or origin mappings.',
  };

  fs.writeFileSync(PATHS.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log('Hero Stage 5-5-2 coverage');
  console.log(`Canonical Heroes: ${heroes.length}`);
  console.log(`HeroInfo resolved: ${canonicalHeroInfoRows.length}/${heroes.length}`);
  console.log(`Rarity status: ${result.fields.rarity.status}`);
  console.log(`Faction status: ${result.fields.factions.status}`);
  console.log(`CV status: ${result.fields.cv.status}`);
  console.log(`Origin status: ${result.fields.origin.status}`);
  console.log(`Origin pointers: ${result.fields.origin.heroesWithNonEmptyValidPointers}/${canonicalHeroInfoRows.length}`);
  console.log(`Origin IDs: ${result.fields.origin.distinctProductionIdCount}`);
  console.log(`Artwork pointers: ${artworkPointerHeroes}/${canonicalHeroInfoRows.length}`);
  console.log(`Skin refs resolved: ${resolvedSkinRefs}/${totalSkinRefs}`);
  console.log(`Coverage artifact: ${path.relative(rootDir, PATHS.output)}`);
  console.log(`Status: ${result.status}`);
  if (hardErrors.length) process.exitCode = 1;
}

main();
