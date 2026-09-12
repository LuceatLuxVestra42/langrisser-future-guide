'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const GENERATED = path.join(DATA, 'generated');
const VALIDATION = path.join(DATA, 'validation');

const HERO_MASTER = path.join(DATA, 'hero-name-master.v1.json');
const BOND_PREDECESSOR = path.join(GENERATED, 'hero-page-stage5-1-bonds-final.v1.json');
const GENERATED_ARTIFACT = path.join(GENERATED, 'hero-soldier-bond-command-contribution.v1.json');
const SOURCE_CONTRACT = path.join(DATA, 'contracts', 'configdata-source-pack-contract.v1.json');
const OUTPUT = path.join(VALIDATION, 'hero-soldier-bond-command-contribution-r5-d.v1.json');

const EXPECTED_SOURCE_COMMIT = '6475e63ee23d18adf733756c26a14fa9e3ed662c';
const EXPECTED_BOND_PREDECESSOR_BLOB = '5be989e9d0723782f491dc3005a11c0ad3143c43';
const EXPECTED_GENERATED_BLOB = '7999cc42be629edbf9e8755699dd969cb7b9ac8a';
const EXPECTED_HERO_COUNT = 267;
const EXPECTED_BOND_COUNT = 1335;
const EXPECTED_SKILL_BUFF_EDGE_COUNT = 1602;

const EXPECTED_MAX_SKILL_COUNTS = new Map([
  [70009, 267], [70019, 29], [70029, 50], [70039, 13], [70049, 50],
  [70059, 30], [70069, 95], [70088, 267], [70099, 267], [70109, 267],
]);

const EXPECTED_BUFF_IDS = new Set([
  70009, 70019, 70029, 70039, 70049, 70059, 70069, 70088, 70089, 70099, 70109,
]);

const EXPECTED_VECTOR_COUNTS = new Map([
  ['2500,1000,2500,1000', 29],
  ['1000,2500,2500,1000', 50],
  ['2500,1000,1000,2500', 13],
  ['1000,2500,1000,2500', 50],
  ['1000,1000,2500,2500', 30],
  ['2500,2500,1000,1000', 95],
]);

const PROPERTY_TO_COMPONENT = new Map([
  [93, 'hp'], [94, 'at'], [95, 'df'], [96, 'magicDf'],
]);

function fail(message) {
  throw new Error(`[R5-D] ${message}`);
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function readJson(file) {
  return JSON.parse(readText(file));
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
    fail('Missing --configdata-root. Verified external source-pack hydration is required.');
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

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function mapToSortedObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => Number(a[0]) - Number(b[0])));
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function gitBlobSha1(file) {
  const bytes = fs.readFileSync(file);
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function verifyExternalRoot(configdataRoot) {
  const relative = path.relative(ROOT, configdataRoot);
  const isInsideRepo = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (isInsideRepo) fail(`--configdata-root must be outside repository: ${configdataRoot}`);
  for (const name of ['ConfigDataSkillInfo.json', 'ConfigDataBuffInfo.json']) {
    const file = path.join(configdataRoot, name);
    if (!fs.existsSync(file)) fail(`Missing hydrated source file: ${file}`);
  }
}

function assertExpectedMap(actual, expected, label) {
  if (actual.size !== expected.size) fail(`${label} distinct count mismatch: expected ${expected.size}, got ${actual.size}`);
  for (const [key, expectedCount] of expected) {
    const actualCount = actual.get(key) || 0;
    if (actualCount !== expectedCount) fail(`${label} ${key}: expected ${expectedCount}, got ${actualCount}`);
  }
  for (const key of actual.keys()) {
    if (!expected.has(key)) fail(`${label} unexpected key: ${key}`);
  }
}

function vectorsEqual(a, b) {
  return a && b && a.hp === b.hp && a.at === b.at && a.df === b.df && a.magicDf === b.magicDf;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  verifyExternalRoot(args.configdataRoot);

  const contract = readJson(SOURCE_CONTRACT);
  if (contract?.authoritativePredecessor?.sourceCommitSha !== EXPECTED_SOURCE_COMMIT) {
    fail(`Source contract commit mismatch: ${contract?.authoritativePredecessor?.sourceCommitSha}`);
  }
  if (contract?.authoritativePredecessor?.logicalSourceRoot !== 'data/configdata' ||
      contract?.identityPolicy?.failClosedOnAnyMismatch !== true ||
      contract?.hydrationPolicy?.targetMustBeOutsideRepository !== true) {
    fail('Source-pack contract no longer matches the frozen R5 source boundary');
  }

  const predecessorBlob = gitBlobSha1(BOND_PREDECESSOR);
  if (predecessorBlob !== EXPECTED_BOND_PREDECESSOR_BLOB) {
    fail(`Stage5-1 predecessor blob mismatch: ${predecessorBlob}`);
  }

  const generatedBlob = gitBlobSha1(GENERATED_ARTIFACT);
  if (generatedBlob !== EXPECTED_GENERATED_BLOB) {
    fail(`Generated artifact blob mismatch: ${generatedBlob}`);
  }

  const heroes = records(HERO_MASTER);
  const predecessorRows = records(BOND_PREDECESSOR);
  const generated = readJson(GENERATED_ARTIFACT);
  const generatedRows = Array.isArray(generated?.records) ? generated.records : null;
  if (!generatedRows) fail('Generated artifact has no records array');

  const skills = records(path.join(args.configdataRoot, 'ConfigDataSkillInfo.json'));
  const buffs = records(path.join(args.configdataRoot, 'ConfigDataBuffInfo.json'));
  const skillById = indexUnique(skills, 'ID', 'SkillInfo');
  const buffById = indexUnique(buffs, 'ID', 'BuffInfo');

  if (heroes.length !== EXPECTED_HERO_COUNT) fail(`Canonical hero count: expected ${EXPECTED_HERO_COUNT}, got ${heroes.length}`);
  if (predecessorRows.length !== EXPECTED_HERO_COUNT) fail(`Predecessor hero count: expected ${EXPECTED_HERO_COUNT}, got ${predecessorRows.length}`);
  if (generatedRows.length !== EXPECTED_HERO_COUNT) fail(`Generated record count: expected ${EXPECTED_HERO_COUNT}, got ${generatedRows.length}`);

  const canonicalIds = heroes.map(row => strictId(row.heroId, 'hero-name-master.heroId'));
  const canonicalSet = new Set(canonicalIds);
  if (canonicalSet.size !== EXPECTED_HERO_COUNT) fail('Canonical Hero IDs are not unique');

  const predecessorByHero = new Map();
  for (const row of predecessorRows) {
    const heroId = strictId(row.heroId, 'predecessor.heroId');
    if (predecessorByHero.has(heroId)) fail(`Duplicate predecessor heroId: ${heroId}`);
    predecessorByHero.set(heroId, row);
  }

  const generatedByHero = new Map();
  for (const row of generatedRows) {
    const heroId = strictId(row.heroId, 'generated.heroId');
    if (generatedByHero.has(heroId)) fail(`Duplicate generated heroId: ${heroId}`);
    generatedByHero.set(heroId, row);
  }

  if (!sameSet(canonicalSet, new Set(predecessorByHero.keys()))) fail('Predecessor Hero ID set differs from canonical set');
  if (!sameSet(canonicalSet, new Set(generatedByHero.keys()))) fail('Generated Hero ID set differs from canonical set');

  if (generated.version !== 1 || generated.artifact !== 'hero-soldier-bond-command-contribution' || generated.stage !== 'R5-C') {
    fail('Generated artifact identity metadata mismatch');
  }
  if (generated.status !== 'GENERATED_PENDING_R5_D') fail(`Unexpected generated artifact status: ${generated.status}`);
  if (generated?.source?.bondPredecessorBlobSha !== EXPECTED_BOND_PREDECESSOR_BLOB ||
      generated?.source?.configDataSourceCommitSha !== EXPECTED_SOURCE_COMMIT ||
      generated?.source?.configDataTransport !== 'VERIFIED_EXTERNAL_SOURCE_PACK_HYDRATION') {
    fail('Generated artifact source metadata mismatch');
  }
  if (generated?.aggregation?.occurrencePolicy !== 'ADD_ALL_OCCURRENCES' ||
      generated?.aggregation?.normalization !== 'RAW_DIV_100_AFTER_AGGREGATION') {
    fail('Generated artifact aggregation metadata mismatch');
  }

  let bondCount = 0;
  let lengthParityChecked = 0;
  let skillBuffEdgeCount = 0;
  let rawMismatchCount = 0;
  let contributionMismatchCount = 0;
  const maxSkillCounts = new Map();
  const distinctBuffIds = new Set();
  const vectorCounts = new Map();

  for (const heroId of canonicalIds) {
    const predecessor = predecessorByHero.get(heroId);
    const actual = generatedByHero.get(heroId);
    if (!Array.isArray(predecessor.bonds) || predecessor.bonds.length !== 5) {
      fail(`Hero ${heroId}: expected exactly 5 predecessor bonds`);
    }

    const expectedRaw = { hp: 0, at: 0, df: 0, magicDf: 0 };

    for (let bondIndex = 0; bondIndex < predecessor.bonds.length; bondIndex += 1) {
      bondCount += 1;
      const bond = predecessor.bonds[bondIndex];
      const maxLevel = strictId(bond.maxLevel, `Hero ${heroId} bond ${bondIndex}.maxLevel`);
      const gotSkillIds = strictIdArray(bond.gotSkillIds, `Hero ${heroId} bond ${bondIndex}.gotSkillIds`);
      lengthParityChecked += 1;
      if (maxLevel <= 0 || gotSkillIds.length !== maxLevel) {
        fail(`Hero ${heroId} bond ${bondIndex}: gotSkillIds.length=${gotSkillIds.length}, maxLevel=${maxLevel}`);
      }

      const maxSkillId = gotSkillIds[maxLevel - 1];
      increment(maxSkillCounts, maxSkillId);
      const skill = skillById.get(maxSkillId);
      if (!skill) fail(`Hero ${heroId}: unresolved MAX SkillInfo.ID ${maxSkillId}`);

      const passiveBuffIds = strictIdArray(skill.PassiveBuffs_ID, `Skill ${maxSkillId}.PassiveBuffs_ID`);
      for (const buffId of passiveBuffIds) {
        skillBuffEdgeCount += 1;
        distinctBuffIds.add(buffId);
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
            fail(`Buff ${buffId}: target ${propertyId} missing ${valueKey}`);
          }
          expectedRaw[component] += strictNumber(buff[valueKey], `Buff ${buffId}.${valueKey}`);
        }
      }
    }

    const expectedContribution = {
      hp: expectedRaw.hp / 100,
      at: expectedRaw.at / 100,
      df: expectedRaw.df / 100,
      magicDf: expectedRaw.magicDf / 100,
    };

    if (!vectorsEqual(actual.raw, expectedRaw)) rawMismatchCount += 1;
    if (!vectorsEqual(actual.contribution, expectedContribution)) contributionMismatchCount += 1;

    const vectorKey = [expectedRaw.hp, expectedRaw.at, expectedRaw.df, expectedRaw.magicDf].join(',');
    increment(vectorCounts, vectorKey);
  }

  if (bondCount !== EXPECTED_BOND_COUNT) fail(`Bond count: expected ${EXPECTED_BOND_COUNT}, got ${bondCount}`);
  if (lengthParityChecked !== EXPECTED_BOND_COUNT) fail(`MAX-skill length parity coverage mismatch: ${lengthParityChecked}`);
  if (skillBuffEdgeCount !== EXPECTED_SKILL_BUFF_EDGE_COUNT) {
    fail(`Skill->Buff edges: expected ${EXPECTED_SKILL_BUFF_EDGE_COUNT}, got ${skillBuffEdgeCount}`);
  }
  if (rawMismatchCount !== 0 || contributionMismatchCount !== 0) {
    fail(`Generated parity mismatch: raw=${rawMismatchCount}, contribution=${contributionMismatchCount}`);
  }

  assertExpectedMap(maxSkillCounts, EXPECTED_MAX_SKILL_COUNTS, 'MAX Skill population');
  if (!sameSet(distinctBuffIds, EXPECTED_BUFF_IDS)) {
    fail(`Passive Buff distinct-set mismatch: ${[...distinctBuffIds].sort((a, b) => a - b).join(',')}`);
  }
  assertExpectedMap(vectorCounts, EXPECTED_VECTOR_COUNTS, 'raw vector population');

  const leon = generatedByHero.get(6);
  const leonRaw = { hp: 2500, at: 2500, df: 1000, magicDf: 1000 };
  const leonContribution = { hp: 25, at: 25, df: 10, magicDf: 10 };
  if (!leon || !vectorsEqual(leon.raw, leonRaw) || !vectorsEqual(leon.contribution, leonContribution)) {
    fail('Leon fixture mismatch');
  }

  if (generated.recordCount !== EXPECTED_HERO_COUNT || generated.totalBondCount !== EXPECTED_BOND_COUNT ||
      generated.skillBuffEdgeCount !== EXPECTED_SKILL_BUFF_EDGE_COUNT) {
    fail('Generated artifact summary counts mismatch recomputation');
  }

  const validation = {
    version: 1,
    stage: 'R5-D',
    checkpoint: 'independent-validator',
    status: 'PASS',
    completion: 'COMPLETE',
    semanticOwner: 'HERO_SOLDIER_BOND_CMD_CONTRIBUTION_MATERIALIZATION',
    purpose: 'Independent exact-ID recomputation of the R5-C Hero3 soldier command bond contribution artifact.',
    validator: 'scripts/validate_hero_soldier_bond_command_contribution.cjs',
    independence: {
      producerImported: false,
      producerExecuted: false,
      recomputation: 'INDEPENDENT_FROM_AUTHORITATIVE_INPUTS',
      nameJoinUsed: false,
      idArithmeticUsed: false,
      repositoryRawConfigDataFallbackUsed: false,
    },
    sources: {
      canonicalHeroMaster: 'data/hero-name-master.v1.json',
      bondPredecessor: 'data/generated/hero-page-stage5-1-bonds-final.v1.json',
      bondPredecessorGitBlobSha1: predecessorBlob,
      configDataSourceCommitSha: EXPECTED_SOURCE_COMMIT,
      configDataLogicalSourceRoot: 'data/configdata',
      configDataTransport: 'VERIFIED_EXTERNAL_SOURCE_PACK_HYDRATION',
      skillTable: 'ConfigDataSkillInfo.json',
      buffTable: 'ConfigDataBuffInfo.json',
    },
    validatedArtifact: {
      path: 'data/generated/hero-soldier-bond-command-contribution.v1.json',
      status: generated.status,
      gitBlobSha1: generatedBlob,
      sha256: sha256File(GENERATED_ARTIFACT),
    },
    coverage: {
      canonicalHeroCount: canonicalSet.size,
      predecessorHeroCount: predecessorByHero.size,
      generatedHeroCount: generatedByHero.size,
      bondCount,
      gotSkillIdsLengthEqualsMaxLevelChecked: lengthParityChecked,
      maxSkillDistinctCount: maxSkillCounts.size,
      passiveBuffDistinctCount: distinctBuffIds.size,
      skillBuffEdgeCount,
    },
    population: {
      maxSkillCounts: mapToSortedObject(maxSkillCounts),
      passiveBuffIds: [...distinctBuffIds].sort((a, b) => a - b),
      rawVectorCounts: Object.fromEntries([...vectorCounts.entries()].sort()),
    },
    parity: {
      canonicalToPredecessorHeroIdSet: 'PASS',
      canonicalToGeneratedHeroIdSet: 'PASS',
      exactRawVectorMismatchCount: rawMismatchCount,
      exactContributionMismatchCount: contributionMismatchCount,
      unresolvedMaxSkillCount: 0,
      unresolvedPassiveBuffCount: 0,
      gotSkillIdsLengthVsMaxLevelMismatchCount: 0,
    },
    fixtures: {
      leon: {
        heroId: 6,
        raw: leonRaw,
        contribution: leonContribution,
        status: 'PASS',
      },
    },
    inheritedReviewClosure: {
      r5A4GotSkillIdsLengthEqualsMaxLevel: {
        checked: lengthParityChecked,
        mismatchCount: 0,
        status: 'CLOSED_PASS',
      },
    },
    blocker: 'NONE',
    nextStart: 'R5-E_INVARIANTS',
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(validation, null, 2)}\n`, 'utf8');
  process.stdout.write(`[R5-D] PASS heroes=${canonicalSet.size} bonds=${bondCount} skillBuffEdges=${skillBuffEdgeCount} artifact=${generatedBlob}\n`);
}

main();
