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

function main() {
  const measurementPath = arg('--measurement');
  const expectedPath = arg('--expected');
  assert(measurementPath, '--measurement is required');
  assert(expectedPath, '--expected is required');

  const measurement = readJson(measurementPath);
  const expected = readJson(expectedPath);

  assert(measurement?.schemaId === 'hero-dungeon-stageB4-population-acceptance/v1', 'measurement schema drift');
  assert(measurement?.stage === 'hero-dungeon-B4', 'measurement stage drift');
  assert(measurement?.status === 'PASS', `measurement status=${String(measurement?.status)}`);
  assert(measurement?.completion === 'B4_POPULATION_ACCEPTANCE_COMPLETE', 'measurement completion drift');
  assert(measurement?.owner === 'hero-canonical', 'measurement owner drift');
  assert(Array.isArray(measurement?.hardErrors) && measurement.hardErrors.length === 0, 'measurement has hard errors');
  assert(Array.isArray(measurement?.reviews) && measurement.reviews.length === 0, 'measurement has reviews');

  assert(measurement?.acceptance?.appliesTo === 'HAS_HERO_DUNGEON_ONLY', 'measurement acceptance scope drift');
  assert(equal(measurement?.acceptance?.allowedDungeonLevelCounts, [5, 7]), 'measurement allowed count drift');
  assert(measurement?.acceptance?.noHeroDungeonExcludedFromCardinalityAcceptanceCount === 17, 'measurement NO_HERO_DUNGEON exclusion drift');
  assert(measurement?.acceptance?.acceptedHeroCount === 250, 'measurement accepted Hero count drift');
  assert(measurement?.acceptance?.acceptedCount5HeroCount === 238, 'measurement 5-stage accepted count drift');
  assert(measurement?.acceptance?.acceptedCount7HeroCount === 12, 'measurement 7-stage accepted count drift');
  assert(measurement?.acceptance?.rejectedHeroCount === 0, 'measurement rejected Hero count is nonzero');
  assert(measurement?.acceptance?.count6RejectedHeroCount === 0, 'measurement contains 6-stage Hero population');
  assert(measurement?.acceptance?.otherNonEmptyRejectedHeroCount === 0, 'measurement contains other non-empty Hero Dungeon population');

  assert(measurement?.summary?.canonicalHeroCount === 267, 'measurement canonical Hero count drift');
  assert(measurement?.summary?.noHeroDungeonCount === 17, 'measurement NO_HERO_DUNGEON count drift');
  assert(measurement?.summary?.hasHeroDungeonCount === 250, 'measurement HAS_HERO_DUNGEON count drift');
  assert(measurement?.summary?.dungeonCount5HeroCount === 238, 'measurement 5-stage population drift');
  assert(measurement?.summary?.dungeonCount7HeroCount === 12, 'measurement 7-stage population drift');
  assert(measurement?.summary?.dungeonCount6HeroCount === 0, 'measurement 6-stage population is nonzero');
  assert(measurement?.summary?.otherNonEmptyDungeonCountHeroCount === 0, 'measurement other non-empty population is nonzero');
  assert(measurement?.summary?.totalDungeonLevelReferenceCount === 1274, 'measurement DungeonLevel reference count drift');
  assert(measurement?.summary?.danglingDungeonLevelReferenceCount === 0, 'measurement has dangling references');
  assert(measurement?.summary?.missingNameNumCount === 0, 'measurement has missing NameNum');
  assert(measurement?.summary?.duplicateNameNumHeroCount === 0, 'measurement has duplicate NameNum');
  assert(measurement?.summary?.invalidOrdinalSetHeroCount === 0, 'measurement has invalid ordinal set');
  assert(measurement?.summary?.acceptedHeroCount === 250, 'measurement summary accepted count drift');
  assert(measurement?.summary?.rejectedHeroCount === 0, 'measurement summary rejected count is nonzero');
  assert(measurement?.summary?.hardErrorCount === 0, 'measurement hardErrorCount is nonzero');

  assert(expected?.schemaId === measurement.schemaId, 'committed B4 schema drift');
  assert(expected?.stage === measurement.stage, 'committed B4 stage drift');
  assert(expected?.status === measurement.status, 'committed B4 status drift');
  assert(expected?.completion === measurement.completion, 'committed B4 completion drift');
  assert(expected?.owner === measurement.owner, 'committed B4 owner drift');
  assert(expected?.purpose === measurement.purpose, 'committed B4 purpose drift');
  assert(equal(expected?.authority, measurement.authority), 'committed B4 authority parity mismatch');
  assert(equal(expected?.scope, measurement.scope), 'committed B4 scope parity mismatch');
  assert(equal(expected?.acceptance, measurement.acceptance), 'committed B4 acceptance parity mismatch');
  assert(equal(expected?.summary, measurement.summary), 'committed B4 summary parity mismatch');
  assert(equal(expected?.checks, measurement.checks), 'committed B4 checks parity mismatch');
  assert(equal(expected?.hardErrors, measurement.hardErrors), 'committed B4 hardErrors parity mismatch');
  assert(equal(expected?.reviews, measurement.reviews), 'committed B4 reviews parity mismatch');
  assert(equal(expected?.handoff, measurement.handoff), 'committed B4 handoff parity mismatch');

  console.log(JSON.stringify({
    status: 'PASS',
    completion: 'B4_FREEZE_PARITY_COMPLETE',
    noHeroDungeonCount: measurement.summary.noHeroDungeonCount,
    hasHeroDungeonCount: measurement.summary.hasHeroDungeonCount,
    acceptedCount5HeroCount: measurement.acceptance.acceptedCount5HeroCount,
    acceptedCount7HeroCount: measurement.acceptance.acceptedCount7HeroCount,
    rejectedHeroCount: measurement.acceptance.rejectedHeroCount,
    hardErrorCount: measurement.summary.hardErrorCount,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[hero-dungeon-B4-freeze] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
