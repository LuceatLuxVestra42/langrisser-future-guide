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

const RELEVANT_KEY = /(soldier|army|troop|rate|ratio|modify|modifier|correction|talent|star|skill|job|hp|health|life|atk|attack|magic|int|def|dex|master|property)/i;

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
      return {
        filename,
        status: 'legacy-textasset',
        recordCount: null,
        rootKeys: Object.keys(raw),
      };
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
    return {
      filename,
      status: 'invalid-json',
      error: error instanceof Error ? error.message : String(error),
    };
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
    if (key === 'ID' || key === 'Id' || key === 'id' || RELEVANT_KEY.test(key)) out[key] = value;
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

function main() {
  const sources = SOURCE_FILES.map(summarizeSource);
  const byName = new Map(sources.map((source) => [source.filename, source]));
  const required = ['ConfigDataHeroInfo.json', 'ConfigDataJobInfo.json', 'ConfigDataJobConnectionInfo.json', 'ConfigDataJobLevelInfo.json', 'ConfigDataSkillInfo.json'];
  const blocked = required.filter((name) => byName.get(name)?.status !== 'direct-json');

  if (blocked.length) {
    const result = {
      version: 2,
      stage: '4-final-gates-investigation',
      status: 'SOURCE_BLOCKED',
      purpose: 'Migrate Stage 4 semantic-gate investigation from legacy TextAsset m_bytes to UnityDataTool direct JSON without assigning unverified formulas.',
      blocked,
      sourceSummary: sources.map(compactSource),
    };
    writeJson(OUT, result);
    console.error(`SOURCE_BLOCKED: ${blocked.join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const links = readJson(JOB_LINKS);
  const linkRecords = Array.isArray(links?.records) ? links.records : [];
  const fixtureHeroIds = uniqueIntegers([1, 6, ...linkRecords.slice(0, 8).map((x) => x.heroId)]);

  const heroIndex = indexById(byName.get('ConfigDataHeroInfo.json').records);
  const jobIndex = indexById(byName.get('ConfigDataJobInfo.json').records);
  const connectionIndex = indexById(byName.get('ConfigDataJobConnectionInfo.json').records);
  const jobLevelIndex = indexById(byName.get('ConfigDataJobLevelInfo.json').records);
  const skillIndex = indexById(byName.get('ConfigDataSkillInfo.json').records);

  const fixtures = [];
  const referencedTalentSkillIds = [];

  for (const heroId of fixtureHeroIds) {
    const link = linkRecords.find((x) => x.heroId === heroId) || null;
    const hero = heroIndex.get(heroId) || null;
    const connectionIds = uniqueIntegers([
      ...(link?.connections || []).map((x) => x.jobConnectionId),
      ...(link?.useableJobConnectionIds || []),
      link?.primaryJobConnectionId,
    ]);
    const jobIds = uniqueIntegers((link?.connections || []).map((x) => x.jobId));
    const jobLevelIds = uniqueIntegers((link?.connections || []).flatMap((x) => x.jobLevelIds || []));
    const connections = connectionIds.map((id) => connectionIndex.get(id)).filter(Boolean);

    const talentArrayFields = connections.map((record) => ({
      connectionId: idOf(record),
      fields: findArrayFields(record, /talent|skill/i),
    }));
    for (const item of talentArrayFields) {
      for (const value of Object.values(item.fields)) {
        for (const id of value) if (Number.isInteger(id)) referencedTalentSkillIds.push(id);
      }
    }

    fixtures.push({
      heroId,
      nameKr: link?.nameKr || null,
      hero: relevantProjection(hero),
      heroAllKeys: hero ? Object.keys(hero).sort() : [],
      jobConnections: connections.map((record) => relevantProjection(record)),
      jobConnectionAllKeys: uniqueIntegers([]).length ? [] : [...new Set(connections.flatMap((record) => Object.keys(record)))].sort(),
      talentArrayFields,
      jobs: jobIds.map((id) => relevantProjection(jobIndex.get(id))).filter(Boolean),
      jobLevels: jobLevelIds.map((id) => relevantProjection(jobLevelIndex.get(id))).filter(Boolean),
    });
  }

  const talentSkillIds = uniqueIntegers(referencedTalentSkillIds);
  const talentSkills = talentSkillIds.map((id) => {
    const record = skillIndex.get(id);
    if (!record) return { id, missing: true };
    return { id, record: relevantProjection(record), allKeys: Object.keys(record).sort() };
  });

  const heroStarSource = byName.get('ConfigDataHeroStarInfo.json');
  const propertyModifySource = byName.get('ConfigDataPropertyModifyInfo.json');
  const soldierSource = byName.get('ConfigDataSoldierInfo.json');

  const result = {
    version: 2,
    stage: '4-final-gates-investigation',
    status: 'EVIDENCE_COLLECTED',
    purpose: 'Collect direct-JSON evidence for displayJobStats, heroSoldierModifiers, and talentStarProgression. This output deliberately does not promote a formula or selection rule without independent evidence.',
    sourceSummary: sources.map(compactSource),
    fixtureHeroIds,
    fixtures,
    referencedTalentSkills: talentSkills,
    auxiliarySamples: {
      heroStarInfo: heroStarSource?.records?.slice(0, 12) || [],
      propertyModifyInfo: propertyModifySource?.records?.slice(0, 20).map(relevantProjection) || [],
      soldierInfo: soldierSource?.records?.slice(0, 5).map(relevantProjection) || [],
    },
    gateStatus: {
      displayJobStats: 'EVIDENCE_ONLY',
      heroSoldierModifiers: 'EVIDENCE_ONLY',
      talentStarProgression: 'EVIDENCE_ONLY',
    },
    safetyDecision: 'No final stat arithmetic, soldier modifier percentages, or star-to-talent selection rule is inferred in this diagnostic. The collected named fields and representative records are intended for the next evidence-backed step.',
  };

  writeJson(OUT, result);
  console.log(`EVIDENCE_COLLECTED: ${OUT}`);
  console.log(`fixtures=${fixtures.length} talentSkills=${talentSkills.length}`);
}

main();
