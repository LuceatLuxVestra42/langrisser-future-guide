import fs from 'node:fs';
import path from 'node:path';

const equipmentPath = path.resolve('data/configdata/ConfigDataEquipmentInfo.json');
const skillPath = path.resolve('data/configdata/ConfigDataSkillInfo.json');
const outputPath = path.resolve('data/generated/equipment_stage2_5_effects.json');

function extractRows(doc, preferred=[]) {
  if (Array.isArray(doc)) return doc;
  if (!doc || typeof doc !== 'object') throw new Error('Unsupported JSON root');
  const arrays = Object.values(doc).filter(Array.isArray).map(v => ({
    v,
    score: v.slice(0,100).reduce((n,r) => n + preferred.filter(k => r && typeof r === 'object' && k in r).length, 0),
  })).sort((a,b) => b.score-a.score || b.v.length-a.v.length);
  if (arrays.length) return arrays[0].v;
  return Object.values(doc).filter(v => v && typeof v === 'object' && !Array.isArray(v));
}

const equipment = extractRows(JSON.parse(fs.readFileSync(equipmentPath,'utf8')), ['ID','Rank','Label','SkillIds']);
const skills = extractRows(JSON.parse(fs.readFileSync(skillPath,'utf8')), ['ID','Name','Desc']);
const skillById = new Map(skills.map(r => [String(r.ID), r]));
const expected = {0:new Set([1,2,3,4,5,6,7]),1:new Set([8,9,10]),2:new Set([11,12,13]),3:new Set([14])};
const slot = r => r.EquipmentType == null ? 0 : Number(r.EquipmentType);
const canonical = r => Number(r.Rank)===4 && expected[slot(r)]?.has(Number(r.Label));
const arr = v => Array.isArray(v) ? v : (v == null ? [] : [v]);

function parseEffectText(raw) {
  const text = String(raw ?? '');
  const tags = text.match(/<[^>]+>/g) ?? [];
  const unexpectedTags = [...new Set(tags.filter(t => t !== '<color=#DC143C>' && t !== '</color>'))];
  const parts = text.split(/(<color=#DC143C>|<\/color>)/g).filter(Boolean);
  const segments = [];
  let highlight = false;
  for (const part of parts) {
    if (part === '<color=#DC143C>') { highlight = true; continue; }
    if (part === '</color>') { highlight = false; continue; }
    if (part.length) segments.push({text:part, highlight});
  }
  return {
    plainText:text.replaceAll('<color=#DC143C>','').replaceAll('</color>',''),
    segments,
    rawTags:[...new Set(tags)],
    unexpectedTags,
  };
}

const records = [];
const anomalies = [];
const rawTagSet = new Set();
const maxSkillUsers = new Map();

for (const e of equipment.filter(canonical)) {
  const skillIds = arr(e.SkillIds).map(Number);
  const skillLevels = arr(e.SkillLevels).map(Number);
  const maxEffectSkillId = skillIds.at(-1) ?? null;
  const skill = maxEffectSkillId == null ? null : skillById.get(String(maxEffectSkillId)) ?? null;
  if (!skill) {
    anomalies.push({equipmentId:e.ID,name:e.Name,type:'missing-max-skill',maxEffectSkillId});
    continue;
  }
  const parsed = parseEffectText(skill.Desc ?? '');
  for (const t of parsed.rawTags) rawTagSet.add(t);
  if (parsed.unexpectedTags.length) anomalies.push({equipmentId:e.ID,name:e.Name,type:'unexpected-tags',tags:parsed.unexpectedTags});
  if (!skill.Name) anomalies.push({equipmentId:e.ID,name:e.Name,type:'missing-effect-name'});
  if (!skill.Desc) anomalies.push({equipmentId:e.ID,name:e.Name,type:'missing-effect-desc'});
  if (skillIds.length !== 5 || skillLevels.length !== 5 || JSON.stringify(skillLevels) !== '[10,20,30,40,50]') {
    anomalies.push({equipmentId:e.ID,name:e.Name,type:'stage-pattern',skillIds,skillLevels});
  }
  const users = maxSkillUsers.get(String(maxEffectSkillId)) ?? [];
  users.push({equipmentId:e.ID,equipmentName:e.Name});
  maxSkillUsers.set(String(maxEffectSkillId),users);
  records.push({
    equipmentId:e.ID,
    equipmentName:e.Name,
    maxEffectSkillId,
    effectName:skill.Name,
    effectText:parsed.plainText,
    effectSegments:parsed.segments,
    source:{skillIds,skillLevels,rawDesc:skill.Desc},
  });
}

const sharedMaxEffects = [...maxSkillUsers.entries()]
  .filter(([,users]) => users.length > 1)
  .map(([skillId,users]) => ({maxEffectSkillId:Number(skillId),users}));

const result = {
  sources:{equipment:'data/configdata/ConfigDataEquipmentInfo.json',skill:'data/configdata/ConfigDataSkillInfo.json'},
  canonicalCount:records.length,
  decision:{
    maxEffectSkillId:'SkillIds[-1]',
    join:'ConfigDataSkillInfo.ID',
    displayName:'ConfigDataSkillInfo.Name',
    displayText:'ConfigDataSkillInfo.Desc with only color markup removed from plain text',
    richText:'convert <color=#DC143C>...</color> into {text, highlight:true} segments; preserve source newlines',
    doNot:'do not summarize, rewrite, merge, or infer effect wording',
  },
  validation:{
    expectedStageLevels:[10,20,30,40,50],
    rawTags:[...rawTagSet].sort(),
    anomalyCount:anomalies.length,
    sharedMaxEffectCount:sharedMaxEffects.length,
    distinctMaxEffectSkillIds:maxSkillUsers.size,
  },
  anomalies,
  sharedMaxEffects,
  records,
};

if (records.length !== 390) throw new Error(`Canonical effect count mismatch: ${records.length}`);
if (anomalies.length) throw new Error(`Stage 2-5 anomalies: ${JSON.stringify(anomalies.slice(0,10))}`);
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({canonicalCount:result.canonicalCount,validation:result.validation,sharedMaxEffects:result.sharedMaxEffects},null,2));
