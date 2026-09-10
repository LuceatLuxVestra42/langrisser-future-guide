'use strict';

const STAT_KEYS = Object.freeze(['hp', 'at', 'magic', 'df', 'magicDf', 'dex']);
const CENTRAL_BOND_RATE = 0.05;

function assertFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function stripConfigMarkup(value) {
  if (typeof value !== 'string') throw new TypeError('description must be a string');
  return value.replace(/<[^>]+>/g, '');
}

function parseHeartFetterLv10Flat(description) {
  const normalized = stripConfigMarkup(description).trim();
  const match = /^英雄的生命\+(\d+)，防御\+(\d+)，魔防\+(\d+)。$/.exec(normalized);
  if (!match) {
    throw new Error(`unsupported HeartFetter Lv10 flat description: ${normalized}`);
  }
  return Object.freeze({
    hp: Number(match[1]),
    df: Number(match[2]),
    magicDf: Number(match[3]),
  });
}

function assertCentralBondPercentSkill(description) {
  const normalized = stripConfigMarkup(description).trim();
  if (normalized !== '英雄全属性+5%。') {
    throw new Error(`unsupported HeartFetter Lv10 percent description: ${normalized}`);
  }
  return CENTRAL_BOND_RATE;
}

function computeStarAdjustedRaw(input) {
  if (!input || typeof input !== 'object') throw new TypeError('stat input must be an object');
  const ini = assertFiniteNumber(input.ini, 'ini');
  const up = assertFiniteNumber(input.up, 'up');
  const starCorrection = assertFiniteNumber(input.starCorrection, 'starCorrection');
  const heroLevel = input.heroLevel == null ? 70 : assertFiniteNumber(input.heroLevel, 'heroLevel');
  if (!Number.isInteger(heroLevel) || heroLevel < 1) throw new RangeError('heroLevel must be a positive integer');
  return (ini + up * (heroLevel - 1) / 10) * (1 + starCorrection / 10000);
}

function computeCentralBondPercentDelta(input) {
  return Math.round(computeStarAdjustedRaw(input) * CENTRAL_BOND_RATE);
}

function applyCentralBondToLegacy({ legacyValues, statInputs, flat }) {
  if (!legacyValues || typeof legacyValues !== 'object') throw new TypeError('legacyValues must be an object');
  if (!statInputs || typeof statInputs !== 'object') throw new TypeError('statInputs must be an object');
  if (!flat || typeof flat !== 'object') throw new TypeError('flat must be an object');

  const values = {};
  const percentDeltas = {};
  for (const stat of STAT_KEYS) {
    const legacy = assertFiniteNumber(legacyValues[stat], `legacyValues.${stat}`);
    const percentDelta = computeCentralBondPercentDelta(statInputs[stat]);
    const flatDelta = stat === 'hp' || stat === 'df' || stat === 'magicDf'
      ? assertFiniteNumber(flat[stat], `flat.${stat}`)
      : 0;
    percentDeltas[stat] = percentDelta;
    values[stat] = legacy + percentDelta + flatDelta;
  }

  return Object.freeze({
    rate: CENTRAL_BOND_RATE,
    percentDeltas: Object.freeze(percentDeltas),
    flat: Object.freeze({ hp: flat.hp, df: flat.df, magicDf: flat.magicDf }),
    values: Object.freeze(values),
  });
}

module.exports = {
  STAT_KEYS,
  CENTRAL_BOND_RATE,
  stripConfigMarkup,
  parseHeartFetterLv10Flat,
  assertCentralBondPercentSkill,
  computeStarAdjustedRaw,
  computeCentralBondPercentDelta,
  applyCentralBondToLegacy,
};
