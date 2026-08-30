import assert from 'node:assert/strict';
import {
  buildStage65MembershipDigest,
  classifyStage65Snapshot,
} from './soldier-stage6-5-semantic-projections.mjs';

const PROVENANCE_ONLY_CHANGED = 'PROVENANCE_ONLY_CHANGED';
const allowedDirect = {
  BASE_SOLDIER_HERO: ['ConfigDataSoldierInfo', 'GetSoldierHeros_ID'],
  SP_HERO_REWARD: ['ConfigDataSPHeroInfo', 'SecondStageRewardSoldiers'],
  SP_SOLDIER_EXPAND: ['ConfigDataSPSoldierInfo', 'SecondStageExpandHeroList'],
};
const allowedKinds = new Set([
  'BASE_SOLDIER_HERO',
  'SP_HERO_REWARD',
  'SP_SOLDIER_EXPAND',
  'SP_SOLDIER_INHERIT',
]);

function directBaseProvenance(soldierId) {
  return {
    sourceKind: 'BASE_SOLDIER_HERO',
    sourceClass: 'DIRECT',
    origin: {
      table: 'ConfigDataSoldierInfo',
      recordId: soldierId,
      recordKeyField: 'ID',
      field: 'GetSoldierHeros_ID',
    },
  };
}

function directRewardProvenance(heroId) {
  return {
    sourceKind: 'SP_HERO_REWARD',
    sourceClass: 'DIRECT',
    origin: {
      table: 'ConfigDataSPHeroInfo',
      recordId: heroId,
      recordKeyField: 'ID',
      field: 'SecondStageRewardSoldiers',
    },
  };
}

function inheritedRewardProvenance(heroId, normalSoldierId, spSoldierId) {
  return {
    sourceKind: 'SP_SOLDIER_INHERIT',
    sourceClass: 'DERIVED',
    origin: { ...directRewardProvenance(heroId).origin },
    parentEdge: {
      heroId,
      soldierId: normalSoldierId,
      parentSourceKind: 'SP_HERO_REWARD',
    },
    supportRelation: {
      kind: 'SP_FORM_LINK',
      table: 'ConfigDataSPSoldierInfo',
      recordId: spSoldierId,
      normalSoldierId,
      spSoldierId,
    },
  };
}

function clone(value) {
  return structuredClone(value);
}

// R3 mirrors only the A-8 sourceKind/provenance hard checks exercised by
// these mutations. A-8 remains the authoritative relation validator.
function richerA8SemanticHealthy(edges) {
  if (!Array.isArray(edges)) return false;
  for (const edge of edges) {
    if (!Number.isInteger(edge?.heroId) || !Number.isInteger(edge?.soldierId)) return false;
    if (!Array.isArray(edge?.provenance) || edge.provenance.length === 0) return false;
    for (const provenance of edge.provenance) {
      if (!allowedKinds.has(provenance?.sourceKind)) return false;
      if (provenance.sourceClass === 'DIRECT') {
        const expected = allowedDirect[provenance.sourceKind];
        if (
          !expected
          || provenance.origin?.table !== expected[0]
          || provenance.origin?.field !== expected[1]
          || provenance.origin?.recordKeyField !== 'ID'
        ) return false;
        continue;
      }
      if (provenance.sourceKind === 'SP_SOLDIER_INHERIT' && provenance.sourceClass === 'DERIVED') {
        const parent = provenance.parentEdge;
        const support = provenance.supportRelation;
        const parentOk = parent
          && parent.heroId === edge.heroId
          && ['BASE_SOLDIER_HERO', 'SP_HERO_REWARD'].includes(parent.parentSourceKind);
        const supportOk = support
          && support.kind === 'SP_FORM_LINK'
          && support.table === 'ConfigDataSPSoldierInfo'
          && support.spSoldierId === edge.soldierId
          && support.normalSoldierId === parent?.soldierId
          && support.recordId === support.spSoldierId;
        const originExpected = allowedDirect[parent?.parentSourceKind];
        const originOk = originExpected
          && provenance.origin?.table === originExpected[0]
          && provenance.origin?.field === originExpected[1]
          && provenance.origin?.recordKeyField === 'ID';
        if (!parentOk || !supportOk || !originOk) return false;
        continue;
      }
      return false;
    }
  }
  return true;
}

function pairsFromEdges(edges) {
  return edges.map(({ heroId, soldierId }) => ({ heroId, soldierId }));
}

function tryMembershipDigest(pairs) {
  try {
    return buildStage65MembershipDigest(pairs);
  } catch {
    return null;
  }
}

const canonicalEdges = [
  { heroId: 1, soldierId: 100, provenance: [directBaseProvenance(100)] },
  { heroId: 2, soldierId: 100, provenance: [directRewardProvenance(2)] },
  { heroId: 2, soldierId: 200, provenance: [inheritedRewardProvenance(2, 100, 200)] },
];
const canonicalDigest = buildStage65MembershipDigest(pairsFromEdges(canonicalEdges));
assert.equal(richerA8SemanticHealthy(canonicalEdges), true);

function classifyEdges(edges, overrides = {}) {
  const currentDigest = tryMembershipDigest(pairsFromEdges(edges));
  return classifyStage65Snapshot({
    recordedGitBlobSha: 'frozen-blob',
    currentGitBlobSha: 'current-blob',
    currentDigest,
    canonicalDigest,
    semanticHealthy: currentDigest ? richerA8SemanticHealthy(edges) : false,
    ...overrides,
  });
}

const positiveControls = [
  {
    name: 'same semantic plus same blob remains SEMANTIC_FRESH',
    actual: classifyStage65Snapshot({
      recordedGitBlobSha: 'same-blob',
      currentGitBlobSha: 'same-blob',
      currentDigest: canonicalDigest,
      canonicalDigest,
      semanticHealthy: true,
    }),
    expected: 'SEMANTIC_FRESH',
  },
  {
    name: 'same semantic plus changed blob remains PROVENANCE_ONLY_CHANGED',
    actual: classifyStage65Snapshot({
      recordedGitBlobSha: 'frozen-blob',
      currentGitBlobSha: 'current-blob',
      currentDigest: canonicalDigest,
      canonicalDigest,
      semanticHealthy: true,
    }),
    expected: PROVENANCE_ONLY_CHANGED,
  },
];

const pairDeletion = clone(canonicalEdges);
pairDeletion.pop();

const pairAddition = clone(canonicalEdges);
pairAddition.push({ heroId: 3, soldierId: 300, provenance: [directBaseProvenance(300)] });

const heroIdMutation = clone(canonicalEdges);
heroIdMutation[0].heroId = 9;

const soldierIdMutation = clone(canonicalEdges);
soldierIdMutation[0].soldierId = 999;

const sourceKindMutation = clone(canonicalEdges);
sourceKindMutation[0].provenance[0].sourceKind = 'UNRECOGNIZED_SOURCE';

const provenanceMutation = clone(canonicalEdges);
provenanceMutation[2].provenance[0].supportRelation.normalSoldierId = 999;

const malformedDigest = tryMembershipDigest([
  { heroId: '1', soldierId: 100 },
]);

const mutationCases = [
  { name: 'pair deletion', actual: classifyEdges(pairDeletion), expected: 'SEMANTIC_STALE' },
  { name: 'pair addition', actual: classifyEdges(pairAddition), expected: 'SEMANTIC_STALE' },
  { name: 'Hero ID mutation', actual: classifyEdges(heroIdMutation), expected: 'SEMANTIC_STALE' },
  { name: 'Soldier ID mutation', actual: classifyEdges(soldierIdMutation), expected: 'SEMANTIC_STALE' },
  { name: 'sourceKind mutation', actual: classifyEdges(sourceKindMutation), expected: 'SEMANTIC_STALE' },
  { name: 'provenance semantics mutation', actual: classifyEdges(provenanceMutation), expected: 'SEMANTIC_STALE' },
  {
    name: 'malformed membership projection',
    actual: classifyStage65Snapshot({
      recordedGitBlobSha: 'frozen-blob',
      currentGitBlobSha: 'current-blob',
      currentDigest: malformedDigest,
      canonicalDigest,
      semanticHealthy: false,
    }),
    expected: 'SEMANTIC_UNKNOWN',
  },
  {
    name: 'missing current source evidence',
    actual: classifyStage65Snapshot({
      recordedGitBlobSha: 'frozen-blob',
      currentGitBlobSha: null,
      currentDigest: canonicalDigest,
      canonicalDigest,
      semanticHealthy: true,
    }),
    expected: 'SEMANTIC_UNKNOWN',
  },
];

for (const test of positiveControls) {
  assert.equal(test.actual, test.expected, test.name);
  console.log(`PASS: ${test.name} -> ${test.actual}`);
}

for (const test of mutationCases) {
  assert.equal(test.actual, test.expected, test.name);
  assert.notEqual(test.actual, PROVENANCE_ONLY_CHANGED, `${test.name} escaped fail-closed`);
  console.log(`PASS: ${test.name} -> ${test.actual}`);
}

console.log(`Hero-Soldier Semantic Freshness R3 fail-closed regression: ${mutationCases.length}/${mutationCases.length} mutations blocked; ${positiveControls.length}/${positiveControls.length} controls PASS`);
