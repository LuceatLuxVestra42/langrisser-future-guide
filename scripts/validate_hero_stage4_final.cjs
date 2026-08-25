const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const COMBAT = P('data/generated/hero-basic-combat.v1.json');
const SUMMARY = P('data/validation/hero-basic-combat-stage4-5-summary.v1.json');
const MASTER = P('data/hero-name-master.v1.json');
const TREE = P('data/generated/hero-job-trees.v1.json');
const SKILLS = P('data/generated/hero-skill-acquisition.v1.json');
const BOUNDARY = P('data/validation/hero-stage4-a-boundary.v1.json');

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
const errors = [];

const canonical = set((master.records || []).map((x) => x.heroId));
const combatIds = set((combat.records || []).map((x) => x.heroId));
const treeByHero = new Map((tree.records || []).map((x) => [x.heroId, x]));
const skillIds = set((skills.records || []).map((x) => x.heroId));

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

const gates = new Map((summary.semanticGates || []).map((g) => [g.id, g.status]));
for (const id of ['awakeningClassification','displayJobStats','heroSoldierModifiers','talentStarProgression']) if (gates.get(id) !== 'VERIFIED') errors.push(`semantic gate ${id}=${gates.get(id)}`);
if (gates.get('talentIdentity') !== 'VERIFIED_REFERENCE_SET') errors.push(`semantic gate talentIdentity=${gates.get('talentIdentity')}`);

console.log(`HERO STAGE 4 FINAL VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
console.log(`heroes=${combat.records?.length || 0} errors=${errors.length}`);
if (errors.length) {
  for (const error of errors.slice(0, 100)) console.log(`- FAIL: ${error}`);
  process.exitCode = 1;
}
