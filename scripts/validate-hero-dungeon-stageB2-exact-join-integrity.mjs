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

function sortedNumeric(values) {
  return [...values].sort((a, b) => a - b);
}

function validateAuthority({ b0, b1, sourcePack }) {
  assert(b0?.schemaId === 'hero-dungeon-stageB0-scope-reset/v1', 'B0 contract schema drift');
  assert(b0?.status === 'DESIGN_FROZEN', 'B0 contract is not DESIGN_FROZEN');
  assert(b0?.completion === 'B0_SCOPE_RESET_COMPLETE', 'B0 contract is incomplete');
  assert(b0?.owner === 'hero-canonical', 'B0 owner drift');
  assert(
    b0?.stages?.some((stage) => stage?.id === 'B2' && stage?.name === 'exact-join-integrity'),
    'B0 no longer defines B2 exact-join-integrity',
  );

  assert(b1?.schemaId === 'hero-dungeon-stageB1-population-classification/v1', 'B1 schema drift');
  assert(b1?.stage === 'hero-dungeon-B1', 'B1 stage drift');
  assert(b1?.status === 'PASS', `B1 status=${String(b1?.status)}`);
  assert(b1?.completion === 'B1_POPULATION_CLASSIFICATION_COMPLETE', 'B1 is incomplete');
  assert(b1?.owner === 'hero-canonical', 'B1 owner drift');
  assert(b1?.summary?.canonicalHeroCount === EXPECTED_CANONICAL_HERO_COUNT, 'B1 canonical Hero count drift');
  assert(b1?.summary?.heroInformationMatchedCanonicalHeroCount === EXPECTED_CANONICAL_HERO_COUNT, 'B1 HeroInformation match count drift');
  assert(b1?.summary?.hardErrorCount === 0, 'B1 has hard errors');
  assert(Array.isArray(b1?.hardErrors) && b1.hardErrors.length === 0, 'B1 hardErrors are not empty');

  assert(sourcePack?.contract === 'configdata-source-pack', 'ConfigData source-pack contract drift');
  assert(sourcePack?.stage === 'repository-size-reduction-B2', 'ConfigData source-pack stage drift');
  assert(sourcePack?.status === 'PASS', 'ConfigData source-pack is not PASS');
  assert(sourcePack?.owner === 'configdata-source-pack', 'ConfigData source-pack owner drift');
  assert(
    sourcePack?.authoritativePredecessor?.sourceCommitSha === b0?.authority?.semanticSnapshotCommitSha,
    'B0/source-pack snapshot SHA mismatch',
  );
  assert(
    sourcePack?.authoritativePredecessor?.sourceCommitSha === b1?.authority?.sourcePackCommitSha,
    'B1/source-pack snapshot SHA mismatch',
  );
}

function b1Membership(b1) {
  const membership = b1?.classificationMembership ?? {};
  const noHeroDungeonHeroIds = membership.noHeroDungeonHeroIds;
  const dungeonCount5HeroIds = membership.dungeonCount5HeroIds;
  const dungeonCount7HeroIds = membership.dungeonCount7HeroIds;
  const otherHeroIds = membership.otherNonEmptyDungeonCountHeroIds;

  for (const [name, values] of Object.entries({
    noHeroDungeonHeroIds,
    dungeonCount5HeroIds,
    dungeonCount7HeroIds,
    otherHeroIds,
  })) {
    assert(Array.isArray(values), `B1 ${name} missing`);
    assert(values.every((id) => Number.isInteger(id) && id > 0), `B1 ${name} contains invalid Hero ID`);
    assert(new Set(values).size === values.length, `B1 ${name} contains duplicate Hero IDs`);
  }

  assert(otherHeroIds.length === 0, 'B1 observed other non-empty cardinality membership drift');

  const all = [...noHeroDungeonHeroIds, ...dungeonCount5HeroIds, ...dungeonCount7HeroIds, ...otherHeroIds];
  assert(all.length === EXPECTED_CANONICAL_HERO_COUNT, `B1 membership total=${all.length}`);
  assert(new Set(all).size === EXPECTED_CANONICAL_HERO_COUNT, 'B1 membership overlaps across classifications');

  assert(noHeroDungeonHeroIds.length === b1.summary.noHeroDungeonCount, 'B1 NO_HERO_DUNGEON membership/count mismatch');
  assert(dungeonCount5HeroIds.length === b1.summary.dungeonCount5HeroCount, 'B1 5-stage membership/count mismatch');
  assert(dungeonCount7HeroIds.length === b1.summary.dungeonCount7HeroCount, 'B1 7-stage membership/count mismatch');
  assert(dungeonCount5HeroIds.length + dungeonCount7HeroIds.length === b1.summary.hasHeroDungeonCount, 'B1 HAS_HERO_DUNGEON membership/count mismatch');

  return {
    noHeroDungeonHeroIds: sortedNumeric(noHeroDungeonHeroIds),
    dungeonCount5HeroIds: sortedNumeric(dungeonCount5HeroIds),
    dungeonCount7HeroIds: sortedNumeric(dungeonCount7HeroIds),
    hasHeroDungeonHeroIds: sortedNumeric([...dungeonCount5HeroIds, ...dungeonCount7HeroIds]),
  };
}

function indexByIntegerId(records, label) {
  const byId = new Map();
  const duplicateIds = new Set();
  let integerIdRecordCount = 0;

  if (!Array.isArray(records)) fail(`${label} root is not an array`);

  for (const record of records) {
    const id = record?.ID;
    if (!Number.isInteger(id)) continue;
    integerIdRecordCount += 1;
    const list = byId.get(id) ?? [];
    list.push(record);
    byId.set(id, list);
    if (list.length > 1) duplicateIds.add(id);
  }

  return {
    byId,
    duplicateIds,
    sourceRecordCount: records.length,
    integerIdRecordCount,
  };
}

function buildMeasurement() {
  const b0 = readJson(B0_PATH);
  const b1 = readJson(B1_PATH);
  const sourcePack = readJson(SOURCE_PACK_PATH);
  validateAuthority({ b0, b1, sourcePack });
  const membership = b1Membership(b1);

  const heroInformationPath = resolveConfigDataFile(HERO_INFORMATION_FILE);
  const heroDungeonLevelPath = resolveConfigDataFile(HERO_DUNGEON_LEVEL_FILE);
  const heroInformationBytes = fs.readFileSync(heroInformationPath);
  const heroDungeonLevelBytes = fs.readFileSync(heroDungeonLevelPath);
  const heroInformation = JSON.parse(heroInformationBytes.toString('utf8'));
  const heroDungeonLevels = JSON.parse(heroDungeonLevelBytes.toString('utf8'));

  assert(
    sha256(heroInformationBytes) === b1?.authority?.heroInformationSha256,
    'B1 HeroInformation source bytes changed under the pinned source-pack authority',
  );

  const heroInfoIndex = indexByIntegerId(heroInformation, 'HeroInformationInfo');
  const dungeonIndex = indexByIntegerId(heroDungeonLevels, 'HeroDungeonLevelInfo');
  const hardErrors = [];
  const records = [];
  const referenceOwners = new Map();
  let totalReferenceCount = 0;
  let resolvedReferenceCount = 0;
  let danglingReferenceCount = 0;
  let ambiguousTargetReferenceCount = 0;
  let duplicateSourceReferenceCount = 0;
  const referencedIds = new Set();
  const resolvedIds = new Set();
  const danglingIds = new Set();
  const ambiguousTargetIds = new Set();
  const duplicateSourceReferenceHeroIds = new Set();

  const noHeroSet = new Set(membership.noHeroDungeonHeroIds);
  const expectedCountByHero = new Map([
    ...membership.dungeonCount5HeroIds.map((id) => [id, 5]),
    ...membership.dungeonCount7HeroIds.map((id) => [id, 7]),
  ]);

  for (const heroId of [...noHeroSet, ...expectedCountByHero.keys()].sort((a, b) => a - b)) {
    const heroRows = heroInfoIndex.byId.get(heroId) ?? [];
    if (heroRows.length !== 1) {
      hardErrors.push({
        code: heroRows.length === 0 ? 'MISSING_B1_HERO_INFORMATION_ROW' : 'DUPLICATE_B1_HERO_INFORMATION_ROW',
        heroId,
        rowCount: heroRows.length,
      });
      continue;
    }

    const source = heroRows[0];
    const present = Object.hasOwn(source, 'DungeonLevels_ID');
    const value = source.DungeonLevels_ID;

    if (noHeroSet.has(heroId)) {
      const matchesNoDungeon = !present || value === null || (Array.isArray(value) && value.length === 0);
      if (!matchesNoDungeon) {
        hardErrors.push({ code: 'B1_NO_HERO_DUNGEON_SOURCE_PARITY_MISMATCH', heroId });
      }
      continue;
    }

    const expectedCount = expectedCountByHero.get(heroId);
    if (!present || !Array.isArray(value) || value.length === 0) {
      hardErrors.push({ code: 'B1_HAS_HERO_DUNGEON_SOURCE_PARITY_MISMATCH', heroId });
      continue;
    }
    if (value.length !== expectedCount) {
      hardErrors.push({
        code: 'B1_DUNGEON_LEVEL_COUNT_PARITY_MISMATCH',
        heroId,
        expected: expectedCount,
        actual: value.length,
      });
    }

    const invalidSourceValues = value.filter((id) => !Number.isInteger(id) || id <= 0);
    if (invalidSourceValues.length > 0) {
      hardErrors.push({
        code: 'INVALID_DUNGEON_LEVEL_SOURCE_REFERENCE',
        heroId,
        values: invalidSourceValues,
      });
    }

    const validIds = value.filter((id) => Number.isInteger(id) && id > 0);
    const counts = new Map();
    for (const id of validIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const duplicateIds = sortedNumeric([...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id));
    if (duplicateIds.length > 0) {
      duplicateSourceReferenceHeroIds.add(heroId);
      duplicateSourceReferenceCount += duplicateIds.reduce((sum, id) => sum + (counts.get(id) - 1), 0);
      hardErrors.push({ code: 'DUPLICATE_DUNGEON_LEVEL_SOURCE_REFERENCE_WITHIN_HERO', heroId, dungeonLevelIds: duplicateIds });
    }

    const danglingDungeonLevelIds = [];
    const ambiguousTargetDungeonLevelIds = [];
    let heroResolvedReferenceCount = 0;

    for (const dungeonLevelId of validIds) {
      totalReferenceCount += 1;
      referencedIds.add(dungeonLevelId);
      const owners = referenceOwners.get(dungeonLevelId) ?? new Set();
      owners.add(heroId);
      referenceOwners.set(dungeonLevelId, owners);

      const targetRows = dungeonIndex.byId.get(dungeonLevelId) ?? [];
      if (targetRows.length === 0) {
        danglingReferenceCount += 1;
        danglingIds.add(dungeonLevelId);
        danglingDungeonLevelIds.push(dungeonLevelId);
        continue;
      }
      if (targetRows.length !== 1) {
        ambiguousTargetReferenceCount += 1;
        ambiguousTargetIds.add(dungeonLevelId);
        ambiguousTargetDungeonLevelIds.push(dungeonLevelId);
        continue;
      }

      resolvedReferenceCount += 1;
      heroResolvedReferenceCount += 1;
      resolvedIds.add(dungeonLevelId);
    }

    records.push({
      heroId,
      dungeonLevelIds: [...value],
      sourceReferenceCount: value.length,
      uniqueSourceReferenceCount: new Set(validIds).size,
      resolvedReferenceCount: heroResolvedReferenceCount,
      danglingDungeonLevelIds: sortedNumeric(new Set(danglingDungeonLevelIds)),
      ambiguousTargetDungeonLevelIds: sortedNumeric(new Set(ambiguousTargetDungeonLevelIds)),
    });
  }

  const sharedAcrossHeroIds = sortedNumeric(
    [...referenceOwners.entries()]
      .filter(([, owners]) => owners.size > 1)
      .map(([id]) => id),
  );
  if (sharedAcrossHeroIds.length > 0) {
    for (const dungeonLevelId of sharedAcrossHeroIds) {
      hardErrors.push({
        code: 'DUNGEON_LEVEL_SOURCE_REFERENCE_SHARED_ACROSS_HEROES',
        dungeonLevelId,
        heroIds: sortedNumeric(referenceOwners.get(dungeonLevelId)),
      });
    }
  }

  for (const dungeonLevelId of sortedNumeric(danglingIds)) {
    hardErrors.push({ code: 'DANGLING_DUNGEON_LEVEL_REFERENCE', dungeonLevelId });
  }
  for (const dungeonLevelId of sortedNumeric(ambiguousTargetIds)) {
    hardErrors.push({
      code: 'AMBIGUOUS_DUNGEON_LEVEL_TARGET_ID',
      dungeonLevelId,
      targetRowCount: dungeonIndex.byId.get(dungeonLevelId)?.length ?? 0,
    });
  }

  if (records.length !== b1.summary.hasHeroDungeonCount) {
    hardErrors.push({
      code: 'B2_HAS_HERO_DUNGEON_RECORD_COUNT_MISMATCH',
      expected: b1.summary.hasHeroDungeonCount,
      actual: records.length,
    });
  }
  if (totalReferenceCount !== b1.summary.totalDungeonLevelReferenceCount) {
    hardErrors.push({
      code: 'B2_REFERENCE_COUNT_MISMATCH',
      expected: b1.summary.totalDungeonLevelReferenceCount,
      actual: totalReferenceCount,
    });
  }

  const summary = {
    canonicalHeroCount: b1.summary.canonicalHeroCount,
    noHeroDungeonCount: b1.summary.noHeroDungeonCount,
    hasHeroDungeonCount: b1.summary.hasHeroDungeonCount,
    dungeonCount5HeroCount: b1.summary.dungeonCount5HeroCount,
    dungeonCount7HeroCount: b1.summary.dungeonCount7HeroCount,
    dungeonCount6HeroCount: b1.summary.dungeonCount6HeroCount,
    otherNonEmptyDungeonCountHeroCount: b1.summary.otherNonEmptyDungeonCountHeroCount,
    totalDungeonLevelReferenceCount: totalReferenceCount,
    exactJoinResolvedReferenceCount: resolvedReferenceCount,
    danglingDungeonLevelReferenceCount: danglingReferenceCount,
    duplicateSourceReferenceCount,
    duplicateSourceReferenceHeroCount: duplicateSourceReferenceHeroIds.size,
    sharedAcrossHeroDungeonLevelIdCount: sharedAcrossHeroIds.length,
    ambiguousTargetReferenceCount,
    ambiguousTargetIdCount: ambiguousTargetIds.size,
    missingNameNumCount: null,
    duplicateNameNumHeroCount: null,
    invalidOrdinalSetHeroCount: null,
    hardErrorCount: hardErrors.length,
  };

  return {
    version: 1,
    schemaId: 'hero-dungeon-stageB2-exact-join-integrity/v1',
    stage: 'hero-dungeon-B2',
    status: hardErrors.length === 0 ? 'PASS' : 'FAIL',
    completion: hardErrors.length === 0 ? 'B2_EXACT_JOIN_INTEGRITY_COMPLETE' : 'BLOCKED',
    owner: 'hero-canonical',
    purpose: 'Validate every explicit B1-frozen HeroInformationInfo.DungeonLevels_ID source reference against exactly one HeroDungeonLevelInfo.ID target. B2 performs no NameNum ordinal interpretation and no 5/7 acceptance decision.',
    authority: {
      b0Contract: B0_PATH,
      b1PopulationFreeze: B1_PATH,
      sourcePackContract: SOURCE_PACK_PATH,
      sourcePackCommitSha: sourcePack.authoritativePredecessor.sourceCommitSha,
      logicalConfigDataRoot: sourcePack.authority.logicalRawPathNamespace,
      heroInformationFile: HERO_INFORMATION_FILE,
      heroInformationSha256: sha256(heroInformationBytes),
      heroDungeonLevelFile: HERO_DUNGEON_LEVEL_FILE,
      heroDungeonLevelSha256: sha256(heroDungeonLevelBytes),
    },
    scope: {
      inScope: [
        'Consume the frozen B1 Hero Dungeon population and membership without reclassifying canonical Hero identity.',
        'Re-read the exact pinned HeroInformationInfo DungeonLevels_ID arrays only to prove B1 source freshness and enumerate explicit references.',
        'Resolve each positive-integer DungeonLevels_ID by exact HeroDungeonLevelInfo.ID equality only.',
        'Fail closed on dangling references, repeated source references, cross-Hero shared source references, or referenced target IDs that are not unique.',
      ],
      outOfScope: [
        'Read, interpret, validate, sort, or infer HeroDungeonLevelInfo.NameNum (B3).',
        'Apply 5/7 versus 6/other cardinality acceptance (B4).',
        'Use DungeonLevels_ID array position, DungeonLevel ID arithmetic, PreLevel_ID, names, filenames, or UI order.',
        'Reopen Stage 5 Fetter semantics, Stage 6 Hero lifecycle, frontend, localization, assets, release, or presentation.',
      ],
    },
    sourceTableIntegrity: {
      heroInformationSourceRecordCount: heroInfoIndex.sourceRecordCount,
      heroInformationIntegerIdRecordCount: heroInfoIndex.integerIdRecordCount,
      heroDungeonLevelSourceRecordCount: dungeonIndex.sourceRecordCount,
      heroDungeonLevelIntegerIdRecordCount: dungeonIndex.integerIdRecordCount,
      heroDungeonLevelUniqueIntegerIdCount: dungeonIndex.byId.size,
      heroDungeonLevelDuplicateIntegerIds: sortedNumeric(dungeonIndex.duplicateIds),
    },
    joinIntegrity: {
      referencedUniqueDungeonLevelIdCount: referencedIds.size,
      resolvedUniqueDungeonLevelIdCount: resolvedIds.size,
      danglingDungeonLevelIds: sortedNumeric(danglingIds),
      ambiguousTargetDungeonLevelIds: sortedNumeric(ambiguousTargetIds),
      duplicateSourceReferenceHeroIds: sortedNumeric(duplicateSourceReferenceHeroIds),
      sharedAcrossHeroDungeonLevelIds: sharedAcrossHeroIds,
    },
    summary,
    records,
    checks: [
      { name: 'B1 frozen membership consumed', pass: records.length === b1.summary.hasHeroDungeonCount, actual: records.length },
      { name: 'B1 raw HeroInformation bytes unchanged', pass: sha256(heroInformationBytes) === b1.authority.heroInformationSha256, actual: sha256(heroInformationBytes) },
      { name: 'all explicit DungeonLevels_ID references resolved by exact HeroDungeonLevelInfo.ID', pass: danglingReferenceCount === 0 && ambiguousTargetReferenceCount === 0 && resolvedReferenceCount === totalReferenceCount, actual: resolvedReferenceCount },
      { name: 'no repeated DungeonLevels_ID source references within a Hero', pass: duplicateSourceReferenceCount === 0, actual: duplicateSourceReferenceCount },
      { name: 'no DungeonLevel source reference is shared across canonical Heroes', pass: sharedAcrossHeroIds.length === 0, actual: sharedAcrossHeroIds.length },
      { name: 'B3 NameNum ordinal validation deferred', pass: true, actual: 'DEFERRED_TO_B3' },
      { name: 'B4 population acceptance deferred', pass: true, actual: 'DEFERRED_TO_B4' },
    ],
    hardErrors,
    reviews: [],
    handoff: {
      nextOwner: 'hero-canonical',
      nextStage: 'B3-namenum-ordinal-integrity',
      nextStart: 'Consume this frozen B2 exact-join set. Read NameNum only from the uniquely joined HeroDungeonLevelInfo rows; require explicit valid positive-integer NameNum and per-Hero uniqueness. Do not infer ordinals from array position, ID arithmetic, PreLevel_ID, names, filenames, or UI order.',
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
    exactJoinResolvedReferenceCount: measurement.summary.exactJoinResolvedReferenceCount,
    danglingDungeonLevelReferenceCount: measurement.summary.danglingDungeonLevelReferenceCount,
    duplicateSourceReferenceCount: measurement.summary.duplicateSourceReferenceCount,
    sharedAcrossHeroDungeonLevelIdCount: measurement.summary.sharedAcrossHeroDungeonLevelIdCount,
    ambiguousTargetReferenceCount: measurement.summary.ambiguousTargetReferenceCount,
    hardErrorCount: measurement.summary.hardErrorCount,
  }, null, 2));
  if (measurement.status !== 'PASS') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`[hero-dungeon-B2] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
