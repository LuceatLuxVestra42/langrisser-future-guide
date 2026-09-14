'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROOT, configPath, loadArray } = require('./lib/configdata-direct.cjs');

const CONTRACT_PATH = path.join(ROOT, 'data/contracts/hero-heart-fetter-raw-condition.v1.json');
const SOURCE_PACK_CONTRACT_PATH = path.join(ROOT, 'data/contracts/configdata-source-pack-contract.v1.json');
const HERO_SHARD_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');
const LEVELS = new Set([4, 7]);
const RAW_FILES = Object.freeze({
  hero: 'ConfigDataHeroInfo',
  heroInformation: 'ConfigDataHeroInformationInfo',
  heartFetter: 'ConfigDataHeroHeartFetterInfo',
  skill: 'ConfigDataSkillInfo',
  buff: 'ConfigDataBuffInfo',
});

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

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
  const found = map.get(id);
  if (!found) throw new Error(`${label}: unresolved ID ${id}`);
  return found;
}

function frozenHeroIds() {
  const names = fs.readdirSync(HERO_SHARD_DIR).filter((name) => /^\d+\.json$/.test(name)).sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)));
  const seen = new Set();
  const ids = names.map((name) => {
    const file = path.join(HERO_SHARD_DIR, name);
    const shard = readJson(file);
    const heroId = positiveInteger(shard?.heroId, `${name}.heroId`);
    if (seen.has(heroId)) throw new Error(`frozen Hero population: duplicate heroId ${heroId}`);
    seen.add(heroId);
    if (name !== `${heroId}.json`) throw new Error(`frozen Hero population: shard filename/heroId mismatch ${name} -> ${heroId}`);
    return heroId;
  });
  if (ids.length === 0) throw new Error('frozen Hero population is empty');
  return ids;
}

function sourcePackIdentity() {
  const contract = readJson(SOURCE_PACK_CONTRACT_PATH);
  if (contract?.status !== 'PASS' || contract?.owner !== 'configdata-source-pack') throw new Error('ConfigData source-pack contract is not PASS');
  return Object.freeze({
    sourceCommitSha: contract.authoritativePredecessor.sourceCommitSha,
    sourceTreeGitSha1: contract.authoritativePredecessor.sourceTreeGitSha1,
    releaseTag: contract.storage.releaseTag,
    archiveSha256: contract.storage.archive.sha256,
  });
}

function sourceFiles() {
  return Object.fromEntries(Object.entries(RAW_FILES).map(([key, logicalName]) => {
    const file = configPath(logicalName);
    return [key, {
      logicalPath: `data/configdata/${logicalName}.json`,
      sha256: sha256(file),
    }];
  }));
}

function build() {
  const contract = readJson(CONTRACT_PATH);
  if (contract?.stage !== 'hero-heart-fetter-raw-condition-v1' || contract?.owner !== 'hero-canonical') throw new Error('raw-condition contract drift');

  const heroRecords = loadArray(RAW_FILES.hero);
  const heroInformationRecords = loadArray(RAW_FILES.heroInformation);
  const heartFetterRecords = loadArray(RAW_FILES.heartFetter);
  const skillRecords = loadArray(RAW_FILES.skill);
  const buffRecords = loadArray(RAW_FILES.buff);

  const heroes = indexUnique(heroRecords, RAW_FILES.hero);
  const heroInformation = indexUnique(heroInformationRecords, RAW_FILES.heroInformation);
  const heartFetters = indexUnique(heartFetterRecords, RAW_FILES.heartFetter);
  const skills = indexUnique(skillRecords, RAW_FILES.skill);
  const buffs = indexUnique(buffRecords, RAW_FILES.buff);
  const heroIds = frozenHeroIds();
  const identity = sourcePackIdentity();
  const sources = sourceFiles();
  const records = [];

  for (const heroId of heroIds) {
    const heroHit = requireIndexed(heroes, heroId, `Hero ${heroId}`);
    const heroInformationId = positiveInteger(heroHit.record.HeroInformation_ID, `Hero ${heroId}.HeroInformation_ID`);
    const informationHit = requireIndexed(heroInformation, heroInformationId, `Hero ${heroId} HeroInformation`);
    const heroHeartFetterId = positiveInteger(informationHit.record.HeroHeartFetterId, `Hero ${heroId} HeroHeartFetterId`);
    const heartHit = requireIndexed(heartFetters, heroHeartFetterId, `Hero ${heroId} HeroHeartFetter`);
    if (!Array.isArray(heartHit.record.UnlockSkills_ID)) throw new Error(`Hero ${heroId}: UnlockSkills_ID must be an array`);

    const selected = heartHit.record.UnlockSkills_ID
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => LEVELS.has(integer(entry?.HeartFetterLevel, `Hero ${heroId}.UnlockSkills_ID[].HeartFetterLevel`)));

    for (const { entry, index: unlockSourceIndex } of selected) {
      const heartFetterLevel = integer(entry.HeartFetterLevel, `Hero ${heroId}.UnlockSkills_ID[${unlockSourceIndex}].HeartFetterLevel`);
      const skillId = positiveInteger(entry.SkillId, `Hero ${heroId}.UnlockSkills_ID[${unlockSourceIndex}].SkillId`);
      const skillHit = requireIndexed(skills, skillId, `Hero ${heroId} Lv${heartFetterLevel} Skill`);
      const passiveBuffIds = positiveIntegerArray(skillHit.record.PassiveBuffs_ID, `Skill ${skillId}.PassiveBuffs_ID`);
      const conditions = [];
      const passiveBuffSourceIndices = [];

      for (const buffId of passiveBuffIds) {
        const buffHit = requireIndexed(buffs, buffId, `Skill ${skillId} passive Buff`);
        passiveBuffSourceIndices.push(buffHit.sourceIndex);
        conditions.push({
          conditionType: integer(buffHit.record.ConditionType, `Buff ${buffId}.ConditionType`),
          conditionParams: integerArray(buffHit.record.ConditionParam, `Buff ${buffId}.ConditionParam`),
        });
      }

      records.push({
        heroId,
        heroHeartFetterId,
        heartFetterLevel,
        skillId,
        passiveBuffIds,
        conditions,
        sourceProvenance: {
          sourceCommitSha: identity.sourceCommitSha,
          heroInfoSourceIndex: heroHit.sourceIndex,
          heroInformationSourceIndex: informationHit.sourceIndex,
          heroHeartFetterSourceIndex: heartHit.sourceIndex,
          unlockSkillSourceIndex,
          skillSourceIndex: skillHit.sourceIndex,
          passiveBuffSourceIndices,
        },
      });
    }
  }

  records.sort((a, b) => a.heroId - b.heroId || a.heartFetterLevel - b.heartFetterLevel || a.skillId - b.skillId);
  return {
    schemaVersion: 1,
    stage: 'hero-heart-fetter-raw-condition-v1',
    status: 'RAW_EVIDENCE',
    semanticInterpretation: false,
    heroPopulationSource: 'data/generated/hero-detail/by-id/*.json',
    heroPopulationCount: heroIds.length,
    levels: [4, 7],
    recordCount: records.length,
    sourcePack: identity,
    sources,
    records,
  };
}

function parseOutputArg(argv) {
  const index = argv.indexOf('--output');
  if (index === -1) return null;
  if (!argv[index + 1]) throw new Error('--output requires a path');
  return path.resolve(argv[index + 1]);
}

function main() {
  const artifact = build();
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  const output = parseOutputArg(process.argv.slice(2));
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, text);
    process.stdout.write(`${output}\n`);
  } else {
    process.stdout.write(text);
  }
}

if (require.main === module) main();
module.exports = { build };
