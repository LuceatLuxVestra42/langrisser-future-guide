import fs from 'node:fs';
import path from 'node:path';

const equipmentPath = path.resolve('data/configdata/ConfigDataEquipmentInfo.json');
const levelPath = path.resolve('data/configdata/ConfigDataEquipmentLevelInfo.json');
const outputPath = path.resolve('data/generated/equipment_stage2_4_stat_analysis.json');

const equipment = JSON.parse(fs.readFileSync(equipmentPath, 'utf8'));
const levelInfo = JSON.parse(fs.readFileSync(levelPath, 'utf8'));

const expected = {
  0: new Set([1,2,3,4,5,6,7]),
  1: new Set([8,9,10]),
  2: new Set([11,12,13]),
  3: new Set([14]),
};
function slot(r){ return r.EquipmentType == null ? 0 : Number(r.EquipmentType); }
function canonical(r){ const s=slot(r), l=Number(r.Label); return Number(r.Rank)===4 && Object.hasOwn(expected,String(s)) && expected[s].has(l); }
function inc(obj,key){ obj[key]=(obj[key]??0)+1; }
function frac1(v){ return Math.round((v-Math.floor(v))*10)%10; }
function stat(r,n){
  const id=r[`Property${n}_ID`];
  const base=r[`Property${n}_Value`];
  const growth=r[`Property${n}_LevelUpValue`];
  if(id==null || base==null || growth==null) return null;
  const raw50=Number(base)+Number(growth)*49/10;
  return {propertyId:Number(id),base:Number(base),growth:Number(growth),raw50,floor50:Math.floor(raw50),round50:Math.round(raw50),ceil50:Math.ceil(raw50),fractionTenth:frac1(raw50)};
}

const rows=equipment.filter(canonical);
const bornStarCounts={};
const skillLevelPatterns={};
const growthCounts={};
const fractionCounts={};
const tieCases=[];
const missingProperty2=[];
const samples=[];
const sampleIds=new Set([6,52,73,115]);

for(const r of rows){
  inc(bornStarCounts,String(r.BornStarLevel ?? '<missing>'));
  inc(skillLevelPatterns,JSON.stringify(r.SkillLevels ?? null));
  const stats=[];
  for(const n of [1,2]){
    const s=stat(r,n);
    if(!s){ if(n===2) missingProperty2.push({id:r.ID,name:r.Name}); continue; }
    stats.push({slot:n,...s});
    inc(growthCounts,String(s.growth));
    inc(fractionCounts,String(s.fractionTenth));
    if(Math.abs((s.raw50-Math.floor(s.raw50))-0.5)<1e-9){
      tieCases.push({id:r.ID,name:r.Name,propertySlot:n,...s});
    }
  }
  if(sampleIds.has(Number(r.ID))){
    samples.push({id:r.ID,name:r.Name,bornStarLevel:r.BornStarLevel ?? null,skillLevels:r.SkillLevels ?? null,stats});
  }
}

const levelIds=levelInfo.map(r=>Number(r.ID)).filter(Number.isFinite).sort((a,b)=>a-b);
const level49=levelInfo.find(r=>Number(r.ID)===49) ?? null;
const level50=levelInfo.find(r=>Number(r.ID)===50) ?? null;

const result={
  sources:{equipment:'data/configdata/ConfigDataEquipmentInfo.json',level:'data/configdata/ConfigDataEquipmentLevelInfo.json'},
  canonicalCount:rows.length,
  candidateFormula:{level50:'display = round(base + growth * (50 - 1) / 10)',general:'display(level) = round(base + growth * (level - 1) / 10)'},
  structuralEvidence:{bornStarCounts,skillLevelPatterns,levelInfo:{count:levelInfo.length,minId:levelIds[0],maxId:levelIds.at(-1),level49,level50}},
  diagnostics:{growthCounts,fractionCounts,tieCaseCount:tieCases.length,tieCases,missingProperty2Count:missingProperty2.length,missingProperty2},
  samples,
};

if(rows.length!==390) throw new Error(`Canonical count mismatch: ${rows.length}`);
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({canonicalCount:rows.length,bornStarCounts,skillLevelPatterns,tieCaseCount:tieCases.length,samples},null,2));
