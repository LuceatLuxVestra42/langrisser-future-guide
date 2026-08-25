'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'data', 'configdata');
const OUT = path.join(ROOT, 'data', 'validation', 'hero-display-stat-investigation.v1.json');
const JOB_LINKS = path.join(ROOT, 'data', 'generated', 'hero-job-links.v1.json');

const SOURCE_FILES = [
  'ConfigDataHeroInfo.json',
  'ConfigDataJobInfo.json',
  'ConfigDataJobConnectionInfo.json',
  'ConfigDataJobLevelInfo.json',
  'ConfigDataSkillInfo.json',
  'ConfigDataPropertyModifyInfo.json',
  'ConfigDataHeroStarInfo.json',
  'ConfigDataSoldierInfo.json',
];
const RELEVANT_KEY = /(soldier|army|troop|cmd|rate|ratio|modify|modifier|correction|talent|star|skill|job|hp|health|life|atk|attack|magic|int|def|dex|master|property)/i;
const STAT_KEYS = ['HP', 'AT', 'Magic', 'DF', 'MagicDF', 'DEX'];
const MASTERY_PROPERTY_ID_TO_STAT = { 87: 'HP', 88: 'AT', 89: 'DF', 90: 'Magic', 91: 'MagicDF', 92: 'DEX' };
const NAMED_HERO_TERMS = ['夜叉王凯', '修罗王秋亚人', '迦楼罗王力伽', '利昂', '马修', '格尼尔', '艾梅达'];

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function recordsOf(value) { if (Array.isArray(value)) return value; if (Array.isArray(value?.records)) return value.records; if (Array.isArray(value?.Data)) return value.Data; return []; }
function idOf(record) { if (!record || typeof record !== 'object') return null; for (const key of ['ID', 'Id', 'id', 'Hero_ID', 'HeroID', 'HeroId', 'heroId']) if (Number.isInteger(record[key])) return record[key]; return null; }
function hasOwn(record, key) { return record && typeof record === 'object' && Object.prototype.hasOwnProperty.call(record, key); }
function uniqueIntegers(values) { return [...new Set(values.filter(Number.isInteger))].sort((a, b) => a - b); }
function arraysEqual(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]); }
function histogram(values) { const map = new Map(); for (const value of values) map.set(String(value), (map.get(String(value)) || 0) + 1); return Object.fromEntries([...map.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))); }
function setDifference(a, b) { const right = new Set(b); return [...new Set(a)].filter((value) => !right.has(value)).sort((x, y) => x - y); }

function summarizeSource(filename) {
  const file = path.join(CONFIG, filename);
  if (!fs.existsSync(file)) return { filename, status: 'missing' };
  try {
    const raw = readJson(file);
    if (raw && !Array.isArray(raw) && Array.isArray(raw.m_bytes)) return { filename, status: 'legacy-textasset', recordCount: null, rootKeys: Object.keys(raw) };
    const records = recordsOf(raw);
    const keyCounts = new Map();
    for (const record of records) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
      for (const key of Object.keys(record)) keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    }
    const keys = [...keyCounts.keys()].sort();
    return {
      filename,
      status: records.length ? 'direct-json' : 'empty-or-unknown-shape',
      recordCount: records.length,
      rootType: Array.isArray(raw) ? 'array' : typeof raw,
      keys,
      relevantKeys: keys.filter((key) => RELEVANT_KEY.test(key)),
      keyPresence: Object.fromEntries(keys.map((key) => [key, keyCounts.get(key)])),
      records,
    };
  } catch (error) {
    return { filename, status: 'invalid-json', error: error instanceof Error ? error.message : String(error) };
  }
}
function compactSource(source) { const { records, ...summary } = source; return summary; }
function indexById(records) { const map = new Map(); const duplicateIds = new Set(); for (const record of records || []) { const id = idOf(record); if (!Number.isInteger(id)) continue; if (map.has(id)) duplicateIds.add(id); else map.set(id, record); } return { map, duplicateIds: [...duplicateIds].sort((a, b) => a - b) }; }
function relevantProjection(record) { if (!record || typeof record !== 'object') return null; const out = {}; for (const [key, value] of Object.entries(record)) if (['ID', 'Id', 'id', 'Name', 'Name_Eng', 'Name_OnlyArchive', 'Desc', 'DescStrKey', 'Useable'].includes(key) || RELEVANT_KEY.test(key)) out[key] = value; return out; }
function findArrayFields(record, matcher) { const found = {}; if (!record || typeof record !== 'object') return found; for (const [key, value] of Object.entries(record)) if (matcher.test(key) && Array.isArray(value)) found[key] = value; return found; }
function fullStatProjection(record) { if (!record) return null; const out = { ID: idOf(record), JobLevelUpHeroLevel: record.JobLevelUpHeroLevel ?? null, rank_code: record.rank_code ?? null }; for (const stat of STAT_KEYS) { out[`${stat}_INI`] = record[`${stat}_INI`] ?? null; out[`${stat}_UP`] = record[`${stat}_UP`] ?? null; } return out; }
function masteryRewards(job) { const rewards = []; for (let i = 1; i <= 3; i += 1) { const propertyId = job?.[`Property${i}_ID`]; const value = job?.[`Property${i}_Value`]; if (Number.isInteger(propertyId) && Number.isFinite(value) && propertyId !== 0 && value !== 0) rewards.push({ propertyId, stat: MASTERY_PROPERTY_ID_TO_STAT[propertyId] || null, value }); } return rewards; }
function masteryTotalsForLink(link, jobIndex) { const totals = Object.fromEntries(STAT_KEYS.map((key) => [key, 0])); const jobs = []; for (const jobId of uniqueIntegers((link?.connections || []).map((x) => x.jobId))) { const job = jobIndex.get(jobId); if (!job) continue; const rewards = masteryRewards(job); for (const reward of rewards) if (reward.stat) totals[reward.stat] += reward.value; jobs.push({ jobId, name: job.Name ?? null, rank: job.Rank ?? null, rewards }); } return { totals, jobs }; }
function heroNameValues(record) { return Object.entries(record || {}).filter(([key, value]) => typeof value === 'string' && /(name|title)/i.test(key)).map(([key, value]) => ({ key, value })); }

function main() {
  const sources = SOURCE_FILES.map(summarizeSource);
  const byName = new Map(sources.map((source) => [source.filename, source]));
  const required = ['ConfigDataHeroInfo.json', 'ConfigDataJobInfo.json', 'ConfigDataJobConnectionInfo.json', 'ConfigDataJobLevelInfo.json', 'ConfigDataSkillInfo.json'];
  const blocked = required.filter((name) => byName.get(name)?.status !== 'direct-json');
  if (blocked.length) {
    writeJson(OUT, { version: 6, stage: '4-final-gates-investigation', status: 'SOURCE_BLOCKED', blocked, sourceSummary: sources.map(compactSource) });
    process.exitCode = 2;
    return;
  }

  const links = readJson(JOB_LINKS);
  const linkRecords = Array.isArray(links?.records) ? links.records : [];
  const canonicalHeroIds = uniqueIntegers(linkRecords.map((x) => x.heroId));
  const targetConnectionIds = uniqueIntegers(linkRecords.flatMap((link) => [link.primaryJobConnectionId, ...(link.useableJobConnectionIds || []), ...(link.connections || []).map((x) => x.jobConnectionId)]));
  const targetJobIds = uniqueIntegers(linkRecords.flatMap((link) => (link.connections || []).map((x) => x.jobId)));
  const targetJobLevelIds = uniqueIntegers(linkRecords.flatMap((link) => (link.connections || []).flatMap((x) => x.jobLevelIds || [])));

  const heroAll = byName.get('ConfigDataHeroInfo.json').records;
  const heroRecords = heroAll.filter((record) => hasOwn(record, 'Useable'));
  const connectionAll = byName.get('ConfigDataJobConnectionInfo.json').records;
  const connectionRecords = connectionAll.filter((record) => hasOwn(record, 'TalentSkill_IDs') && hasOwn(record, 'JobLevels_ID') && hasOwn(record, 'Job_ID'));
  const jobAll = byName.get('ConfigDataJobInfo.json').records;
  const jobRecords = jobAll.filter((record) => hasOwn(record, 'Rank') && hasOwn(record, 'Name'));
  const jobLevelRecords = byName.get('ConfigDataJobLevelInfo.json').records.filter((record) => hasOwn(record, 'HP_INI') && hasOwn(record, 'JobLevelUpHeroLevel'));
  const skillRecords = byName.get('ConfigDataSkillInfo.json').records.filter((record) => hasOwn(record, 'Name'));

  const heroIndexed = indexById(heroRecords);
  const connectionIndexed = indexById(connectionRecords);
  const jobIndexed = indexById(jobRecords);
  const jobLevelIndexed = indexById(jobLevelRecords);
  const skillIndexed = indexById(skillRecords);
  const heroIndex = heroIndexed.map;
  const connectionIndex = connectionIndexed.map;
  const jobIndex = jobIndexed.map;
  const jobLevelIndex = jobLevelIndexed.map;
  const skillIndex = skillIndexed.map;

  const selectedHeroIds = uniqueIntegers(heroRecords.map(idOf));
  const adapterValidation = {
    hero: {
      rawRecordCount: heroAll.length,
      selectedRecordCount: heroRecords.length,
      selectedIdCount: selectedHeroIds.length,
      duplicateIds: heroIndexed.duplicateIds,
      canonicalMissingFromSelected: setDifference(canonicalHeroIds, selectedHeroIds),
      selectedMissingFromCanonical: setDifference(selectedHeroIds, canonicalHeroIds),
    },
    jobConnection: {
      rawRecordCount: connectionAll.length,
      selectedRecordCount: connectionRecords.length,
      duplicateIds: connectionIndexed.duplicateIds,
      targetMissing: targetConnectionIds.filter((id) => !connectionIndex.has(id)),
    },
    job: {
      rawRecordCount: jobAll.length,
      selectedRecordCount: jobRecords.length,
      duplicateIds: jobIndexed.duplicateIds,
      targetMissing: targetJobIds.filter((id) => !jobIndex.has(id)),
    },
    jobLevel: {
      rawRecordCount: byName.get('ConfigDataJobLevelInfo.json').records.length,
      selectedRecordCount: jobLevelRecords.length,
      duplicateIds: jobLevelIndexed.duplicateIds,
      targetMissing: targetJobLevelIds.filter((id) => !jobLevelIndex.has(id)),
    },
  };
  const adapterHardErrors = [];
  if (heroRecords.length !== 267 || selectedHeroIds.length !== 267) adapterHardErrors.push(`hero schema selection expected 267, got records=${heroRecords.length} ids=${selectedHeroIds.length}`);
  if (adapterValidation.hero.duplicateIds.length) adapterHardErrors.push(`hero duplicate ids: ${adapterValidation.hero.duplicateIds.slice(0, 20).join(',')}`);
  if (adapterValidation.hero.canonicalMissingFromSelected.length || adapterValidation.hero.selectedMissingFromCanonical.length) adapterHardErrors.push('hero schema selection does not exactly equal canonical 267 ids');
  if (adapterValidation.jobConnection.targetMissing.length) adapterHardErrors.push(`missing target job connections: ${adapterValidation.jobConnection.targetMissing.slice(0, 20).join(',')}`);
  if (adapterValidation.job.targetMissing.length) adapterHardErrors.push(`missing target jobs: ${adapterValidation.job.targetMissing.slice(0, 20).join(',')}`);
  if (adapterValidation.jobLevel.targetMissing.length) adapterHardErrors.push(`missing target job levels: ${adapterValidation.jobLevel.targetMissing.slice(0, 20).join(',')}`);

  const fixtureHeroIds = uniqueIntegers([1, 3, 4, 5, 6, 7, 8, 9, ...canonicalHeroIds.slice(0, 8)]);
  const namedHeroMatches = [];
  for (const record of heroRecords) {
    const names = heroNameValues(record);
    const matches = NAMED_HERO_TERMS.filter((term) => names.some((item) => item.value.includes(term)));
    if (matches.length) namedHeroMatches.push({ heroId: idOf(record), matches, names, record: relevantProjection(record) });
  }

  const cmdFields = [...new Set(heroRecords.flatMap((record) => Object.keys(record || {}).filter((key) => /Cmd_INI$/i.test(key))))].sort();
  const cmdRows = [];
  for (const link of linkRecords) {
    const hero = heroIndex.get(link.heroId);
    if (!hero) continue;
    const raw = Object.fromEntries(cmdFields.map((key) => [key, Number.isFinite(hero[key]) ? hero[key] : 0]));
    cmdRows.push({ heroId: link.heroId, nameKr: link.nameKr, raw });
  }
  const cmdFieldStats = Object.fromEntries(cmdFields.map((key) => {
    const values = cmdRows.map((row) => row.raw[key]);
    const nonzero = values.filter((value) => value !== 0);
    return [key, {
      nonzeroCount: nonzero.length,
      min: nonzero.length ? Math.min(...nonzero) : 0,
      max: nonzero.length ? Math.max(...nonzero) : 0,
      distinct: uniqueIntegers(nonzero),
      notDivisibleBy100: nonzero.filter((value) => value % 100 !== 0).slice(0, 20),
    }];
  }));

  const talentRows = [];
  let connectionMismatchCount = 0;
  let missingConnectionCount = 0;
  for (const link of linkRecords) {
    const hero = heroIndex.get(link.heroId);
    if (!hero) continue;
    const connectionIds = uniqueIntegers([link.primaryJobConnectionId, ...(link.useableJobConnectionIds || []), ...(link.connections || []).map((x) => x.jobConnectionId)]);
    const missing = connectionIds.filter((id) => !connectionIndex.has(id));
    missingConnectionCount += missing.length;
    const arrays = connectionIds.map((id) => connectionIndex.get(id)?.TalentSkill_IDs).filter(Array.isArray);
    const primary = connectionIndex.get(link.primaryJobConnectionId)?.TalentSkill_IDs || arrays[0] || [];
    const allConnectionsAgree = arrays.length === connectionIds.length && arrays.every((arr) => arraysEqual(arr, primary));
    if (!allConnectionsAgree) connectionMismatchCount += 1;
    const initialStar = hero.Star;
    const prefixThroughInitialAllSame = Number.isInteger(initialStar) && initialStar >= 1 && primary.length >= initialStar ? primary.slice(0, initialStar).every((id) => id === primary[initialStar - 1]) : null;
    talentRows.push({ heroId: link.heroId, nameKr: link.nameKr, initialStar, talentIds: primary, talentLength: primary.length, allConnectionsAgree, prefixThroughInitialAllSame, missingConnectionIds: missing });
  }
  const talentByInitialStar = {};
  for (const star of uniqueIntegers(talentRows.map((row) => row.initialStar))) {
    const rows = talentRows.filter((row) => row.initialStar === star);
    talentByInitialStar[star] = {
      heroCount: rows.length,
      lengthHistogram: histogram(rows.map((row) => row.talentLength)),
      prefixThroughInitialAllSame: rows.filter((row) => row.prefixThroughInitialAllSame === true).length,
      prefixThroughInitialNotSame: rows.filter((row) => row.prefixThroughInitialAllSame === false).length,
      examples: rows.slice(0, 8),
    };
  }

  const formulaHeroIds = new Set(fixtureHeroIds);
  for (const match of namedHeroMatches) if (Number.isInteger(match.heroId) && heroIndex.has(match.heroId)) formulaHeroIds.add(match.heroId);
  const formulaFixtures = [];
  const referencedTalentSkillIds = [];
  for (const heroId of [...formulaHeroIds].sort((a, b) => a - b)) {
    const link = linkRecords.find((x) => x.heroId === heroId) || null;
    const hero = heroIndex.get(heroId) || null;
    if (!link || !hero) continue;
    const connectionIds = uniqueIntegers([...(link.connections || []).map((x) => x.jobConnectionId), ...(link.useableJobConnectionIds || []), link.primaryJobConnectionId]);
    const connections = connectionIds.map((id) => connectionIndex.get(id)).filter(Boolean);
    for (const record of connections) for (const value of Object.values(findArrayFields(record, /talent|skill/i))) for (const id of value) if (Number.isInteger(id)) referencedTalentSkillIds.push(id);
    const mastery = masteryTotalsForLink(link, jobIndex);
    const connectionDetails = (link.connections || []).map((conn) => {
      const jc = connectionIndex.get(conn.jobConnectionId);
      const job = jobIndex.get(conn.jobId);
      const levels = (conn.jobLevelIds || []).map((id) => jobLevelIndex.get(id)).filter(Boolean);
      return {
        jobConnectionId: conn.jobConnectionId,
        jobId: conn.jobId,
        jobName: job?.Name ?? conn.job?.nameCn ?? null,
        rank: job?.Rank ?? conn.job?.rank ?? null,
        talentSkillIds: jc?.TalentSkill_IDs ?? [],
        masteryRewards: masteryRewards(job),
        jobLevels: levels.map(fullStatProjection),
        finalJobLevel: levels.length ? fullStatProjection(levels[levels.length - 1]) : null,
      };
    });
    formulaFixtures.push({
      heroId,
      nameKr: link.nameKr,
      nameCn: link.nameCn ?? null,
      nameEn: link.nameEn ?? null,
      heroNames: heroNameValues(hero),
      initialStar: hero.Star,
      starArrays: Object.fromEntries(STAT_KEYS.map((key) => [key, hero[`${key}Star`] ?? []])),
      cmdRaw: Object.fromEntries(cmdFields.map((key) => [key, Number.isFinite(hero[key]) ? hero[key] : 0])),
      masteryTotals: mastery.totals,
      masteryJobs: mastery.jobs,
      connections: connectionDetails,
    });
  }

  const talentSkillIds = uniqueIntegers(referencedTalentSkillIds);
  const talentSkills = talentSkillIds.map((id) => { const record = skillIndex.get(id); return record ? relevantProjection(record) : { ID: id, missing: true }; });
  const propertyModifyRecords = (byName.get('ConfigDataPropertyModifyInfo.json')?.records || []).filter((record) => Number.isInteger(record.ID) && record.ID >= 65 && record.ID <= 104);

  const result = {
    version: 6,
    stage: '4-final-gates-investigation',
    status: adapterHardErrors.length ? 'ADAPTER_REVIEW' : 'EVIDENCE_COLLECTED',
    purpose: 'Validate direct-JSON schema adapters first, then collect evidence for the remaining Stage 4 semantic gates without ID-first collisions.',
    sourceSummary: sources.map(compactSource),
    adapterValidation,
    adapterHardErrors,
    playableHeroCount: canonicalHeroIds.length,
    namedHeroMatches,
    cmdEvidence: { fields: cmdFields, fieldStats: cmdFieldStats, fixtureRows: cmdRows.filter((row) => formulaHeroIds.has(row.heroId)) },
    talentEvidence: { heroCount: talentRows.length, missingConnectionCount, connectionMismatchCount, lengthHistogram: histogram(talentRows.map((row) => row.talentLength)), byInitialStar: talentByInitialStar, fixtureRows: talentRows.filter((row) => formulaHeroIds.has(row.heroId)), referencedTalentSkills: talentSkills },
    propertyModifyEvidence: propertyModifyRecords,
    formulaFixtures,
    gateStatus: { displayJobStats: 'EVIDENCE_ONLY', heroSoldierModifiers: 'EVIDENCE_ONLY', talentStarProgression: 'EVIDENCE_ONLY' },
    safetyDecision: 'All hero evidence is now restricted to records carrying the playable-HeroInfo Useable schema; job-side evidence is restricted to matching table schemas. No final arithmetic or star selection rule is inferred by this diagnostic.',
  };
  writeJson(OUT, result);
  console.log(`${result.status}: ${OUT}`);
  console.log(`heroRaw=${heroAll.length} heroSelected=${heroRecords.length} canonical=${canonicalHeroIds.length} adapterErrors=${adapterHardErrors.length}`);
  console.log(`cmdFields=${cmdFields.join(',')} talentMismatches=${connectionMismatchCount} missingConnections=${missingConnectionCount}`);
}

main();
