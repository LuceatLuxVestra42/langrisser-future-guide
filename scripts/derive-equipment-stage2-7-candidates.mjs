import fs from 'node:fs';
import path from 'node:path';
const load=p=>JSON.parse(fs.readFileSync(path.resolve(p),'utf8'));
const restrictions=load('data/generated/equipment_stage2_6_restrictions.json');
const equipment=load('data/configdata/ConfigDataEquipmentInfo.json');
const ids=new Set(restrictions.records.map(r=>Number(r.equipmentId)));
const rows=equipment.filter(r=>ids.has(Number(r.ID)));
const pathKey=r=>JSON.stringify(r.GetPathList??null);
const isSecret=r=>Array.isArray(r.GetPathList)&&r.GetPathList.length===1&&Number(r.GetPathList[0]?.PathType)===46;
const isSoul=r=>!r.GetPathList && /^魂·/.test(String(r.Name??''));
const generic=rows.filter(r=>!isSecret(r)&&!isSoul(r));
const byPath={};
for(const r of rows){const k=pathKey(r);byPath[k]=(byPath[k]??0)+1;}
const compact=r=>({id:Number(r.ID),name:r.Name??null,slot:r.EquipmentType==null?0:Number(r.EquipmentType),label:r.Label??null,sortIndex:r.SortIndex??null,paths:r.GetPathList??null});
const result={
  population:rows.length,
  counts:{secretRealmSinglePath:rows.filter(isSecret).length,soulNoPath:rows.filter(isSoul).length,genericCandidate:generic.length,otherNoPath:rows.filter(r=>!r.GetPathList&&!isSoul(r)).length},
  arithmetic:{launchReferenceCount:94,legacyAdditionalReferenceCount:80,remainderIfGenericCandidate:generic.length-94-80},
  genericCandidates:generic.slice().sort((a,b)=>Number(a.ID)-Number(b.ID)).map(compact),
  genericTail:generic.slice().sort((a,b)=>Number(a.ID)-Number(b.ID)).slice(-60).map(compact),
  secretHead:rows.filter(isSecret).slice().sort((a,b)=>Number(a.ID)-Number(b.ID)).slice(0,20).map(compact),
  soulRows:rows.filter(isSoul).slice().sort((a,b)=>Number(a.ID)-Number(b.ID)).map(compact),
  pathSignatureCounts:byPath
};
fs.writeFileSync('data/generated/equipment_stage2_7_historical_candidates.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({population:result.population,counts:result.counts,arithmetic:result.arithmetic,genericTail:result.genericTail,soulRows:result.soulRows},null,2));
