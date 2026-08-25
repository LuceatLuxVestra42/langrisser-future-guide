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
function firstText(row, keys){ for (const k of keys) if (row?.[k] != null && row[k] !== '') return {field:k,value:String(row[k])}; return null; }
function bucketInc(obj,key){ obj[key]=(obj[key]??0)+1; }

const accessories = equipmentRows.filter(isAccessory);
const property1Counts={};
const property2Counts={};
const comboCounts={};
const keywordCounts={ healing:0, attack:0, intellect:0, defense:0, hp:0, mdef:0 };
const rows=[];
const kw = {
  healing: /治疗|治療|回复|回復|恢复|恢復|治愈|治癒|疗效|療效/,
  attack: /攻击|攻擊|物理|伤害|傷害/,
  intellect: /智力|魔法|法术|法術/,
  defense: /防御|防禦|减伤|減傷|护盾|護盾/,
  hp: /生命|血量/,
  mdef: /魔防|魔法防御|魔法防禦/,
};

for (const e of accessories) {
  const p1 = Number(e.Property1_ID ?? 0);
  const p2 = Number(e.Property2_ID ?? 0);
  bucketInc(property1Counts,String(p1));
  bucketInc(property2Counts,String(p2));
  bucketInc(comboCounts,`${p1}+${p2}`);
  const sid = lastSkillId(e);
  const skill = sid == null ? null : skillById.get(String(sid)) ?? null;
  const skillName = firstText(skill,['Name','SkillName','name']);
  const skillDesc = firstText(skill,['Desc','Description','SkillDesc','desc']);
  const text = [e.Name,e.Desc,skillName?.value,skillDesc?.value].filter(Boolean).join('\n');
  const keywords={};
  for (const [k,re] of Object.entries(kw)) { keywords[k]=re.test(text); if (keywords[k]) keywordCounts[k]++; }
  rows.push({
    id:e.ID,
    name:e.Name,
    desc:e.Desc ?? null,
    property1:{id:e.Property1_ID ?? null,base:e.Property1_Value ?? null,growth:e.Property1_LevelUpValue ?? null},
    property2:{id:e.Property2_ID ?? null,base:e.Property2_Value ?? null,growth:e.Property2_LevelUpValue ?? null},
    maxSkillId:sid,
    maxSkillName:skillName,
    maxSkillDesc:skillDesc,
    keywords,
  });
}

const result={
  sources:{equipment:'data/configdata/ConfigDataEquipmentInfo.json',skill:'data/configdata/ConfigDataSkillInfo.json'},
  accessoryRule:'Rank=4, normalized EquipmentType=3, Label=14',
  count:accessories.length,
  distributions:{property1Counts,property2Counts,comboCounts,keywordCounts},
  rows,
};
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({count:result.count,distributions:result.distributions},null,2));
