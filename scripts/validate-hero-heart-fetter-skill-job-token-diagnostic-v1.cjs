'use strict';

const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-skill-job-token-diagnostic.v1.json');
const DIAGNOSTIC = path.join(ROOT, 'scripts/diagnose-hero-heart-fetter-skill-job-description-v1.cjs');
const AINZ_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-ainz-ct7-source-diagnostic.v1.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function key(row) { return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'); }

function main() {
  const evidence = read(EVIDENCE_PATH);
  const ainz = read(AINZ_PATH);
  const stdout = cp.execFileSync(process.execPath, [DIAGNOSTIC], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
  const diagnostic = JSON.parse(stdout);

  assert.strictEqual(evidence.stage, 'hero-heart-fetter-skill-job-token-diagnostic-v1');
  assert.strictEqual(evidence.status, 'PASS_WITH_REVIEW');
  assert.strictEqual(evidence.owner, 'hero-canonical-research');
  assert.strictEqual(evidence.semanticBoundary.semanticAuthority, false);
  assert.strictEqual(evidence.semanticBoundary.productionFrontendConsumption, false);
  assert.strictEqual(evidence.semanticBoundary.unresolvedNarmLabelMayBeSilentlyNormalized, false);

  assert.strictEqual(diagnostic.status, 'PASS_TOKEN_DIAGNOSTIC_ONLY');
  assert.strictEqual(diagnostic.semanticAuthority, false);
  assert.strictEqual(diagnostic.relationMutationAllowed, false);
  assert.deepStrictEqual(evidence.fullPopulationEvidence, diagnostic.summary);

  assert.strictEqual(ainz.fullPopulationDiagnostic.rowsWhereConditionParamJobNameAppearsInNeitherDescription, 4);
  assert.strictEqual(diagnostic.summary.exactSkillDiffersFromConditionParamRows, 6);
  assert.strictEqual(evidence.exactConditionParamDifferences.ainzRows, 4);
  assert.strictEqual(evidence.exactConditionParamDifferences.kaguraRows, 2);

  assert.strictEqual(diagnostic.exactPolicyDifferenceCount, 2);
  const diagnosticKagura = diagnostic.exactPolicyDifferences.map((row) => ({
    heroId: row.heroId,
    heartFetterLevel: row.heartFetterLevel,
    skillId: row.skillId,
    buffId: row.buffId,
    conditionParamJobId: row.conditionParamJobId,
    currentPolicyJobId: row.currentPolicyJobId,
    skillJobId: row.skillJob.jobId,
    skillJobNameCn: row.skillJob.nameCn,
  })).sort((a, b) => key(a).localeCompare(key(b)));
  const frozenKagura = [...evidence.kaguraPolicyContradictions].sort((a, b) => key(a).localeCompare(key(b)));
  assert.deepStrictEqual(frozenKagura, diagnosticKagura);

  assert.strictEqual(diagnostic.exclusionCount, 8);
  assert.strictEqual(evidence.matthewExclusionRows.rowCount, 8);
  assert.strictEqual(evidence.matthewExclusionRows.conditionParamIsExcludedJobCount, 0);
  assert.strictEqual(evidence.matthewExclusionRows.conditionParamIsOtherExplicitJobCount, 8);
  const diagnosticMatthew = diagnostic.exclusions.map((row) => ({
    heartFetterLevel: row.heartFetterLevel,
    skillId: row.skillId,
    buffId: row.buffId,
    conditionParamJobId: row.conditionParamJobId,
  })).sort((a, b) => `${a.heartFetterLevel}:${a.skillId}:${a.buffId}:${a.conditionParamJobId}`.localeCompare(`${b.heartFetterLevel}:${b.skillId}:${b.buffId}:${b.conditionParamJobId}`));
  const frozenMatthew = [...evidence.matthewExclusionRows.rows].sort((a, b) => `${a.heartFetterLevel}:${a.skillId}:${a.buffId}:${a.conditionParamJobId}`.localeCompare(`${b.heartFetterLevel}:${b.skillId}:${b.buffId}:${b.conditionParamJobId}`));
  assert.deepStrictEqual(frozenMatthew, diagnosticMatthew);

  assert.strictEqual(diagnostic.unresolvedSourceJobLabelCount, 2);
  const diagnosticNarm = diagnostic.unresolvedSourceJobLabels.map((row) => ({
    heroId: row.heroId,
    heroNameCn: row.heroNameCn,
    heartFetterLevel: row.heartFetterLevel,
    skillId: row.skillId,
    buffId: row.buffId,
    conditionParamJobId: row.conditionParamJobId,
    skillJobLabelCn: row.token,
    conditionParamJobNameCn: row.frozenJobs.find((job) => job.jobId === row.conditionParamJobId)?.nameCn ?? null,
  }));
  assert.deepStrictEqual(evidence.unresolvedSourceLabels, diagnosticNarm);
  assert.strictEqual(diagnostic.missingPatternCount, 0);

  process.stdout.write(`${JSON.stringify({status:'PASS_HEART_FETTER_SKILL_JOB_TOKEN_DIAGNOSTIC_V1', rowCount:1158, exactRows:1148, exclusionRows:8, unresolvedRows:2, policyContradictions:2})}\n`);
}

main();
