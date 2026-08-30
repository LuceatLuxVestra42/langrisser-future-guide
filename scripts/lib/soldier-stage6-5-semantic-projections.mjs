import {
  FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
  buildSemanticDigest,
  sameSemanticDigest,
} from './frozen-semantic-digest.mjs';

export const STAGE65_MEMBERSHIP_PROJECTION = 'hero-soldier-membership/v1';
export const STAGE65_FRESHNESS_MODE = 'SEMANTIC_DIGEST_V2_MEMBERSHIP';

function normalizePair(heroId, soldierId, source) {
  if (!Number.isInteger(heroId) || !Number.isInteger(soldierId)) {
    throw new TypeError(`Invalid Hero-Soldier membership pair from ${source}`);
  }
  return { heroId, soldierId };
}

export function normalizeMembershipPairs(pairs) {
  if (!Array.isArray(pairs)) throw new TypeError('Hero-Soldier membership pairs must be an array');
  const seen = new Set();
  const normalized = [];
  for (const pair of pairs) {
    const next = normalizePair(pair?.heroId, pair?.soldierId, 'pair list');
    const key = `${next.heroId}:${next.soldierId}`;
    if (seen.has(key)) throw new TypeError(`Duplicate Hero-Soldier membership pair: ${key}`);
    seen.add(key);
    normalized.push(next);
  }
  normalized.sort((left, right) => left.heroId - right.heroId || left.soldierId - right.soldierId);
  return normalized;
}

export function pairsFromRelationArtifact(value) {
  if (!Array.isArray(value?.edges)) throw new TypeError('Relation artifact edges must be an array');
  return value.edges.map((edge) => normalizePair(edge?.heroId, edge?.soldierId, 'relation artifact'));
}

export function pairsFromByHeroArtifact(value) {
  if (!value?.byHeroId || typeof value.byHeroId !== 'object' || Array.isArray(value.byHeroId)) {
    throw new TypeError('byHero artifact must contain byHeroId object');
  }
  const pairs = [];
  for (const [heroKey, soldierIds] of Object.entries(value.byHeroId)) {
    const heroId = Number(heroKey);
    if (!Number.isInteger(heroId) || !Array.isArray(soldierIds)) {
      throw new TypeError(`Invalid byHero membership entry: ${heroKey}`);
    }
    for (const soldierId of soldierIds) pairs.push(normalizePair(heroId, soldierId, `byHero ${heroKey}`));
  }
  return pairs;
}

export function pairsFromBySoldierArtifact(value) {
  if (!value?.bySoldierId || typeof value.bySoldierId !== 'object' || Array.isArray(value.bySoldierId)) {
    throw new TypeError('bySoldier artifact must contain bySoldierId object');
  }
  const pairs = [];
  for (const [soldierKey, heroIds] of Object.entries(value.bySoldierId)) {
    const soldierId = Number(soldierKey);
    if (!Number.isInteger(soldierId) || !Array.isArray(heroIds)) {
      throw new TypeError(`Invalid bySoldier membership entry: ${soldierKey}`);
    }
    for (const heroId of heroIds) pairs.push(normalizePair(heroId, soldierId, `bySoldier ${soldierKey}`));
  }
  return pairs;
}

export function pairsFromSoldierRecordsArtifact(value) {
  if (!Array.isArray(value?.records)) throw new TypeError('Soldier records artifact must contain records array');
  const pairs = [];
  for (const record of value.records) {
    const soldierId = record?.soldierId;
    const heroIds = record?.heroes?.finalHeroIds;
    if (!Number.isInteger(soldierId) || !Array.isArray(heroIds)) {
      throw new TypeError(`Invalid Soldier record membership for soldierId ${soldierId ?? 'unknown'}`);
    }
    for (const heroId of heroIds) pairs.push(normalizePair(heroId, soldierId, `Soldier ${soldierId}`));
  }
  return pairs;
}

export function buildStage65MembershipDigest(pairs) {
  return buildSemanticDigest(STAGE65_MEMBERSHIP_PROJECTION, {
    pairs: normalizeMembershipPairs(pairs),
  });
}

export function classifyStage65Snapshot({
  recordedGitBlobSha,
  currentGitBlobSha,
  currentDigest,
  canonicalDigest,
  semanticHealthy = true,
}) {
  if (
    typeof recordedGitBlobSha !== 'string'
      || recordedGitBlobSha.length === 0
      || typeof currentGitBlobSha !== 'string'
      || currentGitBlobSha.length === 0
      || !currentDigest
      || !canonicalDigest
  ) return 'SEMANTIC_UNKNOWN';
  if (!semanticHealthy || !sameSemanticDigest(currentDigest, canonicalDigest)) return 'SEMANTIC_STALE';
  return recordedGitBlobSha === currentGitBlobSha ? 'SEMANTIC_FRESH' : 'PROVENANCE_ONLY_CHANGED';
}

export function buildStage65FreshnessEnvelope(semanticDigest, snapshotObservations = []) {
  return {
    contract: FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
    freshnessMode: STAGE65_FRESHNESS_MODE,
    semanticDigest,
    snapshotObservations,
  };
}
