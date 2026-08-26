'use strict';
const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,v)=>{const full=path.join(root,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify(v,null,2)+'\n');};
const relationPath='data/generated/hero-exclusive-equipment-relations.v1.json';
const b4Path='data/validation/hero-exclusive-equipment-relation-stageB4-validation.v1.json';
const relation=read(relationPath);
const b4=read(b4Path);
if(b4.status!=='PASS'||b4.completion!=='COMPLETE') throw new Error(`B-4 gate is ${b4.status}/${b4.completion}`);
const relationBlobSha=execFileSync('git',['hash-object',relationPath],{cwd:root,encoding:'utf8'}).trim();
if(!b4.relationSet?.gitBlobSha||relationBlobSha!==b4.relationSet.gitBlobSha) throw new Error(`Relation blob SHA mismatch: B-4=${b4.relationSet?.gitBlobSha||null}, current=${relationBlobSha}`);
const edges=Array.isArray(relation.records)?relation.records:[];
if(edges.length!==167) throw new Error(`Canonical edge count is ${edges.length}, expected 167.`);
const byHero=new Map(),byEquipment=new Map(),pairs=new Set();
for(const e of edges){
  const h=Number(e.heroId),q=Number(e.equipmentId),pair=`${h}:${q}`;
  if(!Number.isInteger(h)||!Number.isInteger(q)) throw new Error(`Invalid canonical pair ${JSON.stringify(e)}`);
  if(pairs.has(pair)) throw new Error(`Duplicate canonical pair ${pair}`);
  pairs.add(pair);
  if(!byHero.has(h)) byHero.set(h,[]);
  if(!byEquipment.has(q)) byEquipment.set(q,[]);
  byHero.get(h).push(q);
  byEquipment.get(q).push(h);
}
const orderedObject=m=>Object.fromEntries([...m.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>[String(k),v.slice().sort((a,b)=>a-b)]));
const byHeroId=orderedObject(byHero);
const byEquipmentId=orderedObject(byEquipment);
const relationSet={path:relationPath,gitBlobSha:relationBlobSha,edgeCount:edges.length};
const heroLengths=Object.values(byHeroId).map(x=>x.length);
const equipmentLengths=Object.values(byEquipmentId).map(x=>x.length);
const heroOut={
  version:1,stage:'B-5',schemaId:'hero-exclusive-equipment-by-hero/v1',relationSet,
  summary:{keyCount:Object.keys(byHeroId).length,relationCount:heroLengths.reduce((a,b)=>a+b,0),maxValueCountPerKey:Math.max(0,...heroLengths),canonicalHeroesWithoutKey:267-Object.keys(byHeroId).length},
  byHeroId
};
const equipmentOut={
  version:1,stage:'B-5',schemaId:'hero-exclusive-equipment-by-equipment/v1',relationSet,
  summary:{keyCount:Object.keys(byEquipmentId).length,relationCount:equipmentLengths.reduce((a,b)=>a+b,0),maxValueCountPerKey:Math.max(0,...equipmentLengths)},
  byEquipmentId
};
write('data/generated/hero-exclusive-equipment-by-hero.v1.json',heroOut);
write('data/generated/hero-exclusive-equipment-by-equipment.v1.json',equipmentOut);
console.log(JSON.stringify({relationBlobSha,byHero:heroOut.summary,byEquipment:equipmentOut.summary},null,2));
