import fs from 'node:fs';
import path from 'node:path';

const equipmentPath = path.resolve('data/configdata/ConfigDataEquipmentInfo.json');
const skillPath = path.resolve('data/configdata/ConfigDataSkillInfo.json');
const outputPath = path.resolve('data/generated/equipment_stage2_3_accessory_analysis.json');

function scoreRows(rows, keys=[]) {
  if (!Array.isArray(rows)) return -1;
  let score=0;
  for (const row of rows.slice(0,100)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    for (const k of keys) if (k in row) score += 2;
    if ('ID' in row) score += 2;
  }
  return score;
}
function extractRows(doc, keys=[]) {
  if (Array.isArray(doc)) return doc;
  if (!doc || typeof doc !== 'object') throw new Error('Unsupported JSON root');
  const arrays = Object.values(doc).filter(Array.isArray).map(v=>({v,score:scoreRows(v,keys)})).sort((a,b)=>b.score-a.score || b.v.length-a.v.length);
  if (arrays.length && arrays[0].score > 0) return arrays[0].v;
  const objects = Object.values(doc).filter(v=>v && typeof v==='object' && !Array.isArray(v));
  if (objects.length) return objects;
  throw new Error('No rows');
}

const equipmentRows = extractRows(JSON.parse(fs.readFileSync(equipmentPath,'utf8')), ['Rank','Label','EquipmentType','Property1_ID']);
const skillRows = extractRows(JSON.parse(fs.readFileSync(skillPath,'utf8')), ['ID','Name','Desc']);
const skillById = new Map(skillRows.map(r=>[String(r.ID),r]));

function normalizedSlot(row){ return row.EquipmentType == null ? 0 : Number(row.EquipmentType); }
function isAccessory(row){ return Number(row.Rank)===4 && normalizedSlot(row)===3 && Number(row.Label)===14; }
function arr(v){ return Array.isArray(v) ? v : (v == null ? [] : [v]); }
function lastSkillId(row){ const a=arr(row.SkillIds); return a.length ? a[a.length-1] : null; }
function text(row,key){ return row?.[key] == null ? '' : String(row[key]); }
function inc(obj,key){ obj[key]=(obj[key]??0)+1; }

const accessories = equipmentRows.filter(isAccessory);
const property1Counts={};
const comboCounts={};
const healingByProperty1={};
const explicitHealingCandidates=[];
const rows=[];

const healingEffectRe = /治疗效果|治療效果|治疗量|治療量|治疗能力|治療能力|造成的治疗|造成的治療|恢复效果|恢復效果/;

function deriveCategory(e, skillDesc) {
  if (healingEffectRe.test(skillDesc)) return 'healing';
  const p1=Number(e.Property1_ID ?? 0);
  if (p1===2) return 'attack';
  if (p1===4) return 'intellect';
  if (p1===1 || p1===3 || p1===5) return 'defense';
  return 'unclassified';
}

const categoryCounts={};
for (const e of accessories) {
  const p1=Number(e.Property1_ID ?? 0);
  const p2=Number(e.Property2_ID ?? 0);
  inc(property1Counts,String(p1));
  inc(comboCounts,`${p1}+${p2}`);
  const sid=lastSkillId(e);
  const skill=sid==null?null:(skillById.get(String(sid))??null);
  const skillName=text(skill,'Name');
  const skillDesc=text(skill,'Desc');
  const explicitHealing=healingEffectRe.test(skillDesc);
  if (explicitHealing) {
    inc(healingByProperty1,String(p1));
    explicitHealingCandidates.push({id:e.ID,name:e.Name,property1Id:p1,property2Id:p2,maxSkillId:sid,maxSkillName:skillName,maxSkillDesc:skillDesc});
  }
  const category=deriveCategory(e,skillDesc);
  inc(categoryCounts,category);
  rows.push({id:e.ID,name:e.Name,property1Id:p1,property2Id:p2,maxSkillId:sid,maxSkillName:skillName,maxSkillDesc:skillDesc,explicitHealing,derivedCategory:category});
}

const unclassified=rows.filter(r=>r.derivedCategory==='unclassified');
const result={
  sources:{equipment:'data/configdata/ConfigDataEquipmentInfo.json',skill:'data/configdata/ConfigDataSkillInfo.json'},
  accessoryRule:'Rank=4, normalized EquipmentType=3, Label=14',
  count:accessories.length,
  candidateRule:{
    healing:'max Skill Desc matches explicit healing-effect phrase',
    attack:'otherwise Property1_ID=2',
    intellect:'otherwise Property1_ID=4',
    defense:'otherwise Property1_ID in {1,3,5}',
  },
  distributions:{property1Counts,comboCounts,healingByProperty1,categoryCounts},
  explicitHealingCandidates,
  unclassified,
  rows,
};
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({count:result.count,distributions:result.distributions,healingCandidates:explicitHealingCandidates.map(x=>({id:x.id,name:x.name,p1:x.property1Id,p2:x.property2Id,skill:x.maxSkillName}))},null,2));
