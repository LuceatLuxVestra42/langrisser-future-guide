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
const B4_PATH = 'data/validation/hero-dungeon-stageB4-population-acceptance.v1.json';
const CONSUMER_PATH = 'data/generated/hero-dungeon-supplemental-final.v1.json';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(relativePath) { return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8')); }
function sortedNumeric(values) { return [...values].sort((a, b) => a - b); }
function sha256Json(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function sameNumbers(a, b) { return JSON.stringify(sortedNumeric(a)) === JSON.stringify(sortedNumeric(b)); }

function validatePredecessors({ b0, b1, b2, b3, b4 }) {
  assert(b0?.schemaId === 'hero-dungeon-stageB0-scope-reset/v1', 'B0 schema drift');
  assert(b0?.status === 'DESIGN_FROZEN' && b0?.completion === 'B0_SCOPE_RESET_COMPLETE', 'B0 incomplete');
  assert(b0?.owner === 'hero-canonical', 'B0 owner drift');
  assert(b0?.stages?.some((stage) => stage?.id === 'B5' && stage?.name === 'supplemental-final-freeze'), 'B0 no longer defines B5');

  for (const [label, artifact, schemaId, completion] of [
    ['B1', b1, 'hero-dungeon-stageB1-population-classification/v1', 'B1_POPULATION_CLASSIFICATION_COMPLETE'],
    ['B2', b2, 'hero-dungeon-stageB2-exact-join-integrity/v1', 'B2_EXACT_JOIN_INTEGRITY_COMPLETE'],
    ['B3', b3, 'hero-dungeon-stageB3-namenum-ordinal-integrity/v1', 'B3_NAMENUM_ORDINAL_INTEGRITY_COMPLETE'],
    ['B4', b4, 'hero-dungeon-stageB4-population-acceptance/v1', 'B4_POPULATION_ACCEPTANCE_COMPLETE'],
  ]) {
    assert(artifact?.schemaId === schemaId, `${label} schema drift`);
    assert(artifact?.status === 'PASS', `${label} status=${String(artifact?.status)}`);
    assert(artifact?.completion === completion, `${label} incomplete`);
    assert(artifact?.owner === 'hero-canonical', `${label} owner drift`);
    assert(artifact?.summary?.hardErrorCount === 0, `${label} has hard errors`);
    assert(Array.isArray(artifact?.hardErrors) && artifact.hardErrors.length === 0, `${label} hardErrors are not empty`);
  }

  assert(b4?.summary?.acceptedHeroCount === b1?.summary?.hasHeroDungeonCount, 'B4 accepted population drift');
  assert(b4?.summary?.rejectedHeroCount === 0, 'B4 contains rejected Heroes');
}

function buildMeasurement() {
  const b0 = readJson(B0_PATH);
  const b1 = readJson(B1_PATH);
  const b2 = readJson(B2_PATH);
  const b3 = readJson(B3_PATH);
  const b4 = readJson(B4_PATH);
  const consumer = readJson(CONSUMER_PATH);
  validatePredecessors({ b0, b1, b2, b3, b4 });

  const hardErrors = [];
  const push = (code, detail = {}) => hardErrors.push({ code, ...detail });

  if (consumer?.schemaId !== 'hero-dungeon-supplemental-final/v1') push('CONSUMER_SCHEMA_DRIFT');
  if (consumer?.status !== 'FINAL_FROZEN') push('CONSUMER_NOT_FINAL_FROZEN');
  if (consumer?.completion !== 'B5_SUPPLEMENTAL_FINAL_FREEZE_COMPLETE') push('CONSUMER_COMPLETION_DRIFT');
  if (consumer?.owner !== 'hero-canonical') push('CONSUMER_OWNER_DRIFT');
  if (consumer?.authority?.b1PopulationFreeze !== B1_PATH || consumer?.authority?.b2ExactJoinFreeze !== B2_PATH || consumer?.authority?.b3NameNumOrdinalFreeze !== B3_PATH || consumer?.authority?.b4PopulationAcceptanceFreeze !== B4_PATH) push('CONSUMER_PREDECESSOR_PATH_DRIFT');
  if (consumer?.authority?.sourcePackCommitSha !== b3?.authority?.sourcePackCommitSha) push('CONSUMER_SOURCE_SNAPSHOT_DRIFT');
  if (consumer?.authority?.ordinalAuthority !== 'HeroDungeonLevelInfo.NameNum') push('CONSUMER_ORDINAL_AUTHORITY_DRIFT');

  const shardSpecs = consumer?.storage?.shards;
  if (!Array.isArray(shardSpecs) || shardSpecs.length === 0) push('CONSUMER_SHARD_MANIFEST_MISSING');
  const consumerRecords = [];
  if (Array.isArray(shardSpecs)) {
    for (const shardSpec of shardSpecs) {
      if (typeof shardSpec?.path !== 'string' || !shardSpec.path.startsWith('data/generated/hero-dungeon-supplemental/')) {
        push('INVALID_CONSUMER_SHARD_PATH', { path: shardSpec?.path });
        continue;
      }
      const shardBytes = fs.readFileSync(path.join(ROOT, shardSpec.path));
      const shardSha = crypto.createHash('sha256').update(shardBytes).digest('hex');
      if (shardSha !== shardSpec.sha256) push('CONSUMER_SHARD_SHA_MISMATCH', { path: shardSpec.path, expected: shardSpec.sha256, actual: shardSha });
      const shard = JSON.parse(shardBytes.toString('utf8'));
      if (shard?.schemaId !== 'hero-dungeon-supplemental-shard/v1' || !Array.isArray(shard?.records)) {
        push('INVALID_CONSUMER_SHARD_SCHEMA', { path: shardSpec.path });
        continue;
      }
      if (shard.records.length !== shardSpec.recordCount) push('CONSUMER_SHARD_RECORD_COUNT_MISMATCH', { path: shardSpec.path });
      consumerRecords.push(...shard.records);
    }
  }
  const entries = consumerRecords.sort((a, b) => Number(a?.heroId) - Number(b?.heroId));
  const heroIds = [];
  const noHeroDungeonIds = [];
  const hasHeroDungeonIds = [];
  const count5Ids = [];
  const count7Ids = [];
  const assignments = [];
  const heroOrdinalSets = [];
  const normalizedFacet = [];
  let totalReferences = 0;

  for (const value of entries) {
    const heroId = value?.heroId;
    if (!Number.isInteger(heroId) || heroId <= 0) {
      push('INVALID_CONSUMER_HERO_ID', { heroId });
      continue;
    }
    heroIds.push(heroId);

    if (value?.state === 'NO_HERO_DUNGEON') {
      noHeroDungeonIds.push(heroId);
      if (value?.accepted !== null || value?.gateCount !== 0 || !Array.isArray(value?.stages) || value.stages.length !== 0) push('INVALID_NO_HERO_DUNGEON_FACET', { heroId });
      normalizedFacet.push({ heroId, state: 'NO_HERO_DUNGEON', accepted: null, gateCount: 0, stages: [] });
      continue;
    }

    if (value?.state !== 'HAS_HERO_DUNGEON') {
      push('INVALID_HERO_DUNGEON_STATE', { heroId, state: value?.state });
      continue;
    }
    hasHeroDungeonIds.push(heroId);
    if (value?.accepted !== true) push('HAS_HERO_DUNGEON_NOT_ACCEPTED', { heroId });
    const stages = value?.stages;
    if (!Array.isArray(stages) || ![5, 7].includes(value?.gateCount) || stages.length !== value.gateCount) {
      push('INVALID_GATE_COUNT_OR_STAGE_LENGTH', { heroId, gateCount: value?.gateCount, stageLength: Array.isArray(stages) ? stages.length : null });
      continue;
    }
    if (value.gateCount === 5) count5Ids.push(heroId); else count7Ids.push(heroId);

    const ordinals = [];
    const localDungeonIds = new Set();
    const normalizedStages = [];
    for (const tuple of stages) {
      const gateOrdinal = Array.isArray(tuple) ? tuple[0] : null;
      const dungeonLevelId = Array.isArray(tuple) ? tuple[1] : null;
      if (!Array.isArray(tuple) || tuple.length !== 2 || !Number.isInteger(gateOrdinal) || gateOrdinal <= 0 || !Number.isInteger(dungeonLevelId) || dungeonLevelId <= 0) {
        push('INVALID_STAGE_FACET', { heroId, stage: tuple });
        continue;
      }
      if (localDungeonIds.has(dungeonLevelId)) push('DUPLICATE_DUNGEON_LEVEL_WITHIN_HERO', { heroId, dungeonLevelId });
      localDungeonIds.add(dungeonLevelId);
      ordinals.push(gateOrdinal);
      assignments.push({ heroId, dungeonLevelId, gateOrdinal });
      normalizedStages.push({ gateOrdinal, dungeonLevelId });
      totalReferences += 1;
    }
    const sortedOrdinals = sortedNumeric(ordinals);
    const expectedOrdinals = Array.from({ length: value.gateCount }, (_, index) => index + 1);
    if (!sameNumbers(sortedOrdinals, expectedOrdinals) || new Set(ordinals).size !== ordinals.length) push('INVALID_CONSUMER_ORDINAL_SET', { heroId, ordinals: sortedOrdinals });
    normalizedStages.sort((a, b) => a.gateOrdinal - b.gateOrdinal);
    normalizedFacet.push({ heroId, state: 'HAS_HERO_DUNGEON', accepted: true, gateCount: value.gateCount, stages: normalizedStages });
    heroOrdinalSets.push({ heroId, ordinals: sortedOrdinals });
  }

  if (new Set(heroIds).size !== heroIds.length) push('DUPLICATE_CONSUMER_HERO_ID');
  if (!sameNumbers(heroIds, [...b1.classificationMembership.noHeroDungeonHeroIds, ...b1.classificationMembership.dungeonCount5HeroIds, ...b1.classificationMembership.dungeonCount7HeroIds])) push('CONSUMER_CANONICAL_MEMBERSHIP_MISMATCH');
  if (!sameNumbers(noHeroDungeonIds, b1.classificationMembership.noHeroDungeonHeroIds)) push('NO_HERO_DUNGEON_MEMBERSHIP_MISMATCH');
  if (!sameNumbers(count5Ids, b1.classificationMembership.dungeonCount5HeroIds)) push('COUNT5_MEMBERSHIP_MISMATCH');
  if (!sameNumbers(count7Ids, b1.classificationMembership.dungeonCount7HeroIds)) push('COUNT7_MEMBERSHIP_MISMATCH');
  if (totalReferences !== b1.summary.totalDungeonLevelReferenceCount) push('REFERENCE_COUNT_MISMATCH', { expected: b1.summary.totalDungeonLevelReferenceCount, actual: totalReferences });

  const normalizedAssignments = assignments.sort((a, b) => a.heroId - b.heroId || a.dungeonLevelId - b.dungeonLevelId);
  const normalizedHeroOrdinalSets = heroOrdinalSets.sort((a, b) => a.heroId - b.heroId);
  const acceptedIds = sortedNumeric(hasHeroDungeonIds);
  const sortedCount5 = sortedNumeric(count5Ids);
  const sortedCount7 = sortedNumeric(count7Ids);
  const integrity = {
    b2ExactJoinPairSetSha256: b3.authority.b2ExactJoinPairSetSha256,
    normalizedOrdinalAssignmentSetSha256: sha256Json(normalizedAssignments),
    normalizedHeroOrdinalSetSha256: sha256Json(normalizedHeroOrdinalSets),
    acceptedHeroIdSetSha256: sha256Json(acceptedIds),
    acceptedCount5HeroIdSetSha256: sha256Json(sortedCount5),
    acceptedCount7HeroIdSetSha256: sha256Json(sortedCount7),
    consumerHeroFacetSha256: sha256Json(normalizedFacet),
  };

  if (integrity.normalizedOrdinalAssignmentSetSha256 !== b3.ordinalIntegrity.normalizedOrdinalAssignmentSetSha256) push('B3_ASSIGNMENT_HASH_MISMATCH');
  if (integrity.normalizedHeroOrdinalSetSha256 !== b3.ordinalIntegrity.normalizedHeroOrdinalSetSha256) push('B3_HERO_ORDINAL_HASH_MISMATCH');
  if (integrity.acceptedHeroIdSetSha256 !== b4.acceptance.acceptedHeroIdSetSha256) push('B4_ACCEPTED_HERO_HASH_MISMATCH');
  if (integrity.acceptedCount5HeroIdSetSha256 !== b4.acceptance.acceptedCount5HeroIdSetSha256) push('B4_COUNT5_HASH_MISMATCH');
  if (integrity.acceptedCount7HeroIdSetSha256 !== b4.acceptance.acceptedCount7HeroIdSetSha256) push('B4_COUNT7_HASH_MISMATCH');
  for (const [key, value] of Object.entries(integrity)) {
    if (consumer?.integrity?.[key] !== value) push('CONSUMER_INTEGRITY_FIELD_MISMATCH', { key, expected: value, actual: consumer?.integrity?.[key] });
  }

  const summary = {
    canonicalHeroCount: heroIds.length,
    noHeroDungeonCount: noHeroDungeonIds.length,
    hasHeroDungeonCount: hasHeroDungeonIds.length,
    dungeonCount5HeroCount: count5Ids.length,
    dungeonCount7HeroCount: count7Ids.length,
    dungeonCount6HeroCount: 0,
    otherNonEmptyDungeonCountHeroCount: 0,
    totalDungeonLevelReferenceCount: totalReferences,
    danglingDungeonLevelReferenceCount: b2.summary.danglingDungeonLevelReferenceCount,
    missingNameNumCount: b3.summary.missingNameNumCount,
    duplicateNameNumHeroCount: b3.summary.duplicateNameNumHeroCount,
    invalidOrdinalSetHeroCount: b3.summary.invalidOrdinalSetHeroCount,
    acceptedHeroCount: acceptedIds.length,
    rejectedHeroCount: b4.summary.rejectedHeroCount,
    hardErrorCount: hardErrors.length,
  };

  for (const [key, value] of Object.entries(summary)) {
    if (key !== 'hardErrorCount' && consumer?.summary?.[key] !== value) push('CONSUMER_SUMMARY_MISMATCH', { key, expected: value, actual: consumer?.summary?.[key] });
  }
  summary.hardErrorCount = hardErrors.length;

  return {
    version: 1,
    schemaId: 'hero-dungeon-stageB5-supplemental-final-freeze/v1',
    stage: 'hero-dungeon-B5',
    status: hardErrors.length === 0 ? 'PASS' : 'FAIL',
    completion: hardErrors.length === 0 ? 'B5_SUPPLEMENTAL_FINAL_FREEZE_COMPLETE' : 'BLOCKED',
    lifecycle: hardErrors.length === 0 ? 'FINAL_FROZEN' : 'BLOCKED',
    owner: 'hero-canonical',
    purpose: 'Freeze the reusable Hero Dungeon supplemental consumer after B1-B4 complete, without reopening raw ConfigData interpretation or the primary Hero lifecycle.',
    authority: {
      consumer: CONSUMER_PATH,
      b1PopulationFreeze: B1_PATH,
      b2ExactJoinFreeze: B2_PATH,
      b3NameNumOrdinalFreeze: B3_PATH,
      b4PopulationAcceptanceFreeze: B4_PATH,
      sourcePackCommitSha: b3.authority.sourcePackCommitSha,
    },
    scope: {
      inScope: [
        'Freeze the B1-B4 validated supplemental Hero Dungeon facet for downstream exact-ID reuse.',
        'Validate consumer membership, explicit gate ordinals, reference counts, predecessor hashes, and accepted 5/7 populations from frozen repository artifacts only.',
        'Keep NO_HERO_DUNGEON entries explicit and non-blocking.',
      ],
      outOfScope: [
        'Read or reinterpret raw ConfigData.',
        'Recompute canonical Hero identity, Fetter semantics, or Stage 5/6 outputs.',
        'Add localization, frontend presentation, asset, release, or hosted behavior.',
        'Infer gate order from array position, ID arithmetic, PreLevel_ID, names, filenames, or UI order.',
      ],
    },
    integrity,
    summary,
    checks: [
      { name: 'B1-B4 predecessor chain remains complete', pass: true, actual: 'PASS' },
      { name: 'final consumer contains exactly 267 canonical Hero facets', pass: heroIds.length === 267, actual: heroIds.length },
      { name: 'NO_HERO_DUNGEON membership preserved', pass: noHeroDungeonIds.length === 17, actual: noHeroDungeonIds.length },
      { name: 'HAS_HERO_DUNGEON membership and 5/7 acceptance preserved', pass: acceptedIds.length === 250 && b4.summary.rejectedHeroCount === 0, actual: acceptedIds.length },
      { name: 'B3 normalized ordinal assignment hash preserved', pass: integrity.normalizedOrdinalAssignmentSetSha256 === b3.ordinalIntegrity.normalizedOrdinalAssignmentSetSha256, actual: integrity.normalizedOrdinalAssignmentSetSha256 },
      { name: 'B3 normalized Hero ordinal-set hash preserved', pass: integrity.normalizedHeroOrdinalSetSha256 === b3.ordinalIntegrity.normalizedHeroOrdinalSetSha256, actual: integrity.normalizedHeroOrdinalSetSha256 },
      { name: 'B4 accepted Hero ID hashes preserved', pass: integrity.acceptedHeroIdSetSha256 === b4.acceptance.acceptedHeroIdSetSha256, actual: integrity.acceptedHeroIdSetSha256 },
      { name: 'raw ConfigData read during B5', pass: true, actual: 0 },
    ],
    hardErrors,
    reviews: [],
    primaryHeroLifecycle: {
      reopened: false,
      stage5_1FetterSemanticChanged: false,
      stage6ConsumerChanged: false,
      canonicalHeroPopulationChanged: false,
    },
    handoff: {
      currentOwnerComplete: hardErrors.length === 0,
      blockers: hardErrors,
      nonBlockingReviews: [],
      nextOwner: null,
      nextStage: null,
      nextStart: 'Hero Dungeon supplemental semantics are closed. Any localization/frontend integration is a separate owner and must consume data/generated/hero-dungeon-supplemental-final.v1.json without raw fallback.',
    },
    reopenConditions: consumer?.reopenConditions ?? [],
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
    lifecycle: measurement.lifecycle,
    canonicalHeroCount: measurement.summary.canonicalHeroCount,
    noHeroDungeonCount: measurement.summary.noHeroDungeonCount,
    hasHeroDungeonCount: measurement.summary.hasHeroDungeonCount,
    dungeonCount5HeroCount: measurement.summary.dungeonCount5HeroCount,
    dungeonCount7HeroCount: measurement.summary.dungeonCount7HeroCount,
    totalDungeonLevelReferenceCount: measurement.summary.totalDungeonLevelReferenceCount,
    hardErrorCount: measurement.summary.hardErrorCount,
  }, null, 2));
  if (measurement.status !== 'PASS') process.exitCode = 1;
}

try { main(); } catch (error) {
  console.error(`[hero-dungeon-B5] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
