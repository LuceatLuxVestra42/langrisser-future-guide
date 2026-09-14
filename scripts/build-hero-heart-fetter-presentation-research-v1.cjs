'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const POLICY_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-presentation-policy.v1.json');
const HERO_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function outputPath(argv) {
  const i = argv.indexOf('--output');
  if (i === -1 || !argv[i + 1]) throw new Error('Usage: node scripts/build-hero-heart-fetter-presentation-research-v1.cjs --output <path>');
  return path.resolve(argv[i + 1]);
}
function sourceKey(row) {
  return [row.heroId, row.heartFetterLevel, row.skill.skillId, row.buff.buffId, row.condition.conditionParamJobId].join(':');
}
function overrideKey(row) {
  return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':');
}
function heroJobs(heroId) {
  const shard = read(path.join(HERO_DIR, `${heroId}.json`));
  const jobs = new Map();
  for (const connection of shard?.normal?.jobTree?.connections || []) {
    if (Number.isInteger(connection?.jobId)) jobs.set(connection.jobId, {
      jobId: connection.jobId,
      nameCn: connection?.job?.nameCn ?? null,
      rank: Number.isInteger(connection?.job?.rank) ? connection.job.rank : null,
      source: 'normal.jobTree.connections',
    });
  }
  if (shard?.sp?.job?.jobId) {
    jobs.set(shard.sp.job.jobId, {
      jobId: shard.sp.job.jobId,
      nameCn: shard.sp.job.nameCn ?? null,
      rank: Number.isInteger(shard.sp.job.rank) ? shard.sp.job.rank : null,
      source: 'sp.job',
    });
  }
  return jobs;
}

function main() {
  const source = read(SOURCE_PATH);
  const policy = read(POLICY_PATH);
  if (source.status !== 'RESEARCH_PROJECTION' || source.productionConsumerAllowed !== false) throw new Error('job-effect research projection boundary changed');
  if (policy.status !== 'RESEARCH_POLICY' || policy.validationBoundary?.productionFrontendConsumption !== false) throw new Error('presentation policy boundary changed');

  const overrides = new Map(policy.policy.explicitOverrides.map((row) => [overrideKey(row), row]));
  const heroCache = new Map();
  const effects = [];
  let defaultRows = 0;
  let overrideRows = 0;

  for (const row of source.effects || []) {
    const k = sourceKey(row);
    const override = overrides.get(k);
    const presentationJobId = override ? override.presentationJobId : row.condition.conditionParamJobId;
    let jobs = heroCache.get(row.heroId);
    if (!jobs) { jobs = heroJobs(row.heroId); heroCache.set(row.heroId, jobs); }
    const presentationJob = jobs.get(presentationJobId);
    if (!presentationJob) throw new Error(`Hero ${row.heroId}: unresolved presentation Job ${presentationJobId}`);
    if (override) overrideRows += 1;
    else defaultRows += 1;

    effects.push({
      heroId: row.heroId,
      identity: row.identity,
      heartFetterLevel: row.heartFetterLevel,
      mappingMode: override ? 'EXPLICIT_OVERRIDE' : 'VALIDATED_DEFAULT',
      conditionJobReference: row.job,
      presentationJob,
      skill: row.skill,
      buff: row.buff,
      condition: row.condition,
      sourceProvenance: row.sourceProvenance,
    });
  }

  if (defaultRows !== policy.policy.defaultRuleRowCount) throw new Error(`default row count mismatch: ${defaultRows}`);
  if (overrideRows !== policy.policy.overrideRowCount) throw new Error(`override row count mismatch: ${overrideRows}`);
  if (effects.length !== policy.policy.totalMappedRowCount) throw new Error(`mapped row count mismatch: ${effects.length}`);

  const output = {
    schemaVersion: 1,
    stage: 'hero-heart-fetter-presentation-research-v1',
    status: 'RESEARCH_PROJECTION',
    semanticAuthority: false,
    productionConsumerAllowed: false,
    sourceProjection: 'data/generated/hero-heart-fetter-job-effect-research.v1.json',
    presentationPolicy: 'data/validation/hero-heart-fetter-presentation-policy.v1.json',
    heroPopulationCount: new Set(effects.map((row) => row.heroId)).size,
    effectRowCount: effects.length,
    defaultRuleRowCount: defaultRows,
    overrideRowCount: overrideRows,
    levels: [4, 7],
    notes: [
      'presentationJob is a research-only projection governed by the exception-aware presentation policy.',
      'No runtime name JOIN is used to create presentationJob; the four Ainz exceptions are explicit ID-keyed overrides.',
      'conditionJobReference remains preserved separately and must not be treated as a universal activation/display job.',
      'This artifact must not be consumed by production frontend code or promoted into Hero canonical relations.'
    ],
    effects,
  };

  fs.writeFileSync(outputPath(process.argv.slice(2)), `${JSON.stringify(output, null, 2)}\n`);
}

main();
