const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const MASTER = P('data/hero-name-master.v1.json');
const TREE = P('data/generated/hero-job-trees.v1.json');
const SKILLS = P('data/generated/hero-skill-acquisition.v1.json');
const OUT = P('data/validation/hero-stage4-upstream-direct.v1.json');

function read(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function write(p, v) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); }
function arr(v) { return Array.isArray(v) ? v : []; }
function ints(v) { return arr(v).filter(Number.isInteger); }
function uniq(v) { return [...new Set(v.filter(Number.isInteger))].sort((a,b)=>a-b); }
function sameSet(a,b) { return a.length === b.length && a.every((v,i)=>v===b[i]); }
function index(rows, filter=()=>true) { const m=new Map(), dup=[]; for(const r of rows){ if(!filter(r) || !Number.isInteger(r?.ID)) continue; if(m.has(r.ID)) dup.push(r.ID); else m.set(r.ID,r); } return {map:m, duplicates:uniq(dup)}; }
function collectSkillIds(value, key = '', out = []) {
  if (Array.isArray(value)) { for (const item of value) collectSkillIds(item, key, out); return out; }
  if (!value || typeof value !== 'object') {
    if (Number.isInteger(value) && /(^|_)skill(ids?)?$/i.test(key)) out.push(value);
    return out;
  }
  for (const [k,v] of Object.entries(value)) {
    if (Array.isArray(v) && /skill(ids?)?$/i.test(k)) for (const id of v) if (Number.isInteger(id)) out.push(id);
    else if (Number.isInteger(v) && /skillid$/i.test(k)) out.push(v);
    else collectSkillIds(v, k, out);
  }
  return out;
}

const master = read(MASTER);
const tree = read(TREE);
const skills = read(SKILLS);
const errors = [];

const heroes = loadArray('ConfigDataHeroInfo');
const connections = loadArray('ConfigDataJobConnectionInfo');
const jobs = loadArray('ConfigDataJobInfo');
const levels = loadArray('ConfigDataJobLevelInfo');
const skillRows = loadArray('ConfigDataSkillInfo');

const heroIndex = index(heroes, (r) => Object.prototype.hasOwnProperty.call(r || {}, 'Useable'));
const connectionIndex = index(connections, (r) => Object.prototype.hasOwnProperty.call(r || {}, 'Job_ID') && Object.prototype.hasOwnProperty.call(r || {}, 'JobLevels_ID'));
const jobIndex = index(jobs, (r) => Object.prototype.hasOwnProperty.call(r || {}, 'Rank') && Object.prototype.hasOwnProperty.call(r || {}, 'Name'));
const levelIndex = index(levels, (r) => Object.prototype.hasOwnProperty.call(r || {}, 'HP_INI') && Object.prototype.hasOwnProperty.call(r || {}, 'JobLevelUpHeroLevel'));
const skillIndex = index(skillRows, (r) => Object.prototype.hasOwnProperty.call(r || {}, 'Name'));

for (const [label, idx] of [['HeroInfo',heroIndex],['JobConnectionInfo',connectionIndex],['JobInfo',jobIndex],['JobLevelInfo',levelIndex],['SkillInfo',skillIndex]]) {
  if (idx.duplicates.length) errors.push(`${label}: duplicate selected IDs ${idx.duplicates.slice(0,20).join(',')}`);
}

const canonicalIds = uniq((master.records || []).map((x)=>x.heroId));
const selectedHeroIds = uniq([...heroIndex.map.keys()]);
const treeIds = uniq((tree.records || []).map((x)=>x.heroId));
const skillHeroIds = uniq((skills.records || []).map((x)=>x.heroId));
if (canonicalIds.length !== 267 || !sameSet(canonicalIds, selectedHeroIds) || !sameSet(canonicalIds, treeIds) || !sameSet(canonicalIds, skillHeroIds)) errors.push('canonical/playable/tree/skill Hero ID sets are not exact 267-way parity');

let heroConnectionSetMismatches = 0;
let primaryConnectionMismatches = 0;
let jobReferenceMismatches = 0;
let jobLevelSetMismatches = 0;
let missingCurrentSkillRefs = 0;
let checkedSkillRefs = 0;

for (const treeHero of tree.records || []) {
  const hero = heroIndex.map.get(treeHero.heroId);
  if (!hero) continue;
  const expectedConnectionIds = uniq([hero.JobConnection_ID, ...ints(hero.UseableJobConnections_ID)]);
  const actualConnectionIds = uniq((treeHero.connections || []).map((c)=>c.jobConnectionId));
  if (!sameSet(expectedConnectionIds, actualConnectionIds)) {
    heroConnectionSetMismatches++;
    errors.push(`heroId ${treeHero.heroId}: JobConnection set differs from current HeroInfo`);
  }
  if (treeHero.primaryJobConnectionId !== hero.JobConnection_ID) {
    primaryConnectionMismatches++;
    errors.push(`heroId ${treeHero.heroId}: primary JobConnection ${treeHero.primaryJobConnectionId} != HeroInfo ${hero.JobConnection_ID}`);
  }
  for (const c of treeHero.connections || []) {
    const current = connectionIndex.map.get(c.jobConnectionId);
    if (!current) { errors.push(`heroId ${treeHero.heroId}: current JobConnection ${c.jobConnectionId} missing`); continue; }
    if (current.Job_ID !== c.jobId || !jobIndex.map.has(c.jobId)) {
      jobReferenceMismatches++;
      errors.push(`heroId ${treeHero.heroId}: JobConnection ${c.jobConnectionId} Job_ID mismatch/missing`);
    }
    const expectedLevels = uniq(ints(current.JobLevels_ID));
    const actualLevels = uniq((c.levels || []).map((l)=>l.jobLevelId));
    if (!sameSet(expectedLevels, actualLevels)) {
      jobLevelSetMismatches++;
      errors.push(`heroId ${treeHero.heroId}: JobConnection ${c.jobConnectionId} JobLevels_ID set mismatch`);
    }
    for (const id of actualLevels) if (!levelIndex.map.has(id)) errors.push(`heroId ${treeHero.heroId}: JobLevelInfo ${id} missing from current direct JSON`);
  }
}

for (const heroSkills of skills.records || []) {
  const refs = uniq(collectSkillIds(heroSkills));
  checkedSkillRefs += refs.length;
  for (const id of refs) {
    if (!skillIndex.map.has(id)) {
      missingCurrentSkillRefs++;
      errors.push(`heroId ${heroSkills.heroId}: SkillInfo ${id} missing from current direct JSON`);
    }
  }
}

const result = {
  version: 1,
  stage: 'hero-stage4-upstream-direct-regression',
  status: errors.length ? 'FAIL' : 'PASS',
  purpose: 'Prove that frozen Stage 4-3/4-4 Hero topology and skill references remain compatible with the current UnityDataTool direct-JSON snapshot without rerunning legacy m_bytes builders.',
  counts: {
    canonicalHeroes: canonicalIds.length,
    playableHeroInfo: selectedHeroIds.length,
    jobTreeHeroes: treeIds.length,
    skillHeroes: skillHeroIds.length,
    currentJobConnections: connectionIndex.map.size,
    currentJobs: jobIndex.map.size,
    currentJobLevels: levelIndex.map.size,
    currentSkills: skillIndex.map.size,
    checkedSkillRefs,
  },
  checks: {
    heroConnectionSetMismatches,
    primaryConnectionMismatches,
    jobReferenceMismatches,
    jobLevelSetMismatches,
    missingCurrentSkillRefs,
  },
  interpretation: 'PASS means the existing 4-3 topology and 4-4 skill-reference artifacts are not stale relative to current direct JSON for the relations they claim; it does not make the legacy builders direct-JSON compatible.',
  errors,
};
write(OUT, result);
console.log(`HERO STAGE 4 UPSTREAM DIRECT REGRESSION: ${result.status}`);
console.log(`heroes=${canonicalIds.length} skillRefs=${checkedSkillRefs} errors=${errors.length}`);
if (errors.length) { for (const error of errors.slice(0,100)) console.log(`- FAIL: ${error}`); process.exitCode=1; }
