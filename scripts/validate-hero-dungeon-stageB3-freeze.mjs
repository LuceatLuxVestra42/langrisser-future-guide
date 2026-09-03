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

function normalizedAssignments(records) {
  return records
    .flatMap((record) => record.assignments.map((assignment) => ({
      heroId: record.heroId,
      dungeonLevelId: assignment.dungeonLevelId,
      gateOrdinal: assignment.gateOrdinal,
    })))
    .sort((a, b) => a.heroId - b.heroId || a.dungeonLevelId - b.dungeonLevelId);
}

function normalizedHeroOrdinalSets(records) {
  return records
    .map((record) => ({ heroId: record.heroId, ordinals: [...record.observedOrdinalSet] }))
    .sort((a, b) => a.heroId - b.heroId);
}

function ordinalDistribution(records) {
  const counts = new Map();
  for (const record of records) {
    for (const assignment of record.assignments) {
      const ordinal = assignment.gateOrdinal;
      if (Number.isInteger(ordinal) && ordinal > 0) counts.set(ordinal, (counts.get(ordinal) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gateOrdinal, referenceCount]) => ({ gateOrdinal, referenceCount }));
}

function validateRecord(record) {
  assert(Number.isInteger(record?.heroId) && record.heroId > 0, 'measurement contains invalid Hero ID');
  assert(Number.isInteger(record?.sourceReferenceCount) && record.sourceReferenceCount > 0, `Hero ${record.heroId}: invalid sourceReferenceCount`);
  assert(Array.isArray(record?.assignments), `Hero ${record.heroId}: assignments missing`);
  assert(record.assignments.length === record.sourceReferenceCount, `Hero ${record.heroId}: assignment count mismatch`);
  assert(Array.isArray(record?.observedOrdinalSet), `Hero ${record.heroId}: observedOrdinalSet missing`);
  assert(Array.isArray(record?.expectedOrdinalSet), `Hero ${record.heroId}: expectedOrdinalSet missing`);
  assert(record?.ordinalSetValid === true, `Hero ${record.heroId}: ordinalSetValid is not true`);
  assert(Array.isArray(record?.missingDungeonLevelIds) && record.missingDungeonLevelIds.length === 0, `Hero ${record.heroId}: missing NameNum targets remain`);
  assert(Array.isArray(record?.invalidDungeonLevelIds) && record.invalidDungeonLevelIds.length === 0, `Hero ${record.heroId}: invalid NameNum targets remain`);
  assert(Array.isArray(record?.duplicateNameNums) && record.duplicateNameNums.length === 0, `Hero ${record.heroId}: duplicate NameNum remains`);

  const expected = Array.from({ length: record.sourceReferenceCount }, (_, index) => index + 1);
  assert(equal(record.expectedOrdinalSet, expected), `Hero ${record.heroId}: expected ordinal set drift`);
  assert(equal(record.observedOrdinalSet, expected), `Hero ${record.heroId}: observed explicit ordinal set is not 1..N`);

  const seenDungeonIds = new Set();
  const seenOrdinals = new Set();
  for (const assignment of record.assignments) {
    assert(Number.isInteger(assignment?.dungeonLevelId) && assignment.dungeonLevelId > 0, `Hero ${record.heroId}: invalid DungeonLevel ID`);
    assert(!seenDungeonIds.has(assignment.dungeonLevelId), `Hero ${record.heroId}: duplicate DungeonLevel assignment`);
    seenDungeonIds.add(assignment.dungeonLevelId);
    assert(Number.isInteger(assignment?.gateOrdinal) && assignment.gateOrdinal > 0, `Hero ${record.heroId}: non-positive-integer gateOrdinal`);
    assert(!seenOrdinals.has(assignment.gateOrdinal), `Hero ${record.heroId}: duplicate gateOrdinal assignment`);
    seenOrdinals.add(assignment.gateOrdinal);
  }
}

function main() {
  const measurementPath = arg('--measurement');
  const expectedPath = arg('--expected');
  assert(measurementPath, '--measurement is required');
  assert(expectedPath, '--expected is required');

  const measurement = readJson(measurementPath);
  const expected = readJson(expectedPath);

  assert(measurement?.schemaId === 'hero-dungeon-stageB3-namenum-ordinal-integrity/v1', 'measurement schema drift');
  assert(measurement?.stage === 'hero-dungeon-B3', 'measurement stage drift');
  assert(measurement?.status === 'PASS', `measurement status=${String(measurement?.status)}`);
  assert(measurement?.completion === 'B3_NAMENUM_ORDINAL_INTEGRITY_COMPLETE', 'measurement completion drift');
  assert(measurement?.owner === 'hero-canonical', 'measurement owner drift');
  assert(Array.isArray(measurement?.records) && measurement.records.length === 250, 'measurement must contain 250 HAS_HERO_DUNGEON records');
  assert(Array.isArray(measurement?.hardErrors) && measurement.hardErrors.length === 0, 'measurement has hard errors');
  assert(Array.isArray(measurement?.reviews) && measurement.reviews.length === 0, 'measurement has reviews');

  for (const record of measurement.records) validateRecord(record);
  assert(new Set(measurement.records.map((record) => record.heroId)).size === 250, 'measurement contains duplicate Hero records');

  assert(measurement?.summary?.canonicalHeroCount === 267, 'measurement canonical Hero count drift');
  assert(measurement?.summary?.noHeroDungeonCount === 17, 'measurement NO_HERO_DUNGEON count drift');
  assert(measurement?.summary?.hasHeroDungeonCount === 250, 'measurement HAS_HERO_DUNGEON count drift');
  assert(measurement?.summary?.totalDungeonLevelReferenceCount === 1274, 'measurement reference count drift');
  assert(measurement?.summary?.exactJoinResolvedReferenceCount === 1274, 'measurement exact-join count drift');
  assert(measurement?.summary?.validNameNumReferenceCount === 1274, 'measurement valid NameNum count drift');
  assert(measurement?.summary?.missingNameNumCount === 0, 'measurement has missing NameNum');
  assert(measurement?.summary?.invalidNameNumCount === 0, 'measurement has invalid NameNum');
  assert(measurement?.summary?.duplicateNameNumHeroCount === 0, 'measurement has duplicate NameNum Heroes');
  assert(measurement?.summary?.invalidOrdinalSetHeroCount === 0, 'measurement has invalid ordinal-set Heroes');
  assert(measurement?.summary?.hardErrorCount === 0, 'measurement hardErrorCount is nonzero');

  const assignmentHash = sha256Json(normalizedAssignments(measurement.records));
  const heroOrdinalSetHash = sha256Json(normalizedHeroOrdinalSets(measurement.records));
  const measuredDistribution = ordinalDistribution(measurement.records);
  assert(assignmentHash === measurement?.ordinalIntegrity?.normalizedOrdinalAssignmentSetSha256, 'measurement normalized assignment hash is internally inconsistent');
  assert(heroOrdinalSetHash === measurement?.ordinalIntegrity?.normalizedHeroOrdinalSetSha256, 'measurement normalized Hero ordinal-set hash is internally inconsistent');
  assert(equal(measuredDistribution, measurement?.ordinalIntegrity?.ordinalValueDistribution), 'measurement ordinal distribution is internally inconsistent');

  assert(expected?.schemaId === measurement.schemaId, 'committed B3 schema drift');
  assert(expected?.stage === measurement.stage, 'committed B3 stage drift');
  assert(expected?.status === measurement.status, 'committed B3 status drift');
  assert(expected?.completion === measurement.completion, 'committed B3 completion drift');
  assert(expected?.owner === measurement.owner, 'committed B3 owner drift');
  assert(expected?.purpose === measurement.purpose, 'committed B3 purpose drift');
  assert(equal(expected?.authority, measurement.authority), 'committed B3 authority parity mismatch');
  assert(equal(expected?.scope, measurement.scope), 'committed B3 scope parity mismatch');
  assert(equal(expected?.ordinalIntegrity, measurement.ordinalIntegrity), 'committed B3 ordinal-integrity mismatch');
  assert(equal(expected?.summary, measurement.summary), 'committed B3 summary mismatch');
  assert(equal(expected?.checks, measurement.checks), 'committed B3 checks mismatch');
  assert(equal(expected?.hardErrors, measurement.hardErrors), 'committed B3 hard-error parity mismatch');
  assert(equal(expected?.reviews, measurement.reviews), 'committed B3 review parity mismatch');
  assert(equal(expected?.handoff, measurement.handoff), 'committed B3 handoff mismatch');

  assert(expected.ordinalIntegrity.normalizedOrdinalAssignmentSetSha256 === assignmentHash, 'committed B3 assignment hash mismatch');
  assert(expected.ordinalIntegrity.normalizedHeroOrdinalSetSha256 === heroOrdinalSetHash, 'committed B3 Hero ordinal-set hash mismatch');

  console.log(JSON.stringify({
    status: 'PASS',
    completion: 'B3_FREEZE_PARITY_COMPLETE',
    hasHeroDungeonCount: measurement.summary.hasHeroDungeonCount,
    totalDungeonLevelReferenceCount: measurement.summary.totalDungeonLevelReferenceCount,
    validNameNumReferenceCount: measurement.summary.validNameNumReferenceCount,
    missingNameNumCount: measurement.summary.missingNameNumCount,
    invalidNameNumCount: measurement.summary.invalidNameNumCount,
    duplicateNameNumHeroCount: measurement.summary.duplicateNameNumHeroCount,
    invalidOrdinalSetHeroCount: measurement.summary.invalidOrdinalSetHeroCount,
    normalizedOrdinalAssignmentSetSha256: assignmentHash,
    normalizedHeroOrdinalSetSha256: heroOrdinalSetHash,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[hero-dungeon-B3-freeze] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
