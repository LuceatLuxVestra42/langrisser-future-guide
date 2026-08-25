import fs from 'node:fs';
import path from 'node:path';

const roots=['data/configdata'];
const needles=['"PathType"','PathType'];
const matches=[];
for(const root of roots){
  for(const name of fs.readdirSync(root)){
    if(!name.endsWith('.json')) continue;
    const p=path.join(root,name);
    const txt=fs.readFileSync(p,'utf8');
    if(!needles.some(n=>txt.includes(n))) continue;
    const idx=txt.indexOf('PathType');
    matches.push({file:p,size:Buffer.byteLength(txt),firstSnippet:txt.slice(Math.max(0,idx-180),Math.min(txt.length,idx+320)).replace(/\s+/g,' ')});
  }
}
const sourceRoots=['scripts','src','data'];
const codeMatches=[];
function walk(dir){
  if(!fs.existsSync(dir)) return;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()){
      if(['node_modules','.git','generated','configdata'].includes(ent.name)) continue;
      walk(p);
    } else if(/\.(js|mjs|cjs|ts|tsx|cs|txt|md|json)$/i.test(ent.name)){
      const txt=fs.readFileSync(p,'utf8');
      const idx=txt.indexOf('PathType');
      if(idx>=0) codeMatches.push({file:p,size:Buffer.byteLength(txt),firstSnippet:txt.slice(Math.max(0,idx-180),Math.min(txt.length,idx+400)).replace(/\s+/g,' ')});
    }
  }
}
for(const root of sourceRoots) walk(root);
const result={configDataMatches:matches,otherMatches:codeMatches};
fs.mkdirSync('data/generated',{recursive:true});
fs.writeFileSync('data/generated/equipment_acquisition_pathtype_sources.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));