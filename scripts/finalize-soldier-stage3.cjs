const fs = require('fs');
const path = require('path');
const {
  ROOT,
  configPath,
  readJson,
  loadSoldiers,
  loadSpSoldiers,
  loadTrainingTechs,
  loadTrainingLevels,
  loadMissions,
  loadMissionSubmitBundles,
  loadSpHeroes,
} = require('./lib/configdata-direct.cjs');

const SOLDIER_PATH = configPath('ConfigDataSoldierInfo');
const SP_SOLDIER_PATH = configPath('ConfigDataSPSoldierInfo');
const TRAINING_PATH = configPath('ConfigDataTrainingTechInfo');
const TRAINING_LEVEL_PATH = configPath('ConfigDataTrainingTechLevelInfo');
const MISSION_PATH = configPath('ConfigDataMissionInfo');
const MISSION_SUBMIT_PATH = configPath('ConfigDataMissionSumitItemInfo');
const SP_HERO_PATH = configPath('ConfigDataSPHeroInfo');
const SOLDIER_MASTER_PATH = path.join(ROOT, 'data/generated/soldier-master.v1.json');
const HERO_MASTER_PATH = path.join(ROOT, 'data/hero-name-master.v1.json');
const OUT_DATA = path.join(ROOT, 'data/generated/soldier-stage3.v1.json');
const OUT_VALIDATION = path.join(ROOT, 'data/validation/soldier-stage3-final.v1.json');

function rel(p) { return p.replace(ROOT + path.sep, '').replaceAll('\\', '/'); }
function uniqueSorted(xs) { return [...new Set(xs)].sort((a,b)=>a-b); }
function duplicates(xs) { const s=new Set(), d=new Set(); for (const x of xs) s.has(x)?d.add(x):s.add(x); return [...d]; }
function sumGoods(levels, limit) {
  const picked = levels.slice(0, limit);
  const byKey = new Map(); let gold = 0;
  for (const l of picked) {
    gold += l.gold;
    for (const g of l.materials) {
      const k = `${g.goodsType}:${g.itemId}`;
      const prev = byKey.get(k) ?? {goodsType:g.goodsType,itemId:g.itemId,count:0};
      prev.count += g.count; byKey.set(k, prev);
    }
  }
  return {levelsIncluded:picked.length,gold,materials:[...byKey.values()].sort((a,b)=>a.goodsType-b.goodsType||a.itemId-b.itemId)};
}
function missionTypeName(t) {
  if (t === 73) return 'SUBMIT_ITEMS';
  if (t === 123) return 'USABLE_HERO_LEVEL';
  if (t === 124) return 'EXPANDED_HERO_BOND';
  return 'OTHER';
}

const errors = [], reviews = [];
const soldiers = loadSoldiers();
const spSoldiers = loadSpSoldiers();
const trainings = loadTrainingTechs();
const trainingLevels = loadTrainingLevels();
const missions = loadMissions();
const submitBundles = loadMissionSubmitBundles();
const spHeroes = loadSpHeroes();

const soldierMaster = readJson(SOLDIER_MASTER_PATH).records;
const heroMaster = readJson(HERO_MASTER_PATH).records;
const heroIds = new Set(heroMaster.map(x=>x.heroId));
const masterById = new Map(soldierMaster.map(x=>[x.soldierId,x]));
const displayIds = new Set(masterById.keys());
const normalMaster = soldierMaster.filter(x=>!x.isSp);
const spMaster = soldierMaster.filter(x=>x.isSp);
const soldierById = new Map(soldiers.map(x=>[x.soldierId,x]));
const spByNormal = new Map(spSoldiers.map(x=>[x.normalSoldierId,x]));
const spById = new Map(spSoldiers.map(x=>[x.spSoldierId,x]));
const trainingLevelById = new Map(trainingLevels.map(x=>[x.levelInfoId,x]));
const trainingBySoldier = new Map();
for (const t of trainings) for (const sid of t.soldierIds) {
  if(!trainingBySoldier.has(sid)) trainingBySoldier.set(sid,[]);
  trainingBySoldier.get(sid).push(t);
}
const missionById = new Map(missions.map(x=>[x.missionId,x]));
const submitById = new Map(submitBundles.map(x=>[x.bundleId,x]));
const spHeroAddedBySoldier = new Map();
for (const h of spHeroes) for (const sid of h.rewardSoldierIds) {
  if(!spHeroAddedBySoldier.has(sid)) spHeroAddedBySoldier.set(sid,[]);
  spHeroAddedBySoldier.get(sid).push(h.heroId);
}

function decodeMission(id) {
  const m = missionById.get(id);
  if (!m) return {missionId:id,missing:true};
  const out = {...m, typeName:missionTypeName(m.missionType)};
  if (m.missionType === 73) {
    out.submitBundleId = m.param1;
    out.submitItems = submitById.get(m.param1)?.items ?? null;
  }
  return out;
}

const duplicateSoldierIds = duplicates(soldiers.map(x=>x.soldierId));
if (duplicateSoldierIds.length) errors.push(`duplicate SoldierInfo IDs: ${duplicateSoldierIds.join(',')}`);
for (const m of soldierMaster) if (!soldierById.has(m.soldierId)) errors.push(`soldier master ID ${m.soldierId} missing SoldierInfo`);
for (const s of soldiers.filter(x=>x.useable&&!x.isEnemy)) if (!displayIds.has(s.soldierId)) errors.push(`displayable SoldierInfo ${s.soldierId} missing stage2 master`);

const records = soldierMaster.map(m=>{
  const s = soldierById.get(m.soldierId);
  const relation = m.isSp ? spById.get(m.soldierId) : spByNormal.get(m.soldierId);
  const baseSourceId = m.isSp && relation ? relation.normalSoldierId : m.soldierId;
  const baseSource = soldierById.get(baseSourceId);
  const rawBase = s?.baseHeroIds ?? [];
  const inheritedBase = baseSource?.baseHeroIds ?? [];
  const spHeroAdded = uniqueSorted(spHeroAddedBySoldier.get(m.soldierId) ?? []);
  return {
    soldierId:m.soldierId,
    stats:{hp:s.hpIni,atk:s.atkIni,def:s.defIni,mdef:s.mdefIni,move:s.movePoint,range:s.attackRange},
    combat:{armyId:s.armyId,tier:s.tier,isMelee:s.isMelee,moveType:s.moveType},
    raw:{attackSpeedIni:s.attackSpeedIni,moveSpeedIni:s.moveSpeedIni,hpUp:s.hpUp,atkUp:s.atkUp,defUp:s.defUp,mdefUp:s.mdefUp,criticalRate:s.criticalRate,criticalDamage:s.criticalDamage,skills:s.skills,getSoldierTechId:s.getSoldierTechId},
    heroes:{rawGetSoldierHeroIds:uniqueSorted(rawBase),baseHeroSourceSoldierId:baseSourceId,baseHeroIds:uniqueSorted(inheritedBase),spHeroAddedHeroIds:spHeroAdded},
    spRelation:relation?{normalSoldierId:relation.normalSoldierId,spSoldierId:relation.spSoldierId}:null
  };
});

const trainingProfiles = normalMaster.map(m=>{
  const s = soldierById.get(m.soldierId);
  const linked = (trainingBySoldier.get(m.soldierId) ?? []).map(t=>{
    const levels = t.levelInfoIds.map((id,index)=>{
      const x=trainingLevelById.get(id);
      if(!x) return {sequenceLevel:index+1,levelInfoId:id,missing:true};
      return {sequenceLevel:index+1,levelInfoId:id,description:x.description,spDescription:x.spDescription,gold:x.gold,materials:x.materials,roomExp:x.roomExp,soldierIdUnlocked:x.soldierIdUnlocked,soldierSkillLevel:x.soldierSkillLevel,soldierSkillId:x.soldierSkillId};
    });
    return {techId:t.techId,name:t.name,techType:t.techType,armyIds:t.armyIds,roomLevelRequired:t.roomLevelRequired,preTechIds:t.preTechIds,preTechLevels:t.preTechLevels,isSummon:t.isSummon,isLocked:t.isLocked,getSoldierTechIdMatch:s.getSoldierTechId===t.techId,levelInfoIds:t.levelInfoIds,levels,costToLevel5:sumGoods(levels.filter(x=>!x.missing),5),costToLevel10:sumGoods(levels.filter(x=>!x.missing),10)};
  });
  const tenLevel = linked.filter(x=>x.levels.length===10 && x.levels.every((y,i)=>!y.missing && y.soldierSkillLevel===i+1));
  return {soldierId:m.soldierId,getSoldierTechId:s.getSoldierTechId,linkedTechs:linked,primaryTenLevelTechId:tenLevel.length===1?tenLevel[0].techId:null,tenLevelTechIds:tenLevel.map(x=>x.techId)};
});

const spRelations = spSoldiers.map(r=>{
  const normal = soldierById.get(r.normalSoldierId);
  const sp = soldierById.get(r.spSoldierId);
  return {
    normalSoldierId:r.normalSoldierId,spSoldierId:r.spSoldierId,
    statDelta:(normal&&sp)?{hp:sp.hpIni-normal.hpIni,atk:sp.atkIni-normal.atkIni,def:sp.defIni-normal.defIni,mdef:sp.mdefIni-normal.mdefIni,move:sp.movePoint-normal.movePoint,range:sp.attackRange-normal.attackRange}:null,
    firstStage:{awakenLevelId:r.firstStageAwakenLevelId,awakenMaterials:r.firstStageAwakenMaterials,missions:r.firstStageMissionIds.map(decodeMission)},
    secondStageUnlock:r.secondStageUnlock,
    secondStage:r.secondStageUnlock?{awakenLevelId:r.secondStageAwakenLevelId,awakenMaterials:r.secondStageAwakenMaterials,missions:r.secondStageMissionIds.map(decodeMission),expandHeroIds:uniqueSorted(r.secondStageExpandHeroIds)}:null,
    rawSecondStage:{missionIds:r.secondStageMissionIds,expandHeroIds:r.secondStageExpandHeroIds}
  };
});

let missingTrainingLevelRefs=0, tier3WithoutTraining=0, tier3WithoutTenLevel=0, tier3MultipleTenLevel=0, spNormalWithoutSpText=0;
for (const p of trainingProfiles) {
  for (const t of p.linkedTechs) for (const l of t.levels) if (l.missing) missingTrainingLevelRefs++;
  const m=masterById.get(p.soldierId);
  if (m?.tier===3) {
    if (!p.linkedTechs.length) { tier3WithoutTraining++; errors.push(`tier3 soldier ${p.soldierId} has no TrainingTech SoldierIDRelated link`); }
    if (!p.tenLevelTechIds.length) { tier3WithoutTenLevel++; errors.push(`tier3 soldier ${p.soldierId} has no Lv1-10 soldier-skill TrainingTech path`); }
    if (p.tenLevelTechIds.length>1) { tier3MultipleTenLevel++; reviews.push(`tier3 soldier ${p.soldierId} has multiple Lv1-10 soldier-skill TrainingTech paths: ${p.tenLevelTechIds.join(',')}`); }
  }
  if (spByNormal.has(p.soldierId) && p.primaryTenLevelTechId) {
    const t=p.linkedTechs.find(x=>x.techId===p.primaryTenLevelTechId);
    if (t && !t.levels.some(x=>x.spDescription)) { spNormalWithoutSpText++; reviews.push(`SP normal soldier ${p.soldierId} has no SP description on primary 10-level path`); }
  }
}
if (missingTrainingLevelRefs) errors.push(`${missingTrainingLevelRefs} TrainingTech level references are missing`);

let missingBaseHeroIds=0, missingSpHeroIds=0, missingRewardSoldiers=0, missingExpandHeroIds=0;
for (const r of records) for (const hid of r.heroes.baseHeroIds) if(!heroIds.has(hid)){missingBaseHeroIds++; reviews.push(`soldier ${r.soldierId} base hero ${hid} missing hero master`);}
for (const h of spHeroes) {
  if (h.rewardSoldierIds.length && !heroIds.has(h.heroId)) { missingSpHeroIds++; errors.push(`SPHeroInfo ID ${h.heroId} missing canonical hero master`); }
  for (const sid of h.rewardSoldierIds) if(!displayIds.has(sid)){missingRewardSoldiers++; errors.push(`SP hero ${h.heroId} reward soldier ${sid} missing displayable soldier master`);}
}
for (const r of spSoldiers) for(const hid of r.secondStageExpandHeroIds) if(!heroIds.has(hid)){missingExpandHeroIds++; reviews.push(`SP soldier ${r.spSoldierId} expanded hero ${hid} missing hero master`);}

const duplicateSpIds=duplicates(spSoldiers.map(x=>x.spSoldierId));
const duplicateSpNormals=duplicates(spSoldiers.map(x=>x.normalSoldierId));
if(duplicateSpIds.length) errors.push(`duplicate SPSoldierInfo IDs: ${duplicateSpIds.join(',')}`);
if(duplicateSpNormals.length) errors.push(`normal soldiers with multiple SPSoldierInfo rows: ${duplicateSpNormals.join(',')}`);
let missingNormalSoldier=0, missingSpSoldier=0, missingMissionRefs=0, missingSubmitBundles=0, stage1MissionCountMismatch=0, stage2MissionCountMismatch=0, falseWithStage2Data=0;
const spMissionTypes=new Map();
for(const r of spSoldiers){
  if(!soldierById.has(r.normalSoldierId)){missingNormalSoldier++; errors.push(`SP relation normal soldier missing ${r.normalSoldierId}`);}
  if(!soldierById.has(r.spSoldierId)){missingSpSoldier++; errors.push(`SP relation SP soldier missing ${r.spSoldierId}`);}
  if(r.firstStageMissionIds.length!==2){stage1MissionCountMismatch++; reviews.push(`SP soldier ${r.spSoldierId} stage1 mission count ${r.firstStageMissionIds.length}`);}
  if(r.secondStageUnlock && r.secondStageMissionIds.length!==1){stage2MissionCountMismatch++; reviews.push(`SP soldier ${r.spSoldierId} stage2 mission count ${r.secondStageMissionIds.length}`);}
  if(!r.secondStageUnlock && (r.secondStageMissionIds.length||r.secondStageExpandHeroIds.length||r.secondStageAwakenMaterials.length)){falseWithStage2Data++; reviews.push(`SP soldier ${r.spSoldierId} has stage2 data while SecondStageUnlock=false`);}
  for(const mid of [...r.firstStageMissionIds,...r.secondStageMissionIds]){
    const m=missionById.get(mid); if(!m){missingMissionRefs++; errors.push(`SP soldier ${r.spSoldierId} mission ${mid} missing MissionInfo`);continue;}
    spMissionTypes.set(m.missionType,(spMissionTypes.get(m.missionType)||0)+1);
    if(m.missionType===73 && !submitById.has(m.param1)){missingSubmitBundles++; errors.push(`mission ${mid} submit bundle ${m.param1} missing MissionSumitItemInfo`);}
  }
}

const secondStageTrue=spSoldiers.filter(x=>x.secondStageUnlock).length;
const secondStageFalse=spSoldiers.length-secondStageTrue;
if(spSoldiers.length!==56) reviews.push(`SPSoldierInfo count changed from validated snapshot 56 to ${spSoldiers.length}`);
if(secondStageTrue!==45||secondStageFalse!==11) reviews.push(`SP stage split changed from validated snapshot 45/11 to ${secondStageTrue}/${secondStageFalse}`);

const generatedAt = new Date().toISOString();
const output={
  version:1,stage:'3-1~3-11',status:'PENDING_VALIDATION',generatedAt,
  sources:{soldier:rel(SOLDIER_PATH),spSoldier:rel(SP_SOLDIER_PATH),training:rel(TRAINING_PATH),trainingLevel:rel(TRAINING_LEVEL_PATH),mission:rel(MISSION_PATH),missionSubmit:rel(MISSION_SUBMIT_PATH),spHero:rel(SP_HERO_PATH),soldierMaster:rel(SOLDIER_MASTER_PATH),heroMaster:rel(HERO_MASTER_PATH)},
  records,trainingProfiles,spRelations,spHeroRewards:spHeroes.filter(x=>x.rewardSoldierIds.length).map(x=>({spHeroInfoId:x.spHeroInfoId,heroId:x.heroId,heroInformationId:x.heroInformationId,nameCn:x.nameCn,rewardSoldierIds:uniqueSorted(x.rewardSoldierIds)}))
};

const summary={
  version:1,stage:'3-1~3-11',status:errors.length?'FAIL':(reviews.length?'PASS_WITH_REVIEW':'PASS'),generatedAt,sources:output.sources,
  counts:{
    sourceSoldiers:soldiers.length,displayableSoldiers:soldierMaster.length,normalDisplayable:normalMaster.length,spDisplayable:spMaster.length,
    trainingTechRecords:trainings.length,trainingLevelRecords:trainingLevels.length,missionRecords:missions.length,missionSubmitBundles:submitBundles.length,spSoldierRecords:spSoldiers.length,spHeroRecords:spHeroes.length,
    tier3Normal:normalMaster.filter(x=>x.tier===3).length,tier3WithoutTraining,tier3WithoutTenLevel,tier3MultipleTenLevel,spNormalsWithoutSpDescription:spNormalWithoutSpText,
    baseHeroEdges:records.reduce((n,x)=>n+x.heroes.baseHeroIds.length,0),spHeroRewardEdges:spHeroes.reduce((n,x)=>n+x.rewardSoldierIds.length,0),spExpandHeroEdges:spSoldiers.reduce((n,x)=>n+x.secondStageExpandHeroIds.length,0),
    secondStageTrue,secondStageFalse,spMissionTypes:Object.fromEntries([...spMissionTypes.entries()].sort((a,b)=>a[0]-b[0]))
  },
  checks:{duplicateSoldierIds:duplicateSoldierIds.length,missingTrainingLevelRefs,missingBaseHeroIds,missingSpHeroIds,missingRewardSoldiers,missingExpandHeroIds,duplicateSpIds:duplicateSpIds.length,duplicateSpNormalIds:duplicateSpNormals.length,missingNormalSoldier,missingSpSoldier,missingMissionRefs,missingSubmitBundles,stage1MissionCountMismatch,stage2MissionCountMismatch,falseWithStage2Data,spHeroMappingUnmapped:missingSpHeroIds,spHeroMappingAmbiguous:0},
  corrections:[
    '4-1 input migration: ConfigData is consumed from UnityDataTool direct JSON arrays; legacy TextAsset m_Name/m_size/m_bytes and protobuf field-number decoding are no longer used.',
    '3-2 level numbering: sequence follows TrainingTechInfo.TechLevelupInfoList order. SoldierSkillLevelup is preserved as an independent skill-level field for validation.',
    '3-3 primary growth path: SoldierIDRelated can include shared passive/status techs. The soldier-specific Lv1-10 path is the unique linked tech whose TrainingTechLevelInfo.SoldierSkillLevelup sequence is 1..10.',
    '3-6 hero mapping: ConfigDataSPHeroInfo.ID is the canonical Hero ID/key. HeroInformation_ID is separate metadata and is not used to identify the hero for SecondStageRewardSoldiers.',
    '3-5/3-6/3-11 remain separate directed edge sources; stage 3 does not synthesize the final Hero<->Soldier union reserved for 3-12.'
  ],
  policy:{
    inputFormat:'UnityDataTool direct JSON arrays; no TextAsset m_bytes/protobuf parsing.',
    stats:'3-1 uses SoldierInfo *_INI, BF_MovePoint and BF_AttackDistance; *_UP and IsMelee are preserved but not substituted.',
    normalAbility:'3-2 uses TrainingTechLevelInfo.Description in TechLevelupInfoList sequence.',
    trainingJoin:'3-3 reverse-joins TrainingTechInfo.SoldierIDRelated; the soldier-specific Lv1~10 path is selected by SoldierSkillLevelup sequence 1..10. GetSoldierTechId remains validation metadata only.',
    costs:'3-4 preserves per-level LevelupGoldCost/LevelupMaterialsCost and derives Lv5/Lv10 sums per linked tech.',
    baseHeroes:'3-5 uses Normal SoldierInfo.GetSoldierHeros_ID; SP Soldier inherits its Normal base list.',
    spHeroSoldiers:'3-6 uses ConfigDataSPHeroInfo.ID as canonical Hero ID and reverse-indexes SecondStageRewardSoldiers by Soldier ID.',
    spRelation:'3-7 uses SPSoldierInfo.NormalSoliderId <-> ID; no +5000 arithmetic inference.',
    spAbility:'3-8 uses TrainingTechLevelInfo.SpSoidlierDescription directly.',
    spStage1:'3-9 uses SPSoldierInfo.FisrtStageMissionList -> MissionInfo; type 73 joins Param1 -> MissionSumitItemInfo.ID.',
    spStage2:'3-10 uses SecondStageUnlock as authoritative branch.',
    spExpandHeroes:'3-11 uses SecondStageExpandHeroList only as newly expanded heroes, not the full hero list.'
  },
  errors,reviews
};
output.status=summary.status;
fs.mkdirSync(path.dirname(OUT_DATA),{recursive:true}); fs.mkdirSync(path.dirname(OUT_VALIDATION),{recursive:true});
fs.writeFileSync(OUT_DATA,JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(OUT_VALIDATION,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(errors.length) process.exit(1);
