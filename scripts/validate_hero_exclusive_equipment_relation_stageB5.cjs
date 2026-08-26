'use strict';
const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,v)=>{const full=path.join(root,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify(v,null,2)+'\n');};
const relationPath='data/generated/hero-exclusive-equipment-relations.v1.json';
const byHeroPath='data/generated/hero-exclusive-equipment-by-hero.v1.json';
const byEquipmentPath='data/generated/hero-exclusive-equipment-by-equipment.v1.json';
const b4=read('data/validation/hero-exclusive-equipment-relation-stageB4-validation.v1.json');
const relation=read(relationPath),byHero=read(byHeroPath),byEquipment=read(byEquipmentPath);
const edges=Array.isArray(relation.records)?relation.records:[];
const currentSha=execFileSync('git',['hash-object',relationPath],{cwd:root,encoding:'utf8'}).trim();
const errors=[];const fail=(id,detail)=>errors.push({id,detail});
if(b4.status!=='PASS'||b4.completion!=='COMPLETE') fail('b4-gate',`${b4.status}/${b4.completion}`);
if(currentSha!==b4.relationSet?.gitBlobSha) fail('relation-blob-pin',`B4=${b4.relationSet?.gitBlobSha||null}, current=${currentSha}`);
for(const [name,doc] of [['byHero',byHero],['byEquipment',byEquipment]]){
  if(doc.relationSet?.path!==relationPath) fail(`${name}-relation-path`,String(doc.relationSet?.path));
  if(doc.relationSet?.gitBlobSha!==currentSha) fail(`${name}-relation-sha`,String(doc.relationSet?.gitBlobSha));
  if(Number(doc.relationSet?.edgeCount)!==edges.length) fail(`${name}-edge-count`,String(doc.relationSet?.edgeCount));
}
const canonical=new Set();
for(const e of edges){const k=`${Number(e.heroId)}:${Number(e.equipmentId)}`;if(canonical.has(k))fail('canonical-duplicate',k);canonical.add(k);}
const fromHero=new Set(),fromEquipment=new Set();
let heroDuplicateValues=0,equipmentDuplicateValues=0,heroUnsortedValues=0,equipmentUnsortedValues=0;
for(const [h,values] of Object.entries(byHero.byHeroId||{})){
  if(!Array.isArray(values)||values.length===0) fail('byHero-empty-or-invalid',h);
  const seen=new Set();
  for(let i=0;i<values.length;i++){
    const q=Number(values[i]);if(seen.has(q))heroDuplicateValues++;seen.add(q);if(i&&Number(values[i-1])>q)heroUnsortedValues++;fromHero.add(`${Number(h)}:${q}`);
  }
}
for(const [q,values] of Object.entries(byEquipment.byEquipmentId||{})){
  if(!Array.isArray(values)||values.length===0) fail('byEquipment-empty-or-invalid',q);
  const seen=new Set();
  for(let i=0;i<values.length;i++){
    const h=Number(values[i]);if(seen.has(h))equipmentDuplicateValues++;seen.add(h);if(i&&Number(values[i-1])>h)equipmentUnsortedValues++;fromEquipment.add(`${h}:${Number(q)}`);
  }
}
if(heroDuplicateValues) fail('byHero-duplicate-values',String(heroDuplicateValues));
if(equipmentDuplicateValues) fail('byEquipment-duplicate-values',String(equipmentDuplicateValues));
if(heroUnsortedValues) fail('byHero-value-order',String(heroUnsortedValues));
if(equipmentUnsortedValues) fail('byEquipment-value-order',String(equipmentUnsortedValues));
const diff=(a,b)=>[...a].filter(x=>!b.has(x));
const canonicalMissingFromHero=diff(canonical,fromHero),heroExtra=diff(fromHero,canonical);
const canonicalMissingFromEquipment=diff(canonical,fromEquipment),equipmentExtra=diff(fromEquipment,canonical);
const directionalMismatch=[...new Set([...diff(fromHero,fromEquipment),...diff(fromEquipment,fromHero)])];
if(canonicalMissingFromHero.length||heroExtra.length) fail('byHero-round-trip',`missing=${canonicalMissingFromHero.length}, extra=${heroExtra.length}`);
if(canonicalMissingFromEquipment.length||equipmentExtra.length) fail('byEquipment-round-trip',`missing=${canonicalMissingFromEquipment.length}, extra=${equipmentExtra.length}`);
if(directionalMismatch.length) fail('directional-parity',`mismatch=${directionalMismatch.length}`);
const heroValues=Object.values(byHero.byHeroId||{}),equipmentValues=Object.values(byEquipment.byEquipmentId||{});
const heroRelationCount=heroValues.reduce((n,x)=>n+(Array.isArray(x)?x.length:0),0);
const equipmentRelationCount=equipmentValues.reduce((n,x)=>n+(Array.isArray(x)?x.length:0),0);
const heroMax=Math.max(0,...heroValues.map(x=>Array.isArray(x)?x.length:0));
const equipmentMax=Math.max(0,...equipmentValues.map(x=>Array.isArray(x)?x.length:0));
const heroKeyCount=Object.keys(byHero.byHeroId||{}).length,equipmentKeyCount=Object.keys(byEquipment.byEquipmentId||{}).length;
if(heroKeyCount!==167||heroRelationCount!==167||heroMax!==1) fail('byHero-cardinality',`keys=${heroKeyCount}, relations=${heroRelationCount}, max=${heroMax}`);
if(equipmentKeyCount!==167||equipmentRelationCount!==167||equipmentMax!==1) fail('byEquipment-cardinality',`keys=${equipmentKeyCount}, relations=${equipmentRelationCount}, max=${equipmentMax}`);
if(byHero.summary?.keyCount!==heroKeyCount||byHero.summary?.relationCount!==heroRelationCount||byHero.summary?.maxValueCountPerKey!==heroMax||byHero.summary?.canonicalHeroesWithoutKey!==100) fail('byHero-summary','summary mismatch');
if(byEquipment.summary?.keyCount!==equipmentKeyCount||byEquipment.summary?.relationCount!==equipmentRelationCount||byEquipment.summary?.maxValueCountPerKey!==equipmentMax) fail('byEquipment-summary','summary mismatch');
const pass=errors.length===0;
const validation={
  version:1,stage:'B-5',checkpoint:'bidirectional-index-generation-round-trip-validation',status:pass?'PASS':'FAIL',completion:pass?'COMPLETE':'BLOCKED',
  contract:'data/contracts/hero-exclusive-equipment-relation-index-contract.v1.json',
  relationSet:{path:relationPath,gitBlobSha:currentSha,edgeCount:edges.length,b4ValidatedBlobSha:b4.relationSet?.gitBlobSha||null},
  artifacts:{byHero:byHeroPath,byEquipment:byEquipmentPath},
  checks:{
    b4Gate:{pass:b4.status==='PASS'&&b4.completion==='COMPLETE'},relationBlobPin:{pass:currentSha===b4.relationSet?.gitBlobSha},
    byHeroKeyCount:{expected:167,actual:heroKeyCount,pass:heroKeyCount===167},byHeroRelationCount:{expected:167,actual:heroRelationCount,pass:heroRelationCount===167},byHeroMaxValueCount:{expected:1,actual:heroMax,pass:heroMax===1},
    byEquipmentKeyCount:{expected:167,actual:equipmentKeyCount,pass:equipmentKeyCount===167},byEquipmentRelationCount:{expected:167,actual:equipmentRelationCount,pass:equipmentRelationCount===167},byEquipmentMaxValueCount:{expected:1,actual:equipmentMax,pass:equipmentMax===1},
    byHeroDuplicateValues:{expected:0,actual:heroDuplicateValues,pass:heroDuplicateValues===0},byEquipmentDuplicateValues:{expected:0,actual:equipmentDuplicateValues,pass:equipmentDuplicateValues===0},
    canonicalVsByHero:{missing:canonicalMissingFromHero.length,extra:heroExtra.length,pass:canonicalMissingFromHero.length===0&&heroExtra.length===0},
    canonicalVsByEquipment:{missing:canonicalMissingFromEquipment.length,extra:equipmentExtra.length,pass:canonicalMissingFromEquipment.length===0&&equipmentExtra.length===0},
    directionalParity:{mismatch:directionalMismatch.length,pass:directionalMismatch.length===0},hardErrors:{expected:0,actual:errors.length,pass}
  },
  cardinalityProjection:{equipmentToHero:'EXACTLY_ONE',heroToEquipment:'ZERO_OR_ONE',byHeroKeys:heroKeyCount,canonicalHeroesWithoutKey:267-heroKeyCount,byEquipmentKeys:equipmentKeyCount,arrayShapePreserved:true},
  diagnostics:{canonicalMissingFromHero,heroExtra,canonicalMissingFromEquipment,equipmentExtra,directionalMismatch,errors},
  nextStage:pass?'B-6 consumer admission':'B-5 blocked',
  decision:pass?'B-5 PASS / COMPLETE. Both indexes are lossless projections of the exact B-4 validated relation blob and may be admitted to B-6 consumers.':'B-5 FAIL / BLOCKED. Do not admit indexes to consumers.'
};
write('data/validation/hero-exclusive-equipment-relation-stageB5-index-summary.v1.json',validation);
console.log(JSON.stringify({status:validation.status,relationBlobSha:currentSha,byHero:{keys:heroKeyCount,relations:heroRelationCount},byEquipment:{keys:equipmentKeyCount,relations:equipmentRelationCount},pairMismatch:directionalMismatch.length,hardErrorCount:errors.length},null,2));
if(!pass) process.exitCode=1;
