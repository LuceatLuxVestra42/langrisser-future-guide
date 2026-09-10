'use strict';

const assert = require('assert');
const {
  CENTRAL_BOND_RATE,
  parseHeartFetterLv10Flat,
  assertCentralBondPercentSkill,
  computeCentralBondPercentDelta,
  applyCentralBondToLegacy,
} = require('./lib/hero-central-bond-stat-effect.cjs');

const PERCENT_DESC = '英雄全属性<color=#DC143C>+5%</color>。';
assert.strictEqual(assertCentralBondPercentSkill(PERCENT_DESC), 0.05);
assert.strictEqual(CENTRAL_BOND_RATE, 0.05);

const sourceDerivedFixtures = [
  {
    heroId: 1,
    nameCn: '马修',
    flatDesc: '英雄的生命<color=#DC143C>+750</color>，防御<color=#DC143C>+50</color>，魔防<color=#DC143C>+50</color>。',
    expectedFlat: { hp: 750, df: 50, magicDf: 50 },
    inputs: {
      hp:{ini:779,up:120,starCorrection:6873}, at:{ini:100,up:16,starCorrection:8192}, magic:{ini:58,up:9,starCorrection:5554},
      df:{ini:57,up:9,starCorrection:6610}, magicDf:{ini:38,up:6,starCorrection:10828}, dex:{ini:75,up:0,starCorrection:7137},
    },
    expectedPercentDeltas: { hp:136, at:19, magic:9, df:10, magicDf:8, dex:6 },
  },
  {
    heroId: 3,
    nameCn: '格尼尔',
    flatDesc: '英雄的生命<color=#DC143C>+900</color>，防御<color=#DC143C>+60</color>，魔防<color=#DC143C>+30</color>。',
    expectedFlat: { hp: 900, df: 60, magicDf: 30 },
    inputs: {
      hp:{ini:649,up:100,starCorrection:9266}, at:{ini:95,up:15,starCorrection:7380}, magic:{ini:63,up:10,starCorrection:4550},
      df:{ini:48,up:8,starCorrection:10210}, magicDf:{ini:57,up:9,starCorrection:6706}, dex:{ini:87,up:0,starCorrection:5898},
    },
    expectedPercentDeltas: { hp:129, at:17, magic:10, df:10, magicDf:10, dex:7 },
  },
  {
    heroId: 4,
    nameCn: '艾梅达',
    flatDesc: '英雄的生命<color=#DC143C>+500</color>，防御<color=#DC143C>+20</color>，魔防<color=#DC143C>+60</color>。',
    expectedFlat: { hp: 500, df: 20, magicDf: 60 },
    inputs: {
      hp:{ini:649,up:100,starCorrection:7380}, at:{ini:63,up:10,starCorrection:5088}, magic:{ini:95,up:15,starCorrection:8594},
      df:{ini:42,up:7,starCorrection:9537}, magicDf:{ini:64,up:10,starCorrection:6975}, dex:{ini:56,up:0,starCorrection:5224},
    },
    expectedPercentDeltas: { hp:116, at:10, magic:18, df:9, magicDf:11, dex:4 },
  },
  {
    heroId: 7,
    nameCn: '巴恩哈特',
    flatDesc: '英雄的生命<color=#DC143C>+850</color>，防御<color=#DC143C>+60</color>，魔防<color=#DC143C>+50</color>。',
    expectedFlat: { hp: 850, df: 60, magicDf: 50 },
    inputs: {
      hp:{ini:716,up:110,starCorrection:9377}, at:{ini:100,up:16,starCorrection:8718}, magic:{ini:63,up:10,starCorrection:5158},
      df:{ini:57,up:9,starCorrection:7531}, magicDf:{ini:48,up:8,starCorrection:7137}, dex:{ini:67,up:0,starCorrection:4895},
    },
    expectedPercentDeltas: { hp:143, at:20, magic:10, df:10, magicDf:9, dex:5 },
  },
];

for (const fixture of sourceDerivedFixtures) {
  assert.deepStrictEqual(parseHeartFetterLv10Flat(fixture.flatDesc), fixture.expectedFlat, `flat parse hero ${fixture.heroId}`);
  const actual = Object.fromEntries(Object.entries(fixture.inputs).map(([stat,input]) => [stat, computeCentralBondPercentDelta(input)]));
  assert.deepStrictEqual(actual, fixture.expectedPercentDeltas, `5% delta hero ${fixture.heroId}`);
}

const leonFlat = parseHeartFetterLv10Flat('英雄的生命<color=#DC143C>+750</color>，防御<color=#DC143C>+30</color>，魔防<color=#DC143C>+40</color>。');
const leon = applyCentralBondToLegacy({
  legacyValues: { hp:4041, at:602, magic:224, df:260, magicDf:231, dex:125 },
  statInputs: {
    hp:{ini:716,up:110,starCorrection:8718}, at:{ini:100,up:16,starCorrection:10103}, magic:{ini:58,up:9,starCorrection:4895},
    df:{ini:53,up:8,starCorrection:7796}, magicDf:{ini:48,up:8,starCorrection:7137}, dex:{ini:56,up:0,starCorrection:7137},
  },
  flat: leonFlat,
});
assert.deepStrictEqual(leon.percentDeltas, { hp:138, at:21, magic:9, df:10, magicDf:9, dex:5 });
assert.deepStrictEqual(leon.values, { hp:4929, at:623, magic:233, df:300, magicDf:280, dex:130 });

const leonDfRaw = (53 + 8 * 69 / 10) * (1 + 7796 / 10000);
const combinedDelta = Math.round(leonDfRaw * 1.30) - Math.round(leonDfRaw * 1.25);
assert.strictEqual(combinedDelta, 9, 'combined 30%-25% discriminator must remain 9');
assert.strictEqual(computeCentralBondPercentDelta({ini:53,up:8,starCorrection:7796}), 10, 'separate 5% rounding must remain 10');

assert.throws(() => parseHeartFetterLv10Flat('英雄全属性+5%。'), /unsupported HeartFetter/);
assert.throws(() => assertCentralBondPercentSkill('英雄全属性+10%。'), /unsupported HeartFetter/);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'HERO_CENTRAL_BOND_STAT_EFFECT_STAGE5',
  sourceDerivedFixtureCount: sourceDerivedFixtures.length,
  leonExactParity: true,
  leonTarget: leon.values,
  separateFivePercentRounding: true,
}, null, 2));
