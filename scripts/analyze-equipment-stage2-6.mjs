import fs from 'node:fs';
import path from 'node:path';

const load = (p) => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
const equipment = load('data/configdata/ConfigDataEquipmentInfo.json');
const jobs = load('data/configdata/ConfigDataJobInfo.json');
const armies = load('data/configdata/ConfigDataArmyInfo.json');
const out = path.resolve('data/generated/equipment_stage2_6_restriction_analysis.json');

const expected={0:new Set([1,2,3,4,5,6,7]),1:new Set([8,9,10]),2:new Set([11,12,13]),3:new Set([14])};
const slot=r=>r.EquipmentType==null?0:Number(r.EquipmentType);
const canonical=r=>Number(r.Rank)===4 && expected[slot(r)]?.has(Number(r.Label));
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(Number).filter(Number.isFinite))];
const sorted=a=>[...a].sort((x,y)=>x-y);
const setEq=(a,b)=>a.size===b.size && [...a].every(v=>b.has(v));
const isSubset=(a,b)=>[...a].every(v=>b.has(v));

const jobById=new Map(jobs.map(j=>[Number(j.ID),j]));
const armyById=new Map(armies.map(a=>[Number(a.ID),a]));
const allJobsByArmy=new Map();
for(const j of jobs){
  const aid=Number(j.Army_ID);
  if(!allJobsByArmy.has(aid)) allJobsByArmy.set(aid,[]);
  allJobsByArmy.get(aid).push(Number(j.ID));
}

const rows=equipment.filter(canonical);
const relationCounts={};
const armySignatureCounts={};
const missingArmyRefs=[];
const missingJobRefs=[];
const outsideArmyRecords=[];
const duplicateJobIdRecords=[];
const emptyArmy=[];
const emptyJobs=[];
const records=[];

for(const r of rows){
  const rawArmy=Array.isArray(r.ArmyIds)?r.ArmyIds:[];
  const rawJobs=Array.isArray(r.JobIds)?r.JobIds:[];
  const armyIds=uniq(rawArmy);
  const jobIds=uniq(rawJobs);
  const duplicateJobCount=rawJobs.length-jobIds.length;
  const armySet=new Set(armyIds);
  const resolvedJobs=[];
  const missingJobs=[];
  const jobArmySet=new Set();
  for(const jid of jobIds){
    const j=jobById.get(jid);
    if(!j){missingJobs.push(jid);continue;}
    const aid=Number(j.Army_ID);
    jobArmySet.add(aid);
    resolvedJobs.push({id:jid,name:j.Name??null,rank:j.Rank??null,armyId:aid,armyName:armyById.get(aid)?.Name??null});
  }
  const missingArmies=armyIds.filter(aid=>!armyById.has(aid));
  const outside=resolvedJobs.filter(j=>!armySet.has(j.armyId));
  let relation;
  if(!armyIds.length&&!jobIds.length) relation='both-empty';
  else if(!armyIds.length) relation='job-only';
  else if(!jobIds.length) relation='army-only';
  else if(setEq(jobArmySet,armySet)) relation='job-armies-equal-armyids';
  else if(isSubset(jobArmySet,armySet)) relation='job-armies-subset-armyids';
  else if(isSubset(armySet,jobArmySet)) relation='armyids-subset-job-armies';
  else relation='partial-overlap';
  relationCounts[relation]=(relationCounts[relation]??0)+1;
  const sig=sorted(armyIds).join(',')||'<empty>';
  armySignatureCounts[sig]=(armySignatureCounts[sig]??0)+1;
  if(missingArmies.length) missingArmyRefs.push({id:r.ID,name:r.Name,missingArmies});
  if(missingJobs.length) missingJobRefs.push({id:r.ID,name:r.Name,missingJobs});
  if(outside.length) outsideArmyRecords.push({id:r.ID,name:r.Name,armyIds,outsideJobs:outside});
  if(duplicateJobCount) duplicateJobIdRecords.push({id:r.ID,name:r.Name,rawCount:rawJobs.length,uniqueCount:jobIds.length,duplicateJobCount});
  if(!armyIds.length) emptyArmy.push({id:r.ID,name:r.Name,jobCount:jobIds.length});
  if(!jobIds.length) emptyJobs.push({id:r.ID,name:r.Name,armyIds});

  const broadJobIds=sorted(armyIds.flatMap(aid=>allJobsByArmy.get(aid)??[]));
  const explicitSet=new Set(jobIds);
  const broadSet=new Set(broadJobIds);
  const broadMissingFromExplicit=broadJobIds.filter(jid=>!explicitSet.has(jid));
  const explicitOutsideBroad=jobIds.filter(jid=>!broadSet.has(jid));
  records.push({
    equipmentId:Number(r.ID),equipmentName:r.Name,armyIds,
    armies:armyIds.map(id=>({id,name:armyById.get(id)?.Name??null})),
    rawJobCount:rawJobs.length,jobCount:jobIds.length,duplicateJobCount,
    jobArmyIds:sorted(jobArmySet),relation,
    missingJobIds:missingJobs,outsideArmyJobIds:outside.map(j=>j.id),
    broadJobCount:broadJobIds.length,broadMissingFromExplicitCount:broadMissingFromExplicit.length,
    explicitOutsideBroadCount:explicitOutsideBroad.length
  });
}

const selectedIds=new Set([6,13,38,52,59,73,80,94,99,115,134]);
const selected=records.filter(r=>selectedIds.has(r.equipmentId));
const armyMaster=armies.map(a=>({id:Number(a.ID),name:a.Name,armyTag:a.ArmyTag??null}));

const result={
  sources:{equipment:'data/configdata/ConfigDataEquipmentInfo.json',job:'data/configdata/ConfigDataJobInfo.json',army:'data/configdata/ConfigDataArmyInfo.json'},
  canonicalCount:rows.length,
  masterCounts:{jobs:jobs.length,armies:armies.length},
  counts:{relationCounts,armySignatureCounts,missingArmyRefRecords:missingArmyRefs.length,missingJobRefRecords:missingJobRefs.length,outsideArmyRecords:outsideArmyRecords.length,duplicateJobIdRecords:duplicateJobIdRecords.length,emptyArmyRecords:emptyArmy.length,emptyJobRecords:emptyJobs.length},
  armyMaster,
  anomalies:{missingArmyRefs,missingJobRefs,outsideArmyRecords,emptyArmy,emptyJobs},
  duplicateJobIdExamples:duplicateJobIdRecords.slice(0,30),
  selected,
  records
};
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({canonicalCount:result.canonicalCount,masterCounts:result.masterCounts,counts:result.counts,selected:result.selected},null,2));
