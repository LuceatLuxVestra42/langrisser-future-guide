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
function sourceKey(row) { return [row.heroId, row.heartFetterLevel, row.skill.skillId, row.buff.buffId, row.condition.conditionParamJobId].join(':'); }
function policyKey(row) { return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'); }
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
  if (shard?.sp?.job?.jobId) jobs.set(shard.sp.job.jobId, {
    jobId: shard.sp.job.jobId,
    nameCn: shard.sp.job.nameCn ?? null,
    rank: Number.isInteger(shard.sp.job.rank) ? shard.sp.job.rank : null,
    source: 'sp.job',
  });
  return jobs;
}
function mapByKey(rows) { return new Map(rows.map((row) => [policyKey(row), row])); }

function main() {
  const source = read(SOURCE_PATH);
  const policy = read(POLICY_PATH);
  if (source.status !== 'RESEARCH_PROJECTION' || source.productionConsumerAllowed !== false) throw new Error('job-effect research projection boundary changed');
  if (policy.status !== 'RESEARCH_POLICY' || policy.validationBoundary?.productionFrontendConsumption !== false) throw new Error('presentation policy boundary changed');

  const overrides = mapByKey(policy.policy.explicitOverrides);
  const exclusions = mapByKey(policy.policy.exclusionSetRows);
  const reviews = mapByKey(policy.policy.reviewFallbacks);
  const heroCache = new Map();
  const effects = [];
  const counts = { VALIDATED_DEFAULT: 0, EXPLICIT_OVERRIDE: 0, EXCLUSION_SET_MEMBER: 0, REVIEW_FALLBACK: 0 };

  for (const row of source.effects || []) {
    const k = sourceKey(row);
    const mapping = overrides.get(k)
      ? { mode: 'EXPLICIT_OVERRIDE', row: overrides.get(k) }
      : exclusions.get(k)
        ? { mode: 'EXCLUSION_SET_MEMBER', row: exclusions.get(k) }
        : reviews.get(k)
          ? { mode: 'REVIEW_FALLBACK', row: reviews.get(k) }
          : { mode: 'VALIDATED_DEFAULT', row: null };
    const presentationJobId = mapping.row ? mapping.row.presentationJobId : row.condition.conditionParamJobId;
    let jobs = heroCache.get(row.heroId);
    if (!jobs) { jobs = heroJobs(row.heroId); heroCache.set(row.heroId, jobs); }
    const presentationJob = jobs.get(presentationJobId);
    if (!presentationJob) throw new Error(`Hero ${row.heroId}: unresolved presentation Job ${presentationJobId}`);
    counts[mapping.mode] += 1;

    effects.push({
      heroId: row.heroId,
      identity: row.identity,
      heartFetterLevel: row.heartFetterLevel,
      mappingMode: mapping.mode,
      conditionJobReference: row.job,
      presentationJob,
      reviewReason: mapping.mode === 'REVIEW_FALLBACK' ? mapping.row.reviewReason : null,
      excludedJobId: mapping.mode === 'EXCLUSION_SET_MEMBER' ? mapping.row.excludedJobId : null,
      skill: row.skill,
      buff: row.buff,
      condition: row.condition,
      sourceProvenance: row.sourceProvenance,
    });
  }

  if (counts.VALIDATED_DEFAULT !== policy.policy.defaultRuleRowCount) throw new Error(`default row count mismatch: ${counts.VALIDATED_DEFAULT}`);
  if (counts.EXPLICIT_OVERRIDE !== policy.policy.overrideRowCount) throw new Error(`override row count mismatch: ${counts.EXPLICIT_OVERRIDE}`);
  if (counts.EXCLUSION_SET_MEMBER !== policy.policy.exclusionSetRowCount) throw new Error(`exclusion row count mismatch: ${counts.EXCLUSION_SET_MEMBER}`);
  if (counts.REVIEW_FALLBACK !== policy.policy.reviewFallbackRowCount) throw new Error(`review row count mismatch: ${counts.REVIEW_FALLBACK}`);
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
    defaultRuleRowCount: counts.VALIDATED_DEFAULT,
    overrideRowCount: counts.EXPLICIT_OVERRIDE,
    exclusionSetRowCount: counts.EXCLUSION_SET_MEMBER,
    reviewFallbackRowCount: counts.REVIEW_FALLBACK,
    levels: [4, 7],
    notes: [
      'presentationJob is a research-only projection governed by the frozen Skill job-label evidence and exception-aware presentation policy.',
      'Six exact Skill-vs-ConditionParam differences use explicit ID-keyed overrides: Ainz 4 and Kagura 2.',
      'Eight Matthew rows are explicit exclusion-set members and two Narm rows remain REVIEW_FALLBACK.',
      'conditionJobReference remains preserved separately and must not be treated as a universal activation/display job.',
      'This artifact must not be consumed by production frontend code or promoted into Hero canonical relations.'
    ],
    effects,
  };

  fs.writeFileSync(outputPath(process.argv.slice(2)), `${JSON.stringify(output, null, 2)}\n`);
}

main();
