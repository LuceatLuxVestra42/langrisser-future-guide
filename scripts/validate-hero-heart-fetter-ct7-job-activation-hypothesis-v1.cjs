'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HYPOTHESIS = path.join(ROOT, 'data/validation/hero-heart-fetter-ct7-job-activation-hypothesis.v1.json');
const JOB = path.join(ROOT, 'data/validation/hero-heart-fetter-job-param-consistency.v1.json');
const PAIRING = path.join(ROOT, 'data/validation/hero-heart-fetter-level-pairing-consistency.v1.json');
const KAGURA = path.join(ROOT, 'data/validation/hero-heart-fetter-kagura-source-diagnostic.v1.json');
const LINEAGE = path.join(ROOT, 'data/validation/hero-heart-fetter-semantic-lineage-evidence.v1.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function main() {
  const h = read(HYPOTHESIS);
  const job = read(JOB);
  const pairing = read(PAIRING);
  const kagura = read(KAGURA);
  const lineage = read(LINEAGE);

  assert.strictEqual(h.stage, 'hero-heart-fetter-ct7-job-activation-hypothesis-v1');
  assert.strictEqual(h.status, 'RESEARCH_HYPOTHESIS');
  assert.strictEqual(h.owner, 'hero-canonical-research');
  assert.strictEqual(h.baseline.expectedHead, 'cccdd6d9c72f60afa26308a25714473b8e108821');
  assert.strictEqual(h.hypothesis.confidencePercent, 97);

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
  assert.strictEqual(lineage.validatedConclusions.jobOrClassRelationshipStronglySupported, true);

  assert.deepStrictEqual(h.observedEvidence, {
    conditionType: 7,
    conditionCount: 1158,
    paramCount: 1158,
    jobInfoMatchCount: 1158,
    sameHeroFrozenJobMatchCount: 1158,
    mismatchCount: 0,
    heroesWithType7: 267,
    heroesWithBothLv4AndLv7Type7: 267,
    heroesWithMatchingUniqueLv4Lv7JobParamSets: 266,
    heroesWithDifferentUniqueLv4Lv7JobParamSets: 1,
    sourceDescriptionDiagnostic: {
      heroId: 144,
      jobIds: [126, 307],
      descriptionsExplicitlyStateJobActivation: true,
      conditionParamsMatchNamedJobsInCorrespondingBuffRecords: true,
    },
  });

  assert.strictEqual(h.allowedUse.canonicalRelationMutation, false);
  assert.strictEqual(h.allowedUse.createApplicableJobIds, false);
  assert.strictEqual(h.allowedUse.createJobRestricted, false);
  assert.strictEqual(h.allowedUse.changeHeroJobCanonicalRelation, false);
  assert.strictEqual(h.allowedUse.productionFrontendConsumption, false);
  assert.strictEqual(h.allowedUse.rawConfigDataRuntimeFallback, false);

  process.stdout.write(`${JSON.stringify({status:'PASS_CT7_JOB_ACTIVATION_HYPOTHESIS_V1', confidencePercent:h.hypothesis.confidencePercent})}\n`);
}

main();
