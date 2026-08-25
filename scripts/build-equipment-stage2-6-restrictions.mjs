import fs from 'node:fs';
import path from 'node:path';

const load=p=>JSON.parse(fs.readFileSync(path.resolve(p),'utf8'));
const equipment=load('data/configdata/ConfigDataEquipmentInfo.json');
const jobs=load('data/configdata/ConfigDataJobInfo.json');
const armies=load('data/configdata/ConfigDataArmyInfo.json');
const restrictionsOut=path.resolve('data/generated/equipment_stage2_6_restrictions.json');
const jobsOut=path.resolve('data/generated/equipment_stage2_6_job_index.json');

const expected={0:new Set([1,2,3,4,5,6,7]),1:new Set([8,9,10]),2:new Set([11,12,13]),3:new Set([14])};
const slot=r=>r.EquipmentType==null?0:Number(r.EquipmentType);
const canonical=r=>Number(r.Rank)===4&&expected[slot(r)]?.has(Number(r.Label));
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(Number).filter(Number.isFinite))];
const jobById=new Map(jobs.map(j=>[Number(j.ID),j]));
const armyById=new Map(armies.map(a=>[Number(a.ID),a]));
const armyKo={1:'창병',2:'보병',3:'기병',4:'비병',5:'수병',6:'궁병',7:'마법사',8:'승려',9:'마물',11:'암살자',27:'용'};

const records=[];
const specialJobIdsAll=new Set();
let missingArmy=0,missingJob=0,redundantJobRefs=0,specialJobRefs=0;
const modeCounts={};
for(const r of equipment.filter(canonical)){
  const generalArmyIds=uniq(r.ArmyIds);
  const rawJobIds=uniq(r.JobIds);
  const armySet=new Set(generalArmyIds);
  const specialJobIds=[];
  let redundant=0;
  for(const jid of rawJobIds){
    const j=jobById.get(jid);
    if(!j){missingJob++;continue;}
    const aid=Number(j.Army_ID);
    if(armySet.has(aid)){redundant++;redundantJobRefs++;}
    else{specialJobIds.push(jid);specialJobIdsAll.add(jid);specialJobRefs++;}
  }
  for(const aid of generalArmyIds) if(!armyById.has(aid)) missingArmy++;

  let mode;
  if(!generalArmyIds.length&&!specialJobIds.length) mode='unrestricted-by-fields';
  else if(generalArmyIds.length&&!specialJobIds.length) mode='army-only';
  else if(!generalArmyIds.length) mode='job-only';
  else mode='army-plus-job-exceptions';
  modeCounts[mode]=(modeCounts[mode]??0)+1;

  records.push({
    equipmentId:Number(r.ID),
    mode,
    generalArmyIds,
    specialJobIds,
    redundantJobIdsCount:redundant,
    raw:{armyIds:generalArmyIds,jobIds:rawJobIds}
  });
}

const jobIndex={};
for(const jid of [...specialJobIdsAll].sort((a,b)=>a-b)){
  const j=jobById.get(jid);
  const aid=Number(j.Army_ID);
  jobIndex[String(jid)]={name:j.Name??null,rank:j.Rank??null,armyId:aid,armyNameCn:armyById.get(aid)?.Name??null,armyNameKo:armyKo[aid]??null};
}
const armyIndex={};
for(const aid of [...new Set(records.flatMap(r=>r.generalArmyIds))].sort((a,b)=>a-b)){
  armyIndex[String(aid)]={nameCn:armyById.get(aid)?.Name??null,nameKo:armyKo[aid]??null,armyTag:armyById.get(aid)?.ArmyTag??null};
}

const restrictions={
  source:{equipment:'data/configdata/ConfigDataEquipmentInfo.json',job:'data/configdata/ConfigDataJobInfo.json',army:'data/configdata/ConfigDataArmyInfo.json'},
  canonicalCount:records.length,
  semantics:{
    confidence:0.99,
    status:'structural-inference',
    rule:'eligible when JobInfo.Army_ID is in ArmyIds OR JobInfo.ID is in JobIds; both empty means unrestricted-by-fields',
    note:'Direct runtime equip-check code was not located in the repository. Army/Job joins themselves are direct field joins; OR semantics is inferred from full-population structure.',
    display:'show generalArmyIds as broad allowed types; resolve specialJobIds through equipment_stage2_6_job_index.json only when exact exceptions need expansion.'
  },
  counts:{modeCounts,specialJobRefs,redundantJobRefs,distinctSpecialJobIds:specialJobIdsAll.size,missingArmyRefs:missingArmy,missingJobRefs:missingJob},
  armyIndex,
  records
};
if(records.length!==390) throw new Error(`canonical mismatch ${records.length}`);
if(missingArmy||missingJob) throw new Error(`missing refs army=${missingArmy} job=${missingJob}`);
fs.mkdirSync(path.dirname(restrictionsOut),{recursive:true});
fs.writeFileSync(restrictionsOut,JSON.stringify(restrictions,null,2)+'\n');
fs.writeFileSync(jobsOut,JSON.stringify({source:'data/configdata/ConfigDataJobInfo.json',count:Object.keys(jobIndex).length,jobs:jobIndex},null,2)+'\n');
console.log(JSON.stringify({canonicalCount:records.length,modeCounts,specialJobRefs,redundantJobRefs,distinctSpecialJobIds:specialJobIdsAll.size,armyIndex},null,2));
