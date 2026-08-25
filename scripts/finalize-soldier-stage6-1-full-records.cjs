const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  checkpoint: 'data/validation/soldier-stage6-0-checkpoint.v1.json',
  detail: 'data/generated/soldier-detail-stage5-6.v1.json',
  detailValidation: 'data/validation/soldier-stage5-6-sp-detail.v1.json',
  list: 'data/generated/soldier-list-stage5-8.v1.json',
  listValidation: 'data/validation/soldier-stage5-8-release.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  output: 'data/generated/soldier-stage6-1-full-records.v1.json',
  validation: 'data/validation/soldier-stage6-1-full-records.v1.json',
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
function indexByInteger(records, key) {
  const map = new Map();
  const duplicates = [];
  const invalid = [];
  for (const record of records) {
    const id = record?.[key];
    if (!Number.isInteger(id)) { invalid.push(id ?? null); continue; }
    if (map.has(id)) duplicates.push(id); else map.set(id, record);
  }
  return { map, duplicates: [...new Set(duplicates)].sort((a,b)=>a-b), invalid };
}
function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function identityFromDetail(record) {
  const i = record?.identity ?? {};
  return {
    soldierId: record?.soldierId,
    siteId: i.siteId ?? null,
    nameKr: i.nameKr ?? null,
    nameCn: i.nameCn ?? null,
    nameKrStatus: i.nameKrStatus ?? null,
    tier: i.tier ?? null,
    armyId: i.armyId ?? null,
    armyType: i.armyType ?? null,
    uiGroup: i.uiGroup ?? null,
    isSp: i.isSp === true,
    normalSoldierId: i.normalSoldierId ?? null,
    spSoldierId: i.spSoldierId ?? null,
    validationStatus: i.validationStatus ?? null,
  };
}
function identityFromList(record) {
  return {
    soldierId: record?.soldierId,
    siteId: record?.siteId ?? null,
    nameKr: record?.nameKr ?? null,
    nameCn: record?.nameCn ?? null,
    nameKrStatus: record?.nameKrStatus ?? null,
    tier: record?.tier ?? null,
    armyId: record?.armyId ?? null,
    armyType: record?.armyType ?? null,
    uiGroup: record?.uiGroup ?? null,
    isSp: record?.isSp === true,
    normalSoldierId: record?.normalSoldierId ?? null,
    spSoldierId: record?.spSoldierId ?? null,
    validationStatus: record?.validationStatus ?? null,
  };
}

function main() {
  const checkpoint = loadJson(paths.checkpoint);
  const detail = loadJson(paths.detail);
  const detailValidation = loadJson(paths.detailValidation);
  const list = loadJson(paths.list);
  const listValidation = loadJson(paths.listValidation);
  const releaseMetadata = loadJson(paths.releaseMetadata);

  const detailRecords = Array.isArray(detail.records) ? detail.records : [];
  const listRecords = Array.isArray(list.records) ? list.records : [];
  const releaseRecords = Array.isArray(releaseMetadata.records) ? releaseMetadata.records : [];
  const detailIndex = indexByInteger(detailRecords, 'soldierId');
  const listIndex = indexByInteger(listRecords, 'soldierId');
  const releaseIndex = indexByInteger(releaseRecords, 'soldierId');
  const errors = [];
  const reviews = [];

  if (checkpoint.status !== 'PASS') errors.push(`Stage 6-0 checkpoint must be PASS, got ${checkpoint.status}`);
  if (checkpoint.schemaId !== 'soldier-stage6-0-checkpoint/v1') errors.push(`Unexpected Stage 6-0 schemaId: ${checkpoint.schemaId}`);
  if (detail.status !== 'PASS') errors.push(`Stage 5-6 detail must be PASS, got ${detail.status}`);
  if (detailValidation.status !== 'PASS') errors.push(`Stage 5-6 validation must be PASS, got ${detailValidation.status}`);
  if (list.status !== 'PASS') errors.push(`Stage 5-8 list must be PASS, got ${list.status}`);
  if (listValidation.status !== 'PASS') errors.push(`Stage 5-8 validation must be PASS, got ${listValidation.status}`);
  if (releaseMetadata.status !== 'PASS') errors.push(`Stage 5-8 release metadata must be PASS, got ${releaseMetadata.status}`);

  for (const [label, index] of [['detail', detailIndex], ['list', listIndex], ['release', releaseIndex]]) {
    if (index.invalid.length) errors.push(`${label} contains ${index.invalid.length} invalid soldierId values`);
    if (index.duplicates.length) errors.push(`${label} duplicate Soldier IDs: ${index.duplicates.join(', ')}`);
  }

  const expected = checkpoint.expectedCoverage ?? {};
  const canonicalIds = [...detailIndex.map.keys()].sort((a,b)=>a-b);
  const missingListIds = canonicalIds.filter(id => !listIndex.map.has(id));
  const missingReleaseIds = canonicalIds.filter(id => !releaseIndex.map.has(id));
  const extraListIds = [...listIndex.map.keys()].filter(id => !detailIndex.map.has(id)).sort((a,b)=>a-b);
  const extraReleaseIds = [...releaseIndex.map.keys()].filter(id => !detailIndex.map.has(id)).sort((a,b)=>a-b);
  const identityMismatches = [];
  const releaseMismatches = [];
  const malformedDetailIds = [];
  const malformedListIds = [];
  const fullRecords = [];

  let normalCount = 0;
  let spCount = 0;
  let normalTier3Count = 0;
  let secondStageTrue = 0;
  let secondStageFalse = 0;

  for (const soldierId of canonicalIds) {
    const d = detailIndex.map.get(soldierId);
    const l = listIndex.map.get(soldierId);
    const r = releaseIndex.map.get(soldierId);
    if (!l || !r) continue;

    const detailIdentity = identityFromDetail(d);
    const listIdentity = identityFromList(l);
    if (!sameJson(detailIdentity, listIdentity)) identityMismatches.push(soldierId);
    const { soldierId: _releaseId, ...releaseOnly } = r;
    if (!sameJson(l.release ?? null, releaseOnly)) releaseMismatches.push(soldierId);

    if (!d.identity || !d.combat || !d.ability || !d.training || !d.heroes || !Array.isArray(d.heroes.finalHeroIds)) {
      malformedDetailIds.push(soldierId);
    }
    if (!Number.isInteger(l.soldierId) || typeof l.sortBucket !== 'string' || !l.release || typeof l.release.releaseStatus !== 'string') {
      malformedListIds.push(soldierId);
    }

    if (detailIdentity.isSp) {
      spCount += 1;
      if (d.sp?.secondStageUnlock === true) secondStageTrue += 1;
      else secondStageFalse += 1;
    } else {
      normalCount += 1;
      if (detailIdentity.tier === 3) normalTier3Count += 1;
    }

    fullRecords.push({
      soldierId,
      identity: d.identity,
      combat: d.combat,
      ability: d.ability,
      training: d.training,
      heroes: d.heroes,
      sp: d.sp,
      release: l.release,
      sortBucket: l.sortBucket,
    });
  }

  const baselineMismatches = [];
  const checksAgainstExpected = {
    canonicalSoldiers: canonicalIds.length,
    normalSoldiers: normalCount,
    spSoldiers: spCount,
    normalTier3: normalTier3Count,
    spSecondStageTrue: secondStageTrue,
    spSecondStageFalse: secondStageFalse,
  };
  for (const [key, actual] of Object.entries(checksAgainstExpected)) {
    const exp = expected[key];
    if (Number.isInteger(exp) && actual !== exp) baselineMismatches.push(`${key}=${actual}/${exp}`);
  }
  if (Number.isInteger(expected.relationBySoldierKeys)) {
    const heroMembershipKeyCount = fullRecords.filter(r => Array.isArray(r.heroes?.finalHeroIds)).length;
    if (heroMembershipKeyCount !== expected.relationBySoldierKeys) baselineMismatches.push(`relationBySoldierKeys=${heroMembershipKeyCount}/${expected.relationBySoldierKeys}`);
  }
  if (fullRecords.length !== canonicalIds.length) baselineMismatches.push(`fullRecords=${fullRecords.length}/${canonicalIds.length}`);

  if (missingListIds.length) errors.push(`${missingListIds.length} canonical Soldiers are missing from Stage 5-8 list`);
  if (missingReleaseIds.length) errors.push(`${missingReleaseIds.length} canonical Soldiers are missing release metadata records`);
  if (extraListIds.length) errors.push(`${extraListIds.length} Stage 5-8 list records are absent from canonical detail`);
  if (extraReleaseIds.length) errors.push(`${extraReleaseIds.length} release metadata records are absent from canonical detail`);
  if (identityMismatches.length) errors.push(`${identityMismatches.length} detail/list identity projections differ`);
  if (releaseMismatches.length) errors.push(`${releaseMismatches.length} list/release metadata projections differ`);
  if (malformedDetailIds.length) errors.push(`${malformedDetailIds.length} full-detail records are structurally incomplete`);
  if (malformedListIds.length) errors.push(`${malformedListIds.length} list records are structurally incomplete`);
  if (baselineMismatches.length) errors.push(`${baselineMismatches.length} Stage 6-0 expected coverage values do not match generated records`);

  const inheritedReviews = Array.isArray(checkpoint.knownReviews) ? checkpoint.knownReviews : [];
  for (const review of inheritedReviews) {
    const count = Number.isInteger(review?.count) ? ` (${review.count})` : '';
    reviews.push(`Inherited ${review?.code ?? 'REVIEW'}${count}: ${review?.rule ?? ''}`);
  }

  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = new Date().toISOString();
  const sources = {
    checkpoint: { path: paths.checkpoint, gitBlobSha: gitBlobSha(paths.checkpoint) },
    detail: { path: paths.detail, gitBlobSha: gitBlobSha(paths.detail) },
    detailValidation: { path: paths.detailValidation, gitBlobSha: gitBlobSha(paths.detailValidation) },
    list: { path: paths.list, gitBlobSha: gitBlobSha(paths.list) },
    listValidation: { path: paths.listValidation, gitBlobSha: gitBlobSha(paths.listValidation) },
    releaseMetadata: { path: paths.releaseMetadata, gitBlobSha: gitBlobSha(paths.releaseMetadata) },
  };

  const output = {
    version: 1,
    schemaId: 'soldier-stage6-1-full-records/v1',
    stage: '6-1',
    status,
    generatedAt,
    purpose: 'QA input bundle: one complete record per canonical displayable Soldier, composed only from frozen Stage 5 outputs.',
    ownership: 'Canonical identity, combat, ability, training, Hero membership and SP semantics remain owned by Stage 5/shared relation outputs; Stage 6-1 only composes them with frozen release metadata.',
    sources,
    summary: {
      recordCount: fullRecords.length,
      normalCount,
      spCount,
      normalTier3Count,
      secondStageTrue,
      secondStageFalse,
      inheritedReviewCount: inheritedReviews.length,
    },
    records: fullRecords,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage6-1-full-records-validation/v1',
    stage: '6-1',
    status,
    generatedAt,
    sources,
    checks: {
      checkpointNotPass: checkpoint.status === 'PASS' ? 0 : 1,
      detailNotPass: detail.status === 'PASS' ? 0 : 1,
      detailValidationNotPass: detailValidation.status === 'PASS' ? 0 : 1,
      listNotPass: list.status === 'PASS' ? 0 : 1,
      listValidationNotPass: listValidation.status === 'PASS' ? 0 : 1,
      releaseMetadataNotPass: releaseMetadata.status === 'PASS' ? 0 : 1,
      duplicateDetailIds: detailIndex.duplicates.length,
      invalidDetailIds: detailIndex.invalid.length,
      duplicateListIds: listIndex.duplicates.length,
      invalidListIds: listIndex.invalid.length,
      duplicateReleaseIds: releaseIndex.duplicates.length,
      invalidReleaseIds: releaseIndex.invalid.length,
      missingListIds: missingListIds.length,
      missingReleaseIds: missingReleaseIds.length,
      extraListIds: extraListIds.length,
      extraReleaseIds: extraReleaseIds.length,
      identityMismatches: identityMismatches.length,
      releaseMismatches: releaseMismatches.length,
      malformedDetailIds: malformedDetailIds.length,
      malformedListIds: malformedListIds.length,
      baselineMismatches: baselineMismatches.length,
      outputRecordCountMismatch: fullRecords.length === canonicalIds.length ? 0 : 1,
    },
    coverage: {
      canonicalSoldiers: canonicalIds.length,
      generatedRecords: fullRecords.length,
      normalCount,
      spCount,
      normalTier3Count,
      secondStageTrue,
      secondStageFalse,
      missingListIds,
      missingReleaseIds,
      extraListIds,
      extraReleaseIds,
      identityMismatches,
      releaseMismatches,
      malformedDetailIds,
      malformedListIds,
      baselineMismatches,
    },
    errors,
    reviews,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);
  console.log(`Soldier Stage 6-1: ${status}`);
  console.log(`Full records: ${fullRecords.length}/${canonicalIds.length}`);
  console.log(`Normal/SP: ${normalCount}/${spCount}; normal tier3: ${normalTier3Count}`);
  console.log(`SP second stage true/false: ${secondStageTrue}/${secondStageFalse}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();