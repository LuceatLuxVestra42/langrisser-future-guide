'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const configDir = path.join(dataDir, 'configdata');
const validationDir = path.join(dataDir, 'validation');
const inputPath = path.join(dataDir, 'hero-page-stage5-5-3.v1.json');
const contractPath = path.join(dataDir, 'contracts', 'hero-page-stage5-5-3-output-contract.v1.json');
const outPath = path.join(validationDir, 'hero-page-stage5-5-3-validation.v1.json');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const contract = read(contractPath);
const output = read(inputPath);
const heroInfo = read(path.join(configDir, 'ConfigDataHeroInfo.json'));
const skinInfo = read(path.join(configDir, 'ConfigDataHeroSkinInfo.json'));
const masterRoot = read(path.join(dataDir, 'hero-name-master.v1.json'));
const master = Array.isArray(masterRoot) ? masterRoot : (masterRoot.records || []);
const records = Array.isArray(output.records) ? output.records : [];

const errors = [];
const warnings = [];
const add = (code, detail={}) => errors.push({code, ...detail});
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const sortedNums = xs => [...xs].map(Number).sort((a,b)=>a-b);

if (contract.status !== 'ACCEPTED') add('CONTRACT_NOT_ACCEPTED', {status: contract.status});
if (output.generationErrors?.length) add('GENERATION_ERRORS_PRESENT', {count: output.generationErrors.length, sample: output.generationErrors.slice(0,20)});
if (records.length !== 267) add('RECORD_COUNT', {expected:267, actual:records.length});

const masterIds = sortedNums(master.map(h=>h.heroId));
const outputIds = sortedNums(records.map(r=>r.heroId));
if (!same(masterIds, outputIds)) add('CANONICAL_HERO_ID_SET_MISMATCH', {
  missing: masterIds.filter(id=>!outputIds.includes(id)),
  extra: outputIds.filter(id=>!masterIds.includes(id)),
});
if (new Set(records.map(r=>r.heroId)).size !== records.length) add('DUPLICATE_HERO_ID');

const masterById = new Map(master.map(h=>[Number(h.heroId),h]));
const heroInfoById = new Map(heroInfo.filter(r=>r&&Number.isInteger(r.ID)).map(r=>[r.ID,r]));
const skinById = new Map(skinInfo.filter(r=>r&&Number.isInteger(r.ID)).map(r=>[r.ID,r]));
const ownerSkinIds = new Map();
for (const s of skinInfo) {
  if (!Number.isInteger(s?.SpecifiedHero) || !Number.isInteger(s?.ID)) continue;
  const list = ownerSkinIds.get(s.SpecifiedHero) || [];
  list.push(s.ID);
  ownerSkinIds.set(s.SpecifiedHero,list);
}

const allowedRarity = new Map([[1,'N'],[2,'R'],[3,'SR'],[4,'SSR'],[6,'LLR']]);
const rarityDist = {};
const factionCountDist = {};
const originCategoryDist = {};
const cvStateDist = {};
const acquisitionStateDist = {};
const acquisitionTypeDist = {};
let totalSkinCount = 0;
const artworkPaths = new Set();
const unencodedSkinIds = [];
const localizationNonNull = [];

const expectedRecordKeys = ['artwork','cv','factions','heroId','identity','origin','rarity','skins'].sort();
for (const r of records) {
  const heroId = Number(r.heroId);
  const masterHero = masterById.get(heroId);
  const h = heroInfoById.get(heroId);
  if (!masterHero) { add('UNKNOWN_HERO', {heroId}); continue; }
  if (!h) { add('MISSING_HERO_INFO', {heroId}); continue; }

  if (!same(Object.keys(r).sort(), expectedRecordKeys)) add('RECORD_KEY_SHAPE', {heroId, keys:Object.keys(r).sort()});
  if (!r.identity || r.identity.nameKr !== masterHero.nameKr || r.identity.nameCn !== masterHero.nameCn || r.identity.nameEn !== masterHero.nameEn) {
    add('IDENTITY_MISMATCH', {heroId});
  }

  if (!r.rarity || allowedRarity.get(r.rarity.rank) !== r.rarity.baseLabel) add('RARITY_MAPPING', {heroId, rarity:r.rarity});
  rarityDist[String(r.rarity?.rank)] = (rarityDist[String(r.rarity?.rank)]||0)+1;

  if (!Array.isArray(r.factions) || r.factions.length < 1) add('FACTIONS_EMPTY', {heroId});
  else {
    const ids = r.factions.map(f=>f.factionId);
    if (!same(ids, [...ids].sort((a,b)=>a-b))) add('FACTION_SERIALIZATION_ORDER', {heroId, ids});
    if (new Set(ids).size !== ids.length) add('FACTION_DUPLICATE', {heroId, ids});
    for (const f of r.factions) {
      if (!Number.isInteger(f.factionId) || !f.nameCn || !f.iconSourcePath) add('FACTION_REQUIRED_VALUE', {heroId, faction:f});
      if (f.nameKr !== null) localizationNonNull.push({heroId, field:'factions[].nameKr', factionId:f.factionId, value:f.nameKr});
    }
    factionCountDist[String(r.factions.length)] = (factionCountDist[String(r.factions.length)]||0)+1;
  }

  if (!r.cv || !['NAMED','NONE'].includes(r.cv.state) || typeof r.cv.sourceValue !== 'string' || !r.cv.sourceValue) add('CV_REQUIRED_VALUE', {heroId, cv:r.cv});
  if (r.cv?.state === 'NONE' && ![99235,99236,99276].includes(heroId)) add('CV_NONE_UNEXPECTED', {heroId});
  if ([99235,99236,99276].includes(heroId) && !(r.cv?.state === 'NONE' && r.cv.sourceValue === '■■■■')) add('CV_CONFIRMED_NONE_MISMATCH', {heroId, cv:r.cv});
  if (r.cv?.state === 'NAMED' && r.cv.sourceValue === '■■■■') add('CV_MARKER_TREATED_AS_NAMED', {heroId});
  if (r.cv?.nameKr !== null) localizationNonNull.push({heroId, field:'cv.nameKr', value:r.cv.nameKr});
  cvStateDist[r.cv?.state] = (cvStateDist[r.cv?.state]||0)+1;

  if (!r.origin || !Number.isInteger(r.origin.productionId) || !r.origin.nameCn || !['ORIGINAL','MOBILE_ORIGINAL','COLLAB'].includes(r.origin.category)) add('ORIGIN_REQUIRED_VALUE', {heroId, origin:r.origin});
  if (r.origin?.nameKr !== null) localizationNonNull.push({heroId, field:'origin.nameKr', value:r.origin.nameKr});
  originCategoryDist[r.origin?.category] = (originCategoryDist[r.origin?.category]||0)+1;

  if (!r.artwork || typeof r.artwork.sourceAssetPath !== 'string' || !r.artwork.sourceAssetPath) add('ARTWORK_REQUIRED_VALUE', {heroId});
  else {
    if (!r.artwork.sourceAssetPath.includes('/Prefab/')) warnings.push({code:'ARTWORK_PATH_UNEXPECTED_PATTERN', heroId, path:r.artwork.sourceAssetPath});
    if (artworkPaths.has(r.artwork.sourceAssetPath)) add('ARTWORK_PATH_DUPLICATE', {heroId, path:r.artwork.sourceAssetPath});
    artworkPaths.add(r.artwork.sourceAssetPath);
  }

  const expectedSkinIds = Array.isArray(h.Skins_ID) ? h.Skins_ID.map(Number) : ((ownerSkinIds.get(heroId)||[]).length ? null : []);
  if (expectedSkinIds === null) add('OMITTED_SKIN_LIST_HAS_OWNER_ROWS', {heroId, ownerSkinIds:ownerSkinIds.get(heroId)});
  if (!Array.isArray(r.skins)) add('SKINS_NOT_ARRAY', {heroId});
  else {
    const actualIds = r.skins.map(s=>s.skinId);
    if (expectedSkinIds !== null && !same(actualIds, expectedSkinIds)) add('SKIN_ORDER_OR_MEMBERSHIP_MISMATCH', {heroId, expected:expectedSkinIds, actual:actualIds});
    totalSkinCount += r.skins.length;
    for (let i=0;i<r.skins.length;i++) {
      const s = r.skins[i];
      if (s.order !== i+1) add('SKIN_ORDER_INDEX', {heroId, skinId:s.skinId, expected:i+1, actual:s.order});
      const raw = skinById.get(s.skinId);
      if (!raw) { add('SKIN_RAW_MISSING', {heroId, skinId:s.skinId}); continue; }
      if (Number(raw.SpecifiedHero) !== heroId) add('SKIN_OWNER_MISMATCH', {heroId, skinId:s.skinId, specifiedHero:raw.SpecifiedHero});
      if (!s.nameCn || !s.sourceImagePath || !s.sourceSpinePath) add('SKIN_REQUIRED_VALUE', {heroId, skinId:s.skinId});
      if (s.nameKr !== null) localizationNonNull.push({heroId, field:'skins[].nameKr', skinId:s.skinId, value:s.nameKr});
      if (!s.acquisition || !['ENCODED','UNENCODED'].includes(s.acquisition.state)) add('ACQUISITION_STATE', {heroId, skinId:s.skinId, acquisition:s.acquisition});
      else if (s.acquisition.state === 'UNENCODED') {
        if (s.acquisition.typeCode !== null || s.acquisition.labelCn !== null || s.acquisition.labelKr !== null) add('UNENCODED_ACQUISITION_NOT_NULL', {heroId, skinId:s.skinId});
        if (raw.GetPathType !== undefined && raw.GetPathType !== null) add('UNENCODED_BUT_SOURCE_HAS_TYPE', {heroId, skinId:s.skinId, rawType:raw.GetPathType});
        unencodedSkinIds.push(s.skinId);
      } else {
        const map = {2:['光之回响','광휘의 메아리'],3:['命运星织','운명의 별짜기'],4:['英雄皮肤商店','영웅 스킨 상점']};
        const expected = map[s.acquisition.typeCode];
        if (!expected || s.acquisition.labelCn !== expected[0] || s.acquisition.labelKr !== expected[1]) add('ACQUISITION_MAPPING', {heroId, skinId:s.skinId, acquisition:s.acquisition});
        if (raw.GetPathType !== s.acquisition.typeCode) add('ACQUISITION_SOURCE_TYPE_MISMATCH', {heroId, skinId:s.skinId, rawType:raw.GetPathType, outputType:s.acquisition.typeCode});
        acquisitionTypeDist[String(s.acquisition.typeCode)] = (acquisitionTypeDist[String(s.acquisition.typeCode)]||0)+1;
      }
      acquisitionStateDist[s.acquisition.state] = (acquisitionStateDist[s.acquisition.state]||0)+1;
    }
  }

  if ('sp' in r || 'isSp' in r || 'soloLimitedSSR' in r || 'limited' in r) add('OWNERSHIP_BOUNDARY_VIOLATION', {heroId, keys:Object.keys(r)});
}

const expectedRarityDist = {'1':3,'2':12,'3':33,'4':213,'6':6};
if (!same(rarityDist, expectedRarityDist)) add('RARITY_DISTRIBUTION_CHANGED', {expected:expectedRarityDist, actual:rarityDist});
const expectedFactionDist = {'1':4,'2':63,'3':200};
if (!same(factionCountDist, expectedFactionDist)) add('FACTION_COUNT_DISTRIBUTION_CHANGED', {expected:expectedFactionDist, actual:factionCountDist});
const expectedCvDist = {NAMED:264,NONE:3};
if (!same(cvStateDist, expectedCvDist)) add('CV_DISTRIBUTION_CHANGED', {expected:expectedCvDist, actual:cvStateDist});
if (artworkPaths.size !== 267) add('ARTWORK_UNIQUE_COUNT', {expected:267, actual:artworkPaths.size});
if (totalSkinCount !== 540) add('SKIN_TOTAL_COUNT', {expected:540, actual:totalSkinCount});
const expectedAcqState = {UNENCODED:176,ENCODED:364};
if (!same(acquisitionStateDist, expectedAcqState)) add('ACQUISITION_STATE_DISTRIBUTION_CHANGED', {expected:expectedAcqState, actual:acquisitionStateDist});
const expectedAcqTypes = {'2':197,'3':1,'4':166};
if (!same(acquisitionTypeDist, expectedAcqTypes)) add('ACQUISITION_TYPE_DISTRIBUTION_CHANGED', {expected:expectedAcqTypes, actual:acquisitionTypeDist});
if (localizationNonNull.length) add('DEFERRED_LOCALIZATION_WAS_SYNTHESIZED', {count:localizationNonNull.length, sample:localizationNonNull.slice(0,20)});

const result = {
  version: 1,
  stage: 'hero-page-5-5',
  substage: '5-5-3',
  checkpoint: 'full-validation',
  status: errors.length ? 'FAIL' : 'PASS',
  contract: 'data/contracts/hero-page-stage5-5-3-output-contract.v1.json',
  output: 'data/hero-page-stage5-5-3.v1.json',
  summary: {
    canonicalHeroCount: master.length,
    outputRecordCount: records.length,
    uniqueHeroIdCount: new Set(records.map(r=>r.heroId)).size,
    rarityDistribution: rarityDist,
    factionCountDistribution: factionCountDist,
    cvStateDistribution: cvStateDist,
    originCategoryDistribution: originCategoryDist,
    uniqueArtworkPathCount: artworkPaths.size,
    totalSkinCount,
    acquisitionStateDistribution: acquisitionStateDist,
    acquisitionTypeDistribution: acquisitionTypeDist,
    unencodedSkinCount: unencodedSkinIds.length,
    deferredLocalizationNonNullCount: localizationNonNull.length,
  },
  invariants: {
    canonicalIdentityExact: !errors.some(e=>['RECORD_COUNT','CANONICAL_HERO_ID_SET_MISMATCH','DUPLICATE_HERO_ID','IDENTITY_MISMATCH'].includes(e.code)),
    rarityExact: !errors.some(e=>e.code.startsWith('RARITY_')),
    factionsValid: !errors.some(e=>e.code.startsWith('FACTION')),
    cvValid: !errors.some(e=>e.code.startsWith('CV_')),
    originValid: !errors.some(e=>e.code.startsWith('ORIGIN_')),
    artworkValid: !errors.some(e=>e.code.startsWith('ARTWORK_')),
    skinMembershipAndOrderExact: !errors.some(e=>['SKIN_ORDER_OR_MEMBERSHIP_MISMATCH','SKIN_ORDER_INDEX','SKIN_OWNER_MISMATCH','SKIN_RAW_MISSING','OMITTED_SKIN_LIST_HAS_OWNER_ROWS'].includes(e.code)),
    skinAcquisitionSemanticsValid: !errors.some(e=>e.code.includes('ACQUISITION')),
    noDeferredLocalizationSynthesis: localizationNonNull.length === 0,
    ownershipBoundariesPreserved: !errors.some(e=>e.code==='OWNERSHIP_BOUNDARY_VIOLATION'),
  },
  unencodedSkinIds: sortedNums(unencodedSkinIds),
  errors,
  warnings,
  completion: errors.length ? 'BLOCKED' : 'FULL_267_RECORD_CONTRACT_VALIDATION_COMPLETE',
  nextAction: errors.length ? 'Fix only proven contract/data violations, then re-run full validation.' : 'Stage 5-5-3 integrated output is structurally validated. Continue to the next 5-5 stage without reopening 5-5-2 semantics.',
};

fs.mkdirSync(validationDir, {recursive:true});
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  status: result.status,
  completion: result.completion,
  summary: result.summary,
  invariants: result.invariants,
  errorCount: errors.length,
  errors: errors.slice(0,50),
  warningCount: warnings.length,
  warnings: warnings.slice(0,20),
  output: path.relative(root,outPath),
}, null, 2));
if (errors.length) process.exitCode = 1;
