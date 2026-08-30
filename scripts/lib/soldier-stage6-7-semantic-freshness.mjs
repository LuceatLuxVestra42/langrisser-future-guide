import { execFileSync } from 'node:child_process';
import {
  FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
  FROZEN_SEMANTIC_DIGEST_ALGORITHM,
  buildSemanticDigest,
  sameSemanticDigest,
} from './frozen-semantic-digest.mjs';
import {
  buildStage66OutputDigest,
  buildStage66ValidationDigest,
} from './soldier-stage6-6-semantic-projections.mjs';

export const STAGE67_FRESHNESS_MODE = 'SEMANTIC_DIGEST_V2_STICKY_PROVENANCE';

const STAGE3_GENERATED_PROJECTION = 'soldier-stage6-7/transitive-stage3-generated/v1';
const STAGE3_VALIDATION_PROJECTION = 'soldier-stage6-7/transitive-stage3-validation/v1';
const HISTORICAL_BLOB_MAX_BUFFER = 64 * 1024 * 1024;

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
  throw new TypeError(`Unsupported P4 Stage 6-6 semantic source label: ${label}`);
}

export function buildStage67Stage3Digest(label, value) {
  if (label === 'stage3Generated') {
    return buildSemanticDigest(STAGE3_GENERATED_PROJECTION, {
      version: value?.version ?? null,
      stage: value?.stage ?? null,
      status: value?.status ?? null,
      sources: value?.sources ?? null,
      records: value?.records ?? null,
      trainingProfiles: value?.trainingProfiles ?? null,
      spRelations: value?.spRelations ?? null,
      spHeroRewards: value?.spHeroRewards ?? null,
    });
  }
  if (label === 'stage3Validation') {
    // Stage 6-2 consumes exactly Stage 3 validation status and checks.
    return buildSemanticDigest(STAGE3_VALIDATION_PROJECTION, {
      status: value?.status ?? null,
      checks: value?.checks ?? null,
    });
  }
  throw new TypeError(`Unsupported P4 Stage 3 semantic source label: ${label}`);
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

export function buildStage67V2Ref({ path, currentDigest, currentGitBlobSha, priorRef = null, stickyGitBlobSha = null }) {
  const priorClassification = classifyStage67Ref(priorRef, currentDigest, currentGitBlobSha);
  const preservePriorBlob = priorRef?.path === path
    && typeof priorRef?.gitBlobSha === 'string'
    && ['SEMANTIC_FRESH', 'PROVENANCE_ONLY_CHANGED'].includes(priorClassification);

  return {
    path,
    gitBlobSha: preservePriorBlob
      ? priorRef.gitBlobSha
      : (typeof stickyGitBlobSha === 'string' ? stickyGitBlobSha : currentGitBlobSha),
    semanticDigest: currentDigest,
    freshnessMode: STAGE67_FRESHNESS_MODE,
  };
}

function readHistoricalJsonAfterBufferOverflow(blobSha) {
  const content = execFileSync('git', ['cat-file', '-p', blobSha], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: HISTORICAL_BLOB_MAX_BUFFER,
  });
  return JSON.parse(content);
}

function proveLegacyMigrationWithDigestBuilder({
  path,
  currentValue,
  currentGitBlobSha,
  priorRef,
  readHistoricalJson,
  buildDigest,
}) {
  const currentDigest = buildDigest(currentValue);

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
    if (error?.code === 'ENOBUFS') {
      try {
        historicalValue = readHistoricalJsonAfterBufferOverflow(priorRef.gitBlobSha);
      } catch (fallbackError) {
        return {
          ok: false,
          classification: 'SEMANTIC_UNKNOWN',
          reason: `historical-blob-unavailable:${fallbackError.message}`,
          currentDigest,
        };
      }
    } else {
      return {
        ok: false,
        classification: 'SEMANTIC_UNKNOWN',
        reason: `historical-blob-unavailable:${error.message}`,
        currentDigest,
      };
    }
  }

  let historicalDigest;
  try {
    historicalDigest = buildDigest(historicalValue);
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

export function proveLegacyStage67Migration({
  label,
  path,
  currentValue,
  currentGitBlobSha,
  priorRef,
  readHistoricalJson,
}) {
  return proveLegacyMigrationWithDigestBuilder({
    path,
    currentValue,
    currentGitBlobSha,
    priorRef,
    readHistoricalJson,
    buildDigest: (value) => buildStage67Stage66Digest(label, value),
  });
}

export function proveLegacyStage67Stage3Migration({
  label,
  path,
  currentValue,
  currentGitBlobSha,
  priorRef,
  readHistoricalJson,
}) {
  return proveLegacyMigrationWithDigestBuilder({
    path,
    currentValue,
    currentGitBlobSha,
    priorRef,
    readHistoricalJson,
    buildDigest: (value) => buildStage67Stage3Digest(label, value),
  });
}
