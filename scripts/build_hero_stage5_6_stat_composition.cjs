'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');
const { STAT_KEYS, composeLegacyStat } = require('./hero-stage5-legacy-stat-composer.cjs');
const {
  CENTRAL_BOND_RATE,
  parseHeartFetterLv10Flat,
  assertCentralBondPercentSkill,
  applyCentralBondToLegacy,
} = require('./hero-central-bond-stat-effect.cjs');

const ROOT = path.resolve(__dirname, '..');
const GENERATED = path.join(ROOT, 'data', 'generated');
const OUTPUT_PATH = path.join(GENERATED, 'hero-page-stage5-6-stat-composition.v1.json');
const STAGE4_PATH = path.join(GENERATED, 'hero-basic-combat.v1.json');
const STAGE51_PATH = path.join(GENERATED, 'hero-page-stage5-1-bonds-final.v1.json');
const STAGE54_PATH = path.join(GENERATED, 'hero-page-stage5-4-sp.v1.json');

const HERO_PROPERTY_TO_STAT = Object.freeze({
  99: 'hp',
  100: 'at',
  101: 'df',
  102: 'magic',
  103: 'magicDf',
  104: 'dex',
});
const SP_STAR_FIELD = Object.freeze({
  hp: 'HPStar', at: 'ATStar', magic: 'MagicStar', df: 'DFStar', magicDf: 'MagicDFStar', dex: 'DEXStar',
});
const JOB_LEVEL_FIELD = Object.freeze({
  hp: ['HP_INI', 'HP_UP'], at: ['AT_INI', 'AT_UP'], magic: ['Magic_INI', 'Magic_UP'],
  df: ['DF_INI', 'DF_UP'], magicDf: ['MagicDF_INI', 'MagicDF_UP'], dex: ['DEX_INI', 'DEX_UP'],
});

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function indexBy(rows, key, label) {
  const out = new Map();
  for (const row of rows) {
    const id = Number(row?.[key]);
    if (!Number.isInteger(id)) continue;
    if (out.has(id)) throw new Error(`${label}: duplicate ${key}=${id}`);
    out.set(id, row);
  }
  return out;
}
function finite(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be finite`);
  return n;
}
function collectGotSkillIds(value, out = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) collectGotSkillIds(item, out);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'gotSkillId' && Number.isInteger(Number(child)) && Number(child) > 0) out.add(Number(child));
    collectGotSkillIds(child, out);
  }
  return out;
}
function zeroRates() { return Object.fromEntries(STAT_KEYS.map((stat) => [stat, 0])); }
function resolveHeroPropertyRates(skillIds, skillById, buffById, label) {
  const rawByStat = zeroRates();
  const evidence = [];
  for (const skillId of [...skillIds].sort((a, b) => a - b)) {
    const skill = skillById.get(skillId);
    if (!skill) throw new Error(`${label}: missing SkillInfo ${skillId}`);
    const buffIds = Array.isArray(skill.PassiveBuffs_ID) ? skill.PassiveBuffs_ID.map(Number).filter(Number.isInteger) : [];
    for (const buffId of buffIds) {
      const buff = buffById.get(buffId);
      if (!buff) throw new Error(`${label}: Skill ${skillId} missing BuffInfo ${buffId}`);
      const effects = [];
      for (let i = 1; i <= 4; i += 1) {
        const propertyId = Number(buff[`Property${i}_ID`]);
        const rawValue = Number(buff[`Property${i}_Value`]);
        const stat = HERO_PROPERTY_TO_STAT[propertyId];
        if (!stat || !Number.isFinite(rawValue) || rawValue === 0) continue;
        rawByStat[stat] += rawValue;
        effects.push({ propertyId, stat, rawValue });
      }
      if (effects.length) evidence.push({ skillId, buffId, effects });
    }
  }
  const rates = Object.fromEntries(STAT_KEYS.map((stat) => [stat, rawByStat[stat] / 10000]));
  for (const [stat, rate] of Object.entries(rates)) {
    if (rate < 0 || rate > 1) throw new Error(`${label}: ${stat} rate out of range ${rate}`);
  }
  return { rates, rawByStat, evidence };
}
function resolveSpBonusRates(spRecord, label) {
  const rawByStat = zeroRates();
  const properties = spRecord?.sp?.secondStageRewards?.buff?.properties || [];
  for (const effect of properties) {
    const propertyId = Number(effect?.propertyId);
    const rawValue = Number(effect?.value);
    const stat = HERO_PROPERTY_TO_STAT[propertyId];
    if (!stat || !Number.isFinite(rawValue) || rawValue === 0) continue;
    rawByStat[stat] += rawValue;
  }
  const rates = Object.fromEntries(STAT_KEYS.map((stat) => [stat, rawByStat[stat] / 10000]));
  for (const [stat, rate] of Object.entries(rates)) {
    if (rate < 0 || rate > 1) throw new Error(`${label}: SP ${stat} rate out of range ${rate}`);
  }
  return { rates, rawByStat, properties };
}
function statInputsFromStage4(finalDisplayStats, label) {
  const out = {};
  for (const stat of STAT_KEYS) {
    const c = finalDisplayStats?.components?.[stat];
    if (!c) throw new Error(`${label}: missing Stage4 components.${stat}`);
    out[stat] = {
      ini: finite(c.ini, `${label}.${stat}.ini`),
      up: finite(c.up, `${label}.${stat}.up`),
      starCorrection: finite(c.starCorrection, `${label}.${stat}.starCorrection`),
      heroLevel: finite(c.heroLevel ?? 70, `${label}.${stat}.heroLevel`),
    };
  }
  return out;
}
function masteryFlatsFromStage4(stage4Record, label) {
  const connections = stage4Record?.jobTree?.connections || [];
  if (!connections.length) throw new Error(`${label}: Stage4 connections empty`);
  const out = {};
  for (const stat of STAT_KEYS) {
    const values = connections.map((c) => c?.finalDisplayStats?.components?.[stat]?.masteryFlat).filter(Number.isFinite);
    if (!values.length) throw new Error(`${label}: no masteryFlat for ${stat}`);
    if (new Set(values).size !== 1) throw new Error(`${label}: masteryFlat ${stat} differs across jobs`);
    out[stat] = Number(values[0]);
  }
  return out;
}
function composeWithRates({ statInputs, masteryFlats, normalBondRates, spBonusRates = zeroRates(), central }) {
  const legacyValues = {};
  const legacyComponents = {};
  for (const stat of STAT_KEYS) {
    const result = composeLegacyStat({
      input: statInputs[stat],
      masteryFlat: masteryFlats[stat],
      normalBondRate: normalBondRates[stat] || 0,
      spBonusRate: spBonusRates[stat] || 0,
    });
    legacyValues[stat] = result.value;
    legacyComponents[stat] = result;
  }
  const withCentral = applyCentralBondToLegacy({ legacyValues, statInputs, flat: central.flat });
  return {
    values: { ...withCentral.values },
    components: {
      legacy: legacyComponents,
      centralBond: {
        rate: withCentral.rate,
        percentDeltas: { ...withCentral.percentDeltas },
        flat: { ...withCentral.flat },
      },
    },
  };
}
function selectFinalJobLevel(connection, jobLevelById, label) {
  const ids = Array.isArray(connection?.JobLevels_ID) ? connection.JobLevels_ID.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) throw new Error(`${label}: JobLevels_ID empty`);
  const rows = ids.map((id) => {
    const row = jobLevelById.get(id);
    if (!row) throw new Error(`${label}: missing JobLevelInfo ${id}`);
    return row;
  });
  rows.sort((a, b) => finite(a.JobLevelUpHeroLevel ?? 0, `${label}.level`) - finite(b.JobLevelUpHeroLevel ?? 0, `${label}.level`) || Number(a.ID) - Number(b.ID));
  return rows[rows.length - 1];
}
function spStatInputs(spRecord, connectionById, jobLevelById, label) {
  const connectionId = Number(spRecord?.sp?.job?.jobConnectionId);
  const connection = connectionById.get(connectionId);
  if (!connection) throw new Error(`${label}: missing SP JobConnection ${connectionId}`);
  const level = selectFinalJobLevel(connection, jobLevelById, label);
  const out = {};
  for (const stat of STAT_KEYS) {
    const [iniField, upField] = JOB_LEVEL_FIELD[stat];
    const stars = spRecord?.sp?.stats?.[SP_STAR_FIELD[stat]];
    if (!Array.isArray(stars) || stars.length !== 6) throw new Error(`${label}: ${SP_STAR_FIELD[stat]} expected 6 values`);
    out[stat] = {
      ini: finite(level[iniField], `${label}.${iniField}`),
      up: finite(level[upField], `${label}.${upField}`),
      starCorrection: finite(stars[5], `${label}.${SP_STAR_FIELD[stat]}[5]`),
      heroLevel: 70,
    };
  }
  return { jobLevelId: Number(level.ID), statInputs: out };
}
function resolveCentral(heroId, heroById, informationById, heartById, skillById) {
  const hero = heroById.get(heroId);
  if (!hero) throw new Error(`Hero ${heroId}: missing HeroInfo`);
  const informationId = Number(hero.HeroInformation_ID);
  const information = informationById.get(informationId);
  if (!information) throw new Error(`Hero ${heroId}: missing HeroInformationInfo ${informationId}`);
  const heartId = Number(information.HeroHeartFetterId);
  const heart = heartById.get(heartId);
  if (!heart) throw new Error(`Hero ${heroId}: missing HeroHeartFetterInfo ${heartId}`);
  if (Number(heart.MaxLevel) !== 10 || !Array.isArray(heart.HeroHeartFetterSkills) || heart.HeroHeartFetterSkills.length < 10) {
    throw new Error(`Hero ${heroId}: HeartFetter ${heartId} is not a 10-level source`);
  }
  const flatSkillId = Number(heart.HeroHeartFetterSkills[9]);
  const flatSkill = skillById.get(flatSkillId);
  if (!flatSkill) throw new Error(`Hero ${heroId}: missing HeartFetter flat Skill ${flatSkillId}`);
  const flat = parseHeartFetterLv10Flat(flatSkill.Desc);
  const level10Unlocks = (heart.UnlockSkills_ID || []).filter((x) => Number(x?.HeartFetterLevel) === 10);
  const validPercent = [];
  for (const unlock of level10Unlocks) {
    const skillId = Number(unlock?.SkillId);
    const skill = skillById.get(skillId);
    if (!skill) continue;
    try {
      assertCentralBondPercentSkill(skill.Desc);
      validPercent.push(skillId);
    } catch (_) {}
  }
  if (validPercent.length !== 1) throw new Error(`Hero ${heroId}: expected one Lv10 all-stat +5% skill, got ${validPercent.join(',')}`);
  return {
    heartFetterId: heartId,
    flatSkillId,
    percentSkillId: validPercent[0],
    rate: CENTRAL_BOND_RATE,
    flat,
  };
}

function main() {
  const stage4 = readJson(STAGE4_PATH);
  const stage51 = readJson(STAGE51_PATH);
  const stage54 = readJson(STAGE54_PATH);
  if (!['PASS', 'REVIEW'].includes(stage4.status)) throw new Error(`Stage4 status=${stage4.status}`);
  if (!['PASS', 'PASS_WITH_REVIEW', 'COMPLETE'].includes(stage51.status)) throw new Error(`Stage5-1 status=${stage51.status}`);
  if (stage54.status !== 'COMPLETE') throw new Error(`Stage5-4 status=${stage54.status}`);

  const stage4Records = stage4.records || [];
  const stage51Records = stage51.records || [];
  const stage54Records = stage54.records || [];
  const stage51ById = new Map(stage51Records.map((r) => [Number(r.heroId), r]));
  const stage54ById = new Map(stage54Records.map((r) => [Number(r.heroId), r]));

  const heroById = indexBy(loadArray('ConfigDataHeroInfo'), 'ID', 'HeroInfo');
  const informationById = indexBy(loadArray('ConfigDataHeroInformationInfo'), 'ID', 'HeroInformationInfo');
  const heartById = indexBy(loadArray('ConfigDataHeroHeartFetterInfo'), 'ID', 'HeroHeartFetterInfo');
  const skillById = indexBy(loadArray('ConfigDataSkillInfo'), 'ID', 'SkillInfo');
  const buffById = indexBy(loadArray('ConfigDataBuffInfo'), 'ID', 'BuffInfo');
  const connectionById = indexBy(loadArray('ConfigDataJobConnectionInfo'), 'ID', 'JobConnectionInfo');
  const jobLevelById = indexBy(loadArray('ConfigDataJobLevelInfo'), 'ID', 'JobLevelInfo');

  if (stage4Records.length !== 267 || stage51Records.length !== 267 || stage54Records.length !== 267) {
    throw new Error(`input population mismatch: stage4=${stage4Records.length}, stage51=${stage51Records.length}, stage54=${stage54Records.length}`);
  }

  const records = [];
  for (const stage4Record of stage4Records) {
    const heroId = Number(stage4Record.heroId);
    const label = `Hero ${heroId}`;
    const bondRecord = stage51ById.get(heroId);
    const spRecord = stage54ById.get(heroId);
    if (!bondRecord || !spRecord) throw new Error(`${label}: missing Stage5 input`);

    const gotSkillIds = collectGotSkillIds(bondRecord);
    const normalBond = resolveHeroPropertyRates(gotSkillIds, skillById, buffById, `${label} normal bond`);
    const central = resolveCentral(heroId, heroById, informationById, heartById, skillById);
    const masteryFlats = masteryFlatsFromStage4(stage4Record, label);

    const normalJobs = (stage4Record.jobTree?.connections || []).map((connection) => {
      const statInputs = statInputsFromStage4(connection.finalDisplayStats, `${label} JobConnection ${connection.jobConnectionId}`);
      const composed = composeWithRates({ statInputs, masteryFlats, normalBondRates: normalBond.rates, central });
      return {
        jobConnectionId: Number(connection.jobConnectionId),
        jobId: Number(connection.jobId),
        jobLevelId: Number(connection.finalDisplayStats?.jobLevelId),
        values: composed.values,
        components: composed.components,
      };
    });

    let sp = { status: 'NOT_RELEASED' };
    if (spRecord.sp?.status === 'RELEASED') {
      const { jobLevelId, statInputs } = spStatInputs(spRecord, connectionById, jobLevelById, label);
      const spBonus = resolveSpBonusRates(spRecord, label);
      const composed = composeWithRates({
        statInputs,
        masteryFlats,
        normalBondRates: normalBond.rates,
        spBonusRates: spBonus.rates,
        central,
      });
      sp = {
        status: 'RELEASED',
        jobConnectionId: Number(spRecord.sp.job.jobConnectionId),
        jobId: Number(spRecord.sp.job.jobId),
        jobLevelId,
        values: composed.values,
        components: composed.components,
        spBonus,
      };
    }

    records.push({
      heroId,
      nameKr: stage4Record.nameKr ?? null,
      normalBond: {
        gotSkillIds: [...gotSkillIds].sort((a, b) => a - b),
        rates: normalBond.rates,
        rawByStat: normalBond.rawByStat,
        evidence: normalBond.evidence,
      },
      centralBond: central,
      normalJobs,
      sp,
    });
  }

  const released = records.filter((r) => r.sp.status === 'RELEASED').length;
  const output = {
    version: 1,
    stage: 'hero-page-5-6-stat-composition',
    status: 'CANDIDATE',
    authority: {
      owner: 'hero-canonical',
      role: 'POST_STAGE5_STAT_COMPOSITION',
      stage4Recomputed: false,
      relationReDerivedByName: false,
      idArithmeticUsed: false,
      rawRuntimeDependencyIntroduced: false,
    },
    formula: {
      preCentral: 'round(starAdjustedRaw * (1 + normalBondRate + spBonusRate)) + globalJobMasteryFlat',
      centralPercent: 'round(starAdjustedRaw * 0.05), added separately per stat',
      centralFlat: 'HeartFetter Lv10 explicit HP/DEF/MDEF flat skill, added after percent terms',
    },
    sources: [
      'data/generated/hero-basic-combat.v1.json',
      'data/generated/hero-page-stage5-1-bonds-final.v1.json',
      'data/generated/hero-page-stage5-4-sp.v1.json',
      'ConfigDataHeroInfo', 'ConfigDataHeroInformationInfo', 'ConfigDataHeroHeartFetterInfo',
      'ConfigDataSkillInfo', 'ConfigDataBuffInfo', 'ConfigDataJobConnectionInfo', 'ConfigDataJobLevelInfo',
    ],
    summary: { canonicalHeroCount: records.length, spReleasedCount: released },
    records,
  };
  writeJson(OUTPUT_PATH, output);
  console.log(JSON.stringify({ status: output.status, summary: output.summary, output: path.relative(ROOT, OUTPUT_PATH) }, null, 2));
}

main();
