'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROOT, configPath, loadArray } = require('./lib/configdata-direct.cjs');

const CONTRACT_PATH = path.join(ROOT, 'data/contracts/hero-heart-fetter-raw-condition.v1.json');
const SOURCE_PACK_CONTRACT_PATH = path.join(ROOT, 'data/contracts/configdata-source-pack-contract.v1.json');
const HERO_SHARD_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');
const LEVELS = new Set([4, 7]);

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label}: expected positive integer, got ${String(value)}`);
  return value;
}
function integer(value, label) {
  if (!Number.isInteger(value)) throw new Error(`${label}: expected integer, got ${String(value)}`);
  return value;
}
function integerArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}: expected array`);
  return value.map((item, index) => integer(item, `${label}[${index}]`));
}
function positiveIntegerArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}: expected array`);
  return value.map((item, index) => positiveInteger(item, `${label}[${index}]`));
}
function indexUnique(records, label) {
  const map = new Map();
  records.forEach((record, sourceIndex) => {
    const id = positiveInteger(record?.ID, `${label}[${sourceIndex}].ID`);
    if (map.has(id)) throw new Error(`${label}: duplicate ID ${id}`);
    map.set(id, { record, sourceIndex });
  });
  return map;
}
function requireIndexed(map, id, label) {
  const hit = map.get(id);
  if (!hit) throw new Error(`${label}: unresolved ID ${id}`);
  return hit;
}

function frozenHeroPopulation() {
  const names = fs.readdirSync(HERO_SHARD_DIR).filter((name) => /^\d+\.json$/.test(name)).sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)));
  const rows = [];
  const seen = new Set();
  for (const name of names) {
    const shard = readJson(path.join(HERO_SHARD_DIR, name));
    const heroId = positiveInteger(shard?.heroId, `${name}.heroId`);
    if (name !== `${heroId}.json`) throw new Error(`Hero shard filename/heroId mismatch: ${name} -> ${heroId}`);
    if (seen.has(heroId)) throw new Error(`duplicate frozen heroId ${heroId}`);
    seen.add(heroId);
    const jobIds = new Set();
    const normalConnections = shard?.normal?.jobTree?.connections;
    if (Array.isArray(normalConnections)) {
      for (const connection of normalConnections) jobIds.add(positiveInteger(connection?.jobId, `Hero ${heroId} normal jobId`));
    }
    if (shard?.sp?.job != null) {
      jobIds.add(positiveInteger(shard.sp.job.jobId, `Hero ${heroId} SP jobId`));
    }
    rows.push({ heroId, jobIds });
  }
  if (rows.length === 0) throw new Error('frozen Hero population is empty');
  return rows;
}

function rawSourceInfo(sourcePack) {
  const names = {
    hero: 'ConfigDataHeroInfo',
    heroInformation: 'ConfigDataHeroInformationInfo',
    heartFetter: 'ConfigDataHeroHeartFetterInfo',
    skill: 'ConfigDataSkillInfo',
    buff: 'ConfigDataBuffInfo',
    job: 'ConfigDataJobInfo',
  };
  const sources = {};
  for (const [key, logicalName] of Object.entries(names)) {
    sources[key] = {
      logicalPath: `data/configdata/${logicalName}.json`,
      sha256: sha256(configPath(logicalName)),
    };
  }
  return {
    names,
    sourcePack: {
      sourceCommitSha: sourcePack.authoritativePredecessor.sourceCommitSha,
      sourceTreeGitSha1: sourcePack.authoritativePredecessor.sourceTreeGitSha1,
      releaseTag: sourcePack.storage.releaseTag,
      archiveSha256: sourcePack.storage.archive.sha256,
    },
    sources,
  };
}

function expectedRecords(population, indexes, sourceCommitSha) {
  const expected = [];
  const type7ParamsByHeroLevel = new Map();
  const type7RowsByHeroLevel = new Map();
  const type7Evidence = {
    semanticOwner: false,
    conditionCount: 0,
    paramCount: 0,
    jobInfoMatchCount: 0,
    frozenHeroJobSetMatchCount: 0,
    mismatches: [],
  };
  for (const { heroId, jobIds } of population) {
    const heroHit = requireIndexed(indexes.heroes, heroId, `Hero ${heroId}`);
    const informationId = positiveInteger(heroHit.record.HeroInformation_ID, `Hero ${heroId}.HeroInformation_ID`);
    const informationHit = requireIndexed(indexes.heroInformation, informationId, `Hero ${heroId} HeroInformation`);
    const heartFetterId = positiveInteger(informationHit.record.HeroHeartFetterId, `Hero ${heroId}.HeroHeartFetterId`);
    const heartHit = requireIndexed(indexes.heartFetters, heartFetterId, `Hero ${heroId} HeartFetter`);
    if (!Array.isArray(heartHit.record.UnlockSkills_ID)) throw new Error(`Hero ${heroId}: UnlockSkills_ID must be an array`);

    for (let unlockSourceIndex = 0; unlockSourceIndex < heartHit.record.UnlockSkills_ID.length; unlockSourceIndex += 1) {
      const entry = heartHit.record.UnlockSkills_ID[unlockSourceIndex];
      const level = integer(entry?.HeartFetterLevel, `Hero ${heroId}.UnlockSkills_ID[${unlockSourceIndex}].HeartFetterLevel`);
      if (!LEVELS.has(level)) continue;
      const skillId = positiveInteger(entry.SkillId, `Hero ${heroId}.UnlockSkills_ID[${unlockSourceIndex}].SkillId`);
      const skillHit = requireIndexed(indexes.skills, skillId, `Hero ${heroId} Lv${level} Skill`);
      const passiveBuffIds = positiveIntegerArray(skillHit.record.PassiveBuffs_ID, `Skill ${skillId}.PassiveBuffs_ID`);
      const conditions = [];
      const passiveBuffSourceIndices = [];
      for (const buffId of passiveBuffIds) {
        const buffHit = requireIndexed(indexes.buffs, buffId, `Skill ${skillId} Buff ${buffId}`);
        const conditionType = integer(buffHit.record.ConditionType, `Buff ${buffId}.ConditionType`);
        const conditionParams = integerArray(buffHit.record.ConditionParam, `Buff ${buffId}.ConditionParam`);
        if (conditionType === 7) {
          type7Evidence.conditionCount += 1;
          let byLevel = type7ParamsByHeroLevel.get(heroId);
          if (!byLevel) {
            byLevel = { 4: [], 7: [] };
            type7ParamsByHeroLevel.set(heroId, byLevel);
          }
          let rowsByLevel = type7RowsByHeroLevel.get(heroId);
          if (!rowsByLevel) {
            rowsByLevel = { 4: [], 7: [] };
            type7RowsByHeroLevel.set(heroId, rowsByLevel);
          }
          rowsByLevel[level].push({ skillId, buffId, conditionParams });
          for (const param of conditionParams) {
            type7Evidence.paramCount += 1;
            byLevel[level].push(param);
            const inJobInfo = indexes.jobs.has(param);
            const inFrozenHeroJobSet = jobIds.has(param);
            if (inJobInfo) type7Evidence.jobInfoMatchCount += 1;
            if (inFrozenHeroJobSet) type7Evidence.frozenHeroJobSetMatchCount += 1;
            if (!inJobInfo || !inFrozenHeroJobSet) {
              type7Evidence.mismatches.push({ heroId, skillId, buffId, param, inJobInfo, inFrozenHeroJobSet });
            }
          }
        }
        passiveBuffSourceIndices.push(buffHit.sourceIndex);
        conditions.push({ conditionType, conditionParams });
      }
      expected.push({
        heroId,
        heroHeartFetterId: heartFetterId,
        heartFetterLevel: level,
        skillId,
        passiveBuffIds,
        conditions,
        sourceProvenance: {
          sourceCommitSha,
          heroInfoSourceIndex: heroHit.sourceIndex,
          heroInformationSourceIndex: informationHit.sourceIndex,
          heroHeartFetterSourceIndex: heartHit.sourceIndex,
          unlockSkillSourceIndex: unlockSourceIndex,
          skillSourceIndex: skillHit.sourceIndex,
          passiveBuffSourceIndices,
        },
      });
    }
  }
  expected.sort((a, b) => a.heroId - b.heroId || a.heartFetterLevel - b.heartFetterLevel || a.skillId - b.skillId);

  const levelPairingEvidence = {
    semanticOwner: false,
    heroesWithType7: 0,
    heroesWithBothLevels: 0,
    level4ParamCount: 0,
    level7ParamCount: 0,
    identicalParamMultisetCount: 0,
    differentParamMultisetCount: 0,
    identicalUniqueParamSetCount: 0,
    differentUniqueParamSetCount: 0,
    differences: [],
    uniqueSetDifferences: [],
  };
  for (const [heroId, byLevel] of [...type7ParamsByHeroLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const level4 = [...byLevel[4]].sort((a, b) => a - b);
    const level7 = [...byLevel[7]].sort((a, b) => a - b);
    const level4Unique = [...new Set(level4)];
    const level7Unique = [...new Set(level7)];
    levelPairingEvidence.heroesWithType7 += 1;
    levelPairingEvidence.level4ParamCount += level4.length;
    levelPairingEvidence.level7ParamCount += level7.length;
    if (level4.length > 0 && level7.length > 0) levelPairingEvidence.heroesWithBothLevels += 1;
    if (JSON.stringify(level4) === JSON.stringify(level7)) {
      levelPairingEvidence.identicalParamMultisetCount += 1;
    } else {
      levelPairingEvidence.differentParamMultisetCount += 1;
      levelPairingEvidence.differences.push({ heroId, level4, level7 });
    }
    if (JSON.stringify(level4Unique) === JSON.stringify(level7Unique)) {
      levelPairingEvidence.identicalUniqueParamSetCount += 1;
    } else {
      levelPairingEvidence.differentUniqueParamSetCount += 1;
      const rows = type7RowsByHeroLevel.get(heroId) || { 4: [], 7: [] };
      levelPairingEvidence.uniqueSetDifferences.push({
        heroId,
        level4Unique,
        level7Unique,
        level4Rows: rows[4],
        level7Rows: rows[7],
      });
    }
  }

  return { expected, type7Evidence, levelPairingEvidence };
}

function assertNoForbiddenSemanticFields(value, location = '$') {
  const forbidden = new Set(['applicableJobId', 'applicableJobIds', 'jobRestricted']);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenSemanticFields(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert(!forbidden.has(key), `${location}: forbidden semantic field ${key}`);
    assertNoForbiddenSemanticFields(item, `${location}.${key}`);
  }
}

function artifactPath(argv) {
  const index = argv.indexOf('--artifact');
  if (index === -1 || !argv[index + 1]) throw new Error('Usage: node scripts/validate-hero-heart-fetter-raw-condition-v1.cjs --artifact <path>');
  return path.resolve(argv[index + 1]);
}

function main() {
  const artifact = readJson(artifactPath(process.argv.slice(2)));
  const contract = readJson(CONTRACT_PATH);
  const sourcePackContract = readJson(SOURCE_PACK_CONTRACT_PATH);
  assert.strictEqual(contract.stage, 'hero-heart-fetter-raw-condition-v1');
  assert.strictEqual(contract.owner, 'hero-canonical');
  assert.strictEqual(sourcePackContract.status, 'PASS');
  assert.strictEqual(sourcePackContract.owner, 'configdata-source-pack');

  const raw = rawSourceInfo(sourcePackContract);
  const population = frozenHeroPopulation();
  const indexes = {
    heroes: indexUnique(loadArray(raw.names.hero), raw.names.hero),
    heroInformation: indexUnique(loadArray(raw.names.heroInformation), raw.names.heroInformation),
    heartFetters: indexUnique(loadArray(raw.names.heartFetter), raw.names.heartFetter),
    skills: indexUnique(loadArray(raw.names.skill), raw.names.skill),
    buffs: indexUnique(loadArray(raw.names.buff), raw.names.buff),
    jobs: indexUnique(loadArray(raw.names.job), raw.names.job),
  };
  const parity = expectedRecords(population, indexes, raw.sourcePack.sourceCommitSha);

  assert.strictEqual(artifact.schemaVersion, 1);
  assert.strictEqual(artifact.stage, 'hero-heart-fetter-raw-condition-v1');
  assert.strictEqual(artifact.status, 'RAW_EVIDENCE');
  assert.strictEqual(artifact.semanticInterpretation, false);
  assert.strictEqual(artifact.heroPopulationSource, 'data/generated/hero-detail/by-id/*.json');
  assert.strictEqual(artifact.heroPopulationCount, population.length);
  assert.deepStrictEqual(artifact.levels, [4, 7]);
  assert.strictEqual(artifact.recordCount, parity.expected.length);
  assert.deepStrictEqual(artifact.sourcePack, raw.sourcePack);
  for (const key of ['hero', 'heroInformation', 'heartFetter', 'skill', 'buff']) assert.deepStrictEqual(artifact.sources[key], raw.sources[key]);
  assert.deepStrictEqual(artifact.records, parity.expected);
  assertNoForbiddenSemanticFields(artifact);

  for (const record of artifact.records) {
    assert.strictEqual(record.passiveBuffIds.length, record.conditions.length, `Skill ${record.skillId}: multi-buff/condition cardinality mismatch`);
  }

  process.stdout.write(`${JSON.stringify({
    status: 'PASS_HERO_HEART_FETTER_RAW_CONDITION_V1',
    heroPopulationCount: population.length,
    recordCount: parity.expected.length,
    type7ConsistencyEvidence: {
      ...parity.type7Evidence,
      mismatchCount: parity.type7Evidence.mismatches.length,
      mismatches: parity.type7Evidence.mismatches.slice(0, 50),
    },
    type7LevelPairingEvidence: {
      ...parity.levelPairingEvidence,
      differenceCount: parity.levelPairingEvidence.differences.length,
      differences: parity.levelPairingEvidence.differences.slice(0, 50),
      uniqueSetDifferenceCount: parity.levelPairingEvidence.uniqueSetDifferences.length,
      uniqueSetDifferences: parity.levelPairingEvidence.uniqueSetDifferences.slice(0, 50),
    },
  })}\n`);
}

main();
