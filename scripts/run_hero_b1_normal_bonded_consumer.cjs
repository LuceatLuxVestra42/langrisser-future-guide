'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const target = path.join(__dirname, 'build_hero_stage6_3_full_generation.cjs');
let source = fs.readFileSync(target, 'utf8');

// Preserve the current Stage 6-3 runtime admission patch before adding B1.
const sentinelBefore = "const stage52EquipmentId = Number.isInteger(Number(ex?.equipmentId)) ? Number(ex.equipmentId) : null;";
const sentinelAfter = "const stage52EquipmentId = Number.isInteger(Number(ex?.equipmentId)) && Number(ex.equipmentId) > 0 ? Number(ex.equipmentId) : null;";
if (!source.includes(sentinelBefore)) {
  throw new Error('Stage 6-3 equipment sentinel patch target is missing or already changed unexpectedly.');
}
source = source.replace(sentinelBefore, sentinelAfter);

const pathEntry = "  stageB5ByHero: 'data/generated/hero-exclusive-equipment-by-hero.v1.json',\n";
if (!source.includes(pathEntry)) throw new Error('Stage 6-3 B5 path sentinel is missing.');
source = source.replace(pathEntry, '');

const loadEntry = "const stageB5ByHero = fs.existsSync(abs(P.stageB5ByHero)) ? read(P.stageB5ByHero) : null;\n";
if (!source.includes(loadEntry)) throw new Error('Stage 6-3 B5 load sentinel is missing.');
source = source.replace(loadEntry, '');

const b5BlockStart = "let stageBState = 'B4_CANONICAL_RELATION_ADOPTED_B5_INDEX_PENDING';";
const b5BlockEnd = 'const acceptedRarity';
const b5Start = source.indexOf(b5BlockStart);
const b5End = source.indexOf(b5BlockEnd, b5Start);
if (b5Start < 0 || b5End < 0) throw new Error('Stage 6-3 B-stage boundary patch target is missing.');
source = source.slice(0, b5Start)
  + "const stageBState = 'B4_CANONICAL_RELATION_ADOPTED_B5_B6_DEFERRED_TO_6_4';\n"
  + "const stageB5ParityMismatchCount = 0;\n\n"
  + source.slice(b5End);

const noteBefore = `    ...(stageB5ByHero ? [] : [{\n      owner: 'Hero-exclusive Equipment Stage B',\n      issue: 'B-4 canonical relation is already adopted directly; the B-5 derived byHero index is not present on this branch and is not required to re-derive ownership.',\n      blockingStage63Completion: false,\n    }]),\n`;
const noteAfter = `    {\n      owner: 'Hero-exclusive Equipment Stage B',\n      issue: 'Stage 6-3 consumes the frozen B-4 canonical ownership relation only. B-5/B-6 consumer-index admission is intentionally deferred to Stage 6-4 so Stage 6-3 output stays invariant to derived-index availability.',\n      blockingStage63Completion: false,\n    },\n`;
if (!source.includes(noteBefore)) throw new Error('Stage 6-3 B-stage review-note patch target is missing.');
source = source.replace(noteBefore, noteAfter);
if (source.includes('stageB5ByHero')) throw new Error('Stage 6-3 runtime source still depends on Stage B-5 derived index availability.');

const STAT_KEYS = ['hp', 'at', 'magic', 'df', 'magicDf', 'dex'];

function decimalToFraction(value) {
  if (!Number.isFinite(value)) throw new Error('non-finite decimal input');
  const text = String(value);
  if (/e/i.test(text)) {
    const scaled = value * 10;
    if (Number.isInteger(scaled)) return { numerator: BigInt(scaled), denominator: 10n };
    throw new Error('unsupported exponential decimal input: ' + text);
  }
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const parts = unsigned.split('.');
  const scale = parts[1]?.length || 0;
  const denominator = 10n ** BigInt(scale);
  const digits = (parts[0] || '0') + (parts[1] || '');
  const numerator = BigInt((negative ? '-' : '') + digits);
  return { numerator, denominator };
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
  if (!Number.isFinite(progressionBase) || !Number.isInteger(starCorrection) || !Number.isFinite(masteryFlat)) {
    throw new Error('invalid bonded component inputs');
  }
  const fraction = decimalToFraction(progressionBase);
  const numerator = fraction.numerator * 5n * BigInt(10000 + starCorrection)
    + BigInt(masteryFlat) * fraction.denominator * 40000n;
  const denominator = fraction.denominator * 40000n;
  return roundHalfEvenFraction(numerator, denominator);
}

function buildNormalBondedStats(normal, heroId, heroErrors) {
  const connections = Array.isArray(normal?.jobTree?.connections) ? normal.jobTree.connections : [];
  const seen = new Set();
  const output = [];
  for (const connection of connections) {
    const jobConnectionId = Number(connection?.jobConnectionId);
    if (!Number.isInteger(jobConnectionId) || seen.has(jobConnectionId)) {
      heroErrors.push('normal-bonded-job-connection-invalid-or-duplicate:' + String(jobConnectionId));
      continue;
    }
    seen.add(jobConnectionId);
    const components = connection?.finalDisplayStats?.components;
    const unbonded = connection?.finalDisplayStats?.values;
    if (!components || typeof components !== 'object') {
      heroErrors.push('normal-bonded-components-missing:' + jobConnectionId);
      continue;
    }
    const values = {};
    for (const stat of STAT_KEYS) {
      try {
        const value = computeNormalBondedValue(components?.[stat]);
        if (!Number.isInteger(value) || value < 0) throw new Error('invalid generated value');
        if (Number.isFinite(unbonded?.[stat]) && value < unbonded[stat]) throw new Error('bonded value below unbonded value');
        values[stat] = value;
      } catch (error) {
        heroErrors.push('normal-bonded-' + stat + ':' + jobConnectionId + ':' + error.message);
      }
    }
    output.push({ jobConnectionId, values });
  }
  if (output.length !== connections.length) {
    heroErrors.push('normal-bonded-connection-count-mismatch:' + output.length + '/' + connections.length);
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

const helperSentinel = 'const stable = value => JSON.stringify(value);\n';
if (!source.includes(helperSentinel)) throw new Error('Stage 6-3 helper injection sentinel is missing.');
const injectedHelpers = [
  `const STAT_KEYS = ${JSON.stringify(STAT_KEYS)};`,
  decimalToFraction.toString(),
  roundHalfEvenFraction.toString(),
  computeNormalBondedValue.toString(),
  buildNormalBondedStats.toString(),
].join('\n\n') + '\n\n';
source = source.replace(helperSentinel, helperSentinel + injectedHelpers);

const recordSentinel = "  const presentation = stripKeys(hdr, ['heroId', 'identity']);\n  const normalPayload = stripKeys(normal, ['heroId', 'nameKr', 'nameCn', 'nameEn']);\n  const record = {";
const recordReplacement = "  const presentation = stripKeys(hdr, ['heroId', 'identity']);\n  const normalPayload = stripKeys(normal, ['heroId', 'nameKr', 'nameCn', 'nameEn']);\n  const normalBondedStats = buildNormalBondedStats(normal, heroId, heroErrors);\n  const record = {";
if (!source.includes(recordSentinel)) throw new Error('Stage 6-3 record injection sentinel is missing.');
source = source.replace(recordSentinel, recordReplacement);

const normalFieldSentinel = '    normal: normalPayload,\n    bonds: clone(bondRows || []),';
const normalFieldReplacement = '    normal: normalPayload,\n    normalBondedStats,\n    bonds: clone(bondRows || []),';
if (!source.includes(normalFieldSentinel)) throw new Error('Stage 6-3 normal field injection sentinel is missing.');
source = source.replace(normalFieldSentinel, normalFieldReplacement);

const runner = new Module(target, module);
runner.filename = target;
runner.paths = Module._nodeModulePaths(path.dirname(target));
runner._compile(source, target);

if (process.exitCode && process.exitCode !== 0) {
  throw new Error('Stage 6-3 materialization failed before B1 sharding.');
}

require(path.join(__dirname, 'shard_hero_stage6_3_output.cjs'));
