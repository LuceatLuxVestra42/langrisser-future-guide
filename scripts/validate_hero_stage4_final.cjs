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
function indexUnique(rows, idField, label, errors) {
  const map = new Map();
  for (const row of rows) {
    const id = row?.[idField];
    if (!Number.isInteger(id)) continue;
    if (map.has(id)) errors.push(`${label}: duplicate ${idField}=${id}`);
    else map.set(id, row);
  }
  return map;
}
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

const awakenRows = loadArray('ConfigDataAwakenInfo');
const skillRows = loadArray('ConfigDataSkillInfo');
const awakenIndex = indexUnique(awakenRows, 'ID', 'AwakenInfo', errors);
const skillIndex = indexUnique(skillRows, 'ID', 'SkillInfo', errors);

const canonical = set((master.records || []).map((x) => x.heroId));
const combatIds = set((combat.records || []).map((x) => x.heroId));
const treeByHero = new Map((tree.records || []).map((x) => [x.heroId, x]));
const skillIds = set((skills.records || []).map((x) => x.heroId));

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

let verifiedAwakeningSkills = 0;
let verifiedNoLevel2Skill = 0;

for (const hero of combat.records || []) {
  const sourceTree = treeByHero.get(hero.heroId);
  if (!sourceTree) { errors.push(`heroId ${hero.heroId}: missing Stage 4-3 tree`); continue; }

  const awaken = awakenIndex.get(hero.heroId);
  if (!awaken) {
    errors.push(`heroId ${hero.heroId}: missing same-ID AwakenInfo row`);
  } else if (!Object.prototype.hasOwnProperty.call(awaken, 'Level2SkillID')) {
    verifiedNoLevel2Skill += 1;
    if (hero.awakening?.status !== 'VERIFIED_NO_LEVEL2_SKILL') errors.push(`heroId ${hero.heroId}: awakening status=${hero.awakening?.status}, expected VERIFIED_NO_LEVEL2_SKILL`);
    if (hero.awakening?.awakenId !== hero.heroId) errors.push(`heroId ${hero.heroId}: awakening.awakenId=${hero.awakening?.awakenId}, expected same-ID ${hero.heroId}`);
    if (hero.awakening?.level2SkillId !== null) errors.push(`heroId ${hero.heroId}: field-absent Level2SkillID must remain null`);
    if (hero.awakening?.skill !== null) errors.push(`heroId ${hero.heroId}: field-absent Level2SkillID must not synthesize skill`);
  } else {
    const level2SkillId = awaken.Level2SkillID;
    if (!Number.isInteger(level2SkillId) || level2SkillId <= 0) {
      errors.push(`heroId ${hero.heroId}: invalid source Level2SkillID=${level2SkillId}`);
    } else {
      const sourceSkill = skillIndex.get(level2SkillId);
      if (!sourceSkill) errors.push(`heroId ${hero.heroId}: source Level2SkillID ${level2SkillId} missing from SkillInfo`);
      else verifiedAwakeningSkills += 1;
      if (hero.awakening?.status !== 'VERIFIED') errors.push(`heroId ${hero.heroId}: awakening status=${hero.awakening?.status}, expected VERIFIED`);
      if (hero.awakening?.awakenId !== hero.heroId) errors.push(`heroId ${hero.heroId}: awakening.awakenId=${hero.awakening?.awakenId}, expected same-ID ${hero.heroId}`);
      if (hero.awakening?.level2SkillId !== level2SkillId) errors.push(`heroId ${hero.heroId}: generated Level2SkillID=${hero.awakening?.level2SkillId}, source=${level2SkillId}`);
      if (sourceSkill && hero.awakening?.skill?.skillId !== level2SkillId) errors.push(`heroId ${hero.heroId}: generated awakening skillId=${hero.awakening?.skill?.skillId}, source=${level2SkillId}`);
    }
  }

  if (hero.talent?.status !== 'VERIFIED' || hero.talent?.selectionRule !== 'TalentSkill_IDs[star - 1]' || hero.talent?.starProgression?.length !== 6) {
    errors.push(`heroId ${hero.heroId}: talent progression invalid`);
  }
  for (let i = 0; i < (hero.talent?.starProgression || []).length; i += 1) {
    const item = hero.talent.starProgression[i];
    if (item.star !== i + 1 || !Number.isInteger(item.skillId)) errors.push(`heroId ${hero.heroId}: invalid talent star slot ${i + 1}`);
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

if (verifiedAwakeningSkills !== 257 || verifiedNoLevel2Skill !== 10) {
  errors.push(`awakening source population changed: skillRefs=${verifiedAwakeningSkills} noLevel2=${verifiedNoLevel2Skill}, expected 257/10`);
}
if (summary.awakeningCoverage?.canonicalAwakenInfoRows !== 267) errors.push(`summary awakening canonical rows=${summary.awakeningCoverage?.canonicalAwakenInfoRows}, expected 267`);
if (summary.awakeningCoverage?.verifiedSkillReferences !== verifiedAwakeningSkills) errors.push(`summary awakening skill refs=${summary.awakeningCoverage?.verifiedSkillReferences}, independently verified=${verifiedAwakeningSkills}`);
if (summary.awakeningCoverage?.verifiedNoLevel2Skill !== verifiedNoLevel2Skill) errors.push(`summary awakening no-level2=${summary.awakeningCoverage?.verifiedNoLevel2Skill}, independently verified=${verifiedNoLevel2Skill}`);

const gates = new Map((summary.semanticGates || []).map((g) => [g.id, g.status]));
for (const id of ['awakeningClassification','displayJobStats','heroSoldierModifiers','talentStarProgression']) if (gates.get(id) !== 'VERIFIED') errors.push(`semantic gate ${id}=${gates.get(id)}`);
if (gates.get('talentIdentity') !== 'VERIFIED_REFERENCE_SET') errors.push(`semantic gate talentIdentity=${gates.get('talentIdentity')}`);

console.log(`HERO STAGE 4 FINAL VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
console.log(`heroes=${combat.records?.length || 0} upstream=${upstream.status} awakeningSkills=${verifiedAwakeningSkills} awakeningNoLevel2=${verifiedNoLevel2Skill} errors=${errors.length}`);
if (errors.length) {
  for (const error of errors.slice(0, 100)) console.log(`- FAIL: ${error}`);
  process.exitCode = 1;
}
