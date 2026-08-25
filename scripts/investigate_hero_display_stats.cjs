'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const C = (name) => path.join(ROOT, 'data', 'configdata', name);
const OUT = path.join(ROOT, 'data', 'validation', 'hero-display-stat-investigation.v1.json');

function records(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.records)) return raw.records;
  throw new Error(`No records array: ${file}`);
}
function nums(v){ return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : []; }
function inc(m,k){ m.set(k,(m.get(k)||0)+1); }
function obj(m){ return Object.fromEntries([...m.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]),undefined,{numeric:true}))); }

const heroInfos=records(C('ConfigDataHeroInformationInfo.json'));
const fetters=records(C('ConfigDataHeroFetterInfo.json'));
const missions=records(C('ConfigDataMissionInfo.json'));
const dungeons=records(C('ConfigDataHeroDungeonLevelInfo.json'));
const heroNames=records(path.join(ROOT,'data','hero-name-master.v1.json'));

const canonical=new Set(heroNames.map(r=>Number(r.heroId)));
const nameById=new Map(heroNames.map(r=>[Number(r.heroId),r.nameKr||r.nameCn||String(r.heroId)]));
const missionById=new Map(missions.map(r=>[Number(r.ID),r]));
const dungeonById=new Map(dungeons.map(r=>[Number(r.ID),r]));
const fetterOwners=new Map(), dungeonOwners=new Map();
for(const h of heroInfos){
  const id=Number(h.ID);
  for(const fid of nums(h.HeroFetters_ID)){ if(!fetterOwners.has(fid))fetterOwners.set(fid,[]); fetterOwners.get(fid).push(id); }
  for(const did of nums(h.DungeonLevels_ID)){ if(!dungeonOwners.has(did))dungeonOwners.set(did,[]); dungeonOwners.get(did).push(id); }
}

const all=[];
for(const f of fetters){
  const fid=Number(f.ID), owners=[...new Set(fetterOwners.get(fid)||[])];
  for(const c of (Array.isArray(f.CompletionConditions)?f.CompletionConditions:[])){
    if(Number(c.ConditionType)!==2) continue;
    const missionId=Number(c.Parm1), m=missionById.get(missionId)||null;
    const param1=m&&Number.isFinite(Number(m.Param1))?Number(m.Param1):null;
    const stageId=m&&Number(m.Param2)===6&&Number.isFinite(Number(m.Param3))?Number(m.Param3):null;
    const stage=stageId!=null?dungeonById.get(stageId)||null:null;
    const stageOwnersAll=stageId!=null?[...new Set(dungeonOwners.get(stageId)||[])]:[];
    const canonicalOwners=owners.filter(id=>canonical.has(id));
    const canonicalStageOwners=stageOwnersAll.filter(id=>canonical.has(id));
    const heroRefs=[...(param1!=null&&canonical.has(param1)?[param1]:[]),...canonicalStageOwners];
    const external=[...new Set(heroRefs)].filter(id=>!canonicalOwners.includes(id));
    all.push({
      fetterId:fid,fetterName:f.Name??null,missionId,missionResolved:!!m,
      missionType:m?.MissionType??null,desc:m?.Desc??null,param1,param1Name:canonical.has(param1)?nameById.get(param1):null,param1Canonical:canonical.has(param1),
      param2:m?.Param2??null,param3:m?.Param3??null,
      owners,ownerNames:owners.map(id=>nameById.get(id)||null),canonicalOwners,canonicalOwnerNames:canonicalOwners.map(id=>nameById.get(id)||null),
      stageId,stageResolved:stageId==null?null:!!stage,stageName:stage?.Name??null,
      stageOwnersAll,stageOwnerNamesAll:stageOwnersAll.map(id=>nameById.get(id)||null),canonicalStageOwners,canonicalStageOwnerNames:canonicalStageOwners.map(id=>nameById.get(id)||null),
      external,externalNames:external.map(id=>nameById.get(id)||null)
    });
  }
}

const scoped=all.filter(r=>r.canonicalOwners.length>0);
const outOfScope=all.filter(r=>r.canonicalOwners.length===0);
const scopedIssues={
  unresolvedMission:scoped.filter(r=>!r.missionResolved),
  nonSingleCanonicalOwner:scoped.filter(r=>r.canonicalOwners.length!==1),
  unresolvedDungeon:scoped.filter(r=>r.stageId!=null&&!r.stageResolved),
  dungeonNoCanonicalOwner:scoped.filter(r=>r.stageId!=null&&r.stageResolved&&r.canonicalStageOwners.length===0),
  nonCanonicalParam1:scoped.filter(r=>r.param1!=null&&!r.param1Canonical),
  externalMulti:scoped.filter(r=>r.external.length>1),
};
const dist=new Map(); scoped.forEach(r=>inc(dist,String(r.external.length)));
const typeDist=new Map(); scoped.forEach(r=>inc(typeDist,String(r.missionType)));
const type5p6=scoped.filter(r=>Number(r.missionType)===5&&Number(r.param2)===6);
const type5p6External=new Map(); type5p6.forEach(r=>inc(type5p6External,String(r.external.length)));

function slim(r){ return {fetterId:r.fetterId,missionId:r.missionId,desc:r.desc,type:r.missionType,param1:r.param1,param1Name:r.param1Name,param2:r.param2,param3:r.param3,owners:r.owners,canonicalOwners:r.canonicalOwnerNames,stageId:r.stageId,stage:r.stageName,stageOwnersAll:r.stageOwnersAll,canonicalStageOwners:r.canonicalStageOwnerNames,external:r.externalNames}; }
const issueSlim=Object.fromEntries(Object.entries(scopedIssues).map(([k,v])=>[k,v.slice(0,80).map(slim)]));

const result={
  version:7,
  status:Object.values(scopedIssues).every(v=>v.length===0)?'CANONICAL_SCOPE_CLEAN':'CANONICAL_SCOPE_HAS_EXCEPTIONS',
  purpose:'Separate raw HeroFetter Mission anomalies from canonical 267-hero Stage 5 scope and validate related-hero cardinality.',
  counts:{allType2:all.length,canonicalScopedType2:scoped.length,outOfScopeType2:outOfScope.length,canonicalHeroCount:canonical.size},
  distributions:{missionType:obj(typeDist),externalHeroCount:obj(dist),type5Param2_6_externalHeroCount:obj(type5p6External)},
  issueCounts:Object.fromEntries(Object.entries(scopedIssues).map(([k,v])=>[k,v.length])),
  issues:issueSlim,
  outOfScopeExamples:outOfScope.slice(0,50).map(slim),
  type5Param2_6_zeroExternal:type5p6.filter(r=>r.external.length===0).slice(0,80).map(slim),
  type5Param2_6_oneExternal:type5p6.filter(r=>r.external.length===1).slice(0,20).map(slim),
};
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,`${JSON.stringify(result,null,2)}\n`);
console.log(JSON.stringify({status:result.status,counts:result.counts,distributions:result.distributions,issueCounts:result.issueCounts,issues:issueSlim,type5Param2_6_zeroExternalCount:type5p6.filter(r=>r.external.length===0).length,type5Param2_6_zeroExternal:result.type5Param2_6_zeroExternal.slice(0,30),outOfScopeCount:outOfScope.length,outOfScopeExamples:result.outOfScopeExamples.slice(0,10)},null,2));
