'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const cfg = n => path.join(ROOT, 'data', 'configdata', `${n}.json`);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const arr = v => Array.isArray(v) ? v : [];
const uniq = xs => [...new Set(xs)];
const duplicates = xs => { const s=new Set(),d=new Set(); for(const x of xs){ if(s.has(x)) d.add(x); else s.add(x); } return [...d]; };

const soldiers = read(cfg('ConfigDataSoldierInfo'));
const spSoldiers = read(cfg('ConfigDataSPSoldierInfo'));
const trainings = read(cfg('ConfigDataTrainingTechInfo'));
const trainingLevels = read(cfg('ConfigDataTrainingTechLevelInfo'));
const missions = read(cfg('ConfigDataMissionInfo'));
const submitBundles = read(cfg('ConfigDataMissionSumitItemInfo'));
const spHeroes = read(cfg('ConfigDataSPHeroInfo'));
const soldierMaster = read(path.join(ROOT,'data/generated/soldier-master.v1.json')).records;
const heroMaster = read(path.join(ROOT,'data/hero-name-master.v1.json')).records;

const soldierById = new Map(soldiers.map(x=>[x.ID,x]));
const spById = new Map(spSoldiers.map(x=>[x.ID,x]));
const spByNormal = new Map(spSoldiers.map(x=>[x.NormalSoliderId,x]));
const trainingLevelById = new Map(trainingLevels.map(x=>[x.ID,x]));
const missionById = new Map(missions.map(x=>[x.ID,x]));
const submitById = new Map(submitBundles.map(x=>[x.ID,x]));
const masterById = new Map(soldierMaster.map(x=>[x.soldierId,x]));
const heroIds = new Set(heroMaster.map(x=>x.heroId));
const displaySource = soldiers.filter(x=>x.Useable===true && x.IsEnemy!==true);
const displayIds = new Set(displaySource.map(x=>x.ID));
const normalMaster = soldierMaster.filter(x=>!x.isSp);
const spMaster = soldierMaster.filter(x=>x.isSp);
const tier3Normal = normalMaster.filter(x=>x.tier===3);

const errors=[]; const reviews=[];
const checks={};
function fail(name, items){ checks[name]=items.length; if(items.length) errors.push(`${name}: ${items.slice(0,20).join(', ')}`); }
function review(name, items){ checks[name]=items.length; if(items.length) reviews.push(`${name}: ${items.slice(0,20).join(', ')}`); }

// 4-1: direct SPSoldierInfo parse/integrity.
fail('duplicateSpIds', duplicates(spSoldiers.map(x=>x.ID)));
fail('duplicateSpNormalIds', duplicates(spSoldiers.map(x=>x.NormalSoliderId)));
fail('spMissingNormalSoldier', spSoldiers.filter(x=>!soldierById.has(x.NormalSoliderId)).map(x=>x.ID));
fail('spMissingSpSoldier', spSoldiers.filter(x=>!soldierById.has(x.ID)).map(x=>x.ID));
fail('spNotDisplayable', spSoldiers.filter(x=>!displayIds.has(x.ID)).map(x=>x.ID));

// Master/source identity consistency.
fail('masterMissingSource', soldierMaster.filter(x=>!soldierById.has(x.soldierId)).map(x=>x.soldierId));
fail('displaySourceMissingMaster', displaySource.filter(x=>!masterById.has(x.ID)).map(x=>x.ID));
fail('spMasterMissingSPSoldierInfo', spMaster.filter(x=>!spById.has(x.soldierId)).map(x=>x.soldierId));

// 4-2: Normal <-> SP relation consistency.
const badMasterRelations=[];
for(const r of spSoldiers){
  const sm=masterById.get(r.ID), nm=masterById.get(r.NormalSoliderId);
  if(!sm || !nm || sm.isSp!==true || nm.isSp===true) { badMasterRelations.push(`${r.NormalSoliderId}->${r.ID}`); continue; }
  if(sm.normalSoldierId!=null && sm.normalSoldierId!==r.NormalSoliderId) badMasterRelations.push(`${r.NormalSoliderId}->${r.ID}:spMasterNormal=${sm.normalSoldierId}`);
  if(nm.spSoldierId!=null && nm.spSoldierId!==r.ID) badMasterRelations.push(`${r.NormalSoliderId}->${r.ID}:normalMasterSp=${nm.spSoldierId}`);
}
fail('badMasterSpRelations', badMasterRelations);

// 4-3/4-4/4-5: stage structure, mission refs/types, submit bundles.
let secondStageTrue=0, secondStageFalse=0; const missionTypeCounts={};
const badFirstMissionCount=[], badSecondMissionCount=[], falseWithSecondData=[], missingMissionRefs=[], missingSubmitBundles=[], emptySubmitBundles=[];
const missingExpandHeroIds=[];
for(const r of spSoldiers){
  const first=arr(r.FisrtStageMissionList), second=arr(r.SecondStageMissionList);
  if(first.length!==2) badFirstMissionCount.push(`${r.ID}:${first.length}`);
  const unlocked=r.SecondStageUnlock===true;
  if(unlocked){ secondStageTrue++; if(second.length!==1) badSecondMissionCount.push(`${r.ID}:${second.length}`); }
  else { secondStageFalse++; if(second.length || arr(r.SecondStageAwakenMaterial).length || arr(r.SecondStageExpandHeroList).length || r.SecondStageAwakenLevellID!=null) falseWithSecondData.push(r.ID); }
  for(const hid of arr(r.SecondStageExpandHeroList)) if(!heroIds.has(hid)) missingExpandHeroIds.push(`${r.ID}:${hid}`);
  for(const mid of [...first,...second]){
    const m=missionById.get(mid);
    if(!m){ missingMissionRefs.push(`${r.ID}:${mid}`); continue; }
    missionTypeCounts[m.MissionType]=(missionTypeCounts[m.MissionType]||0)+1;
    if(m.MissionType===73){
      const b=submitById.get(m.Param1);
      if(!b) missingSubmitBundles.push(`${mid}->${m.Param1}`);
      else if(arr(b.Items).length===0) emptySubmitBundles.push(`${mid}->${m.Param1}`);
    }
  }
}
fail('badFirstStageMissionCount',badFirstMissionCount);
fail('badSecondStageMissionCount',badSecondMissionCount);
fail('secondStageDataWhileLocked',falseWithSecondData);
fail('missingMissionRefs',missingMissionRefs);
fail('missingSubmitBundles',missingSubmitBundles);
review('emptySubmitBundles',emptySubmitBundles);
fail('missingExpandHeroIds',missingExpandHeroIds);

// 4-6: TrainingTech direct links and unique tier-3 Lv1..10 growth path.
const trainingBySoldier=new Map();
for(const t of trainings) for(const sid of arr(t.SoldierIDRelated)){ if(!trainingBySoldier.has(sid)) trainingBySoldier.set(sid,[]); trainingBySoldier.get(sid).push(t); }
const missingTrainingRefs=[], noTraining=[], noUnique10=[], multipleUnique10=[], spNoDescription=[];
const primaryTechBySoldier=new Map();
for(const m of tier3Normal){
  const linked=trainingBySoldier.get(m.soldierId)||[];
  if(!linked.length) noTraining.push(m.soldierId);
  const candidates=[];
  for(const t of linked){
    const ids=arr(t.TechLevelupInfoList); const levels=ids.map(id=>trainingLevelById.get(id));
    for(let i=0;i<levels.length;i++) if(!levels[i]) missingTrainingRefs.push(`${t.ID}:${ids[i]}`);
    if(ids.length===10 && levels.every(Boolean) && levels.every((x,i)=>x.SoldierSkillLevelup===i+1)) candidates.push(t);
  }
  if(candidates.length===0) noUnique10.push(m.soldierId);
  if(candidates.length>1) multipleUnique10.push(`${m.soldierId}:${candidates.map(x=>x.ID).join('|')}`);
  if(candidates.length===1) primaryTechBySoldier.set(m.soldierId,candidates[0]);
}
for(const r of spSoldiers){
  const t=primaryTechBySoldier.get(r.NormalSoliderId); if(!t) continue;
  const levels=arr(t.TechLevelupInfoList).map(id=>trainingLevelById.get(id)).filter(Boolean);
  if(!levels.some(x=>typeof x.SpSoidlierDescription==='string' && x.SpSoidlierDescription.length>0)) spNoDescription.push(r.NormalSoliderId);
}
fail('missingTrainingLevelRefs',uniq(missingTrainingRefs));
fail('tier3WithoutTraining',noTraining);
fail('tier3WithoutUnique10LevelPath',noUnique10);
fail('tier3WithMultiple10LevelPaths',multipleUnique10);
fail('spNormalWithoutSpDescription',spNoDescription);

// 4-7: effective Korean name resolution. Tier-3 normal must be confirmed; SP may inherit paired normal name.
const tier3NameMissing=tier3Normal.filter(x=>!(x.nameKr && x.nameKrStatus==='confirmed')).map(x=>x.soldierId);
const spEffectiveNameMissing=spMaster.filter(x=>{
  if(x.nameKr) return false;
  const n=masterById.get(x.normalSoldierId); return !(n && n.nameKr);
}).map(x=>x.soldierId);
fail('tier3NormalKoreanNameMissing',tier3NameMissing);
fail('spEffectiveKoreanNameMissing',spEffectiveNameMissing);

// SPHero reward soldier edges used by current soldier relation data.
const missingSpHeroIds=[], missingRewardSoldiers=[]; let spHeroRewardEdges=0;
for(const h of spHeroes){
  const rewards=arr(h.SecondStageRewardSoldiers); spHeroRewardEdges+=rewards.length;
  if(rewards.length && !heroIds.has(h.ID)) missingSpHeroIds.push(h.ID);
  for(const sid of rewards) if(!displayIds.has(sid)) missingRewardSoldiers.push(`${h.ID}:${sid}`);
}
fail('missingSpHeroIds',missingSpHeroIds);
fail('missingSpHeroRewardSoldiers',missingRewardSoldiers);

const expectedMissionTypes={'73':56,'123':56,'124':45};
for(const [k,v] of Object.entries(expectedMissionTypes)) if((missionTypeCounts[k]||0)!==v) errors.push(`missionType ${k}: expected ${v}, got ${missionTypeCounts[k]||0}`);
if(spSoldiers.length!==56) reviews.push(`SP soldier count changed: ${spSoldiers.length}`);
if(secondStageTrue!==45 || secondStageFalse!==11) reviews.push(`SP second-stage split changed: ${secondStageTrue}/${secondStageFalse}`);

const result={
  version:1,
  stage:'soldier-page-4-1~4-7-prereq-recheck',
  status:errors.length?'FAIL':reviews.length?'PASS_WITH_REVIEW':'PASS',
  generatedAt:new Date().toISOString(),
  counts:{
    sourceSoldiers:soldiers.length,displayableSoldiers:displaySource.length,soldierMaster:soldierMaster.length,
    normalMaster:normalMaster.length,spMaster:spMaster.length,tier3Normal:tier3Normal.length,spSoldierRecords:spSoldiers.length,
    secondStageTrue,secondStageFalse,trainingTechRecords:trainings.length,trainingLevelRecords:trainingLevels.length,
    missionRecords:missions.length,missionSubmitBundles:submitBundles.length,spHeroRecords:spHeroes.length,spHeroRewardEdges,
    missionTypeCounts
  },
  checks,errors,reviews,
  policy:{
    spRelation:'SPSoldierInfo.NormalSoliderId <-> ID is authoritative.',
    missions:'FisrtStageMissionList/SecondStageMissionList join directly to MissionInfo.ID; SecondStageUnlock is authoritative.',
    submitItems:'MissionType 73 Param1 joins MissionSumitItemInfo.ID -> Items.',
    training:'TrainingTechInfo.SoldierIDRelated is reverse-indexed; tier-3 primary growth path is the unique 10-entry path whose TrainingTechLevelInfo.SoldierSkillLevelup is 1..10.',
    spAbility:'SpSoidlierDescription must exist on the paired normal soldier primary path.',
    koreanName:'Tier-3 normal name must be confirmed; SP may use its own name or inherit the paired normal name.'
  }
};
const out=path.join(ROOT,'data/validation/soldier-stage4-prereq-recheck.v1.json');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log('SOLDIER_STAGE4_PREREQ_RECHECK_BEGIN');
console.log(JSON.stringify(result,null,2));
console.log('SOLDIER_STAGE4_PREREQ_RECHECK_END');
if(errors.length) process.exit(1);
