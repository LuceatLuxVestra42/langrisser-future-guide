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
const HERO_LIFECYCLE_PATH = 'data/validation/hero-stage6-4-final.v1.json';
const HERO_MANIFEST_PATH = 'data/generated/hero-detail.v1.json';
const STAGE5_1_PATH = 'data/validation/hero-page-stage5-1-final.v1.json';
const SOURCE_PACK_PATH = 'data/contracts/configdata-source-pack-contract.v1.json';
const EXPECTED_PATH = 'data/validation/hero-dungeon-stageB1-population-classification.v1.json';
const HERO_INFORMATION_FILE = 'ConfigDataHeroInformationInfo.json';
const EXPECTED_CANONICAL_HERO_COUNT = 267;

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalHeroIds(heroManifest) {
  assert(heroManifest?.stage === 'hero-page-6-3', `Hero manifest stage drift: ${String(heroManifest?.stage)}`);
  assert(heroManifest?.status === 'PASS_WITH_REVIEW', `Hero manifest status drift: ${String(heroManifest?.status)}`);
  assert(heroManifest?.completion === 'COMPLETE', `Hero manifest completion drift: ${String(heroManifest?.completion)}`);
  assert(heroManifest?.summary?.canonicalHeroCount === EXPECTED_CANONICAL_HERO_COUNT, 'Hero manifest canonical count drift');
  assert(heroManifest?.summary?.generatedHeroCount === EXPECTED_CANONICAL_HERO_COUNT, 'Hero manifest generated count drift');
  assert(heroManifest?.summary?.hardErrorCount === 0, 'Hero manifest has hard errors');
  assert(heroManifest?.storage?.mode === 'SHARDED_BY_HERO', 'Hero manifest storage mode drift');
  assert(heroManifest?.storage?.recordCount === EXPECTED_CANONICAL_HERO_COUNT, 'Hero manifest storage record count drift');

  const keys = Object.keys(heroManifest?.storage?.byHeroId ?? {});
  assert(keys.length === EXPECTED_CANONICAL_HERO_COUNT, `Hero manifest byHeroId count=${keys.length}`);

  const ids = keys.map((key) => Number(key));
  assert(ids.every((id) => Number.isInteger(id) && id > 0), 'Hero manifest contains a non-positive-integer Hero ID key');
  assert(new Set(ids).size === EXPECTED_CANONICAL_HERO_COUNT, 'Hero manifest contains duplicate numeric Hero IDs');

  for (const id of ids) {
    const entry = heroManifest.storage.byHeroId[String(id)];
    assert(entry?.path === `data/generated/hero-detail/by-id/${id}.json`, `Hero ${id}: shard path drift`);
  }
  return ids.sort((a, b) => a - b);
}

function validateAuthority({ b0, heroLifecycle, stage5_1, sourcePack }) {
  assert(b0?.schemaId === 'hero-dungeon-stageB0-scope-reset/v1', 'B0 contract schema drift');
  assert(b0?.status === 'DESIGN_FROZEN', 'B0 contract is not DESIGN_FROZEN');
  assert(b0?.completion === 'B0_SCOPE_RESET_COMPLETE', 'B0 contract is not complete');
  assert(b0?.owner === 'hero-canonical', 'B0 owner drift');
  assert(b0?.authority?.canonicalHeroCount === EXPECTED_CANONICAL_HERO_COUNT, 'B0 canonical Hero count drift');
  assert(b0?.classification?.noHeroDungeon?.state === 'NO_HERO_DUNGEON', 'B0 NO_HERO_DUNGEON rule drift');
  assert(b0?.classification?.hasHeroDungeon?.state === 'HAS_HERO_DUNGEON', 'B0 HAS_HERO_DUNGEON rule drift');
  assert(b0?.populationAcceptance?.appliesTo === 'HAS_HERO_DUNGEON_ONLY', 'B0 population acceptance scope drift');
  assert(Array.isArray(b0?.populationAcceptance?.allowedDungeonLevelCounts), 'B0 allowed cardinalities missing');
  assert(JSON.stringify(b0.populationAcceptance.allowedDungeonLevelCounts) === JSON.stringify([5, 7]), 'B0 allowed cardinalities drift');

  assert(heroLifecycle?.stage === 'hero-page-6-4', 'Hero lifecycle stage drift');
  assert(heroLifecycle?.status === 'PASS_WITH_REVIEW', 'Hero lifecycle status drift');
  assert(heroLifecycle?.completion === 'COMPLETE', 'Hero lifecycle completion drift');
  assert(heroLifecycle?.heroDataPipelineStatus === 'FINAL_FROZEN', 'Hero lifecycle is not FINAL_FROZEN');
  assert(heroLifecycle?.summary?.canonicalHeroCount === EXPECTED_CANONICAL_HERO_COUNT, 'Hero lifecycle canonical count drift');
  assert(heroLifecycle?.summary?.hardErrorCount === 0, 'Hero lifecycle has hard errors');

  assert(stage5_1?.stage === 'hero-page-5-1', 'Stage 5-1 predecessor stage drift');
  assert(stage5_1?.status === 'PASS', 'Stage 5-1 predecessor status drift');
  assert(stage5_1?.completion === 'COMPLETE', 'Stage 5-1 predecessor is incomplete');
  assert(stage5_1?.summary?.canonicalHeroCount === EXPECTED_CANONICAL_HERO_COUNT, 'Stage 5-1 canonical count drift');
  assert(stage5_1?.summary?.hardErrorCount === 0, 'Stage 5-1 predecessor has hard errors');
  assert(
    typeof stage5_1?.semanticRules?.conditionType2?.candidateResolver === 'string' &&
      stage5_1.semanticRules.conditionType2.candidateResolver.includes('HeroInformationInfo.ID'),
    'Stage 5-1 no longer records canonical HeroInformationInfo.ID ownership semantics',
  );
  assert(
    typeof stage5_1?.semanticRules?.conditionType2?.missionStageJoin === 'string' &&
      stage5_1.semanticRules.conditionType2.missionStageJoin.includes('HeroInformationInfo.DungeonLevels_ID[]'),
    'Stage 5-1 no longer records DungeonLevels_ID reverse ownership semantics',
  );

  assert(sourcePack?.contract === 'configdata-source-pack', 'ConfigData source-pack contract drift');
  assert(sourcePack?.stage === 'repository-size-reduction-B2', 'ConfigData source-pack stage drift');
  assert(sourcePack?.status === 'PASS', 'ConfigData source-pack is not PASS');
  assert(sourcePack?.owner === 'configdata-source-pack', 'ConfigData source-pack owner drift');
  assert(sourcePack?.authoritativePredecessor?.sourceCommitSha === b0?.authority?.semanticSnapshotCommitSha, 'B0/source-pack snapshot SHA mismatch');
  assert(sourcePack?.authority?.logicalRawPathNamespace === b0?.authority?.semanticSnapshotLogicalRoot, 'B0/source-pack logical root mismatch');
}

function classify({ heroIds, heroInformation }) {
  const hardErrors = [];
  const recordsById = new Map();
  const duplicateIds = new Set();

  if (!Array.isArray(heroInformation)) {
    hardErrors.push({ code: 'HERO_INFORMATION_ROOT_NOT_ARRAY' });
    return { hardErrors, records: [], distribution: new Map(), sourceRecordCount: 0, duplicateIds: [] };
  }

  for (const record of heroInformation) {
    const id = record?.ID;
    if (!Number.isInteger(id)) continue;
    if (recordsById.has(id)) duplicateIds.add(id);
    else recordsById.set(id, record);
  }

  for (const id of duplicateIds) {
    if (heroIds.includes(id)) hardErrors.push({ code: 'DUPLICATE_CANONICAL_HERO_INFORMATION_ID', heroId: id });
  }

  const distribution = new Map();
  const records = [];

  for (const heroId of heroIds) {
    const source = recordsById.get(heroId);
    if (!source) {
      hardErrors.push({ code: 'MISSING_CANONICAL_HERO_INFORMATION', heroId });
      continue;
    }

    const present = Object.hasOwn(source, 'DungeonLevels_ID');
    const value = source.DungeonLevels_ID;
    let sourcePresence;
    let state;
    let dungeonLevelIds = [];

    if (!present) {
      sourcePresence = 'ABSENT';
      state = 'NO_HERO_DUNGEON';
    } else if (value === null) {
      sourcePresence = 'NULL';
      state = 'NO_HERO_DUNGEON';
    } else if (Array.isArray(value) && value.length === 0) {
      sourcePresence = 'EMPTY_ARRAY';
      state = 'NO_HERO_DUNGEON';
    } else if (Array.isArray(value)) {
      sourcePresence = 'NON_EMPTY_ARRAY';
      state = 'HAS_HERO_DUNGEON';
      dungeonLevelIds = [...value];
      distribution.set(value.length, (distribution.get(value.length) ?? 0) + 1);
    } else {
      hardErrors.push({
        code: 'INVALID_DUNGEON_LEVELS_FIELD_SHAPE',
        heroId,
        valueType: typeof value,
      });
      continue;
    }

    records.push({
      heroId,
      state,
      sourcePresence,
      dungeonLevelCount: dungeonLevelIds.length,
      dungeonLevelIds,
    });
  }

  return {
    hardErrors,
    records,
    distribution,
    sourceRecordCount: heroInformation.length,
    duplicateIds: [...duplicateIds].sort((a, b) => a - b),
  };
}

function buildMeasurement() {
  const b0 = readJson(B0_PATH);
  const heroLifecycle = readJson(HERO_LIFECYCLE_PATH);
  const heroManifest = readJson(HERO_MANIFEST_PATH);
  const stage5_1 = readJson(STAGE5_1_PATH);
  const sourcePack = readJson(SOURCE_PACK_PATH);
  validateAuthority({ b0, heroLifecycle, stage5_1, sourcePack });

  const heroIds = canonicalHeroIds(heroManifest);
  const heroInformationPath = resolveConfigDataFile(HERO_INFORMATION_FILE);
  const heroInformationBytes = fs.readFileSync(heroInformationPath);
  const heroInformation = JSON.parse(heroInformationBytes.toString('utf8'));
  const classified = classify({ heroIds, heroInformation });

  const noHeroDungeon = classified.records.filter((record) => record.state === 'NO_HERO_DUNGEON');
  const hasHeroDungeon = classified.records.filter((record) => record.state === 'HAS_HERO_DUNGEON');
  const countOf = (count) => hasHeroDungeon.filter((record) => record.dungeonLevelCount === count).length;
  const otherNonEmpty = hasHeroDungeon.filter((record) => ![5, 7].includes(record.dungeonLevelCount));
  const totalRefs = hasHeroDungeon.reduce((sum, record) => sum + record.dungeonLevelCount, 0);
  const absentCount = noHeroDungeon.filter((record) => record.sourcePresence === 'ABSENT').length;
  const nullCount = noHeroDungeon.filter((record) => record.sourcePresence === 'NULL').length;
  const emptyArrayCount = noHeroDungeon.filter((record) => record.sourcePresence === 'EMPTY_ARRAY').length;

  if (classified.records.length !== EXPECTED_CANONICAL_HERO_COUNT) {
    classified.hardErrors.push({
      code: 'CLASSIFIED_CANONICAL_HERO_COUNT_MISMATCH',
      expected: EXPECTED_CANONICAL_HERO_COUNT,
      actual: classified.records.length,
    });
  }

  const distribution = [...classified.distribution.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dungeonLevelCount, heroCount]) => ({ dungeonLevelCount, heroCount }));

  const summary = {
    canonicalHeroCount: EXPECTED_CANONICAL_HERO_COUNT,
    heroInformationSourceRecordCount: classified.sourceRecordCount,
    heroInformationMatchedCanonicalHeroCount: classified.records.length,
    noHeroDungeonCount: noHeroDungeon.length,
    hasHeroDungeonCount: hasHeroDungeon.length,
    dungeonCount5HeroCount: countOf(5),
    dungeonCount7HeroCount: countOf(7),
    dungeonCount6HeroCount: countOf(6),
    otherNonEmptyDungeonCountHeroCount: otherNonEmpty.length,
    totalDungeonLevelReferenceCount: totalRefs,
    danglingDungeonLevelReferenceCount: null,
    missingNameNumCount: null,
    duplicateNameNumHeroCount: null,
    invalidOrdinalSetHeroCount: null,
    hardErrorCount: classified.hardErrors.length,
  };

  return {
    version: 1,
    schemaId: 'hero-dungeon-stageB1-population-classification/v1',
    stage: 'hero-dungeon-B1',
    status: classified.hardErrors.length === 0 ? 'PASS' : 'FAIL',
    completion: classified.hardErrors.length === 0 ? 'B1_POPULATION_CLASSIFICATION_COMPLETE' : 'BLOCKED',
    owner: 'hero-canonical',
    purpose: 'Classify the frozen 267-Hero population by explicit HeroInformationInfo.DungeonLevels_ID presence/content and publish the observed non-empty cardinality distribution without performing DungeonLevel target JOINs, NameNum ordinal validation, or B4 cardinality acceptance.',
    authority: {
      b0Contract: B0_PATH,
      heroLifecycleSource: HERO_LIFECYCLE_PATH,
      heroManifest: HERO_MANIFEST_PATH,
      heroInformationOwnershipPredecessor: STAGE5_1_PATH,
      sourcePackContract: SOURCE_PACK_PATH,
      sourcePackCommitSha: sourcePack.authoritativePredecessor.sourceCommitSha,
      logicalConfigDataRoot: sourcePack.authority.logicalRawPathNamespace,
      heroInformationFile: HERO_INFORMATION_FILE,
      heroInformationSha256: sha256(heroInformationBytes),
      canonicalHeroCount: EXPECTED_CANONICAL_HERO_COUNT,
    },
    scope: {
      inScope: [
        'Enumerate canonical Hero IDs from the frozen hero-detail manifest.',
        'Resolve the pinned ConfigData snapshot through the admitted maintenance source-pack resolver.',
        'Reuse the completed Stage 5-1 HeroInformationInfo.ID ownership relation.',
        'Classify absent/null/empty DungeonLevels_ID as NO_HERO_DUNGEON and non-empty arrays as HAS_HERO_DUNGEON.',
        'Publish the exact observed non-empty DungeonLevels_ID cardinality distribution.',
      ],
      outOfScope: [
        'Join DungeonLevels_ID values to HeroDungeonLevelInfo.ID (B2).',
        'Read or validate HeroDungeonLevelInfo.NameNum (B3).',
        'Accept or reject 5/7 versus other non-empty cardinalities (B4).',
        'Recompute canonical Hero identity, Stage 5 Fetter semantics, or Stage 6 outputs.',
        'Modify frontend, localization, assets, release, or presentation.',
      ],
    },
    classificationBreakdown: {
      absentDungeonLevelsFieldCount: absentCount,
      nullDungeonLevelsFieldCount: nullCount,
      emptyDungeonLevelsArrayCount: emptyArrayCount,
      nonEmptyDungeonLevelsArrayCount: hasHeroDungeon.length,
    },
    nonEmptyCardinalityDistribution: distribution,
    summary,
    records: classified.records,
    checks: [
      { name: 'frozen canonical Hero population reused', pass: heroIds.length === EXPECTED_CANONICAL_HERO_COUNT, actual: heroIds.length },
      { name: 'all canonical Heroes matched by exact HeroInformationInfo.ID', pass: classified.records.length === EXPECTED_CANONICAL_HERO_COUNT, actual: classified.records.length },
      { name: 'every matched Hero classified exactly once', pass: noHeroDungeon.length + hasHeroDungeon.length === EXPECTED_CANONICAL_HERO_COUNT, actual: noHeroDungeon.length + hasHeroDungeon.length },
      { name: 'B2 exact DungeonLevel target JOIN deferred', pass: true, actual: 'DEFERRED_TO_B2' },
      { name: 'B3 NameNum ordinal validation deferred', pass: true, actual: 'DEFERRED_TO_B3' },
      { name: 'B4 population acceptance deferred', pass: true, actual: 'DEFERRED_TO_B4' },
    ],
    duplicateHeroInformationIds: classified.duplicateIds,
    hardErrors: classified.hardErrors,
    reviews: otherNonEmpty.length > 0
      ? [{
          code: 'B4_POPULATION_ACCEPTANCE_PENDING',
          detail: `${otherNonEmpty.length} HAS_HERO_DUNGEON Heroes have a non-empty cardinality outside 5/7; B1 only reports this observation and B4 owns acceptance/blocking classification.`,
          blockingB1: false,
        }]
      : [],
    handoff: {
      nextOwner: 'hero-canonical',
      nextStage: 'B2-exact-join-integrity',
      nextStart: 'Consume this frozen B1 classification and exact raw DungeonLevels_ID arrays; resolve every explicit value by exact HeroDungeonLevelInfo.ID only. Do not use array position, ID arithmetic, PreLevel order, names, filenames, or UI order.',
    },
  };
}

function main() {
  const outputPath = arg('--output');
  const expectedPath = arg('--expected');
  const measurement = buildMeasurement();
  const serialized = `${JSON.stringify(measurement, null, 2)}\n`;

  if (outputPath) {
    const absolute = path.resolve(outputPath);
    const relative = path.relative(ROOT, absolute);
    const insideRepo = relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
    if (insideRepo) fail('--output must point outside the repository; committed validation is a separate explicit write step');
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, serialized);
  }

  if (expectedPath) {
    const expected = readJson(expectedPath);
    if (JSON.stringify(expected) !== JSON.stringify(measurement)) {
      fail(`B1 committed validation parity mismatch: ${expectedPath}`);
    }
  }

  console.log(JSON.stringify({
    status: measurement.status,
    completion: measurement.completion,
    summary: measurement.summary,
    classificationBreakdown: measurement.classificationBreakdown,
    nonEmptyCardinalityDistribution: measurement.nonEmptyCardinalityDistribution,
    expectedParity: expectedPath ? 'PASS' : 'NOT_REQUESTED',
  }, null, 2));

  if (measurement.status !== 'PASS') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`[hero-dungeon-B1] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
