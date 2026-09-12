'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const GENERATED = path.join(DATA, 'generated');

const HERO_MASTER = path.join(DATA, 'hero-name-master.v1.json');
const BOND_PREDECESSOR = path.join(GENERATED, 'hero-page-stage5-1-bonds-final.v1.json');
const SOURCE_CONTRACT = path.join(DATA, 'contracts', 'configdata-source-pack-contract.v1.json');
const OUTPUT = path.join(GENERATED, 'hero-soldier-bond-command-contribution.v1.json');

const EXPECTED_SOURCE_COMMIT = '6475e63ee23d18adf733756c26a14fa9e3ed662c';
const EXPECTED_BOND_PREDECESSOR_BLOB = '5be989e9d0723782f491dc3005a11c0ad3143c43';
const EXPECTED_HERO_COUNT = 267;
const EXPECTED_BOND_COUNT = 1335;
const EXPECTED_SKILL_BUFF_EDGE_COUNT = 1602;

const EXPECTED_VECTOR_COUNTS = new Map([
  ['2500,1000,2500,1000', 29],
  ['1000,2500,2500,1000', 50],
  ['2500,1000,1000,2500', 13],
  ['1000,2500,1000,2500', 50],
  ['1000,1000,2500,2500', 30],
  ['2500,2500,1000,1000', 95],
]);

const PROPERTY_TO_COMPONENT = new Map([
  [93, 'hp'],
  [94, 'at'],
  [95, 'df'],
  [96, 'magicDf'],
]);

function fail(message) {
  throw new Error(`[R5-C] ${message}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function records(file) {
  const raw = readJson(file);
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.records)) return raw.records;
  fail(`No records array: ${file}`);
}

function parseArgs(argv) {
  const args = { configdataRoot: null, output: OUTPUT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--configdata-root') {
      args.configdataRoot = argv[++i] || null;
    } else if (arg === '--output') {
      args.output = path.resolve(argv[++i] || '');
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  if (!args.configdataRoot) {
    fail('Missing --configdata-root. Use the verified external source-pack hydration root; repository data/configdata fallback is forbidden.');
  }
  args.configdataRoot = path.resolve(args.configdataRoot);
  return args;
}

function strictNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`${label} must be finite, got ${JSON.stringify(value)}`);
  return n;
}

function strictId(value, label) {
  const n = strictNumber(value, label);
  if (!Number.isInteger(n)) fail(`${label} must be an integer, got ${JSON.stringify(value)}`);
  return n;
}

function strictIdArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value.map((v, i) => strictId(v, `${label}[${i}]`));
}

function indexUnique(rows, idField, label) {
  const map = new Map();
  for (const row of rows) {
    const id = strictId(row[idField], `${label}.${idField}`);
    if (map.has(id)) fail(`Duplicate ${label} ID: ${id}`);
    map.set(id, row);
  }
  return map;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function verifySourceContract() {
  const contract = readJson(SOURCE_CONTRACT);
  const sourceCommit = contract?.authoritativePredecessor?.sourceCommitSha;
  const logicalSourceRoot = contract?.authoritativePredecessor?.logicalSourceRoot;
  const failClosed = contract?.identityPolicy?.failClosedOnAnyMismatch;
  const targetOutsideRepo = contract?.hydrationPolicy?.targetMustBeOutsideRepository;
  if (sourceCommit !== EXPECTED_SOURCE_COMMIT) {
    fail(`Source contract commit mismatch: ${sourceCommit}`);
  }
  if (logicalSourceRoot !== 'data/configdata' || failClosed !== true || targetOutsideRepo !== true) {
    fail('Source-pack contract no longer matches the frozen R5-B source boundary');
  }
  return contract;
}

function verifyExternalRoot(configdataRoot) {
  const relative = path.relative(ROOT, configdataRoot);
  const isInsideRepo = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (isInsideRepo) {
    fail(`--configdata-root must be outside repository: ${configdataRoot}`);
  }
  for (const name of ['ConfigDataSkillInfo.json', 'ConfigDataBuffInfo.json']) {
    const file = path.join(configdataRoot, name);
    if (!fs.existsSync(file)) fail(`Missing hydrated source file: ${file}`);
  }
}

function assertVectorCounts(vectorCounts) {
  if (vectorCounts.size !== EXPECTED_VECTOR_COUNTS.size) {
    fail(`Expected ${EXPECTED_VECTOR_COUNTS.size} raw vectors, got ${vectorCounts.size}`);
  }
  for (const [key, expected] of EXPECTED_VECTOR_COUNTS) {
    const actual = vectorCounts.get(key) || 0;
    if (actual !== expected) fail(`Raw vector ${key}: expected ${expected}, got ${actual}`);
  }
  for (const key of vectorCounts.keys()) {
    if (!EXPECTED_VECTOR_COUNTS.has(key)) fail(`Unexpected raw vector: ${key}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceContract = verifySourceContract();
  verifyExternalRoot(args.configdataRoot);

  const heroes = records(HERO_MASTER);
  const bonds = records(BOND_PREDECESSOR);
  const skills = records(path.join(args.configdataRoot, 'ConfigDataSkillInfo.json'));
  const buffs = records(path.join(args.configdataRoot, 'ConfigDataBuffInfo.json'));

  if (heroes.length !== EXPECTED_HERO_COUNT) fail(`Expected ${EXPECTED_HERO_COUNT} canonical heroes, got ${heroes.length}`);
  if (bonds.length !== EXPECTED_HERO_COUNT) fail(`Expected ${EXPECTED_HERO_COUNT} predecessor hero records, got ${bonds.length}`);

  const canonicalIds = heroes.map(row => strictId(row.heroId, 'hero-name-master.heroId'));
  const canonicalSet = new Set(canonicalIds);
  if (canonicalSet.size !== EXPECTED_HERO_COUNT) fail('Canonical hero IDs are not unique');

  const bondByHeroId = new Map();
  for (const row of bonds) {
    const heroId = strictId(row.heroId, 'bond.heroId');
    if (bondByHeroId.has(heroId)) fail(`Duplicate predecessor heroId: ${heroId}`);
    bondByHeroId.set(heroId, row);
  }
  if (!sameSet(canonicalSet, new Set(bondByHeroId.keys()))) fail('Predecessor heroId set differs from canonical hero set');

  const skillById = indexUnique(skills, 'ID', 'SkillInfo');
  const buffById = indexUnique(buffs, 'ID', 'BuffInfo');

  let totalBondCount = 0;
  let skillBuffEdgeCount = 0;
  const vectorCounts = new Map();
  const outputRecords = [];

  for (const heroId of canonicalIds) {
    const predecessor = bondByHeroId.get(heroId);
    if (!Array.isArray(predecessor.bonds) || predecessor.bonds.length !== 5) {
      fail(`Hero ${heroId}: expected exactly 5 bonds`);
    }

    const raw = { hp: 0, at: 0, df: 0, magicDf: 0 };

    for (let bondIndex = 0; bondIndex < predecessor.bonds.length; bondIndex += 1) {
      totalBondCount += 1;
      const bond = predecessor.bonds[bondIndex];
      const maxLevel = strictId(bond.maxLevel, `Hero ${heroId} bond ${bondIndex}.maxLevel`);
      const gotSkillIds = strictIdArray(bond.gotSkillIds, `Hero ${heroId} bond ${bondIndex}.gotSkillIds`);
      if (maxLevel <= 0 || gotSkillIds.length !== maxLevel) {
        fail(`Hero ${heroId} bond ${bondIndex}: gotSkillIds.length=${gotSkillIds.length}, maxLevel=${maxLevel}`);
      }

      const maxSkillId = gotSkillIds[maxLevel - 1];
      const skill = skillById.get(maxSkillId);
      if (!skill) fail(`Hero ${heroId}: unresolved MAX SkillInfo.ID ${maxSkillId}`);

      const passiveBuffIds = strictIdArray(skill.PassiveBuffs_ID, `Skill ${maxSkillId}.PassiveBuffs_ID`);
      for (const buffId of passiveBuffIds) {
        skillBuffEdgeCount += 1;
        const buff = buffById.get(buffId);
        if (!buff) fail(`Skill ${maxSkillId}: unresolved BuffInfo.ID ${buffId}`);

        for (let slot = 1; slot <= 4; slot += 1) {
          const propertyKey = `Property${slot}_ID`;
          const valueKey = `Property${slot}_Value`;
          if (!Object.prototype.hasOwnProperty.call(buff, propertyKey)) continue;
          const propertyId = strictId(buff[propertyKey], `Buff ${buffId}.${propertyKey}`);
          const component = PROPERTY_TO_COMPONENT.get(propertyId);
          if (!component) continue;
          if (!Object.prototype.hasOwnProperty.call(buff, valueKey)) {
            fail(`Buff ${buffId}: ${propertyKey}=${propertyId} is missing ${valueKey}`);
          }
          raw[component] += strictNumber(buff[valueKey], `Buff ${buffId}.${valueKey}`);
        }
      }
    }

    const contribution = {
      hp: raw.hp / 100,
      at: raw.at / 100,
      df: raw.df / 100,
      magicDf: raw.magicDf / 100,
    };

    for (const key of Object.keys(raw)) {
      if (!Number.isInteger(raw[key])) fail(`Hero ${heroId}: raw.${key} is not an integer`);
      if (contribution[key] !== raw[key] / 100) fail(`Hero ${heroId}: normalization mismatch for ${key}`);
    }

    const vectorKey = [raw.hp, raw.at, raw.df, raw.magicDf].join(',');
    increment(vectorCounts, vectorKey);
    outputRecords.push({ heroId, raw, contribution });
  }

  if (totalBondCount !== EXPECTED_BOND_COUNT) fail(`Expected ${EXPECTED_BOND_COUNT} bonds, got ${totalBondCount}`);
  if (skillBuffEdgeCount !== EXPECTED_SKILL_BUFF_EDGE_COUNT) {
    fail(`Expected ${EXPECTED_SKILL_BUFF_EDGE_COUNT} Skill->Buff edges, got ${skillBuffEdgeCount}`);
  }
  assertVectorCounts(vectorCounts);

  const leon = outputRecords.find(row => row.heroId === 6);
  const leonExpected = JSON.stringify({ hp: 2500, at: 2500, df: 1000, magicDf: 1000 });
  if (!leon || JSON.stringify(leon.raw) !== leonExpected) fail('Leon fixture mismatch');

  const out = {
    version: 1,
    artifact: 'hero-soldier-bond-command-contribution',
    stage: 'R5-C',
    status: 'GENERATED_PENDING_R5_D',
    semanticOwner: 'HERO_SOLDIER_BOND_CMD_CONTRIBUTION_MATERIALIZATION',
    source: {
      canonicalHeroMaster: 'data/hero-name-master.v1.json',
      bondPredecessor: 'data/generated/hero-page-stage5-1-bonds-final.v1.json',
      bondPredecessorBlobSha: EXPECTED_BOND_PREDECESSOR_BLOB,
      configDataSourceCommitSha: sourceContract.authoritativePredecessor.sourceCommitSha,
      configDataLogicalSourceRoot: sourceContract.authoritativePredecessor.logicalSourceRoot,
      configDataTransport: 'VERIFIED_EXTERNAL_SOURCE_PACK_HYDRATION',
      requiredTables: ['ConfigDataSkillInfo', 'ConfigDataBuffInfo'],
    },
    aggregation: {
      propertyModifyTypeToComponent: { '93': 'hp', '94': 'at', '95': 'df', '96': 'magicDf' },
      occurrencePolicy: 'ADD_ALL_OCCURRENCES',
      normalization: 'RAW_DIV_100_AFTER_AGGREGATION',
    },
    recordCount: outputRecords.length,
    totalBondCount,
    skillBuffEdgeCount,
    rawVectorCounts: Object.fromEntries([...vectorCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    records: outputRecords,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  process.stdout.write(`${args.output}\n`);
}

main();
