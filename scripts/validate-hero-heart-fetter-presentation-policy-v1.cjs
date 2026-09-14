'use strict';

const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POLICY_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-presentation-policy.v1.json');
const PROJECTION_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const TOKEN_EVIDENCE_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-skill-job-token-diagnostic.v1.json');
const DIAGNOSTIC = path.join(ROOT, 'scripts/diagnose-hero-heart-fetter-skill-job-description-v1.cjs');
const HERO_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sourceKey(row) { return [row.heroId, row.heartFetterLevel, row.skill.skillId, row.buff.buffId, row.condition.conditionParamJobId].join(':'); }
function policyKey(row) { return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'); }
function heroJobIds(heroId) {
  const shard = read(path.join(HERO_DIR, `${heroId}.json`));
  const ids = new Set((shard?.normal?.jobTree?.connections || []).map((row) => row?.jobId));
  if (shard?.sp?.job?.jobId) ids.add(shard.sp.job.jobId);
  return ids;
}
function mapByKey(rows) { return new Map(rows.map((row) => [policyKey(row), row])); }

function main() {
  const policy = read(POLICY_PATH);
  const projection = read(PROJECTION_PATH);
  const evidence = read(TOKEN_EVIDENCE_PATH);
  const diagnostic = JSON.parse(cp.execFileSync(process.execPath, [DIAGNOSTIC], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim());

  assert.strictEqual(policy.stage, 'hero-heart-fetter-presentation-policy-v1');
  assert.strictEqual(policy.status, 'RESEARCH_POLICY');
  assert.strictEqual(policy.owner, 'hero-canonical-research');
  assert.strictEqual(policy.baseline.expectedHead, '463c536a604463de0fd3e3f40a3dd967a74431ad');
  assert.strictEqual(policy.policy.defaultRuleRowCount, 1142);
  assert.strictEqual(policy.policy.overrideRowCount, 6);
  assert.strictEqual(policy.policy.exclusionSetRowCount, 8);
  assert.strictEqual(policy.policy.reviewFallbackRowCount, 2);
  assert.strictEqual(policy.policy.totalMappedRowCount, 1158);
  assert.strictEqual(policy.validationBoundary.productionFrontendConsumption, false);
  assert.strictEqual(policy.validationBoundary.canonicalRelationMutation, false);
  assert.strictEqual(policy.validationBoundary.createApplicableJobIds, false);
  assert.strictEqual(policy.validationBoundary.createJobRestricted, false);
  assert.strictEqual(policy.validationBoundary.reviewFallbackMayBePromotedWithoutNewEvidence, false);

  assert.strictEqual(projection.stage, 'hero-heart-fetter-job-effect-research-v1');
  assert.strictEqual(projection.status, 'RESEARCH_PROJECTION');
  assert.strictEqual(projection.semanticAuthority, false);
  assert.strictEqual(projection.productionConsumerAllowed, false);
  assert.strictEqual(projection.effectRowCount, 1158);
  assert.strictEqual(evidence.fullPopulationEvidence.exactSkillEqualsConditionParamRows, 1142);
  assert.strictEqual(evidence.exactConditionParamDifferences.count, 6);
  assert.strictEqual(evidence.matthewExclusionRows.rowCount, 8);
  assert.strictEqual(evidence.unresolvedSourceLabels.length, 2);
  assert.strictEqual(diagnostic.exactConditionParamDifferenceCount, 6);
  assert.strictEqual(diagnostic.exclusionCount, 8);
  assert.strictEqual(diagnostic.unresolvedSourceJobLabelCount, 2);
  assert.strictEqual(diagnostic.missingPatternCount, 0);

  const overrides = mapByKey(policy.policy.explicitOverrides);
  const exclusions = mapByKey(policy.policy.exclusionSetRows);
  const reviews = mapByKey(policy.policy.reviewFallbacks);
  assert.strictEqual(overrides.size, 6);
  assert.strictEqual(exclusions.size, 8);
  assert.strictEqual(reviews.size, 2);
  for (const k of overrides.keys()) assert(!exclusions.has(k) && !reviews.has(k), `overlapping policy key ${k}`);
  for (const k of exclusions.keys()) assert(!reviews.has(k), `overlapping policy key ${k}`);

  const expectedOverrides = new Map(diagnostic.exactConditionParamDifferences.map((row) => [
    [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'),
    row.skillJob.jobId,
  ]));
  assert.strictEqual(expectedOverrides.size, 6);
  assert.deepStrictEqual([...expectedOverrides.keys()].sort(), [...overrides.keys()].sort());
  for (const [k, row] of overrides) assert.strictEqual(row.presentationJobId, expectedOverrides.get(k), `override presentation job mismatch ${k}`);

  const expectedExclusions = new Map(diagnostic.exclusions.map((row) => [
    [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'),
    { presentationJobId: row.conditionParamJobId, excludedJobId: row.excludedJob.jobId },
  ]));
  assert.deepStrictEqual([...expectedExclusions.keys()].sort(), [...exclusions.keys()].sort());
  for (const [k, row] of exclusions) {
    const expected = expectedExclusions.get(k);
    assert.strictEqual(row.presentationJobId, expected.presentationJobId, `exclusion presentation job mismatch ${k}`);
    assert.strictEqual(row.excludedJobId, expected.excludedJobId, `exclusion excluded job mismatch ${k}`);
    assert.notStrictEqual(row.presentationJobId, row.excludedJobId, `excluded job used as presentation job ${k}`);
  }

  const expectedReviews = new Map(diagnostic.unresolvedSourceJobLabels.map((row) => [
    [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'),
    row.conditionParamJobId,
  ]));
  assert.deepStrictEqual([...expectedReviews.keys()].sort(), [...reviews.keys()].sort());
  for (const [k, row] of reviews) {
    assert.strictEqual(row.presentationJobId, expectedReviews.get(k), `review fallback job mismatch ${k}`);
    assert.strictEqual(row.reviewReason, 'SKILL_LABEL_UNRESOLVED_AGAINST_FROZEN_JOB_SET');
  }

  let defaults = 0;
  let overridden = 0;
  let exclusionMembers = 0;
  let reviewFallbacks = 0;
  const seen = new Set();
  for (const row of projection.effects) {
    const k = sourceKey(row);
    assert(!seen.has(k), `duplicate mapping key ${k}`);
    seen.add(k);
    const special = overrides.get(k) || exclusions.get(k) || reviews.get(k);
    const presentationJobId = special ? special.presentationJobId : row.condition.conditionParamJobId;
    assert(heroJobIds(row.heroId).has(presentationJobId), `Hero ${row.heroId}: presentation Job ${presentationJobId} not in frozen hero job set`);
    if (overrides.has(k)) overridden += 1;
    else if (exclusions.has(k)) exclusionMembers += 1;
    else if (reviews.has(k)) reviewFallbacks += 1;
    else defaults += 1;
  }

  assert.strictEqual(seen.size, 1158);
  assert.strictEqual(defaults, 1142);
  assert.strictEqual(overridden, 6);
  assert.strictEqual(exclusionMembers, 8);
  assert.strictEqual(reviewFallbacks, 2);
  for (const k of [...overrides.keys(), ...exclusions.keys(), ...reviews.keys()]) assert(seen.has(k), `policy key missing from tracked projection: ${k}`);

  process.stdout.write(`${JSON.stringify({status:'PASS_HEART_FETTER_PRESENTATION_POLICY_V1', mappedRows:1158, defaultRows:1142, overrideRows:6, exclusionSetRows:8, reviewFallbackRows:2})}\n`);
}

main();
