const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  relationSet: 'data/generated/hero-soldier-relations.v1.json',
  relationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
  byHero: 'data/generated/hero-soldier-by-hero.v1.json',
  bySoldier: 'data/generated/hero-soldier-by-soldier.v1.json',
  heroPage: 'data/generated/hero-page-soldiers-stage5-3.v1.json',
  heroPageValidation: 'data/validation/hero-page-stage5-3-final.v1.json',
  soldierRecords: 'data/generated/soldier-stage6-1-full-records.v1.json',
  soldierRecordsValidation: 'data/validation/soldier-stage6-1-full-records.v1.json',
  soldierHeroValidation: 'data/validation/soldier-stage5-5-heroes.v1.json',
  stage6_2Validation: 'data/validation/soldier-stage6-2-classification.v1.json',
  stage6_3Validation: 'data/validation/soldier-stage6-3-representative-qa.v1.json',
  stage6_4Validation: 'data/validation/soldier-stage6-4-filter-qa.v1.json',
  output: 'data/generated/hero-soldier-page-links-stage6-5.v1.json',
  validation: 'data/validation/soldier-stage6-5-reciprocal-links.v1.json',
};

function abs(p) { return path.join(rootDir, p); }
function loadJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, value) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n');
}
function gitBlobSha(p) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${p}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function pairKey(heroId, soldierId) { return `${heroId}:${soldierId}`; }
function addPair(set, heroId, soldierId, invalid, duplicates) {
  if (!Number.isInteger(heroId) || !Number.isInteger(soldierId)) {
    invalid.push({ heroId: Number.isInteger(heroId) ? heroId : null, soldierId: Number.isInteger(soldierId) ? soldierId : null });
    return;
  }
  const key = pairKey(heroId, soldierId);
  if (set.has(key)) duplicates.push(key);
  set.add(key);
}
function diff(left, right) {
  const result = [];
  for (const value of left) if (!right.has(value)) result.push(value);
  return result.sort();
}
function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pairsFromRelation(edges) {
  const set = new Set(); const invalid = []; const duplicates = [];
  for (const edge of edges) addPair(set, edge?.heroId, edge?.soldierId, invalid, duplicates);
  return { set, invalid, duplicates };
}
function pairsFromByHero(obj) {
  const set = new Set(); const invalid = []; const duplicates = []; const duplicateValues = [];
  for (const [heroKey, soldierIds] of Object.entries(obj || {})) {
    const heroId = Number(heroKey);
    const seen = new Set();
    for (const soldierId of Array.isArray(soldierIds) ? soldierIds : []) {
      if (seen.has(soldierId)) duplicateValues.push(pairKey(heroId, soldierId));
      seen.add(soldierId);
      addPair(set, heroId, soldierId, invalid, duplicates);
    }
  }
  return { set, invalid, duplicates, duplicateValues };
}
function pairsFromBySoldier(obj) {
  const set = new Set(); const invalid = []; const duplicates = []; const duplicateValues = [];
  for (const [soldierKey, heroIds] of Object.entries(obj || {})) {
    const soldierId = Number(soldierKey);
    const seen = new Set();
    for (const heroId of Array.isArray(heroIds) ? heroIds : []) {
      if (seen.has(heroId)) duplicateValues.push(pairKey(heroId, soldierId));
      seen.add(heroId);
      addPair(set, heroId, soldierId, invalid, duplicates);
    }
  }
  return { set, invalid, duplicates, duplicateValues };
}
function pairsFromSoldierRecords(records) {
  const set = new Set(); const invalid = []; const duplicates = []; const duplicateValues = [];
  for (const record of records) {
    const soldierId = record?.soldierId;
    const heroIds = record?.heroes?.finalHeroIds;
    const seen = new Set();
    if (!Array.isArray(heroIds)) {
      invalid.push({ heroId: null, soldierId: Number.isInteger(soldierId) ? soldierId : null });
      continue;
    }
    for (const heroId of heroIds) {
      if (seen.has(heroId)) duplicateValues.push(pairKey(heroId, soldierId));
      seen.add(heroId);
      addPair(set, heroId, soldierId, invalid, duplicates);
    }
  }
  return { set, invalid, duplicates, duplicateValues };
}

function main() {
  const relationSet = loadJson(paths.relationSet);
  const relationValidation = loadJson(paths.relationValidation);
  const byHero = loadJson(paths.byHero);
  const bySoldier = loadJson(paths.bySoldier);
  const heroPage = loadJson(paths.heroPage);
  const heroPageValidation = loadJson(paths.heroPageValidation);
  const soldierRecords = loadJson(paths.soldierRecords);
  const soldierRecordsValidation = loadJson(paths.soldierRecordsValidation);
  const soldierHeroValidation = loadJson(paths.soldierHeroValidation);
  const stage6_2Validation = loadJson(paths.stage6_2Validation);
  const stage6_3Validation = loadJson(paths.stage6_3Validation);
  const stage6_4Validation = loadJson(paths.stage6_4Validation);

  const errors = [];
  const reviews = [];
  const upstream = [
    ['relationValidation', relationValidation.status === 'PASS'],
    ['heroPageValidation', ['PASS', 'PASS_WITH_REVIEW'].includes(heroPageValidation.status) && heroPageValidation.completion === 'COMPLETE'],
    ['soldierRecords', soldierRecords.status === 'PASS'],
    ['soldierRecordsValidation', soldierRecordsValidation.status === 'PASS'],
    ['soldierHeroValidation', soldierHeroValidation.status === 'PASS'],
    ['stage6_2Validation', stage6_2Validation.status === 'PASS'],
    ['stage6_3Validation', stage6_3Validation.status === 'PASS'],
    ['stage6_4Validation', stage6_4Validation.status === 'PASS'],
  ];
  const upstreamNonPass = upstream.filter(([, ok]) => !ok).map(([name]) => name);
  if (upstreamNonPass.length) errors.push(`Upstream non-PASS gates: ${upstreamNonPass.join(', ')}`);

  const relationBlobSha = gitBlobSha(paths.relationSet);
  const snapshotRefs = {
    relationValidation: relationValidation?.relationSet?.gitBlobSha ?? null,
    byHero: byHero?.relationSet?.gitBlobSha ?? null,
    bySoldier: bySoldier?.relationSet?.gitBlobSha ?? null,
    heroPage: heroPage?.sources?.byHero?.relationSetGitBlobSha ?? null,
  };
  const snapshotMismatches = Object.entries(snapshotRefs)
    .filter(([, sha]) => sha !== relationBlobSha)
    .map(([name, sha]) => ({ name, expected: relationBlobSha, actual: sha }));
  if (snapshotMismatches.length) errors.push(`${snapshotMismatches.length} relation snapshot references differ from the canonical relation blob`);

  const canonical = pairsFromRelation(Array.isArray(relationSet.edges) ? relationSet.edges : []);
  const heroIndex = pairsFromByHero(byHero.byHeroId);
  const soldierIndex = pairsFromBySoldier(bySoldier.bySoldierId);
  const heroPagePairs = pairsFromByHero(heroPage.byHeroId);
  const soldierPagePairs = pairsFromSoldierRecords(Array.isArray(soldierRecords.records) ? soldierRecords.records : []);

  const compare = (left, right) => ({ missing: diff(right, left), extra: diff(left, right) });
  const byHeroVsCanonical = compare(heroIndex.set, canonical.set);
  const bySoldierVsCanonical = compare(soldierIndex.set, canonical.set);
  const heroPageVsCanonical = compare(heroPagePairs.set, canonical.set);
  const soldierPageVsCanonical = compare(soldierPagePairs.set, canonical.set);
  const pageReciprocity = compare(heroPagePairs.set, soldierPagePairs.set);

  const relationPairMismatch = byHeroVsCanonical.missing.length + byHeroVsCanonical.extra.length
    + bySoldierVsCanonical.missing.length + bySoldierVsCanonical.extra.length;
  const pagePairMismatch = heroPageVsCanonical.missing.length + heroPageVsCanonical.extra.length
    + soldierPageVsCanonical.missing.length + soldierPageVsCanonical.extra.length;
  const reciprocalPagePairMismatch = pageReciprocity.missing.length + pageReciprocity.extra.length;

  if (canonical.invalid.length || canonical.duplicates.length) errors.push('Canonical relation set contains malformed or duplicate Hero-Soldier pairs');
  if (heroIndex.invalid.length || heroIndex.duplicates.length || heroIndex.duplicateValues.length) errors.push('byHero index contains malformed or duplicate membership');
  if (soldierIndex.invalid.length || soldierIndex.duplicates.length || soldierIndex.duplicateValues.length) errors.push('bySoldier index contains malformed or duplicate membership');
  if (heroPagePairs.invalid.length || heroPagePairs.duplicates.length || heroPagePairs.duplicateValues.length) errors.push('Hero page projection contains malformed or duplicate membership');
  if (soldierPagePairs.invalid.length || soldierPagePairs.duplicates.length || soldierPagePairs.duplicateValues.length) errors.push('Soldier page projection contains malformed or duplicate membership');
  if (relationPairMismatch) errors.push(`${relationPairMismatch} shared-index pairs differ from canonical relation edges`);
  if (pagePairMismatch) errors.push(`${pagePairMismatch} page-projection pairs differ from canonical relation edges`);
  if (reciprocalPagePairMismatch) errors.push(`${reciprocalPagePairMismatch} Hero-page and Soldier-page reciprocal pairs differ`);

  const heroKeys = Object.keys(byHero.byHeroId || {}).map(Number).sort((a,b)=>a-b);
  const heroPageKeys = Object.keys(heroPage.byHeroId || {}).map(Number).sort((a,b)=>a-b);
  const soldierKeys = Object.keys(bySoldier.bySoldierId || {}).map(Number).sort((a,b)=>a-b);
  const soldierPageKeys = (Array.isArray(soldierRecords.records) ? soldierRecords.records : []).map(r => r.soldierId).sort((a,b)=>a-b);
  const heroKeyCoverageMismatch = sameArray(heroKeys, heroPageKeys) ? 0 : 1;
  const soldierKeyCoverageMismatch = sameArray(soldierKeys, soldierPageKeys) ? 0 : 1;
  if (heroKeyCoverageMismatch) errors.push('Hero page key coverage differs from shared byHero index');
  if (soldierKeyCoverageMismatch) errors.push('Soldier page key coverage differs from shared bySoldier index');

  const relationValidationMismatch = [
    'byHeroRelationCountMismatch', 'bySoldierRelationCountMismatch', 'byHeroPairMismatch',
    'bySoldierPairMismatch', 'crossIndexPairMismatch', 'duplicateByHeroValues', 'duplicateBySoldierValues'
  ].reduce((sum, key) => sum + (Number(relationValidation?.checks?.[key]) || 0), 0);
  if (relationValidationMismatch) errors.push(`Shared relation validation already reports ${relationValidationMismatch} reciprocal/index errors`);

  if (heroPageValidation?.review?.blocking === false && heroPageValidation?.review?.pendingKoreanNameSoldierCount) {
    reviews.push({
      code: 'HERO_PAGE_SOLDIER_DISPLAY_NAME_REVIEW',
      count: heroPageValidation.review.pendingKoreanNameSoldierCount,
      classification: 'REVIEW',
      rule: 'Presentation-name review is non-blocking and must not change Hero-Soldier membership or navigation identity.'
    });
  }
  reviews.push({
    code: 'ROUTE_IMPLEMENTATION_SEPARATE_FROM_MEMBERSHIP',
    count: null,
    classification: 'REVIEW',
    rule: 'Stage 6-5 freezes canonical reciprocal membership and target identity. Concrete UI route components may consume these IDs but must not recalculate membership.'
  });

  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = relationSet.generatedAt ?? soldierRecords.generatedAt ?? null;
  const sources = {
    relationSet: { path: paths.relationSet, gitBlobSha: relationBlobSha },
    relationValidation: { path: paths.relationValidation, gitBlobSha: gitBlobSha(paths.relationValidation) },
    byHero: { path: paths.byHero, gitBlobSha: gitBlobSha(paths.byHero) },
    bySoldier: { path: paths.bySoldier, gitBlobSha: gitBlobSha(paths.bySoldier) },
    heroPage: { path: paths.heroPage, gitBlobSha: gitBlobSha(paths.heroPage) },
    heroPageValidation: { path: paths.heroPageValidation, gitBlobSha: gitBlobSha(paths.heroPageValidation) },
    soldierRecords: { path: paths.soldierRecords, gitBlobSha: gitBlobSha(paths.soldierRecords) },
    soldierRecordsValidation: { path: paths.soldierRecordsValidation, gitBlobSha: gitBlobSha(paths.soldierRecordsValidation) },
    soldierHeroValidation: { path: paths.soldierHeroValidation, gitBlobSha: gitBlobSha(paths.soldierHeroValidation) },
    stage6_2Validation: { path: paths.stage6_2Validation, gitBlobSha: gitBlobSha(paths.stage6_2Validation) },
    stage6_3Validation: { path: paths.stage6_3Validation, gitBlobSha: gitBlobSha(paths.stage6_3Validation) },
    stage6_4Validation: { path: paths.stage6_4Validation, gitBlobSha: gitBlobSha(paths.stage6_4Validation) },
  };

  const output = {
    version: 1,
    schemaId: 'hero-soldier-page-links/v1',
    stage: '6-5',
    status,
    generatedAt,
    purpose: 'Freeze reciprocal Hero-detail <-> Soldier-detail membership authority for site integration without duplicating or re-inferring Hero-Soldier relations.',
    authority: {
      canonicalRelationSet: paths.relationSet,
      canonicalRelationBlobSha: relationBlobSha,
      heroToSoldierIndex: paths.byHero,
      soldierToHeroIndex: paths.bySoldier,
      rule: 'Both page directions must consume indexes derived from the same canonical relation-set snapshot; page code must not infer membership independently.'
    },
    consumers: {
      heroPage: {
        path: paths.heroPage,
        key: 'heroId',
        targetIdentity: 'soldierId',
        targetRoutingMetadata: 'Soldier identity.siteId when a concrete Soldier route is rendered'
      },
      soldierPage: {
        path: paths.soldierRecords,
        key: 'soldierId',
        targetIdentity: 'heroId',
        targetRoutingMetadata: 'Use the canonical Hero-page routing layer; do not derive Hero identity from names'
      }
    },
    summary: {
      heroKeys: heroKeys.length,
      soldierKeys: soldierKeys.length,
      canonicalRelationCount: canonical.set.size,
      heroPageRelationCount: heroPagePairs.set.size,
      soldierPageRelationCount: soldierPagePairs.set.size,
      reciprocalMismatchCount: reciprocalPagePairMismatch
    },
    rules: [
      'Hero -> Soldier and Soldier -> Hero are two views of one canonical relation set.',
      'soldierId and heroId are the canonical reciprocal membership identities; names are presentation only.',
      'A page projection may attach display or routing metadata, but it must preserve the exact canonical pair set.',
      'Existing REVIEW presentation metadata is non-blocking and must never remove a canonical relation edge.',
      'Any one-direction-only membership, unknown target ID, duplicate pair, or relation snapshot drift is a Stage 6-5 failure.'
    ]
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage6-5-reciprocal-links/v1',
    stage: '6-5',
    status,
    generatedAt,
    sources,
    checks: {
      upstreamNonPass: upstreamNonPass.length,
      relationSnapshotMismatch: snapshotMismatches.length,
      canonicalInvalidPairs: canonical.invalid.length,
      canonicalDuplicatePairs: canonical.duplicates.length,
      byHeroInvalidPairs: heroIndex.invalid.length,
      byHeroDuplicatePairs: heroIndex.duplicates.length + heroIndex.duplicateValues.length,
      bySoldierInvalidPairs: soldierIndex.invalid.length,
      bySoldierDuplicatePairs: soldierIndex.duplicates.length + soldierIndex.duplicateValues.length,
      sharedIndexPairMismatch: relationPairMismatch,
      heroPageInvalidPairs: heroPagePairs.invalid.length,
      heroPageDuplicatePairs: heroPagePairs.duplicates.length + heroPagePairs.duplicateValues.length,
      soldierPageInvalidPairs: soldierPagePairs.invalid.length,
      soldierPageDuplicatePairs: soldierPagePairs.duplicates.length + soldierPagePairs.duplicateValues.length,
      heroPagePairMismatch: heroPageVsCanonical.missing.length + heroPageVsCanonical.extra.length,
      soldierPagePairMismatch: soldierPageVsCanonical.missing.length + soldierPageVsCanonical.extra.length,
      reciprocalPagePairMismatch,
      heroKeyCoverageMismatch,
      soldierKeyCoverageMismatch,
      inheritedRelationValidationMismatch: relationValidationMismatch
    },
    coverage: {
      heroKeys: heroKeys.length,
      heroPageKeys: heroPageKeys.length,
      soldierKeys: soldierKeys.length,
      soldierPageKeys: soldierPageKeys.length,
      canonicalRelationCount: canonical.set.size,
      byHeroRelationCount: heroIndex.set.size,
      bySoldierRelationCount: soldierIndex.set.size,
      heroPageRelationCount: heroPagePairs.set.size,
      soldierPageRelationCount: soldierPagePairs.set.size,
      snapshotMismatches,
      heroPageMissingPairs: heroPageVsCanonical.missing,
      heroPageExtraPairs: heroPageVsCanonical.extra,
      soldierPageMissingPairs: soldierPageVsCanonical.missing,
      soldierPageExtraPairs: soldierPageVsCanonical.extra,
      reciprocalHeroPageMissingFromSoldierPage: pageReciprocity.missing,
      reciprocalSoldierPageExtraAgainstHeroPage: pageReciprocity.extra
    },
    errors,
    reviews
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);
  console.log(`Soldier Stage 6-5 reciprocal links: ${status}`);
  console.log(`Hero/Soldier keys: ${heroKeys.length}/${soldierKeys.length}`);
  console.log(`Canonical/Hero page/Soldier page relations: ${canonical.set.size}/${heroPagePairs.set.size}/${soldierPagePairs.set.size}`);
  console.log(`Reciprocal mismatches: ${reciprocalPagePairMismatch}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
