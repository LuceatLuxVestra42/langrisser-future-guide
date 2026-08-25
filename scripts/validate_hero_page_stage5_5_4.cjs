'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const validationDir = path.join(dataDir, 'validation');
const inputPath = path.join(dataDir, 'hero-page-stage5-5-3.v1.json');
const contractPath = path.join(dataDir, 'contracts', 'hero-page-stage5-5-4-display-policy.v1.json');
const outPath = path.join(validationDir, 'hero-page-stage5-5-4-validation.v1.json');

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const records = Array.isArray(input.records) ? input.records : [];

const errors = [];
const warnings = [];
const markerLeaks = [];
const blankVisibleLabels = [];
const invalidGalleryRows = [];
const invalidAcquisitionRows = [];
const ownershipBoundaryViolations = [];

const summary = {
  heroCount: records.length,
  heroesWithNoRegularSkins: 0,
  heroesWithRegularSkins: 0,
  galleryNavigationHidden: 0,
  galleryNavigationShown: 0,
  totalCurrentScopeGalleryItems: 0,
  cvNamed: 0,
  cvNone: 0,
  cvNamedUsingSourceFallback: 0,
  cvNoneDisplayCount: 0,
  factionMembershipCount: 0,
  factionLabelsUsingSourceFallback: 0,
  originLabelsUsingSourceFallback: 0,
  skinCount: 0,
  skinNamesUsingSourceFallback: 0,
  encodedAcquisitionVisible: 0,
  unencodedAcquisitionHidden: 0,
  deferredLocalizationFieldsAlreadyFilled: 0,
};

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function effectiveLocalized(localized, source) {
  return nonEmptyString(localized) ? localized.trim() : (nonEmptyString(source) ? source.trim() : null);
}

function validateVisible(label, context) {
  if (!nonEmptyString(label)) blankVisibleLabels.push(context);
}

for (const hero of records) {
  const heroId = Number(hero.heroId);
  if (!Number.isInteger(heroId)) {
    errors.push('Output contains non-integer heroId');
    continue;
  }

  // Ownership boundaries: these do not belong in Stage 5-5-4 input.
  for (const key of ['sp', 'soloLimitedSsr', 'combat', 'bonds', 'soldiers']) {
    if (Object.prototype.hasOwnProperty.call(hero, key)) {
      ownershipBoundaryViolations.push({ heroId, key });
    }
  }

  // Identity and base rarity are directly visible.
  validateVisible(hero.identity?.nameKr, { heroId, field: 'identity.nameKr' });
  validateVisible(hero.identity?.nameCn, { heroId, field: 'identity.nameCn' });
  validateVisible(hero.identity?.nameEn, { heroId, field: 'identity.nameEn' });
  validateVisible(hero.rarity?.baseLabel, { heroId, field: 'rarity.baseLabel' });

  // Faction labels: localized Korean when supplied, otherwise source Chinese fallback.
  const factions = Array.isArray(hero.factions) ? hero.factions : [];
  summary.factionMembershipCount += factions.length;
  if (factions.length === 0) errors.push(`Hero ${heroId} has no faction entry`);
  for (const faction of factions) {
    if (nonEmptyString(faction.nameKr)) summary.deferredLocalizationFieldsAlreadyFilled++;
    else summary.factionLabelsUsingSourceFallback++;
    const label = effectiveLocalized(faction.nameKr, faction.nameCn);
    validateVisible(label, { heroId, factionId: faction.factionId, field: 'faction display label' });
    validateVisible(faction.iconSourcePath, { heroId, factionId: faction.factionId, field: 'faction icon source' });
  }

  // CV: explicit NONE vs localized/source fallback NAMED.
  if (hero.cv?.state === 'NAMED') {
    summary.cvNamed++;
    if (nonEmptyString(hero.cv.nameKr)) summary.deferredLocalizationFieldsAlreadyFilled++;
    else summary.cvNamedUsingSourceFallback++;
    const cvDisplay = effectiveLocalized(hero.cv.nameKr, hero.cv.sourceValue);
    validateVisible(cvDisplay, { heroId, field: 'cv display' });
    if (cvDisplay === '■■■■') markerLeaks.push({ heroId, field: 'cv display' });
  } else if (hero.cv?.state === 'NONE') {
    summary.cvNone++;
    summary.cvNoneDisplayCount++;
    const cvDisplay = '성우 없음';
    validateVisible(cvDisplay, { heroId, field: 'cv NONE display' });
    if (hero.cv?.sourceValue !== '■■■■') {
      errors.push(`Hero ${heroId} cv.state=NONE without confirmed source marker`);
    }
  } else {
    errors.push(`Hero ${heroId} has invalid cv.state ${hero.cv?.state}`);
  }

  // Origin: Korean localization if present, otherwise validated Chinese title.
  if (nonEmptyString(hero.origin?.nameKr)) summary.deferredLocalizationFieldsAlreadyFilled++;
  else summary.originLabelsUsingSourceFallback++;
  const originDisplay = effectiveLocalized(hero.origin?.nameKr, hero.origin?.nameCn);
  validateVisible(originDisplay, { heroId, field: 'origin display' });

  // Base artwork is gallery slot 1. Regular skins follow exactly in source order.
  validateVisible(hero.artwork?.sourceAssetPath, { heroId, field: 'base artwork source' });
  const skins = Array.isArray(hero.skins) ? hero.skins : [];
  const galleryTotal = 1 + skins.length;
  summary.totalCurrentScopeGalleryItems += galleryTotal;
  if (skins.length === 0) {
    summary.heroesWithNoRegularSkins++;
    summary.galleryNavigationHidden++;
    if (galleryTotal !== 1) invalidGalleryRows.push({ heroId, reason: 'no-skin gallery total is not 1' });
  } else {
    summary.heroesWithRegularSkins++;
    summary.galleryNavigationShown++;
    if (galleryTotal <= 1) invalidGalleryRows.push({ heroId, reason: 'skin gallery should have navigation' });
  }

  let previousOrder = 0;
  for (let i = 0; i < skins.length; i++) {
    const skin = skins[i];
    summary.skinCount++;
    const expectedOrder = i + 1;
    const expectedGalleryPosition = i + 2;
    if (skin.order !== expectedOrder || skin.order <= previousOrder) {
      invalidGalleryRows.push({ heroId, skinId: skin.skinId, order: skin.order, expectedOrder });
    }
    previousOrder = skin.order;
    if (skin.order + 1 !== expectedGalleryPosition) {
      invalidGalleryRows.push({ heroId, skinId: skin.skinId, reason: 'gallery position mismatch' });
    }

    if (nonEmptyString(skin.nameKr)) summary.deferredLocalizationFieldsAlreadyFilled++;
    else summary.skinNamesUsingSourceFallback++;
    const skinDisplay = effectiveLocalized(skin.nameKr, skin.nameCn);
    validateVisible(skinDisplay, { heroId, skinId: skin.skinId, field: 'skin display name' });
    validateVisible(skin.sourceImagePath, { heroId, skinId: skin.skinId, field: 'skin image source' });

    const acq = skin.acquisition || {};
    if (acq.state === 'ENCODED') {
      summary.encodedAcquisitionVisible++;
      if (![2, 3, 4].includes(acq.typeCode) || !nonEmptyString(acq.labelKr)) {
        invalidAcquisitionRows.push({ heroId, skinId: skin.skinId, acquisition: acq });
      }
      validateVisible(acq.labelKr, { heroId, skinId: skin.skinId, field: 'encoded acquisition display' });
    } else if (acq.state === 'UNENCODED') {
      summary.unencodedAcquisitionHidden++;
      if (acq.typeCode !== null || acq.labelCn !== null || acq.labelKr !== null) {
        invalidAcquisitionRows.push({ heroId, skinId: skin.skinId, acquisition: acq, reason: 'UNENCODED must remain null' });
      }
    } else {
      invalidAcquisitionRows.push({ heroId, skinId: skin.skinId, acquisition: acq, reason: 'invalid acquisition state' });
    }
  }
}

const expected = contract.expectedCurrentCounts || {};
const exactChecks = {
  heroCount: [summary.heroCount, contract.canonicalHeroCount],
  heroesWithNoRegularSkins: [summary.heroesWithNoRegularSkins, expected.heroesWithNoRegularSkins],
  heroesWithRegularSkins: [summary.heroesWithRegularSkins, expected.heroesWithRegularSkins],
  cvNamed: [summary.cvNamed, expected.cvNamed],
  cvNone: [summary.cvNone, expected.cvNone],
  regularSkinCount: [summary.skinCount, expected.regularSkinCount],
  encodedSkinAcquisition: [summary.encodedAcquisitionVisible, expected.encodedSkinAcquisition],
  unencodedSkinAcquisition: [summary.unencodedAcquisitionHidden, expected.unencodedSkinAcquisition],
};
for (const [name, [actual, wanted]] of Object.entries(exactChecks)) {
  if (actual !== wanted) errors.push(`${name} expected ${wanted}, got ${actual}`);
}

if (markerLeaks.length) errors.push('Raw no-voice-actor marker leaks into user-facing CV display');
if (blankVisibleLabels.length) errors.push('One or more required effective display labels are blank');
if (invalidGalleryRows.length) errors.push('Gallery ordering/navigation policy violation');
if (invalidAcquisitionRows.length) errors.push('Skin acquisition display-policy violation');
if (ownershipBoundaryViolations.length) errors.push('Out-of-scope Stage data leaked into Stage 5-5-3 record shape');

const representativeHeroIds = new Set([1, 24, 99225, 99235]);
const representatives = records.filter(r => representativeHeroIds.has(Number(r.heroId))).map(hero => ({
  heroId: hero.heroId,
  nameKr: hero.identity?.nameKr ?? null,
  cvDisplay: hero.cv?.state === 'NONE' ? '성우 없음' : effectiveLocalized(hero.cv?.nameKr, hero.cv?.sourceValue),
  originDisplay: effectiveLocalized(hero.origin?.nameKr, hero.origin?.nameCn),
  factionDisplays: (hero.factions || []).map(f => effectiveLocalized(f.nameKr, f.nameCn)),
  gallery: {
    totalCurrentScopeItems: 1 + (hero.skins || []).length,
    showNavigation: (hero.skins || []).length > 0,
    showCounter: (hero.skins || []).length > 0,
    skinAcquisitionDisplays: (hero.skins || []).map(s => s.acquisition?.state === 'ENCODED' ? s.acquisition.labelKr : null),
  },
}));

const result = {
  version: 1,
  stage: 'hero-page-5-5',
  substage: '5-5-4',
  checkpoint: 'display-policy-validation',
  status: errors.length ? 'FAIL' : 'PASS',
  contract: path.relative(root, contractPath),
  input: path.relative(root, inputPath),
  summary,
  policyInvariants: {
    explicitCvNoneDisplay: summary.cvNoneDisplayCount === 3,
    noRawCvMarkerLeak: markerLeaks.length === 0,
    localizationFallbacksNonBlank: blankVisibleLabels.length === 0,
    noSkinHeroesHideNavigation: summary.galleryNavigationHidden === summary.heroesWithNoRegularSkins,
    skinHeroesShowNavigation: summary.galleryNavigationShown === summary.heroesWithRegularSkins,
    galleryOrderPreserved: invalidGalleryRows.length === 0,
    encodedAcquisitionShown: summary.encodedAcquisitionVisible === 364,
    unencodedAcquisitionHidden: summary.unencodedAcquisitionHidden === 176,
    noAcquisitionInference: invalidAcquisitionRows.length === 0,
    ownershipBoundariesPreserved: ownershipBoundaryViolations.length === 0,
  },
  representatives,
  markerLeaks,
  blankVisibleLabels,
  invalidGalleryRows,
  invalidAcquisitionRows,
  ownershipBoundaryViolations,
  errors,
  warnings,
  completion: errors.length ? 'BLOCKED' : 'DISPLAY_EXCEPTION_POLICY_VALIDATED_FOR_ALL_267_HEROES',
  nextAction: errors.length ? 'Fix policy violations without changing accepted Stage 5-5-2 semantics.' : 'Stage 5-5-4 is complete. Proceed to the next 5-5 gate or later Stage 5/6 composition without reopening these display exception rules.'
};

fs.mkdirSync(validationDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  status: result.status,
  summary: result.summary,
  policyInvariants: result.policyInvariants,
  errors: result.errors,
  warnings: result.warnings,
  output: path.relative(root, outPath)
}, null, 2));
if (errors.length) process.exitCode = 1;
