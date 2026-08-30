import assert from 'node:assert/strict';
import {
  buildStage66OutputDigest,
  buildStage66SourceDigest,
  buildStage66SourceRef,
  buildStage66ValidationDigest,
  classifyStage66SourceRef,
} from './lib/soldier-stage6-6-semantic-projections.mjs';
import { sameSemanticDigest } from './lib/frozen-semantic-digest.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS: ${name}`);
}

function clone(value) { return structuredClone(value); }
const same = (a, b) => sameSemanticDigest(a, b);

const baseFull = {
  version: 1,
  schemaId: 'soldier-stage6-1-full-records/v1',
  stage: '6-1',
  status: 'PASS',
  generatedAt: '2026-08-30T00:00:00.000Z',
  sources: { master: { path: 'master.json', gitBlobSha: 'a'.repeat(40) } },
  records: [{
    soldierId: 1,
    identity: { isSp: false, tier: 3, nameKr: '드래고니아' },
    combat: { hp: 100, atk: 50, def: 40, mdef: 30, move: 3, range: 1, moveType: 1, isMelee: true },
    ability: { techId: 10, levels: [] },
    training: { techId: 10, perLevelCost: [] },
    sp: null,
  }],
};

test('generatedAt-only source change is semantic fresh', () => {
  const right = clone(baseFull); right.generatedAt = '2026-08-30T01:00:00.000Z';
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), true);
});

test('nested gitBlobSha-only source change is semantic fresh', () => {
  const right = clone(baseFull); right.sources.master.gitBlobSha = 'b'.repeat(40);
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), true);
});

test('nameKr is not consumed by Stage 6-6', () => {
  const right = clone(baseFull); right.records[0].identity.nameKr = '드래고니아 나이트';
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), true);
});

test('combat mutation is semantic stale', () => {
  const right = clone(baseFull); right.records[0].combat.hp += 1;
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), false);
});

test('soldierId mutation is semantic stale', () => {
  const right = clone(baseFull); right.records[0].soldierId = 2;
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), false);
});

test('record order is non-semantic for ID-indexed Stage 6-6 consumption', () => {
  const left = clone(baseFull);
  left.records.push({ ...clone(left.records[0]), soldierId: 2 });
  const right = clone(left); right.records.reverse();
  assert.equal(same(buildStage66SourceDigest('fullRecords', left), buildStage66SourceDigest('fullRecords', right)), true);
});

const relation = {
  version: 1,
  schemaId: 'hero-soldier-relation-set/v1',
  status: 'PASS',
  generatedAt: '2026-08-30T00:00:00.000Z',
  summary: { edgeCount: 1, provenanceCount: 1, sourceProductionCounts: { BASE_SOLDIER_HERO: 1 } },
  edges: [{ heroId: 10, soldierId: 20, provenance: [{ sourceKind: 'BASE_SOLDIER_HERO', sourceClass: 'DIRECT', origin: { table: 'ConfigDataSoldierInfo', recordId: 20, field: 'GetSoldierHeros_ID' }, gitBlobSha: 'a'.repeat(40) }] }],
};

test('relation raw blob provenance is non-semantic to Stage 6-6', () => {
  const right = clone(relation); right.edges[0].provenance[0].gitBlobSha = 'b'.repeat(40);
  assert.equal(same(buildStage66SourceDigest('relationSet', relation), buildStage66SourceDigest('relationSet', right)), true);
});

test('relation sourceKind is semantic to Stage 6-6', () => {
  const right = clone(relation); right.edges[0].provenance[0].sourceKind = 'SP_HERO_REWARD';
  assert.equal(same(buildStage66SourceDigest('relationSet', relation), buildStage66SourceDigest('relationSet', right)), false);
});

test('same semantic + same blob classifies SEMANTIC_FRESH', () => {
  const digest = buildStage66SourceDigest('fullRecords', baseFull);
  const ref = { path: 'full.json', gitBlobSha: 'a'.repeat(40), semanticDigest: digest };
  assert.equal(classifyStage66SourceRef(ref, digest, 'a'.repeat(40)), 'SEMANTIC_FRESH');
});

test('same semantic + changed blob classifies PROVENANCE_ONLY_CHANGED', () => {
  const digest = buildStage66SourceDigest('fullRecords', baseFull);
  const ref = { path: 'full.json', gitBlobSha: 'a'.repeat(40), semanticDigest: digest };
  assert.equal(classifyStage66SourceRef(ref, digest, 'b'.repeat(40)), 'PROVENANCE_ONLY_CHANGED');
});

test('semantic mutation classifies SEMANTIC_STALE', () => {
  const digest = buildStage66SourceDigest('fullRecords', baseFull);
  const changed = clone(baseFull); changed.records[0].combat.atk += 1;
  const ref = { path: 'full.json', gitBlobSha: 'a'.repeat(40), semanticDigest: digest };
  assert.equal(classifyStage66SourceRef(ref, buildStage66SourceDigest('fullRecords', changed), 'b'.repeat(40)), 'SEMANTIC_STALE');
});

test('legacy exact-SHA ref remains semantic fresh during migration', () => {
  const digest = buildStage66SourceDigest('fullRecords', baseFull);
  assert.equal(classifyStage66SourceRef({ path: 'full.json', gitBlobSha: 'a'.repeat(40) }, digest, 'a'.repeat(40)), 'SEMANTIC_FRESH');
});

test('legacy changed-SHA ref is fail-closed semantic unknown', () => {
  const digest = buildStage66SourceDigest('fullRecords', baseFull);
  assert.equal(classifyStage66SourceRef({ path: 'full.json', gitBlobSha: 'a'.repeat(40) }, digest, 'b'.repeat(40)), 'SEMANTIC_UNKNOWN');
});

test('projection mismatch is fail-closed semantic unknown', () => {
  const digest = buildStage66SourceDigest('fullRecords', baseFull);
  const wrong = { ...digest, projection: 'wrong/projection/v1' };
  const ref = { path: 'full.json', gitBlobSha: 'a'.repeat(40), semanticDigest: wrong };
  assert.equal(classifyStage66SourceRef(ref, digest, 'a'.repeat(40)), 'SEMANTIC_UNKNOWN');
});

test('sticky provenance keeps prior blob when semantics are equal', () => {
  const digest = buildStage66SourceDigest('fullRecords', baseFull);
  const ref = buildStage66SourceRef({
    label: 'fullRecords', path: 'full.json', value: baseFull, currentGitBlobSha: 'b'.repeat(40),
    priorRef: { path: 'full.json', gitBlobSha: 'a'.repeat(40), semanticDigest: digest },
  });
  assert.equal(ref.gitBlobSha, 'a'.repeat(40));
});

test('sticky provenance advances blob when semantics change', () => {
  const priorDigest = buildStage66SourceDigest('fullRecords', baseFull);
  const changed = clone(baseFull); changed.records[0].combat.def += 1;
  const ref = buildStage66SourceRef({
    label: 'fullRecords', path: 'full.json', value: changed, currentGitBlobSha: 'b'.repeat(40),
    priorRef: { path: 'full.json', gitBlobSha: 'a'.repeat(40), semanticDigest: priorDigest },
  });
  assert.equal(ref.gitBlobSha, 'b'.repeat(40));
});

const baseOutput = {
  version: 1,
  schemaId: 'soldier-stage6-6-expansion-basis/v1',
  stage: '6-6',
  status: 'PASS',
  generatedAt: '2026-08-30T00:00:00.000Z',
  purpose: 'prose A',
  simulatorReadiness: { status: 'FOUNDATION_READY', scope: 'DATA_FOUNDATION_ONLY', implementedNow: ['a'], deferred: ['b'] },
  authorities: {
    fullStats: { source: 'full.json', field: 'records[].combat', rule: 'rule A' },
    normalTraitLevels: { source: 'full.json', field: 'records[].ability.levels', scope: 'normal tier-3 only', rule: 'rule B' },
    trainingCosts: { source: 'full.json', field: 'records[].training.perLevelCost', scope: 'normal tier-3 only', rule: 'rule C' },
    spExpansion: { source: 'full.json', field: 'records[].sp', scope: 'SP only', rule: 'rule D' },
    heroEligibilityProvenance: { source: 'relation.json', field: 'edges[].provenance', rule: 'rule E' },
  },
  summary: { canonicalSoldiers: 224, relationEdges: 5977 },
  sources: { full: { path: 'full.json', gitBlobSha: 'a'.repeat(40) } },
};

test('Stage 6-6 output audit/prose-only change keeps digest stable', () => {
  const right = clone(baseOutput);
  right.generatedAt = '2026-08-30T02:00:00.000Z';
  right.purpose = 'prose B';
  right.sources.full.gitBlobSha = 'b'.repeat(40);
  right.authorities.fullStats.rule = 'rewritten prose';
  assert.equal(same(buildStage66OutputDigest(baseOutput), buildStage66OutputDigest(right)), true);
});

test('Stage 6-6 output summary semantic change changes digest', () => {
  const right = clone(baseOutput); right.summary.relationEdges = 5976;
  assert.equal(same(buildStage66OutputDigest(baseOutput), buildStage66OutputDigest(right)), false);
});

const baseValidation = {
  version: 1,
  schemaId: 'soldier-stage6-6-expansion-basis-validation/v1',
  stage: '6-6',
  status: 'PASS',
  generatedAt: '2026-08-30T00:00:00.000Z',
  sources: { full: { path: 'full.json', gitBlobSha: 'a'.repeat(40) } },
  checks: { combatPreservationMismatches: 0 },
  coverage: { canonicalSoldiers: 224 },
  errors: [],
  reviews: [{ code: 'SIMULATOR_IMPLEMENTATION_DEFERRED', classification: 'REVIEW', rule: 'prose A' }],
};

test('Stage 6-6 validation review prose-only change keeps digest stable', () => {
  const right = clone(baseValidation);
  right.generatedAt = '2026-08-30T02:00:00.000Z';
  right.sources.full.gitBlobSha = 'b'.repeat(40);
  right.reviews[0].rule = 'prose B';
  assert.equal(same(buildStage66ValidationDigest(baseValidation), buildStage66ValidationDigest(right)), true);
});

test('Stage 6-6 validation check mutation changes digest', () => {
  const right = clone(baseValidation); right.checks.combatPreservationMismatches = 1;
  assert.equal(same(buildStage66ValidationDigest(baseValidation), buildStage66ValidationDigest(right)), false);
});

console.log(`Soldier Stage 6-6 Semantic Freshness V2 fixtures: ${passed}/20 PASS`);
