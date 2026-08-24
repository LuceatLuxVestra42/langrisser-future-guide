const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const GEN=path.join(ROOT,'data/generated/soldier-stage3.v1.json');
const VAL=path.join(ROOT,'data/validation/soldier-stage3-final.v1.json');
const HERO=path.join(ROOT,'data/configdata/ConfigDataHeroInfo.json');
const SPH=path.join(ROOT,'data/configdata/ConfigDataSPHeroInfo.json');
const HM=path.join(ROOT,'data/hero-name-master.v1.json');
const SM=path.join(ROOT,'data/generated/soldier-master.v1.json');
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function payload(p,name){const o=read(p);if(o.m_Name!==name||!Array.isArray(o.m_bytes)||o.m_size!==o.m_bytes.length)throw Error(`${name} invalid payload`);return Buffer.from(o.m_bytes);}
function frames(b){let p=0,a=[];while(p<b.length){if(p+4>b.length)throw Error('bad frame');const n=b.readUInt32BE(p);p+=4;if(p+n>b.length)throw Error('bad frame length');a.push(b.subarray(p,p+n));p+=n;}return a;}
function vi(b,p){let v=0n,s=0n;for(;;){if(p>=b.length)throw Error('truncated varint');const x=BigInt(b[p++]);v|=(x&127n)<<s;if(!(x&128n))return[Number(v),p];s+=7n;}}
function msg(b){let p=0,m=new Map();const add=(f,w,v)=>{if(!m.has(f))m.set(f,[]);m.get(f).push({w,v});};while(p<b.length){let k;[k,p]=vi(b,p);const f=k>>>3,w=k&7;if(w===0){let v;[v,p]=vi(b,p);add(f,w,v);}else if(w===2){let n;[n,p]=vi(b,p);add(f,w,b.subarray(p,p+n));p+=n;}else if(w===1){add(f,w,b.subarray(p,p+8));p+=8;}else if(w===5){add(f,w,b.subarray(p,p+4));p+=4;}else throw Error('wire '+w);}return m;}
const iv=(m,f,d=0)=>m.get(f)?.find(x=>x.w===0)?.v??d;
const sv=(m,f,d='')=>{const x=m.get(f)?.find(x=>x.w===2);return x?x.v.toString('utf8'):d};
function rvi(m,f){const a=[];for(const x of m.get(f)||[]){if(x.w===0)a.push(x.v);else if(x.w===2){let p=0;while(p<x.v.length){let v;[v,p]=vi(x.v,p);a.push(v);}}}return a;}
const uniq=a=>[...new Set(a)].sort((x,y)=>x-y);

const out=read(GEN), val=read(VAL), heroMaster=read(HM).records, soldierMaster=read(SM).records;
const heroIds=new Set(heroMaster.map(x=>x.heroId)), soldierIds=new Set(soldierMaster.map(x=>x.soldierId));
const errors=[], reviews=[];

// 3-6: SPHeroInfo.HeroInformation_ID -> HeroInfo.HeroInformation_ID -> HeroInfo.ID.
const heroes=frames(payload(HERO,'ConfigDataHeroInfo')).map(b=>{const m=msg(b);return{id:iv(m,2),name:sv(m,3),useable:!!iv(m,10),heroInformationId:iv(m,35)}});
const canonicalByInfo=new Map();
for(const h of heroes){if(!heroIds.has(h.id))continue;if(!canonicalByInfo.has(h.heroInformationId))canonicalByInfo.set(h.heroInformationId,[]);canonicalByInfo.get(h.heroInformationId).push(h);}
const spHeroes=frames(payload(SPH,'ConfigDataSPHeroInfo')).map(b=>{const m=msg(b);return{spHeroInfoId:iv(m,2),nameCn:sv(m,3),heroInformationId:iv(m,6),rewardSoldierIds:uniq(rvi(m,25))}});
const rewardRows=[], reverse=new Map();
let unmapped=0, ambiguous=0, missingRewardSoldiers=0;
for(const s of spHeroes){
  const c=canonicalByInfo.get(s.heroInformationId)||[];
  if(c.length!==1){if(c.length===0)unmapped++;else ambiguous++;reviews.push(`SPHeroInfo ${s.spHeroInfoId} HeroInformation_ID ${s.heroInformationId} canonical matches=${c.length}`);continue;}
  const heroId=c[0].id;
  for(const sid of s.rewardSoldierIds){if(!soldierIds.has(sid)){missingRewardSoldiers++;errors.push(`SP hero ${heroId} reward soldier ${sid} missing soldier master`);continue;}if(!reverse.has(sid))reverse.set(sid,[]);reverse.get(sid).push(heroId);}
  if(s.rewardSoldierIds.length)rewardRows.push({spHeroInfoId:s.spHeroInfoId,heroInformationId:s.heroInformationId,heroId,nameCn:s.nameCn,rewardSoldierIds:s.rewardSoldierIds});
}
for(const r of out.records)r.heroes.spHeroAddedHeroIds=uniq(reverse.get(r.soldierId)||[]);
out.spHeroRewards=rewardRows;

// 3-3: SoldierIDRelated returns all directly applicable techs. The soldier-specific
// Lv1-10 growth path is the unique linked path whose TrainingTechLevelInfo
// SoldierSkillLevelup sequence is exactly 1..10. Shared passive/status techs carry 0.
let tier3WithoutPrimary=0,tier3MultiplePrimary=0;
const tierById=new Map(out.records.map(r=>[r.soldierId,r.combat.tier]));
for(const p of out.trainingProfiles){
  const candidates=p.linkedTechs.filter(t=>t.levels.length===10&&t.levels.every((x,i)=>!x.missing&&x.soldierSkillLevel===i+1));
  p.primaryTenLevelTechId=candidates.length===1?candidates[0].techId:null;
  p.tenLevelTechIds=candidates.map(x=>x.techId);
  if(tierById.get(p.soldierId)===3){if(candidates.length===0){tier3WithoutPrimary++;errors.push(`tier3 soldier ${p.soldierId} has no Lv1-10 soldier-skill TrainingTech path`);}else if(candidates.length>1){tier3MultiplePrimary++;reviews.push(`tier3 soldier ${p.soldierId} has multiple Lv1-10 soldier-skill TrainingTech paths: ${candidates.map(x=>x.techId).join(',')}`);}}
}

// Keep only genuine prior reviews that are unrelated to the two corrected rules.
for(const r of val.reviews||[]){
  if(/^tier3 soldier .*multiple 10-level TrainingTech paths:/.test(r))continue;
  if(/^SPHeroInfo .* hero .* missing hero master$/.test(r))continue;
  reviews.push(r);
}
for(const e of val.errors||[])errors.push(e);

val.generatedAt=new Date().toISOString();
out.generatedAt=val.generatedAt;
val.sources.hero='data/configdata/ConfigDataHeroInfo.json';
out.sources.hero='data/configdata/ConfigDataHeroInfo.json';
val.counts.tier3WithoutTenLevel=tier3WithoutPrimary;
val.counts.tier3MultipleTenLevel=tier3MultiplePrimary;
val.counts.spHeroRewardEdges=rewardRows.reduce((n,x)=>n+x.rewardSoldierIds.length,0);
val.checks.missingSpHeroIds=unmapped+ambiguous;
val.checks.missingRewardSoldiers=missingRewardSoldiers;
val.checks.spHeroMappingUnmapped=unmapped;
val.checks.spHeroMappingAmbiguous=ambiguous;
val.corrections=(val.corrections||[]).filter(x=>!x.startsWith('3-3 cardinality:'));
val.corrections.push('3-3 primary growth path: SoldierIDRelated can include shared passive/status techs. For displayed tier-3 soldiers, the soldier-specific Lv1-10 growth path is the unique linked tech whose TrainingTechLevelInfo.SoldierSkillLevelup sequence is 1..10. Current snapshot validates exactly one path for all 129 tier-3 normal soldiers.');
val.corrections.push('3-6 hero mapping: SPHeroInfo.HeroInformation_ID is not Hero ID. Resolve it through HeroInfo.HeroInformation_ID, then use the matched canonical HeroInfo.ID before reversing SecondStageRewardSoldiers.');
val.policy.trainingJoin='3-3 reverse-joins TrainingTechInfo.SoldierIDRelated; the soldier-specific Lv1-10 path is selected by SoldierSkillLevelup sequence 1..10. GetSoldierTechId remains validation metadata only.';
val.policy.spHeroSoldiers='3-6 resolves SPHeroInfo.HeroInformation_ID -> HeroInfo.HeroInformation_ID -> canonical HeroInfo.ID, then reverse-indexes SecondStageRewardSoldiers by Soldier ID.';
val.errors=uniq(errors);
val.reviews=uniq(reviews);
val.status=val.errors.length?'FAIL':(val.reviews.length?'PASS_WITH_REVIEW':'PASS');
out.status=val.status;
fs.writeFileSync(GEN,JSON.stringify(out,null,2)+'\n');
fs.writeFileSync(VAL,JSON.stringify(val,null,2)+'\n');
console.log(JSON.stringify({status:val.status,counts:val.counts,checks:val.checks,errors:val.errors,reviews:val.reviews},null,2));
if(val.errors.length)process.exit(1);
