import {
  FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
  buildSemanticDigest,
  sameSemanticDigest,
} from './frozen-semantic-digest.mjs';
import {
  buildStage65MembershipDigest,
  pairsFromBySoldierArtifact,
  pairsFromRelationArtifact,
} from '../soldier-stage6-5-semantic-projections.mjs';

export const STAGE5_FRESHNESS_MODE = 'SEMANTIC_DIGEST_V2_STICKY_PROVENANCE';
export const STAGE55_MEMBERSHIP_PROJECTION = 'hero-soldier-membership/v1';

const contractIdentity = value => ({
  schemaId: value?.schemaId ?? null,
  status: value?.status ?? null,
});

const validationIdentity = value => ({
  schemaId: value?.schemaId ?? null,
  stage: value?.stage ?? null,
  status: value?.status ?? null,
});

function sortedRecords(records, projector) {
  return (Array.isArray(records) ? records : [])
    .map(projector)
    .sort((left, right) => (left.soldierId ?? Number.MAX_SAFE_INTEGER) - (right.soldierId ?? Number.MAX_SAFE_INTEGER));
}

function projectIdentityRecord(record) {
  return {
    soldierId: record?.soldierId ?? null,
    siteId: record?.siteId ?? record?.identity?.siteId ?? null,
    nameKr: record?.nameKr ?? record?.identity?.nameKr ?? null,
    nameCn: record?.nameCn ?? record?.identity?.nameCn ?? null,
    nameKrStatus: record?.nameKrStatus ?? record?.identity?.nameKrStatus ?? null,
    tier: record?.tier ?? record?.identity?.tier ?? null,
    armyId: record?.armyId ?? record?.identity?.armyId ?? null,
    armyType: record?.armyType ?? record?.identity?.armyType ?? null,
    uiGroup: record?.uiGroup ?? record?.identity?.uiGroup ?? null,
    isSp: record?.isSp ?? record?.identity?.isSp ?? null,
    normalSoldierId: record?.normalSoldierId ?? record?.identity?.normalSoldierId ?? null,
    spSoldierId: record?.spSoldierId ?? record?.identity?.spSoldierId ?? null,
    validationStatus: record?.validationStatus ?? record?.identity?.validationStatus ?? null,
  };
}

function projectStage5Contract(value) {
  return {
    schemaId: value?.schemaId ?? null,
    status: value?.status ?? null,
    baseline: value?.baseline ?? null,
    output: {
      currentBaselineRecordCount: value?.output?.currentBaselineRecordCount ?? null,
    },
  };
}

function projectSoldierMaster(value) {
  return {
    status: value?.status ?? null,
    records: sortedRecords(value?.records, record => projectIdentityRecord(record)),
  };
}

function projectStage3For52(value) {
  return {
    status: value?.status ?? null,
    records: sortedRecords(value?.records, record => ({
      soldierId: record?.soldierId ?? null,
      combat: {
        tier: record?.combat?.tier ?? null,
        armyId: record?.combat?.armyId ?? null,
        isMelee: record?.combat?.isMelee ?? null,
        moveType: record?.combat?.moveType ?? null,
      },
      stats: record?.stats ?? null,
      spRelation: record?.spRelation ? { spSoldierId: record.spRelation.spSoldierId ?? null } : null,
    })),
  };
}

function projectTrainingProfileForAbility(profile) {
  return {
    soldierId: profile?.soldierId ?? null,
    primaryTenLevelTechId: profile?.primaryTenLevelTechId ?? null,
    linkedTechs: (Array.isArray(profile?.linkedTechs) ? profile.linkedTechs : []).map(tech => ({
      techId: tech?.techId ?? null,
      levels: (Array.isArray(tech?.levels) ? tech.levels : []).map(level => ({
        sequenceLevel: level?.sequenceLevel ?? null,
        levelInfoId: level?.levelInfoId ?? null,
        description: level?.description ?? null,
        spDescription: level?.spDescription ?? null,
        soldierSkillLevel: level?.soldierSkillLevel ?? null,
        soldierSkillId: level?.soldierSkillId ?? null,
      })),
    })),
  };
}

function projectStage3For53(value) {
  return {
    status: value?.status ?? null,
    records: sortedRecords(value?.records, record => ({
      soldierId: record?.soldierId ?? null,
      spRelation: record?.spRelation ? {
        normalSoldierId: record.spRelation.normalSoldierId ?? null,
        spSoldierId: record.spRelation.spSoldierId ?? null,
      } : null,
    })),
    trainingProfiles: sortedRecords(value?.trainingProfiles, projectTrainingProfileForAbility),
  };
}

function projectTrainingProfileForCosts(profile) {
  return {
    soldierId: profile?.soldierId ?? null,
    primaryTenLevelTechId: profile?.primaryTenLevelTechId ?? null,
    linkedTechs: (Array.isArray(profile?.linkedTechs) ? profile.linkedTechs : []).map(tech => ({
      techId: tech?.techId ?? null,
      costToLevel5: tech?.costToLevel5 ?? null,
      costToLevel10: tech?.costToLevel10 ?? null,
      levels: (Array.isArray(tech?.levels) ? tech.levels : []).map(level => ({
        sequenceLevel: level?.sequenceLevel ?? null,
        gold: level?.gold ?? null,
        materials: level?.materials ?? null,
      })),
    })),
  };
}

function projectStage3For54(value) {
  return {
    status: value?.status ?? null,
    trainingProfiles: sortedRecords(value?.trainingProfiles, projectTrainingProfileForCosts),
  };
}

function projectStage3For56(value) {
  return {
    status: value?.status ?? null,
    spRelations: (Array.isArray(value?.spRelations) ? value.spRelations : [])
      .map(relation => ({
        normalSoldierId: relation?.normalSoldierId ?? null,
        spSoldierId: relation?.spSoldierId ?? null,
        statDelta: relation?.statDelta ?? null,
        firstStage: relation?.firstStage ?? null,
        secondStageUnlock: relation?.secondStageUnlock ?? null,
        secondStage: relation?.secondStage ?? null,
        rawSecondStage: relation?.rawSecondStage ?? null,
      }))
      .sort((left, right) => (left.spSoldierId ?? Number.MAX_SAFE_INTEGER) - (right.spSoldierId ?? Number.MAX_SAFE_INTEGER)),
  };
}

function projectStage5Records(value, fields) {
  return {
    ...contractIdentity(value),
    stage: value?.stage ?? null,
    records: sortedRecords(value?.records, record => {
      const out = { soldierId: record?.soldierId ?? null };
      for (const field of fields) out[field] = record?.[field] ?? null;
      return out;
    }),
  };
}

function projectListRecords(value) {
  return {
    ...contractIdentity(value),
    stage: value?.stage ?? null,
    records: sortedRecords(value?.records, record => ({ ...record })),
  };
}

function projectRelationValidation(value) {
  return {
    schemaId: value?.schemaId ?? null,
    status: value?.status ?? null,
    checks: value?.checks ?? null,
  };
}

function projectBySoldier(value) {
  const membershipDigest = buildStage65MembershipDigest(pairsFromBySoldierArtifact(value));
  return {
    schemaId: value?.schemaId ?? null,
    summary: {
      keyCount: value?.summary?.keyCount ?? null,
      relationCount: value?.summary?.relationCount ?? null,
    },
    membershipDigest,
  };
}

function projectReleaseSource(value) {
  return {
    schemaId: value?.schemaId ?? null,
    status: value?.status ?? null,
    coveragePolicy: {
      confirmedRecordCount: value?.coveragePolicy?.confirmedRecordCount ?? null,
    },
    externalSource: {
      kind: value?.externalSource?.kind ?? null,
      dateCells: value?.externalSource?.dateCells ?? null,
    },
    confirmedRecords: sortedRecords(value?.confirmedRecords, record => ({
      soldierId: record?.soldierId ?? null,
      expectedNameKr: record?.expectedNameKr ?? null,
      releaseDate: record?.releaseDate ?? null,
      patchGroup: record?.patchGroup ?? null,
      samePatchOrder: record?.samePatchOrder ?? null,
      sourceLabel: record?.sourceLabel ?? null,
      sourceRows: record?.sourceRows ?? null,
      mappingStatus: record?.mappingStatus ?? null,
    })),
  };
}

const SOURCE_PROJECTIONS = Object.freeze({
  '5-2': Object.freeze({
    contract: ['soldier-stage5-2-source/contract/v1', projectStage5Contract],
    soldierMaster: ['soldier-stage5-2-source/soldier-master/v1', projectSoldierMaster],
    soldierStage3: ['soldier-stage5-2-source/soldier-stage3-combat/v1', projectStage3For52],
    stage3Validation: ['soldier-stage5-2-source/stage3-validation/v1', validationIdentity],
    stage4Baseline: ['soldier-stage5-2-source/stage4-baseline/v1', value => ({ ...validationIdentity(value), counts: value?.counts ?? null })],
  }),
  '5-3': Object.freeze({
    contract: ['soldier-stage5-3-source/contract/v1', projectStage5Contract],
    stage5_2: ['soldier-stage5-3-source/stage5-2/v1', value => projectStage5Records(value, ['identity', 'combat'])],
    stage5_2Validation: ['soldier-stage5-3-source/stage5-2-validation/v1', validationIdentity],
    soldierStage3: ['soldier-stage5-3-source/soldier-stage3-ability/v1', projectStage3For53],
    stage3Validation: ['soldier-stage5-3-source/stage3-validation/v1', value => ({
      ...validationIdentity(value),
      counts: {
        tier3Normal: value?.counts?.tier3Normal ?? null,
        tier3WithoutTenLevel: value?.counts?.tier3WithoutTenLevel ?? null,
        tier3MultipleTenLevel: value?.counts?.tier3MultipleTenLevel ?? null,
        spNormalsWithoutSpDescription: value?.counts?.spNormalsWithoutSpDescription ?? null,
      },
    })],
  }),
  '5-4': Object.freeze({
    contract: ['soldier-stage5-4-source/contract/v1', projectStage5Contract],
    stage5_3: ['soldier-stage5-4-source/stage5-3/v1', value => projectStage5Records(value, ['identity', 'combat', 'ability', 'sp'])],
    stage5_3Validation: ['soldier-stage5-4-source/stage5-3-validation/v1', validationIdentity],
    soldierStage3: ['soldier-stage5-4-source/soldier-stage3-training/v1', projectStage3For54],
    stage3Validation: ['soldier-stage5-4-source/stage3-validation/v1', value => ({
      ...validationIdentity(value),
      counts: {
        tier3Normal: value?.counts?.tier3Normal ?? null,
        tier3WithoutTenLevel: value?.counts?.tier3WithoutTenLevel ?? null,
        tier3MultipleTenLevel: value?.counts?.tier3MultipleTenLevel ?? null,
      },
    })],
  }),
  '5-5': Object.freeze({
    contract: ['soldier-stage5-5-source/contract/v1', projectStage5Contract],
    stage5_4: ['soldier-stage5-5-source/stage5-4/v1', value => projectStage5Records(value, ['identity', 'combat', 'ability', 'training', 'sp'])],
    stage5_4Validation: ['soldier-stage5-5-source/stage5-4-validation/v1', validationIdentity],
    bySoldier: ['soldier-stage5-5-source/by-soldier-membership/v1', projectBySoldier],
    relationValidation: ['soldier-stage5-5-source/relation-validation/v1', projectRelationValidation],
  }),
  '5-6': Object.freeze({
    contract: ['soldier-stage5-6-source/contract/v1', projectStage5Contract],
    stage5_5: ['soldier-stage5-6-source/stage5-5/v1', value => projectStage5Records(value, ['identity', 'combat', 'ability', 'training', 'heroes', 'sp'])],
    stage5_5Validation: ['soldier-stage5-6-source/stage5-5-validation/v1', validationIdentity],
    soldierStage3: ['soldier-stage5-6-source/soldier-stage3-sp/v1', projectStage3For56],
    stage3Validation: ['soldier-stage5-6-source/stage3-validation/v1', value => ({
      ...validationIdentity(value),
      counts: {
        secondStageTrue: value?.counts?.secondStageTrue ?? null,
        secondStageFalse: value?.counts?.secondStageFalse ?? null,
        spMissionTypes: value?.counts?.spMissionTypes ?? null,
      },
    })],
  }),
  '5-7': Object.freeze({
    contract: ['soldier-stage5-7-source/contract/v1', projectStage5Contract],
    identityContract: ['soldier-stage5-7-source/identity-contract/v1', value => ({ status: value?.status ?? null })],
    stage5_6: ['soldier-stage5-7-source/stage5-6-identity/v1', value => ({
      ...contractIdentity(value),
      stage: value?.stage ?? null,
      records: sortedRecords(value?.records, record => ({ soldierId: record?.soldierId ?? null, identity: record?.identity ?? null })),
    })],
    stage5_6Validation: ['soldier-stage5-7-source/stage5-6-validation/v1', validationIdentity],
  }),
  '5-8': Object.freeze({
    contract: ['soldier-stage5-8-source/contract/v1', projectStage5Contract],
    stage5_7: ['soldier-stage5-8-source/stage5-7-list/v1', projectListRecords],
    stage5_7Validation: ['soldier-stage5-8-source/stage5-7-validation/v1', validationIdentity],
    releaseSource: ['soldier-stage5-8-source/release-source/v1', projectReleaseSource],
  }),
});

export function projectStage5Source(stage, label, value) {
  const entry = SOURCE_PROJECTIONS[stage]?.[label];
  if (!entry) throw new TypeError(`Unknown Soldier Stage ${stage} source label: ${label}`);
  return entry[1](value);
}

export function buildStage5SourceDigest(stage, label, value) {
  const entry = SOURCE_PROJECTIONS[stage]?.[label];
  if (!entry) throw new TypeError(`Unknown Soldier Stage ${stage} source label: ${label}`);
  return buildSemanticDigest(entry[0], entry[1](value));
}

export function classifyStage5SourceRef(ref, currentDigest, currentGitBlobSha) {
  if (!ref || typeof ref.path !== 'string' || typeof ref.gitBlobSha !== 'string' || !ref.semanticDigest) {
    return 'INVALID_FRESHNESS_REF';
  }
  if (!sameSemanticDigest(ref.semanticDigest, currentDigest)) return 'SEMANTIC_STALE';
  return ref.gitBlobSha === currentGitBlobSha ? 'SEMANTIC_FRESH' : 'PROVENANCE_ONLY_CHANGED';
}

export function buildStage5SourceRef({ stage, label, path, value, currentGitBlobSha, priorRef = null, legacyRef = null }) {
  const semanticDigest = buildStage5SourceDigest(stage, label, value);
  const samePrior = priorRef?.path === path
    && typeof priorRef?.gitBlobSha === 'string'
    && sameSemanticDigest(priorRef?.semanticDigest, semanticDigest);
  const ref = {
    path,
    gitBlobSha: samePrior ? priorRef.gitBlobSha : currentGitBlobSha,
    semanticDigest,
    freshnessMode: STAGE5_FRESHNESS_MODE,
  };
  if (label === 'bySoldier') {
    const priorRelationSha = samePrior && typeof priorRef?.relationSetGitBlobSha === 'string'
      ? priorRef.relationSetGitBlobSha
      : legacyRef?.relationSetGitBlobSha;
    if (typeof priorRelationSha === 'string') ref.relationSetGitBlobSha = priorRelationSha;
  }
  return ref;
}

export function projectStage5FrozenArtifact(value) {
  const { generatedAt: _generatedAt, sources: _sources, freshness: _freshness, ...semantic } = value ?? {};
  return semantic;
}

export function buildStage5ArtifactDigest(stage, role, value) {
  if (!['output', 'validation', 'releaseMetadata'].includes(role)) {
    throw new TypeError(`Unknown Soldier Stage ${stage} artifact role: ${role}`);
  }
  return buildSemanticDigest(`soldier-stage${stage}-${role}/semantic-v1`, projectStage5FrozenArtifact(value));
}

export function buildStage5FreshnessEnvelope(semanticDigest) {
  return {
    contract: FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
    freshnessMode: STAGE5_FRESHNESS_MODE,
    semanticDigest,
  };
}

export function buildStage55MembershipParity(bySoldier, relationSet) {
  const bySoldierDigest = buildStage65MembershipDigest(pairsFromBySoldierArtifact(bySoldier));
  const canonicalDigest = buildStage65MembershipDigest(pairsFromRelationArtifact(relationSet));
  return {
    projection: STAGE55_MEMBERSHIP_PROJECTION,
    bySoldierDigest,
    canonicalDigest,
    semanticMatch: sameSemanticDigest(bySoldierDigest, canonicalDigest),
  };
}
