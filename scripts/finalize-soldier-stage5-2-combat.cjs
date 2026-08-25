const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

const paths = {
  contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
  soldierMaster: 'data/generated/soldier-master.v1.json',
  soldierStage3: 'data/generated/soldier-stage3.v1.json',
  stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
  stage4Baseline: 'data/validation/soldier-stage4-8-baseline.v1.json',
  output: 'data/generated/soldier-detail-stage5-2.v1.json',
  validation: 'data/validation/soldier-stage5-2-combat.v1.json',
};

function abs(relativePath) {
  return path.join(rootDir, relativePath);
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  const filePath = abs(relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function gitBlobSha(relativePath) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${relativePath}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function uniqueSortedIntegers(values) {
  return [...new Set(values.filter(Number.isInteger))].sort((a, b) => a - b);
}

function indexRecords(records, key) {
  const map = new Map();
  const duplicates = [];
  const invalid = [];

  for (const record of records) {
    const id = record?.[key];
    if (!Number.isInteger(id)) {
      invalid.push(id ?? null);
      continue;
    }
    if (map.has(id)) duplicates.push(id);
    else map.set(id, record);
  }

  return {
    map,
    duplicates: uniqueSortedIntegers(duplicates),
    invalid,
  };
}

function nullableInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function projectIdentity(record) {
  return {
    siteId: record.siteId ?? null,
    nameKr: record.nameKr ?? null,
    nameCn: record.nameCn ?? null,
    nameKrStatus: record.nameKrStatus ?? null,
    tier: Number.isInteger(record.tier) ? record.tier : null,
    armyId: Number.isInteger(record.armyId) ? record.armyId : null,
    armyType: record.armyType ?? null,
    uiGroup: record.uiGroup ?? null,
    isSp: record.isSp === true,
    normalSoldierId: nullableInteger(record.normalSoldierId),
    spSoldierId: nullableInteger(record.spSoldierId),
    validationStatus: record.validationStatus ?? null,
  };
}

function projectCombat(record) {
  return {
    hp: record?.stats?.hp ?? null,
    atk: record?.stats?.atk ?? null,
    def: record?.stats?.def ?? null,
    mdef: record?.stats?.mdef ?? null,
    move: record?.stats?.move ?? null,
    range: record?.stats?.range ?? null,
    isMelee: record?.combat?.isMelee ?? null,
    moveType: record?.combat?.moveType ?? null,
  };
}

function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sameValue(a, b) {
  return a === b;
}

function main() {
  const contract = loadJson(paths.contract);
  const soldierMaster = loadJson(paths.soldierMaster);
  const soldierStage3 = loadJson(paths.soldierStage3);
  const stage3Validation = loadJson(paths.stage3Validation);
  const stage4Baseline = loadJson(paths.stage4Baseline);

  const masterRecords = Array.isArray(soldierMaster.records) ? soldierMaster.records : [];
  const stage3Records = Array.isArray(soldierStage3.records) ? soldierStage3.records : [];
  const masterIndex = indexRecords(masterRecords, 'soldierId');
  const stage3Index = indexRecords(stage3Records, 'soldierId');

  const errors = [];
  const reviews = [];

  if (contract.status !== 'FROZEN') {
    errors.push(`Stage 5-1 contract must be FROZEN, got ${contract.status}`);
  }
  if (contract.schemaId !== 'soldier-detail-contract/v1') {
    errors.push(`Unexpected Stage 5-1 schemaId: ${contract.schemaId}`);
  }
  if (soldierStage3.status !== 'PASS') {
    errors.push(`Soldier Stage3 generated artifact must be PASS, got ${soldierStage3.status}`);
  }
  if (stage3Validation.status !== 'PASS') {
    errors.push(`Soldier Stage3 validation must be PASS, got ${stage3Validation.status}`);
  }
  if (stage4Baseline.status !== 'PASS') {
    errors.push(`Soldier Stage4 baseline must be PASS, got ${stage4Baseline.status}`);
  }
  if (masterIndex.invalid.length) {
    errors.push(`Soldier Master contains ${masterIndex.invalid.length} invalid soldierId values`);
  }
  if (stage3Index.invalid.length) {
    errors.push(`Soldier Stage3 contains ${stage3Index.invalid.length} invalid soldierId values`);
  }
  if (masterIndex.duplicates.length) {
    errors.push(`Duplicate Soldier Master IDs: ${masterIndex.duplicates.join(', ')}`);
  }
  if (stage3Index.duplicates.length) {
    errors.push(`Duplicate Soldier Stage3 IDs: ${stage3Index.duplicates.join(', ')}`);
  }

  const masterIds = [...masterIndex.map.keys()].sort((a, b) => a - b);
  const stage3Ids = [...stage3Index.map.keys()].sort((a, b) => a - b);
  const masterIdSet = new Set(masterIds);
  const stage3IdSet = new Set(stage3Ids);
  const missingStage3Ids = masterIds.filter((id) => !stage3IdSet.has(id));
  const extraStage3Ids = stage3Ids.filter((id) => !masterIdSet.has(id));

  if (missingStage3Ids.length) {
    errors.push(`Canonical Soldiers missing Stage3 combat records: ${missingStage3Ids.join(', ')}`);
  }
  if (extraStage3Ids.length) {
    errors.push(`Stage3 has non-canonical Soldier records: ${extraStage3Ids.join(', ')}`);
  }

  const identityTierMismatches = [];
  const identityArmyMismatches = [];
  const invalidCombatSoldierIds = [];
  const spRecordSourceMismatches = [];
  const records = [];

  for (const soldierId of masterIds) {
    const master = masterIndex.map.get(soldierId);
    const stage3 = stage3Index.map.get(soldierId);
    if (!stage3) continue;

    if (!sameValue(master.tier, stage3?.combat?.tier)) {
      identityTierMismatches.push(soldierId);
    }
    if (!sameValue(master.armyId, stage3?.combat?.armyId)) {
      identityArmyMismatches.push(soldierId);
    }

    const combat = projectCombat(stage3);
    const numericFields = [combat.hp, combat.atk, combat.def, combat.mdef, combat.move, combat.range, combat.moveType];
    const combatValid = numericFields.every(validNumber) && typeof combat.isMelee === 'boolean';
    if (!combatValid) invalidCombatSoldierIds.push(soldierId);

    if (master.isSp === true) {
      const relation = stage3.spRelation;
      if (!relation || relation.spSoldierId !== soldierId) {
        spRecordSourceMismatches.push(soldierId);
      }
    }

    records.push({
      soldierId,
      identity: projectIdentity(master),
      combat,
    });
  }

  if (identityTierMismatches.length) {
    errors.push(`Master/Stage3 tier mismatch for ${identityTierMismatches.length} Soldiers`);
  }
  if (identityArmyMismatches.length) {
    errors.push(`Master/Stage3 armyId mismatch for ${identityArmyMismatches.length} Soldiers`);
  }
  if (invalidCombatSoldierIds.length) {
    errors.push(`Invalid combat values for ${invalidCombatSoldierIds.length} Soldiers`);
  }
  if (spRecordSourceMismatches.length) {
    errors.push(`SP Stage3 relation does not identify the current SP record for ${spRecordSourceMismatches.length} Soldiers`);
  }

  const normalCount = records.filter((record) => !record.identity.isSp).length;
  const spCount = records.filter((record) => record.identity.isSp).length;
  const normalTier3Count = records.filter((record) => !record.identity.isSp && record.identity.tier === 3).length;
  const nonPassIdentityMetadataCount = records.filter(
    (record) => record.identity.validationStatus && record.identity.validationStatus !== 'PASS',
  ).length;

  const expected = contract.baseline ?? {};
  const stage4Counts = stage4Baseline.counts ?? {};

  const baselineMismatches = [];
  const baselineChecks = [
    ['displayableSoldiers', records.length, expected.displayableSoldiers, stage4Counts.displayableSoldiers],
    ['normalSoldiers', normalCount, expected.normalSoldiers, stage4Counts.normalSoldiers],
    ['spSoldiers', spCount, expected.spSoldiers, stage4Counts.spSoldiers],
    ['normalTier3', normalTier3Count, expected.normalTier3, stage4Counts.tier3Normal],
  ];

  for (const [name, actual, contractExpected, stage4Expected] of baselineChecks) {
    if (Number.isInteger(contractExpected) && actual !== contractExpected) {
      baselineMismatches.push(`${name}: actual=${actual} contract=${contractExpected}`);
    }
    if (Number.isInteger(stage4Expected) && actual !== stage4Expected) {
      baselineMismatches.push(`${name}: actual=${actual} stage4=${stage4Expected}`);
    }
  }

  if (baselineMismatches.length) {
    errors.push(`Stage 5-2 baseline mismatch: ${baselineMismatches.join('; ')}`);
  }

  if (nonPassIdentityMetadataCount) {
    reviews.push(
      `${nonPassIdentityMetadataCount} Soldier identity records retain non-PASS presentation metadata; this does not alter Stage 5-2 combat values.`,
    );
  }

  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = soldierStage3.generatedAt ?? stage3Validation.generatedAt ?? stage4Baseline.generatedAt ?? null;

  const sources = {
    contract: { path: paths.contract, gitBlobSha: gitBlobSha(paths.contract) },
    soldierMaster: { path: paths.soldierMaster, gitBlobSha: gitBlobSha(paths.soldierMaster) },
    soldierStage3: { path: paths.soldierStage3, gitBlobSha: gitBlobSha(paths.soldierStage3) },
    stage3Validation: { path: paths.stage3Validation, gitBlobSha: gitBlobSha(paths.stage3Validation) },
    stage4Baseline: { path: paths.stage4Baseline, gitBlobSha: gitBlobSha(paths.stage4Baseline) },
  };

  const output = {
    version: 1,
    schemaId: 'soldier-detail-combat/v1',
    stage: '5-2',
    status,
    generatedAt,
    technicalOrder: 'soldierId-ascending; not release order',
    completedSections: ['identity', 'combat'],
    pendingSections: ['ability', 'training', 'heroes', 'sp', 'list', 'releaseMetadata'],
    sources,
    summary: {
      recordCount: records.length,
      normalCount,
      spCount,
      normalTier3Count,
      nonPassIdentityMetadataCount,
    },
    records,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage5-2-combat-validation/v1',
    stage: '5-2',
    status,
    generatedAt,
    sources,
    checks: {
      contractNotFrozen: contract.status === 'FROZEN' ? 0 : 1,
      stage3ArtifactNotPass: soldierStage3.status === 'PASS' ? 0 : 1,
      stage3ValidationNotPass: stage3Validation.status === 'PASS' ? 0 : 1,
      stage4BaselineNotPass: stage4Baseline.status === 'PASS' ? 0 : 1,
      duplicateMasterIds: masterIndex.duplicates.length,
      duplicateStage3Ids: stage3Index.duplicates.length,
      invalidMasterIds: masterIndex.invalid.length,
      invalidStage3Ids: stage3Index.invalid.length,
      missingStage3Records: missingStage3Ids.length,
      extraStage3Records: extraStage3Ids.length,
      tierMismatches: identityTierMismatches.length,
      armyIdMismatches: identityArmyMismatches.length,
      invalidCombatRecords: invalidCombatSoldierIds.length,
      spRecordSourceMismatches: spRecordSourceMismatches.length,
      baselineMismatches: baselineMismatches.length,
      outputRecordCountMismatch: records.length === masterIds.length ? 0 : 1,
    },
    coverage: {
      canonicalSoldiers: masterIds.length,
      generatedRecords: records.length,
      normalSoldiers: normalCount,
      spSoldiers: spCount,
      normalTier3: normalTier3Count,
      nonPassIdentityMetadataCount,
      missingStage3Ids,
      extraStage3Ids,
      identityTierMismatches,
      identityArmyMismatches,
      invalidCombatSoldierIds,
      spRecordSourceMismatches,
    },
    errors,
    reviews,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  console.log(`Soldier Stage 5-2: ${status}`);
  console.log(`Records: ${records.length}/${masterIds.length}`);
  console.log(`Normal/SP: ${normalCount}/${spCount}`);
  console.log(`Normal tier3: ${normalTier3Count}`);
  console.log(`Invalid combat records: ${invalidCombatSoldierIds.length}`);

  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
