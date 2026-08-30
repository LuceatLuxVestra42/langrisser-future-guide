import {
  FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
  FROZEN_SEMANTIC_DIGEST_ALGORITHM,
  buildSemanticDigest,
} from './frozen-semantic-digest.mjs';

export const STAGE66_FRESHNESS_MODE = 'SEMANTIC_DIGEST_V2_STICKY_PROVENANCE';

const SOURCE_PROJECTIONS = Object.freeze({
  fullRecords: 'soldier-stage6-6-source/full-records/v1',
  fullValidation: 'soldier-stage6-6-source/full-validation/v1',
  stage5_2: 'soldier-stage6-6-source/stage5-2-combat/v1',
  stage5_2Validation: 'soldier-stage6-6-source/stage5-2-validation/v1',
  stage5_3: 'soldier-stage6-6-source/stage5-3-ability/v1',
  stage5_3Validation: 'soldier-stage6-6-source/stage5-3-validation/v1',
  stage5_4: 'soldier-stage6-6-source/stage5-4-training/v1',
  stage5_4Validation: 'soldier-stage6-6-source/stage5-4-validation/v1',
  stage5_6: 'soldier-stage6-6-source/stage5-6-sp/v1',
  stage5_6Validation: 'soldier-stage6-6-source/stage5-6-validation/v1',
  relationSet: 'soldier-stage6-6-source/hero-soldier-relation/v1',
  relationValidation: 'soldier-stage6-6-source/relation-validation/v1',
  stage6_5Manifest: 'soldier-stage6-6-source/stage6-5-manifest/v1',
  stage6_5Validation: 'soldier-stage6-6-source/stage6-5-validation/v1',
});

function contractIdentity(value) {
  return {
    version: value?.version ?? null,
    schemaId: value?.schemaId ?? null,
    stage: value?.stage ?? null,
    status: value?.status ?? null,
  };
}

function sortedRecords(records, projector) {
  return (Array.isArray(records) ? records : [])
    .map(projector)
    .sort((a, b) => (a.soldierId ?? Number.MAX_SAFE_INTEGER) - (b.soldierId ?? Number.MAX_SAFE_INTEGER));
}

function projectRelation(value) {
  const edges = (Array.isArray(value?.edges) ? value.edges : []).map((edge) => ({
    heroId: edge?.heroId ?? null,
    soldierId: edge?.soldierId ?? null,
    provenanceSourceKinds: (Array.isArray(edge?.provenance) ? edge.provenance : [])
      .map((item) => item?.sourceKind ?? null)
      .sort((a, b) => String(a).localeCompare(String(b))),
  })).sort((a, b) => (a.heroId - b.heroId) || (a.soldierId - b.soldierId));

  return {
    ...contractIdentity(value),
    summary: {
      edgeCount: value?.summary?.edgeCount ?? null,
      provenanceCount: value?.summary?.provenanceCount ?? null,
      sourceProductionCounts: value?.summary?.sourceProductionCounts ?? null,
    },
    edges,
  };
}

export function projectStage66Source(label, value) {
  switch (label) {
    case 'fullRecords':
      return {
        ...contractIdentity(value),
        records: sortedRecords(value?.records, (record) => ({
          soldierId: record?.soldierId ?? null,
          identity: {
            isSp: record?.identity?.isSp ?? null,
            tier: record?.identity?.tier ?? null,
          },
          combat: record?.combat ?? null,
          ability: record?.ability ?? null,
          training: record?.training ?? null,
          sp: record?.sp ?? null,
        })),
      };
    case 'stage5_2':
      return {
        ...contractIdentity(value),
        records: sortedRecords(value?.records, (record) => ({ soldierId: record?.soldierId ?? null, combat: record?.combat ?? null })),
      };
    case 'stage5_3':
      return {
        ...contractIdentity(value),
        records: sortedRecords(value?.records, (record) => ({ soldierId: record?.soldierId ?? null, ability: record?.ability ?? null })),
      };
    case 'stage5_4':
      return {
        ...contractIdentity(value),
        records: sortedRecords(value?.records, (record) => ({ soldierId: record?.soldierId ?? null, training: record?.training ?? null })),
      };
    case 'stage5_6':
      return {
        ...contractIdentity(value),
        records: sortedRecords(value?.records, (record) => ({ soldierId: record?.soldierId ?? null, sp: record?.sp ?? null })),
      };
    case 'relationSet':
      return projectRelation(value);
    case 'relationValidation':
      return {
        ...contractIdentity(value),
        checks: { edgesWithoutProvenance: value?.checks?.edgesWithoutProvenance ?? null },
      };
    case 'stage6_5Manifest':
      return {
        ...contractIdentity(value),
        summary: { canonicalRelationCount: value?.summary?.canonicalRelationCount ?? null },
      };
    case 'fullValidation':
    case 'stage5_2Validation':
    case 'stage5_3Validation':
    case 'stage5_4Validation':
    case 'stage5_6Validation':
    case 'stage6_5Validation':
      return contractIdentity(value);
    default:
      throw new TypeError(`Unknown Soldier Stage 6-6 source label: ${label}`);
  }
}

export function buildStage66SourceDigest(label, value) {
  const projection = SOURCE_PROJECTIONS[label];
  if (!projection) throw new TypeError(`Unknown Soldier Stage 6-6 source label: ${label}`);
  return buildSemanticDigest(projection, projectStage66Source(label, value));
}

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

function equalDigest(left, right) {
  return sameDigestIdentity(left, right) && left.digest === right.digest;
}

export function classifyStage66SourceRef(ref, currentDigest, currentGitBlobSha) {
  if (!ref || typeof ref.path !== 'string' || typeof ref.gitBlobSha !== 'string') return 'SEMANTIC_UNKNOWN';

  if (!ref.semanticDigest) {
    if (typeof currentGitBlobSha === 'string' && currentGitBlobSha === ref.gitBlobSha) return 'SEMANTIC_FRESH';
    return 'SEMANTIC_UNKNOWN';
  }

  if (!sameDigestIdentity(ref.semanticDigest, currentDigest)) return 'SEMANTIC_UNKNOWN';
  if (ref.semanticDigest.digest !== currentDigest.digest) return 'SEMANTIC_STALE';
  if (typeof currentGitBlobSha !== 'string') return 'SEMANTIC_FRESH';
  return ref.gitBlobSha === currentGitBlobSha ? 'SEMANTIC_FRESH' : 'PROVENANCE_ONLY_CHANGED';
}

export function buildStage66SourceRef({ label, path, value, currentGitBlobSha, priorRef = null }) {
  const semanticDigest = buildStage66SourceDigest(label, value);
  const preservePriorBlob = priorRef?.path === path
    && typeof priorRef?.gitBlobSha === 'string'
    && equalDigest(priorRef?.semanticDigest, semanticDigest);

  return {
    path,
    gitBlobSha: preservePriorBlob ? priorRef.gitBlobSha : currentGitBlobSha,
    semanticDigest,
    freshnessMode: STAGE66_FRESHNESS_MODE,
  };
}

function projectAuthority(value, { includeScope = false } = {}) {
  const projected = {
    source: value?.source ?? null,
    field: value?.field ?? null,
  };
  if (includeScope) projected.scope = value?.scope ?? null;
  return projected;
}

export function projectStage66OutputArtifact(value) {
  return {
    version: value?.version ?? null,
    schemaId: value?.schemaId ?? null,
    stage: value?.stage ?? null,
    status: value?.status ?? null,
    simulatorReadiness: {
      status: value?.simulatorReadiness?.status ?? null,
      scope: value?.simulatorReadiness?.scope ?? null,
    },
    authorities: {
      fullStats: projectAuthority(value?.authorities?.fullStats),
      normalTraitLevels: projectAuthority(value?.authorities?.normalTraitLevels, { includeScope: true }),
      trainingCosts: projectAuthority(value?.authorities?.trainingCosts, { includeScope: true }),
      spExpansion: projectAuthority(value?.authorities?.spExpansion, { includeScope: true }),
      heroEligibilityProvenance: projectAuthority(value?.authorities?.heroEligibilityProvenance),
    },
    summary: value?.summary ?? null,
  };
}

function projectReview(review) {
  const projected = {
    code: review?.code ?? null,
    classification: review?.classification ?? null,
  };
  if (review && Object.hasOwn(review, 'count')) projected.count = review.count;
  return projected;
}

export function projectStage66ValidationArtifact(value) {
  return {
    version: value?.version ?? null,
    schemaId: value?.schemaId ?? null,
    stage: value?.stage ?? null,
    status: value?.status ?? null,
    checks: value?.checks ?? null,
    coverage: value?.coverage ?? null,
    reviews: (Array.isArray(value?.reviews) ? value.reviews : [])
      .map(projectReview)
      .sort((a, b) => String(a.code).localeCompare(String(b.code)) || String(a.classification).localeCompare(String(b.classification))),
  };
}

export function buildStage66OutputDigest(value) {
  return buildSemanticDigest('soldier-stage6-6-expansion-basis/semantic-v1', projectStage66OutputArtifact(value));
}

export function buildStage66ValidationDigest(value) {
  return buildSemanticDigest('soldier-stage6-6-expansion-validation/semantic-v1', projectStage66ValidationArtifact(value));
}

export function buildStage66FreshnessEnvelope(semanticDigest) {
  return {
    contract: FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
    freshnessMode: STAGE66_FRESHNESS_MODE,
    semanticDigest,
  };
}
