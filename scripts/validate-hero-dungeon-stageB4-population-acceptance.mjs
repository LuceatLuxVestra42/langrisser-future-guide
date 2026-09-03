import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B0_PATH = 'data/contracts/hero-dungeon-stageB0-scope-reset.v1.json';
const B1_PATH = 'data/validation/hero-dungeon-stageB1-population-classification.v1.json';
const B2_PATH = 'data/validation/hero-dungeon-stageB2-exact-join-integrity.v1.json';
const B3_PATH = 'data/validation/hero-dungeon-stageB3-namenum-ordinal-integrity.v1.json';
const EXPECTED_CANONICAL_HERO_COUNT = 267;
const ALLOWED_COUNTS = [5, 7];

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

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sortedNumeric(values) {
  return [...values].sort((a, b) => a - b);
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sameNumbers(a, b) {
  return JSON.stringify(sortedNumeric(a)) === JSON.stringify(sortedNumeric(b));
}

function validateAuthority({ b0, b1, b2, b3 }) {
  assert(b0?.schemaId === 'hero-dungeon-stageB0-scope-reset/v1', 'B0 contract schema drift');
  assert(b0?.status === 'DESIGN_FROZEN', 'B0 contract is not DESIGN_FROZEN');
  assert(b0?.completion === 'B0_SCOPE_RESET_COMPLETE', 'B0 contract is incomplete');
  assert(b0?.owner === 'hero-canonical', 'B0 owner drift');
  assert(
    b0?.stages?.some((stage) => stage?.id === 'B4' && stage?.name === 'population-acceptance'),
    'B0 no longer defines B4 population-acceptance',
  );
  assert(b0?.populationAcceptance?.appliesTo === 'HAS_HERO_DUNGEON_ONLY', 'B0 B4 application scope drift');
  assert(sameNumbers(b0?.populationAcceptance?.allowedDungeonLevelCounts ?? [], ALLOWED_COUNTS), 'B0 allowed Hero Dungeon counts drift');
  assert(b0?.populationAcceptance?.count6Allowed === false, 'B0 unexpectedly allows count 6');
  assert(b0?.populationAcceptance?.otherNonEmptyCountAllowed === false, 'B0 unexpectedly allows another non-empty count');
  assert(b0?.populationAcceptance?.failureClass === 'BLOCKER', 'B0 B4 failure class drift');

  assert(b1?.schemaId === 'hero-dungeon-stageB1-population-classification/v1', 'B1 schema drift');
  assert(b1?.status === 'PASS', `B1 status=${String(b1?.status)}`);
  assert(b1?.completion === 'B1_POPULATION_CLASSIFICATION_COMPLETE', 'B1 incomplete');
  assert(b1?.owner === 'hero-canonical', 'B1 owner drift');
  assert(b1?.summary?.canonicalHeroCount === EXPECTED_CANONICAL_HERO_COUNT, 'B1 canonical Hero count drift');
  assert(b1?.summary?.hardErrorCount === 0, 'B1 has hard errors');
  assert(Array.isArray(b1?.hardErrors) && b1.hardErrors.length === 0, 'B1 hardErrors are not empty');

  assert(b2?.schemaId === 'hero-dungeon-stageB2-exact-join-integrity/v1', 'B2 schema drift');
  assert(b2?.status === 'PASS', `B2 status=${String(b2?.status)}`);
  assert(b2?.completion === 'B2_EXACT_JOIN_INTEGRITY_COMPLETE', 'B2 incomplete');
  assert(b2?.owner === 'hero-canonical', 'B2 owner drift');
  assert(b2?.summary?.hardErrorCount === 0, 'B2 has hard errors');
  assert(b2?.summary?.exactJoinResolvedReferenceCount === b2?.summary?.totalDungeonLevelReferenceCount, 'B2 exact join is incomplete');
  assert(b2?.summary?.danglingDungeonLevelReferenceCount === 0, 'B2 has dangling DungeonLevel references');

  assert(b3?.schemaId === 'hero-dungeon-stageB3-namenum-ordinal-integrity/v1', 'B3 schema drift');
  assert(b3?.status === 'PASS', `B3 status=${String(b3?.status)}`);
  assert(b3?.completion === 'B3_NAMENUM_ORDINAL_INTEGRITY_COMPLETE', 'B3 incomplete');
  assert(b3?.owner === 'hero-canonical', 'B3 owner drift');
  assert(b3?.summary?.hardErrorCount === 0, 'B3 has hard errors');
  assert(b3?.summary?.missingNameNumCount === 0, 'B3 has missing NameNum');
  assert(b3?.summary?.invalidNameNumCount === 0, 'B3 has invalid NameNum');
  assert(b3?.summary?.duplicateNameNumHeroCount === 0, 'B3 has duplicate per-Hero NameNum');
  assert(b3?.summary?.invalidOrdinalSetHeroCount === 0, 'B3 has invalid ordinal sets');

  for (const key of [
    'canonicalHeroCount',
    'noHeroDungeonCount',
    'hasHeroDungeonCount',
    'dungeonCount5HeroCount',
    'dungeonCount7HeroCount',
    'dungeonCount6HeroCount',
    'otherNonEmptyDungeonCountHeroCount',
    'totalDungeonLevelReferenceCount',
  ]) {
    assert(b1?.summary?.[key] === b2?.summary?.[key], `B1/B2 summary parity mismatch: ${key}`);
    assert(b1?.summary?.[key] === b3?.summary?.[key], `B1/B3 summary parity mismatch: ${key}`);
  }
}

function buildMeasurement() {
  const b0 = readJson(B0_PATH);
  const b1 = readJson(B1_PATH);
  const b2 = readJson(B2_PATH);
  const b3 = readJson(B3_PATH);
  validateAuthority({ b0, b1, b2, b3 });

  const membership = b1?.classificationMembership ?? {};
  const noHeroDungeonHeroIds = membership.noHeroDungeonHeroIds;
  const count5HeroIds = membership.dungeonCount5HeroIds;
  const count7HeroIds = membership.dungeonCount7HeroIds;
  const otherNonEmptyHeroIds = membership.otherNonEmptyDungeonCountHeroIds;
  for (const [name, values] of Object.entries({
    noHeroDungeonHeroIds,
    count5HeroIds,
    count7HeroIds,
    otherNonEmptyHeroIds,
  })) {
    assert(Array.isArray(values), `B1 ${name} missing`);
    assert(values.every((id) => Number.isInteger(id) && id > 0), `B1 ${name} contains invalid Hero ID`);
    assert(new Set(values).size === values.length, `B1 ${name} contains duplicate Hero IDs`);
  }

  const allHeroIds = [...noHeroDungeonHeroIds, ...count5HeroIds, ...count7HeroIds, ...otherNonEmptyHeroIds];
  assert(allHeroIds.length === EXPECTED_CANONICAL_HERO_COUNT, `B1 membership total=${allHeroIds.length}`);
  assert(new Set(allHeroIds).size === EXPECTED_CANONICAL_HERO_COUNT, 'B1 classification membership overlaps');

  const nonEmptyDistribution = b1?.nonEmptyCardinalityDistribution;
  assert(Array.isArray(nonEmptyDistribution), 'B1 nonEmptyCardinalityDistribution missing');
  const invalidDistributionEntries = nonEmptyDistribution
    .filter((entry) => !ALLOWED_COUNTS.includes(entry?.dungeonLevelCount) && Number(entry?.heroCount) > 0)
    .map((entry) => ({ dungeonLevelCount: entry.dungeonLevelCount, heroCount: entry.heroCount }));
  const count6DistributionHeroCount = nonEmptyDistribution
    .filter((entry) => entry?.dungeonLevelCount === 6)
    .reduce((sum, entry) => sum + Number(entry?.heroCount ?? 0), 0);

  const hardErrors = [];
  if (b1.summary.dungeonCount6HeroCount !== 0 || count6DistributionHeroCount !== 0) {
    hardErrors.push({
      code: 'COUNT6_HERO_DUNGEON_BLOCKER',
      failureClass: 'BLOCKER',
      summaryHeroCount: b1.summary.dungeonCount6HeroCount,
      distributionHeroCount: count6DistributionHeroCount,
    });
  }
  if (b1.summary.otherNonEmptyDungeonCountHeroCount !== 0 || otherNonEmptyHeroIds.length !== 0 || invalidDistributionEntries.length !== 0) {
    hardErrors.push({
      code: 'OTHER_NON_EMPTY_HERO_DUNGEON_CARDINALITY_BLOCKER',
      failureClass: 'BLOCKER',
      summaryHeroCount: b1.summary.otherNonEmptyDungeonCountHeroCount,
      membershipHeroIds: sortedNumeric(otherNonEmptyHeroIds),
      distribution: invalidDistributionEntries,
    });
  }

  const acceptedCount5HeroIds = sortedNumeric(count5HeroIds);
  const acceptedCount7HeroIds = sortedNumeric(count7HeroIds);
  const acceptedHeroIds = sortedNumeric([...acceptedCount5HeroIds, ...acceptedCount7HeroIds]);
  const rejectedHeroIds = sortedNumeric(otherNonEmptyHeroIds);
  const acceptedReferenceCount = acceptedCount5HeroIds.length * 5 + acceptedCount7HeroIds.length * 7;

  if (acceptedHeroIds.length !== b1.summary.hasHeroDungeonCount) {
    hardErrors.push({
      code: 'HAS_HERO_DUNGEON_ACCEPTANCE_COVERAGE_MISMATCH',
      failureClass: 'BLOCKER',
      expected: b1.summary.hasHeroDungeonCount,
      actual: acceptedHeroIds.length,
    });
  }
  if (acceptedReferenceCount !== b1.summary.totalDungeonLevelReferenceCount) {
    hardErrors.push({
      code: 'ACCEPTED_REFERENCE_COUNT_MISMATCH',
      failureClass: 'BLOCKER',
      expected: b1.summary.totalDungeonLevelReferenceCount,
      actual: acceptedReferenceCount,
    });
  }

  const acceptance = {
    appliesTo: 'HAS_HERO_DUNGEON_ONLY',
    allowedDungeonLevelCounts: ALLOWED_COUNTS,
    noHeroDungeonExcludedFromCardinalityAcceptanceCount: noHeroDungeonHeroIds.length,
    acceptedHeroCount: acceptedHeroIds.length,
    acceptedCount5HeroCount: acceptedCount5HeroIds.length,
    acceptedCount7HeroCount: acceptedCount7HeroIds.length,
    rejectedHeroCount: rejectedHeroIds.length,
    count6RejectedHeroCount: b1.summary.dungeonCount6HeroCount,
    otherNonEmptyRejectedHeroCount: b1.summary.otherNonEmptyDungeonCountHeroCount,
    acceptedHeroIdSetSha256: sha256Json(acceptedHeroIds),
    acceptedCount5HeroIdSetSha256: sha256Json(acceptedCount5HeroIds),
    acceptedCount7HeroIdSetSha256: sha256Json(acceptedCount7HeroIds),
    rejectedHeroIdSetSha256: sha256Json(rejectedHeroIds),
  };

  const summary = {
    canonicalHeroCount: b1.summary.canonicalHeroCount,
    noHeroDungeonCount: b1.summary.noHeroDungeonCount,
    hasHeroDungeonCount: b1.summary.hasHeroDungeonCount,
    dungeonCount5HeroCount: b1.summary.dungeonCount5HeroCount,
    dungeonCount7HeroCount: b1.summary.dungeonCount7HeroCount,
    dungeonCount6HeroCount: b1.summary.dungeonCount6HeroCount,
    otherNonEmptyDungeonCountHeroCount: b1.summary.otherNonEmptyDungeonCountHeroCount,
    totalDungeonLevelReferenceCount: b1.summary.totalDungeonLevelReferenceCount,
    danglingDungeonLevelReferenceCount: b2.summary.danglingDungeonLevelReferenceCount,
    missingNameNumCount: b3.summary.missingNameNumCount,
    duplicateNameNumHeroCount: b3.summary.duplicateNameNumHeroCount,
    invalidOrdinalSetHeroCount: b3.summary.invalidOrdinalSetHeroCount,
    acceptedHeroCount: acceptedHeroIds.length,
    rejectedHeroCount: rejectedHeroIds.length,
    hardErrorCount: hardErrors.length,
  };

  return {
    version: 1,
    schemaId: 'hero-dungeon-stageB4-population-acceptance/v1',
    stage: 'hero-dungeon-B4',
    status: hardErrors.length === 0 ? 'PASS' : 'FAIL',
    completion: hardErrors.length === 0 ? 'B4_POPULATION_ACCEPTANCE_COMPLETE' : 'BLOCKED',
    owner: 'hero-canonical',
    purpose: 'Apply the B0 Hero Dungeon population acceptance rule to the frozen B1 HAS_HERO_DUNGEON population after B2 exact-join and B3 explicit NameNum ordinal integrity have passed. Exactly 5 or 7 joined stages pass; 6 and every other non-empty cardinality fail closed as BLOCKER.',
    authority: {
      b0Contract: B0_PATH,
      b1PopulationFreeze: B1_PATH,
      b2ExactJoinFreeze: B2_PATH,
      b3NameNumOrdinalFreeze: B3_PATH,
      sourcePackCommitSha: b3.authority.sourcePackCommitSha,
      b2ExactJoinPairSetSha256: b3.authority.b2ExactJoinPairSetSha256,
      b3NormalizedOrdinalAssignmentSetSha256: b3.ordinalIntegrity.normalizedOrdinalAssignmentSetSha256,
      b3NormalizedHeroOrdinalSetSha256: b3.ordinalIntegrity.normalizedHeroOrdinalSetSha256,
    },
    scope: {
      inScope: [
        'Consume the frozen B1 population classification without re-reading raw ConfigData or reclassifying canonical Hero identity.',
        'Require B2 exact-ID join integrity and B3 explicit NameNum ordinal integrity to remain PASS.',
        'Apply cardinality acceptance only to B1-frozen HAS_HERO_DUNGEON Heroes.',
        'Accept exactly 5 or 7 joined stages and fail closed on 6 or every other non-empty cardinality as BLOCKER.',
        'Keep NO_HERO_DUNGEON Heroes outside cardinality acceptance and non-blocking.',
      ],
      outOfScope: [
        'Re-read or reinterpret raw ConfigData for population, JOIN, or NameNum semantics.',
        'Infer gate count or ordinal from array position, ID arithmetic, PreLevel_ID, Fetter count, names, filenames, or UI order.',
        'Reopen B1-B3, Stage 5 Fetter semantics, Stage 6 Hero lifecycle, frontend, localization, assets, release, or presentation.',
        'Publish the final supplemental Hero Dungeon consumer/freeze; that belongs to B5.',
      ],
    },
    acceptance,
    summary,
    checks: [
      { name: 'B1-B3 predecessor chain remains PASS', pass: true, actual: 'PASS' },
      { name: 'NO_HERO_DUNGEON excluded from cardinality acceptance', pass: true, actual: noHeroDungeonHeroIds.length },
      { name: 'all HAS_HERO_DUNGEON Heroes have allowed count 5 or 7', pass: rejectedHeroIds.length === 0 && invalidDistributionEntries.length === 0, actual: acceptedHeroIds.length },
      { name: 'count 6 population is absent', pass: b1.summary.dungeonCount6HeroCount === 0 && count6DistributionHeroCount === 0, actual: b1.summary.dungeonCount6HeroCount },
      { name: 'other non-empty population is absent', pass: b1.summary.otherNonEmptyDungeonCountHeroCount === 0 && otherNonEmptyHeroIds.length === 0 && invalidDistributionEntries.length === 0, actual: b1.summary.otherNonEmptyDungeonCountHeroCount },
      { name: 'accepted count-derived references preserve B1/B2/B3 total', pass: acceptedReferenceCount === b1.summary.totalDungeonLevelReferenceCount, actual: acceptedReferenceCount },
    ],
    hardErrors,
    reviews: [],
    handoff: {
      nextOwner: 'hero-canonical',
      nextStage: 'B5-supplemental-final-freeze',
      nextStart: 'Consume the frozen B1-B4 results and freeze the supplemental Hero Dungeon ordinal facet/summary for reuse. Do not reopen canonical Hero identity, Stage 5/6 semantics, raw ConfigData interpretation, or presentation layers.',
    },
  };
}

function main() {
  const outputPath = arg('--output');
  assert(outputPath, '--output is required');
  const measurement = buildMeasurement();
  fs.writeFileSync(outputPath, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(JSON.stringify({
    status: measurement.status,
    completion: measurement.completion,
    noHeroDungeonCount: measurement.summary.noHeroDungeonCount,
    hasHeroDungeonCount: measurement.summary.hasHeroDungeonCount,
    acceptedCount5HeroCount: measurement.acceptance.acceptedCount5HeroCount,
    acceptedCount7HeroCount: measurement.acceptance.acceptedCount7HeroCount,
    count6RejectedHeroCount: measurement.acceptance.count6RejectedHeroCount,
    otherNonEmptyRejectedHeroCount: measurement.acceptance.otherNonEmptyRejectedHeroCount,
    rejectedHeroCount: measurement.summary.rejectedHeroCount,
    hardErrorCount: measurement.summary.hardErrorCount,
  }, null, 2));
  if (measurement.status !== 'PASS') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`[hero-dungeon-B4] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
