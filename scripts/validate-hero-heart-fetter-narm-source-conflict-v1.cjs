'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-narm-source-conflict.v1.json');
const PROJECTION_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const TOKEN_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-skill-job-token-diagnostic.v1.json');
const HERO_PATH = path.join(ROOT, 'data/generated/hero-detail/by-id/11.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function rowKey(row) { return [row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'); }

function main() {
  const evidence = read(EVIDENCE_PATH);
  const projection = read(PROJECTION_PATH);
  const token = read(TOKEN_PATH);
  const hero = read(HERO_PATH);

  assert.strictEqual(evidence.stage, 'hero-heart-fetter-narm-source-conflict-v1');
  assert.strictEqual(evidence.status, 'PASS_WITH_REVIEW');
  assert.strictEqual(evidence.owner, 'hero-canonical-research');
  assert.strictEqual(evidence.hero.heroId, 11);
  assert.strictEqual(evidence.hero.resolvedFrozenJob.jobId, 622);
  assert.strictEqual(evidence.hero.resolvedFrozenJob.nameCn, '游侠将军');
  assert.strictEqual(evidence.hero.conflictingSkillLabelCn, '游侠统帅');
  assert.strictEqual(evidence.semanticBoundary.semanticAuthority, false);
  assert.strictEqual(evidence.semanticBoundary.productionFrontendConsumption, false);
  assert.strictEqual(evidence.semanticBoundary.mayUseNameSimilarityToResolveRelation, false);

  const frozenJobs = new Map();
  for (const connection of hero?.normal?.jobTree?.connections || []) frozenJobs.set(connection.jobId, connection?.job?.nameCn ?? null);
  if (hero?.sp?.job?.jobId) frozenJobs.set(hero.sp.job.jobId, hero.sp.job.nameCn ?? null);
  assert.strictEqual(frozenJobs.get(622), '游侠将军');

  const unresolved = token.unresolvedSourceLabels.filter((row) => row.heroId === 11);
  assert.strictEqual(unresolved.length, 2);
  assert(unresolved.every((row) => row.skillJobLabelCn === '游侠统帅' && row.conditionParamJobId === 622 && row.conditionParamJobNameCn === '游侠将军'));

  const expected = new Map(evidence.rows.map((row) => [rowKey(row), row]));
  assert.strictEqual(expected.size, 2);
  const actual = [];
  for (const row of projection.effects || []) {
    if (row.heroId !== 11 || ![971965, 971966].includes(row.skill.skillId)) continue;
    const record = {
      heartFetterLevel: row.heartFetterLevel,
      skillId: row.skill.skillId,
      buffId: row.buff.buffId,
      conditionParamJobId: row.condition.conditionParamJobId,
      skillJobLabelCn: '游侠统帅',
      buffJobLabelCn: '游侠将军',
      resolvedPresentationJobId: 622,
    };
    assert((row.skill.descriptionCn || '').includes('游侠统帅'), `Narm Skill ${row.skill.skillId}: expected conflicting label missing`);
    assert((row.buff.descriptionCn || '').includes('游侠将军'), `Narm Buff ${row.buff.buffId}: expected frozen job label missing`);
    assert.strictEqual(row.condition.conditionParamJobId, 622);
    assert.strictEqual(row.job.jobId, 622);
    assert.strictEqual(row.job.nameCn, '游侠将军');
    actual.push(record);
  }
  assert.strictEqual(actual.length, 2);
  const actualMap = new Map(actual.map((row) => [rowKey(row), row]));
  assert.deepStrictEqual([...actualMap.keys()].sort(), [...expected.keys()].sort());
  for (const [key, row] of expected) assert.deepStrictEqual(actualMap.get(key), row);

  assert.strictEqual(evidence.externalCrossValidation.semanticAuthority, false);
  assert.strictEqual(evidence.externalCrossValidation.sources.length, 2);
  assert.strictEqual(evidence.validatedConclusions.presentationResolutionToJob622Supported, true);
  assert.strictEqual(evidence.validatedConclusions.genericConditionType7PredicateResolved, false);

  process.stdout.write(`${JSON.stringify({status:'PASS_HERO_HEART_FETTER_NARM_SOURCE_CONFLICT_V1', heroId:11, rows:2, presentationJobId:622, genericConditionType7PredicateResolved:false})}\n`);
}

main();
