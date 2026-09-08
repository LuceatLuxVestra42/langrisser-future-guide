'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveConfigDataFile } = require('./configdata-source-pack-maintenance-root.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = {
  contract: 'data/contracts/hero-b2-sp-bonded-producer.v1.json',
  b1Contract: 'data/contracts/hero-b1-normal-bonded-consumer.v1.json',
  stage54: 'data/generated/hero-page-stage5-4-sp.v1.json',
  manifest: 'data/generated/hero-detail.v1.json',
};
const STAT_DEFS = {
  hp: { ini: 'HP_INI', up: 'HP_UP', star: 'HPStar' },
  at: { ini: 'AT_INI', up: 'AT_UP', star: 'ATStar' },
  magic: { ini: 'Magic_INI', up: 'Magic_UP', star: 'MagicStar' },
  df: { ini: 'DF_INI', up: 'DF_UP', star: 'DFStar' },
  magicDf: { ini: 'MagicDF_INI', up: 'MagicDF_UP', star: 'MagicDFStar' },
  dex: { ini: 'DEX_INI', up: 'DEX_UP', star: 'DEXStar' },
};
const HERO_LEVEL = 70;
const STAR = 6;
const BOND_SELF_MUL = 2500;

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const readExternal = filename => JSON.parse(fs.readFileSync(resolveConfigDataFile(filename), 'utf8'));
const rows = d => Array.isArray(d) ? d : (d?.records || d?.rows || d?.data || []);
const mapId = a => new Map(a.map(x => [Number(x.ID), x]));
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const stable = value => JSON.stringify(value);

function roundHalfEvenFraction(numerator, denominator) {
  if (denominator <= 0n) throw new Error('invalid denominator');
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const quotient = n / denominator;
  const remainder = n % denominator;
  const twice = remainder * 2n;
  let rounded = quotient;
  if (twice > denominator || (twice === denominator && quotient % 2n === 1n)) rounded += 1n;
  return Number(negative ? -rounded : rounded);
}

function finalJobLevel(connection, levelBy, heroId) {
  const ids = Array.isArray(connection?.JobLevels_ID) ? connection.JobLevels_ID.map(Number) : [];
  if (!ids.length || ids.some(id => !Number.isInteger(id))) throw new Error(`Hero ${heroId}: invalid SP JobLevels_ID`);
  const candidates = ids.map(id => levelBy.get(id));
  if (candidates.some(x => !x)) throw new Error(`Hero ${heroId}: unresolved SP JobLevel`);
  candidates.sort((a, b) => Number(a.JobLevelUpHeroLevel || 0) - Number(b.JobLevelUpHeroLevel || 0) || Number(a.ID) - Number(b.ID));
  return candidates[candidates.length - 1];
}

function verifyPropertySource(contract, propertyBy) {
  const mapping = contract?.inputContract?.reshape?.propertyIdToStat || {};
  const identity = contract?.inputContract?.reshape?.verifiedRawIdentity || {};
  const errors = [];
  for (const [idText, stat] of Object.entries(mapping)) {
    if (!Object.prototype.hasOwnProperty.call(STAT_DEFS, stat)) errors.push(`reshape mapping ${idText} -> unsupported stat ${stat}`);
    const id = Number(idText);
    const source = propertyBy.get(id);
    const expected = identity[idText];
    if (!source) errors.push(`PropertyModifyInfo ${id} missing`);
    else {
      if (Number(source.ID) !== id || Number(source.PropertyModifyType) !== Number(expected?.propertyModifyType)) {
        errors.push(`PropertyModifyInfo ${id} numeric identity drift`);
      }
      if (source.Name !== expected?.sourceNameCn) errors.push(`PropertyModifyInfo ${id} provenance name drift`);
    }
  }
  return errors;
}

function masteryTotals(shard, heroId) {
  const raw = shard?.normal?.displayStats?.globalJobMastery?.totals;
  if (!raw || typeof raw !== 'object') throw new Error(`Hero ${heroId}: Stage4 global mastery totals missing`);
  const out = {};
  for (const stat of Object.keys(STAT_DEFS)) {
    const value = raw[stat];
    if (!Number.isInteger(value) || value < 0) throw new Error(`Hero ${heroId}: invalid global mastery ${stat}`);
    out[stat] = value;
  }
  return out;
}

function reshapeInputs(sp, contract, propertyBy, heroId) {
  const mapping = contract.inputContract.reshape.propertyIdToStat;
  const selfMul = Object.fromEntries(Object.keys(STAT_DEFS).map(stat => [stat, 0]));
  const seenStats = new Set();
  const provenance = [];
  const buff = sp?.secondStageRewards?.buff;
  if (!buff || !Number.isInteger(Number(buff.buffId))) throw new Error(`Hero ${heroId}: reshape buff missing`);
  for (const item of buff.properties || []) {
    const propertyId = Number(item?.propertyId);
    const value = Number(item?.value);
    const stat = mapping[String(propertyId)];
    if (!stat) throw new Error(`Hero ${heroId}: unknown reshape PropertyModify ID ${propertyId}`);
    const source = propertyBy.get(propertyId);
    if (!source || Number(source.PropertyModifyType) !== propertyId) throw new Error(`Hero ${heroId}: reshape PropertyModify ${propertyId} source mismatch`);
    if (!Number.isInteger(value) || value < 0) throw new Error(`Hero ${heroId}: invalid reshape value for ${propertyId}`);
    if (seenStats.has(stat)) throw new Error(`Hero ${heroId}: duplicate reshape stat ${stat}`);
    seenStats.add(stat);
    selfMul[stat] = value;
    provenance.push({ propertyId, stat, value });
  }
  return { buffId: Number(buff.buffId), selfMul, provenance };
}

function computeStat(level, spStats, masteryFlat, reshapeSelfMul, def, heroId, stat) {
  const ini = Number(level?.[def.ini]);
  const hasUp = Object.prototype.hasOwnProperty.call(level || {}, def.up);
  const up = hasUp ? Number(level[def.up]) : 0;
  const starArray = spStats?.[def.star];
  if (!Number.isFinite(ini)) throw new Error(`Hero ${heroId}: ${def.ini} missing`);
  if (!Number.isFinite(up)) throw new Error(`Hero ${heroId}: ${def.up} invalid`);
  if (!Array.isArray(starArray) || starArray.length !== 6 || !starArray.every(Number.isInteger)) {
    throw new Error(`Hero ${heroId}: ${def.star} must be six integers`);
  }
  const starCorrection = starArray[STAR - 1];
  const progressionNumerator = BigInt(Math.trunc(ini * 10)) + BigInt(Math.trunc(up * 69));
  const progressionDenominator = 10n;
  const starMultiplier = BigInt(10000 + starCorrection);
  const bondedReshapeMultiplier = BigInt(10000 + BOND_SELF_MUL + reshapeSelfMul);
  const denominator = progressionDenominator * 10000n * 10000n;
  const numerator = progressionNumerator * starMultiplier * bondedReshapeMultiplier
    + BigInt(masteryFlat) * denominator;
  const value = roundHalfEvenFraction(numerator, denominator);
  if (!Number.isInteger(value) || value < 0) throw new Error(`Hero ${heroId}: invalid generated ${stat}`);
  return {
    value,
    component: {
      ini,
      up,
      heroLevel: HERO_LEVEL,
      star: STAR,
      starCorrection,
      masteryFlat,
      reshapeSelfMul,
      progressionNumerator: Number(progressionNumerator),
      progressionDenominator: Number(progressionDenominator),
    },
  };
}

function buildSpBondedStats(stage54Row, shard, jcBy, jobBy, levelBy, propertyBy, contract) {
  const heroId = Number(stage54Row.heroId);
  const sp = stage54Row.sp;
  const jobConnectionId = Number(sp?.job?.jobConnectionId);
  const jobId = Number(sp?.job?.jobId);
  const connection = jcBy.get(jobConnectionId);
  if (!connection) throw new Error(`Hero ${heroId}: SP JobConnection ${jobConnectionId} missing`);
  if (Number(connection.Job_ID) !== jobId) throw new Error(`Hero ${heroId}: SP JobConnection -> Job mismatch`);
  const job = jobBy.get(jobId);
  if (!job) throw new Error(`Hero ${heroId}: SP Job ${jobId} missing`);
  if (Number(job.Rank) !== 4) throw new Error(`Hero ${heroId}: SP Job ${jobId} Rank=${job.Rank}, expected 4`);
  const level = finalJobLevel(connection, levelBy, heroId);
  const mastery = masteryTotals(shard, heroId);
  const reshape = reshapeInputs(sp, contract, propertyBy, heroId);
  const values = {};
  const components = {};
  for (const [stat, def] of Object.entries(STAT_DEFS)) {
    const result = computeStat(level, sp.stats, mastery[stat], reshape.selfMul[stat], def, heroId, stat);
    values[stat] = result.value;
    components[stat] = result.component;
  }
  return {
    status: 'VERIFIED',
    heroLevel: HERO_LEVEL,
    star: STAR,
    bondProfile: 'MAX',
    bondSelfMul: BOND_SELF_MUL,
    rounding: 'HALF_TO_EVEN',
    formula: 'RoundHalfToEven(progressionBase * (1 + starCorrection / 10000) * (1 + 2500 / 10000 + reshapeSelfMul / 10000) + masteryFlat)',
    jobConnectionId,
    jobId,
    finalJobLevelId: Number(level.ID),
    values,
    provenance: {
      progression: {
        source: 'ConfigDataJobConnectionInfo.JobLevels_ID -> ConfigDataJobLevelInfo.ID',
        components,
      },
      mastery: {
        source: 'normal.displayStats.globalJobMastery.totals',
        values: mastery,
      },
      reshape: {
        source: 'sp.secondStageRewards.buff.properties',
        buffId: reshape.buffId,
        properties: reshape.provenance,
      },
    },
  };
}

const contract = read(P.contract);
const b1Contract = read(P.b1Contract);
const stage54 = read(P.stage54);
const manifest = read(P.manifest);
const jcBy = mapId(rows(readExternal('ConfigDataJobConnectionInfo.json')));
const jobBy = mapId(rows(readExternal('ConfigDataJobInfo.json')));
const levelBy = mapId(rows(readExternal('ConfigDataJobLevelInfo.json')));
const propertyBy = mapId(rows(readExternal('ConfigDataPropertyModifyInfo.json')));
const errors = [];

if (contract?.stage !== 'hero-b2-sp-bonded-producer' || contract?.status !== 'INPUTS_RESOLVED') errors.push('B2-5 contract is not INPUTS_RESOLVED');
if (b1Contract?.stage !== 'hero-b1-normal-bonded-consumer' || b1Contract?.status !== 'FROZEN') errors.push('B1 contract is not FROZEN');
if (stage54?.stage !== 'hero-page-5-4' || stage54?.status !== 'COMPLETE') errors.push('Stage5-4 SP source is not COMPLETE');
if (stage54?.summary?.canonicalHeroCount !== 267 || stage54?.summary?.spReleasedCount !== 25 || stage54?.summary?.spNotReleasedCount !== 242 || stage54?.summary?.hardErrorCount !== 0) {
  errors.push('Stage5-4 population/status drift');
}
if (manifest?.stage !== 'hero-page-6-3' || manifest?.completion !== 'COMPLETE' || manifest?.storage?.mode !== 'SHARDED_BY_HERO' || manifest?.storage?.recordCount !== 267) {
  errors.push('Hero Stage6-3 manifest is not COMPLETE SHARDED_BY_HERO/267');
}
errors.push(...verifyPropertySource(contract, propertyBy));

const stage54ByHero = new Map((stage54.records || []).map(r => [Number(r.heroId), r]));
const releasedIds = new Set((stage54.records || []).filter(r => r?.sp?.status === 'RELEASED').map(r => Number(r.heroId)));
const manifestIndex = manifest?.storage?.byHeroId || {};
if (Object.keys(manifestIndex).length !== 267) errors.push('manifest Hero locator count is not 267');
if (stage54ByHero.size !== 267) errors.push(`Stage5-4 Hero record count=${stage54ByHero.size}`);
if (releasedIds.size !== 25) errors.push(`released SP unique Hero count=${releasedIds.size}`);

const prepared = [];
let releasedGenerated = 0;
let notReleasedPollution = 0;
for (const [heroIdText, locator] of Object.entries(manifestIndex)) {
  const heroId = Number(heroIdText);
  const stage54Row = stage54ByHero.get(heroId);
  if (!stage54Row) { errors.push(`Hero ${heroId}: Stage5-4 row missing`); continue; }
  if (!locator?.path || !fs.existsSync(abs(locator.path))) { errors.push(`Hero ${heroId}: shard missing`); continue; }
  const buffer = fs.readFileSync(abs(locator.path));
  if (sha256(buffer) !== locator.sha256 || buffer.length !== locator.byteLength) { errors.push(`Hero ${heroId}: predecessor shard integrity mismatch`); continue; }
  let shard;
  try { shard = JSON.parse(buffer.toString('utf8')); } catch { errors.push(`Hero ${heroId}: invalid shard JSON`); continue; }
  if (Number(shard?.heroId) !== heroId) { errors.push(`Hero ${heroId}: shard identity mismatch`); continue; }
  const frozen = {
    normal: stable(shard.normal),
    normalBondedStats: stable(shard.normalBondedStats),
    sp: stable(shard.sp),
  };
  if (!shard.normalBondedStats || shard.normalBondedStats.status !== 'VERIFIED') { errors.push(`Hero ${heroId}: B1 normalBondedStats missing`); continue; }
  let outputShard = shard;
  if (stage54Row?.sp?.status === 'RELEASED') {
    if (shard?.sp?.status !== 'RELEASED') { errors.push(`Hero ${heroId}: shard SP status differs from Stage5-4`); continue; }
    try {
      const spBondedStats = buildSpBondedStats(stage54Row, shard, jcBy, jobBy, levelBy, propertyBy, contract);
      outputShard = { ...shard, spBondedStats };
      releasedGenerated += 1;
    } catch (error) {
      errors.push(error.message);
      continue;
    }
  } else {
    if (shard?.sp?.status !== 'NOT_RELEASED') { errors.push(`Hero ${heroId}: NOT_RELEASED shard SP status drift`); continue; }
    if (Object.prototype.hasOwnProperty.call(shard, 'spBondedStats')) notReleasedPollution += 1;
  }
  if (stable(outputShard.normal) !== frozen.normal || stable(outputShard.normalBondedStats) !== frozen.normalBondedStats || stable(outputShard.sp) !== frozen.sp) {
    errors.push(`Hero ${heroId}: frozen predecessor payload mutation detected`);
    continue;
  }
  const text = JSON.stringify(outputShard) + '\n';
  prepared.push({ heroId, path: locator.path, text, changed: text !== buffer.toString('utf8') });
}

if (releasedGenerated !== 25) errors.push(`SP generated=${releasedGenerated}, expected 25`);
if (notReleasedPollution !== 0) errors.push(`NOT_RELEASED spBondedStats pollution=${notReleasedPollution}`);
if (prepared.length !== 267) errors.push(`prepared shards=${prepared.length}, expected 267`);
const leon = prepared.find(x => x.heroId === 6);
if (!leon) errors.push('Leon output missing');
else {
  const leonShard = JSON.parse(leon.text);
  const expected = contract.regressionFixture.expectedValues;
  const actual = leonShard?.spBondedStats?.values;
  if (stable(actual) !== stable(expected)) errors.push(`Leon regression mismatch actual=${stable(actual)} expected=${stable(expected)}`);
  if (Number(leonShard?.spBondedStats?.jobConnectionId) !== 66 || Number(leonShard?.spBondedStats?.finalJobLevelId) !== 661) errors.push('Leon SP provenance mismatch');
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'FAIL', completion: 'BLOCKED', errors }, null, 2));
  process.exit(1);
}

let totalShardBytes = 0;
let changedShardCount = 0;
for (const item of prepared) {
  if (item.changed) {
    fs.writeFileSync(abs(item.path), item.text);
    changedShardCount += 1;
  }
  const finalBuffer = item.changed ? Buffer.from(item.text) : fs.readFileSync(abs(item.path));
  manifest.storage.byHeroId[String(item.heroId)] = {
    ...manifest.storage.byHeroId[String(item.heroId)],
    sha256: sha256(finalBuffer),
    byteLength: finalBuffer.length,
  };
  totalShardBytes += finalBuffer.length;
}
manifest.storage.totalShardBytes = totalShardBytes;
manifest.b2SpBondedStats = {
  status: 'VERIFIED',
  contract: P.contract,
  spReleasedCount: 25,
  spNotReleasedCount: 242,
  field: 'spBondedStats',
  masterySource: 'normal.displayStats.globalJobMastery.totals',
  reshapePropertyIds: [99, 100, 101, 102, 103, 104],
};
fs.writeFileSync(abs(P.manifest), JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  status: 'PASS',
  completion: 'MATERIALIZED',
  predecessor: contract.authoritativePredecessor.b1Commit,
  canonicalHeroCount: 267,
  spReleasedCount: 25,
  spGeneratedCount: releasedGenerated,
  notReleasedPollution,
  changedShardCount,
  frozenMutationCount: 0,
  leon: JSON.parse(leon.text).spBondedStats.values,
  totalShardBytes,
}, null, 2));
