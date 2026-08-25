const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
  identityContract: 'data/contracts/soldier-identity-contract.v1.json',
  stage5_6: 'data/generated/soldier-detail-stage5-6.v1.json',
  stage5_6Validation: 'data/validation/soldier-stage5-6-sp-detail.v1.json',
  output: 'data/generated/soldier-list-stage5-7.v1.json',
  validation: 'data/validation/soldier-stage5-7-list.v1.json',
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
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function main() {
  const contract = loadJson(paths.contract);
  const identityContract = loadJson(paths.identityContract);
  const stage5_6 = loadJson(paths.stage5_6);
  const stage5_6Validation = loadJson(paths.stage5_6Validation);
  const sourceRecords = Array.isArray(stage5_6.records) ? stage5_6.records : [];
  const sourceIndex = indexByInteger(sourceRecords, 'soldierId');

  const errors = [];
  const reviews = [];

  if (contract.status !== 'FROZEN') errors.push(`Stage 5-1 contract must be FROZEN, got ${contract.status}`);
  if (contract.schemaId !== 'soldier-detail-contract/v1') errors.push(`Unexpected Stage 5-1 schemaId: ${contract.schemaId}`);
  if (identityContract.status !== 'FROZEN') errors.push(`Soldier identity contract must be FROZEN, got ${identityContract.status}`);
  if (stage5_6.status !== 'PASS') errors.push(`Stage 5-6 artifact must be PASS, got ${stage5_6.status}`);
  if (stage5_6Validation.status !== 'PASS') errors.push(`Stage 5-6 validation must be PASS, got ${stage5_6Validation.status}`);
  if (sourceIndex.invalid.length) errors.push(`Stage 5-6 contains ${sourceIndex.invalid.length} invalid soldierId values`);
  if (sourceIndex.duplicates.length) errors.push(`Duplicate Stage 5-6 Soldier IDs: ${sourceIndex.duplicates.join(', ')}`);

  const expectedFields = [
    'soldierId', 'siteId', 'nameKr', 'nameCn', 'nameKrStatus', 'tier',
    'armyId', 'armyType', 'uiGroup', 'isSp', 'normalSoldierId',
    'spSoldierId', 'validationStatus'
  ];
  const records = [];
  const projectionMismatches = [];
  const malformedRows = [];
  const siteIdMismatches = [];
  const duplicateSiteIds = [];
  const unexpectedFields = [];
  const seenSiteIds = new Map();

  let normalCount = 0;
  let spCount = 0;
  let nullNameKrCount = 0;
  let nonPassIdentityMetadataCount = 0;

  const soldierIds = [...sourceIndex.map.keys()].sort((a,b)=>a-b);
  for (const soldierId of soldierIds) {
    const source = sourceIndex.map.get(soldierId);
    const identity = source?.identity ?? {};
    const row = {
      soldierId,
      siteId: identity.siteId ?? null,
      nameKr: identity.nameKr ?? null,
      nameCn: identity.nameCn ?? null,
      nameKrStatus: identity.nameKrStatus ?? null,
      tier: identity.tier ?? null,
      armyId: identity.armyId ?? null,
      armyType: identity.armyType ?? null,
      uiGroup: identity.uiGroup ?? null,
      isSp: identity.isSp === true,
      normalSoldierId: identity.normalSoldierId ?? null,
      spSoldierId: identity.spSoldierId ?? null,
      validationStatus: identity.validationStatus ?? null,
    };

    const expectedProjection = {
      soldierId: source.soldierId,
      siteId: identity.siteId ?? null,
      nameKr: identity.nameKr ?? null,
      nameCn: identity.nameCn ?? null,
      nameKrStatus: identity.nameKrStatus ?? null,
      tier: identity.tier ?? null,
      armyId: identity.armyId ?? null,
      armyType: identity.armyType ?? null,
      uiGroup: identity.uiGroup ?? null,
      isSp: identity.isSp === true,
      normalSoldierId: identity.normalSoldierId ?? null,
      spSoldierId: identity.spSoldierId ?? null,
      validationStatus: identity.validationStatus ?? null,
    };
    if (!same(row, expectedProjection)) projectionMismatches.push(soldierId);

    const fields = Object.keys(row);
    if (!same(fields, expectedFields)) unexpectedFields.push(soldierId);

    const valid = Number.isInteger(row.soldierId)
      && typeof row.siteId === 'string'
      && (typeof row.nameKr === 'string' || row.nameKr === null)
      && typeof row.nameCn === 'string'
      && (typeof row.nameKrStatus === 'string' || row.nameKrStatus === null)
      && Number.isInteger(row.tier)
      && Number.isInteger(row.armyId)
      && typeof row.armyType === 'string'
      && typeof row.uiGroup === 'string'
      && typeof row.isSp === 'boolean'
      && (Number.isInteger(row.normalSoldierId) || row.normalSoldierId === null)
      && (Number.isInteger(row.spSoldierId) || row.spSoldierId === null)
      && typeof row.validationStatus === 'string';
    if (!valid) malformedRows.push(soldierId);

    const expectedSiteId = `soldier-${soldierId}`;
    if (row.siteId !== expectedSiteId) siteIdMismatches.push(soldierId);
    if (seenSiteIds.has(row.siteId)) duplicateSiteIds.push(soldierId);
    else seenSiteIds.set(row.siteId, soldierId);

    if (row.isSp) spCount += 1; else normalCount += 1;
    if (row.nameKr === null) nullNameKrCount += 1;
    if (row.validationStatus !== 'PASS') nonPassIdentityMetadataCount += 1;
    records.push(row);
  }

  const expectedRecordCount = contract?.output?.currentBaselineRecordCount;
  const expectedNormal = contract?.baseline?.normalSoldiers;
  const expectedSp = contract?.baseline?.spSoldiers;
  if (Number.isInteger(expectedRecordCount) && records.length !== expectedRecordCount) errors.push(`List record count mismatch: output=${records.length} contract=${expectedRecordCount}`);
  if (Number.isInteger(expectedNormal) && normalCount !== expectedNormal) errors.push(`Normal list count mismatch: output=${normalCount} contract=${expectedNormal}`);
  if (Number.isInteger(expectedSp) && spCount !== expectedSp) errors.push(`SP list count mismatch: output=${spCount} contract=${expectedSp}`);
  if (projectionMismatches.length) errors.push(`${projectionMismatches.length} list rows differ from their Stage 5-6 canonical identity projection`);
  if (malformedRows.length) errors.push(`${malformedRows.length} list rows have malformed required fields`);
  if (siteIdMismatches.length) errors.push(`${siteIdMismatches.length} list rows violate the frozen siteId = soldier-<soldierId> contract`);
  if (duplicateSiteIds.length) errors.push(`${duplicateSiteIds.length} list rows contain duplicate siteId values`);
  if (unexpectedFields.length) errors.push(`${unexpectedFields.length} list rows do not match the frozen compact field set`);

  const sourceSorted = sourceRecords.every((record, index) => index === 0 || record.soldierId > sourceRecords[index - 1].soldierId);
  const outputSorted = records.every((record, index) => index === 0 || record.soldierId > records[index - 1].soldierId);
  if (!outputSorted) errors.push('Stage 5-7 output is not in deterministic soldierId-ascending technical order');

  if (nonPassIdentityMetadataCount) {
    reviews.push(`${nonPassIdentityMetadataCount} list rows retain non-PASS identity/presentation metadata from the canonical detail source; Stage 5-7 does not rewrite it.`);
  }
  if (nullNameKrCount) {
    reviews.push(`${nullNameKrCount} list rows have nameKr=null and preserve nameCn/nameKrStatus for later presentation handling.`);
  }
  reviews.push('Representative icon/image identifiers are intentionally not populated because Stage 5-7 has no frozen canonical asset-identifier source.');
  reviews.push('Release order is intentionally not attached; Stage 5-7 uses soldierId ascending only as deterministic technical order, never as release order.');

  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = stage5_6.generatedAt ?? stage5_6Validation.generatedAt ?? null;
  const sources = {
    contract: { path: paths.contract, gitBlobSha: gitBlobSha(paths.contract) },
    identityContract: { path: paths.identityContract, gitBlobSha: gitBlobSha(paths.identityContract) },
    stage5_6: { path: paths.stage5_6, gitBlobSha: gitBlobSha(paths.stage5_6) },
    stage5_6Validation: { path: paths.stage5_6Validation, gitBlobSha: gitBlobSha(paths.stage5_6Validation) },
  };

  const output = {
    version: 1,
    schemaId: 'soldier-list/v1',
    stage: '5-7',
    status,
    generatedAt,
    technicalOrder: 'soldierId-ascending; deterministic only, not release order',
    ownership: 'Derived only from Stage 5-6 canonical Soldier detail identity; this file is not a second Soldier master.',
    representativeAssetIdentifierStatus: 'NOT_ATTACHED_NO_FROZEN_SOURCE',
    releaseMetadataStatus: 'PENDING_STAGE_5_8',
    sources,
    summary: {
      recordCount: records.length,
      normalCount,
      spCount,
      nullNameKrCount,
      nonPassIdentityMetadataCount,
    },
    records,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage5-7-list-validation/v1',
    stage: '5-7',
    status,
    generatedAt,
    sources,
    checks: {
      contractNotFrozen: contract.status === 'FROZEN' ? 0 : 1,
      identityContractNotFrozen: identityContract.status === 'FROZEN' ? 0 : 1,
      stage5_6NotPass: stage5_6.status === 'PASS' ? 0 : 1,
      stage5_6ValidationNotPass: stage5_6Validation.status === 'PASS' ? 0 : 1,
      duplicateStage5Ids: sourceIndex.duplicates.length,
      invalidStage5Ids: sourceIndex.invalid.length,
      projectionMismatches: projectionMismatches.length,
      malformedRows: malformedRows.length,
      siteIdMismatches: siteIdMismatches.length,
      duplicateSiteIds: duplicateSiteIds.length,
      unexpectedFields: unexpectedFields.length,
      outputOrderMismatch: outputSorted ? 0 : 1,
      recordCountMismatch: Number.isInteger(expectedRecordCount) && records.length !== expectedRecordCount ? 1 : 0,
      normalCountMismatch: Number.isInteger(expectedNormal) && normalCount !== expectedNormal ? 1 : 0,
      spCountMismatch: Number.isInteger(expectedSp) && spCount !== expectedSp ? 1 : 0,
    },
    coverage: {
      canonicalSoldiers: sourceRecords.length,
      generatedRecords: records.length,
      normalCount,
      spCount,
      nullNameKrCount,
      nonPassIdentityMetadataCount,
      sourceAlreadySoldierIdAscending: sourceSorted,
      outputSoldierIdAscending: outputSorted,
      projectionMismatches,
      malformedRows,
      siteIdMismatches,
      duplicateSiteIds,
      unexpectedFields,
    },
    errors,
    reviews,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);
  console.log(`Soldier Stage 5-7: ${status}`);
  console.log(`Records: ${records.length}; normal/SP: ${normalCount}/${spCount}`);
  console.log(`Null Korean names: ${nullNameKrCount}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
