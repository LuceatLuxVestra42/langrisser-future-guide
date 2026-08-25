import fs from 'node:fs';
import path from 'node:path';

const root='data/configdata';
const targetTypes=new Set([3,6,12,28,43,46]);
const targetIds=new Set([8,27,39,405,406,407]);
const pathSamples={};
for(const t of targetTypes) pathSamples[t]=[];
const idCandidates={};
for(const id of targetIds) idCandidates[id]=[];

function walkForPaths(v,file,context=null){
  if(Array.isArray(v)){ for(const x of v) walkForPaths(x,file,context); return; }
  if(!v||typeof v!=='object') return;
  const nextContext=(('ID' in v)||('Name' in v))?{ID:v.ID??null,Name:v.Name??null,keys:Object.keys(v).slice(0,20)}:context;
  if(Number.isInteger(v.PathType)&&targetTypes.has(v.PathType)){
    const arr=pathSamples[v.PathType];
    if(arr.length<40) arr.push({file,context:nextContext,path:{PathType:v.PathType,ID:v.ID??null,Name:v.Name??null}});
  }
  for(const [k,x] of Object.entries(v)){
    if(k==='GetPathList' && Array.isArray(x)){
      for(const p of x){
        if(p&&typeof p==='object'&&targetTypes.has(Number(p.PathType))){
          const arr=pathSamples[Number(p.PathType)];
          if(arr.length<40) arr.push({file,context:nextContext,path:{PathType:p.PathType,ID:p.ID??null,Name:p.Name??null}});
        }
      }
    } else walkForPaths(x,file,nextContext);
  }
}

for(const name of fs.readdirSync(root)){
  if(!name.endsWith('.json')) continue;
  const file=path.join(root,name);
  let data; try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}
  walkForPaths(data,file,null);
  const rows=Array.isArray(data)?data:[];
  for(const r of rows){
    const id=Number(r?.ID);
    if(targetIds.has(id)&&idCandidates[id].length<100){
      idCandidates[id].push({file,ID:id,Name:r?.Name??null,Title:r?.Title??null,Desc:typeof r?.Desc==='string'?r.Desc.slice(0,180):null,keys:Object.keys(r||{}).slice(0,30)});
    }
  }
}
for(const t of Object.keys(pathSamples)){
  const seen=new Set(); pathSamples[t]=pathSamples[t].filter(x=>{const k=JSON.stringify(x);if(seen.has(k))return false;seen.add(k);return true;}).slice(0,25);
}
const result={pathSamples,idCandidates};
fs.writeFileSync('data/generated/equipment_acquisition_pathtype_samples.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));