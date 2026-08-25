import fs from 'node:fs';
import path from 'node:path';

const load=p=>JSON.parse(fs.readFileSync(path.resolve(p),'utf8'));
const candidates=load('data/generated/equipment_stage2_7_historical_candidates.json');
const equipment=load('data/configdata/ConfigDataEquipmentInfo.json');
const byId=new Map(equipment.map(r=>[Number(r.ID),r]));
const generic=(candidates.genericCandidates??[]).slice().sort((a,b)=>a.id-b.id);
const tail33=generic.slice(-33);
const tail40=generic.slice(-40);
const otherNoPath=generic.filter(r=>r.paths==null);
const sig=x=>JSON.stringify(x??null);
const pathCounts={};
for(const r of generic) pathCounts[sig(r.paths)]=(pathCounts[sig(r.paths)]??0)+1;

const targetIds=new Set([8,27,39,405,406,407]);
const configMatches=[];
const configDir=path.resolve('data/configdata');
for(const file of fs.readdirSync(configDir).filter(f=>f.endsWith('.json')).sort()){
  const p=path.join(configDir,file);
  let data; try{data=JSON.parse(fs.readFileSync(p,'utf8'));}catch{continue;}
  if(!Array.isArray(data)) continue;
  for(const row of data){
    if(!row || typeof row!=='object' || Array.isArray(row)) continue;
    const id=Number(row.ID);
    if(!targetIds.has(id)) continue;
    const fields={};
    for(const [k,v] of Object.entries(row)){
      if(['ID','Name','Desc','Type','PathType','FunctionType','FuncType','Title','Text','Icon','SortIndex','Army_ID','Rank'].includes(k) || /Path|Name|Desc|Type|Title|Text/i.test(k)) fields[k]=v;
    }
    configMatches.push({file,id,fields});
  }
}

const result={
  genericCount:generic.length,
  launchReferenceCount:94,
  legacyAdditionalReferenceCount:80,
  unresolvedCount:tail33.length,
  otherNoPath,
  genericPathSignatureCounts:pathCounts,
  boundary:{beforeTail33:generic.at(-34)??null,firstTail33:tail33[0]??null,lastTail33:tail33.at(-1)??null},
  tail33,
  tail40,
  targetConfigMatches:configMatches
};
fs.writeFileSync('data/generated/equipment_stage2_7_focus.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
