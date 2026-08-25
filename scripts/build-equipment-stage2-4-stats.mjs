import fs from 'node:fs';
import path from 'node:path';

const equipmentPath=path.resolve('data/configdata/ConfigDataEquipmentInfo.json');
const outputPath=path.resolve('data/generated/equipment_stage2_4_stats.json');
const equipment=JSON.parse(fs.readFileSync(equipmentPath,'utf8'));
const expected={0:new Set([1,2,3,4,5,6,7]),1:new Set([8,9,10]),2:new Set([11,12,13]),3:new Set([14])};
const propertyNames={1:'생명',2:'공격',3:'방어',4:'지력',5:'마방',6:'기술'};
function slot(r){return r.EquipmentType==null?0:Number(r.EquipmentType)}
function canonical(r){const s=slot(r),l=Number(r.Label);return Number(r.Rank)===4&&Object.hasOwn(expected,String(s))&&expected[s].has(l)}
function maxStat(r,n){
  const id=r[`Property${n}_ID`], base=r[`Property${n}_Value`], growth=r[`Property${n}_LevelUpValue`];
  if(id==null||base==null||growth==null) return null;
  const raw=Number(base)+Number(growth)*49/10;
  return {propertyId:Number(id),propertyKo:propertyNames[Number(id)]??`Property${id}`,base:Number(base),growthPer10Levels:Number(growth),maxLevel:50,maxRaw:raw,maxValue:Math.round(raw)};
}
const records=[]; let oneStat=0,twoStat=0; const midpointCases=[];
for(const r of equipment.filter(canonical)){
  const stats=[maxStat(r,1),maxStat(r,2)].filter(Boolean);
  if(stats.length===1) oneStat++; else if(stats.length===2) twoStat++;
  for(const s of stats){if(Math.abs((s.maxRaw-Math.floor(s.maxRaw))-0.5)<1e-9) midpointCases.push({id:r.ID,name:r.Name,propertyId:s.propertyId,maxRaw:s.maxRaw});}
  records.push({id:r.ID,name:r.Name,stats});
}
const fixtures={
  6:{2:96,6:54},
  52:{2:107,6:43},
  73:{3:54,1:583},
  115:{4:75,5:43},
  134:{1:1102}
};
const fixtureMismatches=[];
for(const [id,expectedStats] of Object.entries(fixtures)){
  const rec=records.find(r=>String(r.id)===id);
  for(const [pid,value] of Object.entries(expectedStats)){
    const got=rec?.stats.find(s=>String(s.propertyId)===pid)?.maxValue;
    if(got!==value) fixtureMismatches.push({id:Number(id),propertyId:Number(pid),expected:value,got:got??null});
  }
}
const result={
  source:'data/configdata/ConfigDataEquipmentInfo.json',
  canonicalCount:records.length,
  decision:{maxLevel:50,formula:'maxValue = nearestInteger(Property_Value + Property_LevelUpValue * 49 / 10)',rounding:'round once after the full level-50 total is calculated',midpointPolicy:'not material for current SSR page: level-50 midpoint (.5) cases = 0'},
  propertyNames,
  counts:{twoStat,oneStat,midpointCases:midpointCases.length},
  validationFixtures:{note:'Expected max values are externally checked reference fixtures used only to guard the derived formula.',fixtures,fixtureMismatches},
  records
};
if(records.length!==390) throw new Error(`Canonical count mismatch ${records.length}`);
if(midpointCases.length) throw new Error(`Unexpected level-50 midpoint cases ${JSON.stringify(midpointCases)}`);
if(fixtureMismatches.length) throw new Error(`Fixture mismatch ${JSON.stringify(fixtureMismatches)}`);
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({canonicalCount:records.length,twoStat,oneStat,midpointCases:midpointCases.length,fixtureMismatches:fixtureMismatches.length},null,2));
