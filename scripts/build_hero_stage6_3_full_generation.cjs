'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const P = {
  contract: 'data/contracts/hero-stage6-3-full-generation.v1.json',
  stage61: 'data/generated/hero-detail-stage6-1.v1.json',
  stage61Validation: 'data/validation/hero-stage6-1-final.v1.json',
  stage62Validation: 'data/validation/hero-stage6-2-final.v1.json',
  stage4: 'data/generated/hero-basic-combat.v1.json',
  stage4Validation: 'data/validation/hero-basic-combat-stage4-5-summary.v1.json',
  stage5Integration: 'data/validation/hero-page-stage5-integration-review.v1.json',
  stage51: 'data/generated/hero-page-stage5-1-bonds-final.v1.json',
  stage52: 'data/generated/hero-page-stage5-2-exclusive-central.v1.json',
  stage53: 'data/generated/hero-page-soldiers-stage5-3.v1.json',
  soldierRelationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
  stage54: 'data/generated/hero-page-stage5-4-sp.v1.json',
  stage55: 'data/hero-page-stage5-5-3.v1.json',
  exclusiveRelation: 'data/generated/hero-exclusive-equipment-relations.v1.json',
  exclusiveRelationValidation: 'data/validation/hero-exclusive-equipment-relation-stageB4-validation.v1.json',
  stageB5ByHero: 'data/generated/hero-exclusive-equipment-by-hero.v1.json',
  output: 'data/generated/hero-detail.v1.json',
  validation: 'data/validation/hero-stage6-3-final.v1.json',
  checkpointJson: 'data/checkpoints/hero-stage6-3-full-generation.json',
  checkpointMd: 'data/checkpoints/hero-stage6-3-full-generation.md',
};

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const writeJson = (rel, value) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + '\n');
};
const writeText = (rel, text) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), text.endsWith('\n') ? text : text + '\n');
};
const blobSha = rel => {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    try {
      return execFileSync('git', ['hash-object', rel], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  }
};
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const stripKeys = (obj, keys) => Object.fromEntries(
  Object.entries(obj || {}).filter(([key]) => !keys.includes(key)).map(([key, value]) => [key, clone(value)])
);
const stable = value => JSON.stringify(value);

const contract = read(P.contract);
const stage61 = read(P.stage61);
const stage61Validation = read(P.stage61Validation);
const stage62Validation = read(P.stage62Validation);
const stage4 = read(P.stage4);
const stage4Validation = read(P.stage4Validation);
const stage5Integration = read(P.stage5Integration);
const stage51 = read(P.stage51);
const stage52 = read(P.stage52);
const stage53 = read(P.stage53);
const soldierRelationValidation = read(P.soldierRelationValidation);
const stage54 = read(P.stage54);
const stage55 = read(P.stage55);
const exclusiveRelation = read(P.exclusiveRelation);
const exclusiveRelationValidation = read(P.exclusiveRelationValidation);
const stageB5ByHero = fs.existsSync(abs(P.stageB5ByHero)) ? read(P.stageB5ByHero) : null;

const hardErrors = [];
const globalChecks = [];
const perHeroDiagnostics = [];
let sourceLocatorMismatchCount = 0;
let stage4RegressionMismatchCount = 0;
let stage5RegressionMismatchCount = 0;
let exclusiveEquipmentRelationMismatchCount = 0;
let heroSoldierRelationMismatchCount = 0;
let spRelationMismatchCount = 0;
let requiredHeaderMissingCount = 0;

function check(name, pass, detail = null) {
  const item = { name, pass: Boolean(pass) };
  if (detail !== null) item.detail = detail;
  globalChecks.push(item);
  if (!item.pass) hardErrors.push(`${name}${detail ? `: ${detail}` : ''}`);
  return item.pass;
}

function rows(doc, label) {
  if (!Array.isArray(doc?.records)) {
    hardErrors.push(`${label}: records array missing`);
    return [];
  }
  return doc.records;
}

function indexRows(rowsValue, label) {
  const map = new Map();
  rowsValue.forEach((row, index) => {
    const heroId = Number(row?.heroId);
    if (!Number.isInteger(heroId)) {
      hardErrors.push(`${label}: invalid heroId at index ${index}`);
      return;
    }
    if (map.has(heroId)) hardErrors.push(`${label}: duplicate heroId ${heroId}`);
    else map.set(heroId, { row, index });
  });
  return map;
}

const r61 = rows(stage61, 'Stage 6-1');
const r4 = rows(stage4, 'Stage 4');
const r51 = rows(stage51, 'Stage 5-1');
const r52 = rows(stage52, 'Stage 5-2');
const r54 = rows(stage54, 'Stage 5-4');
const r55 = rows(stage55, 'Stage 5-5');
const i61 = indexRows(r61, 'Stage 6-1');
const i4 = indexRows(r4, 'Stage 4');
const i51 = indexRows(r51, 'Stage 5-1');
const i52 = indexRows(r52, 'Stage 5-2');
const i54 = indexRows(r54, 'Stage 5-4');
const i55 = indexRows(r55, 'Stage 5-5');
const byHeroId = stage53?.byHeroId;
const soldiersById = stage53?.soldiersById;

check('contract-frozen', contract?.version === 1 && contract?.stage === 'hero-page-6-3' && contract?.status === 'FROZEN',
  `${contract?.version}/${contract?.stage}/${contract?.status}`);
check('stage61-pass', stage61?.status === 'PASS' && stage61?.completion === 'COMPLETE', `${stage61?.status}/${stage61?.completion}`);
check('stage61-validation-pass', stage61Validation?.status === 'PASS' && stage61Validation?.completion === 'COMPLETE' && (stage61Validation?.summary?.hardErrorCount ?? 1) === 0,
  `${stage61Validation?.status}/${stage61Validation?.completion}/hard=${stage61Validation?.summary?.hardErrorCount}`);
check('stage62-validation-pass', stage62Validation?.status === 'PASS' && stage62Validation?.completion === 'COMPLETE' && (stage62Validation?.summary?.hardErrorCount ?? 1) === 0,
  `${stage62Validation?.status}/${stage62Validation?.completion}/hard=${stage62Validation?.summary?.hardErrorCount}`);
check('stage4-validation-pass', stage4Validation?.status === 'PASS' && stage4Validation?.stage4CompletionStatus === 'COMPLETE' && (stage4Validation?.hardErrors?.length ?? 1) === 0,
  `${stage4Validation?.status}/${stage4Validation?.stage4CompletionStatus}/hard=${stage4Validation?.hardErrors?.length}`);
check('stage5-integration-pass', stage5Integration?.status === 'PASS' && stage5Integration?.completion === 'STAGE_5_COMPLETE' && stage5Integration?.summary?.stage5ReadyToClose === true && (stage5Integration?.summary?.hardErrorCount ?? 1) === 0,
  `${stage5Integration?.status}/${stage5Integration?.completion}/hard=${stage5Integration?.summary?.hardErrorCount}`);
check('soldier-relation-validation-pass', soldierRelationValidation?.status === 'PASS' && (soldierRelationValidation?.errors?.length ?? 1) === 0,
  `${soldierRelationValidation?.status}/errors=${soldierRelationValidation?.errors?.length}`);
check('exclusive-relation-validation-pass', exclusiveRelationValidation?.status === 'PASS' && exclusiveRelationValidation?.completion === 'COMPLETE' && (exclusiveRelationValidation?.checks?.hardErrors?.actual ?? 1) === 0,
  `${exclusiveRelationValidation?.status}/${exclusiveRelationValidation?.completion}/hard=${exclusiveRelationValidation?.checks?.hardErrors?.actual}`);
check('all-indexed-source-counts-267', [r61.length, r4.length, r51.length, r52.length, r54.length, r55.length].every(x => x === 267),
  `6-1=${r61.length},4=${r4.length},5-1=${r51.length},5-2=${r52.length},5-4=${r54.length},5-5=${r55.length}`);
check('stage53-byHero-present', byHeroId && typeof byHeroId === 'object' && !Array.isArray(byHeroId));
check('stage53-soldier-metadata-present', soldiersById && typeof soldiersById === 'object' && !Array.isArray(soldiersById));

const frozenInputPaths = [P.stage4, P.stage51, P.stage52, P.stage53, P.stage54, P.stage55];
const frozenSourceMismatches = [];
for (const rel of frozenInputPaths) {
  const expected = stage61Validation?.sources?.[rel]?.gitBlobSha;
  const actual = blobSha(rel);
  if (!expected || !actual || expected !== actual) frozenSourceMismatches.push({ path: rel, expected: expected || null, actual: actual || null });
}
stage4RegressionMismatchCount += frozenSourceMismatches.filter(x => x.path === P.stage4).length;
stage5RegressionMismatchCount += frozenSourceMismatches.filter(x => x.path !== P.stage4).length;
check('frozen-stage4-5-source-blobs', frozenSourceMismatches.length === 0, JSON.stringify(frozenSourceMismatches));

const relationBlobActual = blobSha(P.exclusiveRelation);
const relationBlobExpected = exclusiveRelationValidation?.relationSet?.gitBlobSha;
check('exclusive-relation-blob-frozen', Boolean(relationBlobExpected) && relationBlobActual === relationBlobExpected,
  `expected=${relationBlobExpected || null}, actual=${relationBlobActual || null}`);

const exclusiveByHero = new Map();
const exclusiveByEquipment = new Map();
for (const edge of Array.isArray(exclusiveRelation?.records) ? exclusiveRelation.records : []) {
  const heroId = Number(edge?.heroId);
  const equipmentId = Number(edge?.equipmentId);
  if (!Number.isInteger(heroId) || !Number.isInteger(equipmentId)) {
    hardErrors.push(`exclusive relation invalid edge ${JSON.stringify(edge)}`);
    continue;
  }
  if (edge?.relationType !== 'exclusive' || edge?.verificationStatus !== 'VERIFIED') {
    hardErrors.push(`exclusive relation unverified edge ${heroId}:${equipmentId}`);
  }
  if (exclusiveByHero.has(heroId)) hardErrors.push(`exclusive relation multiple equipment for hero ${heroId}`);
  if (exclusiveByEquipment.has(equipmentId)) hardErrors.push(`exclusive relation multiple owner for equipment ${equipmentId}`);
  exclusiveByHero.set(heroId, equipmentId);
  exclusiveByEquipment.set(equipmentId, heroId);
}
check('exclusive-relation-cardinality-167', exclusiveByHero.size === 167 && exclusiveByEquipment.size === 167,
  `heroes=${exclusiveByHero.size}, equipment=${exclusiveByEquipment.size}`);

let stageBState = 'B4_CANONICAL_RELATION_ADOPTED_B5_INDEX_PENDING';
let stageB5ParityMismatchCount = 0;
if (stageB5ByHero) {
  stageBState = 'B5_BY_HERO_INDEX_PRESENT';
  for (const [heroId, equipmentId] of exclusiveByHero) {
    const values = stageB5ByHero?.byHeroId?.[String(heroId)];
    if (!Array.isArray(values) || values.length !== 1 || Number(values[0]) !== equipmentId) stageB5ParityMismatchCount += 1;
  }
  const extraKeys = Object.keys(stageB5ByHero?.byHeroId || {}).filter(key => !exclusiveByHero.has(Number(key)));
  stageB5ParityMismatchCount += extraKeys.length;
  if (stageB5ParityMismatchCount === 0) stageBState = 'B5_BY_HERO_INDEX_ADOPTED';
  else hardErrors.push(`Stage B-5 byHero parity mismatches=${stageB5ParityMismatchCount}`);
}

const acceptedRarity = new Set(['N', 'R', 'SR', 'SSR', 'LLR']);
const acceptedOrigin = new Set(['ORIGINAL', 'MOBILE_ORIGINAL', 'COLLAB']);
const acceptedFeatureStatus = new Set(['RELEASED', 'NOT_RELEASED']);
const canonicalIds = [...i61.keys()].sort((a, b) => a - b);
const outputRecords = [];
let releasedSpCount = 0;
let notReleasedSpCount = 0;
let soldierRelationCount = 0;
let structuralPassCount = 0;
let structuralFailCount = 0;
let publicationPassCount = 0;
let publicationReviewCount = 0;
let siteUsableCount = 0;
let inheritedSoldierReviewHeroCount = 0;

function sameIdentity(heroId, sources) {
  for (const field of ['nameCn', 'nameEn']) {
    const values = sources.map(row => row?.[field] ?? row?.identity?.[field]).filter(v => typeof v === 'string' && v.length);
    if (new Set(values).size > 1) return { pass: false, detail: `${field}=${JSON.stringify(values)}` };
  }
  return { pass: true, detail: null };
}

for (const heroId of canonicalIds) {
  const s61 = i61.get(heroId)?.row;
  const heroErrors = [];
  const reviewCodes = [];
  const sourceRows = {};
  const locatorMap = [
    ['normal', r4],
    ['bonds', r51],
    ['exclusiveCentral', r52],
    ['sp', r54],
    ['header', r55],
  ];
  for (const [key, rowsValue] of locatorMap) {
    const sourceIndex = s61?.sourceIndexes?.[key];
    const resolved = Number.isInteger(sourceIndex) ? rowsValue[sourceIndex] : null;
    if (!resolved || Number(resolved.heroId) !== heroId) {
      heroErrors.push(`source-locator-${key}: index=${sourceIndex}, resolved=${resolved?.heroId ?? null}`);
      sourceLocatorMismatchCount += 1;
    } else {
      sourceRows[key] = resolved;
    }
  }
  if (s61?.soldiersKey !== String(heroId) || !Object.prototype.hasOwnProperty.call(byHeroId || {}, String(heroId))) {
    heroErrors.push(`soldiers-locator: key=${s61?.soldiersKey}`);
    sourceLocatorMismatchCount += 1;
  }

  const normal = sourceRows.normal || i4.get(heroId)?.row;
  const bonds = sourceRows.bonds || i51.get(heroId)?.row;
  const exCentral = sourceRows.exclusiveCentral || i52.get(heroId)?.row;
  const spRow = sourceRows.sp || i54.get(heroId)?.row;
  const hdr = sourceRows.header || i55.get(heroId)?.row;
  const identityCheck = sameIdentity(heroId, [normal, bonds, exCentral, spRow, hdr]);
  if (!identityCheck.pass) heroErrors.push(`identity-mismatch: ${identityCheck.detail}`);

  if (!hdr?.identity || typeof hdr.identity !== 'object') {
    heroErrors.push('required-header-identity-missing');
    requiredHeaderMissingCount += 1;
  }
  if (!acceptedRarity.has(hdr?.rarity?.baseLabel)) {
    heroErrors.push(`required-header-rarity-invalid:${hdr?.rarity?.baseLabel ?? null}`);
    requiredHeaderMissingCount += 1;
  }
  if (!acceptedOrigin.has(hdr?.origin?.category)) {
    heroErrors.push(`required-header-origin-invalid:${hdr?.origin?.category ?? null}`);
    requiredHeaderMissingCount += 1;
  }
  if (!Array.isArray(hdr?.factions) || !Array.isArray(hdr?.skins)) {
    heroErrors.push('required-header-arrays-missing');
    requiredHeaderMissingCount += 1;
  }
  if (typeof hdr?.identity?.nameKr !== 'string' || !hdr.identity.nameKr.length) reviewCodes.push('HERO_NAME_KR_MISSING');
  if (typeof hdr?.artwork?.sourceAssetPath !== 'string' || !hdr.artwork.sourceAssetPath.length) reviewCodes.push('ARTWORK_SOURCE_PATH_MISSING');

  const tree = normal?.jobTree;
  const connections = Array.isArray(tree?.connections) ? tree.connections : [];
  const connectionIds = connections.map(x => Number(x?.jobConnectionId)).filter(Number.isInteger);
  const connectionSet = new Set(connectionIds);
  if (!connections.length) heroErrors.push('normal-job-connections-missing');
  if (connectionIds.length !== connections.length || connectionIds.length !== connectionSet.size) heroErrors.push('normal-job-connection-id-invalid-or-duplicate');
  if (!Number.isInteger(Number(tree?.primaryJobConnectionId)) || !connectionSet.has(Number(tree?.primaryJobConnectionId))) heroErrors.push('normal-primary-job-unresolved');
  const branches = Array.isArray(tree?.branches) ? tree.branches : [];
  const unresolvedBranchIds = [...new Set(branches.flat().map(Number).filter(Number.isInteger).filter(id => !connectionSet.has(id)))];
  if (unresolvedBranchIds.length) heroErrors.push(`normal-job-branch-unresolved:${unresolvedBranchIds.join(',')}`);

  const bondRows = Array.isArray(bonds?.bonds) ? bonds.bonds : null;
  if (!Array.isArray(bondRows)) heroErrors.push('bonds-array-missing');
  else if (bondRows.some(x => x?.sourceResolved !== true)) heroErrors.push(`bond-source-unresolved:${bondRows.filter(x => x?.sourceResolved !== true).length}`);

  const ex = exCentral?.exclusiveEquipment;
  const central = exCentral?.centralDiscipline;
  if (!acceptedFeatureStatus.has(ex?.status)) heroErrors.push(`exclusive-status-invalid:${ex?.status ?? null}`);
  if (!acceptedFeatureStatus.has(central?.status)) heroErrors.push(`central-status-invalid:${central?.status ?? null}`);
  const canonicalEquipmentId = exclusiveByHero.get(heroId) ?? null;
  const stage52EquipmentId = Number.isInteger(Number(ex?.equipmentId)) ? Number(ex.equipmentId) : null;
  let exParityPass = true;
  if (canonicalEquipmentId !== null) {
    exParityPass = ex?.status === 'RELEASED' && stage52EquipmentId === canonicalEquipmentId && Number(ex?.ownerHeroId) === heroId;
  } else {
    exParityPass = ex?.status === 'NOT_RELEASED' && stage52EquipmentId === null;
  }
  if (!exParityPass) {
    heroErrors.push(`exclusive-relation-mismatch: canonical=${canonicalEquipmentId}, stage52=${stage52EquipmentId}, status=${ex?.status}, owner=${ex?.ownerHeroId ?? null}`);
    exclusiveEquipmentRelationMismatchCount += 1;
  }

  const soldierIds = Array.isArray(byHeroId?.[String(heroId)]) ? byHeroId[String(heroId)].map(Number) : null;
  if (!Array.isArray(soldierIds)) {
    heroErrors.push('soldier-list-missing');
    heroSoldierRelationMismatchCount += 1;
  } else {
    soldierRelationCount += soldierIds.length;
    if (soldierIds.length !== new Set(soldierIds).size) {
      heroErrors.push('soldier-list-duplicate-id');
      heroSoldierRelationMismatchCount += 1;
    }
    const missingSoldierIds = soldierIds.filter(id => !Object.prototype.hasOwnProperty.call(soldiersById || {}, String(id)) && !Object.prototype.hasOwnProperty.call(soldiersById || {}, id));
    if (missingSoldierIds.length) {
      heroErrors.push(`soldier-id-unresolved:${missingSoldierIds.join(',')}`);
      heroSoldierRelationMismatchCount += missingSoldierIds.length;
    }
  }

  const sp = spRow?.sp;
  if (!acceptedFeatureStatus.has(sp?.status)) {
    heroErrors.push(`sp-status-invalid:${sp?.status ?? null}`);
    spRelationMismatchCount += 1;
  } else if (sp.status === 'RELEASED') {
    releasedSpCount += 1;
    if (!sp.job || typeof sp.job !== 'object' || !Number.isInteger(Number(sp.job.jobId))) {
      heroErrors.push('sp-released-job-missing');
      spRelationMismatchCount += 1;
    }
    if (!sp.missions || typeof sp.missions !== 'object') {
      heroErrors.push('sp-released-missions-missing');
      spRelationMismatchCount += 1;
    }
  } else {
    notReleasedSpCount += 1;
    if (sp.job != null) {
      heroErrors.push('sp-not-released-has-job');
      spRelationMismatchCount += 1;
    }
  }

  if ((stage53?.summary?.heroesWithReviewMetadata ?? 0) === 267) {
    reviewCodes.push('INHERITED_SOLDIER_KR_LOCALIZATION_REVIEW');
    inheritedSoldierReviewHeroCount += 1;
  }

  const presentation = stripKeys(hdr, ['heroId', 'identity']);
  const normalPayload = stripKeys(normal, ['heroId', 'nameKr', 'nameCn', 'nameEn']);
  const record = {
    heroId,
    identity: clone(hdr?.identity || null),
    presentation,
    normal: normalPayload,
    bonds: clone(bondRows || []),
    exclusiveEquipment: clone(ex || null),
    centralDiscipline: clone(central || null),
    soldiers: { ids: clone(soldierIds || []) },
    sp: clone(sp || null),
  };

  if (stable(record.normal) !== stable(stripKeys(normal, ['heroId', 'nameKr', 'nameCn', 'nameEn']))) {
    heroErrors.push('stage4-materialization-parity-mismatch');
    stage4RegressionMismatchCount += 1;
  }
  const stage5Parity = stable(record.bonds) === stable(clone(bondRows || [])) &&
    stable(record.exclusiveEquipment) === stable(clone(ex || null)) &&
    stable(record.centralDiscipline) === stable(clone(central || null)) &&
    stable(record.sp) === stable(clone(sp || null)) &&
    stable(record.presentation) === stable(stripKeys(hdr, ['heroId', 'identity']));
  if (!stage5Parity) {
    heroErrors.push('stage5-materialization-parity-mismatch');
    stage5RegressionMismatchCount += 1;
  }

  const structuralStatus = heroErrors.length ? 'FAIL' : 'PASS';
  const publicationStatus = structuralStatus === 'FAIL' ? 'FAIL' : (reviewCodes.length ? 'REVIEW' : 'PASS');
  const siteUsable = structuralStatus === 'PASS';
  if (structuralStatus === 'PASS') structuralPassCount += 1;
  else structuralFailCount += 1;
  if (publicationStatus === 'PASS') publicationPassCount += 1;
  else if (publicationStatus === 'REVIEW') publicationReviewCount += 1;
  if (siteUsable) siteUsableCount += 1;

  record.validation = {
    structuralStatus,
    publicationStatus,
    siteUsable,
    reviewCodes: [...new Set(reviewCodes)],
  };
  outputRecords.push(record);
  if (heroErrors.length) perHeroDiagnostics.push({ heroId, errors: heroErrors });
}

const outputIds = outputRecords.map(x => x.heroId);
const uniqueOutputIds = new Set(outputIds);
const duplicateHeroCount = outputIds.length - uniqueOutputIds.size;
const missingHeroIds = canonicalIds.filter(id => !uniqueOutputIds.has(id));
const missingHeroCount = missingHeroIds.length;
if (duplicateHeroCount) hardErrors.push(`duplicate output Hero count=${duplicateHeroCount}`);
if (missingHeroCount) hardErrors.push(`missing output Heroes=${missingHeroIds.join(',')}`);
if (soldierRelationCount !== 5977 || Number(stage53?.summary?.relationCount) !== 5977 || Number(soldierRelationValidation?.goldenComparison?.currentPairCount) !== 5977) {
  heroSoldierRelationMismatchCount += 1;
  hardErrors.push(`Hero-Soldier relation count mismatch materialized=${soldierRelationCount}, stage53=${stage53?.summary?.relationCount}, validation=${soldierRelationValidation?.goldenComparison?.currentPairCount}`);
}
if (releasedSpCount !== 25 || notReleasedSpCount !== 242) {
  spRelationMismatchCount += 1;
  hardErrors.push(`SP release population mismatch released=${releasedSpCount}, notReleased=${notReleasedSpCount}`);
}
if (exclusiveEquipmentRelationMismatchCount) hardErrors.push(`exclusive equipment relation mismatches=${exclusiveEquipmentRelationMismatchCount}`);
if (heroSoldierRelationMismatchCount) hardErrors.push(`Hero-Soldier relation mismatches=${heroSoldierRelationMismatchCount}`);
if (spRelationMismatchCount) hardErrors.push(`SP relation mismatches=${spRelationMismatchCount}`);
if (stage4RegressionMismatchCount) hardErrors.push(`Stage 4 regression mismatches=${stage4RegressionMismatchCount}`);
if (stage5RegressionMismatchCount) hardErrors.push(`Stage 5 regression mismatches=${stage5RegressionMismatchCount}`);
if (requiredHeaderMissingCount) hardErrors.push(`required header failures=${requiredHeaderMissingCount}`);
if (structuralFailCount) hardErrors.push(`structural FAIL Heroes=${structuralFailCount}`);

const uniqueHardErrors = [...new Set(hardErrors)];
const outputStatus = uniqueHardErrors.length ? 'FAIL' : (publicationReviewCount ? 'PASS_WITH_REVIEW' : 'PASS');
const completion = uniqueHardErrors.length ? 'INCOMPLETE' : 'COMPLETE';
const sourcePaths = [
  P.contract, P.stage61, P.stage61Validation, P.stage62Validation, P.stage4, P.stage4Validation,
  P.stage5Integration, P.stage51, P.stage52, P.stage53, P.soldierRelationValidation, P.stage54, P.stage55,
  P.exclusiveRelation, P.exclusiveRelationValidation,
];
const sources = Object.fromEntries(sourcePaths.map(rel => [rel, { gitBlobSha: blobSha(rel) }]));

const output = {
  version: 1,
  stage: 'hero-page-6-3',
  schemaId: 'hero-detail/v1',
  status: outputStatus,
  completion,
  sourcePolicy: 'Materialized strictly from frozen Stage 4/5 blocks through Stage 6-1 locators. Hero-Soldier membership is reused from the frozen shared relation. Hero-exclusive Equipment ownership is parity-checked against the frozen Stage B canonical B-4 relation and is not re-derived.',
  sources,
  relationState: {
    heroSoldier: {
      status: 'FROZEN_RELATION_REUSED',
      relationSetGitBlobSha: soldierRelationValidation?.relationSet?.gitBlobSha || null,
      relationCount: soldierRelationCount,
    },
    heroExclusiveEquipment: {
      status: stageBState,
      relationSetGitBlobSha: relationBlobActual,
      relationCount: exclusiveByHero.size,
      stageB5ParityMismatchCount,
    },
  },
  summary: {
    canonicalHeroCount: canonicalIds.length,
    generatedHeroCount: outputRecords.length,
    missingHeroCount,
    duplicateHeroCount,
    structuralPassCount,
    structuralFailCount,
    publicationPassCount,
    publicationReviewCount,
    siteUsableCount,
    releasedSpCount,
    notReleasedSpCount,
    heroSoldierRelationCount: soldierRelationCount,
    exclusiveEquipmentRelationCount: exclusiveByHero.size,
    inheritedSoldierReviewHeroCount,
    hardErrorCount: uniqueHardErrors.length,
  },
  shared: {
    soldiersById: clone(soldiersById || {}),
  },
  records: outputRecords,
};

const validation = {
  version: 1,
  stage: 'hero-page-6-3',
  checkpoint: 'full-267-hero-generation',
  status: outputStatus,
  completion,
  contract: P.contract,
  sources,
  summary: {
    canonicalHeroCount: canonicalIds.length,
    generatedHeroCount: outputRecords.length,
    missingHeroCount,
    duplicateHeroCount,
    sourceLocatorMismatchCount,
    stage4RegressionMismatchCount,
    stage5RegressionMismatchCount,
    exclusiveEquipmentRelationMismatchCount,
    heroSoldierRelationMismatchCount,
    spRelationMismatchCount,
    requiredHeaderMissingCount,
    structuralPassCount,
    structuralFailCount,
    publicationPassCount,
    publicationReviewCount,
    siteUsableCount,
    releasedSpCount,
    notReleasedSpCount,
    heroSoldierRelationCount: soldierRelationCount,
    exclusiveEquipmentRelationCount: exclusiveByHero.size,
    inheritedSoldierReviewHeroCount,
    stageBState,
    stageB5ParityMismatchCount,
    hardErrorCount: uniqueHardErrors.length,
  },
  upstreamGates: {
    stage4: `${stage4Validation?.status}/${stage4Validation?.stage4CompletionStatus}`,
    stage5: `${stage5Integration?.status}/${stage5Integration?.completion}`,
    stage61: `${stage61Validation?.status}/${stage61Validation?.completion}`,
    stage62: `${stage62Validation?.status}/${stage62Validation?.completion}`,
    heroSoldierRelation: soldierRelationValidation?.status || null,
    heroExclusiveEquipmentB4: `${exclusiveRelationValidation?.status}/${exclusiveRelationValidation?.completion}`,
  },
  nonBlockingReviews: [
    ...(stage5Integration?.nonBlockingFollowups || []),
    {
      owner: 'Hero Stage 6-3 publication classification',
      issue: `${publicationReviewCount} Hero records inherit presentation-only REVIEW while all structurally valid records remain siteUsable=true.`,
      blockingStage63Completion: false,
    },
    ...(stageB5ByHero ? [] : [{
      owner: 'Hero-exclusive Equipment Stage B',
      issue: 'B-4 canonical relation is already adopted directly; the B-5 derived byHero index is not present on this branch and is not required to re-derive ownership.',
      blockingStage63Completion: false,
    }]),
  ],
  failedHeroes: perHeroDiagnostics,
  hardErrors: uniqueHardErrors,
  decision: uniqueHardErrors.length
    ? 'Hero Stage 6-3 FAIL. Full generation is not admissible until structural errors are resolved.'
    : `Hero Stage 6-3 COMPLETE. ${outputRecords.length}/267 Hero details materialized with ${structuralPassCount} structural PASS, ${publicationReviewCount} publication REVIEW, zero structural FAIL, and zero hard errors.`,
};

const checkpoint = {
  version: 1,
  stage: 'hero-page-6-3',
  status: outputStatus,
  completion,
  completedScope: 'Full 267-Hero detail materialization and structural validation',
  confirmed: {
    generatedHeroCount: outputRecords.length,
    structuralPassCount,
    structuralFailCount,
    publicationReviewCount,
    siteUsableCount,
    heroSoldierRelationCount: soldierRelationCount,
    exclusiveEquipmentRelationCount: exclusiveByHero.size,
    stageBState,
    hardErrorCount: uniqueHardErrors.length,
  },
  sources: Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, value.gitBlobSha])),
  outputs: [P.output, P.validation],
  nextStart: 'Hero Stage 6-4 site consumer contract + final Hero data pipeline freeze. Do not reopen Stage 4/5 semantics or rebuild confirmed Hero-Soldier / Hero-exclusive Equipment relations.',
};

const checkpointMd = `# Hero Stage 6-3 Full Generation Checkpoint\n\n- Status: **${outputStatus} / ${completion}**\n- Generated Heroes: **${outputRecords.length}/267**\n- Structural PASS: **${structuralPassCount}**\n- Structural FAIL: **${structuralFailCount}**\n- Publication REVIEW: **${publicationReviewCount}**\n- Site-usable records: **${siteUsableCount}**\n- Hero-Soldier relations reused: **${soldierRelationCount}**\n- Hero-exclusive Equipment canonical relations adopted: **${exclusiveByHero.size}**\n- Stage B state: **${stageBState}**\n- Hard errors: **${uniqueHardErrors.length}**\n\n## Frozen boundaries\n\nStage 6-3 does not re-derive Stage 4/5 semantics, Hero-Soldier membership, or Hero-exclusive Equipment ownership. Stage B B-4 canonical ownership is consumed directly and parity-checked against frozen Hero Stage 5-2 data.\n\n## Next start\n\nProceed to **Hero Stage 6-4 site consumer contract + final Hero data pipeline freeze**. Preserve this Stage 6-3 materialized output and validation as the input checkpoint.\n`;

writeJson(P.output, output);
writeJson(P.validation, validation);
writeJson(P.checkpointJson, checkpoint);
writeText(P.checkpointMd, checkpointMd);

console.log(JSON.stringify({ status: outputStatus, completion, summary: validation.summary, hardErrors: uniqueHardErrors }, null, 2));
if (uniqueHardErrors.length) process.exitCode = 1;
