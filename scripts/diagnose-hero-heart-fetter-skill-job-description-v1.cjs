'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const POLICY_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-presentation-policy.v1.json');
const HERO_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sourceKey(row) { return [row.heroId, row.heartFetterLevel, row.skill.skillId, row.buff.buffId, row.condition.conditionParamJobId].join(':'); }
function overrideKey(row) { return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'); }
function heroJobs(heroId) {
  const shard = read(path.join(HERO_DIR, `${heroId}.json`));
  const jobs = new Map();
  for (const row of shard?.normal?.jobTree?.connections || []) {
    if (Number.isInteger(row?.jobId) && typeof row?.job?.nameCn === 'string' && row.job.nameCn.length > 0) jobs.set(row.jobId, row.job.nameCn);
  }
  if (Number.isInteger(shard?.sp?.job?.jobId) && typeof shard?.sp?.job?.nameCn === 'string' && shard.sp.job.nameCn.length > 0) jobs.set(shard.sp.job.jobId, shard.sp.job.nameCn);
  return jobs;
}
function matches(description, jobs) {
  if (typeof description !== 'string') return [];
  return [...jobs.entries()]
    .filter(([, nameCn]) => description.includes(nameCn))
    .map(([jobId, nameCn]) => ({ jobId, nameCn }))
    .sort((a, b) => a.jobId - b.jobId);
}

function main() {
  const source = read(SOURCE_PATH);
  const policy = read(POLICY_PATH);
  assert.strictEqual(source.stage, 'hero-heart-fetter-job-effect-research-v1');
  assert.strictEqual(source.effectRowCount, 1158);
  assert.strictEqual(source.productionConsumerAllowed, false);
  assert.strictEqual(policy.status, 'RESEARCH_POLICY');
  const overrides = new Map(policy.policy.explicitOverrides.map((row) => [overrideKey(row), row]));
  const cache = new Map();
  const summary = {
    rowCount: 0,
    skillUniqueMatchRows: 0,
    skillZeroMatchRows: 0,
    skillMultipleMatchRows: 0,
    buffUniqueMatchRows: 0,
    buffZeroMatchRows: 0,
    buffMultipleMatchRows: 0,
    uniqueSkillEqualsConditionParamRows: 0,
    uniqueSkillDiffersFromConditionParamRows: 0,
    uniqueSkillEqualsCurrentPolicyRows: 0,
    uniqueSkillDiffersFromCurrentPolicyRows: 0,
    skillAndBuffUniqueSameJobRows: 0,
    skillAndBuffUniqueDifferentJobRows: 0,
  };
  const skillPolicyDifferences = [];
  const skillAmbiguities = [];

  for (const row of source.effects) {
    summary.rowCount += 1;
    let jobs = cache.get(row.heroId);
    if (!jobs) { jobs = heroJobs(row.heroId); cache.set(row.heroId, jobs); }
    const skillMatches = matches(row.skill.descriptionCn, jobs);
    const buffMatches = matches(row.buff.descriptionCn, jobs);
    if (skillMatches.length === 1) summary.skillUniqueMatchRows += 1;
    else if (skillMatches.length === 0) summary.skillZeroMatchRows += 1;
    else summary.skillMultipleMatchRows += 1;
    if (buffMatches.length === 1) summary.buffUniqueMatchRows += 1;
    else if (buffMatches.length === 0) summary.buffZeroMatchRows += 1;
    else summary.buffMultipleMatchRows += 1;

    const key = sourceKey(row);
    const override = overrides.get(key);
    const currentPolicyJobId = override ? override.presentationJobId : row.condition.conditionParamJobId;
    if (skillMatches.length === 1) {
      const skillJobId = skillMatches[0].jobId;
      if (skillJobId === row.condition.conditionParamJobId) summary.uniqueSkillEqualsConditionParamRows += 1;
      else summary.uniqueSkillDiffersFromConditionParamRows += 1;
      if (skillJobId === currentPolicyJobId) summary.uniqueSkillEqualsCurrentPolicyRows += 1;
      else {
        summary.uniqueSkillDiffersFromCurrentPolicyRows += 1;
        skillPolicyDifferences.push({
          heroId: row.heroId,
          heroNameCn: row.identity?.nameCn ?? null,
          heartFetterLevel: row.heartFetterLevel,
          skillId: row.skill.skillId,
          buffId: row.buff.buffId,
          conditionParamJobId: row.condition.conditionParamJobId,
          currentPolicyJobId,
          skillJob: skillMatches[0],
          buffMatches,
          skillDescriptionCn: row.skill.descriptionCn,
          buffDescriptionCn: row.buff.descriptionCn,
        });
      }
    } else {
      skillAmbiguities.push({
        heroId: row.heroId,
        heroNameCn: row.identity?.nameCn ?? null,
        heartFetterLevel: row.heartFetterLevel,
        skillId: row.skill.skillId,
        buffId: row.buff.buffId,
        conditionParamJobId: row.condition.conditionParamJobId,
        skillMatches,
        skillDescriptionCn: row.skill.descriptionCn,
      });
    }
    if (skillMatches.length === 1 && buffMatches.length === 1) {
      if (skillMatches[0].jobId === buffMatches[0].jobId) summary.skillAndBuffUniqueSameJobRows += 1;
      else summary.skillAndBuffUniqueDifferentJobRows += 1;
    }
  }

  assert.strictEqual(summary.rowCount, 1158);
  process.stdout.write(`${JSON.stringify({
    status: 'PASS_DIAGNOSTIC_ONLY',
    semanticAuthority: false,
    relationMutationAllowed: false,
    summary,
    skillPolicyDifferenceCount: skillPolicyDifferences.length,
    skillPolicyDifferences: skillPolicyDifferences.slice(0, 100),
    skillAmbiguityCount: skillAmbiguities.length,
    skillAmbiguities: skillAmbiguities.slice(0, 100),
  })}\n`);
}

main();
