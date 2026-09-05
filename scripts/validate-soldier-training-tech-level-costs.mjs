import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveConfigDataFile } from './configdata-source-pack-maintenance-root.mjs';

const GENERATED_PATH = 'data/generated/soldier-training-tech-level-costs.v1.json';
const VALIDATION_PATH = 'data/validation/soldier-training-tech-level-costs.v1.json';
const SOURCE_PACK_CONTRACT_PATH = 'data/contracts/configdata-source-pack-contract.v1.json';
const STAGE1_PATH = 'data/generated/soldier-training-tech-classification-stage1-census.v1.json';
const COMMON_STAT_PATH = 'data/generated/soldier-training-tech-common-stat-effect-extraction.v1.json';
const COMMON_PASSIVE_PATH = 'data/generated/soldier-training-tech-common-passive-effect-extraction.v1.json';
const LEVEL_FILE = resolveConfigDataFile('ConfigDataTrainingTechLevelInfo.json');
const WRITE = process.argv.includes('--write');

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

const generatedBuffer = readBuffer(GENERATED_PATH);
const sourcePackContractBuffer = readBuffer(SOURCE_PACK_CONTRACT_PATH);
const stage1Buffer = readBuffer(STAGE1_PATH);
const commonStatBuffer = readBuffer(COMMON_STAT_PATH);
const commonPassiveBuffer = readBuffer(COMMON_PASSIVE_PATH);
const levelBuffer = readBuffer(LEVEL_FILE);

const generated = JSON.parse(generatedBuffer.toString('utf8'));
const sourcePackContract = JSON.parse(sourcePackContractBuffer.toString('utf8'));
const stage1 = JSON.parse(stage1Buffer.toString('utf8'));
const commonStat = JSON.parse(commonStatBuffer.toString('utf8'));
const commonPassive = JSON.parse(commonPassiveBuffer.toString('utf8'));
const levelRecords = JSON.parse(levelBuffer.toString('utf8'));

const blockers = [];
const fail = (code, detail = null) => blockers.push({ code, detail });

if (generated?.status !== 'PASS' || generated?.completion !== 'COMPLETE' || generated?.freezeState !== 'SOLDIER_TRAINING_TECH_LEVEL_COSTS_FROZEN') {
  fail('generated-freeze-state-invalid');
}
if (sourcePackContract?.status !== 'PASS') fail('source-pack-contract-not-pass');
if (sourcePackContract?.authority?.semanticContentAuthority !== 'PINNED_UNITYDATATOOL_PARSED_CONFIGDATA_SNAPSHOT') {
  fail('source-pack-semantic-authority-mismatch');
}
if (generated?.authority?.configDataSourcePack?.sourceCommitSha !== sourcePackContract?.authoritativePredecessor?.sourceCommitSha) {
  fail('source-pack-source-commit-mismatch');
}
if (generated?.authority?.configDataSourcePack?.gitBlobSha !== gitBlobSha(sourcePackContractBuffer)) {
  fail('source-pack-contract-blob-mismatch');
}
if (generated?.authority?.trainingTechLocator?.gitBlobSha !== gitBlobSha(stage1Buffer)) fail('stage1-blob-mismatch');
if (generated?.authority?.commonStatMembership?.gitBlobSha !== gitBlobSha(commonStatBuffer)) fail('common-stat-blob-mismatch');
if (generated?.authority?.commonPassiveMembership?.gitBlobSha !== gitBlobSha(commonPassiveBuffer)) fail('common-passive-blob-mismatch');

const levelBlobSha = gitBlobSha(levelBuffer);
if (levelBlobSha !== stage1?.sourceSnapshots?.trainingTechLevel?.gitBlobSha) fail('raw-level-source-vs-stage1-mismatch', levelBlobSha);
if (generated?.sourceSnapshots?.trainingTechLevel?.gitBlobSha !== levelBlobSha) fail('generated-level-source-blob-mismatch');
if (!Array.isArray(levelRecords) || levelRecords.length !== stage1?.population?.trainingTechLevel) fail('raw-level-population-mismatch');

const statIds = new Set();
for (const sequence of commonStat.valueSequenceCatalog ?? []) for (const techId of sequence.techIds ?? []) statIds.add(techId);
const passiveIds = new Set((commonPassive.records ?? []).map((record) => record.techId));
const targetIds = [...statIds, ...passiveIds].sort((a, b) => a - b);
if (statIds.size !== 84) fail('common-stat-membership-count-mismatch', statIds.size);
if (passiveIds.size !== 46) fail('common-passive-membership-count-mismatch', passiveIds.size);
if (targetIds.length !== 130) fail('target-membership-count-mismatch', targetIds.length);
if ([...statIds].some((techId) => passiveIds.has(techId))) fail('membership-overlap');

const stage1ByTechId = new Map((stage1.records ?? []).map((record) => [record.id, record]));
const levelById = new Map();
for (const record of levelRecords) {
  if (!Number.isInteger(record?.ID)) {
    fail('raw-level-id-invalid', record?.ID ?? null);
    continue;
  }
  if (levelById.has(record.ID)) fail('raw-level-id-duplicate', record.ID);
  levelById.set(record.ID, record);
}

const generatedRecords = Array.isArray(generated?.records) ? generated.records : [];
if (generatedRecords.length !== targetIds.length) fail('generated-record-count-mismatch', generatedRecords.length);
const generatedByTechId = new Map();
for (const record of generatedRecords) {
  if (generatedByTechId.has(record.techId)) fail('generated-tech-id-duplicate', record.techId);
  generatedByTechId.set(record.techId, record);
}

let checkedLevelRowCount = 0;
let checkedMaterialEntryCount = 0;
const referencedLevelIds = new Set();
const uniqueMaterialRefs = new Set();

for (const techId of targetIds) {
  const locator = stage1ByTechId.get(techId);
  const actual = generatedByTechId.get(techId);
  if (!locator) {
    fail('stage1-tech-missing', techId);
    continue;
  }
  if (!actual) {
    fail('generated-tech-missing', techId);
    continue;
  }
  const expectedKind = statIds.has(techId) ? 'COMMON_STAT' : 'COMMON_PASSIVE';
  if (actual.kind !== expectedKind) fail('generated-kind-mismatch', { techId, expectedKind, actual: actual.kind });

  const levelRefs = locator.explicitLevelReferences;
  if (!Array.isArray(levelRefs)) {
    fail('stage1-level-references-invalid', techId);
    continue;
  }
  if (!Array.isArray(actual.levels) || actual.levels.length !== levelRefs.length) {
    fail('generated-level-count-mismatch', { techId, expected: levelRefs.length, actual: actual.levels?.length ?? null });
    continue;
  }

  levelRefs.forEach((levelId, index) => {
    const source = levelById.get(levelId);
    const level = actual.levels[index];
    if (!source) {
      fail('explicit-level-reference-unresolved', { techId, levelId });
      return;
    }
    if (referencedLevelIds.has(levelId)) fail('target-level-reference-duplicate', levelId);
    referencedLevelIds.add(levelId);
    if (level?.level !== index + 1) fail('level-ordinal-mismatch', { techId, levelId, expected: index + 1, actual: level?.level ?? null });
    if (level?.trainingTechLevelInfoId !== levelId) fail('level-id-mismatch', { techId, expected: levelId, actual: level?.trainingTechLevelInfoId ?? null });
    if (level?.goldCost !== source.LevelupGoldCost) fail('gold-cost-parity-failure', { techId, levelId });

    const expectedMaterials = Array.isArray(source.LevelupMaterialsCost)
      ? source.LevelupMaterialsCost.map((item) => ({ goodsType: item.GoodsType, id: item.Id, count: item.Count }))
      : null;
    if (!expectedMaterials) {
      fail('raw-materials-not-array', { techId, levelId });
      return;
    }
    if (JSON.stringify(level?.materials) !== JSON.stringify(expectedMaterials)) {
      fail('material-cost-parity-failure', { techId, levelId });
    }
    for (const material of expectedMaterials) {
      if (!Number.isInteger(material.goodsType) || material.goodsType < 0) fail('goods-type-invalid', { techId, levelId, material });
      if (!Number.isInteger(material.id) || material.id < 0) fail('material-id-invalid', { techId, levelId, material });
      if (!Number.isInteger(material.count) || material.count <= 0) fail('material-count-invalid', { techId, levelId, material });
      checkedMaterialEntryCount += 1;
      uniqueMaterialRefs.add(`${material.goodsType}:${material.id}`);
    }
    if (!Number.isInteger(source.LevelupGoldCost) || source.LevelupGoldCost < 0) fail('gold-cost-invalid', { techId, levelId });
    checkedLevelRowCount += 1;
  });
}

for (const record of generatedRecords) {
  if (!targetIds.includes(record.techId)) fail('excluded-tech-materialized', record.techId);
}

const expectedCoverage = {
  targetTechCount: 130,
  commonStatTechCount: 84,
  commonPassiveTechCount: 46,
  referencedLevelRowCount: checkedLevelRowCount,
  uniqueReferencedLevelRowCount: referencedLevelIds.size,
  materialEntryCount: checkedMaterialEntryCount,
  uniqueMaterialReferenceCount: uniqueMaterialRefs.size,
  unresolvedLevelReferenceCount: 0,
};
if (JSON.stringify(generated?.coverage) !== JSON.stringify(expectedCoverage)) fail('coverage-parity-failure', { expectedCoverage, actual: generated?.coverage ?? null });

const requiredPolicy = {
  explicitTechLevelupInfoListJoinOnly: true,
  levelOrdinalFromExplicitReferenceArrayIndex: true,
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
};
for (const [key, expected] of Object.entries(requiredPolicy)) {
  if (generated?.policy?.[key] !== expected) fail('policy-boundary-mismatch', { key, expected, actual: generated?.policy?.[key] });
}

const validation = {
  version: 1,
  schemaId: 'soldier-training-tech-level-costs-validation/v1',
  stage: 'TrainingTech Common Level Cost Projection Validation',
  status: blockers.length === 0 ? 'PASS' : 'FAIL',
  completion: blockers.length === 0 ? 'COMPLETE' : 'BLOCKED',
  freezeState: blockers.length === 0 ? 'SOLDIER_TRAINING_TECH_LEVEL_COSTS_FROZEN' : null,
  generated: {
    path: GENERATED_PATH,
    gitBlobSha: gitBlobSha(generatedBuffer),
  },
  sourceAuthority: {
    configDataSourcePackContractPath: SOURCE_PACK_CONTRACT_PATH,
    sourceCommitSha: sourcePackContract?.authoritativePredecessor?.sourceCommitSha ?? null,
    trainingTechLevelGitBlobSha: levelBlobSha,
  },
  checks: {
    targetMembershipExact: blockers.every((entry) => !String(entry.code).includes('membership')),
    explicitLevelIdResolutionExact: blockers.every((entry) => !String(entry.code).includes('level-reference')),
    levelOrderExact: blockers.every((entry) => entry.code !== 'level-ordinal-mismatch'),
    goldCostExact: blockers.every((entry) => !String(entry.code).includes('gold-cost')),
    materialCostExact: blockers.every((entry) => !String(entry.code).includes('material-cost')),
    semanticBoundaryPreserved: blockers.every((entry) => entry.code !== 'policy-boundary-mismatch'),
  },
  coverage: expectedCoverage,
  blockers,
  reviews: [],
  nextOwner: blockers.length === 0 ? 'soldier-frontend' : 'soldier-canonical',
  nextStartPoint: blockers.length === 0
    ? 'Consume the frozen per-level cost projection in soldier-training-page.server.ts without raw ConfigData joins.'
    : 'Resolve TrainingTech level-cost projection validation blockers before frontend handoff.',
};

if (WRITE) writeFileSync(VALIDATION_PATH, `${JSON.stringify(validation, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(validation, null, 2));
if (blockers.length > 0) process.exit(1);
