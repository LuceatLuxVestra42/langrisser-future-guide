export const EXTERNAL_SOURCE_PRIORITY = Object.freeze([
  'BILIBILI_WIKI_PUBLIC_ORIGINAL',
  'LEGACY_KR_SHEET_ASSET_DRIVE',
  'OTHER_EXTERNAL_IMAGE_SOURCE',
]);

const PROJECT_STATUSES = new Set(['NOT_CHECKED', 'NOT_FOUND', 'RESOLVED']);
const INTAKE_STATUSES = new Set(['NOT_RUN', 'PENDING', 'RESOLVED']);
const EXTERNAL_ATTEMPT_STATUSES = new Set(['NOT_FOUND', 'REJECTED', 'CANDIDATE']);

const isNonEmpty = value => typeof value === 'string' && value.trim().length > 0;

export function validateRoutingRequest(request) {
  const errors = [];
  if (!request || typeof request !== 'object' || Array.isArray(request)) return ['request must be an object'];
  if (!isNonEmpty(request.requestId)) errors.push('requestId must be a non-empty string');
  if (!request.canonicalKey || typeof request.canonicalKey !== 'object') errors.push('canonicalKey is required');
  else {
    if (!isNonEmpty(request.canonicalKey.domain)) errors.push('canonicalKey.domain must be a non-empty string');
    if (!isNonEmpty(request.canonicalKey.assetKind)) errors.push('canonicalKey.assetKind must be a non-empty string');
    if (!['string', 'number'].includes(typeof request.canonicalKey.value)) errors.push('canonicalKey.value must be a string or number');
  }

  const project = request.projectLookup ?? {};
  const intake = request.assetIntake ?? {};
  const attempts = request.externalAttempts ?? [];
  if (!PROJECT_STATUSES.has(project.status)) errors.push('projectLookup.status is invalid');
  if (!INTAKE_STATUSES.has(intake.status)) errors.push('assetIntake.status is invalid');
  if (!Array.isArray(attempts)) errors.push('externalAttempts must be an array');
  if (errors.length) return errors;

  if (project.status === 'NOT_CHECKED') {
    if (intake.status !== 'NOT_RUN') errors.push('Asset Intake cannot run before project evidence lookup');
    if (attempts.length) errors.push('external search cannot run before project evidence lookup');
  }
  if (project.status === 'RESOLVED') {
    if (project.provenanceVerified !== true) errors.push('resolved project evidence requires provenanceVerified=true');
    if (project.canonicalIdEvidenceVerified !== true) errors.push('resolved project evidence requires canonicalIdEvidenceVerified=true');
    if (!isNonEmpty(project.evidenceRef)) errors.push('resolved project evidence requires evidenceRef');
    if (intake.status !== 'NOT_RUN') errors.push('Asset Intake must not replace already resolved project evidence');
    if (attempts.length) errors.push('external search must not run when project evidence is resolved');
  }
  if (project.status === 'NOT_FOUND' && intake.status === 'RESOLVED') {
    if (intake.contractEvidenceValidated !== true) errors.push('resolved Asset Intake result requires contractEvidenceValidated=true');
    if (!isNonEmpty(intake.resultRef)) errors.push('resolved Asset Intake result requires resultRef');
  }
  if (attempts.length && !(project.status === 'NOT_FOUND' && intake.status === 'PENDING')) {
    errors.push('external search is allowed only after project NOT_FOUND and Asset Intake PENDING');
  }

  const seen = new Set();
  attempts.forEach((attempt, index) => {
    if (!attempt || typeof attempt !== 'object') {
      errors.push(`externalAttempts[${index}] must be an object`);
      return;
    }
    const expectedSource = EXTERNAL_SOURCE_PRIORITY[index];
    if (attempt.sourceKey !== expectedSource) errors.push(`externalAttempts[${index}].sourceKey must be ${expectedSource ?? 'absent'}`);
    if (seen.has(attempt.sourceKey)) errors.push(`duplicate external source attempt: ${attempt.sourceKey}`);
    seen.add(attempt.sourceKey);
    if (!EXTERNAL_ATTEMPT_STATUSES.has(attempt.status)) errors.push(`externalAttempts[${index}].status is invalid`);
    if (attempt.status === 'CANDIDATE') {
      if (index !== attempts.length - 1) errors.push('CANDIDATE must be the last external attempt');
      if (!isNonEmpty(attempt.sourceRef)) errors.push('external CANDIDATE requires sourceRef');
    }
  });
  if (attempts.length > EXTERNAL_SOURCE_PRIORITY.length) errors.push('externalAttempts exceeds approved source priority');
  return errors;
}

function decision(action, reason, { terminal = false, sourceKey = null } = {}) {
  return { action, terminal, sourceKey, reason };
}

export function routeAssetRequest(request) {
  const errors = validateRoutingRequest(request);
  if (errors.length) {
    return {
      version: 1,
      schemaId: 'asset-intake-operational-route/v1',
      status: 'INVALID_ROUTING_REQUEST',
      exitCode: 2,
      requestId: request?.requestId ?? null,
      errors,
    };
  }

  const project = request.projectLookup;
  const intake = request.assetIntake;
  const attempts = request.externalAttempts;
  let next;

  if (project.status === 'NOT_CHECKED') {
    next = decision('CHECK_PROJECT_FROZEN_GENERATED', 'Project provenance+ID-verified frozen/generated evidence is the first required lookup.');
  } else if (project.status === 'RESOLVED') {
    next = decision('USE_PROJECT_VERIFIED_ASSET', 'Verified project evidence already resolves the asset request.', { terminal: true });
  } else if (intake.status === 'NOT_RUN') {
    next = decision('RUN_ASSET_INTAKE', 'Project evidence did not resolve the asset; Asset Intake must run before any external search.');
  } else if (intake.status === 'RESOLVED') {
    next = decision('USE_ASSET_INTAKE_RESOLVED_ASSET', 'Asset Intake returned validated contract evidence.', { terminal: true });
  } else {
    const lastAttempt = attempts.at(-1);
    if (lastAttempt?.status === 'CANDIDATE') {
      const verified = lastAttempt.provenanceVerified === true && lastAttempt.canonicalIdEvidenceVerified === true;
      next = verified
        ? decision('INGEST_EXTERNAL_EVIDENCE_TO_ASSET_INTAKE', 'External candidate has provenance and canonical ID evidence; it must re-enter Asset Intake before use.', { sourceKey: lastAttempt.sourceKey })
        : decision('REJECT_EXTERNAL_CANDIDATE', 'External candidate is missing provenance or canonical ID evidence and cannot be used.', { sourceKey: lastAttempt.sourceKey });
    } else {
      const sourceKey = EXTERNAL_SOURCE_PRIORITY[attempts.length] ?? null;
      next = sourceKey
        ? decision('CHECK_APPROVED_EXTERNAL_SOURCE', 'Asset Intake is still PENDING; check the next approved external source in priority order.', { sourceKey })
        : decision('BLOCKED_NO_VERIFIED_ASSET', 'All approved external sources are exhausted without verified evidence.', { terminal: true });
    }
  }

  return {
    version: 1,
    schemaId: 'asset-intake-operational-route/v1',
    status: 'ROUTE_READY',
    exitCode: 0,
    requestId: request.requestId,
    canonicalKey: request.canonicalKey,
    decision: next,
    guardrails: {
      directExternalProductionUse: false,
      externalSearchRequiresAssetIntakePending: true,
      verifiedExternalCandidateReturnsToAssetIntake: true,
      semanticRecomputation: false,
      nameJoin: false,
      idArithmetic: false,
      fuzzyMatching: false,
    },
  };
}

export const stableRoutingJson = document => `${JSON.stringify(document, null, 2)}\n`;
