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
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a parsed JSON array`);
  }
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

function sortedNumbers(values) {
  return [...values].sort((a, b) => a - b);
}

function countByInteger(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = row?.[field];
    if (!Number.isInteger(value)) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0] - b[0]));
}

function validPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validIntegerArray(value) {
  return Array.isArray(value) && value.every(Number.isInteger);
}

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
  if (heroes.length !== 267) {
    throw new Error(`canonical Hero master count=${heroes.length}; expected 267`);
  }

  const canonicalIds = heroes.map((hero) => hero.heroId);
  if (canonicalIds.some((id) => !Number.isInteger(id))) {
    throw new Error('canonical Hero master contains non-integer heroId');
  }
  if (new Set(canonicalIds).size !== canonicalIds.length) {
    throw new Error('canonical Hero master contains duplicate heroId values');
  }

  const heroInfoById = groupByIntegerId(heroInfo, 'ID');
  const skinById = groupByIntegerId(heroSkinInfo, 'ID');

  const missingHeroInfoIds = [];
  const duplicateHeroInfoIds = [];
  const canonicalHeroInfoRows = [];
  const useableMismatchHeroIds = [];

  for (const hero of heroes) {
    const matches = heroInfoById.get(hero.heroId) || [];
    if (matches.length === 0) {
      missingHeroInfoIds.push(hero.heroId);
      continue;
    }
    if (matches.length > 1) duplicateHeroInfoIds.push(hero.heroId);
    const row = matches[0];
    canonicalHeroInfoRows.push(row);
    if (row.Useable !== true) useableMismatchHeroIds.push(hero.heroId);
  }

  const originMissingHeroIds = [];
  const originInvalidHeroIds = [];
  const artworkMissingHeroIds = [];
  const skinListInvalidHeroIds = [];
  const skinListInvalidDetails = [];
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

  for (const [skinId, rows] of skinById.entries()) {
    if (rows.length > 1) duplicateSkinRecordIds.push(skinId);
  }

  for (const row of canonicalHeroInfoRows) {
    const heroId = row.ID;

    if (!Array.isArray(row.HeroBelongProduction) || row.HeroBelongProduction.length === 0) {
      originMissingHeroIds.push(heroId);
    } else if (!row.HeroBelongProduction.every(validPositiveInteger)) {
      originInvalidHeroIds.push(heroId);
    } else {
      originPointerValues += row.HeroBelongProduction.length;
    }

    if (!validPositiveInteger(row.CharImage_ID)) {
      artworkMissingHeroIds.push(heroId);
    } else {
      artworkPointerHeroes += 1;
    }

    if (!validIntegerArray(row.Skins_ID)) {
      skinListInvalidHeroIds.push(heroId);
      skinListInvalidDetails.push({ heroId, ...describeInvalidArrayValue(row.Skins_ID) });
      continue;
    }
    if (row.Skins_ID.length === 0) skinNoRefsHeroIds.push(heroId);

    for (const skinId of row.Skins_ID) {
      totalSkinRefs += 1;
      const owners = referencedSkinOwners.get(skinId) || new Set();
      owners.add(heroId);
      referencedSkinOwners.set(skinId, owners);

      const skinRows = skinById.get(skinId) || [];
      if (skinRows.length === 0) {
        unresolvedSkinRefs.push({ heroId, skinId });
        continue;
      }

      resolvedSkinRefs += 1;
      const skin = skinRows[0];
      if (Number.isInteger(skin.SpecifiedHero) && skin.SpecifiedHero !== heroId) {
        specifiedHeroMismatches.push({ heroId, skinId, specifiedHero: skin.SpecifiedHero });
      }
      if (!Number.isInteger(skin.GetPathType)) skinGetPathTypeMissingIds.add(skinId);
      if (!validPositiveInteger(skin.CharImageSkinResource_ID)) {
        skinImagePointerMissingIds.add(skinId);
      }
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

  const result = {
    version: 1,
    stage: 'hero-page-5-5',
    substage: '5-5-2',
    checkpoint: 'coverage',
    status: hardErrors.length === 0 && coverageIssues.length === 0 ? 'REVIEW' : 'REVIEW_WITH_ISSUES',
    completion: 'COVERAGE_MEASURED_SEMANTICS_PENDING',
    sourceTraceStatus: sourceTrace.status,
    canonicalHeroCount: heroes.length,
    sourceCounts: {
      heroInfoRows: heroInfo.length,
      heroSkinInfoRows: heroSkinInfo.length,
      canonicalHeroInfoRows: canonicalHeroInfoRows.length,
    },
    heroInfoIdentityCoverage: {
      resolved: canonicalHeroInfoRows.length,
      missingHeroIds: sortedNumbers(missingHeroInfoIds),
      duplicateHeroIds: sortedNumbers(duplicateHeroInfoIds),
      useableMismatchHeroIds: sortedNumbers(useableMismatchHeroIds),
    },
    fields: {
      rarity: {
        status: 'UNRESOLVED',
        observedOnly: {
          starDistribution: countByInteger(canonicalHeroInfoRows, 'Star'),
          rankDistribution: countByInteger(canonicalHeroInfoRows, 'Rank'),
        },
        rule: 'Observed Star/Rank distributions are not rarity labels.',
      },
      factions: {
        status: 'UNRESOLVED',
        acceptedSource: null,
      },
      cv: {
        status: 'UNRESOLVED',
        acceptedSource: null,
      },
      origin: {
        status: 'POINTER_CONFIRMED',
        source: 'ConfigDataHeroInfo.HeroBelongProduction',
        heroesWithNonEmptyValidPointers:
          canonicalHeroInfoRows.length - originMissingHeroIds.length - originInvalidHeroIds.length,
        pointerValueCount: originPointerValues,
        missingHeroIds: sortedNumbers(originMissingHeroIds),
        invalidHeroIds: sortedNumbers(originInvalidHeroIds),
        displayDictionaryStatus: 'UNRESOLVED',
      },
      artwork: {
        status: 'POINTER_CONFIRMED',
        source: 'ConfigDataHeroInfo.CharImage_ID',
        heroesWithValidPointer: artworkPointerHeroes,
        missingOrInvalidHeroIds: sortedNumbers(artworkMissingHeroIds),
        displaySemantics: 'UNRESOLVED',
      },
      skins: {
        status: 'SOURCE_JOIN_CONFIRMED',
        join: 'ConfigDataHeroInfo.Skins_ID[] -> ConfigDataHeroSkinInfo.ID',
        heroesWithValidSkinList: canonicalHeroInfoRows.length - skinListInvalidHeroIds.length,
        heroIdsWithInvalidSkinList: sortedNumbers(skinListInvalidHeroIds),
        invalidSkinListDetails: skinListInvalidDetails.sort((a, b) => a.heroId - b.heroId),
        heroesWithNoSkinRefs: skinNoRefsHeroIds.length,
        heroIdsWithNoSkinRefs: sortedNumbers(skinNoRefsHeroIds),
        totalSkinRefs,
        resolvedSkinRefs,
        unresolvedSkinRefs,
        specifiedHeroMismatches,
        sharedSkinRefs,
        duplicateSkinRecordIds: sortedNumbers(duplicateSkinRecordIds),
        getPathTypeMissingSkinIds: sortedNumbers(skinGetPathTypeMissingIds),
        charImageSkinResourceMissingSkinIds: sortedNumbers(skinImagePointerMissingIds),
        orderingSemantics: 'UNRESOLVED',
        acquisitionSemantics: 'UNRESOLVED',
      },
    },
    hardErrors,
    coverageIssues,
    unresolvedSemanticFields: ['rarity', 'factions', 'cv', 'origin.displayDictionary', 'artwork.displaySemantics', 'skins.orderingSemantics', 'skins.acquisitionSemantics'],
    readyForDisplayEnrichment: false,
    nextAction: 'Resolve authoritative mappings for the unresolved semantic fields; do not synthesize display values from the measured candidates.',
  };

  fs.writeFileSync(PATHS.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log('Hero Stage 5-5-2 coverage');
  console.log(`Canonical Heroes: ${heroes.length}`);
  console.log(`HeroInfo resolved: ${canonicalHeroInfoRows.length}/${heroes.length}`);
  console.log(`Origin pointers: ${result.fields.origin.heroesWithNonEmptyValidPointers}/${canonicalHeroInfoRows.length}`);
  console.log(`Artwork pointers: ${artworkPointerHeroes}/${canonicalHeroInfoRows.length}`);
  console.log(`Skin refs resolved: ${resolvedSkinRefs}/${totalSkinRefs}`);
  console.log(`Invalid skin lists: ${skinListInvalidHeroIds.length}`);
  console.log(`Skin owner mismatches: ${specifiedHeroMismatches.length}`);
  console.log(`Coverage artifact: ${path.relative(rootDir, PATHS.output)}`);
  console.log(`Status: ${result.status}`);

  if (hardErrors.length) process.exitCode = 1;
}

main();
