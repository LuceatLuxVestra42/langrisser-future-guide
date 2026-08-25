const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);

function read(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function uniq(v) { return [...new Set(v.filter(Number.isInteger))].sort((a,b)=>a-b); }
function same(a,b) { return a.length === b.length && a.every((v,i)=>v===b[i]); }
function index(rows, filter=()=>true) {
  const map = new Map(); const dup = [];
  for (const r of rows) {
    if (!filter(r) || !Number.isInteger(r?.ID)) continue;
    if (map.has(r.ID)) dup.push(r.ID); else map.set(r.ID, r);
  }
  return { map, duplicates: uniq(dup) };
}

const master = read(P('data/hero-name-master.v1.json'));
const corrections = read(P('data/hero-name-corrections.v1.json'));
const stage31 = read(P('data/hero-master-stage3-1.v1.json'));
const stage32 = read(P('data/hero-normal-stage3-2.v1.json'));
const stage33 = read(P('data/hero-sp-stage3-3.v1.json'));
const stage34 = read(P('data/hero-page-stage3-4.v1.json'));
const summary34 = read(P('data/validation/hero-pages-summary.v1.json'));
const errors = [];

for (const [label, ok] of [
  ['3-1', stage31.status === 'complete'],
  ['3-2', stage32.status === 'complete'],
  ['3-3', stage33.status === 'complete'],
  ['3-4', stage34.status === 'complete'],
  ['3-4-summary', summary34.pipelineStatus === 'complete' && summary34.dataStatus === 'READY_FOR_STAGE_4' && Array.isArray(summary34.blockers) && summary34.blockers.length === 0],
]) if (!ok) errors.push(`${label}: frozen Stage 3 checkpoint not complete`);

const correctionById = new Map((corrections.corrections || []).map((c)=>[c.heroId,c]));
const canonical = (master.records || []).map((r) => correctionById.has(r.heroId) ? { ...r, nameKr: correctionById.get(r.heroId).nameKr } : r);
const canonicalIds = uniq(canonical.map((r)=>r.heroId));
if (master.recordCount !== 267 || canonical.length !== 267 || canonicalIds.length !== 267) errors.push('canonical Hero Master 267 invariant failed');
if (!canonical.every((r)=>Number.isInteger(r.heroId) && r.nameCn && r.nameKr && typeof r.nameEn === 'string' && Array.isArray(r.aliasesKr) && r.status === 'verified')) errors.push('canonical Hero identity field verification failed');
if (canonical.find((r)=>r.heroId===123)?.nameKr !== '베르너') errors.push('heroId 123 correction regression');
if (canonical.find((r)=>r.heroId===99164)?.nameKr !== '베르너 폰 에길') errors.push('heroId 99164 correction regression');

const heroRows = loadArray('ConfigDataHeroInfo');
const connectionRows = loadArray('ConfigDataJobConnectionInfo');
const skillRows = loadArray('ConfigDataSkillInfo');
const spRows = loadArray('ConfigDataSPHeroInfo');
const missionRows = loadArray('ConfigDataMissionInfo');
const missionExtRows = loadArray('ConfigDataMissionExtSPHeroInfo');

const heroIndex = index(heroRows, (r)=>Object.prototype.hasOwnProperty.call(r || {}, 'Useable'));
const connectionIndex = index(connectionRows, (r)=>Object.prototype.hasOwnProperty.call(r || {}, 'Job_ID') && Object.prototype.hasOwnProperty.call(r || {}, 'JobLevels_ID'));
const skillIndex = index(skillRows, (r)=>Object.prototype.hasOwnProperty.call(r || {}, 'Name'));
const spIndex = index(spRows);
const missionIndex = index(missionRows);
const missionExtIndex = index(missionExtRows);

for (const [label, idx] of [['HeroInfo',heroIndex],['JobConnectionInfo',connectionIndex],['SkillInfo',skillIndex],['SPHeroInfo',spIndex],['MissionInfo',missionIndex],['MissionExtSPHeroInfo',missionExtIndex]]) {
  if (idx.duplicates.length) errors.push(`${label}: duplicate selected IDs ${idx.duplicates.slice(0,20).join(',')}`);
}

const playableIds = uniq([...heroIndex.map.keys()]);
if (!same(canonicalIds, playableIds)) errors.push(`HeroInfo playable schema set differs from canonical 267; selected=${playableIds.length}`);

const canonicalSet = new Set(canonicalIds);
const spOwnerIds = uniq(spRows.map((r)=>r.ID));
if (spRows.length !== stage33.validationEvidence.spHeroCount) errors.push(`SPHero count changed: current=${spRows.length} frozen=${stage33.validationEvidence.spHeroCount}`);
if (spOwnerIds.length !== spRows.length) errors.push('SPHero owner duplicate detected');
for (const id of spOwnerIds) if (!canonicalSet.has(id)) errors.push(`SPHero owner heroId ${id} absent from canonical Hero Master`);

let missingSpConnections = 0;
let missingSpMissions = 0;
let missingSpRewardSkills = 0;
for (const sp of spRows) {
  if (Number.isInteger(sp.JobConnection_ID) && sp.JobConnection_ID > 0 && !connectionIndex.map.has(sp.JobConnection_ID)) {
    missingSpConnections++; errors.push(`SPHero ${sp.ID}: JobConnection ${sp.JobConnection_ID} missing`);
  }
  for (const missionId of [...(Array.isArray(sp.FisrtStageMissions) ? sp.FisrtStageMissions : []), ...(Array.isArray(sp.SecondStageMissions) ? sp.SecondStageMissions : [])]) {
    if (Number.isInteger(missionId) && missionId > 0 && !missionIndex.map.has(missionId)) { missingSpMissions++; errors.push(`SPHero ${sp.ID}: Mission ${missionId} missing`); }
  }
  for (const skillId of Array.isArray(sp.SecondStageRewardSkills) ? sp.SecondStageRewardSkills : []) {
    if (Number.isInteger(skillId) && skillId > 0 && !skillIndex.map.has(skillId)) { missingSpRewardSkills++; errors.push(`SPHero ${sp.ID}: reward Skill ${skillId} missing`); }
  }
}

let missingMissionExtPreUnlock = 0;
for (const ext of missionExtRows) {
  const missionId = ext.PreUnlockMissionId;
  if (Number.isInteger(missionId) && missionId > 0 && !missionIndex.map.has(missionId)) {
    missingMissionExtPreUnlock++; errors.push(`MissionExtSPHero ${ext.ID}: PreUnlockMissionId ${missionId} missing`);
  }
}

const fixture = stage33.representativeFixture;
const leon = spIndex.map.get(fixture.heroId);
if (!leon) errors.push('Leon SP fixture missing');
else {
  const first = Array.isArray(leon.FisrtStageMissions) ? leon.FisrtStageMissions : [];
  const second = Array.isArray(leon.SecondStageMissions) ? leon.SecondStageMissions : [];
  const rewards = Array.isArray(leon.SecondStageRewardSkills) ? leon.SecondStageRewardSkills : [];
  if (!same(first, fixture.expectedFirstStageMissionIds)) errors.push('Leon first-stage mission fixture mismatch');
  if (!same(second, fixture.expectedSecondStageMissionIds)) errors.push('Leon second-stage mission fixture mismatch');
  if (!same(rewards, fixture.expectedSecondStageRewardSkillIds)) errors.push('Leon SP reward-skill fixture mismatch');
}

const result = {
  version: 1,
  stage: 'hero-stage3-direct-regression',
  status: errors.length ? 'FAIL' : 'PASS',
  purpose: 'Revalidate the frozen Hero Stage 3 checkpoints against the current UnityDataTool direct-JSON snapshot without legacy TextAsset m_bytes parsing.',
  counts: {
    canonicalHeroes: canonicalIds.length,
    playableHeroInfo: playableIds.length,
    spHeroes: spRows.length,
    currentJobConnections: connectionIndex.map.size,
    currentSkills: skillIndex.map.size,
    currentMissions: missionIndex.map.size,
    missionExtSpHeroRecords: missionExtRows.length,
  },
  checks: {
    missingSpConnections,
    missingSpMissions,
    missingSpRewardSkills,
    missingMissionExtPreUnlock,
    leonFixture: leon && same(leon.FisrtStageMissions || [], fixture.expectedFirstStageMissionIds) && same(leon.SecondStageMissions || [], fixture.expectedSecondStageMissionIds) && same(leon.SecondStageRewardSkills || [], fixture.expectedSecondStageRewardSkillIds) ? 'PASS' : 'FAIL',
  },
  errors,
};
const out = P('data/validation/hero-stage3-direct-regression.v1.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(`HERO STAGE 3 DIRECT REGRESSION: ${result.status}`);
console.log(`heroes=${canonicalIds.length} spHeroes=${spRows.length} errors=${errors.length}`);
if (errors.length) { for (const error of errors.slice(0,100)) console.log(`- FAIL: ${error}`); process.exitCode=1; }
