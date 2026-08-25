const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { ROOT, readJson } = require('./lib/configdata-direct.cjs');

const OUT_REL = 'data/validation/soldier-stage4-8-baseline.v1.json';
const OUT = path.join(ROOT, OUT_REL);

const validationPaths = {
  inputAdapter: 'data/validation/soldier-stage4-1-input.v1.json',
  soldierMaster: 'data/validation/soldier-stage4-2-master.v1.json',
  stage3: 'data/validation/soldier-stage3-final.v1.json',
  trainingTech: 'data/validation/soldier-stage4-3-trainingtech.v1.json',
  spMission: 'data/validation/soldier-stage4-4-sp-mission.v1.json',
  spHeroReward: 'data/validation/soldier-stage4-5-sp-hero-reward.v1.json',
  legacyRelation: 'data/validation/soldier-stage3-12-final.v1.json',
  sharedRelation: 'data/validation/hero-soldier-relation-validation.v1.json',
  relationConsumer: 'data/validation/soldier-stage4-6-relation-consumer.v1.json',
  representativeFixtures: 'data/validation/soldier-stage4-7-domain-fixtures.v1.json',
};

const generatedPaths = {
  soldierMaster: 'data/generated/soldier-master.v1.json',
  soldierStage3: 'data/generated/soldier-stage3.v1.json',
  legacyHeroSoldier: 'data/generated/soldier-hero-relations.v1.json',
  sharedRelation: 'data/generated/hero-soldier-relations.v1.json',
  byHero: 'data/generated/hero-soldier-by-hero.v1.json',
  bySoldier: 'data/generated/hero-soldier-by-soldier.v1.json',
};

const dataInputs = [
  'data/configdata/ConfigDataSoldierInfo.json',
  'data/configdata/ConfigDataSPSoldierInfo.json',
  'data/configdata/ConfigDataArmyInfo.json',
  'data/configdata/ConfigDataTrainingTechInfo.json',
  'data/configdata/ConfigDataTrainingTechLevelInfo.json',
  'data/configdata/ConfigDataMissionInfo.json',
  'data/configdata/ConfigDataMissionSumitItemInfo.json',
  'data/configdata/ConfigDataSPHeroInfo.json',
  'data/metadata/soldier-name-kr-tier3.v1.json',
  'data/soldier-master-stage2-1.v1.json',
  'data/hero-name-master.v1.json',
  'data/validation/soldier-representative-fixture-plan.v1.json',
];

const contractInputs = [
  'data/contracts/hero-identity-contract.v1.json',
  'data/contracts/soldier-identity-contract.v1.json',
  'data/contracts/hero-soldier-relation-source-contract.v1.json',
  'data/contracts/hero-soldier-relation-edge-schema.v1.json',
  'data/contracts/hero-soldier-relation-composition-contract.v1.json',
  'data/contracts/hero-soldier-relation-set-contract.v1.json',
  'data/contracts/hero-soldier-relation-index-contract.v1.json',
  'data/contracts/hero-soldier-relation-validation-contract.v1.json',
];

const pipelineInputs = [
  'scripts/lib/configdata-direct.cjs',
  'scripts/finalize-soldier-stage2.cjs',
  'scripts/validate-soldier-stage4-1-input.cjs',
  'scripts/validate-soldier-stage4-2-master.cjs',
  'scripts/finalize-soldier-stage3.cjs',
  'scripts/finalize-soldier-stage3-postprocess.cjs',
  'scripts/validate-soldier-stage4-3-trainingtech.cjs',
  'scripts/validate-soldier-stage4-4-sp-mission.cjs',
  'scripts/validate-soldier-stage4-5-sp-hero-reward.cjs',
  'scripts/finalize-soldier-stage3-12.cjs',
  'scripts/finalize-hero-soldier-relation-layer.cjs',
  'scripts/validate-soldier-stage4-6-relation-consumer.cjs',
  'scripts/validate-soldier-stage4-7-domain-fixtures.cjs',
  'scripts/validate-soldier-stage4-8-baseline.cjs',
];

function abs(p) { return path.join(ROOT, p); }
function exists(p) { return fs.existsSync(abs(p)); }
function gitBlobSha(p) {
  return execFileSync('git', ['hash-object', p], { cwd: ROOT, encoding: 'utf8' }).trim();
}
function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}
function descriptor(paths) {
  return Object.fromEntries(paths.map((p) => [p, { gitBlobSha: gitBlobSha(p) }]));
}
function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === 'generatedAt') continue;
      out[key] = stripVolatile(value[key]);
    }
    return out;
  }
  return value;
}
function semanticDigest(p) {
  const data = stripVolatile(readJson(abs(p)));
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
function digestDescriptors(map) {
  return Object.fromEntries(Object.entries(map).map(([name, p]) => [name, { path: p, semanticSha256: semanticDigest(p) }]));
}
function readRequired(p, errors) {
  if (!exists(p)) {
    errors.push({ checkId: 'missingArtifact', path: p });
    return null;
  }
  return readJson(abs(p));
}
function collectChanged(previous, current) {
  const changes = [];
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(current || {})]);
  for (const key of [...keys].sort()) {
    const before = previous?.[key]?.gitBlobSha ?? previous?.[key]?.semanticSha256 ?? null;
    const after = current?.[key]?.gitBlobSha ?? current?.[key]?.semanticSha256 ?? null;
    if (before !== after) changes.push({ path: key, before, after });
  }
  return changes;
}
function allZero(obj) {
  return obj && Object.values(obj).every((v) => typeof v !== 'number' || v === 0);
}

const previous = exists(OUT_REL) ? readJson(OUT) : null;
const errors = [];
const reviews = [];
const validations = Object.fromEntries(Object.entries(validationPaths).map(([k, p]) => [k, readRequired(p, errors)]));
const generated = Object.fromEntries(Object.entries(generatedPaths).map(([k, p]) => [k, readRequired(p, errors)]));

const requiredPass = [
  'inputAdapter',
  'soldierMaster',
  'stage3',
  'trainingTech',
  'spMission',
  'spHeroReward',
  'legacyRelation',
  'sharedRelation',
  'relationConsumer',
  'representativeFixtures',
];
for (const key of requiredPass) {
  const status = validations[key]?.status;
  if (status !== 'PASS') errors.push({ checkId: 'validationNotPass', validation: key, status: status ?? null });
}

if (validations.inputAdapter && validations.inputAdapter.legacyTextAssetParsing !== false) {
  errors.push({ checkId: 'legacyParserRegression', value: validations.inputAdapter.legacyTextAssetParsing });
}
if (validations.sharedRelation && !allZero(validations.sharedRelation.checks)) {
  errors.push({ checkId: 'sharedRelationChecksNonZero', checks: validations.sharedRelation.checks });
}
if (validations.sharedRelation?.goldenComparison?.status !== 'MATCH') {
  errors.push({ checkId: 'goldenRelationMismatch', status: validations.sharedRelation?.goldenComparison?.status ?? null });
}
if (validations.representativeFixtures?.counts?.fixtureCount !== 5 ||
    validations.representativeFixtures?.counts?.fixturePass !== 5 ||
    validations.representativeFixtures?.counts?.fixtureFail !== 0) {
  errors.push({ checkId: 'representativeFixtureMismatch', counts: validations.representativeFixtures?.counts ?? null });
}

const masterRecords = generated.soldierMaster?.records ?? [];
const stage3Records = generated.soldierStage3?.records ?? [];
const masterIds = new Set(masterRecords.map((x) => Number(x.soldierId)));
const stage3Ids = new Set(stage3Records.map((x) => Number(x.soldierId)));
const masterStage3Missing = [...masterIds].filter((x) => !stage3Ids.has(x));
const stage3MasterExtra = [...stage3Ids].filter((x) => !masterIds.has(x));
if (masterStage3Missing.length || stage3MasterExtra.length) {
  errors.push({ checkId: 'masterStage3IdentityMismatch', masterStage3Missing, stage3MasterExtra });
}

const currentRelationCount = generated.sharedRelation?.summary?.edgeCount ?? null;
const legacyRelationCount = validations.sharedRelation?.goldenComparison?.legacyPairCount ?? null;
if (currentRelationCount !== 5977 || legacyRelationCount !== 5977) {
  errors.push({ checkId: 'relationBaselineCountMismatch', currentRelationCount, legacyRelationCount });
}

const inputSnapshot = descriptor(dataInputs);
const contractSnapshot = descriptor(contractInputs);
const pipelineSnapshot = descriptor(pipelineInputs);
const artifactSnapshot = digestDescriptors(generatedPaths);
const validationSnapshot = digestDescriptors(validationPaths);

const dataChanges = collectChanged(previous?.snapshots?.dataInputs, inputSnapshot);
const contractChanges = collectChanged(previous?.snapshots?.contracts, contractSnapshot);
const pipelineChanges = collectChanged(previous?.snapshots?.pipeline, pipelineSnapshot);
const artifactChanges = collectChanged(previous?.snapshots?.artifacts, artifactSnapshot);
const validationChanges = collectChanged(previous?.snapshots?.validations, validationSnapshot);

let changeClassification = 'INITIAL_BASELINE';
if (previous) {
  const sourceChanged = dataChanges.length || contractChanges.length || pipelineChanges.length;
  const outputChanged = artifactChanges.length || validationChanges.length;
  if (!sourceChanged && !outputChanged) changeClassification = 'NO_CHANGE';
  else if (sourceChanged && errors.length === 0) changeClassification = 'SOURCE_CHANGE_REVALIDATED';
  else if (!sourceChanged && outputChanged) changeClassification = 'OUTPUT_CHANGE_WITHOUT_SOURCE_CHANGE';
  else changeClassification = 'UNRESOLVED_CHANGE';
}
if (changeClassification === 'OUTPUT_CHANGE_WITHOUT_SOURCE_CHANGE') {
  errors.push({ checkId: 'unexplainedOutputChange', artifactChanges, validationChanges });
}

const counts = {
  sourceSoldiers: validations.inputAdapter?.counts?.sourceSoldiers ?? null,
  displayableSoldiers: masterRecords.length,
  normalSoldiers: masterRecords.filter((x) => !x.isSp).length,
  spSoldiers: masterRecords.filter((x) => x.isSp).length,
  tier3Normal: masterRecords.filter((x) => !x.isSp && x.tier === 3).length,
  trainingTechRecords: validations.inputAdapter?.counts?.trainingTechRecords ?? null,
  trainingLevelRecords: validations.inputAdapter?.counts?.trainingLevelRecords ?? null,
  missionRecords: validations.inputAdapter?.counts?.missionRecords ?? null,
  missionSubmitBundles: validations.inputAdapter?.counts?.missionSubmitBundles ?? null,
  spHeroRecords: validations.inputAdapter?.counts?.spHeroRecords ?? null,
  secondStageTrue: validations.inputAdapter?.counts?.secondStageTrue ?? null,
  secondStageFalse: validations.inputAdapter?.counts?.secondStageFalse ?? null,
  relationEdges: currentRelationCount,
  fixturePass: validations.representativeFixtures?.counts?.fixturePass ?? null,
};

const status = errors.length ? 'FAIL' : 'PASS';
const output = {
  version: 1,
  stage: 'soldier-page-4-8',
  status,
  generatedAt: new Date().toISOString(),
  sourceRevision: gitHead(),
  purpose: 'Freeze the current UnityDataTool ConfigData Soldier pipeline baseline after full regeneration from Soldier Master through Stage3 and the shared Hero-Soldier Relation Layer.',
  completionCriteria: {
    parserRegressionFree: validations.inputAdapter?.status === 'PASS' && validations.inputAdapter?.legacyTextAssetParsing === false,
    joinsComplete: status === 'PASS' && validations.sharedRelation?.status === 'PASS',
    representativeFixturesPass: validations.representativeFixtures?.counts?.fixturePass === 5 && validations.representativeFixtures?.counts?.fixtureFail === 0,
    dataChangesRecorded: true,
    endToEndRegenerationPass: status === 'PASS',
  },
  counts,
  snapshots: {
    dataInputs: inputSnapshot,
    contracts: contractSnapshot,
    pipeline: pipelineSnapshot,
    artifacts: artifactSnapshot,
    validations: validationSnapshot,
  },
  changeRecord: {
    classification: changeClassification,
    comparedToRevision: previous?.sourceRevision ?? null,
    dataChanges,
    contractChanges,
    pipelineChanges,
    artifactChanges,
    validationChanges,
  },
  evidence: {
    validations: Object.fromEntries(Object.entries(validationPaths).map(([k, p]) => [k, { path: p, status: validations[k]?.status ?? null }])),
    goldenRelation: {
      status: validations.sharedRelation?.goldenComparison?.status ?? null,
      legacyPairCount: validations.sharedRelation?.goldenComparison?.legacyPairCount ?? null,
      currentPairCount: validations.sharedRelation?.goldenComparison?.currentPairCount ?? null,
    },
    representativeFixtures: validations.representativeFixtures?.counts ?? null,
    masterStage3IdentityParity: {
      masterCount: masterIds.size,
      stage3Count: stage3Ids.size,
      missingFromStage3: masterStage3Missing.length,
      extraInStage3: stage3MasterExtra.length,
    },
  },
  errors,
  reviews,
  completion: status === 'PASS'
    ? 'Current data/configdata can regenerate Soldier Master -> Stage3 -> shared Hero-Soldier results from scratch with PASS; the exact source/code/output snapshot is frozen as the Stage 4 baseline.'
    : 'Stage 4-8 baseline freeze failed because one or more end-to-end regression conditions did not pass.',
};

fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
if (status !== 'PASS') process.exit(1);
