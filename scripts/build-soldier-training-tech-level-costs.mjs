import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveConfigDataFile } from './configdata-source-pack-maintenance-root.mjs';

const SOURCE_PACK_CONTRACT_PATH = 'data/contracts/configdata-source-pack-contract.v1.json';
const STAGE1_PATH = 'data/generated/soldier-training-tech-classification-stage1-census.v1.json';
const COMMON_STAT_PATH = 'data/generated/soldier-training-tech-common-stat-effect-extraction.v1.json';
const COMMON_PASSIVE_PATH = 'data/generated/soldier-training-tech-common-passive-effect-extraction.v1.json';
const LOGICAL_LEVEL_PATH = 'data/configdata/ConfigDataTrainingTechLevelInfo.json';
const OUTPUT_PATH = 'data/generated/soldier-training-tech-level-costs.v1.json';
const LEVEL_FILE = resolveConfigDataFile('ConfigDataTrainingTechLevelInfo.json');

function readBuffer(path) {
  return readFileSync(path);
}

function readJson(path) {
  return JSON.parse(readBuffer(path).toString('utf8'));
}

function gitBlobSha(buffer) {
  return createHash('sha1')
    .update(Buffer.from(`blob ${buffer.length}\0`, 'utf8'))
    .update(buffer)
    .digest('hex');
}

function requireFrozen(value, expected) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value?.[key] !== expectedValue) {
      throw new Error(`${key} mismatch: expected ${expectedValue}, got ${value?.[key]}`);
    }
  }
}

function collectTargetMembership(commonStat, commonPassive) {
  const statIds = new Set();
  for (const sequence of commonStat.valueSequenceCatalog ?? []) {
    for (const techId of sequence.techIds ?? []) statIds.add(techId);
  }

  const passiveIds = new Set((commonPassive.records ?? []).map((record) => record.techId));
  if (statIds.size !== commonStat?.coverage?.targetTechCount) {
    throw new Error(`COMMON_STAT membership mismatch: ${statIds.size}`);
  }
  if (passiveIds.size !== commonPassive?.coverage?.targetTechCount) {
    throw new Error(`COMMON_PASSIVE membership mismatch: ${passiveIds.size}`);
  }

  const overlap = [...statIds].filter((id) => passiveIds.has(id));
  if (overlap.length > 0) throw new Error(`COMMON membership overlap: ${overlap.join(',')}`);

  return {
    statIds,
    passiveIds,
    allIds: [...statIds, ...passiveIds].sort((a, b) => a - b),
  };
}

const sourcePackContractBuffer = readBuffer(SOURCE_PACK_CONTRACT_PATH);
const stage1Buffer = readBuffer(STAGE1_PATH);
const commonStatBuffer = readBuffer(COMMON_STAT_PATH);
const commonPassiveBuffer = readBuffer(COMMON_PASSIVE_PATH);
const levelBuffer = readBuffer(LEVEL_FILE);

const sourcePackContract = JSON.parse(sourcePackContractBuffer.toString('utf8'));
const stage1 = JSON.parse(stage1Buffer.toString('utf8'));
const commonStat = JSON.parse(commonStatBuffer.toString('utf8'));
const commonPassive = JSON.parse(commonPassiveBuffer.toString('utf8'));
const levelRecords = JSON.parse(levelBuffer.toString('utf8'));

requireFrozen(stage1, { status: 'PASS' });
requireFrozen(commonStat, {
  status: 'PASS',
  completion: 'COMPLETE',
  freezeState: 'TRAINING_TECH_COMMON_STAT_EFFECT_EXTRACTION_FROZEN',
});
requireFrozen(commonPassive, {
  status: 'PASS',
  completion: 'COMPLETE',
  freezeState: 'TRAINING_TECH_COMMON_PASSIVE_EFFECT_EXTRACTION_FROZEN',
});
if (sourcePackContract?.status !== 'PASS') throw new Error('ConfigData source-pack contract is not PASS.');
if (sourcePackContract?.authority?.semanticContentAuthority !== 'PINNED_UNITYDATATOOL_PARSED_CONFIGDATA_SNAPSHOT') {
  throw new Error('Unexpected ConfigData semantic authority.');
}
if (!Array.isArray(levelRecords)) throw new Error('TrainingTechLevel source is not a JSON array.');

const levelBlobSha = gitBlobSha(levelBuffer);
if (levelBlobSha !== stage1?.sourceSnapshots?.trainingTechLevel?.gitBlobSha) {
  throw new Error(`TrainingTechLevel source snapshot mismatch: ${levelBlobSha}`);
}
if (levelRecords.length !== stage1?.population?.trainingTechLevel) {
  throw new Error(`TrainingTechLevel population mismatch: ${levelRecords.length}`);
}

const membership = collectTargetMembership(commonStat, commonPassive);
if (membership.allIds.length !== 130) throw new Error(`Target TrainingTech count mismatch: ${membership.allIds.length}`);

const stage1ByTechId = new Map();
for (const record of stage1.records ?? []) {
  if (stage1ByTechId.has(record.id)) throw new Error(`Duplicate Stage 1 TrainingTech ID: ${record.id}`);
  stage1ByTechId.set(record.id, record);
}

const levelById = new Map();
for (const record of levelRecords) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid TrainingTechLevel record.');
  if (!Number.isInteger(record.ID)) throw new Error(`Invalid TrainingTechLevel ID: ${record.ID}`);
  if (levelById.has(record.ID)) throw new Error(`Duplicate TrainingTechLevel ID: ${record.ID}`);
  levelById.set(record.ID, record);
}

let referencedLevelRowCount = 0;
let materialEntryCount = 0;
const uniqueMaterialRefs = new Set();
const globallyReferencedLevelIds = new Set();

const records = membership.allIds.map((techId) => {
  const locator = stage1ByTechId.get(techId);
  if (!locator) throw new Error(`Missing Stage 1 TrainingTech locator: ${techId}`);
  if (!Array.isArray(locator.explicitLevelReferences) || locator.explicitLevelReferences.length === 0) {
    throw new Error(`TrainingTech ${techId} has no explicit level references.`);
  }

  const kind = membership.statIds.has(techId) ? 'COMMON_STAT' : 'COMMON_PASSIVE';
  const seenWithinTech = new Set();
  const levels = locator.explicitLevelReferences.map((levelId, index) => {
    if (!Number.isInteger(levelId)) throw new Error(`TrainingTech ${techId} has non-integer level reference.`);
    if (seenWithinTech.has(levelId)) throw new Error(`TrainingTech ${techId} repeats level reference ${levelId}.`);
    seenWithinTech.add(levelId);
    if (globallyReferencedLevelIds.has(levelId)) throw new Error(`TrainingTechLevel ${levelId} is referenced by multiple target techs.`);
    globallyReferencedLevelIds.add(levelId);

    const source = levelById.get(levelId);
    if (!source) throw new Error(`Unresolved TrainingTechLevel reference ${levelId} for tech ${techId}.`);
    if (!Number.isInteger(source.LevelupGoldCost) || source.LevelupGoldCost < 0) {
      throw new Error(`Invalid LevelupGoldCost for level ${levelId}.`);
    }
    if (!Array.isArray(source.LevelupMaterialsCost)) {
      throw new Error(`Invalid LevelupMaterialsCost for level ${levelId}.`);
    }

    const materials = source.LevelupMaterialsCost.map((material, materialIndex) => {
      if (!material || typeof material !== 'object' || Array.isArray(material)) {
        throw new Error(`Invalid material entry ${materialIndex} for level ${levelId}.`);
      }
      const goodsType = material.GoodsType;
      const id = material.Id;
      const count = material.Count;
      if (!Number.isInteger(goodsType) || goodsType < 0) throw new Error(`Invalid GoodsType for level ${levelId}.`);
      if (!Number.isInteger(id) || id < 0) throw new Error(`Invalid material Id for level ${levelId}.`);
      if (!Number.isInteger(count) || count <= 0) throw new Error(`Invalid material Count for level ${levelId}.`);
      materialEntryCount += 1;
      uniqueMaterialRefs.add(`${goodsType}:${id}`);
      return { goodsType, id, count };
    });

    referencedLevelRowCount += 1;
    return {
      level: index + 1,
      trainingTechLevelInfoId: levelId,
      goldCost: source.LevelupGoldCost,
      materials,
    };
  });

  return { techId, kind, levels };
});

const output = {
  version: 1,
  schemaId: 'soldier-training-tech-level-costs/v1',
  stage: 'TrainingTech Common Level Cost Projection',
  status: 'PASS',
  completion: 'COMPLETE',
  freezeState: 'SOLDIER_TRAINING_TECH_LEVEL_COSTS_FROZEN',
  purpose: 'Project exact per-level gold and material costs for the already-frozen 84 COMMON_STAT and 46 COMMON_PASSIVE TrainingTech population using only explicit TechLevelupInfoList -> TrainingTechLevelInfo ID references.',
  authority: {
    configDataSourcePack: {
      path: SOURCE_PACK_CONTRACT_PATH,
      gitBlobSha: gitBlobSha(sourcePackContractBuffer),
      semanticContentAuthority: sourcePackContract.authority.semanticContentAuthority,
      sourceCommitSha: sourcePackContract.authoritativePredecessor.sourceCommitSha,
      logicalRawPathNamespace: sourcePackContract.authority.logicalRawPathNamespace,
    },
    trainingTechLocator: {
      path: STAGE1_PATH,
      gitBlobSha: gitBlobSha(stage1Buffer),
      projection: 'LOSSLESS_PARSED_RECORD_EXPLICIT_LEVEL_REFERENCES_ONLY',
    },
    commonStatMembership: {
      path: COMMON_STAT_PATH,
      gitBlobSha: gitBlobSha(commonStatBuffer),
      freezeState: commonStat.freezeState,
    },
    commonPassiveMembership: {
      path: COMMON_PASSIVE_PATH,
      gitBlobSha: gitBlobSha(commonPassiveBuffer),
      freezeState: commonPassive.freezeState,
    },
  },
  sourceSnapshots: {
    trainingTechLevel: {
      logicalPath: LOGICAL_LEVEL_PATH,
      gitBlobSha: levelBlobSha,
      recordCount: levelRecords.length,
    },
  },
  policy: {
    explicitTechLevelupInfoListJoinOnly: true,
    levelOrdinalFromExplicitReferenceArrayIndex: true,
    goldCostField: 'LevelupGoldCost',
    materialCostField: 'LevelupMaterialsCost',
    materialIdentityFields: ['GoodsType', 'Id'],
    materialCountField: 'Count',
    membershipRecomputed: false,
    descriptionUsedForClassification: false,
    nameJoinPerformed: false,
    idArithmeticPerformed: false,
    filenameSimilarityUsed: false,
    missingValueImputationPerformed: false,
    historicalOutputFallbackUsed: false,
    spAwakeningMissionMaterialsIncluded: false,
    localizationIncluded: false,
    assetResolutionIncluded: false,
  },
  coverage: {
    targetTechCount: records.length,
    commonStatTechCount: membership.statIds.size,
    commonPassiveTechCount: membership.passiveIds.size,
    referencedLevelRowCount,
    uniqueReferencedLevelRowCount: globallyReferencedLevelIds.size,
    materialEntryCount,
    uniqueMaterialReferenceCount: uniqueMaterialRefs.size,
    unresolvedLevelReferenceCount: 0,
  },
  blockers: [],
  reviews: [],
  records,
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'PASS', output: OUTPUT_PATH, coverage: output.coverage }, null, 2));
