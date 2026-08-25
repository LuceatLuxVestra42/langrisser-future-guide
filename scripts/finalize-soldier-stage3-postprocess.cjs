const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GEN = path.join(ROOT, 'data/generated/soldier-stage3.v1.json');
const VAL = path.join(ROOT, 'data/validation/soldier-stage3-final.v1.json');
const HM = path.join(ROOT, 'data/hero-name-master.v1.json');
const SM = path.join(ROOT, 'data/generated/soldier-master.v1.json');

function read(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function uniq(a){ return [...new Set(a)].sort((x,y)=>typeof x === 'number' && typeof y === 'number' ? x-y : String(x).localeCompare(String(y))); }

const out=read(GEN), val=read(VAL), heroMaster=read(HM).records, soldierMaster=read(SM).records;
const heroIds=new Set(heroMaster.map(x=>x.heroId));
const soldierIds=new Set(soldierMaster.map(x=>x.soldierId));
const tierById=new Map(soldierMaster.map(x=>[x.soldierId,x.tier]));
const errors=[...(val.errors||[])], reviews=[...(val.reviews||[])];

for(const p of out.trainingProfiles||[]){
  if(tierById.get(p.soldierId)!==3) continue;
  const candidates=(p.linkedTechs||[]).filter(t=>(t.levels||[]).length===10 && t.levels.every((x,i)=>!x.missing && x.soldierSkillLevel===i+1));
  if(candidates.length!==1) errors.push(`tier3 soldier ${p.soldierId} expected one Lv1-10 soldier-skill TrainingTech path, got ${candidates.length}`);
  if((p.primaryTenLevelTechId??null)!==(candidates[0]?.techId??null)) errors.push(`tier3 soldier ${p.soldierId} primaryTenLevelTechId mismatch`);
}

for(const row of out.spHeroRewards||[]){
  if(!heroIds.has(row.heroId)) errors.push(`SPHeroInfo ID ${row.heroId} missing canonical hero master`);
  for(const sid of row.rewardSoldierIds||[]) if(!soldierIds.has(sid)) errors.push(`SP hero ${row.heroId} reward soldier ${sid} missing soldier master`);
}

val.errors=uniq(errors);
val.reviews=uniq(reviews);
val.status=val.errors.length?'FAIL':(val.reviews.length?'PASS_WITH_REVIEW':'PASS');
out.status=val.status;
fs.writeFileSync(GEN,JSON.stringify(out,null,2)+'\n');
fs.writeFileSync(VAL,JSON.stringify(val,null,2)+'\n');
console.log(JSON.stringify({status:val.status,counts:val.counts,checks:val.checks,errors:val.errors,reviews:val.reviews},null,2));
if(val.errors.length) process.exit(1);
