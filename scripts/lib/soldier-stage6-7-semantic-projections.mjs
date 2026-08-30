import {
  FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
  buildSemanticDigest,
  sameSemanticDigest,
} from './frozen-semantic-digest.mjs';
import {
  buildStage66OutputDigest,
  buildStage66ValidationDigest,
} from './soldier-stage6-6-semantic-projections.mjs';

export const STAGE67_FRESHNESS_MODE = 'SEMANTIC_DIGEST_V2_STICKY_PROVENANCE';

const DIRECT_SOURCE_PROJECTIONS = Object.freeze({
  contract: 'soldier-stage6-7-source/contract/v2',
  checkpoint: 'soldier-stage6-7-source/checkpoint/v2',
  stage5_7: 'soldier-stage6-7-source/stage5-7-validation/v2',
  stage5_8: 'soldier-stage6-7-source/stage5-8-validation/v2',
  stage6_1: 'soldier-stage6-7-source/stage6-1-validation/v2',
  stage6_2: 'soldier-stage6-7-source/stage6-2-validation/v2',
  stage6_3: 'soldier-stage6-7-source/stage6-3-validation/v2',
  stage6_4: 'soldier-stage6-7-source/stage6-4-validation/v2',
  stage6_5Manifest: 'soldier-stage6-7-source/stage6-5-manifest/v2',
  stage6_5: 'soldier-stage6-7-source/stage6-5-validation/v2',
  stage6_6Manifest: 'soldier-stage6-6-expansion-basis/semantic-v1',
  stage6_6: 'soldier-stage6-6-expansion-basis-validation/semantic-v1',
});

const KEY_ARTIFACT_PROJECTIONS = Object.freeze({
  detail: 'soldier-stage6-7-key-artifact/detail/v2',
  list: 'soldier-stage6-7-key-artifact/list/v2',
  releaseMetadata: 'soldier-stage6-7-key-artifact/release-metadata/v2',
  fullRecords: 'soldier-stage6-7-key-artifact/full-records/v2',
  reciprocalLinks: 'soldier-stage6-7-key-artifact/reciprocal-links/v2',
  expansionBasis: 'soldier-stage6-6-expansion-basis/semantic-v1',
});

const AUDIT_ONLY_KEYS = new Set([
  'gitBlobSha',
  'blobSha',
  'canonicalRelationBlobSha',
  'commitSha',
  'treeSha',
  'workflowRunId',
  'runId',
  'artifactDigest',
  'semanticDigest',
  'freshnessMode',
]);

function stripAuditProvenanceDeep(value) {
  if (Array.isArray(value)) return value.map(stripAuditProvenanceDeep);
  if (!value || typeof value !== 'object') return value;

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (AUDIT_ONLY_KEYS.has(key)) continue;
    result[key] = stripAuditProvenanceDeep(child);
  }
  return result;
}

function stripTopLevelFreshnessMetadata(value) {
  const {
    generatedAt: _generatedAt,
    generatedBy: _generatedBy,
    frozenAt: _frozenAt,
    sources: _sources,
    freshness: _freshness,
    ...semantic
  } = value ?? {};
  return stripAuditProvenanceDeep(semantic);
}

function projectRefWithoutAudit(ref) {
  if (!ref || typeof ref !== 'object') return ref ?? null;
  return stripAuditProvenanceDeep(ref);
}

function projectCheckpoint(value) {
  const contracts = Object.fromEntries(
    Object.entries(value?.contracts ?? {}).map(([key, ref]) => [key, projectRefWithoutAudit(ref)]),
  );
  const generatedBaseline = Object.fromEntries(
    Object.entries(value?.generatedBaseline ?? {}).map(([key, ref]) => [key, projectRefWithoutAudit(ref)]),
  );
  const validationBaseline = Object.fromEntries(
    Object.entries(value?.validationBaseline ?? {}).map(([key, ref]) => [key, projectRefWithoutAudit(ref)]),
  );

  return {
    version: value?.version ?? null,
    schemaId: value?.schemaId ?? null,
    stage: value?.stage ?? null,
    status: value?.status ?? null,
    purpose: value?.purpose ?? null,
    contracts,
    generatedBaseline,
    validationBaseline,
    expectedCoverage: value?.expectedCoverage ?? null,
    knownReviews: value?.knownReviews ?? null,
    stage6EntryRules: value?.stage6EntryRules ?? null,
    completion: value?.completion ?? null,
  };
}

export function projectStage67DirectSource(label, value) {
  if (label === 'checkpoint') return projectCheckpoint(value);
  if (label === 'stage6_6Manifest' || label === 'stage6_6') {
    throw new TypeError(`Stage 6-6 dependency ${label} must use its authoritative embedded semantic contract`);
  }
  if (!DIRECT_SOURCE_PROJECTIONS[label]) throw new TypeError(`Unknown Soldier Stage 6-7 source label: ${label}`);
  return stripTopLevelFreshnessMetadata(value);
}

export function buildStage67DirectSourceDigest(label, value) {
  if (label === 'stage6_6Manifest') return buildStage66OutputDigest(value);
  if (label === 'stage6_6') return buildStage66ValidationDigest(value);
  const projection = DIRECT_SOURCE_PROJECTIONS[label];
  if (!projection) throw new TypeError(`Unknown Soldier Stage 6-7 source label: ${label}`);
  return buildSemanticDigest(projection, projectStage67DirectSource(label, value));
}

export function projectStage67KeyArtifact(label, value) {
  if (label === 'expansionBasis') {
    throw new TypeError('Stage 6-6 expansion basis must use its authoritative embedded semantic contract');
  }
  if (!KEY_ARTIFACT_PROJECTIONS[label]) throw new TypeError(`Unknown Soldier Stage 6-7 key artifact label: ${label}`);
  return stripTopLevelFreshnessMetadata(value);
}

export function buildStage67KeyArtifactDigest(label, value) {
  if (label === 'expansionBasis') return buildStage66OutputDigest(value);
  const projection = KEY_ARTIFACT_PROJECTIONS[label];
  if (!projection) throw new TypeError(`Unknown Soldier Stage 6-7 key artifact label: ${label}`);
  return buildSemanticDigest(projection, projectStage67KeyArtifact(label, value));
}

export function verifyStage66EmbeddedFreshness(label, value) {
  const expected = label === 'stage6_6'
    ? buildStage66ValidationDigest(value)
    : buildStage66OutputDigest(value);
  return Boolean(
    value?.freshness?.contract === FROZEN_SEMANTIC_FRESHNESS_CONTRACT
      && sameSemanticDigest(value?.freshness?.semanticDigest, expected),
  );
}

export function classifyStage67Ref(ref, currentDigest, currentGitBlobSha) {
  if (
    !ref
      || typeof ref.path !== 'string'
      || typeof ref.gitBlobSha !== 'string'
      || ref.freshnessMode !== STAGE67_FRESHNESS_MODE
      || !ref.semanticDigest
  ) return 'INVALID_FRESHNESS_REF';
  if (!sameSemanticDigest(ref.semanticDigest, currentDigest)) return 'SEMANTIC_STALE';
  return ref.gitBlobSha === currentGitBlobSha ? 'SEMANTIC_FRESH' : 'PROVENANCE_ONLY_CHANGED';
}

export function buildStage67Ref({ path, currentDigest, currentGitBlobSha, priorRef = null }) {
  const preservePriorBlob = priorRef?.path === path
    && typeof priorRef?.gitBlobSha === 'string'
    && sameSemanticDigest(priorRef?.semanticDigest, currentDigest);

  return {
    path,
    gitBlobSha: preservePriorBlob ? priorRef.gitBlobSha : currentGitBlobSha,
    semanticDigest: currentDigest,
    freshnessMode: STAGE67_FRESHNESS_MODE,
  };
}

export function projectStage67OutputArtifact(value) {
  const {
    generatedAt: _generatedAt,
    sources: _sources,
    keyArtifacts: _keyArtifacts,
    freshness: _freshness,
    ...semantic
  } = value ?? {};
  return stripAuditProvenanceDeep(semantic);
}

export function projectStage67ValidationArtifact(value) {
  const { generatedAt: _generatedAt, freshness: _freshness, ...semantic } = value ?? {};
  return stripAuditProvenanceDeep(semantic);
}

export function buildStage67OutputDigest(value) {
  return buildSemanticDigest('soldier-stage6-7-site-admission/semantic-v2', projectStage67OutputArtifact(value));
}

export function buildStage67ValidationDigest(value) {
  return buildSemanticDigest('soldier-stage6-7-site-admission-validation/semantic-v2', projectStage67ValidationArtifact(value));
}

export function buildStage67FreshnessEnvelope(semanticDigest) {
  return {
    contract: FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
    freshnessMode: STAGE67_FRESHNESS_MODE,
    semanticDigest,
  };
}
