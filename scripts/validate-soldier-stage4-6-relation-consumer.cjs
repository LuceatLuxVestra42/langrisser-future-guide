const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, readJson } = require('./lib/configdata-direct.cjs');

const P = {
  relation: 'data/generated/hero-soldier-relations.v1.json',
  bySoldier: 'data/generated/hero-soldier-by-soldier.v1.json',
  validation: 'data/validation/hero-soldier-relation-validation.v1.json',
  soldierMaster: 'data/generated/soldier-master.v1.json',
  heroMaster: 'data/hero-name-master.v1.json',
  legacy: 'data/generated/soldier-hero-relations.v1.json',
  out: 'data/validation/soldier-stage4-6-relation-consumer.v1.json',
};
function abs(p) { return path.join(ROOT, p); }
function blob(p) { return execFileSync('git', ['hash-object', p], { cwd: ROOT, encoding: 'utf8' }).trim(); }
function pairKey(h, s) { return `${h}:${s}`; }
function diffCount(a, b) { let n = 0; for (const x of a) if (!b.has(x)) n++; return n; }

const relation = readJson(abs(P.relation));
const bySoldier = readJson(abs(P.bySoldier));
const validation = readJson(abs(P.validation));
const soldierMaster = readJson(abs(P.soldierMaster)).records;
const heroMaster = readJson(abs(P.heroMaster)).records;
const legacy = readJson(abs(P.legacy));

const relationBlob = blob(P.relation);
const bySoldierBlob = blob(P.bySoldier);
const soldierIds = new Set(soldierMaster.map((x) => Number(x.soldierId)));
const heroIds = new Set(heroMaster.map((x) => Number(x.heroId)));
const indexPairs = new Set();
let indexRelationCount = 0;
let duplicateIndexValues = 0;
let missingHeroIds = 0;
let extraIndexSoldierKeys = 0;
for (const [sidText, hids] of Object.entries(bySoldier.bySoldierId || {})) {
  const sid = Number(sidText);
  if (!soldierIds.has(sid)) extraIndexSoldierKeys++;
  indexRelationCount += hids.length;
  duplicateIndexValues += hids.length - new Set(hids).size;
  for (const hid of hids) {
    if (!heroIds.has(Number(hid))) missingHeroIds++;
    indexPairs.add(pairKey(Number(hid), sid));
  }
}
const relationPairs = new Set((relation.edges || []).map((e) => pairKey(Number(e.heroId), Number(e.soldierId))));
const legacyPairs = new Set();
const legacyBySoldier = new Map();
for (const row of legacy.soldierToHeroes || []) {
  const sid = Number(row.soldierId);
  const hids = (row.finalHeroIds || []).map(Number);
  legacyBySoldier.set(sid, hids);
  for (const hid of hids) legacyPairs.add(pairKey(hid, sid));
}
let missingSoldierIndexKeys = 0;
let perSoldierMismatch = 0;
for (const sid of soldierIds) {
  const actual = new Set((bySoldier.bySoldierId?.[String(sid)] || []).map(Number));
  if (!Object.prototype.hasOwnProperty.call(bySoldier.bySoldierId || {}, String(sid))) missingSoldierIndexKeys++;
  const expected = new Set((legacyBySoldier.get(sid) || []).map(Number));
  perSoldierMismatch += diffCount(expected, actual) + diffCount(actual, expected);
}

const checks = {
  sharedValidationNotPass: validation.status === 'PASS' ? 0 : 1,
  relationBlobMismatchInValidation: validation.relationSet?.gitBlobSha === relationBlob ? 0 : 1,
  relationBlobMismatchInIndex: bySoldier.relationSet?.gitBlobSha === relationBlob ? 0 : 1,
  bySoldierBlobMismatchInValidation: validation.indexes?.bySoldier?.gitBlobSha === bySoldierBlob ? 0 : 1,
  indexRelationCountMismatch: indexRelationCount === relation.summary?.edgeCount ? 0 : Math.abs(indexRelationCount - Number(relation.summary?.edgeCount || 0)),
  indexPairMismatch: diffCount(relationPairs, indexPairs) + diffCount(indexPairs, relationPairs),
  duplicateIndexValues,
  missingHeroIds,
  missingSoldierIndexKeys,
  extraIndexSoldierKeys,
  legacyMissingPairs: diffCount(legacyPairs, indexPairs),
  legacyExtraPairs: diffCount(indexPairs, legacyPairs),
  perSoldierLegacyMismatch: perSoldierMismatch,
};
const errors = Object.entries(checks).filter(([, v]) => v !== 0).map(([checkId, value]) => ({ checkId, value }));
const output = {
  version: 1,
  stage: 'soldier-page-4-6',
  status: errors.length ? 'FAIL' : 'PASS',
  purpose: 'Adopt the PASS_ACCEPTED shared Hero-Soldier Relation Layer as the sole Soldier -> Hero membership source after Soldier 4-1 through 4-5 upstream migration gates.',
  consumerContract: {
    membershipSource: 'data/generated/hero-soldier-by-soldier.v1.json#bySoldierId',
    canonicalRelationSource: 'data/generated/hero-soldier-relations.v1.json#edges',
    readinessGate: 'data/validation/hero-soldier-relation-validation.v1.json must be PASS for the exact relation/index blobs.',
    heroPresentationJoin: 'Resolve heroId values through data/hero-name-master.v1.json only after membership lookup.',
    forbidden: [
      'Do not re-read ConfigDataSoldierInfo.GetSoldierHeros_ID to calculate final usable Heroes.',
      'Do not re-read ConfigDataSPHeroInfo.SecondStageRewardSoldiers to patch final membership.',
      'Do not use legacy data/generated/soldier-hero-relations.v1.json as production truth.',
      'Do not infer relations by names, numeric patterns, SP status, tier or army type.'
    ],
  },
  sharedArtifacts: {
    relationSet: { path: P.relation, gitBlobSha: relationBlob, schemaId: relation.schemaId },
    bySoldier: { path: P.bySoldier, gitBlobSha: bySoldierBlob, schemaId: bySoldier.schemaId },
    validation: { path: P.validation, gitBlobSha: blob(P.validation), status: validation.status },
  },
  counts: {
    soldierMasterRecords: soldierMaster.length,
    heroMasterRecords: heroMaster.length,
    relationEdges: relationPairs.size,
    bySoldierKeys: Object.keys(bySoldier.bySoldierId || {}).length,
    bySoldierRelations: indexRelationCount,
    legacyRegressionEdges: legacyPairs.size,
  },
  checks,
  legacyUsage: 'REGRESSION_ONLY',
  errors,
  completion: errors.length ? null : 'Soldier membership now consumes only the validated shared bySoldierId index, with exact parity to the canonical relation set and frozen 3-12 regression baseline.',
};
fs.writeFileSync(abs(P.out), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
if (errors.length) process.exit(1);
