'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POLICY_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-presentation-policy.v1.json');
const PROJECTION_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const AINZ_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-ainz-ct7-source-diagnostic.v1.json');
const HERO_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function key(row) { return [row.heroId, row.heartFetterLevel, row.skill.skillId, row.buff.buffId, row.condition.conditionParamJobId].join(':'); }
function overrideKey(row) { return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'); }
function heroJobIds(heroId) {
  const shard = read(path.join(HERO_DIR, `${heroId}.json`));
  const ids = new Set((shard?.normal?.jobTree?.connections || []).map((row) => row?.jobId));
  if (shard?.sp?.job?.jobId) ids.add(shard.sp.job.jobId);
  return ids;
}

function main() {
  const policy = read(POLICY_PATH);
  const projection = read(PROJECTION_PATH);
  const ainz = read(AINZ_PATH);

  assert.strictEqual(policy.stage, 'hero-heart-fetter-presentation-policy-v1');
  assert.strictEqual(policy.status, 'RESEARCH_POLICY');
  assert.strictEqual(policy.owner, 'hero-canonical-research');
  assert.strictEqual(policy.baseline.expectedHead, '472474bc04b9a64b8681a9d7cdcae21e1e4c2f49');
  assert.strictEqual(policy.policy.defaultRuleRowCount, 1154);
  assert.strictEqual(policy.policy.overrideRowCount, 4);
  assert.strictEqual(policy.policy.totalMappedRowCount, 1158);
  assert.strictEqual(policy.validationBoundary.productionFrontendConsumption, false);
  assert.strictEqual(policy.validationBoundary.canonicalRelationMutation, false);
  assert.strictEqual(policy.validationBoundary.createApplicableJobIds, false);
  assert.strictEqual(policy.validationBoundary.createJobRestricted, false);

  assert.strictEqual(projection.stage, 'hero-heart-fetter-job-effect-research-v1');
  assert.strictEqual(projection.status, 'RESEARCH_PROJECTION');
  assert.strictEqual(projection.semanticAuthority, false);
  assert.strictEqual(projection.productionConsumerAllowed, false);
  assert.strictEqual(projection.effectRowCount, 1158);
  assert.strictEqual(ainz.fullPopulationDiagnostic.rowsWhereConditionParamJobNameAppearsInSkillOrBuffDescription, 1154);
  assert.strictEqual(ainz.fullPopulationDiagnostic.rowsWhereConditionParamJobNameAppearsInNeitherDescription, 4);

  const overrides = new Map(policy.policy.explicitOverrides.map((row) => [overrideKey(row), row]));
  assert.strictEqual(overrides.size, 4);

  const expectedAinz = new Map(ainz.hero134.exceptionRows.map((row) => [
    [134, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'),
    row.sourceDescriptionNamesJobCn,
  ]));
  assert.strictEqual(expectedAinz.size, 4);

  let defaults = 0;
  let overridden = 0;
  const seen = new Set();
  for (const row of projection.effects) {
    const k = key(row);
    assert(!seen.has(k), `duplicate mapping key ${k}`);
    seen.add(k);
    const override = overrides.get(k);
    const presentationJobId = override ? override.presentationJobId : row.condition.conditionParamJobId;
    const jobs = heroJobIds(row.heroId);
    assert(jobs.has(presentationJobId), `Hero ${row.heroId}: presentation Job ${presentationJobId} not in frozen hero job set`);

    if (override) {
      overridden += 1;
      assert.strictEqual(row.heroId, 134, `unexpected override hero ${row.heroId}`);
      const shard = read(path.join(HERO_DIR, '134.json'));
      const allJobs = [...(shard?.normal?.jobTree?.connections || [])];
      if (shard?.sp?.job) allJobs.push({ jobId: shard.sp.job.jobId, job: shard.sp.job });
      const target = allJobs.find((candidate) => candidate?.jobId === presentationJobId);
      assert(target, `Ainz presentation Job ${presentationJobId} missing`);
      const nameCn = target?.job?.nameCn || target?.nameCn;
      assert.strictEqual(nameCn, expectedAinz.get(k), `Ainz override ${k}: source-named job mismatch`);
      assert((row.skill.descriptionCn || '').includes(nameCn), `Ainz override ${k}: Skill description does not name presentation job`);
      assert((row.buff.descriptionCn || '').includes(nameCn), `Ainz override ${k}: Buff description does not name presentation job`);
    } else {
      defaults += 1;
      const nameCn = row?.job?.nameCn;
      assert.strictEqual(typeof nameCn, 'string', `Hero ${row.heroId}: missing ConditionParam job name`);
      assert((row.skill.descriptionCn || '').includes(nameCn) || (row.buff.descriptionCn || '').includes(nameCn), `Default row ${k}: source diagnostic support missing`);
    }
  }

  assert.strictEqual(seen.size, 1158);
  assert.strictEqual(defaults, 1154);
  assert.strictEqual(overridden, 4);
  for (const k of overrides.keys()) assert(seen.has(k), `override does not resolve to tracked projection row: ${k}`);

  process.stdout.write(`${JSON.stringify({status:'PASS_HEART_FETTER_PRESENTATION_POLICY_V1', mappedRows:seen.size, defaultRows:defaults, overrideRows:overridden})}\n`);
}

main();
