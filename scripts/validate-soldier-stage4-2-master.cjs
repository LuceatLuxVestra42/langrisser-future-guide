const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const MASTER_PATH = P('data/generated/soldier-master.v1.json');
const STAGE2_PATH = P('data/validation/soldier-stage2-final.v1.json');
const CONTRACT_PATH = P('data/contracts/soldier-identity-contract.v1.json');
const SOLDIER_PATH = P('data/configdata/ConfigDataSoldierInfo.json');
const SP_PATH = P('data/configdata/ConfigDataSPSoldierInfo.json');
const OUT_PATH = P('data/validation/soldier-stage4-2-master.v1.json');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function gitBlobSha(p) {
  const body = fs.readFileSync(p);
  const header = Buffer.from(`blob ${body.length}\0`);
  return crypto.createHash('sha1').update(header).update(body).digest('hex');
}
function duplicates(xs) {
  const seen = new Set(), dup = new Set();
  for (const x of xs) seen.has(x) ? dup.add(x) : seen.add(x);
  return [...dup].sort((a,b)=>String(a).localeCompare(String(b), undefined, {numeric:true}));
}
function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

const masterDoc = readJson(MASTER_PATH);
const master = masterDoc.records ?? [];
const stage2 = readJson(STAGE2_PATH);
const contract = readJson(CONTRACT_PATH);
const soldiers = readJson(SOLDIER_PATH);
const spRows = readJson(SP_PATH);
const errors = [];
const nonBlockingReviews = [];

const masterSha = gitBlobSha(MASTER_PATH);
const spSourceSha = gitBlobSha(SP_PATH);
const masterBlobShaMismatch = masterSha === contract.sources?.soldierMasterBlobSha ? 0 : 1;
if (masterBlobShaMismatch) {
  nonBlockingReviews.push({
    code: 'SOLDIER_MASTER_BYTE_DRIFT',
    classification: 'REVIEW',
    blocking: false,
    rule: 'Whole-master byte drift is diagnostic only. Canonical Soldier identity is soldierId, while presentation/classification metadata may change; all explicit identity/SP-link invariants below remain hard gates.'
  });
}

const sourceById = new Map(soldiers.map(x => [x.ID, x]));
const spById = new Map(spRows.map(x => [x.ID, x]));
const spByNormal = new Map(spRows.map(x => [x.NormalSoliderId, x]));
const spIdSet = new Set(spRows.map(x => x.ID));
const displayableSource = soldiers.filter(x => Boolean(x.Useable) && !Boolean(x.IsEnemy));
const displayableSourceIds = new Set(displayableSource.map(x => x.ID));
const masterIds = new Set(master.map(x => x.soldierId));

const normal = master.filter(x => !x.isSp);
const sp = master.filter(x => x.isSp);
const tier3Normal = normal.filter(x => x.tier === 3);

const checks = {
  contractFrozen: contract.status === 'FROZEN' ? 0 : 1,
  canonicalKeyMismatch: contract.canonicalKey?.field === 'soldierId' ? 0 : 1,
  masterBlobShaMismatch,
  spSourceBlobShaMismatch: spSourceSha === contract.sources?.spSoldierSourceBlobSha ? 0 : 1,
  duplicateSoldierIds: duplicates(master.map(x => x.soldierId)).length,
  duplicateSiteIds: duplicates(master.map(x => x.siteId)).length,
  duplicateSpIds: duplicates(spRows.map(x => x.ID)).length,
  duplicateSpNormalIds: duplicates(spRows.map(x => x.NormalSoliderId)).length,
  displayableSetMismatch: sameSet(displayableSourceIds, masterIds) ? 0 : 1,
  sourceFieldMismatch: 0,
  siteIdMismatch: 0,
  isSpMismatch: 0,
  spRelationMismatch: 0,
  normalRelationMetadataMismatch: 0,
  missingSourceSoldier: 0,
  stage2Errors: Array.isArray(stage2.errors) ? stage2.errors.length : 1,
  stage2IdentityCheckFailures: 0,
  baselineCountMismatch: 0
};

for (const m of master) {
  const s = sourceById.get(m.soldierId);
  if (!s) { checks.missingSourceSoldier++; continue; }
  if (m.nameCn !== s.Name || m.tier !== s.Rank || m.armyId !== s.Army_ID) checks.sourceFieldMismatch++;
  if (m.siteId !== `soldier-${m.soldierId}`) checks.siteIdMismatch++;
  const expectedIsSp = spIdSet.has(m.soldierId);
  if (m.isSp !== expectedIsSp) checks.isSpMismatch++;

  if (expectedIsSp) {
    const rel = spById.get(m.soldierId);
    if (!rel || m.normalSoldierId !== rel.NormalSoliderId || m.spSoldierId !== null) checks.spRelationMismatch++;
  } else {
    const rel = spByNormal.get(m.soldierId);
    const expectedSpId = rel ? rel.ID : null;
    if (m.normalSoldierId !== null || m.spSoldierId !== expectedSpId) checks.normalRelationMetadataMismatch++;
  }
}

const identityChecks = stage2.checks ?? {};
for (const key of ['duplicateSoldierIds','duplicateSpIds','duplicateSpNormalIds','missingSpSoldierInfo','missingNormalSoldierInfo','duplicateSiteIds']) {
  if ((identityChecks[key] ?? 0) !== 0) checks.stage2IdentityCheckFailures++;
}

const expected = contract.currentBaseline ?? {};
const actualBaseline = {
  displayableSoldiers: master.length,
  normalDisplayable: normal.length,
  spDisplayable: sp.length,
  duplicateSoldierIds: checks.duplicateSoldierIds,
  duplicateSpIds: checks.duplicateSpIds,
  duplicateSpNormalIds: checks.duplicateSpNormalIds,
  missingNormalSoldier: spRows.filter(x => !sourceById.has(x.NormalSoliderId)).length,
  missingSpSoldier: spRows.filter(x => !sourceById.has(x.ID)).length
};
for (const [k,v] of Object.entries(expected)) if (actualBaseline[k] !== v) checks.baselineCountMismatch++;

for (const [key, value] of Object.entries(checks)) {
  if (key !== 'masterBlobShaMismatch' && value !== 0) errors.push(`${key}: ${value}`);
}
if (stage2.counts?.displayable !== 224 || stage2.counts?.normalDisplayable !== 168 || stage2.counts?.spRelations !== 56 || stage2.counts?.tier3Normal !== 129) {
  errors.push('stage2 current counts do not match 224/168/56/129 regression baseline');
}
if (master.length !== 224 || normal.length !== 168 || sp.length !== 56 || tier3Normal.length !== 129) {
  errors.push('master current counts do not match 224/168/56/129 regression baseline');
}

const output = {
  version: 1,
  stage: 'soldier-page-4-2',
  status: errors.length ? 'FAIL' : 'PASS',
  purpose: 'Regress the UnityDataTool-generated Soldier Master against the frozen A-2 Soldier identity contract without creating or replacing Hero-Soldier membership.',
  inputs: {
    soldierMaster: 'data/generated/soldier-master.v1.json',
    soldierIdentityContract: 'data/contracts/soldier-identity-contract.v1.json',
    soldierInfo: 'data/configdata/ConfigDataSoldierInfo.json',
    spSoldierInfo: 'data/configdata/ConfigDataSPSoldierInfo.json',
    stage2Validation: 'data/validation/soldier-stage2-final.v1.json'
  },
  hashes: {
    frozenA2MasterBlobSha: contract.sources?.soldierMasterBlobSha ?? null,
    currentMasterBlobSha: masterSha,
    frozenA2SpSourceBlobSha: contract.sources?.spSoldierSourceBlobSha ?? null,
    currentSpSourceBlobSha: spSourceSha
  },
  counts: {
    sourceSoldiers: soldiers.length,
    displayableSoldiers: master.length,
    normalDisplayable: normal.length,
    spDisplayable: sp.length,
    tier3Normal: tier3Normal.length,
    spRelations: spRows.length,
    koreanConfirmedMasterRecords: stage2.counts?.koreanConfirmedMasterRecords ?? null,
    koreanPendingMasterRecords: stage2.counts?.koreanPendingMasterRecords ?? null,
    koreanUnreleasedMasterRecords: stage2.counts?.koreanUnreleasedMasterRecords ?? null
  },
  checks,
  nonBlockingReviews,
  knownReviewState: {
    pendingKoreanNames: stage2.counts?.koreanPendingMasterRecords ?? null,
    unreleasedKoreanNames: stage2.counts?.koreanUnreleasedMasterRecords ?? null,
    identityImpact: 'NONE; these are presentation/release-status reviews and do not change canonical soldierId identity.'
  },
  policy: {
    canonicalKey: 'soldierId only',
    spRelation: 'ConfigDataSPSoldierInfo.NormalSoliderId <-> ID only',
    masterByteDrift: 'Diagnostic REVIEW only; explicit canonical identity, source-field, routing, SP-link, duplicate and population checks remain blocking.',
    relationOwnership: 'Stage 4-2 validates Soldier identity/master readiness only. It does not compute canonical Hero-Soldier membership; A-9 reserves that ownership for the shared Relation Layer.'
  },
  errors,
  completion: errors.length
    ? 'Stage 4-2 regression failed.'
    : masterBlobShaMismatch
      ? 'Current UnityDataTool Soldier Master preserves all blocking A-2 identity/SP-link invariants; whole-master byte drift is recorded as non-blocking presentation/classification REVIEW.'
      : 'Current UnityDataTool Soldier Master is byte-identical to the frozen A-2 master and all canonical identity/SP-link invariants reproduce with zero errors.'
};

fs.mkdirSync(path.dirname(OUT_PATH), {recursive:true});
fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
if (errors.length) process.exit(1);
