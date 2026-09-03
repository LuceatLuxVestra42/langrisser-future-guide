import fs from 'node:fs';
import process from 'node:process';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function equal(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }

function main() {
  const measurementPath = arg('--measurement');
  const expectedPath = arg('--expected');
  assert(measurementPath, '--measurement is required');
  assert(expectedPath, '--expected is required');
  const measurement = readJson(measurementPath);
  const expected = readJson(expectedPath);

  assert(measurement?.schemaId === 'hero-dungeon-stageB5-supplemental-final-freeze/v1', 'measurement schema drift');
  assert(measurement?.stage === 'hero-dungeon-B5', 'measurement stage drift');
  assert(measurement?.status === 'PASS', `measurement status=${String(measurement?.status)}`);
  assert(measurement?.completion === 'B5_SUPPLEMENTAL_FINAL_FREEZE_COMPLETE', 'measurement completion drift');
  assert(measurement?.lifecycle === 'FINAL_FROZEN', 'measurement lifecycle drift');
  assert(measurement?.owner === 'hero-canonical', 'measurement owner drift');
  assert(measurement?.summary?.canonicalHeroCount === 267, 'measurement canonical Hero count drift');
  assert(measurement?.summary?.noHeroDungeonCount === 17, 'measurement NO_HERO_DUNGEON count drift');
  assert(measurement?.summary?.hasHeroDungeonCount === 250, 'measurement HAS_HERO_DUNGEON count drift');
  assert(measurement?.summary?.dungeonCount5HeroCount === 238, 'measurement count-5 drift');
  assert(measurement?.summary?.dungeonCount7HeroCount === 12, 'measurement count-7 drift');
  assert(measurement?.summary?.totalDungeonLevelReferenceCount === 1274, 'measurement reference count drift');
  assert(measurement?.summary?.hardErrorCount === 0, 'measurement has hard errors');
  assert(Array.isArray(measurement?.hardErrors) && measurement.hardErrors.length === 0, 'measurement hardErrors are not empty');

  for (const key of ['schemaId','stage','status','completion','lifecycle','owner','purpose']) assert(expected?.[key] === measurement?.[key], `committed B5 ${key} drift`);
  for (const key of ['authority','scope','integrity','summary','checks','hardErrors','reviews','primaryHeroLifecycle','handoff','reopenConditions']) assert(equal(expected?.[key], measurement?.[key]), `committed B5 ${key} parity mismatch`);

  console.log(JSON.stringify({
    status: 'PASS',
    completion: 'B5_FREEZE_PARITY_COMPLETE',
    lifecycle: measurement.lifecycle,
    canonicalHeroCount: measurement.summary.canonicalHeroCount,
    consumerHeroFacetSha256: measurement.integrity.consumerHeroFacetSha256,
    normalizedOrdinalAssignmentSetSha256: measurement.integrity.normalizedOrdinalAssignmentSetSha256,
  }, null, 2));
}

try { main(); } catch (error) {
  console.error(`[hero-dungeon-B5-freeze] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
