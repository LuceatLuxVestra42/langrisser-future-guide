'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const rows=d=>Array.isArray(d)?d:(d?.records||d?.rows||d?.data||[]);
const byId=arr=>new Map(arr.map(x=>[Number(x.ID),x]));
const canon=read('data/hero-name-master.v1.json').records||[];
const canonById=new Map(canon.map(x=>[Number(x.heroId),x]));
const sp=rows(read('data/configdata/ConfigDataSPHeroInfo.json'));
const mission=rows(read('data/configdata/ConfigDataMissionInfo.json')); const missionById=byId(mission);
const ext=rows(read('data/configdata/ConfigDataMissionExtSPHeroInfo.json'));
const jc=rows(read('data/configdata/ConfigDataJobConnectionInfo.json')); const jcById=byId(jc);
const jobs=rows(read('data/configdata/ConfigDataJobInfo.json')); const jobById=byId(jobs);
const skills=rows(read('data/configdata/ConfigDataSkillInfo.json')); const skillById=byId(skills);
const buffs=rows(read('data/configdata/ConfigDataBuffInfo.json')); const buffById=byId(buffs);
const soldierMaster=read('data/generated/soldier-master.v1.json').records||[]; const soldierById=new Map(soldierMaster.map(x=>[Number(x.soldierId),x]));
let submit=[]; const submitPath='data/configdata/ConfigDataMissionSumitItemInfo.json'; if(fs.existsSync(path.join(root,submitPath))) submit=rows(read(submitPath)); const submitById=byId(submit);
const allMissionIds=[]; for(const r of sp) allMissionIds.push(...(r.FisrtStageMissions||[]),...(r.SecondStageMissions||[]));
const missionSet=new Set(allMissionIds.map(Number));
const typeCounts={}; for(const id of missionSet){const m=missionById.get(Number(id)); const k=m?String(m.MissionType):'MISSING'; typeCounts[k]=(typeCounts[k]||0)+1;}
const extKeyStats={}; for(const r of ext.slice(0,100)){for(const [k,v] of Object.entries(r)){if(typeof v==='number'&&missionSet.has(Number(v))) extKeyStats[k]=(extKeyStats[k]||0)+1;}}
const extSamples=ext.filter(r=>Object.values(r).some(v=>typeof v==='number'&&missionSet.has(Number(v)))).slice(0,12);
const typeSamples={}; for(const t of [73,77,81]) typeSamples[t]=[...missionSet].map(id=>missionById.get(id)).filter(m=>m&&Number(m.MissionType)===t).slice(0,12).map(m=>({ID:m.ID,Title:m.Title??null,Desc:m.Desc??null,Param1:m.Param1??null,Param2:m.Param2??null,Param3:m.Param3??null,GroupParam:m.GroupParam??null,Stages:m.Stages??null,PreMissionIds:m.PreMissionIds??null}));
const spRows=sp.map(r=>{const heroId=Number(r.ID), j=jcById.get(Number(r.JobConnection_ID)), job=j?jobById.get(Number(j.Job_ID)):null; const first=(r.FisrtStageMissions||[]).map(Number), second=(r.SecondStageMissions||[]).map(Number), rewardSkills=(r.SecondStageRewardSkills||[]).map(Number), rewardSoldiers=(r.SecondStageRewardSoldiers||[]).map(Number); return {heroId,name:r.Name??null,canonical:canonById.get(heroId)||null,jobConnectionId:Number(r.JobConnection_ID)||null,jobConnection:j?{ID:j.ID,Hero_ID:j.Hero_ID??null,Job_ID:j.Job_ID??null,JobLevels_ID:j.JobLevels_ID??null}:null,job:job?{ID:job.ID,Name:job.Name??null}:null,charImageId:r.CharImage_ID??null,firstStageActiveMaterial:r.FisrtStageActiveMaterial??null,newFirstStageActiveMaterial:r.NewFisrtStageActiveMaterial??null,firstMissions:first,secondMissions:second,rewardBuffId:Number(r.SecondStageRewardBuffId)||null,rewardBuff:buffById.get(Number(r.SecondStageRewardBuffId))?{ID:buffById.get(Number(r.SecondStageRewardBuffId)).ID,Name:buffById.get(Number(r.SecondStageRewardBuffId)).Name??null,Desc:buffById.get(Number(r.SecondStageRewardBuffId)).Desc??null}:null,rewardSkills:rewardSkills.map(id=>({id,resolved:skillById.has(id),name:skillById.get(id)?.Name??null})),rewardSoldiers:rewardSoldiers.map(id=>({id,resolved:soldierById.has(id),nameCn:soldierById.get(id)?.nameCn??null,nameKr:soldierById.get(id)?.nameKr??null})),statKeys:Object.keys(r).filter(k=>/(INI|Star|Cmd)/i.test(k)).sort()};});
const type73=[...missionSet].map(id=>missionById.get(id)).filter(m=>m&&Number(m.MissionType)===73); const type77=[...missionSet].map(id=>missionById.get(id)).filter(m=>m&&Number(m.MissionType)===77); const type81=[...missionSet].map(id=>missionById.get(id)).filter(m=>m&&Number(m.MissionType)===81);
const p73=type73.map(m=>({missionId:m.ID,param1:Number(m.Param1),submitResolved:submitById.has(Number(m.Param1)),submit:submitById.get(Number(m.Param1))||null}));
const equipment=rows(read('data/configdata/ConfigDataEquipmentInfo.json')); const equipById=byId(equipment);
const p77=type77.map(m=>({missionId:m.ID,param1:Number(m.Param1),param2:Number(m.Param2),equipmentResolved:equipById.has(Number(m.Param1)),equipment:equipById.has(Number(m.Param1))?{ID:equipById.get(Number(m.Param1)).ID,Name:equipById.get(Number(m.Param1)).Name??null,SkillHero:equipById.get(Number(m.Param1)).SkillHero??null}:null}));
const heroIds=new Set(canon.map(x=>Number(x.heroId))); const p81=type81.map(m=>({missionId:m.ID,param1:m.Param1??null,param2:m.Param2??null,param3:m.Param3??null,groupParam:m.GroupParam??null,stages:m.Stages??null,numericHeroMatches:Object.entries(m).filter(([k,v])=>typeof v==='number'&&heroIds.has(Number(v))).map(([k,v])=>({key:k,value:v}))}));
const errors=[];
if(new Set(sp.map(x=>Number(x.ID))).size!==sp.length) errors.push('duplicate SPHeroInfo.ID');
for(const r of spRows){if(!r.canonical) errors.push(`SP hero ${r.heroId} not canonical`); if(!r.jobConnection||!r.job) errors.push(`SP hero ${r.heroId} job unresolved`); if(!r.rewardBuff) errors.push(`SP hero ${r.heroId} buff unresolved`); if(r.rewardSkills.some(x=>!x.resolved)) errors.push(`SP hero ${r.heroId} skill unresolved`); if(r.rewardSoldiers.some(x=>!x.resolved)) errors.push(`SP hero ${r.heroId} soldier unresolved`); for(const id of [...r.firstMissions,...r.secondMissions]) if(!missionById.has(id)) errors.push(`SP hero ${r.heroId} mission ${id} unresolved`);}
const out={version:1,stage:'hero-page-5-4',checkpoint:'probe',summary:{canonicalHeroCount:canon.length,spHeroCount:sp.length,uniqueSpHeroIds:new Set(sp.map(x=>Number(x.ID))).size,missionRefCount:allMissionIds.length,uniqueMissionRefCount:missionSet.size,missionTypeCounts:typeCounts,missionExtKeyStats:extKeyStats,submitItemRecordCount:submit.length,errorCount:errors.length},schema:{spHeroKeys:[...new Set(sp.flatMap(x=>Object.keys(x)))].sort(),missionExtKeys:[...new Set(ext.flatMap(x=>Object.keys(x)))].sort()},typeSamples,type73Analysis:p73,type77Analysis:p77,type81Analysis:p81,missionExtSamples:extSamples,spRows,errors};
fs.mkdirSync(path.join(root,'data','validation'),{recursive:true}); fs.writeFileSync(path.join(root,'data/validation/hero-page-stage5-4-probe.v1.json'),JSON.stringify(out,null,2)+'\n'); console.log(JSON.stringify({summary:out.summary,typeSamples:out.typeSamples,firstSpRows:out.spRows.slice(0,5),errors},null,2)); if(errors.length)process.exitCode=1;
