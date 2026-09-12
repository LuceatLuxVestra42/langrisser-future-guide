'use strict';

const assert = require('assert');
const { composeLegacyStat, composeLegacyValues } = require('./hero-stage5-legacy-stat-composer.cjs');

const leon = composeLegacyValues({
  statInputs: {
    hp: { ini: 716, up: 110, starCorrection: 8718 },
    at: { ini: 100, up: 16, starCorrection: 10103 },
    magic: { ini: 58, up: 9, starCorrection: 4895 },
    df: { ini: 53, up: 8, starCorrection: 7796 },
    magicDf: { ini: 48, up: 8, starCorrection: 7137 },
    dex: { ini: 56, up: 0, starCorrection: 7137 },
  },
  masteryFlats: { hp: 452, at: 73, magic: 0, df: 10, magicDf: 10, dex: 5 },
  normalBondRate: 0.25,
  spBonusRates: { hp: 0.05, df: 0.05 },
});

assert.deepStrictEqual(leon.values, {
  hp: 4041,
  at: 602,
  magic: 224,
  df: 260,
  magicDf: 231,
  dex: 125,
});

const leonDf = composeLegacyStat({
  input: { ini: 53, up: 8, starCorrection: 7796 },
  masteryFlat: 10,
  normalBondRate: 0.25,
  spBonusRate: 0.05,
});
const incorrectlySplitSpBonus = Math.round(leonDf.starAdjustedRaw * 1.25)
  + Math.round(leonDf.starAdjustedRaw * 0.05)
  + 10;
assert.strictEqual(leonDf.percentAdjusted, 250);
assert.strictEqual(leonDf.value, 260);
assert.strictEqual(incorrectlySplitSpBonus, 261);
assert.notStrictEqual(incorrectlySplitSpBonus, leonDf.value);

assert.throws(() => composeLegacyStat({
  input: { ini: 1, up: 1, starCorrection: 0 },
  masteryFlat: 0,
  normalBondRate: 0.25,
  spBonusRate: -0.01,
}), /out of range/);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'HERO_STAGE5_LEGACY_STAT_COMPOSER',
  leonExactParity: true,
  leonLegacyValues: leon.values,
  combinedNormalAndSpPercentRounding: true,
  centralBondIncluded: false,
}, null, 2));
