'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROJECTION = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const DIAGNOSTIC = path.join(ROOT, 'data/validation/hero-heart-fetter-ainz-ct7-source-diagnostic.v1.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function main() {
  const projection = read(PROJECTION);
  const diagnostic = read(DIAGNOSTIC);

  assert.strictEqual(projection.stage, 'hero-heart-fetter-job-effect-research-v1');
  assert.strictEqual(projection.status, 'RESEARCH_PROJECTION');
  assert.strictEqual(projection.semanticAuthority, false);
  assert.strictEqual(projection.productionConsumerAllowed, false);
  assert.strictEqual(projection.effectRowCount, 1158);

  const projectedNamesByHero = new Map();
  for (const row of projection.effects) {
    let names = projectedNamesByHero.get(row.heroId);
    if (!names) { names = new Set(); projectedNamesByHero.set(row.heroId, names); }
    if (row?.job?.nameCn) names.add(row.job.nameCn);
  }

  const exceptions = [];
  let matched = 0;
  for (const row of projection.effects) {
    const name = row?.job?.nameCn;
    assert.strictEqual(typeof name, 'string', `Hero ${row.heroId}: missing projected Job name`);
    const skillDesc = row?.skill?.descriptionCn || '';
    const buffDesc = row?.buff?.descriptionCn || '';
    if (skillDesc.includes(name) || buffDesc.includes(name)) {
      matched += 1;
      continue;
    }
    const otherNames = [...(projectedNamesByHero.get(row.heroId) || [])]
      .filter((candidate) => candidate !== name && (skillDesc.includes(candidate) || buffDesc.includes(candidate)))
      .sort();
    exceptions.push({
      heroId: row.heroId,
      heartFetterLevel: row.heartFetterLevel,
      conditionParamJobId: row.job.jobId,
      conditionParamJobNameCn: name,
      skillId: row.skill.skillId,
      buffId: row.buff.buffId,
      sourceDescriptionNamesJobCn: otherNames.length === 1 ? otherNames[0] : null,
    });
  }

  const expected = [
    {heartFetterLevel:4, conditionParamJobId:733, conditionParamJobNameCn:'巅峰不死者', skillId:971602, buffId:971602, sourceDescriptionNamesJobCn:'死之统治者'},
    {heartFetterLevel:4, conditionParamJobId:1030, conditionParamJobNameCn:'死之统治者', skillId:971601, buffId:971601, sourceDescriptionNamesJobCn:'巅峰不死者'},
    {heartFetterLevel:7, conditionParamJobId:733, conditionParamJobNameCn:'巅峰不死者', skillId:971604, buffId:971604, sourceDescriptionNamesJobCn:'死之统治者'},
    {heartFetterLevel:7, conditionParamJobId:1030, conditionParamJobNameCn:'死之统治者', skillId:971603, buffId:971603, sourceDescriptionNamesJobCn:'巅峰不死者'},
  ].map((row) => ({heroId:134, ...row}));

  assert.strictEqual(matched, 1154);
  assert.deepStrictEqual(exceptions, expected);
  assert.strictEqual(diagnostic.fullPopulationDiagnostic.effectRowCount, 1158);
  assert.strictEqual(diagnostic.fullPopulationDiagnostic.rowsWhereConditionParamJobNameAppearsInSkillOrBuffDescription, 1154);
  assert.strictEqual(diagnostic.fullPopulationDiagnostic.rowsWhereConditionParamJobNameAppearsInNeitherDescription, 4);
  assert.strictEqual(diagnostic.fullPopulationDiagnostic.exceptionHeroCount, 1);
  assert.strictEqual(diagnostic.fullPopulationDiagnostic.exceptionHeroId, 134);
  assert.deepStrictEqual(diagnostic.hero134.exceptionRows, expected.map(({heroId, ...row}) => row));
  assert.strictEqual(diagnostic.validatedConclusions.conditionParamUniversallyEqualsSourceNamedActivationJob, false);
  assert.strictEqual(diagnostic.validatedConclusions.conditionParamMayBeUsedAsUniversalDisplayJob, false);
  assert.strictEqual(diagnostic.validatedConclusions.previousUniversalActivationJobHypothesisRejected, true);
  assert.strictEqual(diagnostic.semanticBoundary.productionFrontendConsumption, false);

  process.stdout.write(`${JSON.stringify({status:'PASS_HERO_HEART_FETTER_AINZ_CT7_SOURCE_DIAGNOSTIC_V1', matchedRows:matched, exceptionRows:exceptions.length, exceptionHeroId:134})}\n`);
}

main();
