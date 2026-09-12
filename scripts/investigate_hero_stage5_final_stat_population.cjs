'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_REF = 'source-configdata-v1-6475e63e';
const STAT_KEYS = ['hp', 'at', 'magic', 'df', 'magicDf', 'dex'];

function read(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
function sourceJson(rel) {
  const text = execFileSync('git', ['show', `${SOURCE_REF}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(text);
}
function rows(doc) {
  return Array.isArray(doc) ? doc : (Array.isArray(doc?.records) ? doc.records : []);
}
function stripMarkup(value) {
  return typeof value === 'string' ? value.replace(/<[^>]+>/g, '') : null;
}
function indexById(list) {
  return new Map(list.filter(r => Number.isInteger(Number(r?.ID))).map(r => [Number(r.ID), r]));
}

const heroMaster = rows(read('data/hero-name-master.v1.json'));
const stage4 = rows(read('data/generated/hero-basic-combat.v1.json'));
const stage51 = rows(read('data/generated/hero-page-stage5-1-bonds-final.v1.json'));
const stage54 = rows(read('data/generated/hero-page-stage5-4-sp.v1.json'));

const heartRows = rows(sourceJson('data/configdata/ConfigDataHeroHeartFetterInfo.json'));
const skillRows = rows(sourceJson('data/configdata/ConfigDataSkillInfo.json'));
const skillById = indexById(skillRows);
const heartById = indexById(heartRows);

let propertyModifyRows = [];
let propertyModifyPath = null;
for (const candidate of [
  'data/configdata/ConfigDataPropertyModifyInfo.json',
  'data/configdata/ConfigDataPropertyInfo.json',
]) {
  try {
    propertyModifyRows = rows(sourceJson(candidate));
    propertyModifyPath = candidate;
    break;
  } catch {}
}
const propertyById = indexById(propertyModifyRows);

const stage4ByHero = new Map(stage4.map(r => [Number(r.heroId), r]));
const stage51ByHero = new Map(stage51.map(r => [Number(r.heroId), r]));
const stage54ByHero = new Map(stage54.map(r => [Number(r.heroId), r]));
const errors = [];
const heartSummary = [];
const lv10SkillIds = new Map();
const heartSkillDescriptionsByLevel = Array.from({ length: 10 }, () => new Map());

for (const hero of heroMaster) {
  const heroId = Number(hero.heroId);
  const bond = stage51ByHero.get(heroId);
  if (!bond) { errors.push(`Hero ${heroId}: missing Stage5-1 row`); continue; }
  const heartId = Number(bond.heroHeartFetterId);
  const heart = heartById.get(heartId);
  if (!Number.isInteger(heartId) || !heart) { errors.push(`Hero ${heroId}: unresolved HeroHeartFetter ${bond.heroHeartFetterId}`); continue; }
  const heroSkills = Array.isArray(heart.HeroHeartFetterSkills) ? heart.HeroHeartFetterSkills.map(Number) : [];
  if (heroSkills.length !== 10) errors.push(`Hero ${heroId}: HeartFetter ${heartId} hero skill count ${heroSkills.length}`);
  heroSkills.forEach((skillId, i) => {
    const desc = stripMarkup(skillById.get(skillId)?.Desc ?? null);
    const key = `${skillId}:${desc}`;
    heartSkillDescriptionsByLevel[i].set(key, (heartSkillDescriptionsByLevel[i].get(key) || 0) + 1);
  });
  const lv10Unlocks = (Array.isArray(heart.UnlockSkills_ID) ? heart.UnlockSkills_ID : []).filter(x => Number(x?.HeartFetterLevel) === 10);
  for (const item of lv10Unlocks) {
    const skillId = Number(item.SkillId);
    const desc = stripMarkup(skillById.get(skillId)?.Desc ?? null);
    const key = `${skillId}:${desc}`;
    lv10SkillIds.set(key, (lv10SkillIds.get(key) || 0) + 1);
  }
  heartSummary.push({
    heroId,
    heartId,
    lv10HeroSkillId: heroSkills[9] ?? null,
    lv10HeroSkillDesc: stripMarkup(skillById.get(heroSkills[9])?.Desc ?? null),
    lv10Unlocks: lv10Unlocks.map(x => ({ skillId: Number(x.SkillId), desc: stripMarkup(skillById.get(Number(x.SkillId))?.Desc ?? null) })),
  });
}

const spRows = [];
const spPropertyDist = new Map();
for (const row of stage54) {
  if (row?.sp?.status !== 'RELEASED') continue;
  const heroId = Number(row.heroId);
  const properties = Array.isArray(row?.sp?.secondStageRewards?.buff?.properties) ? row.sp.secondStageRewards.buff.properties : [];
  const mapped = properties.map(p => {
    const propertyId = Number(p.propertyId);
    const value = Number(p.value);
    const source = propertyById.get(propertyId) || null;
    const item = {
      propertyId,
      value,
      propertyName: source?.Name ?? source?.name ?? null,
      propertyDesc: stripMarkup(source?.Desc ?? source?.Description ?? null),
      source: source ? Object.fromEntries(Object.entries(source).filter(([k]) => /^(ID|Name|Desc|Description|Property|Type|Key|Field)/i.test(k))) : null,
    };
    const key = `${propertyId}:${value}:${item.propertyName ?? ''}:${item.propertyDesc ?? ''}`;
    spPropertyDist.set(key, (spPropertyDist.get(key) || 0) + 1);
    return item;
  });
  spRows.push({
    heroId,
    jobConnectionId: Number(row?.sp?.job?.jobConnectionId),
    jobId: Number(row?.sp?.job?.jobId),
    buffId: Number(row?.sp?.secondStageRewards?.buff?.buffId),
    buffNameCn: row?.sp?.secondStageRewards?.buff?.nameCn ?? null,
    buffDescCn: stripMarkup(row?.sp?.secondStageRewards?.buff?.descCn ?? null),
    properties: mapped,
  });
}

const leon4 = stage4ByHero.get(6);
const leon51 = stage51ByHero.get(6);
const leon54 = stage54ByHero.get(6);
const leonConnection = (leon4?.jobTree?.connections || []).find(c => Number(c.jobConnectionId) === Number(leon54?.sp?.job?.jobConnectionId));

const report = {
  version: 1,
  stage: 'hero-stage5-final-stat-population-investigation',
  sourceRef: SOURCE_REF,
  status: errors.length ? 'FAIL' : 'PASS',
  scope: {
    canonicalHeroCount: heroMaster.length,
    stage4Count: stage4.length,
    stage51Count: stage51.length,
    stage54Count: stage54.length,
    resolvedHeartFetterCount: heartSummary.length,
    spReleasedCount: spRows.length,
  },
  heartFetter: {
    lv10UnlockSkillDistribution: Object.fromEntries([...lv10SkillIds.entries()].sort()),
    heroSpecificDescriptionDistributionByLevel: heartSkillDescriptionsByLevel.map((m, i) => ({ level: i + 1, values: Object.fromEntries([...m.entries()].sort()) })),
    leon: heartSummary.find(x => x.heroId === 6) || null,
  },
  sp: {
    propertyModifySource: propertyModifyPath,
    propertyDistribution: Object.fromEntries([...spPropertyDist.entries()].sort()),
    rows: spRows,
  },
  leonStage4SpConnection: leonConnection ? {
    heroId: 6,
    jobConnectionId: leonConnection.jobConnectionId,
    jobId: leonConnection.jobId,
    finalDisplayStats: leonConnection.finalDisplayStats,
    stage51HeartFetterId: leon51?.heroHeartFetterId ?? null,
  } : null,
  errors,
};

const out = path.join(ROOT, 'data/validation/hero-stage5-final-stat-population-investigation.v1.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, scope: report.scope, lv10UnlockSkillDistribution: report.heartFetter.lv10UnlockSkillDistribution, propertyModifySource: report.sp.propertyModifySource, spPropertyDistribution: report.sp.propertyDistribution, leon: { heart: report.heartFetter.leon, sp: report.sp.rows.find(x => x.heroId === 6), stage4: report.leonStage4SpConnection }, errors }, null, 2));
if (errors.length) process.exitCode = 1;
