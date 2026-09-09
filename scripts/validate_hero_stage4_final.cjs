const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const COMBAT = P('data/generated/hero-basic-combat.v1.json');
const SUMMARY = P('data/validation/hero-basic-combat-stage4-5-summary.v1.json');
const MASTER = P('data/hero-name-master.v1.json');
const TREE = P('data/generated/hero-job-trees.v1.json');
const SKILLS = P('data/generated/hero-skill-acquisition.v1.json');
const BOUNDARY = P('data/validation/hero-stage4-a-boundary.v1.json');
const UPSTREAM = P('data/validation/hero-stage4-upstream-direct.v1.json');

function read(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function set(ids) { return new Set(ids.filter(Number.isInteger)); }
function diff(a, b) { return [...a].filter((x) => !b.has(x)); }
function ints(o) { return o && Object.values(o).every((v) => Number.isInteger(v) && v >= 0); }
function forbidden(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  const bad = new Set(['usableSoldiers','soldierIds','usableSoldierIds','heroSoldierRelations','soldierMembership','relationEdges','byHeroId','bySoldierId']);
  if (Array.isArray(value)) { for (const item of value) forbidden(item, out); return out; }
  for (const [k,v] of Object.entries(value)) { if (bad.has(k)) out.push(k); forbidden(v, out); }
  return out;
}

const combat = read(COMBAT);
const summary = read(SUMMARY);
const master = read(MASTER);
const tree = read(TREE);
const skills = read(SKILLS);
const boundary = read(BOUNDARY);
const upstream = read(UPSTREAM);
const errors = [];

const skillRows = loadArray('ConfigDataSkillInfo');
const skillCostById = new Map();
for (const row of skillRows) {
  if (!Number.isInteger(row?.ID)) continue;
  if (skillCostById.has(row.ID)) {
    errors.push(`SkillInfo duplicate ID=${row.ID}`);
    continue;
  }
  skillCostById.set(row.ID, row.SkillCost);
}

const canonical = set((master.records || []).map((x) => x.heroId));
const combatIds = set((combat.records || []).map((x) => x.heroId));
const treeByHero = new Map((tree.records || []).map((x) => [x.heroId, x]));
const skillIds = set((skills.records || []).map((x) => x.heroId));
const equipableSkillIds = new Set();
const heroDirectSkillIds = new Set();
const combatByHero = new Map((combat.records || []).map((x) => [x.heroId, x]));
const skillRowById = new Map();
for (const row of skillRows) {
  if (!Number.isInteger(row?.ID)) continue;
  if (!skillRowById.has(row.ID)) skillRowById.set(row.ID, row);
}
const awakenRows = loadArray('ConfigDataAwakenInfo');
const awakenById = new Map();
for (const row of awakenRows) {
  if (!Number.isInteger(row?.ID)) continue;
  if (awakenById.has(row.ID)) errors.push(`AwakenInfo duplicate ID=${row.ID}`);
  else awakenById.set(row.ID, row);
}

if (upstream.status !== 'PASS') errors.push(`upstream direct regression status=${upstream.status}`);
if ((upstream.errors || []).length) errors.push(`upstream direct regression errors=${upstream.errors.length}`);
if (combat.status !== 'PASS') errors.push(`combat.status=${combat.status}`);
if (summary.status !== 'PASS') errors.push(`summary.status=${summary.status}`);
if (summary.stage4CompletionStatus !== 'COMPLETE') errors.push(`stage4CompletionStatus=${summary.stage4CompletionStatus}`);
if ((combat.records || []).length !== 267 || summary.generatedHeroCount !== 267 || canonical.size !== 267) errors.push('267-record invariant failed');
if (diff(canonical, combatIds).length || diff(combatIds, canonical).length) errors.push('combat Hero set differs from canonical Hero Master');
if (diff(canonical, skillIds).length || diff(skillIds, canonical).length) errors.push('Stage 4-4 Hero set differs from canonical Hero Master');
if ((summary.unresolvedComponents || []).length) errors.push(`unresolvedComponents=${summary.unresolvedComponents.join(',')}`);
if ((summary.hardErrors || []).length) errors.push(`summary hardErrors=${summary.hardErrors.length}`);
if (boundary.status !== 'PASS') errors.push(`A-boundary status=${boundary.status}`);
if (summary.relationBoundary?.membershipFieldLeakCount !== 0) errors.push('summary relation boundary leak count is nonzero');

const awakeningAudit = {
  canonicalAwakenInfoRows: 0,
  verifiedLevel2Skill: 0,
  level2SkillNotDefined: 0,
  falseNone: 0,
  missingSkillReference: 0,
};
for (const heroId of canonical) {
  const sourceAwaken = awakenById.get(heroId);
  const generated = combatByHero.get(heroId)?.awakening;
  if (!sourceAwaken) { errors.push(`heroId ${heroId}: canonical AwakenInfo row missing`); continue; }
  awakeningAudit.canonicalAwakenInfoRows += 1;
  if (!generated) { errors.push(`heroId ${heroId}: generated awakening block missing`); continue; }
  if (generated.status === 'NONE') awakeningAudit.falseNone += 1;
  if (generated.awakenId !== sourceAwaken.ID) errors.push(`heroId ${heroId}: generated awakenId=${generated.awakenId} source=${sourceAwaken.ID}`);
  if ((generated.nameCn ?? null) !== (sourceAwaken.Name ?? null)) errors.push(`heroId ${heroId}: generated awakening name mismatch`);
  const sourceHasLevel2 = Object.prototype.hasOwnProperty.call(sourceAwaken, 'Level2SkillID');
  if (sourceHasLevel2) {
    const level2SkillId = sourceAwaken.Level2SkillID;
    if (!Number.isInteger(level2SkillId) || level2SkillId <= 0) { errors.push(`heroId ${heroId}: source Level2SkillID=${level2SkillId} invalid`); continue; }
    const sourceSkill = skillRowById.get(level2SkillId);
    if (!sourceSkill) { awakeningAudit.missingSkillReference += 1; errors.push(`heroId ${heroId}: source Level2SkillID ${level2SkillId} missing from SkillInfo`); continue; }
    if (generated.status !== 'VERIFIED') errors.push(`heroId ${heroId}: generated awakening status=${generated.status}, expected VERIFIED`);
    if (generated.level2Status !== 'DEFINED') errors.push(`heroId ${heroId}: generated level2Status=${generated.level2Status}, expected DEFINED`);
    if (generated.level2SkillId !== level2SkillId) errors.push(`heroId ${heroId}: generated Level2SkillID=${generated.level2SkillId}, expected ${level2SkillId}`);
    if (generated.skill?.skillId !== level2SkillId) errors.push(`heroId ${heroId}: generated awakening Skill snapshot mismatch`);
    awakeningAudit.verifiedLevel2Skill += 1;
  } else {
    if (generated.status !== 'VERIFIED') errors.push(`heroId ${heroId}: generated source-row status=${generated.status}, expected VERIFIED`);
    if (generated.level2Status !== 'LEVEL2_SKILL_NOT_DEFINED') errors.push(`heroId ${heroId}: generated level2Status=${generated.level2Status}, expected LEVEL2_SKILL_NOT_DEFINED`);
    if (generated.level2SkillId !== null || generated.skill !== null) errors.push(`heroId ${heroId}: Level2-not-defined state must not carry a Skill reference`);
    awakeningAudit.level2SkillNotDefined += 1;
  }
}
if (awakeningAudit.canonicalAwakenInfoRows !== 267) errors.push(`awakening canonical coverage=${awakeningAudit.canonicalAwakenInfoRows}, expected 267`);
if (awakeningAudit.verifiedLevel2Skill !== 257) errors.push(`awakening defined Level2 count=${awakeningAudit.verifiedLevel2Skill}, expected 257`);
if (awakeningAudit.level2SkillNotDefined !== 10) errors.push(`awakening Level2-not-defined count=${awakeningAudit.level2SkillNotDefined}, expected 10`);
if (awakeningAudit.falseNone !== 0) errors.push(`awakening false NONE=${awakeningAudit.falseNone}`);
if (awakeningAudit.missingSkillReference !== 0) errors.push(`awakening missing SkillInfo references=${awakeningAudit.missingSkillReference}`);
const summaryAwakening = summary.awakeningSummary || {};
for (const [key, expected] of Object.entries({ canonicalAwakenInfoRows: 267, verifiedLevel2Skill: 257, level2SkillNotDefined: 10, falseNone: 0 })) {
  if (summaryAwakening[key] !== expected) errors.push(`summary awakeningSummary.${key}=${summaryAwakening[key]}, expected ${expected}`);
  if (awakeningAudit[key] !== expected) errors.push(`independent awakening audit ${key}=${awakeningAudit[key]}, expected ${expected}`);
}

for (const hero of combat.records || []) {
  const sourceTree = treeByHero.get(hero.heroId);
  if (!sourceTree) { errors.push(`heroId ${hero.heroId}: missing Stage 4-3 tree`); continue; }
  if (hero.talent?.status !== 'VERIFIED' || hero.talent?.selectionRule !== 'TalentSkill_IDs[star - 1]' || hero.talent?.starProgression?.length !== 6) {
    errors.push(`heroId ${hero.heroId}: talent progression invalid`);
  }
  for (let i = 0; i < (hero.talent?.starProgression || []).length; i += 1) {
    const item = hero.talent.starProgression[i];
    if (item.star !== i + 1 || !Number.isInteger(item.skillId)) errors.push(`heroId ${hero.heroId}: invalid talent star slot ${i + 1}`);
  }
  for (const acquisition of hero.skills?.jobLevelAcquisitions || []) {
    const skillId = acquisition?.skillId;
    if (!Number.isInteger(skillId) || skillId <= 0) {
      errors.push(`heroId ${hero.heroId}: invalid equipable acquisition skillId=${String(skillId)}`);
      continue;
    }
    equipableSkillIds.add(skillId);
    const sourceCost = skillCostById.get(skillId);
    if (!Number.isInteger(sourceCost)) {
      errors.push(`heroId ${hero.heroId}: SkillInfo ${skillId} SkillCost is not an integer (${String(sourceCost)})`);
      continue;
    }
    if (sourceCost !== 1 && sourceCost !== 2) {
      errors.push(`heroId ${hero.heroId}: SkillInfo ${skillId} SkillCost=${sourceCost} outside frozen equipable domain {1,2}`);
      continue;
    }
    if (acquisition?.skill?.skillId !== skillId) {
      errors.push(`heroId ${hero.heroId}: acquisition ${skillId} resolved skillId=${String(acquisition?.skill?.skillId)}`);
      continue;
    }
    if (acquisition.skill.cost !== sourceCost) {
      errors.push(`heroId ${hero.heroId}: skill ${skillId} cost=${String(acquisition.skill.cost)} source=${sourceCost}`);
    }
  }

  const directIds = Array.isArray(hero.skills?.heroDirectSkillIds) ? hero.skills.heroDirectSkillIds : [];
  const directSkills = Array.isArray(hero.skills?.heroDirectSkills) ? hero.skills.heroDirectSkills : [];
  if (directIds.length !== directSkills.length) {
    errors.push(`heroId ${hero.heroId}: direct skill id/payload length mismatch ${directIds.length}/${directSkills.length}`);
  }
  for (let i = 0; i < directSkills.length; i += 1) {
    const skill = directSkills[i];
    const skillId = skill?.skillId;
    if (!Number.isInteger(skillId) || skillId <= 0) {
      errors.push(`heroId ${hero.heroId}: invalid hero-direct skillId=${String(skillId)}`);
      continue;
    }
    heroDirectSkillIds.add(skillId);
    if (directIds[i] !== skillId) {
      errors.push(`heroId ${hero.heroId}: heroDirectSkillIds[${i}]=${String(directIds[i])} resolved skillId=${skillId}`);
      continue;
    }
    const sourceCost = skillCostById.get(skillId);
    if (!Number.isInteger(sourceCost)) {
      errors.push(`heroId ${hero.heroId}: direct SkillInfo ${skillId} SkillCost is not an integer (${String(sourceCost)})`);
      continue;
    }
    if (sourceCost !== 1 && sourceCost !== 2) {
      errors.push(`heroId ${hero.heroId}: direct SkillInfo ${skillId} SkillCost=${sourceCost} outside normal-skill domain {1,2}`);
      continue;
    }
    if (skill.cost !== sourceCost) {
      errors.push(`heroId ${hero.heroId}: direct skill ${skillId} cost=${String(skill.cost)} source=${sourceCost}`);
    }
  }

  const sm = hero.soldierModifiers;
  if (sm?.status !== 'VERIFIED' || !['hp','at','df','magicDf'].every((k) => Number.isFinite(sm[k]) && Number.isInteger(sm.raw?.[k]) && sm.raw[k] / 100 === sm[k])) {
    errors.push(`heroId ${hero.heroId}: soldierModifiers invalid`);
  }
  const display = hero.displayStats;
  if (display?.status !== 'VERIFIED') errors.push(`heroId ${hero.heroId}: displayStats not VERIFIED`);
  const expectedConnectionIds = (sourceTree.connections || []).map((c) => String(c.jobConnectionId));
  const actual = display?.byJobConnectionId || {};
  for (const id of expectedConnectionIds) {
    const entry = actual[id];
    if (!entry) { errors.push(`heroId ${hero.heroId}: missing display stats for JobConnection ${id}`); continue; }
    if (entry.heroLevel !== 70 || entry.star !== 6 || entry.status !== 'VERIFIED' || !ints(entry.values)) {
      errors.push(`heroId ${hero.heroId}: invalid display stats for JobConnection ${id}`);
    }
  }
  if (Object.keys(actual).length !== expectedConnectionIds.length) errors.push(`heroId ${hero.heroId}: display JobConnection count mismatch`);
  if (forbidden(hero).length) errors.push(`heroId ${hero.heroId}: forbidden Hero-Soldier membership field present`);
}

if (equipableSkillIds.size !== 678) errors.push(`equipable distinct SkillID count=${equipableSkillIds.size}, expected 678`);
let skillCost1 = 0;
let skillCost2 = 0;
for (const skillId of equipableSkillIds) {
  const cost = skillCostById.get(skillId);
  if (cost === 1) skillCost1 += 1;
  else if (cost === 2) skillCost2 += 1;
}
if (skillCost1 !== 254 || skillCost2 !== 424) {
  errors.push(`equipable SkillCost distribution 1=${skillCost1} 2=${skillCost2}, expected 254/424`);
}

let directCost1 = 0;
let directCost2 = 0;
for (const skillId of heroDirectSkillIds) {
  const cost = skillCostById.get(skillId);
  if (cost === 1) directCost1 += 1;
  else if (cost === 2) directCost2 += 1;
}

const gates = new Map((summary.semanticGates || []).map((g) => [g.id, g.status]));
for (const id of ['awakeningClassification','displayJobStats','heroSoldierModifiers','talentStarProgression','equipableSkillCost','heroDirectSkillCost']) if (gates.get(id) !== 'VERIFIED') errors.push(`semantic gate ${id}=${gates.get(id)}`);
if (gates.get('talentIdentity') !== 'VERIFIED_REFERENCE_SET') errors.push(`semantic gate talentIdentity=${gates.get('talentIdentity')}`);

console.log(`HERO STAGE 4 FINAL VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
console.log(`heroes=${combat.records?.length || 0} upstream=${upstream.status} awakening=${awakeningAudit.canonicalAwakenInfoRows}/${awakeningAudit.verifiedLevel2Skill}/${awakeningAudit.level2SkillNotDefined} equipableSkills=${equipableSkillIds.size} cost1=${skillCost1} cost2=${skillCost2} directSkills=${heroDirectSkillIds.size} directCost1=${directCost1} directCost2=${directCost2} errors=${errors.length}`);
if (errors.length) {
  for (const error of errors.slice(0, 100)) console.log(`- FAIL: ${error}`);
  process.exitCode = 1;
}
