'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HYPOTHESIS = path.join(ROOT, 'data/validation/hero-heart-fetter-ct7-job-activation-hypothesis.v1.json');
const JOB = path.join(ROOT, 'data/validation/hero-heart-fetter-job-param-consistency.v1.json');
const PAIRING = path.join(ROOT, 'data/validation/hero-heart-fetter-level-pairing-consistency.v1.json');
const KAGURA = path.join(ROOT, 'data/validation/hero-heart-fetter-kagura-source-diagnostic.v1.json');
const AINZ = path.join(ROOT, 'data/validation/hero-heart-fetter-ainz-ct7-source-diagnostic.v1.json');
const LINEAGE = path.join(ROOT, 'data/validation/hero-heart-fetter-semantic-lineage-evidence.v1.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function main() {
  const h = read(HYPOTHESIS);
  const job = read(JOB);
  const pairing = read(PAIRING);
  const kagura = read(KAGURA);
  const ainz = read(AINZ);
  const lineage = read(LINEAGE);

  assert.strictEqual(h.stage, 'hero-heart-fetter-ct7-job-activation-hypothesis-v1');
  assert.strictEqual(h.status, 'RESEARCH_HYPOTHESIS');
  assert.strictEqual(h.owner, 'hero-canonical-research');
  assert.strictEqual(h.baseline.expectedHead, 'c1f1e1464811709dc51a2f63debfa10e4776de25');
  assert.strictEqual(h.hypothesis.structuralJobReferenceConfidencePercent, 100);
  assert.strictEqual(h.hypothesis.activationJobMappingStatus, 'REJECTED_AS_UNIVERSAL');

  assert.strictEqual(job.evidence.conditionType, 7);
  assert.strictEqual(job.evidence.conditionCount, 1158);
  assert.strictEqual(job.evidence.paramCount, 1158);
  assert.strictEqual(job.evidence.jobInfoMatchCount, 1158);
  assert.strictEqual(job.evidence.frozenHeroJobSetMatchCount, 1158);
  assert.strictEqual(job.evidence.mismatchCount, 0);

  assert.strictEqual(pairing.fullPopulationEvidence.heroPopulationCount, 267);
  assert.strictEqual(pairing.fullPopulationEvidence.levelPairing.heroesWithType7, 267);
  assert.strictEqual(pairing.fullPopulationEvidence.levelPairing.heroesWithBothLevels, 267);
  assert.strictEqual(pairing.fullPopulationEvidence.levelPairing.identicalUniqueParamSetHeroCount, 266);
  assert.strictEqual(pairing.fullPopulationEvidence.levelPairing.differentUniqueParamSetHeroCount, 1);

  assert.strictEqual(kagura.hero144.identity.heroId, 144);
  assert.deepStrictEqual(kagura.hero144.targetJobs.map((row) => row.jobId), [126, 307]);
  assert.strictEqual(kagura.validatedConclusions.sourceDescriptionsExplicitlyStateJobActivation, true);
  assert.strictEqual(kagura.validatedConclusions.conditionType7ParamsMatchTheNamedExplicitJobsInTheCorrespondingBuffRecords, true);

  assert.strictEqual(ainz.fullPopulationDiagnostic.effectRowCount, 1158);
  assert.strictEqual(ainz.fullPopulationDiagnostic.rowsWhereConditionParamJobNameAppearsInSkillOrBuffDescription, 1154);
  assert.strictEqual(ainz.fullPopulationDiagnostic.rowsWhereConditionParamJobNameAppearsInNeitherDescription, 4);
  assert.strictEqual(ainz.fullPopulationDiagnostic.exceptionHeroId, 134);
  assert.strictEqual(ainz.validatedConclusions.conditionParamUniversallyEqualsSourceNamedActivationJob, false);
  assert.strictEqual(ainz.validatedConclusions.previousUniversalActivationJobHypothesisRejected, true);
  assert.strictEqual(lineage.validatedConclusions.jobOrClassRelationshipStronglySupported, true);

  assert.deepStrictEqual(h.observedEvidence.sourceDescriptionConsistency, {
    rowsWhereConditionParamJobNameAppearsInSkillOrBuffDescription: 1154,
    rowsWhereConditionParamJobNameAppearsInNeitherDescription: 4,
    exceptionHeroId: 134,
  });

  assert.strictEqual(h.allowedUse.researchProjection, true);
  assert.strictEqual(h.allowedUse.conditionParamJobReferenceProjection, true);
  assert.strictEqual(h.allowedUse.conditionParamAsUniversalActivationJob, false);
  assert.strictEqual(h.allowedUse.conditionParamAsUniversalDisplayJob, false);
  assert.strictEqual(h.allowedUse.canonicalRelationMutation, false);
  assert.strictEqual(h.allowedUse.createApplicableJobIds, false);
  assert.strictEqual(h.allowedUse.createJobRestricted, false);
  assert.strictEqual(h.allowedUse.changeHeroJobCanonicalRelation, false);
  assert.strictEqual(h.allowedUse.productionFrontendConsumption, false);
  assert.strictEqual(h.allowedUse.rawConfigDataRuntimeFallback, false);

  process.stdout.write(`${JSON.stringify({status:'PASS_CT7_STRUCTURAL_JOB_REFERENCE_BOUNDARY_V1', structuralJobReferenceConfidencePercent:100, activationJobMappingStatus:h.hypothesis.activationJobMappingStatus})}\n`);
}

main();
