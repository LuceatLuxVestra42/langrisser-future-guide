import fs from 'node:fs';
import path from 'node:path';

const equipmentPath = path.resolve('data/configdata/ConfigDataEquipmentInfo.json');
const skillPath = path.resolve('data/configdata/ConfigDataSkillInfo.json');
const outputPath = path.resolve('data/generated/equipment_stage2_5_effect_analysis.json');

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
const inc = (obj,key) => obj[key] = (obj[key] ?? 0) + 1;

function tagKey(tag) {
  const m = /^<\s*(\/?)\s*([a-zA-Z0-9]+)(?:\s|=|>|\/)/.exec(tag);
  return m ? `${m[1] ? '/' : ''}${m[2].toLowerCase()}` : tag;
}

const rows = equipment.filter(canonical);
const skillIdLengthCounts = {};
const skillLevelLengthCounts = {};
const pairCounts = {};
const maxJoinMissing = [];
const anyStageJoinMissing = [];
const missingEffectName = [];
const missingEffectDesc = [];
const tagCounts = {};
const descsWithTags = [];
const descsWithNewlines = [];
const maxSkillUsers = new Map();
const records = [];

for (const e of rows) {
  const skillIds = arr(e.SkillIds).map(Number);
  const skillLevels = arr(e.SkillLevels).map(Number);
  inc(skillIdLengthCounts, String(skillIds.length));
  inc(skillLevelLengthCounts, String(skillLevels.length));
  inc(pairCounts, `${skillIds.length}/${skillLevels.length}`);

  for (const sid of skillIds) {
    if (!skillById.has(String(sid))) anyStageJoinMissing.push({equipmentId:e.ID,name:e.Name,skillId:sid});
  }

  const maxSkillId = skillIds.length ? skillIds[skillIds.length-1] : null;
  const maxSkill = maxSkillId == null ? null : skillById.get(String(maxSkillId)) ?? null;
  if (!maxSkill) maxJoinMissing.push({equipmentId:e.ID,name:e.Name,maxSkillId});
  const effectName = maxSkill?.Name ?? null;
  const effectDesc = maxSkill?.Desc ?? null;
  if (!effectName) missingEffectName.push({equipmentId:e.ID,name:e.Name,maxSkillId});
  if (!effectDesc) missingEffectDesc.push({equipmentId:e.ID,name:e.Name,maxSkillId});

  if (maxSkillId != null) {
    const users = maxSkillUsers.get(String(maxSkillId)) ?? [];
    users.push({equipmentId:e.ID,name:e.Name});
    maxSkillUsers.set(String(maxSkillId), users);
  }

  const tags = effectDesc ? (String(effectDesc).match(/<[^>]+>/g) ?? []) : [];
  if (tags.length) descsWithTags.push({equipmentId:e.ID,name:e.Name,maxSkillId,tags:[...new Set(tags)]});
  for (const tag of tags) inc(tagCounts, tagKey(tag));
  if (effectDesc && String(effectDesc).includes('\n')) descsWithNewlines.push({equipmentId:e.ID,name:e.Name,maxSkillId});

  records.push({
    equipmentId:e.ID,
    equipmentName:e.Name,
    skillIds,
    skillLevels,
    maxSkillId,
    effectName,
    effectDesc,
    hasMarkup:tags.length>0,
    hasNewline:Boolean(effectDesc && String(effectDesc).includes('\n')),
  });
}

const sharedMaxSkills = [...maxSkillUsers.entries()]
  .filter(([,users]) => users.length > 1)
  .map(([skillId,users]) => ({skillId:Number(skillId),users}));

const result = {
  sources:{equipment:'data/configdata/ConfigDataEquipmentInfo.json',skill:'data/configdata/ConfigDataSkillInfo.json'},
  canonicalCount:rows.length,
  rule:{maxEffectSkillId:'SkillIds[-1]',join:'ConfigDataSkillInfo.ID'},
  counts:{
    skillIdLengthCounts,
    skillLevelLengthCounts,
    pairCounts,
    maxJoinMissing:maxJoinMissing.length,
    anyStageJoinMissing:anyStageJoinMissing.length,
    missingEffectName:missingEffectName.length,
    missingEffectDesc:missingEffectDesc.length,
    descriptionsWithMarkup:descsWithTags.length,
    descriptionsWithNewlines:descsWithNewlines.length,
    distinctMaxSkillIds:maxSkillUsers.size,
    sharedMaxSkillIds:sharedMaxSkills.length,
  },
  markup:{tagCounts,examples:descsWithTags.slice(0,20)},
  anomalies:{maxJoinMissing,anyStageJoinMissing,missingEffectName,missingEffectDesc},
  sharedMaxSkills,
  records,
};

if (rows.length !== 390) throw new Error(`Canonical count mismatch: ${rows.length}`);
fs.mkdirSync(path.dirname(outputPath), {recursive:true});
fs.writeFileSync(outputPath, JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({canonicalCount:result.canonicalCount,counts:result.counts,tagCounts:result.markup.tagCounts},null,2));
