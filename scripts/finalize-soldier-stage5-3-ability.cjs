const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

const paths = {
  contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
  stage5_2: 'data/generated/soldier-detail-stage5-2.v1.json',
  stage5_2Validation: 'data/validation/soldier-stage5-2-combat.v1.json',
  soldierStage3: 'data/generated/soldier-stage3.v1.json',
  stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
  output: 'data/generated/soldier-detail-stage5-3.v1.json',
  validation: 'data/validation/soldier-stage5-3-ability.v1.json',
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

function indexByInteger(records, key) {
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
  return { map, duplicates: [...new Set(duplicates)].sort((a, b) => a - b), invalid };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function projectAbility(primaryTech) {
  if (!primaryTech) {
    return { techId: null, levels: [], finalDescription: null };
  }

  const levels = primaryTech.levels.map((level, index) => ({
    level: Number.isInteger(level.sequenceLevel) ? level.sequenceLevel : index + 1,
    levelInfoId: Number.isInteger(level.levelInfoId) ? level.levelInfoId : null,
    description: level.description ?? null,
    soldierSkillLevel: Number.isInteger(level.soldierSkillLevel) ? level.soldierSkillLevel : null,
    soldierSkillId: Number.isInteger(level.soldierSkillId) ? level.soldierSkillId : null,
  }));

  const finalDescription = levels.length ? levels[levels.length - 1].description : null;
  return { techId: primaryTech.techId, levels, finalDescription };
}

function projectSpDescription(stage3Record, trainingProfileBySoldier) {
  const relation = stage3Record?.spRelation;
  if (!relation) return null;

  const normalProfile = trainingProfileBySoldier.get(relation.normalSoldierId);
  const techId = normalProfile?.primaryTenLevelTechId;
  const primaryTech = Number.isInteger(techId)
    ? normalProfile.linkedTechs.find((tech) => tech.techId === techId)
    : null;

  const descriptionLevels = primaryTech
    ? primaryTech.levels.map((level, index) => ({
        level: Number.isInteger(level.sequenceLevel) ? level.sequenceLevel : index + 1,
        levelInfoId: Number.isInteger(level.levelInfoId) ? level.levelInfoId : null,
        description: level.spDescription ?? null,
      }))
    : [];

  const nonEmptyDescriptions = descriptionLevels.filter((level) => isNonEmptyString(level.description));
  const finalDescription = nonEmptyDescriptions.length
    ? nonEmptyDescriptions[nonEmptyDescriptions.length - 1].description
    : null;

  return {
    normalSoldierId: relation.normalSoldierId,
    spSoldierId: relation.spSoldierId,
    descriptionSourceTechId: Number.isInteger(techId) ? techId : null,
    descriptionLevels,
    finalDescription,
  };
}

function main() {
  const contract = loadJson(paths.contract);
  const stage5_2 = loadJson(paths.stage5_2);
  const stage5_2Validation = loadJson(paths.stage5_2Validation);
  const soldierStage3 = loadJson(paths.soldierStage3);
  const stage3Validation = loadJson(paths.stage3Validation);

  const stage5Records = Array.isArray(stage5_2.records) ? stage5_2.records : [];
  const stage3Records = Array.isArray(soldierStage3.records) ? soldierStage3.records : [];
  const trainingProfiles = Array.isArray(soldierStage3.trainingProfiles) ? soldierStage3.trainingProfiles : [];

  const stage5Index = indexByInteger(stage5Records, 'soldierId');
  const stage3Index = indexByInteger(stage3Records, 'soldierId');
  const trainingIndex = indexByInteger(trainingProfiles, 'soldierId');

  const errors = [];
  const reviews = [];

  if (contract.status !== 'FROZEN') errors.push(`Stage 5-1 contract must be FROZEN, got ${contract.status}`);
  if (contract.schemaId !== 'soldier-detail-contract/v1') errors.push(`Unexpected Stage 5-1 schemaId: ${contract.schemaId}`);
  if (stage5_2.status !== 'PASS') errors.push(`Stage 5-2 artifact must be PASS, got ${stage5_2.status}`);
  if (stage5_2Validation.status !== 'PASS') errors.push(`Stage 5-2 validation must be PASS, got ${stage5_2Validation.status}`);
  if (soldierStage3.status !== 'PASS') errors.push(`Soldier Stage3 artifact must be PASS, got ${soldierStage3.status}`);
  if (stage3Validation.status !== 'PASS') errors.push(`Soldier Stage3 validation must be PASS, got ${stage3Validation.status}`);

  if (stage5Index.invalid.length) errors.push(`Stage 5-2 contains ${stage5Index.invalid.length} invalid soldierId values`);
  if (stage3Index.invalid.length) errors.push(`Stage3 contains ${stage3Index.invalid.length} invalid soldierId values`);
  if (trainingIndex.invalid.length) errors.push(`Training profiles contain ${trainingIndex.invalid.length} invalid soldierId values`);
  if (stage5Index.duplicates.length) errors.push(`Duplicate Stage 5-2 Soldier IDs: ${stage5Index.duplicates.join(', ')}`);
  if (stage3Index.duplicates.length) errors.push(`Duplicate Stage3 Soldier IDs: ${stage3Index.duplicates.join(', ')}`);
  if (trainingIndex.duplicates.length) errors.push(`Duplicate training profile Soldier IDs: ${trainingIndex.duplicates.join(', ')}`);

  const expectedTier3 = stage3Validation?.counts?.tier3Normal;
  const expectedWithoutTenLevel = stage3Validation?.counts?.tier3WithoutTenLevel;
  const expectedMultipleTenLevel = stage3Validation?.counts?.tier3MultipleTenLevel;
  const expectedSpDescriptionMissing = stage3Validation?.counts?.spNormalsWithoutSpDescription;

  if (expectedWithoutTenLevel !== 0) errors.push(`Stage3 reports tier3WithoutTenLevel=${expectedWithoutTenLevel}`);
  if (expectedMultipleTenLevel !== 0) errors.push(`Stage3 reports tier3MultipleTenLevel=${expectedMultipleTenLevel}`);
  if (expectedSpDescriptionMissing !== 0) errors.push(`Stage3 reports spNormalsWithoutSpDescription=${expectedSpDescriptionMissing}`);

  const records = [];
  const missingTrainingProfiles = [];
  const missingPrimaryTech = [];
  const malformedTenLevelPaths = [];
  const normalDescriptionMissing = [];
  const nonTargetAbilityPopulated = [];
  const spDescriptionSourceMissing = [];
  const spDescriptionEmpty = [];
  const spDescriptionRelationMismatch = [];

  let abilityPopulatedCount = 0;
  let spDescriptionRecordCount = 0;

  const soldierIds = [...stage5Index.map.keys()].sort((a, b) => a - b);

  for (const soldierId of soldierIds) {
    const base = stage5Index.map.get(soldierId);
    const stage3 = stage3Index.map.get(soldierId);
    if (!stage3) {
      errors.push(`Stage 5-2 Soldier ${soldierId} missing from Stage3`);
      continue;
    }

    const isNormalTier3 = base?.identity?.isSp !== true && base?.identity?.tier === 3;
    let ability = { techId: null, levels: [], finalDescription: null };

    if (isNormalTier3) {
      const profile = trainingIndex.map.get(soldierId);
      if (!profile) {
        missingTrainingProfiles.push(soldierId);
      } else {
        const techId = profile.primaryTenLevelTechId;
        const primaryTech = Number.isInteger(techId)
          ? profile.linkedTechs.find((tech) => tech.techId === techId)
          : null;

        if (!primaryTech) {
          missingPrimaryTech.push(soldierId);
        } else {
          ability = projectAbility(primaryTech);
          abilityPopulatedCount += 1;

          const validSequence = ability.levels.length === 10 && ability.levels.every((level, index) =>
            level.level === index + 1 && level.soldierSkillLevel === index + 1 && Number.isInteger(level.levelInfoId),
          );
          if (!validSequence) malformedTenLevelPaths.push(soldierId);

          if (ability.levels.some((level) => !isNonEmptyString(level.description)) || !isNonEmptyString(ability.finalDescription)) {
            normalDescriptionMissing.push(soldierId);
          }
        }
      }
    }

    if (!isNormalTier3 && (ability.techId !== null || ability.levels.length !== 0 || ability.finalDescription !== null)) {
      nonTargetAbilityPopulated.push(soldierId);
    }

    let sp = null;
    if (base?.identity?.isSp === true) {
      sp = projectSpDescription(stage3, trainingIndex.map);
      if (!sp) {
        spDescriptionSourceMissing.push(soldierId);
      } else {
        spDescriptionRecordCount += 1;
        if (sp.spSoldierId !== soldierId || sp.normalSoldierId !== stage3?.spRelation?.normalSoldierId) {
          spDescriptionRelationMismatch.push(soldierId);
        }
        if (sp.descriptionLevels.length !== 10 || !isNonEmptyString(sp.finalDescription)) {
          spDescriptionEmpty.push(soldierId);
        }
      }
    }

    records.push({
      soldierId,
      identity: base.identity,
      combat: base.combat,
      ability,
      sp,
    });
  }

  if (missingTrainingProfiles.length) errors.push(`${missingTrainingProfiles.length} normal tier-3 Soldiers are missing training profiles`);
  if (missingPrimaryTech.length) errors.push(`${missingPrimaryTech.length} normal tier-3 Soldiers are missing the validated primary Lv1-10 TrainingTech`);
  if (malformedTenLevelPaths.length) errors.push(`${malformedTenLevelPaths.length} normal tier-3 ability paths are not exact Lv1-10 sequences`);
  if (normalDescriptionMissing.length) errors.push(`${normalDescriptionMissing.length} normal tier-3 ability paths have missing descriptions`);
  if (nonTargetAbilityPopulated.length) errors.push(`${nonTargetAbilityPopulated.length} non-target Soldiers unexpectedly received normal ability data`);
  if (spDescriptionSourceMissing.length) errors.push(`${spDescriptionSourceMissing.length} SP Soldiers are missing normal-form TrainingTech description sources`);
  if (spDescriptionEmpty.length) errors.push(`${spDescriptionEmpty.length} SP Soldiers do not expose a complete description-level source or final description`);
  if (spDescriptionRelationMismatch.length) errors.push(`${spDescriptionRelationMismatch.length} SP description records have relation mismatches`);

  const normalTier3Count = records.filter((record) => record.identity?.isSp !== true && record.identity?.tier === 3).length;
  const normalNonTier3Count = records.filter((record) => record.identity?.isSp !== true && record.identity?.tier !== 3).length;
  const spCount = records.filter((record) => record.identity?.isSp === true).length;

  const baselineMismatches = [];
  if (Number.isInteger(expectedTier3) && normalTier3Count !== expectedTier3) {
    baselineMismatches.push(`normalTier3 actual=${normalTier3Count} expected=${expectedTier3}`);
  }
  if (Number.isInteger(contract?.baseline?.normalTier3) && normalTier3Count !== contract.baseline.normalTier3) {
    baselineMismatches.push(`contract normalTier3 actual=${normalTier3Count} expected=${contract.baseline.normalTier3}`);
  }
  if (Number.isInteger(contract?.baseline?.spSoldiers) && spCount !== contract.baseline.spSoldiers) {
    baselineMismatches.push(`SP count actual=${spCount} expected=${contract.baseline.spSoldiers}`);
  }
  if (abilityPopulatedCount !== normalTier3Count) {
    baselineMismatches.push(`ability populated=${abilityPopulatedCount} normalTier3=${normalTier3Count}`);
  }
  if (spDescriptionRecordCount !== spCount) {
    baselineMismatches.push(`SP description records=${spDescriptionRecordCount} SP=${spCount}`);
  }
  if (records.length !== stage5Records.length) {
    baselineMismatches.push(`record count actual=${records.length} stage5-2=${stage5Records.length}`);
  }
  if (baselineMismatches.length) errors.push(`Stage 5-3 baseline mismatch: ${baselineMismatches.join('; ')}`);

  const nonPassIdentityMetadataCount = records.filter(
    (record) => record.identity?.validationStatus && record.identity.validationStatus !== 'PASS',
  ).length;
  if (nonPassIdentityMetadataCount) {
    reviews.push(`${nonPassIdentityMetadataCount} Soldier identity records retain non-PASS presentation metadata; ability source validation is unaffected.`);
  }

  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = soldierStage3.generatedAt ?? stage5_2.generatedAt ?? stage3Validation.generatedAt ?? null;

  const sources = {
    contract: { path: paths.contract, gitBlobSha: gitBlobSha(paths.contract) },
    stage5_2: { path: paths.stage5_2, gitBlobSha: gitBlobSha(paths.stage5_2) },
    stage5_2Validation: { path: paths.stage5_2Validation, gitBlobSha: gitBlobSha(paths.stage5_2Validation) },
    soldierStage3: { path: paths.soldierStage3, gitBlobSha: gitBlobSha(paths.soldierStage3) },
    stage3Validation: { path: paths.stage3Validation, gitBlobSha: gitBlobSha(paths.stage3Validation) },
  };

  const output = {
    version: 1,
    schemaId: 'soldier-detail-ability/v1',
    stage: '5-3',
    status,
    generatedAt,
    technicalOrder: 'soldierId-ascending; not release order',
    completedSections: ['identity', 'combat', 'ability', 'sp.description'],
    pendingSections: ['training', 'heroes', 'sp.stage1', 'sp.stage2', 'sp.statDelta', 'list', 'releaseMetadata'],
    sources,
    summary: {
      recordCount: records.length,
      normalTier3Count,
      normalNonTier3Count,
      spCount,
      abilityPopulatedCount,
      spDescriptionRecordCount,
      nonPassIdentityMetadataCount,
    },
    records,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage5-3-ability-validation/v1',
    stage: '5-3',
    status,
    generatedAt,
    sources,
    checks: {
      contractNotFrozen: contract.status === 'FROZEN' ? 0 : 1,
      stage5_2NotPass: stage5_2.status === 'PASS' ? 0 : 1,
      stage5_2ValidationNotPass: stage5_2Validation.status === 'PASS' ? 0 : 1,
      stage3NotPass: soldierStage3.status === 'PASS' ? 0 : 1,
      stage3ValidationNotPass: stage3Validation.status === 'PASS' ? 0 : 1,
      stage3Tier3WithoutTenLevel: Number.isInteger(expectedWithoutTenLevel) ? expectedWithoutTenLevel : -1,
      stage3Tier3MultipleTenLevel: Number.isInteger(expectedMultipleTenLevel) ? expectedMultipleTenLevel : -1,
      stage3SpNormalsWithoutSpDescription: Number.isInteger(expectedSpDescriptionMissing) ? expectedSpDescriptionMissing : -1,
      duplicateStage5Ids: stage5Index.duplicates.length,
      duplicateStage3Ids: stage3Index.duplicates.length,
      duplicateTrainingProfileIds: trainingIndex.duplicates.length,
      missingTrainingProfiles: missingTrainingProfiles.length,
      missingPrimaryTech: missingPrimaryTech.length,
      malformedTenLevelPaths: malformedTenLevelPaths.length,
      normalDescriptionMissing: normalDescriptionMissing.length,
      nonTargetAbilityPopulated: nonTargetAbilityPopulated.length,
      spDescriptionSourceMissing: spDescriptionSourceMissing.length,
      spDescriptionEmpty: spDescriptionEmpty.length,
      spDescriptionRelationMismatch: spDescriptionRelationMismatch.length,
      baselineMismatches: baselineMismatches.length,
      outputRecordCountMismatch: records.length === stage5Records.length ? 0 : 1,
    },
    coverage: {
      canonicalSoldiers: stage5Records.length,
      generatedRecords: records.length,
      normalTier3: normalTier3Count,
      normalNonTier3: normalNonTier3Count,
      spSoldiers: spCount,
      abilityPopulated: abilityPopulatedCount,
      spDescriptionRecords: spDescriptionRecordCount,
      nonPassIdentityMetadataCount,
      missingTrainingProfiles,
      missingPrimaryTech,
      malformedTenLevelPaths,
      normalDescriptionMissing,
      spDescriptionSourceMissing,
      spDescriptionEmpty,
      spDescriptionRelationMismatch,
    },
    errors,
    reviews,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  console.log(`Soldier Stage 5-3: ${status}`);
  console.log(`Records: ${records.length}/${stage5Records.length}`);
  console.log(`Normal tier3 ability paths: ${abilityPopulatedCount}/${normalTier3Count}`);
  console.log(`SP description records: ${spDescriptionRecordCount}/${spCount}`);
  console.log(`Malformed Lv1-10 paths: ${malformedTenLevelPaths.length}`);

  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
