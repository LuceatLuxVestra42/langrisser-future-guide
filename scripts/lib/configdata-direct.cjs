const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_DIR = path.join(ROOT, 'data', 'configdata');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function configPath(name) {
  return path.join(CONFIG_DIR, `${name}.json`);
}

function loadArray(name) {
  const p = configPath(name);
  const data = readJson(p);
  if (!Array.isArray(data)) {
    const legacy = data && typeof data === 'object' && ('m_bytes' in data || 'm_Name' in data);
    throw new Error(`${name}: expected UnityDataTool direct JSON array${legacy ? '; legacy TextAsset wrapper detected' : ''}`);
  }
  return data;
}

function number(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function boolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function array(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function numberArray(value) {
  return array(value).filter(Number.isFinite);
}

function goodsList(value) {
  return array(value).map((g) => ({
    goodsType: number(g?.GoodsType),
    itemId: number(g?.Id),
    count: number(g?.Count),
  }));
}

function loadSoldiers() {
  return loadArray('ConfigDataSoldierInfo').map((r, sourceIndex) => ({
    sourceIndex,
    soldierId: number(r.ID),
    nameCn: r.Name ?? '',
    skills: numberArray(r.Skills_ID),
    armyId: number(r.Army_ID),
    isMelee: boolean(r.IsMelee),
    moveType: number(r.MoveType),
    attackRange: number(r.BF_AttackDistance),
    attackSpeedIni: number(r.AttackSPD_INI),
    moveSpeedIni: number(r.MoveSPD_INI),
    hpIni: number(r.HP_INI),
    atkIni: number(r.AT_INI),
    defIni: number(r.DF_INI),
    mdefIni: number(r.MagicDF_INI),
    hpUp: number(r.HP_UP),
    atkUp: number(r.AT_UP),
    defUp: number(r.DF_UP),
    mdefUp: number(r.MagicDF_UP),
    criticalDamage: number(r.CriticalDamage),
    criticalRate: number(r.CriticalRate ?? r.Critical),
    movePoint: number(r.BF_MovePoint),
    tier: number(r.Rank),
    isEnemy: boolean(r.IsEnemy),
    baseHeroIds: numberArray(r.GetSoldierHeros_ID),
    getSoldierTechId: number(r.GetSoldierTechId),
    useable: boolean(r.Useable),
  }));
}

function loadSpSoldiers() {
  return loadArray('ConfigDataSPSoldierInfo').map((r, sourceIndex) => ({
    sourceIndex,
    spSoldierId: number(r.ID),
    normalSoldierId: number(r.NormalSoliderId),
    firstStageMissionIds: numberArray(r.FisrtStageMissionList),
    firstStageAwakenMaterials: goodsList(r.FisrtStageAwakenMaterial),
    firstStageAwakenLevelId: number(r.FisrtStageAwakenLevelID),
    secondStageUnlock: boolean(r.SecondStageUnlock),
    secondStageMissionIds: numberArray(r.SecondStageMissionList),
    secondStageAwakenMaterials: goodsList(r.SecondStageAwakenMaterial),
    secondStageAwakenLevelId: number(r.SecondStageAwakenLevellID),
    secondStageExpandHeroIds: numberArray(r.SecondStageExpandHeroList),
    useable: boolean(r.Useable, true),
  }));
}

function loadArmies() {
  return loadArray('ConfigDataArmyInfo').map((r, sourceIndex) => ({
    sourceIndex,
    armyId: number(r.ID),
    name: r.Name ?? '',
    armyTag: number(r.ArmyTag),
  }));
}

function loadTrainingTechs() {
  return loadArray('ConfigDataTrainingTechInfo').map((r, sourceIndex) => ({
    sourceIndex,
    techId: number(r.ID),
    name: r.Name ?? '',
    preTechIds: numberArray(r.PreTechIDs),
    preTechLevels: numberArray(r.PreTechLevel),
    roomLevelRequired: number(r.RoomLevelRequired),
    soldierIds: numberArray(r.SoldierIDRelated),
    armyIds: numberArray(r.ArmyIDRelated),
    isSummon: boolean(r.IsSummon),
    techType: number(r.TechType),
    levelInfoIds: numberArray(r.TechLevelupInfoList),
    isLocked: boolean(r.IsLocked),
  }));
}

function loadTrainingLevels() {
  return loadArray('ConfigDataTrainingTechLevelInfo').map((r, sourceIndex) => ({
    sourceIndex,
    levelInfoId: number(r.ID),
    description: r.Description ?? '',
    spDescription: r.SpSoidlierDescription ?? '',
    preTechId: number(numberArray(r.PreTechIDs)[0]),
    gold: number(r.LevelupGoldCost),
    materials: goodsList(r.LevelupMaterialsCost),
    roomExp: number(r.RoomExp),
    soldierIdUnlocked: number(r.SoldierIDUnlocked),
    soldierSkillLevel: number(r.SoldierSkillLevelup),
    soldierSkillId: number(r.SoldierSkillID),
  }));
}

function loadMissions() {
  return loadArray('ConfigDataMissionInfo').map((r, sourceIndex) => ({
    sourceIndex,
    missionId: number(r.ID),
    title: r.Title ?? '',
    desc: r.Desc ?? '',
    missionType: number(r.MissionType),
    param1: number(r.Param1),
    param2: number(r.Param2),
    param3: number(r.Param3),
    param4: number(r.Param4),
    param5: numberArray(r.Param5),
    param6: numberArray(r.Param6),
  }));
}

function loadMissionSubmitBundles() {
  return loadArray('ConfigDataMissionSumitItemInfo').map((r, sourceIndex) => ({
    sourceIndex,
    bundleId: number(r.ID),
    items: goodsList(r.Items),
  }));
}

function loadSpHeroes() {
  return loadArray('ConfigDataSPHeroInfo').map((r, sourceIndex) => ({
    sourceIndex,
    spHeroInfoId: number(r.ID),
    heroId: number(r.ID),
    heroInformationId: number(r.HeroInformation_ID),
    nameCn: r.Name ?? '',
    rewardSoldierIds: numberArray(r.SecondStageRewardSoldiers),
  }));
}

module.exports = {
  ROOT,
  CONFIG_DIR,
  readJson,
  configPath,
  loadArray,
  loadSoldiers,
  loadSpSoldiers,
  loadArmies,
  loadTrainingTechs,
  loadTrainingLevels,
  loadMissions,
  loadMissionSubmitBundles,
  loadSpHeroes,
};
