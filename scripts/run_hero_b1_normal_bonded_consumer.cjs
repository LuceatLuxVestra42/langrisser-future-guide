'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const P = {
  contract: 'data/contracts/hero-b1-normal-bonded-consumer.v1.json',
  stage4: 'data/generated/hero-basic-combat.v1.json',
  stage4Validation: 'data/validation/hero-basic-combat-stage4-5-summary.v1.json',
  manifest: 'data/generated/hero-detail.v1.json',
};
const STAT_KEYS = ['hp', 'at', 'magic', 'df', 'magicDf', 'dex'];

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const stable = value => JSON.stringify(value);
const stripIdentity = row => Object.fromEntries(
  Object.entries(row || {}).filter(([key]) => !['heroId', 'nameKr', 'nameCn', 'nameEn'].includes(key))
);

function decimalToFraction(value) {
  if (!Number.isFinite(value)) throw new Error('non-finite progressionBase');
  const text = String(value);
  if (/e/i.test(text)) {
    const scaled = value * 10;
    if (Number.isInteger(scaled)) return { numerator: BigInt(scaled), denominator: 10n };
    throw new Error('unsupported exponential progressionBase=' + text);
  }
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ''] = unsigned.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  const digits = (whole || '0') + fraction;
  return {
    numerator: BigInt((negative ? '-' : '') + digits),
    denominator,
  };
}

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

function computeNormalBondedValue(component) {
  const progressionBase = component?.progressionBase;
  const starCorrection = component?.starCorrection;
  const masteryFlat = component?.masteryFlat;
  if (!Number.isFinite(progressionBase)) throw new Error('progressionBase missing');
  if (!Number.isInteger(starCorrection)) throw new Error('starCorrection missing');
  if (!Number.isInteger(masteryFlat)) throw new Error('masteryFlat missing');
  const fraction = decimalToFraction(progressionBase);
  const numerator = fraction.numerator * 5n * BigInt(10000 + starCorrection)
    + BigInt(masteryFlat) * fraction.denominator * 40000n;
  const denominator = fraction.denominator * 40000n;
  return roundHalfEvenFraction(numerator, denominator);
}

function buildNormalBondedStats(stage4Row) {
  const connections = Array.isArray(stage4Row?.jobTree?.connections) ? stage4Row.jobTree.connections : [];
  const seen = new Set();
  const output = [];
  for (const connection of connections) {
    const jobConnectionId = Number(connection?.jobConnectionId);
    if (!Number.isInteger(jobConnectionId) || seen.has(jobConnectionId)) {
      throw new Error('invalid or duplicate jobConnectionId=' + String(jobConnectionId));
    }
    seen.add(jobConnectionId);
    const values = {};
    for (const stat of STAT_KEYS) {
      const value = computeNormalBondedValue(connection?.finalDisplayStats?.components?.[stat]);
      if (!Number.isInteger(value) || value < 0) throw new Error('invalid generated ' + stat + ' for connection=' + jobConnectionId);
      const unbonded = connection?.finalDisplayStats?.values?.[stat];
      if (Number.isFinite(unbonded) && value < unbonded) throw new Error('bonded below unbonded ' + stat + ' for connection=' + jobConnectionId);
      values[stat] = value;
    }
    output.push({ jobConnectionId, values });
  }
  return {
    status: 'VERIFIED',
    heroLevel: 70,
    star: 6,
    bondProfile: 'MAX',
    bondSelfMul: 2500,
    rounding: 'HALF_TO_EVEN',
    formula: 'RoundHalfToEven(progressionBase * (1 + starCorrection / 10000) * 1.25 + masteryFlat)',
    connectionKey: 'jobConnectionId',
    connections: output,
  };
}

const contract = read(P.contract);
const stage4 = read(P.stage4);
const stage4Validation = read(P.stage4Validation);
const manifest = read(P.manifest);
const errors = [];

if (contract?.stage !== 'hero-b1-normal-bonded-consumer' || contract?.status !== 'FROZEN') errors.push('B1 contract is not FROZEN');
if (stage4Validation?.status !== 'PASS' || stage4Validation?.stage4CompletionStatus !== 'COMPLETE' || (stage4Validation?.hardErrors?.length ?? 1) !== 0) {
  errors.push('Stage 4 validation is not PASS/COMPLETE');
}
if (!Array.isArray(stage4?.records) || stage4.records.length !== 267) errors.push('Stage 4 canonical Hero count is not 267');
if (manifest?.stage !== 'hero-page-6-3' || manifest?.completion !== 'COMPLETE' || manifest?.storage?.mode !== 'SHARDED_BY_HERO' || manifest?.storage?.recordCount !== 267) {
  errors.push('current Hero Stage 6-3 manifest is not COMPLETE SHARDED_BY_HERO/267');
}

const stage4ByHero = new Map();
for (const row of stage4?.records || []) {
  const heroId = Number(row?.heroId);
  if (!Number.isInteger(heroId)) errors.push('Stage 4 invalid heroId');
  else if (stage4ByHero.has(heroId)) errors.push('Stage 4 duplicate heroId=' + heroId);
  else stage4ByHero.set(heroId, row);
}
const manifestIndex = manifest?.storage?.byHeroId || {};
if (Object.keys(manifestIndex).length !== 267) errors.push('manifest Hero locator count is not 267');

const writes = [];
let normalConnectionCount = 0;
for (const [heroId, stage4Row] of [...stage4ByHero.entries()].sort((a, b) => a[0] - b[0])) {
  const locator = manifestIndex[String(heroId)];
  if (!locator?.path || !fs.existsSync(abs(locator.path))) {
    errors.push('heroId ' + heroId + ': shard missing');
    continue;
  }
  const buffer = fs.readFileSync(abs(locator.path));
  if (sha256(buffer) !== locator.sha256 || buffer.length !== locator.byteLength) {
    errors.push('heroId ' + heroId + ': predecessor shard integrity mismatch');
    continue;
  }
  let shard;
  try {
    shard = JSON.parse(buffer.toString('utf8'));
  } catch {
    errors.push('heroId ' + heroId + ': invalid shard JSON');
    continue;
  }
  if (Number(shard?.heroId) !== heroId) {
    errors.push('heroId ' + heroId + ': shard heroId mismatch');
    continue;
  }
  const expectedNormal = stripIdentity(stage4Row);
  if (stable(shard?.normal) !== stable(expectedNormal)) {
    errors.push('heroId ' + heroId + ': frozen normal payload differs from Stage 4');
    continue;
  }
  try {
    const normalBondedStats = buildNormalBondedStats(stage4Row);
    normalConnectionCount += normalBondedStats.connections.length;
    const outputShard = { ...shard, normalBondedStats };
    const text = JSON.stringify(outputShard) + '\n';
    writes.push({ heroId, path: locator.path, text, sha256: sha256(Buffer.from(text)), byteLength: Buffer.byteLength(text) });
  } catch (error) {
    errors.push('heroId ' + heroId + ': ' + error.message);
  }
}

if (writes.length !== 267) errors.push('prepared shard count=' + writes.length + ', expected 267');
if (errors.length) {
  console.error(JSON.stringify({ status: 'FAIL', completion: 'BLOCKED', errors }, null, 2));
  process.exit(1);
}

let totalShardBytes = 0;
for (const item of writes) {
  fs.writeFileSync(abs(item.path), item.text);
  manifest.storage.byHeroId[String(item.heroId)] = {
    ...manifest.storage.byHeroId[String(item.heroId)],
    sha256: item.sha256,
    byteLength: item.byteLength,
  };
  totalShardBytes += item.byteLength;
}
manifest.storage.totalShardBytes = totalShardBytes;
manifest.b1NormalBondedStats = {
  status: 'VERIFIED',
  contract: P.contract,
  heroCount: 267,
  normalConnectionCount,
  field: 'normalBondedStats',
};
fs.writeFileSync(abs(P.manifest), JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  status: 'PASS',
  completion: 'MATERIALIZED',
  predecessor: 'current COMPLETE/FROZEN Hero Stage 6-3 shards',
  heroCount: writes.length,
  normalConnectionCount,
  totalShardBytes,
}, null, 2));
