'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const { resolveConfigDataFile } = require('./configdata-source-pack-maintenance-root.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = {
  validatorContract: 'data/contracts/hero-b2-sp-bonded-validator.v1.json',
  producerContract: 'data/contracts/hero-b2-sp-bonded-producer.v1.json',
  producerCheckpoint: 'data/checkpoints/hero-b2-5-sp-bonded-producer.v1.json',
  stage54: 'data/generated/hero-page-stage5-4-sp.v1.json',
  manifest: 'data/generated/hero-detail.v1.json',
};
const STAT = {
  hp: { ini: 'HP_INI', up: 'HP_UP', star: 'HPStar' },
  at: { ini: 'AT_INI', up: 'AT_UP', star: 'ATStar' },
  magic: { ini: 'Magic_INI', up: 'Magic_UP', star: 'MagicStar' },
  df: { ini: 'DF_INI', up: 'DF_UP', star: 'DFStar' },
  magicDf: { ini: 'MagicDF_INI', up: 'MagicDF_UP', star: 'MagicDFStar' },
  dex: { ini: 'DEX_INI', up: 'DEX_UP', star: 'DEXStar' },
};
const HERO_LEVEL = 70;
const STAR_LEVEL = 6;
const MAX_BOND = 2500;

const abs = rel => path.join(ROOT, rel);
const json = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const sourceJson = filename => JSON.parse(fs.readFileSync(resolveConfigDataFile(filename), 'utf8'));
const rows = value => Array.isArray(value) ? value : (value?.records || value?.rows || value?.data || []);
const byId = value => new Map(rows(value).map(row => [Number(row.ID), row]));
const stable = value => JSON.stringify(value);
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

function bankRound(n, d) {
  if (d <= 0n) throw new Error('bankRound denominator must be positive');
  const sign = n < 0n ? -1n : 1n;
  const a = n < 0n ? -n : n;
  const q = a / d;
  const r = a % d;
  let out = q;
  if (r * 2n > d || (r * 2n === d && q % 2n !== 0n)) out += 1n;
  return Number(out * sign);
}

function baselineShard(commit, rel) {
  return JSON.parse(cp.execFileSync('git', ['show', `${commit}:${rel}`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }));
}

function resolveLastJobLevel(connection, levelMap) {
  const ids = Array.isArray(connection?.JobLevels_ID) ? connection.JobLevels_ID.map(Number) : [];
  if (!ids.length || ids.some(id => !Number.isInteger(id))) return { error: 'invalid JobLevels_ID' };
  const candidates = ids.map(id => levelMap.get(id));
  if (candidates.some(row => !row)) return { error: 'unresolved JobLevelInfo ID' };
  candidates.sort((a, b) => {
    const levelOrder = Number(a.JobLevelUpHeroLevel || 0) - Number(b.JobLevelUpHeroLevel || 0);
    return levelOrder || Number(a.ID) - Number(b.ID);
  });
  return { row: candidates[candidates.length - 1] };
}

function independentlyCalculate(level, stars, mastery, reshape) {
  const values = {};
  const components = {};
  for (const [stat, def] of Object.entries(STAT)) {
    const ini = Number(level?.[def.ini]);
    const up = Object.prototype.hasOwnProperty.call(level || {}, def.up) ? Number(level[def.up]) : 0;
    const starArray = stars?.[def.star];
    if (!Number.isFinite(ini) || !Number.isFinite(up)) throw new Error(`${stat}: invalid INI/UP`);
    if (!Array.isArray(starArray) || starArray.length !== 6 || !starArray.every(Number.isInteger)) {
      throw new Error(`${stat}: invalid six-entry star array`);
    }
    if (!Number.isInteger(mastery[stat])) throw new Error(`${stat}: invalid mastery flat`);
    if (!Number.isInteger(reshape[stat])) throw new Error(`${stat}: invalid reshape selfMul`);

    // Independent exact rational construction:
    // ((INI*10 + UP*69)/10) * ((10000+star)/10000) * ((12500+reshape)/10000) + mastery
    const base10 = BigInt(Math.trunc(ini * 10 + up * 69));
    const starCorrection = starArray[STAR_LEVEL - 1];
    const scaleA = BigInt(10000 + starCorrection);
    const scaleB = BigInt(10000 + MAX_BOND + reshape[stat]);
    const denominator = 10n * 10000n * 10000n;
    const numerator = base10 * scaleA * scaleB + BigInt(mastery[stat]) * denominator;
    values[stat] = bankRound(numerator, denominator);
    components[stat] = { ini, up, starCorrection, masteryFlat: mastery[stat], reshapeSelfMul: reshape[stat] };
  }
  return { values, components };
}

function equalObject(a, b) {
  return stable(a) === stable(b);
}

const validatorContract = json(P.validatorContract);
const producerContract = json(P.producerContract);
const producerCheckpoint = json(P.producerCheckpoint);
const stage54 = json(P.stage54);
const manifest = json(P.manifest);

const jobConnectionMap = byId(sourceJson('ConfigDataJobConnectionInfo.json'));
const jobMap = byId(sourceJson('ConfigDataJobInfo.json'));
const jobLevelMap = byId(sourceJson('ConfigDataJobLevelInfo.json'));
const propertyMap = byId(sourceJson('ConfigDataPropertyModifyInfo.json'));

const result = {
  status: 'PASS',
  stage: 'hero-b2-6-independent-validator',
  predecessor: validatorContract?.authoritativePredecessor?.b2_5Commit || null,
  canonicalHeroCount: 0,
  spReleasedCount: 0,
  spNotReleasedCount: 0,
  spBondedPresentCount: 0,
  notReleasedPollution: 0,
  formulaMismatchCount: 0,
  relationErrorCount: 0,
  inputErrorCount: 0,
  reshapeErrorCount: 0,
  predecessorMutationCount: 0,
  fixtureFailureCount: 0,
  manifestIntegrityErrorCount: 0,
  provenanceMismatchCount: 0,
  usedReshapePropertyIds: [],
  hardErrors: [],
};
const fail = message => result.hardErrors.push(message);

if (validatorContract?.stage !== 'hero-b2-sp-bonded-validator' || validatorContract?.status !== 'READY') fail('validator contract not READY');
if (producerCheckpoint?.stage !== 'hero-b2-5-sp-bonded-producer' || producerCheckpoint?.status !== 'COMPLETE') fail('B2-5 checkpoint not COMPLETE');
if (producerContract?.stage !== 'hero-b2-sp-bonded-producer') fail('B2-5 producer contract missing/wrong stage');
if (stage54?.stage !== 'hero-page-5-4' || stage54?.status !== 'COMPLETE') fail('Stage5-4 SP source not COMPLETE');
if (manifest?.stage !== 'hero-page-6-3' || manifest?.completion !== 'COMPLETE' || manifest?.storage?.mode !== 'SHARDED_BY_HERO') fail('Hero manifest not COMPLETE SHARDED_BY_HERO');

const expectedCanonical = Number(validatorContract?.scope?.canonicalHeroCount);
const expectedReleased = Number(validatorContract?.scope?.spReleasedCount);
const expectedNotReleased = Number(validatorContract?.scope?.spNotReleasedCount);
const mapping = producerContract?.inputContract?.reshape?.propertyIdToStat || {};
const rawIdentity = producerContract?.inputContract?.reshape?.verifiedRawIdentity || {};
const mappingIds = Object.keys(mapping).map(Number).sort((a, b) => a - b);
const expectedMappingIds = [99, 100, 101, 102, 103, 104];
if (!equalObject(mappingIds, expectedMappingIds)) fail(`reshape mapping ID set drift: ${mappingIds.join(',')}`);
for (const id of mappingIds) {
  const row = propertyMap.get(id);
  const expected = rawIdentity[String(id)];
  if (!row || Number(row.PropertyModifyType) !== id || row.Name !== expected?.sourceNameCn) {
    result.reshapeErrorCount += 1;
    fail(`PropertyModifyInfo provenance mismatch for ID ${id}`);
  }
  if (!Object.prototype.hasOwnProperty.call(STAT, mapping[String(id)])) {
    result.reshapeErrorCount += 1;
    fail(`PropertyModify ID ${id} maps to unsupported stat`);
  }
}

const stageRows = Array.isArray(stage54?.records) ? stage54.records : [];
const stageByHero = new Map(stageRows.map(row => [Number(row.heroId), row]));
const locators = manifest?.storage?.byHeroId || {};
result.canonicalHeroCount = Object.keys(locators).length;
if (result.canonicalHeroCount !== expectedCanonical || stageByHero.size !== expectedCanonical) {
  fail(`canonical count mismatch manifest=${result.canonicalHeroCount} stage54=${stageByHero.size}`);
}

const usedPropertyIds = new Set();
const currentByHero = new Map();
const baselineByHero = new Map();
const b1Commit = validatorContract.authoritativePredecessor.b1Commit;

for (const [heroIdText, locator] of Object.entries(locators)) {
  const heroId = Number(heroIdText);
  const sourceRow = stageByHero.get(heroId);
  if (!sourceRow) { result.inputErrorCount += 1; continue; }
  const rel = locator?.path;
  if (!rel || !fs.existsSync(abs(rel))) { result.manifestIntegrityErrorCount += 1; continue; }
  const buffer = fs.readFileSync(abs(rel));
  if (buffer.length !== Number(locator.byteLength) || sha256(buffer) !== locator.sha256) {
    result.manifestIntegrityErrorCount += 1;
    continue;
  }
  let current;
  let baseline;
  try {
    current = JSON.parse(buffer.toString('utf8'));
    baseline = baselineShard(b1Commit, rel);
  } catch (error) {
    result.inputErrorCount += 1;
    fail(`Hero ${heroId}: shard/baseline read failed: ${error.message}`);
    continue;
  }
  currentByHero.set(heroId, current);
  baselineByHero.set(heroId, baseline);

  if (Number(current.heroId) !== heroId || Number(baseline.heroId) !== heroId) {
    result.inputErrorCount += 1;
    continue;
  }
  for (const field of ['normal', 'normalBondedStats', 'sp']) {
    if (!equalObject(current[field], baseline[field])) result.predecessorMutationCount += 1;
  }

  const released = sourceRow?.sp?.status === 'RELEASED';
  if (released) result.spReleasedCount += 1;
  else if (sourceRow?.sp?.status === 'NOT_RELEASED') result.spNotReleasedCount += 1;
  else { result.inputErrorCount += 1; continue; }

  const hasBonded = Object.prototype.hasOwnProperty.call(current, 'spBondedStats');
  if (!released) {
    if (hasBonded) result.notReleasedPollution += 1;
    continue;
  }
  if (!hasBonded) { result.inputErrorCount += 1; continue; }
  result.spBondedPresentCount += 1;

  const sp = sourceRow.sp;
  const jcId = Number(sp?.job?.jobConnectionId);
  const jobId = Number(sp?.job?.jobId);
  const jc = jobConnectionMap.get(jcId);
  const job = jobMap.get(jobId);
  if (!jc || !job || Number(jc.Job_ID) !== jobId || Number(job.Rank) !== 4) {
    result.relationErrorCount += 1;
    continue;
  }
  const resolvedLevel = resolveLastJobLevel(jc, jobLevelMap);
  if (!resolvedLevel.row) { result.relationErrorCount += 1; continue; }
  const level = resolvedLevel.row;

  const masteryRaw = baseline?.normal?.displayStats?.globalJobMastery?.totals;
  const mastery = {};
  let masteryOk = true;
  for (const stat of Object.keys(STAT)) {
    const value = masteryRaw?.[stat];
    if (!Number.isInteger(value)) masteryOk = false;
    mastery[stat] = value;
  }
  if (!masteryOk) { result.inputErrorCount += 1; continue; }

  const reshape = Object.fromEntries(Object.keys(STAT).map(stat => [stat, 0]));
  const seenReshapeStats = new Set();
  const buff = sp?.secondStageRewards?.buff;
  if (!buff || !Array.isArray(buff.properties)) { result.reshapeErrorCount += 1; continue; }
  let reshapeOk = true;
  for (const prop of buff.properties) {
    const propertyId = Number(prop?.propertyId);
    const value = Number(prop?.value);
    const stat = mapping[String(propertyId)];
    usedPropertyIds.add(propertyId);
    if (!stat || !Number.isInteger(value) || seenReshapeStats.has(stat)) {
      reshapeOk = false;
      break;
    }
    const raw = propertyMap.get(propertyId);
    if (!raw || Number(raw.PropertyModifyType) !== propertyId) {
      reshapeOk = false;
      break;
    }
    seenReshapeStats.add(stat);
    reshape[stat] = value;
  }
  if (!reshapeOk) { result.reshapeErrorCount += 1; continue; }

  let expected;
  try {
    expected = independentlyCalculate(level, sp.stats, mastery, reshape);
  } catch (error) {
    result.inputErrorCount += 1;
    fail(`Hero ${heroId}: independent calculation failed: ${error.message}`);
    continue;
  }

  const actual = current.spBondedStats;
  if (!equalObject(actual?.values, expected.values)) result.formulaMismatchCount += 1;
  if (Number(actual?.jobConnectionId) !== jcId || Number(actual?.jobId) !== jobId || Number(actual?.finalJobLevelId) !== Number(level.ID)) {
    result.relationErrorCount += 1;
  }
  if (actual?.rounding !== 'HALF_TO_EVEN' || Number(actual?.heroLevel) !== HERO_LEVEL || Number(actual?.star) !== STAR_LEVEL || Number(actual?.bondSelfMul) !== MAX_BOND) {
    result.inputErrorCount += 1;
  }
  for (const stat of Object.keys(STAT)) {
    const p = actual?.provenance?.progression?.components?.[stat];
    const e = expected.components[stat];
    if (!p || Number(p.ini) !== e.ini || Number(p.up) !== e.up || Number(p.starCorrection) !== e.starCorrection || Number(p.masteryFlat) !== e.masteryFlat || Number(p.reshapeSelfMul) !== e.reshapeSelfMul) {
      result.provenanceMismatchCount += 1;
    }
  }
}

result.usedReshapePropertyIds = [...usedPropertyIds].sort((a, b) => a - b);
if (!equalObject(result.usedReshapePropertyIds, expectedMappingIds)) {
  result.fixtureFailureCount += 1;
  fail(`released reshape property coverage mismatch: ${result.usedReshapePropertyIds.join(',')}`);
}

const leonFixture = validatorContract.fixtures.leon;
const leon = currentByHero.get(Number(leonFixture.heroId));
if (!leon || Number(leon?.spBondedStats?.jobConnectionId) !== leonFixture.jobConnectionId || Number(leon?.spBondedStats?.jobId) !== leonFixture.jobId || Number(leon?.spBondedStats?.finalJobLevelId) !== leonFixture.finalJobLevelId || Number(leon?.spBondedStats?.provenance?.reshape?.buffId) !== leonFixture.reshapeBuffId || !equalObject(leon?.spBondedStats?.values, leonFixture.values)) {
  result.fixtureFailureCount += 1;
  fail('Leon regression fixture failed');
}

const matthewFixture = validatorContract.fixtures.matthew;
const matthewSource = stageByHero.get(Number(matthewFixture.heroId));
if (!matthewSource || Number(matthewSource?.sp?.job?.jobConnectionId) !== matthewFixture.jobConnectionId || Number(matthewSource?.sp?.job?.jobId) !== matthewFixture.jobId || Number(matthewSource?.sp?.secondStageRewards?.buff?.buffId) !== matthewFixture.reshapeBuffId || !equalObject(matthewSource?.sp?.secondStageRewards?.buff?.properties, matthewFixture.reshapeProperties)) {
  result.fixtureFailureCount += 1;
  fail('Matthew structural fixture failed');
}

if (result.spReleasedCount !== expectedReleased) fail(`SP RELEASED count=${result.spReleasedCount}, expected=${expectedReleased}`);
if (result.spNotReleasedCount !== expectedNotReleased) fail(`SP NOT_RELEASED count=${result.spNotReleasedCount}, expected=${expectedNotReleased}`);
if (result.spBondedPresentCount !== expectedReleased) fail(`spBondedStats present=${result.spBondedPresentCount}, expected=${expectedReleased}`);

const zeroChecks = [
  'notReleasedPollution',
  'formulaMismatchCount',
  'relationErrorCount',
  'inputErrorCount',
  'reshapeErrorCount',
  'predecessorMutationCount',
  'fixtureFailureCount',
  'manifestIntegrityErrorCount',
  'provenanceMismatchCount',
];
for (const key of zeroChecks) if (result[key] !== 0) fail(`${key}=${result[key]}`);

result.hardErrorCount = result.hardErrors.length;
if (result.hardErrorCount) result.status = 'FAIL';
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'PASS') process.exit(1);
