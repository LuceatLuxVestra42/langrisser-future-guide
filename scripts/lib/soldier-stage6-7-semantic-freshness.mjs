import {
  FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
  FROZEN_SEMANTIC_DIGEST_ALGORITHM,
  sameSemanticDigest,
} from './frozen-semantic-digest.mjs';
import {
  buildStage66OutputDigest,
  buildStage66ValidationDigest,
} from './soldier-stage6-6-semantic-projections.mjs';

export const STAGE67_FRESHNESS_MODE = 'SEMANTIC_DIGEST_V2_STICKY_PROVENANCE';

function validDigestEnvelope(value) {
  return Boolean(
    value
      && value.contract === FROZEN_SEMANTIC_FRESHNESS_CONTRACT
      && value.algorithm === FROZEN_SEMANTIC_DIGEST_ALGORITHM
      && typeof value.projection === 'string'
      && value.projection.length > 0
      && /^sha256:[0-9a-f]{64}$/.test(value.digest ?? ''),
  );
}

function sameDigestIdentity(left, right) {
  return validDigestEnvelope(left)
    && validDigestEnvelope(right)
    && left.contract === right.contract
    && left.algorithm === right.algorithm
    && left.projection === right.projection;
}

export function buildStage67Stage66Digest(label, value) {
  if (label === 'stage6_6') return buildStage66ValidationDigest(value);
  if (label === 'stage6_6Manifest' || label === 'expansionBasis') return buildStage66OutputDigest(value);
  throw new TypeError(`Unsupported P4 semantic source label: ${label}`);
}

export function verifyStage66EmbeddedFreshness(label, value) {
  const digest = buildStage67Stage66Digest(label, value);
  return Boolean(
    value?.freshness?.contract === FROZEN_SEMANTIC_FRESHNESS_CONTRACT
      && sameSemanticDigest(value?.freshness?.semanticDigest, digest),
  );
}

export function classifyStage67Ref(ref, currentDigest, currentGitBlobSha) {
  if (!ref || typeof ref.path !== 'string' || typeof ref.gitBlobSha !== 'string') {
    return 'SEMANTIC_UNKNOWN';
  }

  if (!ref.semanticDigest) {
    if (typeof currentGitBlobSha === 'string' && currentGitBlobSha === ref.gitBlobSha) {
      return 'SEMANTIC_FRESH';
    }
    return 'SEMANTIC_UNKNOWN';
  }

  if (!sameDigestIdentity(ref.semanticDigest, currentDigest)) return 'SEMANTIC_UNKNOWN';
  if (ref.semanticDigest.digest !== currentDigest.digest) return 'SEMANTIC_STALE';
  if (typeof currentGitBlobSha !== 'string') return 'SEMANTIC_FRESH';
  return ref.gitBlobSha === currentGitBlobSha ? 'SEMANTIC_FRESH' : 'PROVENANCE_ONLY_CHANGED';
}

export function buildStage67V2Ref({ path, currentDigest, currentGitBlobSha, priorRef = null }) {
  const priorClassification = classifyStage67Ref(priorRef, currentDigest, currentGitBlobSha);
  const preservePriorBlob = priorRef?.path === path
    && typeof priorRef?.gitBlobSha === 'string'
    && ['SEMANTIC_FRESH', 'PROVENANCE_ONLY_CHANGED'].includes(priorClassification);

  return {
    path,
    gitBlobSha: preservePriorBlob ? priorRef.gitBlobSha : currentGitBlobSha,
    semanticDigest: currentDigest,
    freshnessMode: STAGE67_FRESHNESS_MODE,
  };
}

export function proveLegacyStage67Migration({
  label,
  path,
  currentValue,
  currentGitBlobSha,
  priorRef,
  readHistoricalJson,
}) {
  const currentDigest = buildStage67Stage66Digest(label, currentValue);

  if (!priorRef || priorRef.path !== path || typeof priorRef.gitBlobSha !== 'string') {
    return {
      ok: false,
      classification: 'SEMANTIC_UNKNOWN',
      reason: 'missing-or-incompatible-prior-ref',
      currentDigest,
    };
  }

  if (priorRef.semanticDigest) {
    const classification = classifyStage67Ref(priorRef, currentDigest, currentGitBlobSha);
    return {
      ok: ['SEMANTIC_FRESH', 'PROVENANCE_ONLY_CHANGED'].includes(classification),
      classification,
      reason: 'existing-v2-ref',
      currentDigest,
    };
  }

  if (typeof currentGitBlobSha === 'string' && currentGitBlobSha === priorRef.gitBlobSha) {
    return {
      ok: true,
      classification: 'SEMANTIC_FRESH',
      reason: 'legacy-byte-identical-migration',
      currentDigest,
    };
  }

  let historicalValue;
  try {
    historicalValue = readHistoricalJson(priorRef.gitBlobSha);
  } catch (error) {
    return {
      ok: false,
      classification: 'SEMANTIC_UNKNOWN',
      reason: `historical-blob-unavailable:${error.message}`,
      currentDigest,
    };
  }

  let historicalDigest;
  try {
    historicalDigest = buildStage67Stage66Digest(label, historicalValue);
  } catch (error) {
    return {
      ok: false,
      classification: 'SEMANTIC_UNKNOWN',
      reason: `historical-semantic-digest-error:${error.message}`,
      currentDigest,
    };
  }

  if (!sameSemanticDigest(historicalDigest, currentDigest)) {
    return {
      ok: false,
      classification: 'SEMANTIC_STALE',
      reason: 'historical-semantic-mismatch',
      currentDigest,
      historicalDigest,
    };
  }

  return {
    ok: true,
    classification: 'PROVENANCE_ONLY_CHANGED',
    reason: 'historical-semantic-equality-proven',
    currentDigest,
    historicalDigest,
  };
}
