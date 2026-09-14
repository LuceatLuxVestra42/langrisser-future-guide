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
function extractJobToken(description) {
  if (typeof description !== 'string') return { status: 'MISSING_PATTERN', token: null };
  const start = description.indexOf('职业为');
  if (start === -1) return { status: 'MISSING_PATTERN', token: null };
  const after = description.slice(start + '职业为'.length);
  const end = after.indexOf('生效');
  if (end === -1) return { status: 'MISSING_PATTERN', token: null };
  const token = after.slice(0, end).trim().replace(/[：:,，。\s]+$/g, '').trim();
  return token ? { status: 'TOKEN', token } : { status: 'MISSING_PATTERN', token: null };
}
function classifyToken(tokenResult, jobs) {
  if (tokenResult.status !== 'TOKEN') return { classification: 'MISSING_PATTERN', token: null, job: null, excludedJob: null };
  const token = tokenResult.token;
  const exact = [...jobs.entries()].find(([, nameCn]) => nameCn === token);
  if (exact) return { classification: 'EXACT_JOB_NAME', token, job: { jobId: exact[0], nameCn: exact[1] }, excludedJob: null };
  const exclusion = token.match(/^除(.+?)以外高级职业$/);
  if (exclusion) {
    const excludedName = exclusion[1].trim();
    const excluded = [...jobs.entries()].find(([, nameCn]) => nameCn === excludedName);
    if (excluded) return { classification: 'EXCLUSION_ADVANCED_JOB_SET', token, job: null, excludedJob: { jobId: excluded[0], nameCn: excluded[1] } };
  }
  return { classification: 'UNRESOLVED_SOURCE_JOB_LABEL', token, job: null, excludedJob: null };
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
    exactJobNameRows: 0,
    exclusionAdvancedJobSetRows: 0,
    unresolvedSourceJobLabelRows: 0,
    missingPatternRows: 0,
    exactSkillEqualsConditionParamRows: 0,
    exactSkillDiffersFromConditionParamRows: 0,
    exactSkillEqualsCurrentPolicyRows: 0,
    exactSkillDiffersFromCurrentPolicyRows: 0,
    exclusionRowsWhereConditionParamIsExcludedJob: 0,
    exclusionRowsWhereConditionParamIsOtherJob: 0,
  };
  const exactPolicyDifferences = [];
  const exclusions = [];
  const unresolvedLabels = [];
  const missingPatterns = [];

  for (const row of source.effects) {
    summary.rowCount += 1;
    let jobs = cache.get(row.heroId);
    if (!jobs) { jobs = heroJobs(row.heroId); cache.set(row.heroId, jobs); }
    const parsed = classifyToken(extractJobToken(row.skill.descriptionCn), jobs);
    const key = sourceKey(row);
    const override = overrides.get(key);
    const currentPolicyJobId = override ? override.presentationJobId : row.condition.conditionParamJobId;

    if (parsed.classification === 'EXACT_JOB_NAME') {
      summary.exactJobNameRows += 1;
      if (parsed.job.jobId === row.condition.conditionParamJobId) summary.exactSkillEqualsConditionParamRows += 1;
      else summary.exactSkillDiffersFromConditionParamRows += 1;
      if (parsed.job.jobId === currentPolicyJobId) summary.exactSkillEqualsCurrentPolicyRows += 1;
      else {
        summary.exactSkillDiffersFromCurrentPolicyRows += 1;
        exactPolicyDifferences.push({
          heroId: row.heroId,
          heroNameCn: row.identity?.nameCn ?? null,
          heartFetterLevel: row.heartFetterLevel,
          skillId: row.skill.skillId,
          buffId: row.buff.buffId,
          conditionParamJobId: row.condition.conditionParamJobId,
          currentPolicyJobId,
          skillJob: parsed.job,
          skillJobToken: parsed.token,
          skillDescriptionCn: row.skill.descriptionCn,
          buffDescriptionCn: row.buff.descriptionCn,
        });
      }
    } else if (parsed.classification === 'EXCLUSION_ADVANCED_JOB_SET') {
      summary.exclusionAdvancedJobSetRows += 1;
      if (parsed.excludedJob.jobId === row.condition.conditionParamJobId) summary.exclusionRowsWhereConditionParamIsExcludedJob += 1;
      else summary.exclusionRowsWhereConditionParamIsOtherJob += 1;
      exclusions.push({
        heroId: row.heroId,
        heroNameCn: row.identity?.nameCn ?? null,
        heartFetterLevel: row.heartFetterLevel,
        skillId: row.skill.skillId,
        buffId: row.buff.buffId,
        conditionParamJobId: row.condition.conditionParamJobId,
        currentPolicyJobId,
        token: parsed.token,
        excludedJob: parsed.excludedJob,
        skillDescriptionCn: row.skill.descriptionCn,
        buffDescriptionCn: row.buff.descriptionCn,
      });
    } else if (parsed.classification === 'UNRESOLVED_SOURCE_JOB_LABEL') {
      summary.unresolvedSourceJobLabelRows += 1;
      unresolvedLabels.push({
        heroId: row.heroId,
        heroNameCn: row.identity?.nameCn ?? null,
        heartFetterLevel: row.heartFetterLevel,
        skillId: row.skill.skillId,
        buffId: row.buff.buffId,
        conditionParamJobId: row.condition.conditionParamJobId,
        currentPolicyJobId,
        token: parsed.token,
        frozenJobs: [...jobs.entries()].map(([jobId, nameCn]) => ({ jobId, nameCn })),
        skillDescriptionCn: row.skill.descriptionCn,
        buffDescriptionCn: row.buff.descriptionCn,
      });
    } else {
      summary.missingPatternRows += 1;
      missingPatterns.push({
        heroId: row.heroId,
        heroNameCn: row.identity?.nameCn ?? null,
        heartFetterLevel: row.heartFetterLevel,
        skillId: row.skill.skillId,
        buffId: row.buff.buffId,
        conditionParamJobId: row.condition.conditionParamJobId,
        skillDescriptionCn: row.skill.descriptionCn,
      });
    }
  }

  assert.strictEqual(summary.rowCount, 1158);
  assert.strictEqual(summary.exactJobNameRows + summary.exclusionAdvancedJobSetRows + summary.unresolvedSourceJobLabelRows + summary.missingPatternRows, 1158);
  process.stdout.write(`${JSON.stringify({
    status: 'PASS_TOKEN_DIAGNOSTIC_ONLY',
    semanticAuthority: false,
    relationMutationAllowed: false,
    parserRule: 'Extract the literal token between 职业为 and 生效, then compare by exact same-hero frozen Job name; recognize 除<job>以外高级职业 as an exclusion set.',
    summary,
    exactPolicyDifferenceCount: exactPolicyDifferences.length,
    exactPolicyDifferences,
    exclusionCount: exclusions.length,
    exclusions,
    unresolvedSourceJobLabelCount: unresolvedLabels.length,
    unresolvedSourceJobLabels: unresolvedLabels,
    missingPatternCount: missingPatterns.length,
    missingPatterns,
  })}\n`);
}

main();
