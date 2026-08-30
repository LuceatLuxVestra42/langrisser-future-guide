import assert from 'node:assert/strict';
import {
  canonicalJson,
  sha256CanonicalJson,
  sameSemanticDigest,
} from './lib/frozen-semantic-digest.mjs';
import {
  buildStage66SourceDigest,
} from './lib/soldier-stage6-6-semantic-projections.mjs';
import {
  STAGE67_FRESHNESS_MODE,
  buildStage67DirectSourceDigest,
  buildStage67KeyArtifactDigest,
  buildStage67OutputDigest,
  classifyStage67Ref,
} from './lib/soldier-stage6-7-semantic-projections.mjs';

const clone = value => structuredClone(value);
const same = (left, right) => sameSemanticDigest(left, right);
const results = [];

function fixture(id, expectation, fn) {
  try {
    fn();
    results.push({ id, expectation, status: 'PASS' });
    console.log(`PASS ${id}: ${expectation}`);
  } catch (error) {
    results.push({ id, expectation, status: 'FAIL', error: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL ${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const baseFull = {
  version: 1,
  schemaId: 'soldier-stage6-1-full-records/v1',
  stage: '6-1',
  status: 'PASS',
  generatedAt: '2026-08-30T00:00:00.000Z',
  sources: {
    master: {
      path: 'data/generated/soldier-master.v1.json',
      gitBlobSha: 'a'.repeat(40),
      workflowRunId: 100,
    },
  },
  records: [{
    soldierId: 1,
    identity: {
      isSp: false,
      tier: 3,
      nameKr: '드래고니아',
    },
    combat: {
      hp: 100,
      atk: 50,
      def: 40,
      mdef: 30,
      move: 3,
      range: 1,
      moveType: 1,
      isMelee: true,
    },
    ability: {
      techId: 10,
      levels: [{ level: 1, value: 5 }],
    },
    training: {
      techId: 10,
      perLevelCost: [{ level: 1, gold: 100 }],
    },
    sp: null,
  }],
};

const baseRelation = {
  version: 1,
  schemaId: 'hero-soldier-relations/v1',
  stage: 'C',
  status: 'PASS',
  generatedAt: '2026-08-30T00:00:00.000Z',
  summary: {
    edgeCount: 1,
    provenanceCount: 1,
    sourceProductionCounts: { BASE_SOLDIER_HERO: 1 },
  },
  edges: [{
    heroId: 10,
    soldierId: 20,
    provenance: [{
      sourceKind: 'BASE_SOLDIER_HERO',
      sourceId: 7,
      gitBlobSha: 'a'.repeat(40),
    }],
  }],
};

const baseStage65 = {
  version: 1,
  schemaId: 'soldier-stage6-5-reciprocal-links-validation/v1',
  stage: '6-5',
  status: 'PASS',
  generatedAt: '2026-08-30T00:00:00.000Z',
  generatedBy: 'fixture',
  sources: {
    relation: {
      path: 'data/generated/hero-soldier-relations.v1.json',
      gitBlobSha: 'a'.repeat(40),
    },
  },
  authority: {
    canonicalRelationBlobSha: 'a'.repeat(40),
    workflowRunId: 111,
  },
  summary: {
    canonicalRelationCount: 5977,
    reciprocalMismatchCount: 0,
  },
  checks: {
    relationParity: true,
  },
};

const baseAdmission = {
  version: 1,
  schemaId: 'soldier-stage6-7-site-admission/v1',
  stage: '6-7',
  status: 'PASS',
  admissionStatus: 'READY_WITH_REVIEW',
  generatedAt: '2026-08-30T00:00:00.000Z',
  sources: {
    stage6_6: {
      path: 'data/validation/soldier-stage6-6-expansion-basis.v1.json',
      gitBlobSha: 'a'.repeat(40),
      semanticDigest: { digest: 'audit-only' },
      freshnessMode: STAGE67_FRESHNESS_MODE,
    },
  },
  keyArtifacts: {},
  freshness: {
    contract: 'frozen-semantic-freshness/v2',
    semanticDigest: { digest: 'audit-only' },
  },
  summary: {
    canonicalSoldiers: 224,
    normalSoldiers: 168,
    spSoldiers: 56,
    normalTier3Soldiers: 129,
    heroCount: 267,
    canonicalRelationCount: 5977,
    reciprocalMismatchCount: 0,
  },
  representativeQa: { passed: 6, total: 6 },
  filterQa: { passed: 15, total: 15 },
  admissionGates: {
    generationComplete: 'PASS',
    sourceSnapshotsFrozen: 'PASS',
  },
};

const baseDetail = {
  version: 1,
  schemaId: 'soldier-detail-projection/v1',
  stage: '5-7',
  status: 'PASS',
  generatedAt: '2026-08-30T00:00:00.000Z',
  records: [
    { soldierId: 1, nameKr: '드래고니아', hp: 100 },
    { soldierId: 2, nameKr: '산별 구조대', hp: 120 },
  ],
};

fixture('F6-01-GENERATED_AT_ONLY', 'generatedAt-only change is semantic-fresh', () => {
  const right = clone(baseFull);
  right.generatedAt = '2026-08-30T02:00:00.000Z';
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), true);
});

fixture('F6-02-UPSTREAM_GIT_BLOB_ONLY', 'nested upstream gitBlobSha-only change is semantic-fresh', () => {
  const right = clone(baseStage65);
  right.sources.relation.gitBlobSha = 'b'.repeat(40);
  right.authority.canonicalRelationBlobSha = 'b'.repeat(40);
  assert.equal(same(buildStage67DirectSourceDigest('stage6_5', baseStage65), buildStage67DirectSourceDigest('stage6_5', right)), true);
});

fixture('F6-03-WORKFLOW_RUN_ID_ONLY', 'workflow run id is audit-only for Stage 6-7 generic frozen dependency', () => {
  const right = clone(baseStage65);
  right.authority.workflowRunId = 222;
  assert.equal(same(buildStage67DirectSourceDigest('stage6_5', baseStage65), buildStage67DirectSourceDigest('stage6_5', right)), true);
});

fixture('F6-04-JSON-FORMATTING', 'JSON whitespace and object-key order do not change canonical digest', () => {
  const minified = JSON.parse('{"b":2,"a":1,"nested":{"z":3,"y":4}}');
  const pretty = JSON.parse('{\n  "nested": { "y": 4, "z": 3 },\n  "a": 1,\n  "b": 2\n}');
  assert.equal(canonicalJson(minified), canonicalJson(pretty));
  assert.equal(sha256CanonicalJson(minified), sha256CanonicalJson(pretty));
});

fixture('F6-05-NAMEKR-STAGE66-CONTRACT', 'nameKr is non-consumed for Stage 6-6 full-record semantic projection', () => {
  const right = clone(baseFull);
  right.records[0].identity.nameKr = '드래고니아 나이트';
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), true);
});

fixture('F6-06-NAMEKR-STAGE67-DETAIL', 'nameKr remains semantic when the Stage 6-7 detail artifact consumes it', () => {
  const right = clone(baseDetail);
  right.records[0].nameKr = '드래고니아 나이트';
  assert.equal(same(buildStage67KeyArtifactDigest('detail', baseDetail), buildStage67KeyArtifactDigest('detail', right)), false);
});

fixture('F6-07-SOLDIER-ID', 'soldierId mutation is semantic-stale', () => {
  const right = clone(baseFull);
  right.records[0].soldierId = 2;
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), false);
});

fixture('F6-08-CANONICAL-COUNT', 'canonical Soldier 224 to 223 is semantic-stale', () => {
  const right = clone(baseAdmission);
  right.summary.canonicalSoldiers = 223;
  assert.equal(same(buildStage67OutputDigest(baseAdmission), buildStage67OutputDigest(right)), false);
});

fixture('F6-09-SP-COUNT', 'SP Soldier 56 to 55 is semantic-stale', () => {
  const right = clone(baseAdmission);
  right.summary.spSoldiers = 55;
  assert.equal(same(buildStage67OutputDigest(baseAdmission), buildStage67OutputDigest(right)), false);
});

fixture('F6-10-RELATION-COUNT', 'Hero-Soldier relation 5977 to 5976 is semantic-stale', () => {
  const right = clone(baseAdmission);
  right.summary.canonicalRelationCount = 5976;
  assert.equal(same(buildStage67OutputDigest(baseAdmission), buildStage67OutputDigest(right)), false);
});

fixture('F6-11-RECIPROCAL-MISMATCH', 'reciprocal mismatch 0 to 1 is semantic-stale', () => {
  const right = clone(baseAdmission);
  right.summary.reciprocalMismatchCount = 1;
  assert.equal(same(buildStage67OutputDigest(baseAdmission), buildStage67OutputDigest(right)), false);
});

fixture('F6-12-COMBAT-STAT', 'combat stat mutation is semantic-stale', () => {
  const right = clone(baseFull);
  right.records[0].combat.hp += 1;
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), false);
});

fixture('F6-13-TRAINING-VALUE', 'training value mutation is semantic-stale', () => {
  const right = clone(baseFull);
  right.records[0].training.perLevelCost[0].gold += 1;
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), false);
});

fixture('F6-14-BREAKING-SCHEMA', 'schema identity mutation is semantic-stale', () => {
  const right = clone(baseFull);
  right.schemaId = 'soldier-stage6-1-full-records/v2';
  assert.equal(same(buildStage66SourceDigest('fullRecords', baseFull), buildStage66SourceDigest('fullRecords', right)), false);
});

fixture('F6-15-MISSING-SOURCE-PATH', 'missing source path fails closed as invalid freshness ref', () => {
  const digest = buildStage67OutputDigest(baseAdmission);
  const ref = {
    gitBlobSha: 'a'.repeat(40),
    semanticDigest: digest,
    freshnessMode: STAGE67_FRESHNESS_MODE,
  };
  assert.equal(classifyStage67Ref(ref, digest, 'a'.repeat(40)), 'INVALID_FRESHNESS_REF');
});

fixture('F6-16-LEGACY-REF-NO-SEMANTIC-DIGEST', 'legacy ref without semanticDigest fails closed', () => {
  const digest = buildStage67OutputDigest(baseAdmission);
  const ref = {
    path: 'data/generated/soldier-stage6-7-site-admission.v1.json',
    gitBlobSha: 'a'.repeat(40),
    freshnessMode: STAGE67_FRESHNESS_MODE,
  };
  assert.equal(classifyStage67Ref(ref, digest, 'a'.repeat(40)), 'INVALID_FRESHNESS_REF');
});

fixture('F6-17-PROVENANCE-ONLY-CLASSIFICATION', 'same semantic digest plus changed blob classifies provenance-only', () => {
  const digest = buildStage67OutputDigest(baseAdmission);
  const ref = {
    path: 'data/generated/soldier-stage6-7-site-admission.v1.json',
    gitBlobSha: 'a'.repeat(40),
    semanticDigest: digest,
    freshnessMode: STAGE67_FRESHNESS_MODE,
  };
  assert.equal(classifyStage67Ref(ref, digest, 'b'.repeat(40)), 'PROVENANCE_ONLY_CHANGED');
});

fixture('F6-18-SEMANTIC-CHANGE-CLASSIFICATION', 'semantic mutation remains SEMANTIC_STALE even when blob also changes', () => {
  const digest = buildStage67OutputDigest(baseAdmission);
  const changed = clone(baseAdmission);
  changed.summary.canonicalRelationCount = 5976;
  const ref = {
    path: 'data/generated/soldier-stage6-7-site-admission.v1.json',
    gitBlobSha: 'a'.repeat(40),
    semanticDigest: digest,
    freshnessMode: STAGE67_FRESHNESS_MODE,
  };
  assert.equal(classifyStage67Ref(ref, buildStage67OutputDigest(changed), 'b'.repeat(40)), 'SEMANTIC_STALE');
});

fixture('F6-19-RELATION-RAW-PROVENANCE', 'relation raw blob provenance remains non-semantic', () => {
  const right = clone(baseRelation);
  right.edges[0].provenance[0].gitBlobSha = 'b'.repeat(40);
  assert.equal(same(buildStage66SourceDigest('relationSet', baseRelation), buildStage66SourceDigest('relationSet', right)), true);
});

fixture('F6-20-RELATION-SOURCE-KIND', 'relation sourceKind mutation remains semantic-stale', () => {
  const right = clone(baseRelation);
  right.edges[0].provenance[0].sourceKind = 'SP_HERO_REWARD';
  assert.equal(same(buildStage66SourceDigest('relationSet', baseRelation), buildStage66SourceDigest('relationSet', right)), false);
});

fixture('F6-21-STAGE67-ARRAY-ORDER', 'Stage 6-7 generic consumed array order is not silently normalized', () => {
  const right = clone(baseDetail);
  right.records.reverse();
  assert.equal(same(buildStage67KeyArtifactDigest('detail', baseDetail), buildStage67KeyArtifactDigest('detail', right)), false);
});

fixture('F6-22-STAGE66-ID-INDEXED-ORDER', 'Stage 6-6 ID-indexed record order remains explicitly non-semantic', () => {
  const left = clone(baseFull);
  left.records.push({ ...clone(left.records[0]), soldierId: 2 });
  const right = clone(left);
  right.records.reverse();
  assert.equal(same(buildStage66SourceDigest('fullRecords', left), buildStage66SourceDigest('fullRecords', right)), true);
});

const failures = results.filter(item => item.status !== 'PASS');
const summary = {
  version: 1,
  schemaId: 'soldier-frozen-semantic-freshness-v2-f6-regression/v1',
  stage: 'F6',
  status: failures.length === 0 ? 'PASS_F6_FAIL_CLOSED_REGRESSION' : 'FAIL_F6_FAIL_CLOSED_REGRESSION',
  fixtureCount: results.length,
  fixturePassCount: results.length - failures.length,
  fixtureFailureCount: failures.length,
  policy: {
    provenanceOnlyCanPassSemanticFreshness: true,
    semanticMutationMustRemainBlocking: true,
    nameHandlingIsContractSpecific: true,
    missingOrLegacyRefsFailClosed: true,
    arraysAreNotGloballySorted: true,
  },
  results,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
