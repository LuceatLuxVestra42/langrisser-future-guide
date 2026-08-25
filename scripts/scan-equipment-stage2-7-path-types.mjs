import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skip = p => p.includes(`${path.sep}.git${path.sep}`) || p.includes(`${path.sep}node_modules${path.sep}`) || p.includes(`${path.sep}data${path.sep}generated${path.sep}`);
const wanted = [/PathType/i,/GetPath/i,/获取途径/];
const matches = [];
const keyMatches = [];

function walk(dir){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(skip(p)) continue;
    if(ent.isDirectory()) walk(p);
    else {
      const rel=path.relative(root,p).replaceAll('\\','/');
      if(rel==='data/configdata/ConfigDataEquipmentInfo.json') continue;
      let s;
      try { s=fs.readFileSync(p,'utf8'); } catch { continue; }
      if(!wanted.some(re=>re.test(s))) continue;
      const lines=s.split(/\r?\n/);
      const excerpts=[];
      for(let i=0;i<lines.length && excerpts.length<20;i++) if(wanted.some(re=>re.test(lines[i]))) excerpts.push({line:i+1,text:lines[i].slice(0,500)});
      matches.push({path:rel,sizeBytes:Buffer.byteLength(s),excerpts});
      if(rel.startsWith('data/configdata/') && rel.endsWith('.json')) {
        try {
          const data=JSON.parse(s); const arr=Array.isArray(data)?data:[];
          const keys=new Set();
          for(const row of arr.slice(0,1000)) if(row&&typeof row==='object') for(const k of Object.keys(row)) if(/Path|Get/i.test(k)) keys.add(k);
          keyMatches.push({path:rel,rows:arr.length,keys:[...keys].sort()});
        } catch {}
      }
    }
  }
}
walk(root);
const result={matchFileCount:matches.length,matches:matches.slice(0,100),configKeyMatches:keyMatches.slice(0,100)};
fs.mkdirSync('data/generated',{recursive:true});
fs.writeFileSync('data/generated/equipment_stage2_7_path_type_scan.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
