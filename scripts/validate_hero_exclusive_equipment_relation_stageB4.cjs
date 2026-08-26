'use strict';
const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const relationPath='data/generated/hero-exclusive-equipment-relations.v1.json';
const outPath='data/validation/hero-exclusive-equipment-relation-stageB4-validation.v1.json';
const relation=read(relationPath);
const heroes=read('data/hero-name-master.v1.json').records||[];
const acq=read('data/generated/equipment_stage2_7_acquisition.json').records||[];
const b3=read('data/validation/hero-exclusive-equipment-relation-stageB3-summary.v1.json');
const edges=relation.records||[];
const heroIds=new Set(heroes.map(x=>Number(x.heroId)));
const exclusiveRows=acq.filter(x=>x.acquisitionClass==='exclusive-equipment');
const exclusiveIds=new Set(exclusiveRows.map(x=>Number(x.equipmentId)));
const errors=[];
const fail=(id,detail)=>errors.push({id,detail});
if(heroes.length!==267||heroIds.size!==267) fail('hero-population',`count=${heroes.length}, unique=${heroIds.size}`);
if(exclusiveRows.length!==167||exclusiveIds.size!==167) fail('exclusive-population',`count=${exclusiveRows.length}, unique=${exclusiveIds.size}`);
if(edges.length!==167) fail('edge-count',`actual=${edges.length}`);
const pairSet=new Set(), heroDegree=new Map(), equipmentDegree=new Map();
let unknownHero=0,outOfScopeEquipment=0,badRelationType=0,badVerification=0,badProvenance=0,heuristicEdges=0;
for(const e of edges){
  const h=Number(e.heroId), q=Number(e.equipmentId), key=`${h}:${q}`;
  if(pairSet.has(key)) fail('duplicate-pair',key); else pairSet.add(key);
  if(!heroIds.has(h)){unknownHero++;fail('unknown-hero',String(h));}
  if(!exclusiveIds.has(q)){outOfScopeEquipment++;fail('out-of-scope-equipment',String(q));}
  if(e.relationType!=='exclusive'){badRelationType++;fail('relation-type',key);}
  if(e.verificationStatus!=='VERIFIED'){badVerification++;fail('verification-status',key);}
  const p=Array.isArray(e.provenance)?e.provenance:[];
  const authoritative=p.some(x=>x.sourceKind==='EQUIPMENT_SKILL_HERO'&&x.table==='ConfigDataEquipmentInfo'&&Number(x.recordId)===q&&x.field==='SkillHero'&&Number(x.value)===h);
  if(!p.length||!authoritative){badProvenance++;fail('authoritative-provenance',key);}
  if(p.some(x=>!['EQUIPMENT_SKILL_HERO'].includes(x.sourceKind))){heuristicEdges++;fail('unadmitted-provenance',key);}
  heroDegree.set(h,(heroDegree.get(h)||0)+1);
  equipmentDegree.set(q,(equipmentDegree.get(q)||0)+1);
}
const missingEquipment=[...exclusiveIds].filter(id=>(equipmentDegree.get(id)||0)!==1);
const multiOwnerEquipment=[...equipmentDegree].filter(([,n])=>n>1).map(([id,n])=>({equipmentId:id,degree:n}));
const multipleEquipmentHeroes=[...heroDegree].filter(([,n])=>n>1).map(([id,n])=>({heroId:id,degree:n}));
const heroesWithOne=[...heroIds].filter(id=>(heroDegree.get(id)||0)===1);
const heroesWithZero=[...heroIds].filter(id=>(heroDegree.get(id)||0)===0);
if(missingEquipment.length) fail('equipment-exactly-one',missingEquipment.join(','));
if(multiOwnerEquipment.length) fail('equipment-multi-owner',JSON.stringify(multiOwnerEquipment));
if(multipleEquipmentHeroes.length) fail('hero-zero-or-one',JSON.stringify(multipleEquipmentHeroes));
if(heroesWithOne.length!==167||heroesWithZero.length!==100) fail('hero-cardinality-distribution',`one=${heroesWithOne.length}, zero=${heroesWithZero.length}`);
const s=b3.summary||{};
if(b3.status!=='PASS'||b3.completion!=='COMPLETE') fail('b3-status',`${b3.status}/${b3.completion}`);
if(s.canonicalEdgeCount!==edges.length||s.mappedExclusiveEquipmentCount!==exclusiveIds.size||s.uniqueOwnerHeroCount!==heroesWithOne.length||s.unmappedExclusiveEquipmentCount!==0||s.duplicatePairCount!==0||s.multiOwnerEquipmentCount!==0||s.multipleEquipmentHeroCount!==0||s.excludedEquipmentLeakCount!==0||s.unknownHeroIdCount!==0||s.heuristicEdgeCount!==0||s.hardErrorCount!==0) fail('b3-parity','B-3 summary differs from B-4 direct validation');
let relationBlobSha=null;
try{relationBlobSha=execFileSync('git',['hash-object',relationPath],{cwd:root,encoding:'utf8'}).trim();}catch{}
const pass=errors.length===0;
const validation={
  version:1,stage:'B-4',checkpoint:'full-relation-validation-cardinality-freeze',status:pass?'PASS':'FAIL',completion:pass?'COMPLETE':'BLOCKED',
  contract:'data/contracts/hero-exclusive-equipment-relation-validation-contract.v1.json',
  relationSet:{path:relationPath,gitBlobSha:relationBlobSha,edgeCount:edges.length},
  checks:{
    canonicalHeroPopulation:{expected:267,actual:heroes.length,unique:heroIds.size,pass:heroes.length===267&&heroIds.size===267},
    exclusiveEquipmentPopulation:{expected:167,actual:exclusiveRows.length,unique:exclusiveIds.size,pass:exclusiveRows.length===167&&exclusiveIds.size===167},
    exactEquipmentSetCoverage:{expected:167,actual:equipmentDegree.size,missing:missingEquipment.length,outOfScope:outOfScopeEquipment,pass:missingEquipment.length===0&&outOfScopeEquipment===0&&equipmentDegree.size===167},
    canonicalEdgeCount:{expected:167,actual:edges.length,pass:edges.length===167},
    duplicatePairs:{expected:0,actual:edges.length-pairSet.size,pass:edges.length===pairSet.size},
    unknownHeroIds:{expected:0,actual:unknownHero,pass:unknownHero===0},
    relationTypeMismatch:{expected:0,actual:badRelationType,pass:badRelationType===0},
    verificationMismatch:{expected:0,actual:badVerification,pass:badVerification===0},
    authoritativeProvenanceMismatch:{expected:0,actual:badProvenance,pass:badProvenance===0},
    unadmittedProvenance:{expected:0,actual:heuristicEdges,pass:heuristicEdges===0},
    equipmentWithMultipleOwners:{expected:0,actual:multiOwnerEquipment.length,pass:multiOwnerEquipment.length===0},
    heroesWithMultipleExclusiveEquipment:{expected:0,actual:multipleEquipmentHeroes.length,pass:multipleEquipmentHeroes.length===0},
    heroesWithOneExclusive:{expected:167,actual:heroesWithOne.length,pass:heroesWithOne.length===167},
    heroesWithZeroExclusive:{expected:100,actual:heroesWithZero.length,pass:heroesWithZero.length===100},
    b3Parity:{pass:!errors.some(x=>x.id==='b3-parity'||x.id==='b3-status')},
    hardErrors:{expected:0,actual:errors.length,pass}
  },
  cardinalityInvariant:{equipmentToHero:'EXACTLY_ONE',heroToEquipment:'ZERO_OR_ONE',heroWithExclusiveCount:heroesWithOne.length,heroWithoutExclusiveCount:heroesWithZero.length,frozen:pass},
  diagnostics:{missingEquipmentIds:missingEquipment,multiOwnerEquipment,multipleEquipmentHeroes,errors},
  nextStage:pass?'B-5 bidirectional index generation':'B-4 blocked',
  decision:pass?'B-4 PASS / COMPLETE. Freeze equipment->Hero EXACTLY_ONE and Hero->Equipment ZERO_OR_ONE for this contract version; B-5 may derive indexes from this exact relation blob.':'B-4 FAIL / BLOCKED. Do not generate or admit B-5 indexes.'
};
fs.mkdirSync(path.dirname(path.join(root,outPath)),{recursive:true});
fs.writeFileSync(path.join(root,outPath),JSON.stringify(validation,null,2)+'\n');
console.log(JSON.stringify({status:validation.status,relationBlobSha,cardinalityInvariant:validation.cardinalityInvariant,hardErrorCount:errors.length},null,2));
if(!pass) process.exitCode=1;
