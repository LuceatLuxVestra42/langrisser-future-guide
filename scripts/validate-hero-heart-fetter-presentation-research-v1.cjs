'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const POLICY_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-presentation-policy.v1.json');
const HERO_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function artifactPath(argv) {
  const i = argv.indexOf('--artifact');
  if (i === -1 || !argv[i + 1]) throw new Error('Usage: node scripts/validate-hero-heart-fetter-presentation-research-v1.cjs --artifact <path>');
  return path.resolve(argv[i + 1]);
}
function sourceKey(row) { return [row.heroId, row.heartFetterLevel, row.skill.skillId, row.buff.buffId, row.condition.conditionParamJobId].join(':'); }
function overrideKey(row) { return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'); }
function jobMap(heroId) {
  const shard = read(path.join(HERO_DIR, `${heroId}.json`));
  const jobs = new Map();
  for (const connection of shard?.normal?.jobTree?.connections || []) jobs.set(connection.jobId, {
    jobId: connection.jobId,
    nameCn: connection?.job?.nameCn ?? null,
    rank: Number.isInteger(connection?.job?.rank) ? connection.job.rank : null,
    source: 'normal.jobTree.connections',
  });
  if (shard?.sp?.job?.jobId) jobs.set(shard.sp.job.jobId, {
    jobId: shard.sp.job.jobId,
    nameCn: shard.sp.job.nameCn ?? null,
    rank: Number.isInteger(shard.sp.job.rank) ? shard.sp.job.rank : null,
    source: 'sp.job',
  });
  return jobs;
}
function assertNoForbiddenFields(value, location = '$') {
  const forbidden = new Set(['applicableJobId', 'applicableJobIds', 'jobRestricted']);
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoForbiddenFields(item, `${location}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert(!forbidden.has(key), `${location}: forbidden field ${key}`);
    assertNoForbiddenFields(item, `${location}.${key}`);
  }
}

function main() {
  const artifact = read(artifactPath(process.argv.slice(2)));
  const source = read(SOURCE_PATH);
  const policy = read(POLICY_PATH);

  assert.strictEqual(artifact.schemaVersion, 1);
  assert.strictEqual(artifact.stage, 'hero-heart-fetter-presentation-research-v1');
  assert.strictEqual(artifact.status, 'RESEARCH_PROJECTION');
  assert.strictEqual(artifact.semanticAuthority, false);
  assert.strictEqual(artifact.productionConsumerAllowed, false);
  assert.strictEqual(artifact.sourceProjection, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
  assert.strictEqual(artifact.presentationPolicy, 'data/validation/hero-heart-fetter-presentation-policy.v1.json');
  assert.strictEqual(artifact.heroPopulationCount, 267);
  assert.strictEqual(artifact.effectRowCount, 1158);
  assert.strictEqual(artifact.defaultRuleRowCount, 1154);
  assert.strictEqual(artifact.overrideRowCount, 4);
  assert.deepStrictEqual(artifact.levels, [4, 7]);
  assertNoForbiddenFields(artifact);

  const overrides = new Map(policy.policy.explicitOverrides.map((row) => [overrideKey(row), row]));
  const expected = [];
  let defaults = 0;
  let overridden = 0;
  const cache = new Map();

  for (const row of source.effects) {
    const k = sourceKey(row);
    const override = overrides.get(k);
    const presentationJobId = override ? override.presentationJobId : row.condition.conditionParamJobId;
    let jobs = cache.get(row.heroId);
    if (!jobs) { jobs = jobMap(row.heroId); cache.set(row.heroId, jobs); }
    const presentationJob = jobs.get(presentationJobId);
    assert(presentationJob, `Hero ${row.heroId}: missing presentation Job ${presentationJobId}`);
    if (override) overridden += 1;
    else defaults += 1;
    expected.push({
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

  assert.strictEqual(defaults, 1154);
  assert.strictEqual(overridden, 4);
  assert.strictEqual(expected.length, 1158);
  assert.deepStrictEqual(artifact.effects, expected);
  process.stdout.write(`${JSON.stringify({status:'PASS_HEART_FETTER_PRESENTATION_RESEARCH_V1', heroPopulationCount:267, effectRowCount:1158, defaultRows:defaults, overrideRows:overridden})}\n`);
}

main();
