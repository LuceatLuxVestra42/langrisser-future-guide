const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
  stage5_7: 'data/generated/soldier-list-stage5-7.v1.json',
  stage5_7Validation: 'data/validation/soldier-stage5-7-list.v1.json',
  releaseSource: 'data/soldier-release-source.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  listOutput: 'data/generated/soldier-list-stage5-8.v1.json',
  validation: 'data/validation/soldier-stage5-8-release.v1.json',
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
function isoDateFromExcelSerial(serial) {
  if (!Number.isInteger(serial)) return null;
  const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}
function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
}
function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function sortedUniqueIntegers(values) {
  return Array.isArray(values)
    && values.every((v, i) => Number.isInteger(v) && (i === 0 || v > values[i - 1]));
}
function identityProjection(record) {
  return {
    soldierId: record.soldierId,
    siteId: record.siteId,
    nameKr: record.nameKr,
    nameCn: record.nameCn,
    nameKrStatus: record.nameKrStatus,
    tier: record.tier,
    armyId: record.armyId,
    armyType: record.armyType,
    uiGroup: record.uiGroup,
    isSp: record.isSp,
    normalSoldierId: record.normalSoldierId,
    spSoldierId: record.spSoldierId,
    validationStatus: record.validationStatus,
  };
}

function main() {
  const contract = loadJson(paths.contract);
  const stage5_7 = loadJson(paths.stage5_7);
  const stage5_7Validation = loadJson(paths.stage5_7Validation);
  const releaseSource = loadJson(paths.releaseSource);

  const listRecords = Array.isArray(stage5_7.records) ? stage5_7.records : [];
  const confirmedRecords = Array.isArray(releaseSource.confirmedRecords) ? releaseSource.confirmedRecords : [];
  const listIndex = indexByInteger(listRecords, 'soldierId');
  const sourceIndex = indexByInteger(confirmedRecords, 'soldierId');
  const errors = [];
  const reviews = [];

  if (contract.status !== 'FROZEN') errors.push(`Stage 5-1 contract must be FROZEN, got ${contract.status}`);
  if (contract.schemaId !== 'soldier-detail-contract/v1') errors.push(`Unexpected Stage 5-1 schemaId: ${contract.schemaId}`);
  if (stage5_7.status !== 'PASS') errors.push(`Stage 5-7 list must be PASS, got ${stage5_7.status}`);
  if (stage5_7Validation.status !== 'PASS') errors.push(`Stage 5-7 validation must be PASS, got ${stage5_7Validation.status}`);
  if (releaseSource.status !== 'FROZEN_PARTIAL') errors.push(`Release source must be FROZEN_PARTIAL, got ${releaseSource.status}`);
  if (releaseSource.schemaId !== 'soldier-release-source/v1') errors.push(`Unexpected release source schemaId: ${releaseSource.schemaId}`);
  if (listIndex.invalid.length) errors.push(`Stage 5-7 has ${listIndex.invalid.length} invalid soldierId values`);
  if (listIndex.duplicates.length) errors.push(`Stage 5-7 duplicate Soldier IDs: ${listIndex.duplicates.join(', ')}`);
  if (sourceIndex.invalid.length) errors.push(`Release source has ${sourceIndex.invalid.length} invalid soldierId values`);
  if (sourceIndex.duplicates.length) errors.push(`Release source duplicate Soldier IDs: ${sourceIndex.duplicates.join(', ')}`);

  const dateSerialMismatches = [];
  const dateCells = Array.isArray(releaseSource?.externalSource?.dateCells) ? releaseSource.externalSource.dateCells : [];
  const sourceDates = new Set();
  for (const cell of dateCells) {
    const derived = isoDateFromExcelSerial(cell?.serial);
    if (!Number.isInteger(cell?.row) || !isIsoDate(cell?.releaseDate) || derived !== cell.releaseDate) {
      dateSerialMismatches.push({ row: cell?.row ?? null, serial: cell?.serial ?? null, declared: cell?.releaseDate ?? null, derived });
    } else {
      sourceDates.add(cell.releaseDate);
    }
  }

  const unknownSourceIds = [];
  const nonTier3OrSpSourceIds = [];
  const sourceNameMismatches = [];
  const sourceDateErrors = [];
  const sourcePatchMismatches = [];
  const samePatchOrderPopulated = [];
  const malformedSourceRows = [];

  for (const source of confirmedRecords) {
    const base = listIndex.map.get(source.soldierId);
    if (!base) { unknownSourceIds.push(source.soldierId); continue; }
    if (base.isSp === true || base.tier !== 3) nonTier3OrSpSourceIds.push(source.soldierId);
    if (source.expectedNameKr !== base.nameKr) sourceNameMismatches.push(source.soldierId);
    if (!isIsoDate(source.releaseDate) || !sourceDates.has(source.releaseDate)) sourceDateErrors.push(source.soldierId);
    if (source.patchGroup !== source.releaseDate) sourcePatchMismatches.push(source.soldierId);
    if (source.samePatchOrder !== null) samePatchOrderPopulated.push(source.soldierId);
    if (!Array.isArray(source.sourceRows) || source.sourceRows.length < 2 || !source.sourceRows.every(Number.isInteger)) malformedSourceRows.push(source.soldierId);
  }

  if (dateSerialMismatches.length) errors.push(`${dateSerialMismatches.length} external date-cell serial mappings are inconsistent`);
  if (unknownSourceIds.length) errors.push(`${unknownSourceIds.length} release-source Soldier IDs are absent from Stage 5-7`);
  if (nonTier3OrSpSourceIds.length) errors.push(`${nonTier3OrSpSourceIds.length} release-source records are not normal tier-3 Soldiers`);
  if (sourceNameMismatches.length) errors.push(`${sourceNameMismatches.length} frozen review names no longer match canonical Stage 5-7 names`);
  if (sourceDateErrors.length) errors.push(`${sourceDateErrors.length} release-source dates are invalid or not backed by a frozen date cell`);
  if (sourcePatchMismatches.length) errors.push(`${sourcePatchMismatches.length} patchGroup values differ from releaseDate`);
  if (samePatchOrderPopulated.length) errors.push(`${samePatchOrderPopulated.length} records invent same-patch ordering`);
  if (malformedSourceRows.length) errors.push(`${malformedSourceRows.length} release-source records have malformed sourceRows evidence`);

  const canonicalIds = [...listIndex.map.keys()].sort((a,b)=>a-b);
  const releaseRecords = [];
  const outputRecords = [];
  const spSoldierIds = [];
  const normalTier3UnresolvedSoldierIds = [];
  const lowerTierSoldierIds = [];
  const confirmedGroups = new Map();

  let normalCount = 0;
  let spCount = 0;
  let normalTier3Count = 0;
  let confirmedCount = 0;
  let unresolvedCount = 0;
  let lowerTierCount = 0;

  for (const soldierId of canonicalIds) {
    const base = listIndex.map.get(soldierId);
    const source = sourceIndex.map.get(soldierId) ?? null;
    if (base.isSp) spCount += 1; else normalCount += 1;
    if (!base.isSp && base.tier === 3) normalTier3Count += 1;
    if (!base.isSp && base.tier !== 3) lowerTierCount += 1;

    const release = source ? {
      releaseStatus: 'CONFIRMED',
      releaseDate: source.releaseDate,
      patchGroup: source.patchGroup,
      samePatchOrder: null,
      sourceKind: releaseSource.externalSource.kind,
      sourceLabel: source.sourceLabel,
      sourceRows: [...source.sourceRows],
      mappingStatus: source.mappingStatus,
    } : {
      releaseStatus: 'UNRESOLVED',
      releaseDate: null,
      patchGroup: null,
      samePatchOrder: null,
      sourceKind: null,
      sourceLabel: null,
      sourceRows: null,
      mappingStatus: null,
    };

    let sortBucket;
    if (base.isSp) {
      sortBucket = 'SP';
      spSoldierIds.push(soldierId);
    } else if (base.tier === 3 && source) {
      sortBucket = 'NORMAL_TIER3_CONFIRMED_RELEASE';
      const group = confirmedGroups.get(source.releaseDate) ?? [];
      group.push(soldierId);
      confirmedGroups.set(source.releaseDate, group);
    } else if (base.tier === 3) {
      sortBucket = 'NORMAL_TIER3_UNRESOLVED';
      normalTier3UnresolvedSoldierIds.push(soldierId);
    } else {
      sortBucket = 'LOWER_TIER_TECHNICAL';
      lowerTierSoldierIds.push(soldierId);
    }

    if (source) confirmedCount += 1; else unresolvedCount += 1;
    releaseRecords.push({ soldierId, ...release });
    outputRecords.push({ ...identityProjection(base), release, sortBucket });
  }

  const normalTier3ConfirmedReleaseGroups = [...confirmedGroups.entries()]
    .sort(([a],[b]) => b.localeCompare(a))
    .map(([releaseDate, soldierIds]) => ({
      releaseDate,
      soldierIds: [...soldierIds].sort((a,b)=>a-b),
      samePatchOrderStatus: 'UNRESOLVED',
      internalOrder: 'soldierId-ascending-for-determinism-only',
    }));

  const identityMutation = [];
  const releaseProjectionMismatch = [];
  for (const out of outputRecords) {
    const base = listIndex.map.get(out.soldierId);
    if (!sameJson(identityProjection(out), identityProjection(base))) identityMutation.push(out.soldierId);
    const meta = releaseRecords.find((r) => r.soldierId === out.soldierId);
    const outRelease = { soldierId: out.soldierId, ...out.release };
    if (!sameJson(meta, outRelease)) releaseProjectionMismatch.push(out.soldierId);
  }

  const baselineMismatches = [];
  const expect = {
    canonical: contract?.baseline?.displayableSoldiers,
    normal: contract?.baseline?.normalSoldiers,
    sp: contract?.baseline?.spSoldiers,
    normalTier3: contract?.baseline?.normalTier3,
    confirmed: releaseSource?.coveragePolicy?.confirmedRecordCount,
  };
  if (Number.isInteger(expect.canonical) && canonicalIds.length !== expect.canonical) baselineMismatches.push(`canonical=${canonicalIds.length}/${expect.canonical}`);
  if (Number.isInteger(expect.normal) && normalCount !== expect.normal) baselineMismatches.push(`normal=${normalCount}/${expect.normal}`);
  if (Number.isInteger(expect.sp) && spCount !== expect.sp) baselineMismatches.push(`sp=${spCount}/${expect.sp}`);
  if (Number.isInteger(expect.normalTier3) && normalTier3Count !== expect.normalTier3) baselineMismatches.push(`normalTier3=${normalTier3Count}/${expect.normalTier3}`);
  if (Number.isInteger(expect.confirmed) && confirmedCount !== expect.confirmed) baselineMismatches.push(`confirmed=${confirmedCount}/${expect.confirmed}`);
  if (normalTier3UnresolvedSoldierIds.length !== normalTier3Count - confirmedCount) baselineMismatches.push('normalTier3 unresolved count inconsistent');
  if (lowerTierSoldierIds.length !== lowerTierCount) baselineMismatches.push('lower-tier bucket count inconsistent');
  if (spSoldierIds.length !== spCount) baselineMismatches.push('SP bucket count inconsistent');
  if (confirmedCount + unresolvedCount !== canonicalIds.length) baselineMismatches.push('confirmed+unresolved != canonical');
  if (!sortedUniqueIntegers(spSoldierIds) || !sortedUniqueIntegers(normalTier3UnresolvedSoldierIds) || !sortedUniqueIntegers(lowerTierSoldierIds)) baselineMismatches.push('technical bucket IDs are not sorted unique integers');

  if (identityMutation.length) errors.push(`${identityMutation.length} Stage 5-7 identity projections were mutated`);
  if (releaseProjectionMismatch.length) errors.push(`${releaseProjectionMismatch.length} list release blocks differ from release-metadata records`);
  if (baselineMismatches.length) errors.push(`${baselineMismatches.length} Stage 5-8 baseline counts are inconsistent`);
  if (releaseRecords.length !== listRecords.length || outputRecords.length !== listRecords.length) errors.push('Stage 5-8 output record count mismatch');

  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = stage5_7.generatedAt ?? null;
  const sources = {
    contract: { path: paths.contract, gitBlobSha: gitBlobSha(paths.contract) },
    stage5_7: { path: paths.stage5_7, gitBlobSha: gitBlobSha(paths.stage5_7) },
    stage5_7Validation: { path: paths.stage5_7Validation, gitBlobSha: gitBlobSha(paths.stage5_7Validation) },
    releaseSource: { path: paths.releaseSource, gitBlobSha: gitBlobSha(paths.releaseSource) },
    externalReleaseSource: releaseSource.externalSource,
  };

  if (normalTier3UnresolvedSoldierIds.length) reviews.push(`${normalTier3UnresolvedSoldierIds.length} normal tier-3 Soldiers have no externally confirmed release date in the frozen Stage 5-8 source.`);
  reviews.push(`${spCount} SP Soldiers are grouped before normal Soldiers by UI policy; their internal release order remains unresolved because the available SP sheet identifies Soldiers by images rather than canonical IDs.`);
  reviews.push(`${lowerTierCount} normal tier-1/tier-2 Soldiers remain in a technical bucket because release ordering is not required for the current list policy.`);
  const nonPassIdentityMetadataCount = listRecords.filter(r => r.validationStatus && r.validationStatus !== 'PASS').length;
  if (nonPassIdentityMetadataCount) reviews.push(`${nonPassIdentityMetadataCount} list rows retain non-PASS identity/presentation metadata from Stage 5-7.`);
  reviews.push('Same-patch order is intentionally unresolved; no Soldier-ID ordering is presented as release ordering.');

  const releaseMetadata = {
    version: 1,
    schemaId: 'soldier-release-metadata/v1',
    stage: '5-8',
    status,
    generatedAt,
    releaseCoverageStatus: 'PARTIAL_CONFIRMED_WITH_UNRESOLVED_REVIEW',
    policy: {
      spGroupFirst: true,
      normalTier3ConfirmedRelease: 'releaseDate-descending-between-confirmed-patch-groups',
      samePatchOrder: 'UNRESOLVED',
      normalTier3Unresolved: 'SEPARATE_TECHNICAL_BUCKET',
      lowerTier: 'SEPARATE_TECHNICAL_BUCKET',
      soldierIdIsReleaseOrder: false,
    },
    sources,
    summary: {
      canonicalSoldiers: canonicalIds.length,
      confirmedReleaseRecords: confirmedCount,
      unresolvedReleaseRecords: unresolvedCount,
      normalTier3Confirmed: confirmedCount,
      normalTier3Unresolved: normalTier3UnresolvedSoldierIds.length,
      spSoldiers: spCount,
      lowerTierNormal: lowerTierCount,
    },
    records: releaseRecords,
  };

  const listOutput = {
    version: 1,
    schemaId: 'soldier-list-release/v1',
    stage: '5-8',
    status,
    generatedAt,
    ownership: 'Identity is projected unchanged from Stage 5-7. Release metadata is a separate external layer keyed only by soldierId.',
    releaseCoverageStatus: 'PARTIAL_CONFIRMED_WITH_UNRESOLVED_REVIEW',
    technicalStorageOrder: 'soldierId-ascending; never release order',
    displayOrderPolicy: {
      bucketOrder: ['SP','NORMAL_TIER3_CONFIRMED_RELEASE','NORMAL_TIER3_UNRESOLVED','LOWER_TIER_TECHNICAL'],
      confirmedPatchGroupOrder: 'releaseDate-descending',
      samePatchOrder: 'UNRESOLVED',
      unresolvedBucketOrder: 'soldierId-ascending-for-determinism-only',
    },
    sources,
    summary: {
      recordCount: outputRecords.length,
      normalCount,
      spCount,
      normalTier3Count,
      confirmedReleaseCount: confirmedCount,
      unresolvedNormalTier3Count: normalTier3UnresolvedSoldierIds.length,
      lowerTierCount,
      nonPassIdentityMetadataCount,
    },
    sortBuckets: {
      spSoldierIds,
      normalTier3ConfirmedReleaseGroups,
      normalTier3UnresolvedSoldierIds,
      lowerTierSoldierIds,
    },
    records: outputRecords,
  };

  const checks = {
    contractNotFrozen: contract.status === 'FROZEN' ? 0 : 1,
    stage5_7NotPass: stage5_7.status === 'PASS' ? 0 : 1,
    stage5_7ValidationNotPass: stage5_7Validation.status === 'PASS' ? 0 : 1,
    releaseSourceNotFrozenPartial: releaseSource.status === 'FROZEN_PARTIAL' ? 0 : 1,
    duplicateStage5Ids: listIndex.duplicates.length,
    invalidStage5Ids: listIndex.invalid.length,
    duplicateReleaseSourceIds: sourceIndex.duplicates.length,
    invalidReleaseSourceIds: sourceIndex.invalid.length,
    dateSerialMismatches: dateSerialMismatches.length,
    unknownSourceIds: unknownSourceIds.length,
    nonTier3OrSpSourceIds: nonTier3OrSpSourceIds.length,
    sourceNameMismatches: sourceNameMismatches.length,
    sourceDateErrors: sourceDateErrors.length,
    sourcePatchMismatches: sourcePatchMismatches.length,
    samePatchOrderPopulated: samePatchOrderPopulated.length,
    malformedSourceRows: malformedSourceRows.length,
    identityMutation: identityMutation.length,
    releaseProjectionMismatch: releaseProjectionMismatch.length,
    baselineMismatches: baselineMismatches.length,
    outputRecordCountMismatch: releaseRecords.length === listRecords.length && outputRecords.length === listRecords.length ? 0 : 1,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage5-8-release-validation/v1',
    stage: '5-8',
    status,
    generatedAt,
    sources,
    checks,
    coverage: {
      canonicalSoldiers: canonicalIds.length,
      normalCount,
      spCount,
      normalTier3Count,
      confirmedReleaseCount: confirmedCount,
      unresolvedReleaseCount: unresolvedCount,
      unresolvedNormalTier3Count: normalTier3UnresolvedSoldierIds.length,
      lowerTierCount,
      patchGroups: normalTier3ConfirmedReleaseGroups.map(g => ({ releaseDate: g.releaseDate, count: g.soldierIds.length, soldierIds: g.soldierIds })),
      nonPassIdentityMetadataCount,
      unknownSourceIds,
      nonTier3OrSpSourceIds,
      sourceNameMismatches,
      sourceDateErrors,
      samePatchOrderPopulated,
      identityMutation,
      releaseProjectionMismatch,
      baselineMismatches,
    },
    errors,
    reviews,
  };

  writeJson(paths.releaseMetadata, releaseMetadata);
  writeJson(paths.listOutput, listOutput);
  writeJson(paths.validation, validation);
  console.log(`Soldier Stage 5-8: ${status}`);
  console.log(`Records: ${outputRecords.length}/${listRecords.length}`);
  console.log(`Release confirmed/unresolved: ${confirmedCount}/${unresolvedCount}`);
  console.log(`Normal tier3 confirmed/unresolved: ${confirmedCount}/${normalTier3UnresolvedSoldierIds.length}`);
  console.log(`SP/lower-tier: ${spCount}/${lowerTierCount}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
