'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ROOT, loadArray } = require('./lib/configdata-direct.cjs');

const RAW_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-raw-condition.v1.json');
const HYPOTHESIS_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-ct7-job-activation-hypothesis.v1.json');
const HERO_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function artifactPath(argv) {
  const i = argv.indexOf('--artifact');
  if (i === -1 || !argv[i + 1]) throw new Error('Usage: node scripts/validate-hero-heart-fetter-job-effect-research-v1.cjs --artifact <path>');
  return path.resolve(argv[i + 1]);
}
function positiveInteger(value, label) {
  assert(Number.isInteger(value) && value > 0, `${label}: expected positive integer`);
  return value;
}
function text(value) { return typeof value === 'string' && value.length > 0 ? value : null; }
function indexUnique(records, label) {
  const map = new Map();
  records.forEach((record, sourceIndex) => {
    const id = positiveInteger(record?.ID, `${label}[${sourceIndex}].ID`);
    assert(!map.has(id), `${label}: duplicate ID ${id}`);
    map.set(id, { record, sourceIndex });
  });
  return map;
}
function collectHeroJobs(heroId) {
  const shard = readJson(path.join(HERO_DIR, `${heroId}.json`));
  assert.strictEqual(shard.heroId, heroId, `Hero ${heroId}: shard mismatch`);
  const jobs = new Map();
  for (const connection of shard?.normal?.jobTree?.connections || []) jobs.set(connection.jobId, connection?.job?.nameCn ?? null);
  if (shard?.sp?.job) jobs.set(shard.sp.job.jobId, shard.sp.job.nameCn ?? null);
  return { identity: shard.identity, jobs };
}
function assertForbiddenAbsent(value, location = '$') {
  const forbidden = new Set(['applicableJobId', 'applicableJobIds', 'jobRestricted']);
  if (Array.isArray(value)) return value.forEach((item, index) => assertForbiddenAbsent(item, `${location}[${index}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(!forbidden.has(key), `${location}: forbidden semantic field ${key}`);
    assertForbiddenAbsent(child, `${location}.${key}`);
  }
}

function main() {
  const artifact = readJson(artifactPath(process.argv.slice(2)));
  const raw = readJson(RAW_PATH);
  const hypothesis = readJson(HYPOTHESIS_PATH);
  const skills = indexUnique(loadArray('ConfigDataSkillInfo'), 'ConfigDataSkillInfo');
  const buffs = indexUnique(loadArray('ConfigDataBuffInfo'), 'ConfigDataBuffInfo');

  assert.strictEqual(hypothesis.status, 'RESEARCH_HYPOTHESIS');
  assert.strictEqual(hypothesis.allowedUse.researchProjection, true);
  assert.strictEqual(hypothesis.allowedUse.productionFrontendConsumption, false);
  assert.strictEqual(artifact.schemaVersion, 1);
  assert.strictEqual(artifact.stage, 'hero-heart-fetter-job-effect-research-v1');
  assert.strictEqual(artifact.status, 'RESEARCH_PROJECTION');
  assert.strictEqual(artifact.semanticAuthority, false);
  assert.strictEqual(artifact.productionConsumerAllowed, false);
  assert.deepStrictEqual(artifact.levels, [4, 7]);
  assertForbiddenAbsent(artifact);

  const expectedKeys = new Set();
  for (const record of raw.records || []) {
    if (record.heartFetterLevel !== 4 && record.heartFetterLevel !== 7) continue;
    assert.strictEqual(record.passiveBuffIds.length, record.conditions.length, `Hero ${record.heroId} Skill ${record.skillId}: cardinality mismatch`);
    for (let i = 0; i < record.conditions.length; i += 1) {
      const condition = record.conditions[i];
      if (condition?.conditionType !== 7) continue;
      for (const jobId of condition.conditionParams || []) {
        expectedKeys.add([record.heroId, record.heartFetterLevel, jobId, record.skillId, record.passiveBuffIds[i]].join(':'));
      }
    }
  }

  const actualKeys = new Set();
  const heroCache = new Map();
  let nonNullSkillDescriptions = 0;
  let nonNullBuffDescriptions = 0;
  for (const row of artifact.effects || []) {
    const heroId = positiveInteger(row.heroId, 'row.heroId');
    assert(row.heartFetterLevel === 4 || row.heartFetterLevel === 7, `Hero ${heroId}: invalid level`);
    const jobId = positiveInteger(row?.job?.jobId, `Hero ${heroId}: jobId`);
    const skillId = positiveInteger(row?.skill?.skillId, `Hero ${heroId}: skillId`);
    const buffId = positiveInteger(row?.buff?.buffId, `Hero ${heroId}: buffId`);
    assert.strictEqual(row?.condition?.conditionType, 7, `Hero ${heroId}: conditionType`);
    assert.strictEqual(row?.condition?.conditionParamJobId, jobId, `Hero ${heroId}: conditionParamJobId`);
    let ctx = heroCache.get(heroId);
    if (!ctx) { ctx = collectHeroJobs(heroId); heroCache.set(heroId, ctx); }
    assert.deepStrictEqual(row.identity, ctx.identity, `Hero ${heroId}: identity drift`);
    assert(ctx.jobs.has(jobId), `Hero ${heroId}: projected job ${jobId} not in frozen hero job set`);
    assert.strictEqual(row.job.nameCn, ctx.jobs.get(jobId), `Hero ${heroId}: job name drift`);

    const skillHit = skills.get(skillId);
    const buffHit = buffs.get(buffId);
    assert(skillHit, `Hero ${heroId}: missing Skill ${skillId}`);
    assert(buffHit, `Hero ${heroId}: missing Buff ${buffId}`);
    assert.strictEqual(row.skill.sourceIndex, skillHit.sourceIndex, `Hero ${heroId}: Skill ${skillId} sourceIndex drift`);
    assert.strictEqual(row.buff.sourceIndex, buffHit.sourceIndex, `Hero ${heroId}: Buff ${buffId} sourceIndex drift`);
    assert.strictEqual(row.skill.descriptionCn, text(skillHit.record.Desc), `Hero ${heroId}: Skill ${skillId} Desc drift`);
    assert.strictEqual(row.buff.descriptionCn, text(buffHit.record.Desc), `Hero ${heroId}: Buff ${buffId} Desc drift`);
    if (row.skill.descriptionCn !== null) nonNullSkillDescriptions += 1;
    if (row.buff.descriptionCn !== null) nonNullBuffDescriptions += 1;

    const key = [heroId, row.heartFetterLevel, jobId, skillId, buffId].join(':');
    assert(!actualKeys.has(key), `duplicate projection row ${key}`);
    actualKeys.add(key);
  }

  assert.deepStrictEqual([...actualKeys].sort(), [...expectedKeys].sort(), 'projection key parity mismatch');
  assert.strictEqual(artifact.effectRowCount, actualKeys.size);
  assert.strictEqual(artifact.heroPopulationCount, heroCache.size);
  assert.strictEqual(heroCache.size, 267);
  assert(nonNullSkillDescriptions > 0, 'all Skill Desc projections are null');
  assert(nonNullBuffDescriptions > 0, 'all Buff Desc projections are null');

  process.stdout.write(`${JSON.stringify({status:'PASS_HERO_HEART_FETTER_JOB_EFFECT_RESEARCH_V1', heroPopulationCount:heroCache.size, effectRowCount:actualKeys.size, nonNullSkillDescriptions, nonNullBuffDescriptions})}\n`);
}

main();
