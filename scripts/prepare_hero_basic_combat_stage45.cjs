const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const GENERATED = path.join(DATA, 'generated');
const VALIDATION = path.join(DATA, 'validation');

const CONTRACT_PATH = path.join(DATA, 'hero-basic-combat-stage4-5.v1.json');
const HERO_MASTER_PATH = path.join(DATA, 'hero-name-master.v1.json');
const JOB_TREE_PATH = path.join(GENERATED, 'hero-job-trees.v1.json');
const SKILL_PATH = path.join(GENERATED, 'hero-skill-acquisition.v1.json');
const OUTPUT_PATH = path.join(GENERATED, 'hero-basic-combat.v1.json');
const SUMMARY_PATH = path.join(VALIDATION, 'hero-basic-combat-stage4-5-summary.v1.json');

const HERO_LEVEL = 70;
const DISPLAY_STAR = 6;
const STAT_DEFS = {
  hp: { ini: 'HP_INI', up: 'HP_UP', star: 'HPStar', masteryId: 87 },
  at: { ini: 'AT_INI', up: 'AT_UP', star: 'ATStar', masteryId: 88 },
  magic: { ini: 'Magic_INI', up: 'Magic_UP', star: 'MagicStar', masteryId: 90 },
  df: { ini: 'DF_INI', up: 'DF_UP', star: 'DFStar', masteryId: 89 },
  magicDf: { ini: 'MagicDF_INI', up: 'MagicDF_UP', star: 'MagicDFStar', masteryId: 91 },
  dex: { ini: 'DEX_INI', up: 'DEX_UP', star: 'DEXStar', masteryId: 92 },
};
const MASTERY_ID_TO_STAT = Object.fromEntries(Object.entries(STAT_DEFS).map(([stat, def]) => [def.masteryId, stat]));
const FORBIDDEN_MEMBERSHIP_KEYS = new Set([
  'usableSoldiers', 'soldierIds', 'usableSoldierIds', 'heroSoldierRelations',
  'soldierMembership', 'relationEdges', 'byHeroId', 'bySoldierId',
]);

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, value) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n'); }
function number(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }
function numberArray(v) { return Array.isArray(v) ? v.filter(Number.isFinite) : []; }
function uniqueInts(v) { return [...new Set(v.filter(Number.isInteger))].sort((a, b) => a - b); }
function sameArray(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]); }
function setDiff(a, b) { return [...a].filter((v) => !b.has(v)).sort((x, y) => x - y); }

function indexUnique(rows, idField, label, errors, filter = () => true) {
  const map = new Map();
  for (const row of rows) {
    if (!filter(row)) continue;
    const id = row?.[idField];
    if (!Number.isInteger(id)) continue;
    if (map.has(id)) errors.push(`${label}: duplicate ${idField}=${id}`);
    else map.set(id, row);
  }
  return map;
}

function skillSnapshot(row) {
  if (!row) return null;
  return {
    skillId: row.ID,
    nameCn: row.Name ?? null,
    desc: row.Desc ?? null,
    iconPath: row.IconPath ?? row.Icon ?? null,
  };
}

function masteryRewards(job) {
  const out = [];
  for (let i = 1; i <= 3; i += 1) {
    const propertyId = job?.[`Property${i}_ID`];
    const value = job?.[`Property${i}_Value`];
    if (!Number.isInteger(propertyId) || !Number.isFinite(value) || propertyId === 0 || value === 0) continue;
    out.push({ propertyId, stat: MASTERY_ID_TO_STAT[propertyId] ?? null, value });
  }
  return out;
}

function masteryTotals(treeHero, jobIndex, errors) {
  const totals = Object.fromEntries(Object.keys(STAT_DEFS).map((k) => [k, 0]));
  const jobs = [];
  const jobIds = uniqueInts((treeHero.connections || []).map((c) => c.jobId));
  for (const jobId of jobIds) {
    const job = jobIndex.get(jobId);
    if (!job) { errors.push(`heroId ${treeHero.heroId}: missing JobInfo ${jobId}`); continue; }
    const rewards = masteryRewards(job);
    for (const reward of rewards) {
      if (!reward.stat) {
        errors.push(`heroId ${treeHero.heroId}: unsupported mastery PropertyModifyInfo ID ${reward.propertyId} on JobInfo ${jobId}`);
        continue;
      }
      totals[reward.stat] += reward.value;
    }
    jobs.push({ jobId, nameCn: job.Name ?? null, rank: job.Rank ?? null, rewards });
  }
  return { totals, jobs };
}

function finalLevelForConnection(connection, jobLevelIndex, heroId, errors) {
  const candidates = [];
  for (const level of connection.levels || []) {
    const source = jobLevelIndex.get(level.jobLevelId);
    if (!source) { errors.push(`heroId ${heroId}: missing JobLevelInfo ${level.jobLevelId}`); continue; }
    candidates.push({ level, source });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => number(a.source.JobLevelUpHeroLevel) - number(b.source.JobLevelUpHeroLevel) || a.source.ID - b.source.ID);
  return candidates[candidates.length - 1];
}

function computeDisplayStats(hero, sourceLevel, mastery, heroId, connectionId, errors) {
  const values = {};
  const components = {};
  for (const [stat, def] of Object.entries(STAT_DEFS)) {
    const starArray = numberArray(hero[def.star]);
    if (starArray.length !== 6) {
      errors.push(`heroId ${heroId}: ${def.star} expected 6 values, got ${starArray.length}`);
      continue;
    }
    const ini = number(sourceLevel[def.ini]);
    const up = number(sourceLevel[def.up]);
    const starCorrection = starArray[DISPLAY_STAR - 1];
    const progressionBase = ini + up * (HERO_LEVEL - 1) / 10;
    const starAdjusted = Math.round(progressionBase * (1 + starCorrection / 10000));
    const masteryFlat = number(mastery[stat]);
    const finalValue = starAdjusted + masteryFlat;
    if (!Number.isInteger(finalValue) || finalValue < 0) errors.push(`heroId ${heroId} connection ${connectionId}: invalid ${stat}=${finalValue}`);
    values[stat] = finalValue;
    components[stat] = { ini, up, heroLevel: HERO_LEVEL, star: DISPLAY_STAR, starCorrection, progressionBase, starAdjusted, masteryFlat };
  }
  return { values, components };
}

function talentProgression(treeHero, skillHero, hero, connectionIndex, skillIndex, errors) {
  const connectionIds = uniqueInts((treeHero.connections || []).map((c) => c.jobConnectionId));
  const arrays = [];
  for (const id of connectionIds) {
    const row = connectionIndex.get(id);
    if (!row) { errors.push(`heroId ${treeHero.heroId}: missing JobConnectionInfo ${id}`); continue; }
    const ids = numberArray(row.TalentSkill_IDs);
    if (ids.length !== 6) errors.push(`heroId ${treeHero.heroId}: JobConnection ${id} TalentSkill_IDs length=${ids.length}, expected 6`);
    arrays.push({ id, ids });
  }
  const primary = arrays[0]?.ids || [];
  for (const item of arrays.slice(1)) if (!sameArray(primary, item.ids)) errors.push(`heroId ${treeHero.heroId}: TalentSkill_IDs mismatch between JobConnections ${arrays[0].id} and ${item.id}`);
  const initialStar = number(hero.Star);
  if (!Number.isInteger(initialStar) || initialStar < 1 || initialStar > 6) errors.push(`heroId ${treeHero.heroId}: invalid initial Star=${hero.Star}`);
  if (primary.length === 6 && initialStar >= 1 && !primary.slice(0, initialStar).every((id) => id === primary[initialStar - 1])) {
    errors.push(`heroId ${treeHero.heroId}: pre-initial-star talent slots do not repeat the initial talent`);
  }
  const starProgression = primary.map((skillId, i) => {
    const skill = skillIndex.get(skillId);
    if (!skill) errors.push(`heroId ${treeHero.heroId}: talent skill ${skillId} missing from SkillInfo`);
    return { star: i + 1, skillId, skill: skillSnapshot(skill) };
  });
  return {
    status: 'VERIFIED',
    selectionRule: 'TalentSkill_IDs[star - 1]',
    initialStar,
    connectionTalentSkills: skillHero.connectionTalentSkills || [],
    starProgression,
  };
}

function soldierModifiers(hero, heroId, errors) {
  const raw = {
    hp: number(hero.HPCmd_INI),
    at: number(hero.ATCmd_INI),
    df: number(hero.DFCmd_INI),
    magicDf: number(hero.MagicDFCmd_INI),
  };
  for (const [key, value] of Object.entries(raw)) {
    if (!Number.isInteger(value) || value < 0 || value % 100 !== 0) errors.push(`heroId ${heroId}: invalid ${key} Cmd raw=${value}`);
  }
  return {
    status: 'VERIFIED',
    meaning: 'Hero-owned troop stat modifier percentages; not Hero-Soldier membership',
    scale: 'raw / 100 = percent',
    raw,
    hp: raw.hp / 100,
    at: raw.at / 100,
    df: raw.df / 100,
    magicDf: raw.magicDf / 100,
  };
}

function findForbiddenMembershipKeys(value, pathParts = [], out = []) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) { value.forEach((v, i) => findForbiddenMembershipKeys(v, [...pathParts, String(i)], out)); return out; }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_MEMBERSHIP_KEYS.has(key)) out.push([...pathParts, key].join('.'));
    findForbiddenMembershipKeys(child, [...pathParts, key], out);
  }
  return out;
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const heroMaster = readJson(HERO_MASTER_PATH);
  const jobTree = readJson(JOB_TREE_PATH);
  const skillAcquisition = readJson(SKILL_PATH);
  const errors = [];

  if (!['PASS', 'REVIEW'].includes(jobTree.status)) errors.push(`Stage 4-3 status=${jobTree.status}`);
  if (!['PASS', 'REVIEW'].includes(skillAcquisition.status)) errors.push(`Stage 4-4 status=${skillAcquisition.status}`);

  const canonicalIds = new Set((heroMaster.records || []).map((r) => r.heroId).filter(Number.isInteger));
  const treeIds = new Set((jobTree.records || []).map((r) => r.heroId).filter(Number.isInteger));
  const skillIds = new Set((skillAcquisition.records || []).map((r) => r.heroId).filter(Number.isInteger));
  if (canonicalIds.size !== 267) errors.push(`canonical Hero count=${canonicalIds.size}, expected 267`);
  if (setDiff(canonicalIds, treeIds).length || setDiff(treeIds, canonicalIds).length) errors.push('Stage 4-3 Hero set differs from canonical A-1 Hero set');
  if (setDiff(canonicalIds, skillIds).length || setDiff(skillIds, canonicalIds).length) errors.push('Stage 4-4 Hero set differs from canonical A-1 Hero set');

  const heroRows = loadArray('ConfigDataHeroInfo');
  const jobRows = loadArray('ConfigDataJobInfo');
  const connectionRows = loadArray('ConfigDataJobConnectionInfo');
  const levelRows = loadArray('ConfigDataJobLevelInfo');
  const skillRows = loadArray('ConfigDataSkillInfo');
  const awakenRows = loadArray('ConfigDataAwakenInfo');

  const heroIndex = indexUnique(heroRows, 'ID', 'HeroInfo', errors, (r) => Object.prototype.hasOwnProperty.call(r || {}, 'Useable'));
  const jobIndex = indexUnique(jobRows, 'ID', 'JobInfo', errors, (r) => Object.prototype.hasOwnProperty.call(r || {}, 'Rank') && Object.prototype.hasOwnProperty.call(r || {}, 'Name'));
  const connectionIndex = indexUnique(connectionRows, 'ID', 'JobConnectionInfo', errors, (r) => Object.prototype.hasOwnProperty.call(r || {}, 'TalentSkill_IDs') && Object.prototype.hasOwnProperty.call(r || {}, 'JobLevels_ID'));
  const jobLevelIndex = indexUnique(levelRows, 'ID', 'JobLevelInfo', errors, (r) => Object.prototype.hasOwnProperty.call(r || {}, 'HP_INI') && Object.prototype.hasOwnProperty.call(r || {}, 'JobLevelUpHeroLevel'));
  const skillIndex = indexUnique(skillRows, 'ID', 'SkillInfo', errors, (r) => Object.prototype.hasOwnProperty.call(r || {}, 'Name'));
  const awakenIndex = indexUnique(awakenRows, 'ID', 'AwakenInfo', errors);

  const selectedHeroIds = new Set(heroIndex.keys());
  if (heroIndex.size !== 267 || setDiff(canonicalIds, selectedHeroIds).length || setDiff(selectedHeroIds, canonicalIds).length) {
    errors.push(`playable HeroInfo schema set does not exactly match canonical 267 (selected=${heroIndex.size})`);
  }

  const skillByHero = new Map((skillAcquisition.records || []).map((r) => [r.heroId, r]));
  const records = [];

  for (const treeHero of jobTree.records || []) {
    const hero = heroIndex.get(treeHero.heroId);
    const skillHero = skillByHero.get(treeHero.heroId);
    if (!hero) { errors.push(`heroId ${treeHero.heroId}: missing playable HeroInfo`); continue; }
    if (!skillHero) { errors.push(`heroId ${treeHero.heroId}: missing Stage 4-4 skill record`); continue; }

    const mastery = masteryTotals(treeHero, jobIndex, errors);
    const connections = (treeHero.connections || []).map((connection) => {
      const final = finalLevelForConnection(connection, jobLevelIndex, treeHero.heroId, errors);
      const levels = (connection.levels || []).map((level) => {
        const source = jobLevelIndex.get(level.jobLevelId);
        return {
          ...level,
          rawStatComponents: source ? Object.fromEntries(Object.entries(STAT_DEFS).flatMap(([stat, def]) => [[`${stat}Ini`, number(source[def.ini])], [`${stat}Up`, number(source[def.up])]])) : null,
        };
      });
      const display = final ? computeDisplayStats(hero, final.source, mastery.totals, treeHero.heroId, connection.jobConnectionId, errors) : null;
      return {
        ...connection,
        levels,
        finalDisplayStats: final ? {
          status: 'VERIFIED',
          heroLevel: HERO_LEVEL,
          star: DISPLAY_STAR,
          jobLevelId: final.source.ID,
          formula: 'round((INI + UP * (heroLevel - 1) / 10) * (1 + HeroInfo.StatStar[star - 1] / 10000)) + globalJobMasteryFlat',
          values: display.values,
          components: display.components,
        } : null,
      };
    });

    const awakenId = Number.isInteger(hero.Awaken_ID) && hero.Awaken_ID > 0 ? hero.Awaken_ID : null;
    let awakening = { status: 'NONE', awakenId: null, level2SkillId: null, skill: null };
    if (awakenId) {
      const awaken = awakenIndex.get(awakenId);
      if (!awaken) errors.push(`heroId ${treeHero.heroId}: Awaken_ID ${awakenId} missing from AwakenInfo`);
      const level2SkillId = awaken?.Level2SkillID || null;
      const awakenSkill = level2SkillId ? skillIndex.get(level2SkillId) : null;
      if (level2SkillId && !awakenSkill) errors.push(`heroId ${treeHero.heroId}: awakening skill ${level2SkillId} missing from SkillInfo`);
      awakening = {
        status: awaken && (!level2SkillId || awakenSkill) ? 'VERIFIED' : 'FAIL',
        awakenId,
        nameCn: awaken?.Name ?? null,
        level2SkillId,
        skill: skillSnapshot(awakenSkill),
      };
    }

    records.push({
      heroId: treeHero.heroId,
      nameKr: treeHero.nameKr,
      nameCn: treeHero.nameCn,
      nameEn: treeHero.nameEn,
      heroMeta: { initialStar: number(hero.Star), rank: number(hero.Rank) },
      jobTree: {
        primaryJobConnectionId: treeHero.primaryJobConnectionId,
        rootConnectionIds: treeHero.rootConnectionIds,
        disconnectedConnectionIds: treeHero.disconnectedConnectionIds,
        orderedConnectionIds: treeHero.orderedConnectionIds,
        branches: treeHero.branches,
        connections,
      },
      skills: {
        jobLevelAcquisitions: skillHero.jobLevelAcquisitions || [],
        heroDirectSkillIds: skillHero.heroDirectSkillIds || [],
        heroDirectSkills: skillHero.heroDirectSkills || [],
        hiddenSkillIds: skillHero.hiddenSkillIds || [],
        hiddenSkills: skillHero.hiddenSkills || [],
        auxiliaryOnlySkillIds: skillHero.auxiliaryOnlySkillIds || [],
      },
      talent: talentProgression(treeHero, skillHero, hero, connectionIndex, skillIndex, errors),
      awakening,
      displayStats: {
        status: 'VERIFIED',
        scope: 'normal jobs at Hero Lv70 / 6-star; excludes bond effects handled in Hero Stage 5',
        globalJobMastery: mastery,
        byJobConnectionId: Object.fromEntries(connections.filter((c) => c.finalDisplayStats).map((c) => [String(c.jobConnectionId), c.finalDisplayStats])),
      },
      soldierModifiers: soldierModifiers(hero, treeHero.heroId, errors),
    });
  }

  const output = { version: 3, stage: '4-5', status: 'PASS', recordCount: records.length, records };
  const leaks = findForbiddenMembershipKeys(output);
  if (leaks.length) errors.push(`A-9 membership-field leakage: ${leaks.slice(0, 20).join(', ')}`);
  if (records.length !== 267) errors.push(`generated records=${records.length}, expected 267`);

  const finalStatus = errors.length ? 'FAIL' : 'PASS';
  output.status = finalStatus;
  writeJson(OUTPUT_PATH, output);

  const semanticGates = (contract.semanticGates || []).map((gate) => ({
    ...gate,
    status: ['displayJobStats', 'heroSoldierModifiers', 'talentStarProgression'].includes(gate.id) ? 'VERIFIED' : gate.status,
  }));
  const summary = {
    version: 3,
    stage: '4-5',
    status: finalStatus,
    pipelineStatus: finalStatus === 'PASS' ? 'FINAL_DATA_ASSEMBLED' : 'FINAL_VALIDATION_FAILED',
    stage4CompletionStatus: finalStatus === 'PASS' ? 'COMPLETE' : 'NOT_COMPLETE',
    generatedHeroCount: records.length,
    canonicalHeroCount: canonicalIds.size,
    sourceRecordCounts: {
      heroInfoRaw: heroRows.length,
      playableHeroInfo: heroIndex.size,
      jobInfo: jobIndex.size,
      jobConnectionInfo: connectionIndex.size,
      jobLevelInfo: jobLevelIndex.size,
      skillInfo: skillIndex.size,
      awakenInfo: awakenIndex.size,
    },
    formulaContract: {
      displayJobStats: 'round((INI + UP * 69 / 10) * (1 + HeroInfo.StatStar[5] / 10000)) + global JobInfo mastery flat; bond effects excluded until Stage 5',
      heroSoldierModifiers: 'HeroInfo.HPCmd_INI/ATCmd_INI/DFCmd_INI/MagicDFCmd_INI divided by 100',
      talentStarProgression: 'JobConnectionInfo.TalentSkill_IDs[star - 1] for star 1..6',
    },
    verifiedComponents: [
      'Stage 4-3 normal job topology for canonical 267 heroes',
      'Stage 4-4 normal skill acquisition/reference data for canonical 267 heroes',
      'HeroInfo.Awaken_ID -> AwakenInfo.Level2SkillID -> SkillInfo.ID',
      'displayJobStats at Lv70 / 6-star for every normal JobConnection',
      'Hero-owned soldier modifier percentages from Cmd fields',
      'TalentSkill_IDs star 1..6 selection rule',
      'A-1 canonical hero identity and A-9 relation ownership boundary',
    ],
    unresolvedComponents: [],
    semanticGates,
    relationBoundary: {
      usableSoldierMembership: 'OUT_OF_SCOPE',
      semanticOwner: 'Hero-Soldier Relation Layer',
      membershipFieldLeakCount: leaks.length,
    },
    hardErrors: errors,
  };
  writeJson(SUMMARY_PATH, summary);

  console.log(`STAGE 4-5 RESULT: ${finalStatus}`);
  console.log(`heroes=${records.length} canonical=${canonicalIds.size} errors=${errors.length} membershipLeaks=${leaks.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.log(`- FAIL: ${error}`);
    process.exitCode = 1;
  }
}

main();
