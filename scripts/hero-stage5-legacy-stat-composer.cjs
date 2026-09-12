'use strict';

const STAT_KEYS = Object.freeze(['hp', 'at', 'magic', 'df', 'magicDf', 'dex']);
const HERO_LEVEL = 70;

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return Number(value);
}

function rate(value, label) {
  const n = finiteNumber(value, label);
  if (n < 0 || n > 1) throw new Error(`${label} out of range`);
  return n;
}

function computeStarAdjustedRaw(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('stat input must be an object');
  const ini = finiteNumber(input.ini, 'ini');
  const up = finiteNumber(input.up, 'up');
  const starCorrection = finiteNumber(input.starCorrection, 'starCorrection');
  return (ini + up * (HERO_LEVEL - 1) / 10) * (1 + starCorrection / 10000);
}

function composeLegacyStat({ input, masteryFlat, normalBondRate, spBonusRate = 0 }) {
  const starAdjustedRaw = computeStarAdjustedRaw(input);
  const normalRate = rate(normalBondRate, 'normalBondRate');
  const spRate = rate(spBonusRate, 'spBonusRate');
  const flat = finiteNumber(masteryFlat, 'masteryFlat');
  const percentMultiplier = 1 + normalRate + spRate;
  const percentAdjusted = Math.round(starAdjustedRaw * percentMultiplier);
  const value = percentAdjusted + flat;
  if (!Number.isInteger(value) || value < 0) throw new Error(`invalid legacy stat ${value}`);
  return {
    value,
    starAdjustedRaw,
    normalBondRate: normalRate,
    spBonusRate: spRate,
    percentMultiplier,
    percentAdjusted,
    masteryFlat: flat,
  };
}

function composeLegacyValues({ statInputs, masteryFlats, normalBondRate, spBonusRates = {} }) {
  const values = {};
  const components = {};
  for (const stat of STAT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(statInputs || {}, stat)) throw new Error(`missing statInputs.${stat}`);
    if (!Object.prototype.hasOwnProperty.call(masteryFlats || {}, stat)) throw new Error(`missing masteryFlats.${stat}`);
    const result = composeLegacyStat({
      input: statInputs[stat],
      masteryFlat: masteryFlats[stat],
      normalBondRate,
      spBonusRate: spBonusRates?.[stat] ?? 0,
    });
    values[stat] = result.value;
    components[stat] = result;
  }
  return { values, components };
}

module.exports = {
  STAT_KEYS,
  HERO_LEVEL,
  computeStarAdjustedRaw,
  composeLegacyStat,
  composeLegacyValues,
};
