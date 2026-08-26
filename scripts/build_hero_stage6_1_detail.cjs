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

function uniqueSortedInts(values) {
  return [...new Set((values || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
}

function recordArray(doc, label, errors) {
  const rows = [doc?.records, doc?.rows, doc?.data, doc?.output?.records].find(Array.isArray);
  if (!rows) {
    errors.push(`${label}: no record array found`);
    return [];
  }
  return rows;
}

function indexHeroRecords(doc, label, canonicalIds, errors) {
  const rows = recordArray(doc, label, errors);
  const byId = new Map();
  const indexById = new Map();
  const duplicateIds = [];
  const extraIds = [];
  rows.forEach((row, index) => {
    const heroId = Number(row?.heroId);
    if (!Number.isInteger(heroId)) {
      errors.push(`${label}: invalid heroId at record ${index}`);
      return;
    }
    if (!canonicalIds.has(heroId)) extraIds.push(heroId);
    if (byId.has(heroId)) duplicateIds.push(heroId);
    else {
      byId.set(heroId, row);
      indexById.set(heroId, index);
    }
  });
  const missing = [...canonicalIds].filter(id => !byId.has(id)).sort((a, b) => a - b);
  if (duplicateIds.length) errors.push(`${label}: duplicate heroIds ${uniqueSortedInts(duplicateIds).join(',')}`);
  if (extraIds.length) errors.push(`${label}: extra noncanonical heroIds ${uniqueSortedInts(extraIds).join(',')}`);
  if (missing.length) errors.push(`${label}: missing canonical heroIds ${missing.join(',')}`);
  if (byId.size !== canonicalIds.size) errors.push(`${label}: indexed Hero count ${byId.size}, expected ${canonicalIds.size}`);
  return { rows, byId, indexById };
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

if (contract?.version !== 2 || contract?.stage !== 'hero-page-6-1' || contract?.status !== 'FROZEN') {
  hardErrors.push(`Stage 6-1 contract is not frozen v2 (${contract?.version}/${contract?.stage}/${contract?.status})`);
}
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

const canonicalKeys = new Set([...canonicalIds].map(String));
if (stage53ByHero) {
  const keys = Object.keys(stage53ByHero);
  const missing = [...canonicalKeys].filter(k => !Object.prototype.hasOwnProperty.call(stage53ByHero, k));
  const extra = keys.filter(k => !canonicalKeys.has(k));
  if (missing.length) hardErrors.push(`Stage 5-3 missing Hero keys ${missing.join(',')}`);
  if (extra.length) hardErrors.push(`Stage 5-3 extra Hero keys ${extra.join(',')}`);
  if (keys.length !== 267) hardErrors.push(`Stage 5-3 Hero key count ${keys.length}, expected 267`);
}

let relationCount = 0;
const unknownSoldiers = [];
if (stage53ByHero && soldiersById) {
  for (const heroId of canonicalIds) {
    const ids = Array.isArray(stage53ByHero[String(heroId)]) ? stage53ByHero[String(heroId)].map(Number) : [];
    if (ids.length !== new Set(ids).size) hardErrors.push(`Stage 5-3 Hero ${heroId} has duplicate soldierIds.`);
    relationCount += ids.length;
    for (const soldierId of ids) if (!Object.prototype.hasOwnProperty.call(soldiersById, String(soldierId))) unknownSoldiers.push(soldierId);
  }
}
if (unknownSoldiers.length) hardErrors.push(`Stage 5-3 unresolved Soldier IDs ${uniqueSortedInts(unknownSoldiers).join(',')}`);
if (relationCount !== 5977) hardErrors.push(`Stage 5-3 relation count ${relationCount}, expected frozen 5977`);

const bArtifactPresent = exists(P.bByHero);
const bValidationPresent = exists(P.bValidation);
let bByHero = null;
let bParityMismatch = [];
let bValidationStatus = null;
if (bArtifactPresent) {
  bByHero = parseBByHero(read(P.bByHero), canonicalIds, hardErrors);
  if (bValidationPresent) {
    const validation = read(P.bValidation);
    bValidationStatus = validation?.status ?? null;
    if (!['PASS', 'PASS_WITH_REVIEW'].includes(String(bValidationStatus))) {
      hardErrors.push(`Stage B relation validation status=${bValidationStatus}`);
    }
  }
  if (bByHero) {
    for (const heroId of canonicalIds) {
      const ex = i52.byId.get(heroId)?.exclusiveEquipment;
      const expected = ex?.status === 'RELEASED' && Number.isInteger(Number(ex?.equipmentId)) ? [Number(ex.equipmentId)] : [];
      const actual = normalizeNumericArray(bByHero[String(heroId)] || []);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        bParityMismatch.push({ heroId, stage52EquipmentIds: expected, stageBEquipmentIds: actual });
      }
    }
    if (bParityMismatch.length) hardErrors.push(`Stage B / frozen Stage 5-2 ownership parity mismatch for ${bParityMismatch.length} Heroes.`);
  }
}

const bState = bArtifactPresent && bByHero && bParityMismatch.length === 0
  ? (bValidationPresent ? 'ADOPTED_SHARED_RELATION' : 'PARITY_MATCHED_VALIDATION_PENDING')
  : 'PENDING_B_STAGE_NON_BLOCKING';
if (!bArtifactPresent) inheritedReviews.push('Stage B shared Hero-exclusive Equipment byHero index is not present yet; Stage 6-1 references the frozen Stage 5-2 snapshot without re-deriving ownership.');
else if (!bValidationPresent) inheritedReviews.push('Stage B byHero index is present and matches Stage 5-2, but the dedicated Stage B validation checkpoint is not present yet.');

const soldierNameReviewCount = Number(stage5Integration?.completedBlocks?.find(x => x.stage === '5-3')?.nonBlockingReview?.pendingKoreanNameSoldierCount ?? 0);
const skinUnencodedCount = Number(stage5Integration?.completedBlocks?.find(x => x.stage === '5-5')?.unencodedSkinAcquisitionCount ?? 0);
if (soldierNameReviewCount) inheritedReviews.push(`${soldierNameReviewCount} Soldier Korean display names remain non-blocking presentation REVIEW from Stage 5-3.`);
if (skinUnencodedCount) inheritedReviews.push(`${skinUnencodedCount} regular skins remain UNENCODED for acquisition because source GetPathType is omitted.`);

const records = [];
let locatorMismatchCount = 0;
for (const hero of heroes) {
  const heroId = Number(hero.heroId);
  const sourceIndexes = {
    normal: i4.indexById.get(heroId),
    bonds: i51.indexById.get(heroId),
    exclusiveCentral: i52.indexById.get(heroId),
    sp: i54.indexById.get(heroId),
    header: i55.indexById.get(heroId),
  };
  const resolvers = [
    [i4.rows, sourceIndexes.normal],
    [i51.rows, sourceIndexes.bonds],
    [i52.rows, sourceIndexes.exclusiveCentral],
    [i54.rows, sourceIndexes.sp],
    [i55.rows, sourceIndexes.header],
  ];
  if (resolvers.some(([rows, index]) => !Number.isInteger(index) || Number(rows[index]?.heroId) !== heroId)) {
    locatorMismatchCount += 1;
  }
  const ex = i52.byId.get(heroId)?.exclusiveEquipment ?? null;
  const central = i52.byId.get(heroId)?.centralDiscipline ?? null;
  const sp = i54.byId.get(heroId)?.sp ?? null;
  const soldierIds = stage53ByHero?.[String(heroId)] ?? [];
  records.push({
    heroId,
    sourceIndexes,
    soldiersKey: String(heroId),
    snapshot: {
      exclusiveEquipmentStatus: ex?.status ?? null,
      equipmentId: Number.isInteger(Number(ex?.equipmentId)) ? Number(ex.equipmentId) : null,
      centralDisciplineStatus: central?.status ?? null,
      soldierCount: Array.isArray(soldierIds) ? soldierIds.length : 0,
      spStatus: sp?.status ?? null,
    },
  });
}
if (records.length !== 267) hardErrors.push(`Stage 6-1 generated ${records.length} Hero index records, expected 267.`);
if (new Set(records.map(x => x.heroId)).size !== 267) hardErrors.push('Stage 6-1 output Hero IDs are not unique.');
if (locatorMismatchCount) hardErrors.push(`Stage 6-1 source locator mismatch on ${locatorMismatchCount} Hero records.`);

const sourceMap = {
  normal: { path: P.stage4, recordKey: 'heroId' },
  bonds: { path: P.stage51, recordKey: 'heroId' },
  exclusiveCentral: { path: P.stage52, recordKey: 'heroId' },
  soldiers: { path: P.stage53, recordKey: 'byHeroId[String(heroId)]', sharedMetadata: 'soldiersById' },
  sp: { path: P.stage54, recordKey: 'heroId' },
  header: { path: P.stage55, recordKey: 'heroId' },
};

const output = {
  version: 2,
  stage: 'hero-page-6-1',
  status: hardErrors.length ? 'FAIL' : 'PASS',
  completion: hardErrors.length ? 'BLOCKED' : 'COMPLETE',
  representation: 'normalized-composition-index',
  sourcePolicy: 'Frozen Stage 4/5 blocks remain canonical at their source paths. This file freezes the per-Hero composition locators and small parity checkpoints only; it does not duplicate the large payload blocks or perform semantic re-derivation.',
  sourceMap,
  parallelDependencies: {
    heroExclusiveEquipmentRelation: {
      state: bState,
      semanticOwner: 'shared Hero <-> Exclusive Equipment relation layer',
      stageBArtifactPresent: bArtifactPresent,
      stageBValidationPresent: bValidationPresent,
      stageBValidationStatus: bValidationStatus,
      parityMismatchCount: bParityMismatch.length,
      currentStage61SnapshotSource: P.stage52,
      finalAdmissionRequirement: 'Shared Stage B relation adoption required before final Hero site-admission freeze.'
    }
  },
  recordCount: records.length,
  shared: {
    soldierMetadataSource: P.stage53,
    soldierMetadataKey: 'soldiersById',
    soldierMetadataCount: soldiersById ? Object.keys(soldiersById).length : 0,
    heroSoldierRelationCount: relationCount,
  },
  records,
};

const checks = {
  heroMasterCoverage: { expected: 267, actual: canonicalIds.size, pass: canonicalIds.size === 267 },
  stage4Coverage: { expected: 267, actual: i4.byId.size, pass: i4.byId.size === 267 },
  stage51Coverage: { expected: 267, actual: i51.byId.size, pass: i51.byId.size === 267 },
  stage52Coverage: { expected: 267, actual: i52.byId.size, pass: i52.byId.size === 267 },
  stage53HeroCoverage: { expected: 267, actual: stage53ByHero ? Object.keys(stage53ByHero).length : 0, pass: !!stage53ByHero && Object.keys(stage53ByHero).length === 267 },
  stage53RelationCount: { expected: 5977, actual: relationCount, pass: relationCount === 5977 },
  stage54Coverage: { expected: 267, actual: i54.byId.size, pass: i54.byId.size === 267 },
  stage55Coverage: { expected: 267, actual: i55.byId.size, pass: i55.byId.size === 267 },
  outputCoverage: { expected: 267, actual: records.length, pass: records.length === 267 },
  sourceLocatorIntegrity: { expected: 0, actual: locatorMismatchCount, pass: locatorMismatchCount === 0 },
  normalizedOutput: { expected: true, actual: true, pass: true, duplicatedUpstreamPayloadBlocks: false },
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
  version: 2,
  stage: 'hero-page-6-1',
  checkpoint: 'normalized-composition-index',
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
    sourceLocatorMismatchCount: locatorMismatchCount,
    duplicatedUpstreamPayloadBlocks: false,
    inheritedReviewCount: inheritedReviews.length,
    hardErrorCount: hardErrors.length,
  },
  inheritedReviews,
  stageBParityMismatches: bParityMismatch,
  hardErrors,
  decision: hardErrors.length
    ? 'Do not close Hero Stage 6-1. Structural composition-index validation failed.'
    : 'Hero Stage 6-1 is COMPLETE. A normalized 267-Hero composition index resolves all frozen Stage 4/5 blocks without duplicating their payloads or re-deriving semantics. Stage B ownership adoption remains an explicit parallel dependency only while its shared relation artifact is unavailable.',
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
