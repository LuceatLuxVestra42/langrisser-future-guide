'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadArray } = require('./lib/configdata-direct.cjs');

const RAW_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-raw-condition.v1.json');
const HYPOTHESIS_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-ct7-job-activation-hypothesis.v1.json');
const HERO_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label}: expected positive integer, got ${String(value)}`);
  return value;
}
function indexUnique(records, label) {
  const map = new Map();
  records.forEach((record, sourceIndex) => {
    const id = positiveInteger(record?.ID, `${label}[${sourceIndex}].ID`);
    if (map.has(id)) throw new Error(`${label}: duplicate ID ${id}`);
    map.set(id, { record, sourceIndex });
  });
  return map;
}
function text(value) { return typeof value === 'string' && value.length > 0 ? value : null; }
function outputPath(argv) {
  const i = argv.indexOf('--output');
  if (i === -1 || !argv[i + 1]) throw new Error('Usage: node scripts/build-hero-heart-fetter-job-effect-research-v1.cjs --output <path>');
  return path.resolve(argv[i + 1]);
}
function heroContext(heroId) {
  const shard = readJson(path.join(HERO_DIR, `${heroId}.json`));
  if (shard.heroId !== heroId) throw new Error(`Hero shard mismatch: ${heroId}`);
  const jobs = new Map();
  for (const connection of shard?.normal?.jobTree?.connections || []) {
    const jobId = positiveInteger(connection?.jobId, `Hero ${heroId} normal jobId`);
    jobs.set(jobId, {
      jobId,
      nameCn: text(connection?.job?.nameCn),
      rank: Number.isInteger(connection?.job?.rank) ? connection.job.rank : null,
      source: 'normal.jobTree.connections',
    });
  }
  if (shard?.sp?.job) {
    const jobId = positiveInteger(shard.sp.job.jobId, `Hero ${heroId} SP jobId`);
    jobs.set(jobId, {
      jobId,
      nameCn: text(shard.sp.job.nameCn),
      rank: Number.isInteger(shard.sp.job.rank) ? shard.sp.job.rank : null,
      source: 'sp.job',
    });
  }
  return { identity: shard.identity ?? null, jobs };
}

function main() {
  const raw = readJson(RAW_PATH);
  const hypothesis = readJson(HYPOTHESIS_PATH);
  if (hypothesis.status !== 'RESEARCH_HYPOTHESIS') throw new Error('CT7 research hypothesis is not active');
  if (hypothesis.allowedUse?.researchProjection !== true) throw new Error('researchProjection is not allowed');
  if (hypothesis.allowedUse?.productionFrontendConsumption !== false) throw new Error('production frontend boundary changed');

  const skills = indexUnique(loadArray('ConfigDataSkillInfo'), 'ConfigDataSkillInfo');
  const buffs = indexUnique(loadArray('ConfigDataBuffInfo'), 'ConfigDataBuffInfo');
  const heroCache = new Map();
  const effects = [];

  for (const record of raw.records || []) {
    const heroId = positiveInteger(record.heroId, 'record.heroId');
    const level = record.heartFetterLevel;
    if (level !== 4 && level !== 7) continue;
    let ctx = heroCache.get(heroId);
    if (!ctx) { ctx = heroContext(heroId); heroCache.set(heroId, ctx); }
    const skillHit = skills.get(positiveInteger(record.skillId, `Hero ${heroId} skillId`));
    if (!skillHit) throw new Error(`Hero ${heroId}: missing Skill ${record.skillId}`);
    if (!Array.isArray(record.passiveBuffIds) || !Array.isArray(record.conditions) || record.passiveBuffIds.length !== record.conditions.length) {
      throw new Error(`Hero ${heroId} Skill ${record.skillId}: passive buff/condition cardinality mismatch`);
    }
    for (let i = 0; i < record.conditions.length; i += 1) {
      const condition = record.conditions[i];
      if (condition?.conditionType !== 7) continue;
      const buffId = positiveInteger(record.passiveBuffIds[i], `Hero ${heroId} buffId`);
      const buffHit = buffs.get(buffId);
      if (!buffHit) throw new Error(`Hero ${heroId}: missing Buff ${buffId}`);
      for (const rawJobId of condition.conditionParams || []) {
        const jobId = positiveInteger(rawJobId, `Hero ${heroId} CT7 jobId`);
        const job = ctx.jobs.get(jobId);
        if (!job) throw new Error(`Hero ${heroId}: CT7 Job ${jobId} not present in frozen hero job set`);
        effects.push({
          heroId,
          identity: ctx.identity,
          heartFetterLevel: level,
          job,
          skill: {
            skillId: record.skillId,
            descriptionCn: text(skillHit.record.Description),
            sourceIndex: skillHit.sourceIndex,
          },
          buff: {
            buffId,
            descriptionCn: text(buffHit.record.Description),
            sourceIndex: buffHit.sourceIndex,
          },
          condition: { conditionType: 7, conditionParamJobId: jobId },
          sourceProvenance: record.sourceProvenance,
        });
      }
    }
  }

  effects.sort((a, b) => a.heroId - b.heroId || a.heartFetterLevel - b.heartFetterLevel || a.job.jobId - b.job.jobId || a.skill.skillId - b.skill.skillId || a.buff.buffId - b.buff.buffId);
  const heroIds = [...new Set(effects.map((row) => row.heroId))];
  const projection = {
    schemaVersion: 1,
    stage: 'hero-heart-fetter-job-effect-research-v1',
    status: 'RESEARCH_PROJECTION',
    semanticAuthority: false,
    productionConsumerAllowed: false,
    hypothesis: 'data/validation/hero-heart-fetter-ct7-job-activation-hypothesis.v1.json',
    sourceArtifact: 'data/generated/hero-heart-fetter-raw-condition.v1.json',
    heroPopulationCount: heroIds.length,
    effectRowCount: effects.length,
    levels: [4, 7],
    notes: [
      'Job association is a non-canonical research projection derived only from the validated CT7 job-activation hypothesis.',
      'Skill and Buff descriptions are preserved independently and are not reconciled when source cross-links differ.',
      'This artifact must not create applicableJobIds, jobRestricted, or a new Hero-to-Job canonical relation.'
    ],
    effects,
  };
  fs.writeFileSync(outputPath(process.argv.slice(2)), `${JSON.stringify(projection, null, 2)}\n`);
}

main();
