const fs = require('fs');
const path = require('path');
const {
  ROOT,
  readJson,
  loadSoldiers,
  loadSpSoldiers,
  loadTrainingTechs,
  loadTrainingLevels,
  loadMissions,
  loadMissionSubmitBundles,
} = require('./lib/configdata-direct.cjs');

const STAGE3_PATH = path.join(ROOT, 'data/generated/soldier-stage3.v1.json');
const MASTER_PATH = path.join(ROOT, 'data/generated/soldier-master.v1.json');
const FIXTURE_PLAN_PATH = path.join(ROOT, 'data/validation/soldier-representative-fixture-plan.v1.json');
const SHARED_VALIDATION_PATH = path.join(ROOT, 'data/validation/hero-soldier-relation-validation.v1.json');
const OUT_PATH = path.join(ROOT, 'data/validation/soldier-stage4-7-domain-fixtures.v1.json');

function uniqueSorted(xs) { return [...new Set(xs)].sort((a, b) => a - b); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  return value;
}
function same(a, b) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
function sortedGoods(xs) {
  return [...(xs ?? [])]
    .map((x) => ({ goodsType: x.goodsType, itemId: x.itemId, count: x.count }))
    .sort((a, b) => a.goodsType - b.goodsType || a.itemId - b.itemId || a.count - b.count);
}
function sumGoods(levels, limit) {
  const byKey = new Map();
  let gold = 0;
  for (const level of levels.slice(0, limit)) {
    gold += level.gold;
    for (const g of level.materials ?? []) {
      const key = `${g.goodsType}:${g.itemId}`;
      const prev = byKey.get(key) ?? { goodsType: g.goodsType, itemId: g.itemId, count: 0 };
      prev.count += g.count;
      byKey.set(key, prev);
    }
  }
  return {
    levelsIncluded: Math.min(levels.length, limit),
    gold,
    materials: [...byKey.values()].sort((a, b) => a.goodsType - b.goodsType || a.itemId - b.itemId),
  };
}
function missionTypeName(t) {
  if (t === 73) return 'SUBMIT_ITEMS';
  if (t === 123) return 'USABLE_HERO_LEVEL';
  if (t === 124) return 'EXPANDED_HERO_BOND';
  return 'OTHER';
}

const errors = [];
const aggregateChecks = {};
function fail(checkId, detail) {
  aggregateChecks[checkId] = (aggregateChecks[checkId] ?? 0) + 1;
  errors.push({ checkId, detail });
}
function passInit(checkIds) {
  for (const id of checkIds) if (!(id in aggregateChecks)) aggregateChecks[id] = 0;
}

passInit([
  'fixturePlanInvalid',
  'sharedRelationFixtureReuseFailure',
  'missingMasterFixture',
  'missingStage3Record',
  'sourceStatsMismatch',
  'sourceCombatMismatch',
  'sourceRawMismatch',
  'normalOnlySpLeak',
  'trainingProfileMissing',
  'trainingPrimaryPathInvalid',
  'trainingLevelSourceMismatch',
  'trainingDescriptionMissing',
  'trainingCostMismatch',
  'spDescriptionMissing',
  'spSourceLinkMismatch',
  'spGeneratedLinkMismatch',
  'spStatsMismatch',
  'spStatDeltaMismatch',
  'firstStageMismatch',
  'firstStageMissionMismatch',
  'secondStageBranchMismatch',
  'secondStageMismatch',
  'secondStageMissionMismatch',
]);

const fixturePlan = readJson(FIXTURE_PLAN_PATH);
const sharedValidation = readJson(SHARED_VALIDATION_PATH);
const stage3 = readJson(STAGE3_PATH);
const master = readJson(MASTER_PATH);

const soldiers = loadSoldiers();
const spSoldiers = loadSpSoldiers();
const trainingTechs = loadTrainingTechs();
const trainingLevels = loadTrainingLevels();
const missions = loadMissions();
const submitBundles = loadMissionSubmitBundles();

const soldierById = new Map(soldiers.map((x) => [x.soldierId, x]));
const spByNormal = new Map(spSoldiers.map((x) => [x.normalSoldierId, x]));
const spById = new Map(spSoldiers.map((x) => [x.spSoldierId, x]));
const techById = new Map(trainingTechs.map((x) => [x.techId, x]));
const levelById = new Map(trainingLevels.map((x) => [x.levelInfoId, x]));
const missionById = new Map(missions.map((x) => [x.missionId, x]));
const submitById = new Map(submitBundles.map((x) => [x.bundleId, x]));
const masterById = new Map(master.records.map((x) => [x.soldierId, x]));
const recordById = new Map(stage3.records.map((x) => [x.soldierId, x]));
const trainingBySoldier = new Map(stage3.trainingProfiles.map((x) => [x.soldierId, x]));
const spRelationByNormal = new Map(stage3.spRelations.map((x) => [x.normalSoldierId, x]));

if (fixturePlan.status !== 'PASS' || !Array.isArray(fixturePlan.fixtures) || fixturePlan.fixtures.length !== 5) {
  fail('fixturePlanInvalid', 'Expected the frozen five-fixture plan to remain PASS with exactly five fixtures.');
}

const sharedFixtureBySoldier = new Map((sharedValidation.fixtures ?? []).map((x) => [x.soldierId, x]));
const fixtureResults = [];

function compareBaseRecord(fixture, soldierId, expectedIsSp) {
  const checks = {};
  const source = soldierById.get(soldierId);
  const generated = recordById.get(soldierId);
  const masterRow = masterById.get(soldierId);

  checks.masterPresent = Boolean(masterRow);
  if (!masterRow || masterRow.isSp !== expectedIsSp) fail('missingMasterFixture', `${soldierId}: missing/wrong isSp Soldier Master row`);

  checks.stage3RecordPresent = Boolean(generated);
  if (!source || !generated) {
    fail('missingStage3Record', `${soldierId}: missing source or Stage3 record`);
    return { checks, source, generated, masterRow };
  }

  const expectedStats = {
    hp: source.hpIni,
    atk: source.atkIni,
    def: source.defIni,
    mdef: source.mdefIni,
    move: source.movePoint,
    range: source.attackRange,
  };
  checks.statsExact = same(generated.stats, expectedStats);
  if (!checks.statsExact) fail('sourceStatsMismatch', `${soldierId}: generated stats differ from SoldierInfo *_INI/BF fields`);

  const expectedCombat = {
    armyId: source.armyId,
    tier: source.tier,
    isMelee: source.isMelee,
    moveType: source.moveType,
  };
  checks.combatExact = same(generated.combat, expectedCombat);
  if (!checks.combatExact) fail('sourceCombatMismatch', `${soldierId}: generated combat classification differs from SoldierInfo`);

  const expectedRaw = {
    attackSpeedIni: source.attackSpeedIni,
    moveSpeedIni: source.moveSpeedIni,
    hpUp: source.hpUp,
    atkUp: source.atkUp,
    defUp: source.defUp,
    mdefUp: source.mdefUp,
    criticalRate: source.criticalRate,
    criticalDamage: source.criticalDamage,
    skills: source.skills,
    getSoldierTechId: source.getSoldierTechId,
  };
  checks.rawExact = same(generated.raw, expectedRaw);
  if (!checks.rawExact) fail('sourceRawMismatch', `${soldierId}: generated raw combat fields differ from SoldierInfo`);

  return { checks, source, generated, masterRow };
}

function validateTraining(fixture, normalSoldierId, requiresSpDescription) {
  const checks = {};
  const profile = trainingBySoldier.get(normalSoldierId);
  if (!profile) {
    fail('trainingProfileMissing', `${normalSoldierId}: missing Stage3 training profile`);
    return { checks, primaryTechId: null };
  }
  checks.profilePresent = true;
  checks.uniquePrimaryTenLevel = profile.tenLevelTechIds?.length === 1 && profile.primaryTenLevelTechId === profile.tenLevelTechIds[0];
  if (!checks.uniquePrimaryTenLevel) fail('trainingPrimaryPathInvalid', `${normalSoldierId}: expected one unique Lv1-10 primary TrainingTech path`);

  const tech = profile.linkedTechs.find((x) => x.techId === profile.primaryTenLevelTechId);
  const sourceTech = techById.get(profile.primaryTenLevelTechId);
  checks.primaryTechPresent = Boolean(tech && sourceTech);
  if (!tech || !sourceTech || tech.levels.length !== 10) {
    fail('trainingPrimaryPathInvalid', `${normalSoldierId}: primary TrainingTech is missing or not 10 levels`);
    return { checks, primaryTechId: profile.primaryTenLevelTechId };
  }

  let sourceLevelMismatch = 0;
  let descriptionMissing = 0;
  let spDescriptionMissing = 0;
  for (let i = 0; i < tech.levels.length; i++) {
    const generatedLevel = tech.levels[i];
    const sourceLevelId = sourceTech.levelInfoIds[i];
    const sourceLevel = levelById.get(sourceLevelId);
    if (!sourceLevel || generatedLevel.levelInfoId !== sourceLevelId || generatedLevel.sequenceLevel !== i + 1 ||
        generatedLevel.description !== sourceLevel.description || generatedLevel.spDescription !== sourceLevel.spDescription ||
        generatedLevel.gold !== sourceLevel.gold || !same(sortedGoods(generatedLevel.materials), sortedGoods(sourceLevel.materials)) ||
        generatedLevel.soldierSkillLevel !== sourceLevel.soldierSkillLevel || generatedLevel.soldierSkillId !== sourceLevel.soldierSkillId) {
      sourceLevelMismatch++;
    }
    if (!generatedLevel.description) descriptionMissing++;
    if (requiresSpDescription && !generatedLevel.spDescription) spDescriptionMissing++;
  }
  checks.trainingLevelSourceMismatch = sourceLevelMismatch;
  checks.descriptionMissing = descriptionMissing;
  checks.spDescriptionMissing = spDescriptionMissing;
  if (sourceLevelMismatch) fail('trainingLevelSourceMismatch', `${normalSoldierId}: ${sourceLevelMismatch} primary TrainingTech levels differ from source`);
  if (descriptionMissing) fail('trainingDescriptionMissing', `${normalSoldierId}: ${descriptionMissing} primary descriptions are empty`);
  if (spDescriptionMissing) fail('spDescriptionMissing', `${normalSoldierId}: ${spDescriptionMissing} SP descriptions are empty`);

  const expectedLv5 = sumGoods(tech.levels, 5);
  const expectedLv10 = sumGoods(tech.levels, 10);
  checks.costToLevel5Exact = same(tech.costToLevel5, expectedLv5);
  checks.costToLevel10Exact = same(tech.costToLevel10, expectedLv10);
  if (!checks.costToLevel5Exact || !checks.costToLevel10Exact) fail('trainingCostMismatch', `${normalSoldierId}: Lv5/Lv10 derived costs do not equal per-level totals`);

  return { checks, primaryTechId: profile.primaryTenLevelTechId };
}

function expectedDecodedMission(missionId) {
  const m = missionById.get(missionId);
  if (!m) return null;
  const out = { ...m, typeName: missionTypeName(m.missionType) };
  if (m.missionType === 73) {
    out.submitBundleId = m.param1;
    out.submitItems = submitById.get(m.param1)?.items ?? null;
  }
  return out;
}

function compareMissionList(generatedMissions, sourceIds) {
  if ((generatedMissions ?? []).length !== sourceIds.length) return false;
  for (let i = 0; i < sourceIds.length; i++) {
    const expected = expectedDecodedMission(sourceIds[i]);
    if (!expected || !same(generatedMissions[i], expected)) return false;
  }
  return true;
}

function validateSpFixture(fixture) {
  const normalId = fixture.soldierId;
  const spId = fixture.spSoldierId;
  const sourceRelation = spByNormal.get(normalId);
  const generatedRelation = spRelationByNormal.get(normalId);
  const normalBase = compareBaseRecord(fixture, normalId, false);
  const spBase = compareBaseRecord(fixture, spId, true);
  const training = validateTraining(fixture, normalId, true);
  const checks = { ...normalBase.checks, ...training.checks };

  checks.sourceLinkExact = Boolean(sourceRelation && sourceRelation.spSoldierId === spId && spById.get(spId)?.normalSoldierId === normalId);
  if (!checks.sourceLinkExact) fail('spSourceLinkMismatch', `${normalId}<->${spId}: source SP_FORM_LINK mismatch`);

  checks.generatedLinkExact = Boolean(
    generatedRelation &&
    generatedRelation.normalSoldierId === normalId &&
    generatedRelation.spSoldierId === spId &&
    normalBase.generated?.spRelation?.normalSoldierId === normalId &&
    normalBase.generated?.spRelation?.spSoldierId === spId &&
    spBase.generated?.spRelation?.normalSoldierId === normalId &&
    spBase.generated?.spRelation?.spSoldierId === spId
  );
  if (!checks.generatedLinkExact) fail('spGeneratedLinkMismatch', `${normalId}<->${spId}: generated SP link mismatch`);

  if (sourceRelation && normalBase.source && spBase.source && generatedRelation) {
    const expectedDelta = {
      hp: spBase.source.hpIni - normalBase.source.hpIni,
      atk: spBase.source.atkIni - normalBase.source.atkIni,
      def: spBase.source.defIni - normalBase.source.defIni,
      mdef: spBase.source.mdefIni - normalBase.source.mdefIni,
      move: spBase.source.movePoint - normalBase.source.movePoint,
      range: spBase.source.attackRange - normalBase.source.attackRange,
    };
    checks.statDeltaExact = same(generatedRelation.statDelta, expectedDelta);
    if (!checks.statDeltaExact) fail('spStatDeltaMismatch', `${normalId}<->${spId}: generated stat delta differs from direct source subtraction`);

    const expectedFirstStage = {
      awakenLevelId: sourceRelation.firstStageAwakenLevelId,
      awakenMaterials: sourceRelation.firstStageAwakenMaterials,
      missions: sourceRelation.firstStageMissionIds.map(expectedDecodedMission),
    };
    checks.firstStageExact = same(generatedRelation.firstStage, expectedFirstStage);
    if (!checks.firstStageExact) fail('firstStageMismatch', `${spId}: first-stage awaken data differs from SPSoldierInfo/MissionInfo`);
    checks.firstStageMissionsExact = compareMissionList(generatedRelation.firstStage?.missions, sourceRelation.firstStageMissionIds);
    if (!checks.firstStageMissionsExact) fail('firstStageMissionMismatch', `${spId}: decoded first-stage missions differ from source`);

    checks.secondStageUnlockExact = generatedRelation.secondStageUnlock === sourceRelation.secondStageUnlock;
    if (!checks.secondStageUnlockExact) fail('secondStageBranchMismatch', `${spId}: SecondStageUnlock branch mismatch`);

    if (!sourceRelation.secondStageUnlock) {
      checks.secondStageAbsent = generatedRelation.secondStage === null;
      checks.rawSecondStageEmpty = (generatedRelation.rawSecondStage?.missionIds?.length ?? 0) === 0 && (generatedRelation.rawSecondStage?.expandHeroIds?.length ?? 0) === 0;
      if (!checks.secondStageAbsent || !checks.rawSecondStageEmpty) fail('secondStageBranchMismatch', `${spId}: first-stage-only fixture leaked second-stage generated data`);
    } else {
      const expectedSecondStage = {
        awakenLevelId: sourceRelation.secondStageAwakenLevelId,
        awakenMaterials: sourceRelation.secondStageAwakenMaterials,
        missions: sourceRelation.secondStageMissionIds.map(expectedDecodedMission),
        expandHeroIds: uniqueSorted(sourceRelation.secondStageExpandHeroIds),
      };
      checks.secondStageExact = same(generatedRelation.secondStage, expectedSecondStage);
      if (!checks.secondStageExact) fail('secondStageMismatch', `${spId}: second-stage awaken/expand data differs from source`);
      checks.secondStageMissionsExact = compareMissionList(generatedRelation.secondStage?.missions, sourceRelation.secondStageMissionIds);
      if (!checks.secondStageMissionsExact) fail('secondStageMissionMismatch', `${spId}: decoded second-stage missions differ from source`);
    }
  }

  return { checks, primaryTrainingTechId: training.primaryTechId };
}

for (const fixture of fixturePlan.fixtures ?? []) {
  const relationFixtureId = fixture.spSoldierId ?? fixture.soldierId;
  const reusedRelationFixture = sharedFixtureBySoldier.get(relationFixtureId);
  const relationReusePass = sharedValidation.status === 'PASS' && reusedRelationFixture?.status === 'PASS';
  if (!relationReusePass) fail('sharedRelationFixtureReuseFailure', `${fixture.nameKr}: A-8 shared relation fixture is not reusable PASS evidence`);

  if (fixture.spSoldierId == null) {
    const base = compareBaseRecord(fixture, fixture.soldierId, false);
    const training = validateTraining(fixture, fixture.soldierId, false);
    const noSpSource = !spByNormal.has(fixture.soldierId);
    const noGeneratedSp = base.generated?.spRelation == null;
    if (!noSpSource || !noGeneratedSp) fail('normalOnlySpLeak', `${fixture.soldierId}: normal-only fixture unexpectedly has SP structure`);
    fixtureResults.push({
      soldierId: fixture.soldierId,
      nameKr: fixture.nameKr,
      fixtureKind: fixture.fixtureKind,
      relationFixtureReuse: { source: 'A-8', status: relationReusePass ? 'PASS' : 'FAIL' },
      primaryTrainingTechId: training.primaryTechId,
      checks: { ...base.checks, ...training.checks, noSpSource, noGeneratedSp },
    });
  } else {
    const result = validateSpFixture(fixture);
    fixtureResults.push({
      soldierId: fixture.soldierId,
      spSoldierId: fixture.spSoldierId,
      nameKr: fixture.nameKr,
      fixtureKind: fixture.fixtureKind,
      relationFixtureReuse: { source: 'A-8', status: relationReusePass ? 'PASS' : 'FAIL' },
      primaryTrainingTechId: result.primaryTrainingTechId,
      checks: result.checks,
    });
  }
}

for (const fixture of fixtureResults) {
  fixture.status = Object.values(fixture.checks).every((v) => v === true || v === 0) && fixture.relationFixtureReuse.status === 'PASS' ? 'PASS' : 'FAIL';
}

const output = {
  version: 1,
  stage: 'soldier-page-4-7',
  status: errors.length ? 'FAIL' : 'PASS',
  generatedAt: new Date().toISOString(),
  purpose: 'Representative Soldier-domain fixture regression after shared relation adoption. Reuse A-8 relation fixture PASS evidence and independently validate Soldier stats, TrainingTech, SP descriptions, SP missions and awaken branches against current direct JSON.',
  sources: {
    fixturePlan: 'data/validation/soldier-representative-fixture-plan.v1.json',
    sharedRelationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
    soldierStage3: 'data/generated/soldier-stage3.v1.json',
    soldierMaster: 'data/generated/soldier-master.v1.json',
    configData: [
      'ConfigDataSoldierInfo',
      'ConfigDataSPSoldierInfo',
      'ConfigDataTrainingTechInfo',
      'ConfigDataTrainingTechLevelInfo',
      'ConfigDataMissionInfo',
      'ConfigDataMissionSumitItemInfo',
    ],
  },
  boundary: {
    relationSemantics: 'REUSE_A8_PASS_ONLY',
    validatedHere: [
      'SoldierInfo -> Stage3 stats/combat/raw fields',
      'TrainingTech primary Lv1-10 source fidelity and Lv5/Lv10 cost derivation',
      'SP primary-path SpSoidlierDescription coverage',
      'explicit NormalSoliderId <-> ID linkage as Soldier-domain structure',
      'SP stat delta',
      'first-stage and second-stage missions/awaken materials/branching',
    ],
    notRecomputedHere: ['final Hero-Soldier membership', 'A-6 canonical relation provenance', 'A-7 index semantics'],
  },
  counts: {
    fixtureCount: fixtureResults.length,
    normalOnly: fixtureResults.filter((x) => x.fixtureKind === 'NORMAL_ONLY').length,
    spFirstStageOnly: fixtureResults.filter((x) => x.fixtureKind === 'SP_FIRST_STAGE_ONLY').length,
    spTwoStage: fixtureResults.filter((x) => x.fixtureKind === 'SP_TWO_STAGE').length,
    fixturePass: fixtureResults.filter((x) => x.status === 'PASS').length,
    fixtureFail: fixtureResults.filter((x) => x.status !== 'PASS').length,
  },
  checks: aggregateChecks,
  fixtures: fixtureResults,
  errors,
  completion: errors.length
    ? 'Representative Soldier-domain fixtures contain source/generated regressions.'
    : 'All five representative fixtures reuse A-8 relation PASS evidence and independently match current direct JSON for Soldier stats, TrainingTech, SP descriptions, SP missions and awaken branches.',
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
if (errors.length) process.exitCode = 1;
