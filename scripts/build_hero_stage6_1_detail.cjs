'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const P = {
  contract: 'data/contracts/hero-stage6-1-detail-integration.v1.json',
  heroMaster: 'data/hero-name-master.v1.json',
  stage4: 'data/generated/hero-basic-combat.v1.json',
  stage4Validation: 'data/validation/hero-basic-combat-stage4-5-summary.v1.json',
  stage51: 'data/generated/hero-page-stage5-1-bonds-final.v1.json',
  stage52: 'data/generated/hero-page-stage5-2-exclusive-central.v1.json',
  stage53: 'data/generated/hero-page-soldiers-stage5-3.v1.json',
  stage54: 'data/generated/hero-page-stage5-4-sp.v1.json',
  stage55: 'data/hero-page-stage5-5-3.v1.json',
  stage5Integration: 'data/validation/hero-page-stage5-integration-review.v1.json',
  b0: 'data/contracts/hero-exclusive-equipment-relation-scope-contract.v1.json',
  bByHero: 'data/generated/hero-exclusive-equipment-by-hero.v1.json',
  bValidation: 'data/validation/hero-exclusive-equipment-relation-validation.v1.json',
  output: 'data/generated/hero-detail-stage6-1.v1.json',
  validation: 'data/validation/hero-stage6-1-final.v1.json',
};

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const exists = rel => fs.existsSync(abs(rel));
const write = (rel, value) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + '\n');
};

function blobSha(rel) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function uniqueSortedInts(values) {
  return [...new Set((values || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
}

function recordArray(doc, label, errors) {
  const candidates = [doc?.records, doc?.rows, doc?.data, doc?.output?.records];
  const rows = candidates.find(Array.isArray);
  if (!rows) {
    errors.push(`${label}: no record array found`);
    return [];
  }
  return rows;
}

function indexHeroRecords(doc, label, canonicalIds, errors) {
  const rows = recordArray(doc, label, errors);
  const map = new Map();
  const duplicateIds = [];
  const invalidIds = [];
  const extraIds = [];
  for (const row of rows) {
    const heroId = Number(row?.heroId);
    if (!Number.isInteger(heroId)) {
      invalidIds.push(row?.heroId ?? null);
      continue;
    }
    if (!canonicalIds.has(heroId)) extraIds.push(heroId);
    if (map.has(heroId)) duplicateIds.push(heroId);
    else map.set(heroId, row);
  }
  if (duplicateIds.length) errors.push(`${label}: duplicate heroIds ${uniqueSortedInts(duplicateIds).join(',')}`);
  if (invalidIds.length) errors.push(`${label}: invalid heroId count ${invalidIds.length}`);
  if (extraIds.length) errors.push(`${label}: extra noncanonical heroIds ${uniqueSortedInts(extraIds).join(',')}`);
  const missing = [...canonicalIds].filter(id => !map.has(id)).sort((a, b) => a - b);
  if (missing.length) errors.push(`${label}: missing canonical heroIds ${missing.join(',')}`);
  if (map.size !== canonicalIds.size) errors.push(`${label}: indexed Hero count ${map.size}, expected ${canonicalIds.size}`);
  return { map, rows, missing, duplicateIds: uniqueSortedInts(duplicateIds), extraIds: uniqueSortedInts(extraIds) };
}

function normalizeNumericArray(value) {
  return uniqueSortedInts(Array.isArray(value) ? value : []);
}

function parseBByHero(doc, canonicalIds, errors) {
  let raw = null;
  if (doc && typeof doc.byHeroId === 'object' && !Array.isArray(doc.byHeroId)) raw = doc.byHeroId;
  else if (doc && typeof doc.byHero === 'object' && !Array.isArray(doc.byHero)) raw = doc.byHero;
  else if (Array.isArray(doc?.records)) {
    raw = Object.fromEntries(doc.records
      .filter(x => Number.isInteger(Number(x?.heroId)))
      .map(x => [String(Number(x.heroId)), x.equipmentIds ?? x.exclusiveEquipmentIds ?? []]));
  } else if (doc && typeof doc === 'object') {
    const numericKeys = Object.keys(doc).filter(k => /^\d+$/.test(k));
    if (numericKeys.length) raw = Object.fromEntries(numericKeys.map(k => [k, doc[k]]));
  }
  if (!raw) {
    errors.push('Stage B byHero artifact exists but no supported by-Hero map shape was found.');
    return null;
  }
  const out = {};
  for (const heroId of canonicalIds) out[String(heroId)] = normalizeNumericArray(raw[String(heroId)] ?? []);
  const extraKeys = Object.keys(raw).filter(k => /^\d+$/.test(k) && !canonicalIds.has(Number(k)));
  if (extraKeys.length) errors.push(`Stage B byHero contains noncanonical Hero keys: ${extraKeys.join(',')}`);
  return out;
}

const contract = read(P.contract);
const heroMaster = read(P.heroMaster);
const stage4 = read(P.stage4);
const stage4Validation = read(P.stage4Validation);
const stage51 = read(P.stage51);
const stage52 = read(P.stage52);
const stage53 = read(P.stage53);
const stage54 = read(P.stage54);
const stage55 = read(P.stage55);
const stage5Integration = read(P.stage5Integration);
const b0 = read(P.b0);

const hardErrors = [];
const inheritedReviews = [];

const heroes = Array.isArray(heroMaster.records) ? heroMaster.records : [];
const canonicalIds = new Set();
for (const hero of heroes) {
  const id = Number(hero?.heroId);
  if (!Number.isInteger(id)) hardErrors.push(`Hero master invalid heroId ${hero?.heroId}`);
  else if (canonicalIds.has(id)) hardErrors.push(`Hero master duplicate heroId ${id}`);
  else canonicalIds.add(id);
}
if (heroes.length !== 267 || canonicalIds.size !== 267) hardErrors.push(`Hero master coverage ${heroes.length}/${canonicalIds.size}, expected 267/267`);

if (stage4?.status !== 'PASS') hardErrors.push(`Stage 4 generated status=${stage4?.status}`);
if (stage4Validation?.status !== 'PASS') hardErrors.push(`Stage 4 validation status=${stage4Validation?.status}`);
if (stage5Integration?.status !== 'PASS' || stage5Integration?.completion !== 'STAGE_5_COMPLETE') {
  hardErrors.push(`Stage 5 integration is not PASS/STAGE_5_COMPLETE (${stage5Integration?.status}/${stage5Integration?.completion})`);
}
if ((stage5Integration?.summary?.blockerCount ?? 1) !== 0) hardErrors.push('Stage 5 integration blockerCount is not zero.');
if ((stage5Integration?.summary?.hardErrorCount ?? 1) !== 0) hardErrors.push('Stage 5 integration hardErrorCount is not zero.');
if (b0?.stage !== 'B-0' || b0?.status !== 'FROZEN') hardErrors.push(`Stage B-0 scope contract is not FROZEN (${b0?.stage}/${b0?.status})`);

const i4 = indexHeroRecords(stage4, 'Stage 4', canonicalIds, hardErrors);
const i51 = indexHeroRecords(stage51, 'Stage 5-1', canonicalIds, hardErrors);
const i52 = indexHeroRecords(stage52, 'Stage 5-2', canonicalIds, hardErrors);
const i54 = indexHeroRecords(stage54, 'Stage 5-4', canonicalIds, hardErrors);
const i55 = indexHeroRecords(stage55, 'Stage 5-5', canonicalIds, hardErrors);

const stage53ByHero = stage53?.byHeroId && typeof stage53.byHeroId === 'object' && !Array.isArray(stage53.byHeroId)
  ? stage53.byHeroId : null;
const soldiersById = stage53?.soldiersById && typeof stage53.soldiersById === 'object' && !Array.isArray(stage53.soldiersById)
  ? stage53.soldiersById : null;
if (!stage53ByHero) hardErrors.push('Stage 5-3 byHeroId map missing.');
if (!soldiersById) hardErrors.push('Stage 5-3 soldiersById map missing.');

const canonicalKeySet = new Set([...canonicalIds].map(String));
if (stage53ByHero) {
  const keys = Object.keys(stage53ByHero);
  const missingKeys = [...canonicalKeySet].filter(k => !Object.prototype.hasOwnProperty.call(stage53ByHero, k));
  const extraKeys = keys.filter(k => !canonicalKeySet.has(k));
  if (missingKeys.length) hardErrors.push(`Stage 5-3 missing Hero keys ${missingKeys.join(',')}`);
  if (extraKeys.length) hardErrors.push(`Stage 5-3 extra Hero keys ${extraKeys.join(',')}`);
  if (keys.length !== 267) hardErrors.push(`Stage 5-3 Hero key count ${keys.length}, expected 267`);
}

let relationCount = 0;
const unknownStage53Soldiers = [];
if (stage53ByHero && soldiersById) {
  for (const heroId of canonicalIds) {
    const ids = Array.isArray(stage53ByHero[String(heroId)]) ? stage53ByHero[String(heroId)].map(Number) : [];
    if (ids.length !== new Set(ids).size) hardErrors.push(`Stage 5-3 Hero ${heroId} has duplicate soldierIds.`);
    relationCount += ids.length;
    for (const soldierId of ids) if (!Object.prototype.hasOwnProperty.call(soldiersById, String(soldierId))) unknownStage53Soldiers.push(soldierId);
  }
}
if (unknownStage53Soldiers.length) hardErrors.push(`Stage 5-3 unresolved Soldier IDs ${uniqueSortedInts(unknownStage53Soldiers).join(',')}`);
if (relationCount !== 5977) hardErrors.push(`Stage 5-3 relation count ${relationCount}, expected frozen 5977`);

const bArtifactPresent = exists(P.bByHero);
const bValidationPresent = exists(P.bValidation);
let bByHero = null;
let bParityMismatch = [];
let bValidationStatus = null;
if (bArtifactPresent) {
  const bDoc = read(P.bByHero);
  bByHero = parseBByHero(bDoc, canonicalIds, hardErrors);
  if (bValidationPresent) {
    const v = read(P.bValidation);
    bValidationStatus = v?.status ?? null;
    if (!['PASS', 'PASS_WITH_REVIEW'].includes(String(bValidationStatus))) {
      hardErrors.push(`Stage B relation validation status=${bValidationStatus}`);
    }
  }
  if (bByHero) {
    for (const heroId of canonicalIds) {
      const ex = i52.map.get(heroId)?.exclusiveEquipment;
      const expected = ex?.status === 'RELEASED' && Number.isInteger(Number(ex?.equipmentId))
        ? [Number(ex.equipmentId)] : [];
      const actual = normalizeNumericArray(bByHero[String(heroId)] || []);
      if (!deepEqual(actual, expected)) bParityMismatch.push({ heroId, stage52EquipmentIds: expected, stageBEquipmentIds: actual });
    }
    if (bParityMismatch.length) hardErrors.push(`Stage B / frozen Stage 5-2 ownership parity mismatch for ${bParityMismatch.length} Heroes.`);
  }
}

const bState = bArtifactPresent && bByHero && bParityMismatch.length === 0
  ? (bValidationPresent ? 'ADOPTED_SHARED_RELATION' : 'PARITY_MATCHED_VALIDATION_PENDING')
  : 'PENDING_B_STAGE_NON_BLOCKING';
if (!bArtifactPresent) inheritedReviews.push('Stage B shared Hero-exclusive Equipment byHero index is not present yet; Stage 6-1 uses the frozen Stage 5-2 display snapshot without re-deriving ownership.');
else if (!bValidationPresent) inheritedReviews.push('Stage B byHero index is present and matches Stage 5-2, but the dedicated Stage B relation validation checkpoint is not present yet.');

const soldierNameReviewCount = Number(stage5Integration?.completedBlocks?.find(x => x.stage === '5-3')?.nonBlockingReview?.pendingKoreanNameSoldierCount ?? 0);
const skinUnencodedCount = Number(stage5Integration?.completedBlocks?.find(x => x.stage === '5-5')?.unencodedSkinAcquisitionCount ?? 0);
if (soldierNameReviewCount) inheritedReviews.push(`${soldierNameReviewCount} Soldier Korean display names remain non-blocking presentation REVIEW from Stage 5-3.`);
if (skinUnencodedCount) inheritedReviews.push(`${skinUnencodedCount} regular skins remain UNENCODED for acquisition because source GetPathType is omitted.`);

let exactCopyMismatchCount = 0;
const records = [];
for (const hero of heroes) {
  const heroId = Number(hero.heroId);
  const s4 = i4.map.get(heroId);
  const s51 = i51.map.get(heroId);
  const s52 = i52.map.get(heroId);
  const s54 = i54.map.get(heroId);
  const s55 = i55.map.get(heroId);
  if (!s4 || !s51 || !s52 || !s54 || !s55 || !stage53ByHero) continue;

  const header = clone(s55);
  delete header.heroId;
  const soldierIds = clone(stage53ByHero[String(heroId)] || []);
  const out = {
    heroId,
    identity: clone(s55.identity ?? {
      nameKr: hero.nameKr ?? null,
      nameCn: hero.nameCn ?? null,
      nameEn: hero.nameEn ?? null,
    }),
    header,
    normal: {
      talent: clone(s4.talent),
      stats: clone(s4.displayStats),
      soldierModifiers: clone(s4.soldierModifiers),
      jobs: clone(s4.jobTree),
      skills: clone(s4.skills),
      awakening: clone(s4.awakening),
    },
    bonds: clone(s51.bonds ?? []),
    exclusiveEquipment: clone(s52.exclusiveEquipment),
    centralDiscipline: clone(s52.centralDiscipline),
    soldiers: { soldierIds },
    sp: clone(s54.sp),
  };

  const sourceChecks = [
    [out.identity, s55.identity ?? out.identity],
    [out.normal.talent, s4.talent],
    [out.normal.stats, s4.displayStats],
    [out.normal.soldierModifiers, s4.soldierModifiers],
    [out.normal.jobs, s4.jobTree],
    [out.normal.skills, s4.skills],
    [out.normal.awakening, s4.awakening],
    [out.bonds, s51.bonds ?? []],
    [out.exclusiveEquipment, s52.exclusiveEquipment],
    [out.centralDiscipline, s52.centralDiscipline],
    [out.soldiers.soldierIds, stage53ByHero[String(heroId)] || []],
    [out.sp, s54.sp],
  ];
  if (sourceChecks.some(([a, b]) => !deepEqual(a, b))) exactCopyMismatchCount += 1;
  records.push(out);
}
if (records.length !== 267) hardErrors.push(`Stage 6-1 generated ${records.length} Hero records, expected 267.`);
if (new Set(records.map(x => x.heroId)).size !== 267) hardErrors.push('Stage 6-1 output Hero IDs are not unique.');
if (exactCopyMismatchCount) hardErrors.push(`Stage 6-1 exact-copy mismatch on ${exactCopyMismatchCount} Hero records.`);

const output = {
  version: 1,
  stage: 'hero-page-6-1',
  status: hardErrors.length ? 'FAIL' : 'PASS',
  completion: hardErrors.length ? 'BLOCKED' : 'COMPLETE',
  sourcePolicy: 'Compose only from frozen Hero Stage 4/5 outputs. Stage 6-1 performs no ConfigData semantic re-derivation. Hero-Soldier membership stays normalized from Stage 5-3. Hero-exclusive Equipment ownership remains a shared Stage B responsibility; frozen Stage 5-2 is the current display snapshot until shared relation adoption.',
  recordCount: records.length,
  parallelDependencies: {
    heroExclusiveEquipmentRelation: {
      state: bState,
      semanticOwner: 'shared Hero <-> Exclusive Equipment relation layer',
      stageBArtifactPresent: bArtifactPresent,
      stageBValidationPresent: bValidationPresent,
      stageBValidationStatus: bValidationStatus,
      parityMismatchCount: bParityMismatch.length,
      currentStage61DisplaySource: P.stage52,
      finalAdmissionRequirement: 'Shared Stage B relation adoption required before final Hero site-admission freeze.'
    }
  },
  shared: {
    soldiersById: clone(soldiersById || {}),
  },
  records,
};

const checks = {
  heroMasterCoverage: { expected: 267, actual: canonicalIds.size, pass: canonicalIds.size === 267 },
  stage4Coverage: { expected: 267, actual: i4.map.size, pass: i4.map.size === 267 },
  stage51Coverage: { expected: 267, actual: i51.map.size, pass: i51.map.size === 267 },
  stage52Coverage: { expected: 267, actual: i52.map.size, pass: i52.map.size === 267 },
  stage53HeroCoverage: { expected: 267, actual: stage53ByHero ? Object.keys(stage53ByHero).length : 0, pass: !!stage53ByHero && Object.keys(stage53ByHero).length === 267 },
  stage53RelationCount: { expected: 5977, actual: relationCount, pass: relationCount === 5977 },
  stage54Coverage: { expected: 267, actual: i54.map.size, pass: i54.map.size === 267 },
  stage55Coverage: { expected: 267, actual: i55.map.size, pass: i55.map.size === 267 },
  outputCoverage: { expected: 267, actual: records.length, pass: records.length === 267 },
  exactCopyIntegrity: { expected: 0, actual: exactCopyMismatchCount, pass: exactCopyMismatchCount === 0 },
  stage5IntegrationClosed: { expected: 'PASS/STAGE_5_COMPLETE', actual: `${stage5Integration?.status}/${stage5Integration?.completion}`, pass: stage5Integration?.status === 'PASS' && stage5Integration?.completion === 'STAGE_5_COMPLETE' },
  stageBParallelBoundary: {
    state: bState,
    artifactPresent: bArtifactPresent,
    validationPresent: bValidationPresent,
    parityMismatchCount: bParityMismatch.length,
    passForStage61: !bArtifactPresent || bParityMismatch.length === 0,
  },
  hardErrors: { expected: 0, actual: hardErrors.length, pass: hardErrors.length === 0 },
};

const validation = {
  version: 1,
  stage: 'hero-page-6-1',
  checkpoint: 'final-integration',
  status: hardErrors.length ? 'FAIL' : 'PASS',
  completion: hardErrors.length ? 'BLOCKED' : 'COMPLETE',
  contract: P.contract,
  sources: Object.fromEntries([
    P.heroMaster, P.stage4, P.stage4Validation, P.stage51, P.stage52, P.stage53, P.stage54, P.stage55,
    P.stage5Integration, P.b0, ...(bArtifactPresent ? [P.bByHero] : []), ...(bValidationPresent ? [P.bValidation] : []),
  ].map(rel => [rel, { gitBlobSha: blobSha(rel) }])),
  checks,
  summary: {
    canonicalHeroCount: canonicalIds.size,
    generatedHeroCount: records.length,
    heroSoldierRelationCount: relationCount,
    sharedSoldierMetadataCount: soldiersById ? Object.keys(soldiersById).length : 0,
    stageBState: bState,
    stageBParityMismatchCount: bParityMismatch.length,
    exactCopyMismatchCount,
    inheritedReviewCount: inheritedReviews.length,
    hardErrorCount: hardErrors.length,
  },
  inheritedReviews,
  stageBParityMismatches: bParityMismatch,
  hardErrors,
  decision: hardErrors.length
    ? 'Do not close Hero Stage 6-1. Structural integration checks failed.'
    : 'Hero Stage 6-1 is COMPLETE. All 267 Hero detail records are composed from frozen Stage 4/5 sources without semantic re-derivation. Stage B ownership adoption remains an explicit parallel dependency only when its shared relation artifact is not yet available.',
};

write(P.output, output);
write(P.validation, validation);

console.log(JSON.stringify({
  status: validation.status,
  completion: validation.completion,
  summary: validation.summary,
  checks: validation.checks,
  inheritedReviews: validation.inheritedReviews,
  hardErrors: validation.hardErrors,
}, null, 2));

if (hardErrors.length) process.exitCode = 1;
