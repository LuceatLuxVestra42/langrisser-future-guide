const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
  stage5_5: 'data/generated/soldier-detail-stage5-5.v1.json',
  stage5_5Validation: 'data/validation/soldier-stage5-5-heroes.v1.json',
  soldierStage3: 'data/generated/soldier-stage3.v1.json',
  stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
  output: 'data/generated/soldier-detail-stage5-6.v1.json',
  validation: 'data/validation/soldier-stage5-6-sp-detail.v1.json',
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
function deepClone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function isSortedUniqueIntegers(values) {
  if (!Array.isArray(values)) return false;
  return values.every((value, index) => Number.isInteger(value) && (index === 0 || value > values[index - 1]));
}
function validStatDelta(delta) {
  if (!delta || typeof delta !== 'object') return false;
  return ['hp','atk','def','mdef','move','range'].every((key) => typeof delta[key] === 'number' && Number.isFinite(delta[key]));
}
function missionType(mission) {
  return Number.isInteger(mission?.missionType) ? mission.missionType : null;
}
function canonicalJson(value) { return JSON.stringify(value); }

function main() {
  const contract = loadJson(paths.contract);
  const stage5_5 = loadJson(paths.stage5_5);
  const stage5_5Validation = loadJson(paths.stage5_5Validation);
  const soldierStage3 = loadJson(paths.soldierStage3);
  const stage3Validation = loadJson(paths.stage3Validation);

  const stage5Records = Array.isArray(stage5_5.records) ? stage5_5.records : [];
  const spRelations = Array.isArray(soldierStage3.spRelations) ? soldierStage3.spRelations : [];
  const stage5Index = indexByInteger(stage5Records, 'soldierId');
  const spRelationIndex = indexByInteger(spRelations, 'spSoldierId');
  const errors = [];
  const reviews = [];

  if (contract.status !== 'FROZEN') errors.push(`Stage 5-1 contract must be FROZEN, got ${contract.status}`);
  if (contract.schemaId !== 'soldier-detail-contract/v1') errors.push(`Unexpected Stage 5-1 schemaId: ${contract.schemaId}`);
  if (stage5_5.status !== 'PASS') errors.push(`Stage 5-5 artifact must be PASS, got ${stage5_5.status}`);
  if (stage5_5Validation.status !== 'PASS') errors.push(`Stage 5-5 validation must be PASS, got ${stage5_5Validation.status}`);
  if (soldierStage3.status !== 'PASS') errors.push(`Soldier Stage3 artifact must be PASS, got ${soldierStage3.status}`);
  if (stage3Validation.status !== 'PASS') errors.push(`Soldier Stage3 validation must be PASS, got ${stage3Validation.status}`);
  if (stage5Index.invalid.length) errors.push(`Stage 5-5 contains ${stage5Index.invalid.length} invalid soldierId values`);
  if (stage5Index.duplicates.length) errors.push(`Duplicate Stage 5-5 Soldier IDs: ${stage5Index.duplicates.join(', ')}`);
  if (spRelationIndex.invalid.length) errors.push(`Stage3 SP relations contain ${spRelationIndex.invalid.length} invalid spSoldierId values`);
  if (spRelationIndex.duplicates.length) errors.push(`Duplicate Stage3 SP relation IDs: ${spRelationIndex.duplicates.join(', ')}`);

  const records = [];
  const missingSpRelations = [];
  const extraSpRelations = [];
  const relationIdMismatches = [];
  const descriptionPreservationMismatches = [];
  const invalidStatDeltas = [];
  const malformedStage1 = [];
  const malformedStage2 = [];
  const falseStage2Leak = [];
  const expandedHeroMismatches = [];
  const nonSpWithSpDetail = [];
  const missionTypeMismatches = [];

  let spCount = 0;
  let secondStageTrue = 0;
  let secondStageFalse = 0;
  let stage1MissionCount = 0;
  let stage2MissionCount = 0;
  const missionTypeCounts = new Map();

  const canonicalIds = [...stage5Index.map.keys()].sort((a,b)=>a-b);
  const canonicalSpIds = canonicalIds.filter((id) => stage5Index.map.get(id)?.identity?.isSp === true);
  const canonicalSpSet = new Set(canonicalSpIds);
  for (const spId of spRelationIndex.map.keys()) if (!canonicalSpSet.has(spId)) extraSpRelations.push(spId);

  for (const soldierId of canonicalIds) {
    const base = stage5Index.map.get(soldierId);
    const isSp = base?.identity?.isSp === true;

    if (!isSp) {
      if (base.sp !== null) nonSpWithSpDetail.push(soldierId);
      records.push({
        soldierId,
        identity: base.identity,
        combat: base.combat,
        ability: base.ability,
        training: base.training,
        heroes: base.heroes,
        sp: null,
      });
      continue;
    }

    spCount += 1;
    const relation = spRelationIndex.map.get(soldierId);
    if (!relation) {
      missingSpRelations.push(soldierId);
      records.push({ ...base });
      continue;
    }

    const previousSp = base.sp;
    const normalSoldierId = relation.normalSoldierId;
    const spSoldierId = relation.spSoldierId;
    if (!Number.isInteger(normalSoldierId)
      || spSoldierId !== soldierId
      || base?.identity?.normalSoldierId !== normalSoldierId
      || (base?.identity?.spSoldierId !== null && base?.identity?.spSoldierId !== spSoldierId)
      || previousSp?.normalSoldierId !== normalSoldierId
      || previousSp?.spSoldierId !== spSoldierId) {
      relationIdMismatches.push(soldierId);
    }

    const descriptionLevels = deepClone(previousSp?.descriptionLevels ?? []);
    const finalDescription = previousSp?.finalDescription ?? null;
    if (!Array.isArray(descriptionLevels)
      || descriptionLevels.length !== 10
      || !descriptionLevels.every((level, index) => level?.level === index + 1 && typeof level?.description === 'string' && level.description.length > 0)
      || typeof finalDescription !== 'string'
      || finalDescription.length === 0) {
      descriptionPreservationMismatches.push(soldierId);
    }

    const statDelta = deepClone(relation.statDelta);
    if (!validStatDelta(statDelta)) invalidStatDeltas.push(soldierId);

    const stage1 = deepClone(relation.firstStage);
    const stage1Missions = Array.isArray(stage1?.missions) ? stage1.missions : [];
    const stage1Types = stage1Missions.map(missionType).sort((a,b)=>a-b);
    const stage1Valid = stage1
      && Number.isInteger(stage1.awakenLevelId)
      && Array.isArray(stage1.awakenMaterials)
      && stage1Missions.length === 2
      && stage1Missions.every((mission) => Number.isInteger(mission?.missionId) && mission?.missing !== true)
      && canonicalJson(stage1Types) === canonicalJson([73,123]);
    if (!stage1Valid) malformedStage1.push(soldierId);
    stage1MissionCount += stage1Missions.length;
    for (const mission of stage1Missions) {
      const type = missionType(mission);
      if (Number.isInteger(type)) missionTypeCounts.set(type, (missionTypeCounts.get(type) ?? 0) + 1);
      if (type === 73 && !Array.isArray(mission.submitItems)) missionTypeMismatches.push(soldierId);
    }

    const secondStageUnlock = relation.secondStageUnlock === true;
    let stage2 = null;
    let expandedHeroIds = [];
    if (secondStageUnlock) {
      secondStageTrue += 1;
      stage2 = deepClone(relation.secondStage);
      const stage2Missions = Array.isArray(stage2?.missions) ? stage2.missions : [];
      expandedHeroIds = Array.isArray(stage2?.expandHeroIds) ? [...stage2.expandHeroIds] : [];
      const stage2Valid = stage2
        && Number.isInteger(stage2.awakenLevelId)
        && Array.isArray(stage2.awakenMaterials)
        && stage2Missions.length === 1
        && missionType(stage2Missions[0]) === 124
        && Number.isInteger(stage2Missions[0]?.missionId)
        && stage2Missions[0]?.missing !== true
        && isSortedUniqueIntegers(expandedHeroIds);
      if (!stage2Valid) malformedStage2.push(soldierId);
      stage2MissionCount += stage2Missions.length;
      for (const mission of stage2Missions) {
        const type = missionType(mission);
        if (Number.isInteger(type)) missionTypeCounts.set(type, (missionTypeCounts.get(type) ?? 0) + 1);
      }
    } else {
      secondStageFalse += 1;
      if (relation.secondStage !== null) falseStage2Leak.push(soldierId);
      if (Array.isArray(relation?.rawSecondStage?.missionIds) && relation.rawSecondStage.missionIds.length) falseStage2Leak.push(soldierId);
      if (Array.isArray(relation?.rawSecondStage?.expandHeroIds) && relation.rawSecondStage.expandHeroIds.length) falseStage2Leak.push(soldierId);
    }

    if (secondStageUnlock && canonicalJson(expandedHeroIds) !== canonicalJson(stage2?.expandHeroIds ?? [])) {
      expandedHeroMismatches.push(soldierId);
    }

    const sp = {
      normalSoldierId,
      spSoldierId,
      statDelta,
      descriptionLevels,
      finalDescription,
      stage1,
      secondStageUnlock,
      stage2,
      expandedHeroIds,
    };

    records.push({
      soldierId,
      identity: base.identity,
      combat: base.combat,
      ability: base.ability,
      training: base.training,
      heroes: base.heroes,
      sp,
    });
  }

  if (missingSpRelations.length) errors.push(`${missingSpRelations.length} SP Soldiers are missing Stage3 spRelations`);
  if (extraSpRelations.length) errors.push(`${extraSpRelations.length} Stage3 SP relations point to non-canonical SP Soldiers`);
  if (relationIdMismatches.length) errors.push(`${relationIdMismatches.length} SP relation identity links mismatch Stage 5 identity/description records`);
  if (descriptionPreservationMismatches.length) errors.push(`${descriptionPreservationMismatches.length} SP description blocks are incomplete before Stage 5-6`);
  if (invalidStatDeltas.length) errors.push(`${invalidStatDeltas.length} SP statDelta blocks are malformed`);
  if (malformedStage1.length) errors.push(`${malformedStage1.length} SP stage1 blocks are malformed`);
  if (malformedStage2.length) errors.push(`${malformedStage2.length} unlocked SP stage2 blocks are malformed`);
  if (falseStage2Leak.length) errors.push(`${[...new Set(falseStage2Leak)].length} one-stage SP Soldiers expose forbidden second-stage content`);
  if (expandedHeroMismatches.length) errors.push(`${expandedHeroMismatches.length} SP expandedHeroIds differ from stage2.expandHeroIds`);
  if (nonSpWithSpDetail.length) errors.push(`${nonSpWithSpDetail.length} normal Soldiers unexpectedly contain SP detail`);
  if (missionTypeMismatches.length) errors.push(`${[...new Set(missionTypeMismatches)].length} SP submit-item missions are missing decoded submitItems`);

  const expectedSp = contract?.baseline?.spSoldiers;
  const expectedTrue = contract?.baseline?.spSecondStageTrue;
  const expectedFalse = contract?.baseline?.spSecondStageFalse;
  const expectedStage3True = stage3Validation?.counts?.secondStageTrue;
  const expectedStage3False = stage3Validation?.counts?.secondStageFalse;
  const expectedMissionTypes = stage3Validation?.counts?.spMissionTypes ?? {};
  const baselineMismatches = [];
  if (Number.isInteger(expectedSp) && spCount !== expectedSp) baselineMismatches.push(`SP count actual=${spCount} contract=${expectedSp}`);
  if (Number.isInteger(expectedTrue) && secondStageTrue !== expectedTrue) baselineMismatches.push(`stage2 true actual=${secondStageTrue} contract=${expectedTrue}`);
  if (Number.isInteger(expectedFalse) && secondStageFalse !== expectedFalse) baselineMismatches.push(`stage2 false actual=${secondStageFalse} contract=${expectedFalse}`);
  if (Number.isInteger(expectedStage3True) && secondStageTrue !== expectedStage3True) baselineMismatches.push(`stage2 true actual=${secondStageTrue} stage3=${expectedStage3True}`);
  if (Number.isInteger(expectedStage3False) && secondStageFalse !== expectedStage3False) baselineMismatches.push(`stage2 false actual=${secondStageFalse} stage3=${expectedStage3False}`);
  for (const [type, expected] of Object.entries(expectedMissionTypes)) {
    if (Number.isInteger(expected) && (missionTypeCounts.get(Number(type)) ?? 0) !== expected) {
      baselineMismatches.push(`mission type ${type} actual=${missionTypeCounts.get(Number(type)) ?? 0} stage3=${expected}`);
    }
  }
  if (records.length !== stage5Records.length) baselineMismatches.push(`record count actual=${records.length} stage5-5=${stage5Records.length}`);
  if (spRelationIndex.map.size !== spCount) baselineMismatches.push(`SP relation count=${spRelationIndex.map.size} SP records=${spCount}`);
  if (baselineMismatches.length) errors.push(`Stage 5-6 baseline mismatch: ${baselineMismatches.join('; ')}`);

  const nonPassIdentityMetadataCount = records.filter(
    (record) => record.identity?.validationStatus && record.identity.validationStatus !== 'PASS',
  ).length;
  if (nonPassIdentityMetadataCount) {
    reviews.push(`${nonPassIdentityMetadataCount} Soldier identity records retain non-PASS presentation metadata; SP source projection is unaffected.`);
  }

  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = soldierStage3.generatedAt ?? stage5_5.generatedAt ?? stage3Validation.generatedAt ?? null;
  const sources = {
    contract: { path: paths.contract, gitBlobSha: gitBlobSha(paths.contract) },
    stage5_5: { path: paths.stage5_5, gitBlobSha: gitBlobSha(paths.stage5_5) },
    stage5_5Validation: { path: paths.stage5_5Validation, gitBlobSha: gitBlobSha(paths.stage5_5Validation) },
    soldierStage3: { path: paths.soldierStage3, gitBlobSha: gitBlobSha(paths.soldierStage3) },
    stage3Validation: { path: paths.stage3Validation, gitBlobSha: gitBlobSha(paths.stage3Validation) },
  };

  const output = {
    version: 1,
    schemaId: 'soldier-detail-sp/v1',
    stage: '5-6',
    status,
    generatedAt,
    technicalOrder: 'soldierId-ascending; not release order',
    completedSections: ['identity','combat','ability','training','heroes','sp'],
    pendingSections: ['list','releaseMetadata'],
    spOwnership: 'SP descriptions are preserved from Stage 5-3; stage/comparison data is projected only from validated Stage3 spRelations. statDelta is comparison-only and never replaces SP combat values.',
    sources,
    summary: {
      recordCount: records.length,
      spCount,
      secondStageTrue,
      secondStageFalse,
      stage1MissionCount,
      stage2MissionCount,
      missionTypeCounts: Object.fromEntries([...missionTypeCounts.entries()].sort((a,b)=>a[0]-b[0])),
      nonPassIdentityMetadataCount,
    },
    records,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage5-6-sp-detail-validation/v1',
    stage: '5-6',
    status,
    generatedAt,
    sources,
    checks: {
      contractNotFrozen: contract.status === 'FROZEN' ? 0 : 1,
      stage5_5NotPass: stage5_5.status === 'PASS' ? 0 : 1,
      stage5_5ValidationNotPass: stage5_5Validation.status === 'PASS' ? 0 : 1,
      stage3NotPass: soldierStage3.status === 'PASS' ? 0 : 1,
      stage3ValidationNotPass: stage3Validation.status === 'PASS' ? 0 : 1,
      duplicateStage5Ids: stage5Index.duplicates.length,
      invalidStage5Ids: stage5Index.invalid.length,
      duplicateSpRelations: spRelationIndex.duplicates.length,
      invalidSpRelations: spRelationIndex.invalid.length,
      missingSpRelations: missingSpRelations.length,
      extraSpRelations: extraSpRelations.length,
      relationIdMismatches: relationIdMismatches.length,
      descriptionPreservationMismatches: descriptionPreservationMismatches.length,
      invalidStatDeltas: invalidStatDeltas.length,
      malformedStage1: malformedStage1.length,
      malformedStage2: malformedStage2.length,
      falseStage2Leak: [...new Set(falseStage2Leak)].length,
      expandedHeroMismatches: expandedHeroMismatches.length,
      nonSpWithSpDetail: nonSpWithSpDetail.length,
      missionTypeMismatches: [...new Set(missionTypeMismatches)].length,
      baselineMismatches: baselineMismatches.length,
      outputRecordCountMismatch: records.length === stage5Records.length ? 0 : 1,
    },
    coverage: {
      canonicalSoldiers: canonicalIds.length,
      generatedRecords: records.length,
      spSoldiers: spCount,
      spRelations: spRelationIndex.map.size,
      secondStageTrue,
      secondStageFalse,
      stage1MissionCount,
      stage2MissionCount,
      missionTypeCounts: Object.fromEntries([...missionTypeCounts.entries()].sort((a,b)=>a[0]-b[0])),
      nonPassIdentityMetadataCount,
      missingSpRelations,
      extraSpRelations,
      relationIdMismatches,
      descriptionPreservationMismatches,
      invalidStatDeltas,
      malformedStage1,
      malformedStage2,
      falseStage2Leak: [...new Set(falseStage2Leak)],
      expandedHeroMismatches,
      nonSpWithSpDetail,
      missionTypeMismatches: [...new Set(missionTypeMismatches)],
    },
    errors,
    reviews,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);
  console.log(`Soldier Stage 5-6: ${status}`);
  console.log(`Records: ${records.length}/${stage5Records.length}`);
  console.log(`SP: ${spCount}; second stage true/false: ${secondStageTrue}/${secondStageFalse}`);
  console.log(`Missions stage1/stage2: ${stage1MissionCount}/${stage2MissionCount}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
