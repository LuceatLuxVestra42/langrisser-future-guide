import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { resolveConfigDataFile } = require('./configdata-source-pack-maintenance-root.cjs');

const B0_PATH = 'data/contracts/hero-dungeon-stageB0-scope-reset.v1.json';
const B1_PATH = 'data/validation/hero-dungeon-stageB1-population-classification.v1.json';
const B2_PATH = 'data/validation/hero-dungeon-stageB2-exact-join-integrity.v1.json';
const SOURCE_PACK_PATH = 'data/contracts/configdata-source-pack-contract.v1.json';
const HERO_INFORMATION_FILE = 'ConfigDataHeroInformationInfo.json';
const HERO_DUNGEON_LEVEL_FILE = 'ConfigDataHeroDungeonLevelInfo.json';
const EXPECTED_CANONICAL_HERO_COUNT = 267;

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

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sortedNumeric(values) {
  return [...values].sort((a, b) => a - b);
}

function parsePositiveIntegerNameNum(value) {
  if (Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function indexByIntegerId(records, label) {
  if (!Array.isArray(records)) fail(`${label} root is not an array`);
  const byId = new Map();
  for (const record of records) {
    const id = record?.ID;
    if (!Number.isInteger(id)) continue;
    const rows = byId.get(id) ?? [];
    rows.push(record);
    byId.set(id, rows);
  }
  return byId;
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

function validateAuthority({ b0, b1, b2, sourcePack }) {
  assert(b0?.schemaId === 'hero-dungeon-stageB0-scope-reset/v1', 'B0 contract schema drift');
  assert(b0?.status === 'DESIGN_FROZEN', 'B0 contract is not DESIGN_FROZEN');
  assert(b0?.completion === 'B0_SCOPE_RESET_COMPLETE', 'B0 contract is incomplete');
  assert(b0?.owner === 'hero-canonical', 'B0 owner drift');
  assert(
    b0?.stages?.some((stage) => stage?.id === 'B3' && stage?.name === 'namenum-ordinal-integrity'),
    'B0 no longer defines B3 namenum-ordinal-integrity',
  );
  assert(b0?.ordinalAuthority?.join?.includes('HeroDungeonLevelInfo.NameNum'), 'B0 NameNum authority drift');
  assert(b0?.ordinalAuthority?.nameNumRequired === true, 'B0 no longer requires NameNum');
  assert(b0?.ordinalAuthority?.perHeroDuplicateNameNumAllowed === false, 'B0 duplicate NameNum policy drift');
  assert(b0?.ordinalAuthority?.fallbackAllowed === false, 'B0 fallback policy drift');

  assert(b1?.schemaId === 'hero-dungeon-stageB1-population-classification/v1', 'B1 schema drift');
  assert(b1?.status === 'PASS', `B1 status=${String(b1?.status)}`);
  assert(b1?.completion === 'B1_POPULATION_CLASSIFICATION_COMPLETE', 'B1 is incomplete');
  assert(b1?.summary?.canonicalHeroCount === EXPECTED_CANONICAL_HERO_COUNT, 'B1 canonical Hero count drift');
  assert(b1?.summary?.hasHeroDungeonCount === 250, 'B1 HAS_HERO_DUNGEON count drift');
  assert(b1?.summary?.totalDungeonLevelReferenceCount === 1274, 'B1 reference count drift');
  assert(b1?.summary?.hardErrorCount === 0, 'B1 has hard errors');

  assert(b2?.schemaId === 'hero-dungeon-stageB2-exact-join-integrity/v1', 'B2 schema drift');
  assert(b2?.stage === 'hero-dungeon-B2', 'B2 stage drift');
  assert(b2?.status === 'PASS', `B2 status=${String(b2?.status)}`);
  assert(b2?.completion === 'B2_EXACT_JOIN_INTEGRITY_COMPLETE', 'B2 is incomplete');
  assert(b2?.owner === 'hero-canonical', 'B2 owner drift');
  assert(b2?.summary?.canonicalHeroCount === EXPECTED_CANONICAL_HERO_COUNT, 'B2 canonical Hero count drift');
  assert(b2?.summary?.hasHeroDungeonCount === 250, 'B2 HAS_HERO_DUNGEON count drift');
  assert(b2?.summary?.totalDungeonLevelReferenceCount === 1274, 'B2 reference count drift');
  assert(b2?.summary?.exactJoinResolvedReferenceCount === 1274, 'B2 resolved reference count drift');
  assert(b2?.summary?.danglingDungeonLevelReferenceCount === 0, 'B2 has dangling references');
  assert(b2?.summary?.duplicateSourceReferenceCount === 0, 'B2 has duplicate source references');
  assert(b2?.summary?.sharedAcrossHeroDungeonLevelIdCount === 0, 'B2 has cross-Hero shared references');
  assert(b2?.summary?.ambiguousTargetReferenceCount === 0, 'B2 has ambiguous target references');
  assert(b2?.summary?.hardErrorCount === 0, 'B2 has hard errors');
  assert(typeof b2?.joinIntegrity?.exactJoinPairSetSha256 === 'string', 'B2 exact join pair-set hash missing');
  assert(typeof b2?.joinIntegrity?.normalizedHeroReferenceSetSha256 === 'string', 'B2 normalized Hero reference-set hash missing');

  assert(sourcePack?.contract === 'configdata-source-pack', 'ConfigData source-pack contract drift');
  assert(sourcePack?.status === 'PASS', 'ConfigData source-pack is not PASS');
  assert(sourcePack?.owner === 'configdata-source-pack', 'ConfigData source-pack owner drift');
  assert(sourcePack?.authoritativePredecessor?.sourceCommitSha === b2?.authority?.sourcePackCommitSha, 'B2/source-pack snapshot SHA mismatch');
}

function b2ReferenceRecords({ b1, b2, heroInformation, heroDungeonLevels, heroInformationBytes, heroDungeonLevelBytes }) {
  assert(sha256(heroInformationBytes) === b2?.authority?.heroInformationSha256, 'B2 HeroInformation bytes changed');
  assert(sha256(heroDungeonLevelBytes) === b2?.authority?.heroDungeonLevelSha256, 'B2 HeroDungeonLevel bytes changed');

  const heroInfoIndex = indexByIntegerId(heroInformation, 'HeroInformationInfo');
  const dungeonIndex = indexByIntegerId(heroDungeonLevels, 'HeroDungeonLevelInfo');
  const hasHeroIds = sortedNumeric([
    ...(b1?.classificationMembership?.dungeonCount5HeroIds ?? []),
    ...(b1?.classificationMembership?.dungeonCount7HeroIds ?? []),
    ...(b1?.classificationMembership?.otherNonEmptyDungeonCountHeroIds ?? []),
  ]);
  assert(hasHeroIds.length === b2.summary.hasHeroDungeonCount, `B2 HAS_HERO_DUNGEON membership total=${hasHeroIds.length}`);
  assert(new Set(hasHeroIds).size === hasHeroIds.length, 'B2 HAS_HERO_DUNGEON membership contains duplicate Hero IDs');

  const records = [];
  for (const heroId of hasHeroIds) {
    const heroRows = heroInfoIndex.get(heroId) ?? [];
    assert(heroRows.length === 1, `Hero ${heroId}: HeroInformation row count=${heroRows.length}`);
    const dungeonLevelIds = heroRows[0]?.DungeonLevels_ID;
    assert(Array.isArray(dungeonLevelIds) && dungeonLevelIds.length > 0, `Hero ${heroId}: DungeonLevels_ID source parity drift`);
    assert(dungeonLevelIds.every((id) => Number.isInteger(id) && id > 0), `Hero ${heroId}: invalid DungeonLevels_ID source value`);
    assert(new Set(dungeonLevelIds).size === dungeonLevelIds.length, `Hero ${heroId}: repeated DungeonLevels_ID source reference`);

    for (const dungeonLevelId of dungeonLevelIds) {
      const targetRows = dungeonIndex.get(dungeonLevelId) ?? [];
      assert(targetRows.length === 1, `DungeonLevel ${dungeonLevelId}: B2 exact target row count=${targetRows.length}`);
    }
    records.push({ heroId, dungeonLevelIds: [...dungeonLevelIds] });
  }

  assert(records.length === b2.summary.hasHeroDungeonCount, 'B2 reconstructed Hero record count mismatch');
  const pairSet = exactJoinPairSet(records);
  const referenceSet = normalizedHeroReferenceSet(records);
  assert(pairSet.length === b2.summary.totalDungeonLevelReferenceCount, 'B2 reconstructed reference count mismatch');
  assert(sha256Json(pairSet) === b2.joinIntegrity.exactJoinPairSetSha256, 'B2 exact join pair-set hash mismatch');
  assert(sha256Json(referenceSet) === b2.joinIntegrity.normalizedHeroReferenceSetSha256, 'B2 normalized Hero reference-set hash mismatch');

  return { records, dungeonIndex, pairSet, referenceSet };
}

function buildMeasurement() {
  const b0 = readJson(B0_PATH);
  const b1 = readJson(B1_PATH);
  const b2 = readJson(B2_PATH);
  const sourcePack = readJson(SOURCE_PACK_PATH);
  validateAuthority({ b0, b1, b2, sourcePack });

  const heroInformationPath = resolveConfigDataFile(HERO_INFORMATION_FILE);
  const heroDungeonLevelPath = resolveConfigDataFile(HERO_DUNGEON_LEVEL_FILE);
  const heroInformationBytes = fs.readFileSync(heroInformationPath);
  const heroDungeonLevelBytes = fs.readFileSync(heroDungeonLevelPath);
  const heroInformation = JSON.parse(heroInformationBytes.toString('utf8'));
  const heroDungeonLevels = JSON.parse(heroDungeonLevelBytes.toString('utf8'));

  const reconstructed = b2ReferenceRecords({
    b1,
    b2,
    heroInformation,
    heroDungeonLevels,
    heroInformationBytes,
    heroDungeonLevelBytes,
  });

  const hardErrors = [];
  const records = [];
  const ordinalDistribution = new Map();
  let missingNameNumCount = 0;
  let invalidNameNumCount = 0;
  let validNameNumReferenceCount = 0;
  const duplicateNameNumHeroIds = [];
  const invalidOrdinalSetHeroIds = [];

  for (const sourceRecord of reconstructed.records) {
    const assignments = [];
    const validOrdinals = [];
    const missingDungeonLevelIds = [];
    const invalidDungeonLevelIds = [];

    for (const dungeonLevelId of sourceRecord.dungeonLevelIds) {
      const target = reconstructed.dungeonIndex.get(dungeonLevelId)[0];
      const hasNameNum = Object.hasOwn(target, 'NameNum');
      const rawNameNum = target.NameNum;
      const missing = !hasNameNum || rawNameNum === null || rawNameNum === '';
      const gateOrdinal = missing ? null : parsePositiveIntegerNameNum(rawNameNum);

      if (missing) {
        missingNameNumCount += 1;
        missingDungeonLevelIds.push(dungeonLevelId);
        hardErrors.push({ code: 'MISSING_NAMENUM', heroId: sourceRecord.heroId, dungeonLevelId });
      } else if (gateOrdinal === null) {
        invalidNameNumCount += 1;
        invalidDungeonLevelIds.push(dungeonLevelId);
        hardErrors.push({
          code: 'INVALID_NAMENUM',
          heroId: sourceRecord.heroId,
          dungeonLevelId,
          rawNameNum,
          valueType: typeof rawNameNum,
        });
      } else {
        validNameNumReferenceCount += 1;
        validOrdinals.push(gateOrdinal);
        ordinalDistribution.set(gateOrdinal, (ordinalDistribution.get(gateOrdinal) ?? 0) + 1);
      }

      assignments.push({ dungeonLevelId, rawNameNum, gateOrdinal });
    }

    const counts = new Map();
    for (const ordinal of validOrdinals) counts.set(ordinal, (counts.get(ordinal) ?? 0) + 1);
    const duplicateNameNums = sortedNumeric([...counts.entries()].filter(([, count]) => count > 1).map(([ordinal]) => ordinal));
    if (duplicateNameNums.length > 0) {
      duplicateNameNumHeroIds.push(sourceRecord.heroId);
      hardErrors.push({
        code: 'DUPLICATE_NAMENUM_WITHIN_HERO',
        heroId: sourceRecord.heroId,
        duplicateNameNums,
      });
    }

    const observedOrdinalSet = sortedNumeric(new Set(validOrdinals));
    const expectedOrdinalSet = Array.from({ length: sourceRecord.dungeonLevelIds.length }, (_, index) => index + 1);
    const ordinalSetValid =
      missingDungeonLevelIds.length === 0 &&
      invalidDungeonLevelIds.length === 0 &&
      duplicateNameNums.length === 0 &&
      observedOrdinalSet.length === expectedOrdinalSet.length &&
      observedOrdinalSet.every((value, index) => value === expectedOrdinalSet[index]);

    if (!ordinalSetValid) {
      invalidOrdinalSetHeroIds.push(sourceRecord.heroId);
      hardErrors.push({
        code: 'INVALID_EXPLICIT_ORDINAL_SET',
        heroId: sourceRecord.heroId,
        sourceReferenceCount: sourceRecord.dungeonLevelIds.length,
        observedOrdinalSet,
        expectedOrdinalSet,
      });
    }

    records.push({
      heroId: sourceRecord.heroId,
      sourceReferenceCount: sourceRecord.dungeonLevelIds.length,
      observedOrdinalSet,
      expectedOrdinalSet,
      ordinalSetValid,
      missingDungeonLevelIds: sortedNumeric(missingDungeonLevelIds),
      invalidDungeonLevelIds: sortedNumeric(invalidDungeonLevelIds),
      duplicateNameNums,
      assignments,
    });
  }

  const normalizedAssignments = records
    .flatMap((record) => record.assignments.map((assignment) => ({
      heroId: record.heroId,
      dungeonLevelId: assignment.dungeonLevelId,
      gateOrdinal: assignment.gateOrdinal,
    })))
    .sort((a, b) => a.heroId - b.heroId || a.dungeonLevelId - b.dungeonLevelId);
  const normalizedHeroOrdinalSets = records
    .map((record) => ({ heroId: record.heroId, ordinals: [...record.observedOrdinalSet] }))
    .sort((a, b) => a.heroId - b.heroId);

  const summary = {
    canonicalHeroCount: b2.summary.canonicalHeroCount,
    noHeroDungeonCount: b2.summary.noHeroDungeonCount,
    hasHeroDungeonCount: b2.summary.hasHeroDungeonCount,
    dungeonCount5HeroCount: b2.summary.dungeonCount5HeroCount,
    dungeonCount7HeroCount: b2.summary.dungeonCount7HeroCount,
    dungeonCount6HeroCount: b2.summary.dungeonCount6HeroCount,
    otherNonEmptyDungeonCountHeroCount: b2.summary.otherNonEmptyDungeonCountHeroCount,
    totalDungeonLevelReferenceCount: b2.summary.totalDungeonLevelReferenceCount,
    exactJoinResolvedReferenceCount: b2.summary.exactJoinResolvedReferenceCount,
    missingNameNumCount,
    invalidNameNumCount,
    validNameNumReferenceCount,
    duplicateNameNumHeroCount: duplicateNameNumHeroIds.length,
    invalidOrdinalSetHeroCount: invalidOrdinalSetHeroIds.length,
    hardErrorCount: hardErrors.length,
  };

  return {
    version: 1,
    schemaId: 'hero-dungeon-stageB3-namenum-ordinal-integrity/v1',
    stage: 'hero-dungeon-B3',
    status: hardErrors.length === 0 ? 'PASS' : 'FAIL',
    completion: hardErrors.length === 0 ? 'B3_NAMENUM_ORDINAL_INTEGRITY_COMPLETE' : 'BLOCKED',
    owner: 'hero-canonical',
    purpose: 'Consume the frozen B2 exact-ID join set and validate HeroDungeonLevelInfo.NameNum as the sole explicit gateOrdinal authority, without using array position, ID arithmetic, PreLevel_ID, names, filenames, UI order, or B4 population acceptance.',
    authority: {
      b0Contract: B0_PATH,
      b1PopulationFreeze: B1_PATH,
      b2ExactJoinFreeze: B2_PATH,
      sourcePackContract: SOURCE_PACK_PATH,
      sourcePackCommitSha: sourcePack.authoritativePredecessor.sourceCommitSha,
      logicalConfigDataRoot: sourcePack.authority.logicalRawPathNamespace,
      heroInformationFile: HERO_INFORMATION_FILE,
      heroInformationSha256: sha256(heroInformationBytes),
      heroDungeonLevelFile: HERO_DUNGEON_LEVEL_FILE,
      heroDungeonLevelSha256: sha256(heroDungeonLevelBytes),
      b2ExactJoinPairSetSha256: b2.joinIntegrity.exactJoinPairSetSha256,
      b2NormalizedHeroReferenceSetSha256: b2.joinIntegrity.normalizedHeroReferenceSetSha256,
      ordinalField: 'HeroDungeonLevelInfo.NameNum',
    },
    scope: {
      inScope: [
        'Consume the B2-frozen exact Hero -> DungeonLevel ID pair set without changing canonical Hero identity or B1 population classification.',
        'Read NameNum only from the uniquely joined HeroDungeonLevelInfo row for each B2-frozen DungeonLevel ID.',
        'Require NameNum to be explicitly present and represent a positive integer.',
        'Require per-Hero NameNum uniqueness.',
        'Validate the explicit NameNum set for each Hero as the complete ordinal set 1..N, where N is that Hero\'s already-observed explicit DungeonLevels_ID reference count.',
        'Freeze normalized explicit ordinal assignments independently of DungeonLevels_ID array order.',
      ],
      outOfScope: [
        'Apply B4 acceptance or rejection based on whether N is 5, 7, 6, or another non-empty cardinality.',
        'Infer gateOrdinal from DungeonLevels_ID array position, DungeonLevel ID arithmetic, PreLevel_ID, Fetter count, names, filenames, or UI order.',
        'Recompute canonical Hero identity, Stage 5 Fetter semantics, Stage 6 Hero lifecycle, or B1/B2 membership.',
        'Modify frontend, localization, assets, release, or presentation.',
      ],
    },
    ordinalIntegrity: {
      nameNumType: 'POSITIVE_INTEGER_TEXT_OR_NUMBER',
      fallbackAllowed: false,
      validNameNumReferenceCount,
      missingNameNumCount,
      invalidNameNumCount,
      duplicateNameNumHeroIds: sortedNumeric(duplicateNameNumHeroIds),
      invalidOrdinalSetHeroIds: sortedNumeric(invalidOrdinalSetHeroIds),
      ordinalValueDistribution: [...ordinalDistribution.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([gateOrdinal, referenceCount]) => ({ gateOrdinal, referenceCount })),
      normalizedOrdinalAssignmentSetSha256: sha256Json(normalizedAssignments),
      normalizedHeroOrdinalSetSha256: sha256Json(normalizedHeroOrdinalSets),
    },
    summary,
    records,
    checks: [
      { name: 'B2 exact join pair-set parity preserved', pass: true, actual: b2.joinIntegrity.exactJoinPairSetSha256 },
      { name: 'every B2-resolved reference has explicit valid NameNum', pass: missingNameNumCount === 0 && invalidNameNumCount === 0 && validNameNumReferenceCount === b2.summary.totalDungeonLevelReferenceCount, actual: validNameNumReferenceCount },
      { name: 'no Hero has duplicate explicit NameNum', pass: duplicateNameNumHeroIds.length === 0, actual: duplicateNameNumHeroIds.length },
      { name: 'every Hero explicit NameNum set is complete 1..N', pass: invalidOrdinalSetHeroIds.length === 0, actual: invalidOrdinalSetHeroIds.length },
      { name: 'forbidden ordinal fallbacks used', pass: true, actual: 0 },
      { name: 'B4 population acceptance deferred', pass: true, actual: 'DEFERRED_TO_B4' },
    ],
    hardErrors,
    reviews: [],
    handoff: {
      nextOwner: 'hero-canonical',
      nextStage: 'B4-population-acceptance',
      nextStart: 'Consume this frozen B3 explicit NameNum ordinal facet together with the frozen B1 population counts. Apply the B0 cardinality acceptance rule only to HAS_HERO_DUNGEON Heroes: exactly 5 or 7 stages pass; 6 and every other non-empty cardinality fail closed. Do not reopen B1-B3 semantics.',
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
    totalDungeonLevelReferenceCount: measurement.summary.totalDungeonLevelReferenceCount,
    validNameNumReferenceCount: measurement.summary.validNameNumReferenceCount,
    missingNameNumCount: measurement.summary.missingNameNumCount,
    invalidNameNumCount: measurement.summary.invalidNameNumCount,
    duplicateNameNumHeroCount: measurement.summary.duplicateNameNumHeroCount,
    invalidOrdinalSetHeroCount: measurement.summary.invalidOrdinalSetHeroCount,
    ordinalValueDistribution: measurement.ordinalIntegrity.ordinalValueDistribution,
    hardErrorCount: measurement.summary.hardErrorCount,
  }, null, 2));
  if (measurement.status !== 'PASS') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`[hero-dungeon-B3] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
