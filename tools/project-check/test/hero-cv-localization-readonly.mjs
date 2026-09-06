import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const freezePath = 'data/presentation/hero-cv-localization-stage4-freeze.v1.json';
const freeze = JSON.parse(fs.readFileSync(path.join(repoRoot, freezePath), 'utf8'));

assert.equal(freeze.stage, 'hero-cv-localization-stage4');
assert.equal(freeze.checkpoint, 'localization-freeze');
assert.equal(freeze.status, 'FROZEN');
assert.equal(freeze.ownership?.layer, 'presentation/localization');
assert.equal(freeze.ownership?.semanticReopen, false);
assert.equal(freeze.policy?.sourceValuePreserved, true);
assert.equal(freeze.policy?.variantField, false);
assert.equal(freeze.policy?.oneFinalKoreanDisplayNamePerSourceValue, true);
assert.equal(freeze.policy?.autoTransliteration, false);
assert.equal(freeze.policy?.compositeSourceValuesRemainAtomic, true);
assert.deepEqual(freeze.policy?.reviewStatusAllowedAfterFreeze, []);

const sourceValidationPath = freeze.authoritativeCvValidation?.path;
assert.equal(typeof sourceValidationPath, 'string');
const sourceValidation = JSON.parse(fs.readFileSync(path.join(repoRoot, sourceValidationPath), 'utf8'));

assert.equal(sourceValidation.status, 'PASS');
assert.equal(sourceValidation.semantics?.cvField, 'ConfigDataCharImageInfo.CVName');
assert.equal(sourceValidation.semantics?.normalization, 'trim whitespace only; preserve source spelling');

const noCvMarker = freeze.authoritativeCvValidation?.noCvMarker;
assert.equal(noCvMarker, '■■■■');
const sourceDistribution = sourceValidation.cvNameDistribution ?? [];
const noCvDistribution = sourceDistribution.filter(row => row.cvNameRaw === noCvMarker);
assert.equal(noCvDistribution.length, 1);
assert.equal(noCvDistribution[0].heroCount, 3);

const namedSourceValues = sourceDistribution
  .map(row => row.cvNameRaw)
  .filter(value => value !== noCvMarker)
  .sort();
const records = freeze.records ?? [];
const frozenSourceValues = records.map(row => row.sourceValue).sort();

assert.equal(new Set(namedSourceValues).size, namedSourceValues.length, 'authoritative named CV source values must be unique');
assert.equal(new Set(frozenSourceValues).size, frozenSourceValues.length, 'freeze sourceValue must be unique');
assert.deepEqual(frozenSourceValues, namedSourceValues, 'freeze must cover exactly the current authoritative named CV sourceValue set');

for (const record of records) {
  assert.equal(record.status, 'CONFIRMED', `non-confirmed CV localization: ${record.sourceValue}`);
  assert.equal(typeof record.sourceValue, 'string');
  assert.ok(record.sourceValue.length > 0);
  assert.notEqual(record.sourceValue, noCvMarker);
  assert.equal(typeof record.nameKr, 'string');
  assert.ok(record.nameKr.trim().length > 0, `empty Korean CV display name: ${record.sourceValue}`);
}

const expectedNoCvHeroIds = [...(freeze.authoritativeCvValidation?.confirmedNoCvHeroIds ?? [])].sort((a, b) => a - b);
const currentNoCvHeroIds = [...(sourceValidation.coverage?.confirmedNoVoiceActorHeroIds ?? [])].sort((a, b) => a - b);
assert.deepEqual(expectedNoCvHeroIds, currentNoCvHeroIds, 'confirmed no-CV Hero IDs must stay aligned with authoritative validation');

assert.equal(freeze.counts?.records, records.length);
assert.equal(freeze.counts?.confirmed, records.length);
assert.equal(freeze.counts?.review, 0);
assert.equal(freeze.counts?.unresolved, 0);
assert.equal(freeze.counts?.confirmedTransliteration, 0);
assert.equal(freeze.counts?.noCvExcludedHeroCount, currentNoCvHeroIds.length);
assert.equal(records.length, namedSourceValues.length);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'HERO_CV_LOCALIZATION_STAGE4_FREEZE_READONLY',
  freezePath,
  authoritativeCvValidation: sourceValidationPath,
  namedSourceValueCount: namedSourceValues.length,
  confirmedCount: records.length,
  noCvExcludedHeroIds: currentNoCvHeroIds,
  boundaries: {
    semanticRecomputation: false,
    heroIdMaterialization: false,
    sourceValueMutation: false,
  },
}, null, 2));
