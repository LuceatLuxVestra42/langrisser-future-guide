import assert from 'node:assert/strict';
import {
  buildStage5SourceDigest,
  buildStage5SourceRef,
  buildStage55MembershipParity,
  classifyStage5SourceRef,
} from './lib/soldier-stage5-semantic-projections.mjs';
import { sameSemanticDigest } from './lib/frozen-semantic-digest.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
let pass = 0;
function check(name, fn) {
  fn();
  pass += 1;
  console.log(`PASS ${pass}: ${name}`);
}

const contract = {
  schemaId: 'soldier-detail-contract/v1', status: 'FROZEN',
  baseline: { displayableSoldiers: 224, normalSoldiers: 168, spSoldiers: 56, normalTier3: 129, relationEdges: 5977, relationBySoldierKeys: 224 },
  output: { currentBaselineRecordCount: 224 },
  purpose: 'audit-only-unconsumed-example',
};

check('Stage 5 contract unconsumed text does not change semantic digest', () => {
  const left = buildStage5SourceDigest('5-2', 'contract', contract);
  const changed = clone(contract); changed.purpose = 'changed prose';
  const right = buildStage5SourceDigest('5-2', 'contract', changed);
  assert.ok(sameSemanticDigest(left, right));
});

check('Stage 5 contract baseline change is semantic', () => {
  const left = buildStage5SourceDigest('5-2', 'contract', contract);
  const changed = clone(contract); changed.baseline.displayableSoldiers = 223;
  const right = buildStage5SourceDigest('5-2', 'contract', changed);
  assert.ok(!sameSemanticDigest(left, right));
});

const stage52 = {
  schemaId: 'soldier-detail-combat/v1', stage: '5-2', status: 'PASS', generatedAt: 'A',
  sources: { x: { path: 'x', gitBlobSha: 'aaa' } },
  records: [{ soldierId: 1, identity: { isSp: false, tier: 3, nameKr: '병사' }, combat: { hp: 100 } }],
};
check('Stage 5-3 source ignores Stage 5-2 provenance metadata', () => {
  const left = buildStage5SourceDigest('5-3', 'stage5_2', stage52);
  const changed = clone(stage52); changed.generatedAt = 'B'; changed.sources.x.gitBlobSha = 'bbb';
  const right = buildStage5SourceDigest('5-3', 'stage5_2', changed);
  assert.ok(sameSemanticDigest(left, right));
});

check('Stage 5-3 source detects combat mutation', () => {
  const left = buildStage5SourceDigest('5-3', 'stage5_2', stage52);
  const changed = clone(stage52); changed.records[0].combat.hp = 101;
  const right = buildStage5SourceDigest('5-3', 'stage5_2', changed);
  assert.ok(!sameSemanticDigest(left, right));
});

const stage56 = {
  schemaId: 'soldier-detail-sp/v1', stage: '5-6', status: 'PASS',
  records: [{ soldierId: 1, identity: { siteId: 'soldier-1', nameKr: '병사', tier: 3, isSp: false }, combat: { hp: 100 } }],
};
check('Stage 5-7 consumes identity but not combat', () => {
  const left = buildStage5SourceDigest('5-7', 'stage5_6', stage56);
  const changed = clone(stage56); changed.records[0].combat.hp = 999;
  const right = buildStage5SourceDigest('5-7', 'stage5_6', changed);
  assert.ok(sameSemanticDigest(left, right));
});

check('Stage 5-7 identity name mutation is semantic', () => {
  const left = buildStage5SourceDigest('5-7', 'stage5_6', stage56);
  const changed = clone(stage56); changed.records[0].identity.nameKr = '새 이름';
  const right = buildStage5SourceDigest('5-7', 'stage5_6', changed);
  assert.ok(!sameSemanticDigest(left, right));
});

const stage57 = {
  schemaId: 'soldier-list/v1', stage: '5-7', status: 'PASS',
  records: [{ soldierId: 1, siteId: 'soldier-1', nameKr: '병사', nameCn: '兵', tier: 3, isSp: false }],
};
check('Stage 5-8 list name mutation is semantic', () => {
  const left = buildStage5SourceDigest('5-8', 'stage5_7', stage57);
  const changed = clone(stage57); changed.records[0].nameKr = '새 이름';
  const right = buildStage5SourceDigest('5-8', 'stage5_7', changed);
  assert.ok(!sameSemanticDigest(left, right));
});

const releaseSource = {
  schemaId: 'soldier-release-source/v1', status: 'FROZEN_PARTIAL',
  coveragePolicy: { confirmedRecordCount: 1 },
  externalSource: { kind: 'sheet', dateCells: [{ row: 1, serial: 45000, releaseDate: '2023-03-15' }] },
  confirmedRecords: [{ soldierId: 1, expectedNameKr: '병사', releaseDate: '2023-03-15', patchGroup: '2023-03-15', samePatchOrder: null, sourceLabel: 'x', sourceRows: [1,2], mappingStatus: 'CONFIRMED' }],
};
check('Stage 5-8 release evidence mutation is semantic', () => {
  const left = buildStage5SourceDigest('5-8', 'releaseSource', releaseSource);
  const changed = clone(releaseSource); changed.confirmedRecords[0].releaseDate = '2023-03-16';
  const right = buildStage5SourceDigest('5-8', 'releaseSource', changed);
  assert.ok(!sameSemanticDigest(left, right));
});

const bySoldier = {
  schemaId: 'hero-soldier-by-soldier/v1',
  relationSet: { gitBlobSha: 'old' },
  summary: { keyCount: 2, relationCount: 2 },
  bySoldierId: { '10': [1], '20': [2] },
};
const relation = { edges: [{ heroId: 1, soldierId: 10 }, { heroId: 2, soldierId: 20 }] };
check('Stage 5-5 raw relation SHA drift is not membership semantic change', () => {
  const left = buildStage5SourceDigest('5-5', 'bySoldier', bySoldier);
  const changed = clone(bySoldier); changed.relationSet.gitBlobSha = 'new';
  const right = buildStage5SourceDigest('5-5', 'bySoldier', changed);
  assert.ok(sameSemanticDigest(left, right));
  assert.equal(buildStage55MembershipParity(changed, relation).semanticMatch, true);
});

check('Stage 5-5 membership mutation fails parity', () => {
  const changed = clone(bySoldier); changed.bySoldierId['20'] = [3];
  assert.equal(buildStage55MembershipParity(changed, relation).semanticMatch, false);
});

check('Sticky provenance preserves prior blob for unchanged semantics', () => {
  const current = buildStage5SourceDigest('5-8', 'stage5_7', stage57);
  const priorRef = { path: 'data/generated/soldier-list-stage5-7.v1.json', gitBlobSha: 'oldblob', semanticDigest: current };
  const ref = buildStage5SourceRef({ stage: '5-8', label: 'stage5_7', path: priorRef.path, value: stage57, currentGitBlobSha: 'newblob', priorRef });
  assert.equal(ref.gitBlobSha, 'oldblob');
  assert.equal(classifyStage5SourceRef(ref, current, 'newblob'), 'PROVENANCE_ONLY_CHANGED');
});

check('Malformed V2 source ref fails closed', () => {
  const current = buildStage5SourceDigest('5-8', 'stage5_7', stage57);
  assert.equal(classifyStage5SourceRef({ path: 'x', gitBlobSha: 'x' }, current, 'x'), 'INVALID_FRESHNESS_REF');
});

console.log(JSON.stringify({
  status: 'PASS_SOLDIER_STAGE5_SEMANTIC_FRESHNESS_V2_A1',
  fixtureCount: pass,
  fixturePassCount: pass,
  failClosed: true,
}, null, 2));
