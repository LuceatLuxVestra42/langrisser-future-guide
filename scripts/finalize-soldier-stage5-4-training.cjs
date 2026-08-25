const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

const paths = {
  contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
  stage5_3: 'data/generated/soldier-detail-stage5-3.v1.json',
  stage5_3Validation: 'data/validation/soldier-stage5-3-ability.v1.json',
  soldierStage3: 'data/generated/soldier-stage3.v1.json',
  stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
  output: 'data/generated/soldier-detail-stage5-4.v1.json',
  validation: 'data/validation/soldier-stage5-4-training.v1.json',
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

function cloneMaterials(materials) {
  return Array.isArray(materials) ? materials.map((material) => ({ ...material })) : [];
}

function projectPerLevelCost(primaryTech) {
  if (!primaryTech) return [];
  return primaryTech.levels.map((level, index) => ({
    level: Number.isInteger(level.sequenceLevel) ? level.sequenceLevel : index + 1,
    gold: level.gold,
    materials: cloneMaterials(level.materials),
  }));
}

function sumCosts(perLevelCost, limit) {
  const picked = perLevelCost.slice(0, limit);
  const byKey = new Map();
  let gold = 0;

  for (const level of picked) {
    gold += level.gold;
    for (const material of level.materials) {
      const key = `${material.goodsType}:${material.itemId}`;
      const previous = byKey.get(key) ?? {
        goodsType: material.goodsType,
        itemId: material.itemId,
        count: 0,
      };
      previous.count += material.count;
      byKey.set(key, previous);
    }
  }

  return {
    levelsIncluded: picked.length,
    gold,
    materials: [...byKey.values()].sort((a, b) => a.goodsType - b.goodsType || a.itemId - b.itemId),
  };
}

function canonicalTotal(total) {
  if (!total || typeof total !== 'object') return null;
  return {
    levelsIncluded: total.levelsIncluded,
    gold: total.gold,
    materials: (Array.isArray(total.materials) ? total.materials : [])
      .map((material) => ({
        goodsType: material.goodsType,
        itemId: material.itemId,
        count: material.count,
      }))
      .sort((a, b) => a.goodsType - b.goodsType || a.itemId - b.itemId),
  };
}

function totalsEqual(left, right) {
  return JSON.stringify(canonicalTotal(left)) === JSON.stringify(canonicalTotal(right));
}

function isValidMaterial(material) {
  return Number.isInteger(material?.goodsType)
    && Number.isInteger(material?.itemId)
    && typeof material?.count === 'number'
    && Number.isFinite(material.count);
}

function isValidPerLevelCost(level, expectedLevel) {
  return level?.level === expectedLevel
    && typeof level?.gold === 'number'
    && Number.isFinite(level.gold)
    && Array.isArray(level.materials)
    && level.materials.every(isValidMaterial);
}

function main() {
  const contract = loadJson(paths.contract);
  const stage5_3 = loadJson(paths.stage5_3);
  const stage5_3Validation = loadJson(paths.stage5_3Validation);
  const soldierStage3 = loadJson(paths.soldierStage3);
  const stage3Validation = loadJson(paths.stage3Validation);

  const stage5Records = Array.isArray(stage5_3.records) ? stage5_3.records : [];
  const trainingProfiles = Array.isArray(soldierStage3.trainingProfiles) ? soldierStage3.trainingProfiles : [];

  const stage5Index = indexByInteger(stage5Records, 'soldierId');
  const trainingIndex = indexByInteger(trainingProfiles, 'soldierId');

  const errors = [];
  const reviews = [];

  if (contract.status !== 'FROZEN') errors.push(`Stage 5-1 contract must be FROZEN, got ${contract.status}`);
  if (contract.schemaId !== 'soldier-detail-contract/v1') errors.push(`Unexpected Stage 5-1 schemaId: ${contract.schemaId}`);
  if (stage5_3.status !== 'PASS') errors.push(`Stage 5-3 artifact must be PASS, got ${stage5_3.status}`);
  if (stage5_3Validation.status !== 'PASS') errors.push(`Stage 5-3 validation must be PASS, got ${stage5_3Validation.status}`);
  if (soldierStage3.status !== 'PASS') errors.push(`Soldier Stage3 artifact must be PASS, got ${soldierStage3.status}`);
  if (stage3Validation.status !== 'PASS') errors.push(`Soldier Stage3 validation must be PASS, got ${stage3Validation.status}`);

  if (stage5Index.invalid.length) errors.push(`Stage 5-3 contains ${stage5Index.invalid.length} invalid soldierId values`);
  if (trainingIndex.invalid.length) errors.push(`Training profiles contain ${trainingIndex.invalid.length} invalid soldierId values`);
  if (stage5Index.duplicates.length) errors.push(`Duplicate Stage 5-3 Soldier IDs: ${stage5Index.duplicates.join(', ')}`);
  if (trainingIndex.duplicates.length) errors.push(`Duplicate training profile Soldier IDs: ${trainingIndex.duplicates.join(', ')}`);

  const expectedTier3 = stage3Validation?.counts?.tier3Normal;
  const expectedWithoutTenLevel = stage3Validation?.counts?.tier3WithoutTenLevel;
  const expectedMultipleTenLevel = stage3Validation?.counts?.tier3MultipleTenLevel;

  if (expectedWithoutTenLevel !== 0) errors.push(`Stage3 reports tier3WithoutTenLevel=${expectedWithoutTenLevel}`);
  if (expectedMultipleTenLevel !== 0) errors.push(`Stage3 reports tier3MultipleTenLevel=${expectedMultipleTenLevel}`);

  const records = [];
  const missingTrainingProfiles = [];
  const missingPrimaryTech = [];
  const abilityTechMismatches = [];
  const malformedPerLevelCosts = [];
  const sourceLv5TotalMismatches = [];
  const sourceLv10TotalMismatches = [];
  const nonTargetTrainingPopulated = [];

  let trainingPopulatedCount = 0;
  let perLevelCostRecordCount = 0;

  const soldierIds = [...stage5Index.map.keys()].sort((a, b) => a - b);

  for (const soldierId of soldierIds) {
    const base = stage5Index.map.get(soldierId);
    const isNormalTier3 = base?.identity?.isSp !== true && base?.identity?.tier === 3;

    let training = {
      techId: null,
      perLevelCost: [],
      lv5Total: null,
      lv10Total: null,
    };

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
          const perLevelCost = projectPerLevelCost(primaryTech);
          const lv5Total = sumCosts(perLevelCost, 5);
          const lv10Total = sumCosts(perLevelCost, 10);

          training = {
            techId: primaryTech.techId,
            perLevelCost,
            lv5Total,
            lv10Total,
          };
          trainingPopulatedCount += 1;
          perLevelCostRecordCount += perLevelCost.length;

          if (base?.ability?.techId !== primaryTech.techId) {
            abilityTechMismatches.push(soldierId);
          }

          const validLevels = perLevelCost.length === 10
            && perLevelCost.every((level, index) => isValidPerLevelCost(level, index + 1));
          if (!validLevels) malformedPerLevelCosts.push(soldierId);

          if (!totalsEqual(lv5Total, primaryTech.costToLevel5)) {
            sourceLv5TotalMismatches.push(soldierId);
          }
          if (!totalsEqual(lv10Total, primaryTech.costToLevel10)) {
            sourceLv10TotalMismatches.push(soldierId);
          }
        }
      }
    }

    if (!isNormalTier3 && (
      training.techId !== null
      || training.perLevelCost.length !== 0
      || training.lv5Total !== null
      || training.lv10Total !== null
    )) {
      nonTargetTrainingPopulated.push(soldierId);
    }

    records.push({
      soldierId,
      identity: base.identity,
      combat: base.combat,
      ability: base.ability,
      training,
      sp: base.sp,
    });
  }

  if (missingTrainingProfiles.length) errors.push(`${missingTrainingProfiles.length} normal tier-3 Soldiers are missing training profiles`);
  if (missingPrimaryTech.length) errors.push(`${missingPrimaryTech.length} normal tier-3 Soldiers are missing the validated primary Lv1-10 TrainingTech`);
  if (abilityTechMismatches.length) errors.push(`${abilityTechMismatches.length} Soldiers have ability.techId != training.techId`);
  if (malformedPerLevelCosts.length) errors.push(`${malformedPerLevelCosts.length} normal tier-3 Soldiers have malformed Lv1-10 per-level costs`);
  if (sourceLv5TotalMismatches.length) errors.push(`${sourceLv5TotalMismatches.length} Lv5 cumulative totals differ from the validated Stage3 aggregate`);
  if (sourceLv10TotalMismatches.length) errors.push(`${sourceLv10TotalMismatches.length} Lv10 cumulative totals differ from the validated Stage3 aggregate`);
  if (nonTargetTrainingPopulated.length) errors.push(`${nonTargetTrainingPopulated.length} non-target Soldiers unexpectedly received training costs`);

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
  if (trainingPopulatedCount !== normalTier3Count) {
    baselineMismatches.push(`training populated=${trainingPopulatedCount} normalTier3=${normalTier3Count}`);
  }
  if (perLevelCostRecordCount !== normalTier3Count * 10) {
    baselineMismatches.push(`per-level cost records=${perLevelCostRecordCount} expected=${normalTier3Count * 10}`);
  }
  if (records.length !== stage5Records.length) {
    baselineMismatches.push(`record count actual=${records.length} stage5-3=${stage5Records.length}`);
  }
  if (baselineMismatches.length) errors.push(`Stage 5-4 baseline mismatch: ${baselineMismatches.join('; ')}`);

  const nonPassIdentityMetadataCount = records.filter(
    (record) => record.identity?.validationStatus && record.identity.validationStatus !== 'PASS',
  ).length;
  if (nonPassIdentityMetadataCount) {
    reviews.push(`${nonPassIdentityMetadataCount} Soldier identity records retain non-PASS presentation metadata; training cost validation is unaffected.`);
  }

  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = soldierStage3.generatedAt ?? stage5_3.generatedAt ?? stage3Validation.generatedAt ?? null;

  const sources = {
    contract: { path: paths.contract, gitBlobSha: gitBlobSha(paths.contract) },
    stage5_3: { path: paths.stage5_3, gitBlobSha: gitBlobSha(paths.stage5_3) },
    stage5_3Validation: { path: paths.stage5_3Validation, gitBlobSha: gitBlobSha(paths.stage5_3Validation) },
    soldierStage3: { path: paths.soldierStage3, gitBlobSha: gitBlobSha(paths.soldierStage3) },
    stage3Validation: { path: paths.stage3Validation, gitBlobSha: gitBlobSha(paths.stage3Validation) },
  };

  const output = {
    version: 1,
    schemaId: 'soldier-detail-training/v1',
    stage: '5-4',
    status,
    generatedAt,
    technicalOrder: 'soldierId-ascending; not release order',
    completedSections: ['identity', 'combat', 'ability', 'training', 'sp.description'],
    pendingSections: ['heroes', 'sp.stage1', 'sp.stage2', 'sp.statDelta', 'list', 'releaseMetadata'],
    sources,
    summary: {
      recordCount: records.length,
      normalTier3Count,
      normalNonTier3Count,
      spCount,
      trainingPopulatedCount,
      perLevelCostRecordCount,
      nonPassIdentityMetadataCount,
    },
    records,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage5-4-training-validation/v1',
    stage: '5-4',
    status,
    generatedAt,
    sources,
    checks: {
      contractNotFrozen: contract.status === 'FROZEN' ? 0 : 1,
      stage5_3NotPass: stage5_3.status === 'PASS' ? 0 : 1,
      stage5_3ValidationNotPass: stage5_3Validation.status === 'PASS' ? 0 : 1,
      stage3NotPass: soldierStage3.status === 'PASS' ? 0 : 1,
      stage3ValidationNotPass: stage3Validation.status === 'PASS' ? 0 : 1,
      stage3Tier3WithoutTenLevel: expectedWithoutTenLevel ?? null,
      stage3Tier3MultipleTenLevel: expectedMultipleTenLevel ?? null,
      duplicateStage5Ids: stage5Index.duplicates.length,
      duplicateTrainingProfileIds: trainingIndex.duplicates.length,
      missingTrainingProfiles: missingTrainingProfiles.length,
      missingPrimaryTech: missingPrimaryTech.length,
      abilityTechMismatches: abilityTechMismatches.length,
      malformedPerLevelCosts: malformedPerLevelCosts.length,
      sourceLv5TotalMismatches: sourceLv5TotalMismatches.length,
      sourceLv10TotalMismatches: sourceLv10TotalMismatches.length,
      nonTargetTrainingPopulated: nonTargetTrainingPopulated.length,
      baselineMismatches: baselineMismatches.length,
      outputRecordCountMismatch: records.length === stage5Records.length ? 0 : 1,
    },
    coverage: {
      canonicalSoldiers: stage5Records.length,
      generatedRecords: records.length,
      normalTier3: normalTier3Count,
      normalNonTier3: normalNonTier3Count,
      spSoldiers: spCount,
      trainingPopulated: trainingPopulatedCount,
      perLevelCostRecords: perLevelCostRecordCount,
      expectedPerLevelCostRecords: normalTier3Count * 10,
      nonPassIdentityMetadataCount,
      missingTrainingProfiles,
      missingPrimaryTech,
      abilityTechMismatches,
      malformedPerLevelCosts,
      sourceLv5TotalMismatches,
      sourceLv10TotalMismatches,
      nonTargetTrainingPopulated,
    },
    errors,
    reviews,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  console.log(`Soldier Stage 5-4: ${status}`);
  console.log(`Records: ${records.length}/${stage5Records.length}`);
  console.log(`Training populated: ${trainingPopulatedCount}/${normalTier3Count}`);
  console.log(`Per-level cost records: ${perLevelCostRecordCount}`);
  console.log(`Lv5 total mismatches: ${sourceLv5TotalMismatches.length}`);
  console.log(`Lv10 total mismatches: ${sourceLv10TotalMismatches.length}`);

  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
