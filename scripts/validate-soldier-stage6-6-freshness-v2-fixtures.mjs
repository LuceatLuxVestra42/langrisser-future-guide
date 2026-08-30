import assert from 'node:assert/strict';
import {
  buildStage66SourceDigest,
  buildStage66SourceRef,
  classifyStage66SourceRef,
} from './lib/soldier-stage6-6-semantic-projections.mjs';
import { sameSemanticDigest } from './lib/frozen-semantic-digest.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS: ${name}`);
}

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

function clone(value) { return structuredClone(value); }
const same = (a, b) => sameSemanticDigest(a, b);

test('generatedAt-only is semantic fresh', () => {
  const right = clone(baseFull); right.generatedAt = '2026-08-30T01:00:00.000Z';
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), true);
});

test('nested gitBlobSha-only is semantic fresh', () => {
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

test('record order is non-semantic for ID-indexed consumer', () => {
  const left = clone(baseFull);
  left.records.push({ ...clone(left.records[0]), soldierId: 2 });
  const right = clone(left); right.records.reverse();
  assert.equal(same(buildStage66SourceDigest('fullRecords', left), buildStage66SourceDigest('fullRecords', right)), true);
});

const relation = {
  version: 1,
  schemaId: 'hero-soldier-relations/v1',
  status: 'PASS',
  generatedAt: '2026-08-30T00:00:00.000Z',
  summary: { edgeCount: 1, provenanceCount: 1, sourceProductionCounts: { BASE_SOLDIER_HERO: 1 } },
  edges: [{ heroId: 10, soldierId: 20, provenance: [{ sourceKind: 'BASE_SOLDIER_HERO', sourceId: 7, gitBlobSha: 'a'.repeat(40) }] }],
};

test('relation raw blob provenance is non-semantic', () => {
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

test('legacy ref without semanticDigest is fail-closed', () => {
  const digest = buildStage66SourceDigest('fullRecords', baseFull);
  assert.equal(classifyStage66SourceRef({ path: 'full.json', gitBlobSha: 'a'.repeat(40) }, digest, 'a'.repeat(40)), 'INVALID_FRESHNESS_REF');
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

console.log(`Soldier Stage 6-6 Semantic Freshness V2 fixtures: ${passed}/13 PASS`);
