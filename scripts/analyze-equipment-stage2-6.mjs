import fs from 'node:fs';
import path from 'node:path';

const load=p=>JSON.parse(fs.readFileSync(path.resolve(p),'utf8'));
const equipment=load('data/configdata/ConfigDataEquipmentInfo.json');
const jobs=load('data/configdata/ConfigDataJobInfo.json');
const armies=load('data/configdata/ConfigDataArmyInfo.json');
const out=path.resolve('data/generated/equipment_stage2_6_restriction_analysis.json');

const expected={0:new Set([1,2,3,4,5,6,7]),1:new Set([8,9,10]),2:new Set([11,12,13]),3:new Set([14])};
const slot=r=>r.EquipmentType==null?0:Number(r.EquipmentType);
const canonical=r=>Number(r.Rank)===4&&expected[slot(r)]?.has(Number(r.Label));
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(Number).filter(Number.isFinite))];
const sorted=a=>[...a].sort((x,y)=>x-y);
const jobById=new Map(jobs.map(j=>[Number(j.ID),j]));
const armyById=new Map(armies.map(a=>[Number(a.ID),a]));

const rows=equipment.filter(canonical);
const modeCounts={unrestricted:0,'army-only':0,'job-only':0,'army-plus-jobs':0};
const slotModeCounts={};
const armySignatureCounts={};
const missingArmyRefs=[];
const missingJobRefs=[];
const specialShapes=[];
const selectedIds=new Set([6,13,38,52,59,73,80,94,99,115,134]);
const selected=[];
let rawJobRefs=0, jobsInsideArmyRefs=0, jobsOutsideArmyRefs=0, rowsWithOutsideJobs=0, rowsWithInsideJobs=0;
const referencedArmyIds=new Set();
const exceptionArmyIds=new Set();

for(const r of rows){
  const armyIds=uniq(r.ArmyIds), jobIds=uniq(r.JobIds), armySet=new Set(armyIds);
  const s=slot(r);
  let mode='army-plus-jobs';
  if(!armyIds.length&&!jobIds.length) mode='unrestricted';
  else if(armyIds.length&&!jobIds.length) mode='army-only';
  else if(!armyIds.length&&jobIds.length) mode='job-only';
  modeCounts[mode]++;
  slotModeCounts[s]??={}; slotModeCounts[s][mode]=(slotModeCounts[s][mode]??0)+1;
  const sig=sorted(armyIds).join(',')||'<empty>'; armySignatureCounts[sig]=(armySignatureCounts[sig]??0)+1;
  for(const aid of armyIds){referencedArmyIds.add(aid);if(!armyById.has(aid))missingArmyRefs.push({equipmentId:r.ID,name:r.Name,armyId:aid});}

  const inside=[], outside=[];
  for(const jid of jobIds){
    rawJobRefs++;
    const j=jobById.get(jid);
    if(!j){missingJobRefs.push({equipmentId:r.ID,name:r.Name,jobId:jid});continue;}
    const aid=Number(j.Army_ID);
    const item={jobId:jid,jobName:j.Name??null,jobRank:j.Rank??null,armyId:aid,armyName:armyById.get(aid)?.Name??null};
    if(armySet.has(aid)){inside.push(item);jobsInsideArmyRefs++;}
    else{outside.push(item);jobsOutsideArmyRefs++;exceptionArmyIds.add(aid);}
  }
  if(inside.length) rowsWithInsideJobs++;
  if(outside.length) rowsWithOutsideJobs++;

  if(mode!=='army-plus-jobs' || selectedIds.has(Number(r.ID))){
    const rec={equipmentId:Number(r.ID),equipmentName:r.Name,slot:s,label:Number(r.Label),mode,
      armies:armyIds.map(id=>({id,name:armyById.get(id)?.Name??null})),jobCount:jobIds.length,
      insideArmyJobCount:inside.length,outsideArmyJobCount:outside.length,
      outsideJobs:outside.slice(0,25)};
    if(mode!=='army-plus-jobs') specialShapes.push(rec);
    if(selectedIds.has(Number(r.ID))) selected.push(rec);
  }
}

const referencedArmyMaster=sorted(new Set([...referencedArmyIds,...exceptionArmyIds])).map(id=>({id,name:armyById.get(id)?.Name??null,armyTag:armyById.get(id)?.ArmyTag??null,usedAsGeneral:referencedArmyIds.has(id),usedByExplicitJob:exceptionArmyIds.has(id)}));
const result={
  sources:{equipment:'data/configdata/ConfigDataEquipmentInfo.json',job:'data/configdata/ConfigDataJobInfo.json',army:'data/configdata/ConfigDataArmyInfo.json'},
  canonicalCount:rows.length,
  masterCounts:{jobs:jobs.length,armies:armies.length},
  counts:{modeCounts,slotModeCounts,rawJobRefs,jobsInsideArmyRefs,jobsOutsideArmyRefs,rowsWithInsideJobs,rowsWithOutsideJobs,missingArmyRefRecords:missingArmyRefs.length,missingJobRefRecords:missingJobRefs.length},
  structuralInference:{
    candidateRule:'allowed when ArmyIds contains JobInfo.Army_ID OR JobIds contains JobInfo.ID; both lists empty means unrestricted',
    rationale:'Explicit JobIds systematically include jobs outside the broad ArmyIds. Treating both lists as an AND condition would make those references unreachable; treating JobIds as additive exact-job exceptions preserves every populated field.',
    displayNormalization:'show ArmyIds as general allowed army types; only JobIds whose JobInfo.Army_ID is outside ArmyIds are non-redundant special-job exceptions; JobIds inside ArmyIds are redundant for display but retained for raw fidelity.'
  },
  referencedArmyMaster,armySignatureCounts,
  anomalies:{missingArmyRefs,missingJobRefs},
  specialShapes,selected
};
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
