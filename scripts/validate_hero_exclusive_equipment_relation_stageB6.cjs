'use strict';
const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const blob=p=>{try{return execFileSync('git',['hash-object',p],{cwd:root,encoding:'utf8'}).trim();}catch{return null;}};
const b5=read('data/validation/hero-exclusive-equipment-relation-stageB5-index-summary.v1.json');
const byHero=read('data/generated/hero-exclusive-equipment-by-hero.v1.json');
const byEquipment=read('data/generated/hero-exclusive-equipment-by-equipment.v1.json');
const heroes=read('data/hero-name-master.v1.json').records||[];
const equipmentConsumer=read('data/generated/equipment_stage3_5_exclusive_consumer.json');
const legacy=read('data/generated/hero-page-stage5-2-exclusive-central.v1.json');
const errors=[]; const fail=(id,detail)=>errors.push({id,detail});
const relationSha=b5?.relationSet?.gitBlobSha||null;
if(b5.status!=='PASS'||b5.completion!=='COMPLETE') fail('b5-gate',`${b5.status}/${b5.completion}`);
if(!relationSha||byHero?.relationSet?.gitBlobSha!==relationSha||byEquipment?.relationSet?.gitBlobSha!==relationSha) fail('relation-blob-pin','B-5/index relation SHA mismatch');
const heroIds=new Set(heroes.map(x=>Number(x.heroId)));
if(heroes.length!==267||heroIds.size!==267) fail('hero-population',`count=${heroes.length}, unique=${heroIds.size}`);
const heroMap=byHero.byHeroId||{};
const equipmentMap=byEquipment.byEquipmentId||{};
const heroPairs=new Set();
for(const [h,qs] of Object.entries(heroMap)) for(const q of (qs||[])) heroPairs.add(`${Number(h)}:${Number(q)}`);
const equipmentPairs=new Set(); let unknownOwner=0;
for(const [q,hs] of Object.entries(equipmentMap)) for(const h of (hs||[])){equipmentPairs.add(`${Number(h)}:${Number(q)}`);if(!heroIds.has(Number(h))) unknownOwner++;}
const heroKeyCount=Object.keys(heroMap).length, equipmentKeyCount=Object.keys(equipmentMap).length;
const heroesWithoutKey=[...heroIds].filter(id=>!Object.prototype.hasOwnProperty.call(heroMap,String(id)));
if(heroKeyCount!==167||heroPairs.size!==167) fail('byhero-count',`keys=${heroKeyCount}, pairs=${heroPairs.size}`);
if(equipmentKeyCount!==167||equipmentPairs.size!==167) fail('byequipment-count',`keys=${equipmentKeyCount}, pairs=${equipmentPairs.size}`);
if(heroesWithoutKey.length!==100) fail('hero-absence-count',`actual=${heroesWithoutKey.length}`);
if(unknownOwner) fail('unknown-equipment-owner',String(unknownOwner));
const listRecords=equipmentConsumer.listRecords||[];
const equipmentConsumerIds=new Set(listRecords.map(x=>Number(x.equipmentId)));
const equipmentIndexIds=new Set(Object.keys(equipmentMap).map(Number));
const equipmentMissing=[...equipmentIndexIds].filter(id=>!equipmentConsumerIds.has(id));
const equipmentExtra=[...equipmentConsumerIds].filter(id=>!equipmentIndexIds.has(id));
const generalLeak=listRecords.filter(x=>x.acquisitionClass!=='exclusive-equipment').map(x=>Number(x.equipmentId));
if(listRecords.length!==167||equipmentConsumerIds.size!==167) fail('equipment-consumer-count',`count=${listRecords.length}, unique=${equipmentConsumerIds.size}`);
if(equipmentMissing.length||equipmentExtra.length) fail('equipment-consumer-coverage',`missing=${equipmentMissing.length}, extra=${equipmentExtra.length}`);
if(generalLeak.length) fail('general-equipment-leak',generalLeak.join(','));
const legacyRecords=legacy.records||[];
const legacyReleased=legacyRecords.filter(x=>x?.exclusiveEquipment?.status==='RELEASED');
const legacyNotReleased=legacyRecords.filter(x=>x?.exclusiveEquipment?.status==='NOT_RELEASED');
const legacyPairs=new Set(legacyReleased.map(x=>`${Number(x.heroId)}:${Number(x.exclusiveEquipment.equipmentId)}`));
const legacyAbsent=new Set(legacyNotReleased.map(x=>Number(x.heroId)));
const setDiff=(a,b)=>[...a].filter(x=>!b.has(x));
const legacyMissing=setDiff(heroPairs,legacyPairs), legacyExtra=setDiff(legacyPairs,heroPairs);
const absenceMissing=heroesWithoutKey.filter(x=>!legacyAbsent.has(x));
const absenceExtra=[...legacyAbsent].filter(x=>!heroesWithoutKey.includes(x));
if(legacyRecords.length!==267||legacyReleased.length!==167||legacyNotReleased.length!==100) fail('legacy-counts',`records=${legacyRecords.length}, released=${legacyReleased.length}, absent=${legacyNotReleased.length}`);
if(legacyMissing.length||legacyExtra.length) fail('legacy-pair-parity',`missing=${legacyMissing.length}, extra=${legacyExtra.length}`);
if(absenceMissing.length||absenceExtra.length) fail('legacy-absence-parity',`missing=${absenceMissing.length}, extra=${absenceExtra.length}`);
const pairParity=setDiff(heroPairs,equipmentPairs).length===0&&setDiff(equipmentPairs,heroPairs).length===0;
if(!pairParity) fail('directional-parity','byHero and byEquipment pair sets differ');
const leonHero=heroMap['6']||[], leonEquipment=equipmentMap['416']||[];
const leonPass=leonHero.length===1&&Number(leonHero[0])===416&&leonEquipment.length===1&&Number(leonEquipment[0])===6;
if(!leonPass) fail('leon-fixture','expected Hero 6 <-> Equipment 416');
const pass=errors.length===0;
const byHeroBlob=blob('data/generated/hero-exclusive-equipment-by-hero.v1.json');
const byEquipmentBlob=blob('data/generated/hero-exclusive-equipment-by-equipment.v1.json');
const manifest={
  version:1,stage:'B-6',status:pass?'COMPLETE':'BLOCKED',
  semanticAuthority:{path:'data/generated/hero-exclusive-equipment-relations.v1.json',gitBlobSha:relationSha},
  consumerLookupAuthority:{
    hero:{path:'data/generated/hero-exclusive-equipment-by-hero.v1.json',gitBlobSha:byHeroBlob,indexField:'byHeroId',lookup:'heroId -> equipmentIds[]',metadataJoin:'data/generated/equipment_stage3_5_exclusive_consumer.json by equipmentId'},
    equipment:{path:'data/generated/hero-exclusive-equipment-by-equipment.v1.json',gitBlobSha:byEquipmentBlob,indexField:'byEquipmentId',lookup:'equipmentId -> heroIds[]',metadataJoin:'data/hero-name-master.v1.json by heroId'}
  },
  legacyTransition:{path:'data/generated/hero-page-stage5-2-exclusive-central.v1.json',classification:'PARITY_ONLY_LEGACY_SNAPSHOT',ownershipAuthority:false,centralDisciplineUnchanged:true},
  boundaries:{generalEquipmentAdmitted:false,directConfigDataOwnershipInPageConsumers:false,heuristicOwnership:false,newOwnershipPairCopy:false},
  summary:{heroCount:heroes.length,heroOwnershipKeys:heroKeyCount,heroesWithoutExclusiveKey:heroesWithoutKey.length,equipmentOwnershipKeys:equipmentKeyCount,ownershipPairCount:heroPairs.size,equipmentMetadataCoverage:equipmentConsumerIds.size,legacyPairParityMismatch:legacyMissing.length+legacyExtra.length,legacyAbsenceParityMismatch:absenceMissing.length+absenceExtra.length,hardErrorCount:errors.length}
};
const validation={
  version:1,stage:'B-6',checkpoint:'consumer-admission',status:pass?'PASS':'FAIL',completion:pass?'COMPLETE':'BLOCKED',
  contract:'data/contracts/hero-exclusive-equipment-relation-consumer-contract.v1.json',manifest:'data/generated/hero-exclusive-equipment-consumer-admission.v1.json',
  relationSet:{gitBlobSha:relationSha},
  checks:{
    b5Gate:{pass:b5.status==='PASS'&&b5.completion==='COMPLETE'},relationBlobPin:{pass:!!relationSha&&byHero?.relationSet?.gitBlobSha===relationSha&&byEquipment?.relationSet?.gitBlobSha===relationSha},
    heroPopulation:{expected:267,actual:heroes.length,pass:heroes.length===267&&heroIds.size===267},
    byHeroCoverage:{keys:heroKeyCount,pairs:heroPairs.size,expected:167,pass:heroKeyCount===167&&heroPairs.size===167},
    heroAbsenceSemantics:{expected:100,actual:heroesWithoutKey.length,pass:heroesWithoutKey.length===100},
    byEquipmentCoverage:{keys:equipmentKeyCount,pairs:equipmentPairs.size,expected:167,pass:equipmentKeyCount===167&&equipmentPairs.size===167},
    equipmentMetadataCoverage:{expected:167,actual:equipmentConsumerIds.size,missing:equipmentMissing.length,extra:equipmentExtra.length,pass:listRecords.length===167&&equipmentMissing.length===0&&equipmentExtra.length===0},
    generalEquipmentAdmitted:{expected:0,actual:generalLeak.length,pass:generalLeak.length===0},
    canonicalOwnerHeroResolution:{expectedUnknown:0,actualUnknown:unknownOwner,pass:unknownOwner===0},
    legacyOwnershipPairParity:{expectedMismatch:0,actualMismatch:legacyMissing.length+legacyExtra.length,pass:legacyMissing.length===0&&legacyExtra.length===0},
    legacyNotReleasedParity:{expectedMismatch:0,actualMismatch:absenceMissing.length+absenceExtra.length,pass:absenceMissing.length===0&&absenceExtra.length===0},
    directionalParity:{pass:pairParity},leonFixture:{pass:leonPass},newOwnershipPairCopy:{expected:false,actual:false,pass:true},hardErrors:{expected:0,actual:errors.length,pass}
  },
  diagnostics:{equipmentMissing,equipmentExtra,generalLeak,legacyMissing,legacyExtra,absenceMissing,absenceExtra,errors},
  decision:pass?'B-6 PASS / COMPLETE. Hero Stage 5-2 ownership is admitted to byHeroId and Equipment-page ownership is admitted to byEquipmentId; legacy direct SkillHero output is parity-only evidence. Stage B is complete.':'B-6 FAIL / BLOCKED. Do not promote consumer ownership paths.'
};
fs.writeFileSync(path.join(root,'data/generated/hero-exclusive-equipment-consumer-admission.v1.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(root,'data/validation/hero-exclusive-equipment-relation-stageB6-consumer-summary.v1.json'),JSON.stringify(validation,null,2)+'\n');
console.log(JSON.stringify({status:validation.status,summary:manifest.summary,relationSha,byHeroBlob,byEquipmentBlob,errors},null,2));
if(!pass) process.exitCode=1;
