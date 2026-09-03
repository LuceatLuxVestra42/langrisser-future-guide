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

function normalizedHeroReferenceSet(records) {
  return records
    .map((record) => ({
      heroId: record.heroId,
      dungeonLevelIds: [...record.dungeonLevelIds].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.heroId - b.heroId);
}

function exactJoinPairSet(records) {
  return records
    .flatMap((record) => record.dungeonLevelIds.map((dungeonLevelId) => [record.heroId, dungeonLevelId]))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function frozenJoinIntegrity(measurement) {
  return {
    ...measurement.joinIntegrity,
    exactJoinPairSetSha256: sha256Json(exactJoinPairSet(measurement.records)),
    normalizedHeroReferenceSetSha256: sha256Json(normalizedHeroReferenceSet(measurement.records)),
  };
}

function main() {
  const measurementPath = arg('--measurement');
  const expectedPath = arg('--expected');
  assert(measurementPath, '--measurement is required');
  assert(expectedPath, '--expected is required');

  const measurement = readJson(measurementPath);
  const expected = readJson(expectedPath);

  assert(measurement?.schemaId === 'hero-dungeon-stageB2-exact-join-integrity/v1', 'measurement schema drift');
  assert(measurement?.stage === 'hero-dungeon-B2', 'measurement stage drift');
  assert(measurement?.status === 'PASS', `measurement status=${String(measurement?.status)}`);
  assert(measurement?.completion === 'B2_EXACT_JOIN_INTEGRITY_COMPLETE', 'measurement completion drift');
  assert(measurement?.owner === 'hero-canonical', 'measurement owner drift');
  assert(Array.isArray(measurement?.records) && measurement.records.length === 250, 'measurement must contain 250 HAS_HERO_DUNGEON records');
  assert(Array.isArray(measurement?.hardErrors) && measurement.hardErrors.length === 0, 'measurement has hard errors');
  assert(measurement?.summary?.totalDungeonLevelReferenceCount === 1274, 'measurement reference count drift');
  assert(measurement?.summary?.exactJoinResolvedReferenceCount === 1274, 'measurement resolved reference count drift');
  assert(measurement?.summary?.danglingDungeonLevelReferenceCount === 0, 'measurement has dangling references');
  assert(measurement?.summary?.duplicateSourceReferenceCount === 0, 'measurement has duplicate source references');
  assert(measurement?.summary?.sharedAcrossHeroDungeonLevelIdCount === 0, 'measurement has cross-Hero shared references');
  assert(measurement?.summary?.ambiguousTargetReferenceCount === 0, 'measurement has ambiguous target references');

  assert(expected?.schemaId === measurement.schemaId, 'committed B2 schema drift');
  assert(expected?.stage === measurement.stage, 'committed B2 stage drift');
  assert(expected?.status === measurement.status, 'committed B2 status drift');
  assert(expected?.completion === measurement.completion, 'committed B2 completion drift');
  assert(expected?.owner === measurement.owner, 'committed B2 owner drift');
  assert(expected?.purpose === measurement.purpose, 'committed B2 purpose drift');
  assert(equal(expected?.authority, measurement.authority), 'committed B2 authority parity mismatch');
  assert(equal(expected?.scope, measurement.scope), 'committed B2 scope parity mismatch');
  assert(equal(expected?.sourceTableIntegrity, measurement.sourceTableIntegrity), 'committed B2 source-table integrity mismatch');
  assert(equal(expected?.joinIntegrity, frozenJoinIntegrity(measurement)), 'committed B2 join-integrity mismatch');
  assert(equal(expected?.summary, measurement.summary), 'committed B2 summary mismatch');
  assert(equal(expected?.checks, measurement.checks), 'committed B2 checks mismatch');
  assert(equal(expected?.hardErrors, measurement.hardErrors), 'committed B2 hard-error parity mismatch');
  assert(equal(expected?.reviews, measurement.reviews), 'committed B2 review parity mismatch');
  assert(equal(expected?.handoff, measurement.handoff), 'committed B2 handoff mismatch');

  console.log(JSON.stringify({
    status: 'PASS',
    completion: 'B2_FREEZE_PARITY_COMPLETE',
    hasHeroDungeonCount: measurement.summary.hasHeroDungeonCount,
    totalDungeonLevelReferenceCount: measurement.summary.totalDungeonLevelReferenceCount,
    exactJoinResolvedReferenceCount: measurement.summary.exactJoinResolvedReferenceCount,
    exactJoinPairSetSha256: expected.joinIntegrity.exactJoinPairSetSha256,
    normalizedHeroReferenceSetSha256: expected.joinIntegrity.normalizedHeroReferenceSetSha256,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[hero-dungeon-B2-freeze] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
