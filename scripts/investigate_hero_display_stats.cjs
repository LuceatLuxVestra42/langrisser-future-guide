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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function recordsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.records)) return value.records;
  if (Array.isArray(value?.Data)) return value.Data;
  return [];
}

function idOf(record) {
  if (!record || typeof record !== 'object') return null;
  for (const key of ['ID', 'Id', 'id', 'Hero_ID', 'HeroID', 'HeroId', 'heroId']) {
    if (Number.isInteger(record[key])) return record[key];
  }
  return null;
}

function summarizeSource(filename) {
  const file = path.join(CONFIG, filename);
  if (!fs.existsSync(file)) return { filename, status: 'missing' };
  try {
    const raw = readJson(file);
    if (raw && !Array.isArray(raw) && Array.isArray(raw.m_bytes)) {
      return { filename, status: 'legacy-textasset', recordCount: null, rootKeys: Object.keys(raw) };
    }
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

function compactSource(source) {
  const { records, ...summary } = source;
  return summary;
}

function indexById(records) {
  const map = new Map();
  for (const record of records || []) {
    const id = idOf(record);
    if (Number.isInteger(id) && !map.has(id)) map.set(id, record);
  }
  return map;
}

function relevantProjection(record) {
  if (!record || typeof record !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (['ID', 'Id', 'id', 'Name', 'Name_Eng', 'Desc', 'DescStrKey'].includes(key) || RELEVANT_KEY.test(key)) out[key] = value;
  }
  return out;
}

function findArrayFields(record, matcher) {
  const found = {};
  if (!record || typeof record !== 'object') return found;
  for (const [key, value] of Object.entries(record)) {
    if (matcher.test(key) && Array.isArray(value)) found[key] = value;
  }
  return found;
}

function uniqueIntegers(values) {
  return [...new Set(values.filter(Number.isInteger))].sort((a, b) => a - b);
}

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
}

function histogram(values) {
  const map = new Map();
  for (const value of values) map.set(String(value), (map.get(String(value)) || 0) + 1);
  return Object.fromEntries([...map.entries()].sort((a, b) => Number(a[0]) - Number(b[0])));
}

function main() {
  const sources = SOURCE_FILES.map(summarizeSource);
  const byName = new Map(sources.map((source) => [source.filename, source]));
  const required = ['ConfigDataHeroInfo.json', 'ConfigDataJobInfo.json', 'ConfigDataJobConnectionInfo.json', 'ConfigDataJobLevelInfo.json', 'ConfigDataSkillInfo.json'];
  const blocked = required.filter((name) => byName.get(name)?.status !== 'direct-json');

  if (blocked.length) {
    writeJson(OUT, {
      version: 3,
      stage: '4-final-gates-investigation',
      status: 'SOURCE_BLOCKED',
      blocked,
      sourceSummary: sources.map(compactSource),
    });
    process.exitCode = 2;
    return;
  }

  const links = readJson(JOB_LINKS);
  const linkRecords = Array.isArray(links?.records) ? links.records : [];
  const playableIds = new Set(linkRecords.map((x) => x.heroId).filter(Number.isInteger));
  const fixtureHeroIds = uniqueIntegers([1, 6, ...linkRecords.slice(0, 8).map((x) => x.heroId)]);

  const heroIndex = indexById(byName.get('ConfigDataHeroInfo.json').records);
  const jobIndex = indexById(byName.get('ConfigDataJobInfo.json').records);
  const connectionIndex = indexById(byName.get('ConfigDataJobConnectionInfo.json').records);
  const jobLevelIndex = indexById(byName.get('ConfigDataJobLevelInfo.json').records);
  const skillIndex = indexById(byName.get('ConfigDataSkillInfo.json').records);

  const cmdFields = [...new Set(byName.get('ConfigDataHeroInfo.json').records.flatMap((record) => Object.keys(record || {}).filter((key) => /Cmd_INI$/i.test(key))))].sort();
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
  for (const link of linkRecords) {
    const hero = heroIndex.get(link.heroId);
    if (!hero) continue;
    const connectionIds = uniqueIntegers([link.primaryJobConnectionId, ...(link.useableJobConnectionIds || []), ...(link.connections || []).map((x) => x.jobConnectionId)]);
    const arrays = connectionIds.map((id) => connectionIndex.get(id)?.TalentSkill_IDs).filter(Array.isArray);
    const primary = connectionIndex.get(link.primaryJobConnectionId)?.TalentSkill_IDs || arrays[0] || [];
    const allConnectionsAgree = arrays.every((arr) => arraysEqual(arr, primary));
    if (!allConnectionsAgree) connectionMismatchCount += 1;
    const initialStar = hero.Star;
    const prefixThroughInitialAllSame = Number.isInteger(initialStar) && initialStar >= 1 && primary.length >= initialStar
      ? primary.slice(0, initialStar).every((id) => id === primary[initialStar - 1])
      : null;
    talentRows.push({
      heroId: link.heroId,
      nameKr: link.nameKr,
      initialStar,
      talentIds: primary,
      talentLength: primary.length,
      allConnectionsAgree,
      prefixThroughInitialAllSame,
    });
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

  const fixtures = [];
  const referencedTalentSkillIds = [];
  for (const heroId of fixtureHeroIds) {
    const link = linkRecords.find((x) => x.heroId === heroId) || null;
    const hero = heroIndex.get(heroId) || null;
    const connectionIds = uniqueIntegers([...(link?.connections || []).map((x) => x.jobConnectionId), ...(link?.useableJobConnectionIds || []), link?.primaryJobConnectionId]);
    const jobIds = uniqueIntegers((link?.connections || []).map((x) => x.jobId));
    const jobLevelIds = uniqueIntegers((link?.connections || []).flatMap((x) => x.jobLevelIds || []));
    const connections = connectionIds.map((id) => connectionIndex.get(id)).filter(Boolean);
    const talentArrayFields = connections.map((record) => ({ connectionId: idOf(record), fields: findArrayFields(record, /talent|skill/i) }));
    for (const item of talentArrayFields) for (const value of Object.values(item.fields)) for (const id of value) if (Number.isInteger(id)) referencedTalentSkillIds.push(id);

    fixtures.push({
      heroId,
      nameKr: link?.nameKr || null,
      hero: relevantProjection(hero),
      heroAllKeys: hero ? Object.keys(hero).sort() : [],
      cmdRaw: hero ? Object.fromEntries(cmdFields.map((key) => [key, Number.isFinite(hero[key]) ? hero[key] : 0])) : null,
      jobConnections: connections.map(relevantProjection),
      talentArrayFields,
      jobs: jobIds.map((id) => relevantProjection(jobIndex.get(id))).filter(Boolean),
      jobLevels: jobLevelIds.map((id) => relevantProjection(jobLevelIndex.get(id))).filter(Boolean),
    });
  }

  const talentSkillIds = uniqueIntegers(referencedTalentSkillIds);
  const talentSkills = talentSkillIds.map((id) => {
    const record = skillIndex.get(id);
    return record ? relevantProjection(record) : { ID: id, missing: true };
  });

  const result = {
    version: 3,
    stage: '4-final-gates-investigation',
    status: 'EVIDENCE_COLLECTED',
    purpose: 'Collect direct-JSON evidence for displayJobStats, heroSoldierModifiers, and talentStarProgression without promoting an unverified formula.',
    sourceSummary: sources.map(compactSource),
    playableHeroCount: playableIds.size,
    cmdEvidence: {
      fields: cmdFields,
      fieldStats: cmdFieldStats,
      fixtureRows: cmdRows.filter((row) => fixtureHeroIds.includes(row.heroId)),
    },
    talentEvidence: {
      heroCount: talentRows.length,
      connectionMismatchCount,
      lengthHistogram: histogram(talentRows.map((row) => row.talentLength)),
      byInitialStar: talentByInitialStar,
      fixtureRows: talentRows.filter((row) => fixtureHeroIds.includes(row.heroId)),
      referencedTalentSkills: talentSkills,
    },
    fixtureHeroIds,
    fixtures,
    auxiliarySamples: {
      heroStarInfo: byName.get('ConfigDataHeroStarInfo.json')?.records?.slice(0, 12) || [],
      propertyModifyInfo: byName.get('ConfigDataPropertyModifyInfo.json')?.records?.slice(0, 20).map(relevantProjection) || [],
      soldierInfo: byName.get('ConfigDataSoldierInfo.json')?.records?.slice(0, 5).map(relevantProjection) || [],
    },
    gateStatus: {
      displayJobStats: 'EVIDENCE_ONLY',
      heroSoldierModifiers: 'EVIDENCE_ONLY',
      talentStarProgression: 'EVIDENCE_ONLY',
    },
    safetyDecision: 'No final arithmetic or selection rule is inferred in this diagnostic. Named fields, distributions, and representative records are emitted for evidence-backed validation.',
  };

  writeJson(OUT, result);
  console.log(`EVIDENCE_COLLECTED: ${OUT}`);
  console.log(`playable=${playableIds.size} cmdFields=${cmdFields.join(',')} talentConnectionMismatches=${connectionMismatchCount}`);
}

main();
