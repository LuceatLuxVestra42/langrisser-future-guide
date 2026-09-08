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
  output: 'data/validation/hero-b1-normal-bonded-consumer.v1.json',
};
const STAT_KEYS = ['hp', 'at', 'magic', 'df', 'magicDf', 'dex'];
const LEON_EXPECTED = { hp: 3806, at: 569, magic: 224, df: 242, magicDf: 231, dex: 125 };

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const write = (rel, value) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + '\n');
};
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

function decimalFraction(value) {
  if (!Number.isFinite(value)) throw new Error('non-finite progressionBase');
  const text = String(value);
  if (/e/i.test(text)) {
    const scaled = value * 10;
    if (Number.isInteger(scaled)) return [BigInt(scaled), 10n];
    throw new Error('unsupported exponential progressionBase=' + text);
  }
  const sign = text.startsWith('-') ? -1n : 1n;
  const unsigned = text.startsWith('-') ? text.slice(1) : text;
  const [whole, fraction = ''] = unsigned.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  return [sign * BigInt((whole || '0') + fraction), denominator];
}

function bankerRound(numerator, denominator) {
  if (denominator <= 0n) throw new Error('invalid denominator');
  const sign = numerator < 0n ? -1n : 1n;
  const n = numerator < 0n ? -numerator : numerator;
  const q = n / denominator;
  const r = n % denominator;
  const doubled = r * 2n;
  const increment = doubled > denominator || (doubled === denominator && q % 2n === 1n);
  return Number(sign * (q + (increment ? 1n : 0n)));
}

function expectedValue(component) {
  if (!component || !Number.isFinite(component.progressionBase)) throw new Error('progressionBase missing');
  if (!Number.isInteger(component.starCorrection)) throw new Error('starCorrection missing');
  if (!Number.isInteger(component.masteryFlat)) throw new Error('masteryFlat missing');
  const [baseNumerator, baseDenominator] = decimalFraction(component.progressionBase);
  const numerator = baseNumerator * BigInt(10000 + component.starCorrection) * 5n
    + BigInt(component.masteryFlat) * baseDenominator * 40000n;
  const denominator = baseDenominator * 40000n;
  return bankerRound(numerator, denominator);
}

function sameValues(a, b) {
  return STAT_KEYS.every(key => Number(a?.[key]) === Number(b?.[key]));
}

const contract = read(P.contract);
const stage4 = read(P.stage4);
const stage4Validation = read(P.stage4Validation);
const manifest = read(P.manifest);
const hardErrors = [];
const checks = [];
const failedHeroes = [];

function check(name, pass, detail = null) {
  const row = { name, pass: Boolean(pass) };
  if (detail !== null) row.detail = detail;
  checks.push(row);
  if (!row.pass) hardErrors.push(name + (detail ? ': ' + detail : ''));
}

check('contract-frozen', contract?.stage === 'hero-b1-normal-bonded-consumer' && contract?.status === 'FROZEN');
check('stage4-complete', stage4Validation?.status === 'PASS' && stage4Validation?.stage4CompletionStatus === 'COMPLETE' && (stage4Validation?.hardErrors?.length ?? 1) === 0);
check('stage4-canonical-267', Array.isArray(stage4?.records) && stage4.records.length === 267, 'count=' + (stage4?.records?.length ?? null));
check('manifest-sharded-267', manifest?.storage?.mode === 'SHARDED_BY_HERO' && manifest?.storage?.recordCount === 267, String(manifest?.storage?.mode) + '/' + String(manifest?.storage?.recordCount));

const stage4ByHero = new Map();
for (const row of stage4?.records || []) {
  const heroId = Number(row?.heroId);
  if (!Number.isInteger(heroId)) {
    hardErrors.push('Stage4 invalid heroId');
    continue;
  }
  if (stage4ByHero.has(heroId)) hardErrors.push('Stage4 duplicate heroId=' + heroId);
  else stage4ByHero.set(heroId, row);
}

const manifestIndex = manifest?.storage?.byHeroId || {};
let heroShardCount = 0;
let normalConnectionCount = 0;
let generatedConnectionCount = 0;
let connectionParityMismatchCount = 0;
let formulaMismatchCount = 0;
let nonIntegerOrNegativeCount = 0;
let bondedBelowUnbondedCount = 0;
let metadataMismatchCount = 0;
let shardIntegrityMismatchCount = 0;
let leonRegressionMatchCount = 0;

for (const [heroId, stage4Row] of [...stage4ByHero.entries()].sort((a, b) => a[0] - b[0])) {
  const failures = [];
  const locator = manifestIndex[String(heroId)];
  if (!locator?.path || !fs.existsSync(abs(locator.path))) {
    failures.push('SHARD_MISSING');
    failedHeroes.push({ heroId, failures });
    continue;
  }
  const buffer = fs.readFileSync(abs(locator.path));
  heroShardCount += 1;
  if (sha256(buffer) !== locator.sha256 || buffer.length !== locator.byteLength) {
    shardIntegrityMismatchCount += 1;
    failures.push('SHARD_INTEGRITY');
  }
  const shard = JSON.parse(buffer.toString('utf8'));
  if (Number(shard?.heroId) !== heroId) failures.push('HERO_ID_MISMATCH');

  const block = shard?.normalBondedStats;
  if (!block || block.status !== 'VERIFIED' || block.heroLevel !== 70 || block.star !== 6 || block.bondProfile !== 'MAX' || block.bondSelfMul !== 2500 || block.rounding !== 'HALF_TO_EVEN') {
    metadataMismatchCount += 1;
    failures.push('B1_METADATA');
  }

  const sourceConnections = Array.isArray(stage4Row?.jobTree?.connections) ? stage4Row.jobTree.connections : [];
  const generatedConnections = Array.isArray(block?.connections) ? block.connections : [];
  normalConnectionCount += sourceConnections.length;
  generatedConnectionCount += generatedConnections.length;

  const sourceIds = sourceConnections.map(x => Number(x?.jobConnectionId));
  const generatedIds = generatedConnections.map(x => Number(x?.jobConnectionId));
  const sourceUnique = new Set(sourceIds);
  const generatedUnique = new Set(generatedIds);
  const parity = sourceIds.length === sourceUnique.size
    && generatedIds.length === generatedUnique.size
    && sourceIds.length === generatedIds.length
    && sourceIds.every(id => generatedUnique.has(id));
  if (!parity) {
    connectionParityMismatchCount += 1;
    failures.push('CONNECTION_PARITY');
  }

  const generatedById = new Map(generatedConnections.map(x => [Number(x?.jobConnectionId), x]));
  for (const connection of sourceConnections) {
    const connectionId = Number(connection?.jobConnectionId);
    const generated = generatedById.get(connectionId);
    if (!generated) continue;
    const expected = {};
    for (const stat of STAT_KEYS) {
      let value;
      try {
        value = expectedValue(connection?.finalDisplayStats?.components?.[stat]);
      } catch (error) {
        formulaMismatchCount += 1;
        failures.push('SOURCE_COMPONENT_' + connectionId + '_' + stat + '_' + error.message);
        continue;
      }
      expected[stat] = value;
      const actual = generated?.values?.[stat];
      if (!Number.isInteger(actual) || actual < 0) {
        nonIntegerOrNegativeCount += 1;
        failures.push('INVALID_VALUE_' + connectionId + '_' + stat);
      }
      if (actual !== value) {
        formulaMismatchCount += 1;
        failures.push('FORMULA_' + connectionId + '_' + stat + '_expected=' + value + '_actual=' + actual);
      }
      const unbonded = connection?.finalDisplayStats?.values?.[stat];
      if (Number.isFinite(unbonded) && actual < unbonded) {
        bondedBelowUnbondedCount += 1;
        failures.push('BELOW_UNBONDED_' + connectionId + '_' + stat);
      }
    }
    if (heroId === 6 && sameValues(expected, LEON_EXPECTED) && sameValues(generated.values, LEON_EXPECTED)) {
      leonRegressionMatchCount += 1;
    }
  }

  if (failures.length) failedHeroes.push({ heroId, failures: [...new Set(failures)] });
}

check('all-267-shards-present', heroShardCount === 267, 'actual=' + heroShardCount);
check('shard-integrity', shardIntegrityMismatchCount === 0, 'mismatch=' + shardIntegrityMismatchCount);
check('normal-connection-count-parity', normalConnectionCount === generatedConnectionCount && connectionParityMismatchCount === 0,
  'source=' + normalConnectionCount + ', generated=' + generatedConnectionCount + ', heroMismatch=' + connectionParityMismatchCount);
check('metadata-exact', metadataMismatchCount === 0, 'mismatch=' + metadataMismatchCount);
check('formula-exact', formulaMismatchCount === 0, 'mismatch=' + formulaMismatchCount);
check('all-values-nonnegative-integer', nonIntegerOrNegativeCount === 0, 'invalid=' + nonIntegerOrNegativeCount);
check('bonded-not-below-unbonded', bondedBelowUnbondedCount === 0, 'violations=' + bondedBelowUnbondedCount);
check('leon-frozen-royal-knight-regression', leonRegressionMatchCount === 1, 'matches=' + leonRegressionMatchCount);

const uniqueHardErrors = [...new Set(hardErrors)];
const status = uniqueHardErrors.length === 0 ? 'PASS' : 'FAIL';
const completion = uniqueHardErrors.length === 0 ? 'COMPLETE' : 'BLOCKED';
const output = {
  version: 1,
  stage: 'hero-b1-normal-bonded-consumer',
  status,
  completion,
  contract: P.contract,
  summary: {
    canonicalHeroCount: stage4ByHero.size,
    heroShardCount,
    normalConnectionCount,
    generatedConnectionCount,
    connectionParityMismatchCount,
    formulaMismatchCount,
    nonIntegerOrNegativeCount,
    bondedBelowUnbondedCount,
    metadataMismatchCount,
    shardIntegrityMismatchCount,
    leonRegressionMatchCount,
    failedHeroCount: failedHeroes.length,
    hardErrorCount: uniqueHardErrors.length
  },
  checks,
  failedHeroes,
  hardErrors: uniqueHardErrors,
  decision: uniqueHardErrors.length === 0
    ? 'B1 Normal bonded generated consumer PASS. All 267 Hero shards and all normal JobConnections match the frozen formula and Leon regression fixture.'
    : 'B1 Normal bonded generated consumer FAIL. Do not admit to production until hard errors are resolved.'
};
write(P.output, output);
console.log(JSON.stringify({ status, completion, summary: output.summary, hardErrors: uniqueHardErrors }, null, 2));
if (uniqueHardErrors.length) process.exitCode = 1;
