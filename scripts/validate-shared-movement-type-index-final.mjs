import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));

const paths = {
  contract: 'data/contracts/hero-soldier-movement-type-presentation.v1.json',
  heroJobs: 'data/generated/hero-job-links.v1.json',
  soldierMaster: 'data/generated/soldier-master.v1.json',
  jobInfo: 'data/configdata/ConfigDataJobInfo.json',
  soldierInfo: 'data/configdata/ConfigDataSoldierInfo.json',
  generated: 'data/generated/shared-movement-type-index.v1.json',
  validation: 'data/validation/shared-movement-type-index-final.v1.json',
};

const contract = readJson(paths.contract);
const heroJobs = readJson(paths.heroJobs);
const soldierMaster = readJson(paths.soldierMaster);
const jobInfo = readJson(paths.jobInfo);
const soldierInfo = readJson(paths.soldierInfo);
const generated = readJson(paths.generated);
const validation = readJson(paths.validation);
const errors = [];
const fail = (code, detail) => errors.push({ code, detail });

function indexByIntegerId(records, label) {
  const map = new Map();
  const duplicates = [];
  for (const record of records || []) {
    if (!Number.isInteger(record?.ID)) continue;
    if (map.has(record.ID)) duplicates.push(record.ID);
    else map.set(record.ID, record);
  }
  if (duplicates.length) fail(`${label}-duplicate-id`, [...new Set(duplicates)].sort((a, b) => a - b));
  return map;
}

function uniqueSortedIntegers(values) {
  return [...new Set((values || []).filter(Number.isInteger))].sort((a, b) => a - b);
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizedMovePoint(value) {
  return Number.isFinite(value) ? value : null;
}

if (contract?.status !== 'FROZEN') fail('contract-not-frozen', contract?.status ?? null);
if (!Array.isArray(contract?.definitions)) fail('contract-definitions-not-array', null);
if (!Array.isArray(heroJobs?.records)) fail('hero-job-links-records-not-array', null);
if (!Array.isArray(soldierMaster?.records)) fail('soldier-master-records-not-array', null);
if (!Array.isArray(jobInfo)) fail('job-info-not-array', null);
if (!Array.isArray(soldierInfo)) fail('soldier-info-not-array', null);
if (generated?.schemaId !== 'shared-movement-type-index/v1' || generated?.status !== 'PASS') {
  fail('generated-index-not-pass', { schemaId: generated?.schemaId ?? null, status: generated?.status ?? null });
}
if (validation?.schemaId !== 'shared-movement-type-index-validation/v1' || validation?.status !== 'PASS') {
  fail('validation-artifact-not-pass', { schemaId: validation?.schemaId ?? null, status: validation?.status ?? null });
}

const expectedDefinitions = (contract.definitions || []).map(({ id, key, nameKr, iconFileName }) => ({ id, key, nameKr, iconFileName }));
const definitionIds = expectedDefinitions.map((item) => item.id);
if (expectedDefinitions.length !== 5 || !sameJson([...definitionIds].sort((a, b) => a - b), [1, 2, 3, 4, 5])) {
  fail('movement-definition-set', definitionIds);
}
if (!sameJson(generated?.definitions, expectedDefinitions)) fail('generated-definition-parity', null);

const allowedMoveTypes = new Set(definitionIds);
const jobIndex = indexByIntegerId(jobInfo, 'job-info');
const soldierIndex = indexByIntegerId(soldierInfo, 'soldier-info');
const heroJobIds = uniqueSortedIntegers(
  (heroJobs.records || []).flatMap((hero) =>
    Array.isArray(hero?.connections) ? hero.connections.map((connection) => connection?.jobId) : [],
  ),
);
const soldierIds = uniqueSortedIntegers((soldierMaster.records || []).map((soldier) => soldier?.soldierId));

if ((heroJobs.records || []).length !== 267) fail('canonical-hero-count', (heroJobs.records || []).length);
if (heroJobIds.length !== 804) fail('canonical-hero-job-count', heroJobIds.length);
if (soldierIds.length !== 224) fail('canonical-soldier-count', soldierIds.length);

const generatedHeroJobs = generated?.heroJobsById || {};
const generatedSoldiers = generated?.soldiersById || {};
const generatedHeroJobIds = uniqueSortedIntegers(Object.keys(generatedHeroJobs).map(Number));
const generatedSoldierIds = uniqueSortedIntegers(Object.keys(generatedSoldiers).map(Number));
if (!sameJson(generatedHeroJobIds, heroJobIds)) fail('hero-job-id-coverage', { expected: heroJobIds.length, actual: generatedHeroJobIds.length });
if (!sameJson(generatedSoldierIds, soldierIds)) fail('soldier-id-coverage', { expected: soldierIds.length, actual: generatedSoldierIds.length });

for (const jobId of heroJobIds) {
  const source = jobIndex.get(jobId);
  const actual = generatedHeroJobs[String(jobId)];
  if (!source) {
    fail('hero-job-source-missing', jobId);
    continue;
  }
  if (!actual) {
    fail('hero-job-generated-missing', jobId);
    continue;
  }
  if (!allowedMoveTypes.has(source.MoveType)) fail('hero-job-source-move-type-invalid', { jobId, moveType: source.MoveType ?? null });
  if (actual.moveType !== source.MoveType) fail('hero-job-move-type-mismatch', { jobId, expected: source.MoveType, actual: actual.moveType });
  if (actual.movePoint !== normalizedMovePoint(source.BF_MovePoint)) fail('hero-job-move-point-mismatch', jobId);
  if ((actual.nameCn ?? null) !== (source.Name ?? null)) fail('hero-job-source-name-mismatch', jobId);
}

for (const soldierId of soldierIds) {
  const source = soldierIndex.get(soldierId);
  const actual = generatedSoldiers[String(soldierId)];
  if (!source) {
    fail('soldier-source-missing', soldierId);
    continue;
  }
  if (!actual) {
    fail('soldier-generated-missing', soldierId);
    continue;
  }
  if (!allowedMoveTypes.has(source.MoveType)) fail('soldier-source-move-type-invalid', { soldierId, moveType: source.MoveType ?? null });
  if (actual.moveType !== source.MoveType) fail('soldier-move-type-mismatch', { soldierId, expected: source.MoveType, actual: actual.moveType });
  if (actual.movePoint !== normalizedMovePoint(source.BF_MovePoint)) fail('soldier-move-point-mismatch', soldierId);
  if ((actual.nameCn ?? null) !== (source.Name ?? null)) fail('soldier-source-name-mismatch', soldierId);
}

const summary = validation?.summary || {};
const expectedSummary = {
  definitionCount: 5,
  canonicalHeroCount: 267,
  heroJobCount: 804,
  generatedHeroJobCount: 804,
  canonicalSoldierCount: 224,
  generatedSoldierCount: 224,
  missingHeroJobCount: 0,
  missingSoldierCount: 0,
  unknownHeroJobMoveTypeCount: 0,
  unknownSoldierMoveTypeCount: 0,
  hardErrorCount: 0,
};
for (const [key, expected] of Object.entries(expectedSummary)) {
  if (summary[key] !== expected) fail(`validation-summary-${key}`, { expected, actual: summary[key] ?? null });
}
if (!Array.isArray(validation?.fieldArmyWitnesses) || validation.fieldArmyWitnesses.length !== 2 || !validation.fieldArmyWitnesses.every((w) => w.pass === true && w.expectedMoveType === 5 && w.actualMoveType === 5)) {
  fail('field-army-witnesses', validation?.fieldArmyWitnesses ?? null);
}
if ((validation?.hardErrors || []).length !== 0) fail('validation-hard-errors', validation?.hardErrors || []);
if (!sameJson(validation?.missingHeroJobIds || [], [])) fail('validation-missing-hero-jobs', validation?.missingHeroJobIds || []);
if (!sameJson(validation?.missingSoldierIds || [], [])) fail('validation-missing-soldiers', validation?.missingSoldierIds || []);
if (!sameJson(validation?.unknownHeroJobMoveTypes || [], [])) fail('validation-unknown-hero-move-types', validation?.unknownHeroJobMoveTypes || []);
if (!sameJson(validation?.unknownSoldierMoveTypes || [], [])) fail('validation-unknown-soldier-move-types', validation?.unknownSoldierMoveTypes || []);

const invariants = validation?.invariants || {};
if (invariants.moveTypeIndependentFromMovePoint !== true) fail('move-type-distance-independence', invariants.moveTypeIndependentFromMovePoint ?? null);
if (invariants.heroMovementTypeScope !== 'JOB') fail('hero-movement-scope', invariants.heroMovementTypeScope ?? null);
if (invariants.soldierMovementTypeScope !== 'SOLDIER') fail('soldier-movement-scope', invariants.soldierMovementTypeScope ?? null);
if (invariants.runtimeConfigDataReadRequired !== false) fail('runtime-configdata-read-boundary', invariants.runtimeConfigDataReadRequired ?? null);
if (invariants.semanticProducerStagesReopened !== false) fail('semantic-stage-boundary', invariants.semanticProducerStagesReopened ?? null);

if (errors.length) {
  console.error(`SHARED MOVEMENT FINAL VALIDATION: FAIL (${errors.length})`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error.code}: ${JSON.stringify(error.detail)}`);
  process.exit(1);
}

console.log('SHARED MOVEMENT FINAL VALIDATION: PASS');
console.log(JSON.stringify({ heroes: 267, heroJobs: 804, soldiers: 224, movementDefinitions: 5, hardErrorCount: 0 }, null, 2));
