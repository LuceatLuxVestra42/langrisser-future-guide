import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function equal(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function membership(records) {
  return {
    noHeroDungeonHeroIds: records.filter((record) => record.state === 'NO_HERO_DUNGEON').map((record) => record.heroId),
    dungeonCount5HeroIds: records.filter((record) => record.dungeonLevelCount === 5).map((record) => record.heroId),
    dungeonCount7HeroIds: records.filter((record) => record.dungeonLevelCount === 7).map((record) => record.heroId),
    otherNonEmptyDungeonCountHeroIds: records
      .filter((record) => record.state === 'HAS_HERO_DUNGEON' && ![5, 7].includes(record.dungeonLevelCount))
      .map((record) => record.heroId),
    measurementRecordsSha256: sha256Json(records),
  };
}

function main() {
  const measurementPath = arg('--measurement');
  const expectedPath = arg('--expected');
  assert(measurementPath, '--measurement is required');
  assert(expectedPath, '--expected is required');

  const measurement = readJson(measurementPath);
  const expected = readJson(expectedPath);

  assert(measurement?.schemaId === 'hero-dungeon-stageB1-population-classification/v1', 'measurement schema drift');
  assert(measurement?.status === 'PASS', `measurement status=${String(measurement?.status)}`);
  assert(measurement?.completion === 'B1_POPULATION_CLASSIFICATION_COMPLETE', 'measurement completion drift');
  assert(Array.isArray(measurement?.records) && measurement.records.length === 267, 'measurement must contain 267 classified Hero records');
  assert(Array.isArray(measurement?.hardErrors) && measurement.hardErrors.length === 0, 'measurement has hard errors');

  assert(expected?.schemaId === measurement.schemaId, 'committed B1 schema drift');
  assert(expected?.stage === measurement.stage, 'committed B1 stage drift');
  assert(expected?.status === measurement.status, 'committed B1 status drift');
  assert(expected?.completion === measurement.completion, 'committed B1 completion drift');
  assert(expected?.owner === measurement.owner, 'committed B1 owner drift');
  assert(equal(expected?.authority, measurement.authority), 'committed B1 authority parity mismatch');
  assert(equal(expected?.classificationBreakdown, measurement.classificationBreakdown), 'committed B1 classification breakdown mismatch');
  assert(equal(expected?.nonEmptyCardinalityDistribution, measurement.nonEmptyCardinalityDistribution), 'committed B1 cardinality distribution mismatch');
  assert(equal(expected?.summary, measurement.summary), 'committed B1 summary mismatch');
  assert(equal(expected?.classificationMembership, membership(measurement.records)), 'committed B1 membership mismatch');
  assert(equal(expected?.checks, measurement.checks), 'committed B1 checks mismatch');
  assert(equal(expected?.hardErrors, measurement.hardErrors), 'committed B1 hard-error parity mismatch');
  assert(equal(expected?.reviews, measurement.reviews), 'committed B1 review parity mismatch');
  assert(equal(expected?.handoff, measurement.handoff), 'committed B1 handoff mismatch');

  console.log(JSON.stringify({
    status: 'PASS',
    completion: 'B1_FREEZE_PARITY_COMPLETE',
    canonicalHeroCount: measurement.summary.canonicalHeroCount,
    noHeroDungeonCount: measurement.summary.noHeroDungeonCount,
    hasHeroDungeonCount: measurement.summary.hasHeroDungeonCount,
    nonEmptyCardinalityDistribution: measurement.nonEmptyCardinalityDistribution,
    measurementRecordsSha256: expected.classificationMembership.measurementRecordsSha256,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[hero-dungeon-B1-freeze] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
