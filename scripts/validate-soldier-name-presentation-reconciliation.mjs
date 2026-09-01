import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CHECKPOINT_PATH = 'data/validation/soldier-name-presentation-reconciliation-stage10.v1.json';
const CANONICAL_PATH = 'data/generated/soldier-list-stage5-8.v1.json';
const LOWER_PATH = 'data/presentation/soldier-lower-tier-name-kr.v1.json';
const PROVISIONAL_PATH = 'data/presentation/soldier-t3-provisional-name-kr.v1.json';
const BOUNDARY_PATH = 'data/validation/soldier-t3-provisional-name-presentation.v1.json';
const SITE_ADMISSION_PATH = 'data/validation/soldier-stage6-7-site-admission.v1.json';
const LOCALIZATION_CONTRACT_PATH = 'data/contracts/localization-audit.v1.json';
const LOCALIZATION_AUDIT_PATH = 'data/validation/localization-audit-soldier-stage2.v1.json';

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const sortedIds = (values) => [...values].map(Number).sort((a, b) => a - b);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function uniqueIndex(records, key) {
  const map = new Map();
  const duplicates = [];
  for (const record of records) {
    const value = record[key];
    if (map.has(value)) duplicates.push(value);
    else map.set(value, record);
  }
  return { map, duplicates };
}

function buildResult(inputs = {}) {
  const canonical = inputs.canonical ?? readJson(CANONICAL_PATH);
  const lower = inputs.lower ?? readJson(LOWER_PATH);
  const provisional = inputs.provisional ?? readJson(PROVISIONAL_PATH);
  const boundary = inputs.boundary ?? readJson(BOUNDARY_PATH);
  const siteAdmission = inputs.siteAdmission ?? readJson(SITE_ADMISSION_PATH);
  const localizationContract = inputs.localizationContract ?? readJson(LOCALIZATION_CONTRACT_PATH);
  const localizationAudit = inputs.localizationAudit ?? readJson(LOCALIZATION_AUDIT_PATH);

  const records = Array.isArray(canonical.records) ? canonical.records : [];
  const lowerRows = Array.isArray(lower.records) ? lower.records : [];
  const provisionalRows = Array.isArray(provisional.records) ? provisional.records : [];
  const boundaryTargets = Array.isArray(boundary.targets) ? boundary.targets : [];
  const siteReviews = Array.isArray(siteAdmission.reviews) ? siteAdmission.reviews : [];
  const auditReviews = Array.isArray(localizationAudit.reviews) ? localizationAudit.reviews : [];

  const canonicalIndex = uniqueIndex(records, 'soldierId');
  const lowerIndex = uniqueIndex(lowerRows, 'soldierId');
  const provisionalIndex = uniqueIndex(provisionalRows, 'soldierId');
  const errors = [];

  const canonicalStateConflicts = records.filter((record) => {
    const hasKr = nonEmpty(record.nameKr);
    const confirmed = record.nameKrStatus === 'confirmed';
    return (hasKr && !confirmed) || (!hasKr && confirmed);
  });

  const canonicalNameKrNullIds = sortedIds(records.filter((record) => !nonEmpty(record.nameKr)).map((record) => record.soldierId));
  const lowerIds = sortedIds(lowerRows.map((record) => record.soldierId));
  const provisionalIds = sortedIds(provisionalRows.map((record) => record.soldierId));
  const overlayCollisions = lowerIds.filter((soldierId) => provisionalIndex.map.has(soldierId));
  const overlayUnionIds = sortedIds(new Set([...lowerIds, ...provisionalIds]));
  const unknownOverlayIds = overlayUnionIds.filter((soldierId) => !canonicalIndex.map.has(soldierId));

  const lowerConfirmedCanonicalOverlapIds = lowerIds.filter((soldierId) => {
    const base = canonicalIndex.map.get(soldierId);
    return base && nonEmpty(base.nameKr) && base.nameKrStatus === 'confirmed';
  });

  const lowerEmptyNameIds = lowerRows.filter((row) => !nonEmpty(row.nameKr)).map((row) => row.soldierId);
  const lowerTierConfirmedPresentationCount = lowerRows.length - lowerEmptyNameIds.length;
  const lowerTierPresentationUnresolvedCount = lower.coverage?.unresolvedCount ?? null;

  const tier3InvalidCanonicalBoundaryIds = provisionalIds.filter((soldierId) => {
    const base = canonicalIndex.map.get(soldierId);
    return !base ||
      base.nameKr !== null ||
      base.nameKrStatus !== 'unreleased' ||
      base.validationStatus !== 'REVIEW' ||
      base.isSp !== false ||
      base.tier !== 3;
  });

  const effectiveDisplayById = new Map();
  for (const record of records) {
    const lowerRow = lowerIndex.map.get(record.soldierId);
    const provisionalRow = provisionalIndex.map.get(record.soldierId);
    const displayNameKr = lowerRow?.nameKr ?? provisionalRow?.displayNameKr ?? record.nameKr ?? null;
    effectiveDisplayById.set(record.soldierId, displayNameKr);
  }
  const displayGapIds = sortedIds(records.filter((record) => !nonEmpty(effectiveDisplayById.get(record.soldierId))).map((record) => record.soldierId));
  const effectiveKoreanDisplayCount = records.length - displayGapIds.length;

  const boundaryTargetIds = sortedIds(boundaryTargets.map((record) => record.soldierId));
  const officialKoreanNameUnresolvedCount = boundary.canonical?.officialNameUnresolvedCount ?? null;
  const tier3BoundaryTargetSetMatch = same(boundaryTargetIds, provisionalIds);
  const exactCanonicalNameKrNullOverlaySetMatch = same(canonicalNameKrNullIds, overlayUnionIds);

  const auditReviewSoldierIds = sortedIds(auditReviews
    .filter((review) => review.code === 'PROVISIONAL_UNRESOLVED')
    .map((review) => review.context?.soldierId)
    .filter((soldierId) => Number.isInteger(Number(soldierId))));

  const lowerContract = localizationContract.sources?.lowerTierPresentation;
  const lowerContractBoundaryValid =
    lowerContract?.expectedStatus === 'PASS' &&
    lowerContract?.expectedScope === 'frontend-presentation-only' &&
    lowerContract?.expectedRecordCount === 39 &&
    lowerContract?.effectiveDisplayStatus === 'confirmed-presentation' &&
    lowerContract?.identityMutationAllowed === false &&
    localizationContract.canonicalLocalizationStates?.lowerTierPresentationBackfill?.condition != null;

  const reviewCodes = [
    'HERO_PAGE_SOLDIER_DISPLAY_NAME_REVIEW',
    'IDENTITY_PRESENTATION_REVIEW',
    'KR_NAME_UNRESOLVED',
  ];
  const siteAdmissionReviewCounts = Object.fromEntries(reviewCodes.map((code) => {
    const rows = siteReviews.filter((review) => review.code === code);
    if (rows.length !== 1) errors.push(`SITE_ADMISSION_REVIEW_CARDINALITY:${code}:${rows.length}`);
    return [code, rows[0]?.count ?? null];
  }));

  if (canonicalIndex.duplicates.length) errors.push(`DUPLICATE_CANONICAL_ID:${canonicalIndex.duplicates.join(',')}`);
  if (lowerIndex.duplicates.length) errors.push(`DUPLICATE_LOWER_ID:${lowerIndex.duplicates.join(',')}`);
  if (provisionalIndex.duplicates.length) errors.push(`DUPLICATE_PROVISIONAL_ID:${provisionalIndex.duplicates.join(',')}`);
  if (canonicalStateConflicts.length) errors.push(`CANONICAL_STATE_CONFLICT:${canonicalStateConflicts.map((record) => record.soldierId).join(',')}`);
  if (lower.status !== 'PASS') errors.push(`LOWER_TIER_SOURCE_NOT_PASS:${lower.status ?? 'MISSING'}`);
  if (lower.scope !== 'frontend-presentation-only') errors.push(`LOWER_TIER_SCOPE_MISMATCH:${lower.scope ?? 'MISSING'}`);
  if (lower.coverage?.recordCount !== lowerRows.length) errors.push(`LOWER_TIER_PRESENTATION_COUNT_MISMATCH:${lower.coverage?.recordCount ?? 'MISSING'}:${lowerRows.length}`);
  if (lowerTierPresentationUnresolvedCount !== 0) errors.push(`LOWER_TIER_PRESENTATION_UNRESOLVED:${lowerTierPresentationUnresolvedCount ?? 'MISSING'}`);
  if (lowerEmptyNameIds.length) errors.push(`LOWER_TIER_EMPTY_KR_NAME:${lowerEmptyNameIds.join(',')}`);
  if (!lowerContractBoundaryValid) errors.push('LOCALIZATION_CONTRACT_LOWER_TIER_BOUNDARY_MISMATCH');
  if (overlayCollisions.length) errors.push(`OVERLAY_COLLISION:${overlayCollisions.join(',')}`);
  if (unknownOverlayIds.length) errors.push(`UNKNOWN_OVERLAY_ID:${unknownOverlayIds.join(',')}`);
  if (lowerConfirmedCanonicalOverlapIds.length) errors.push(`LOWER_CONFIRMED_CANONICAL_OVERLAP:${lowerConfirmedCanonicalOverlapIds.join(',')}`);
  if (tier3InvalidCanonicalBoundaryIds.length) errors.push(`T3_CANONICAL_BOUNDARY_MISMATCH:${tier3InvalidCanonicalBoundaryIds.join(',')}`);
  if (!exactCanonicalNameKrNullOverlaySetMatch) errors.push('CANONICAL_NAMEKR_NULL_OVERLAY_SET_MISMATCH');
  if (displayGapIds.length) errors.push(`DISPLAY_GAP:${displayGapIds.join(',')}`);
  if (!tier3BoundaryTargetSetMatch) errors.push('T3_BOUNDARY_TARGET_SET_MISMATCH');
  if (officialKoreanNameUnresolvedCount !== boundaryTargetIds.length) errors.push(`OFFICIAL_UNRESOLVED_COUNT_MISMATCH:${officialKoreanNameUnresolvedCount ?? 'MISSING'}:${boundaryTargetIds.length}`);
  if (localizationAudit.status !== 'PASS_WITH_REVIEW') errors.push(`LOCALIZATION_AUDIT_STATUS_MISMATCH:${localizationAudit.status ?? 'MISSING'}`);
  if (localizationAudit.summary?.lowerTierPresentationRecords !== lowerRows.length || localizationAudit.summary?.effectiveKoreanDisplayRecords !== records.length || localizationAudit.summary?.errors !== 0) {
    errors.push('LOCALIZATION_AUDIT_SUMMARY_MISMATCH');
  }
  if (!same(auditReviewSoldierIds, boundaryTargetIds)) errors.push('LOCALIZATION_AUDIT_REVIEW_SET_MISMATCH');

  const summary = {
    canonicalRecords: records.length,
    canonicalNameKrNullCount: canonicalNameKrNullIds.length,
    lowerTierPresentationCount: lowerRows.length,
    lowerTierConfirmedPresentationCount,
    lowerTierPresentationUnresolvedCount,
    tier3ProvisionalPresentationCount: provisionalRows.length,
    overlayUnionCount: overlayUnionIds.length,
    overlayCollisionCount: overlayCollisions.length,
    lowerTierConfirmedCanonicalOverlapCount: lowerConfirmedCanonicalOverlapIds.length,
    tier3InvalidCanonicalBoundaryCount: tier3InvalidCanonicalBoundaryIds.length,
    unknownOverlayIdCount: unknownOverlayIds.length,
    exactCanonicalNameKrNullOverlaySetMatch,
    effectiveKoreanDisplayCount,
    displayGapCount: displayGapIds.length,
    officialKoreanNameUnresolvedCount,
    officialKoreanNameUnresolvedIds: boundaryTargetIds,
    tier3BoundaryTargetSetMatch,
    canonicalStateConflictCount: canonicalStateConflicts.length,
    localizationAuditReviewCount: auditReviews.length,
    localizationAuditReviewSoldierIds: auditReviewSoldierIds,
    siteAdmissionReviewCounts,
  };

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    summary,
    canonicalNameKrNullSoldierIds: canonicalNameKrNullIds,
    officialKoreanNameUnresolvedSoldierIds: boundaryTargetIds,
    errors,
  };
}

function validateCheckpoint(result, checkpoint = readJson(CHECKPOINT_PATH)) {
  const errors = [];
  if (checkpoint.schemaId !== 'soldier-name-presentation-reconciliation-stage10/v1' || checkpoint.stage !== 10 || checkpoint.revision !== 2 || checkpoint.status !== 'PASS' || checkpoint.completion !== 'COMPLETE') {
    errors.push('CHECKPOINT_CONTRACT_MISMATCH');
  }
  if (!same(result.summary, checkpoint.expected)) errors.push('CHECKPOINT_EXPECTED_SUMMARY_MISMATCH');
  if (!same(result.canonicalNameKrNullSoldierIds, checkpoint.canonicalNameKrNullSoldierIds)) errors.push('CHECKPOINT_CANONICAL_NAMEKR_NULL_ID_SET_MISMATCH');
  if (!same(result.officialKoreanNameUnresolvedSoldierIds, checkpoint.officialKoreanNameUnresolvedSoldierIds)) errors.push('CHECKPOINT_OFFICIAL_UNRESOLVED_ID_SET_MISMATCH');
  if (checkpoint.method?.joinKey !== 'soldierId' || checkpoint.method?.exactNumericIdEqualityOnly !== true || checkpoint.method?.nameJoin !== false || checkpoint.method?.canonicalMutation !== false) {
    errors.push('CHECKPOINT_METHOD_BOUNDARY_MISMATCH');
  }
  const displayReview = checkpoint.reviewDisposition?.HERO_PAGE_SOLDIER_DISPLAY_NAME_REVIEW;
  const identityReview = checkpoint.reviewDisposition?.IDENTITY_PRESENTATION_REVIEW;
  const nameReview = checkpoint.reviewDisposition?.KR_NAME_UNRESOLVED;
  if (displayReview?.stage10Disposition !== 'RESOLVED_BY_PRESENTATION_EVIDENCE' || displayReview?.healthImpact !== false) errors.push('DISPLAY_REVIEW_DISPOSITION_MISMATCH');
  if (identityReview?.stage10Disposition !== 'BOUNDARY_NOTE' || identityReview?.healthImpact !== false) errors.push('IDENTITY_REVIEW_DISPOSITION_MISMATCH');
  if (nameReview?.stage10Disposition !== 'PARTIALLY_RESOLVED_BY_LOCALIZATION_EVIDENCE' || nameReview?.healthImpact !== true || nameReview?.reportedCount !== 41 || nameReview?.resolvedCount !== 39 || nameReview?.remainingCount !== 2 || !same(sortedIds(nameReview?.remainingSoldierIds ?? []), [136, 1039])) {
    errors.push('KR_NAME_REVIEW_DISPOSITION_MISMATCH');
  }
  if (checkpoint.nextOwner !== 'project-status') errors.push('NEXT_OWNER_MISMATCH');
  return errors;
}

function runSelfTest() {
  const canonical = readJson(CANONICAL_PATH);
  const lower = readJson(LOWER_PATH);
  const provisional = readJson(PROVISIONAL_PATH);
  const boundary = readJson(BOUNDARY_PATH);
  const siteAdmission = readJson(SITE_ADMISSION_PATH);
  const localizationContract = readJson(LOCALIZATION_CONTRACT_PATH);
  const localizationAudit = readJson(LOCALIZATION_AUDIT_PATH);
  const baseline = buildResult({ canonical, lower, provisional, boundary, siteAdmission, localizationContract, localizationAudit });
  const tests = [];

  tests.push({ name: 'current-source-pass', passed: baseline.status === 'PASS' && validateCheckpoint(baseline).length === 0 });

  const promotedCanonical = clone(canonical);
  const promotedId = baseline.canonicalNameKrNullSoldierIds[0];
  const promoted = promotedCanonical.records.find((record) => record.soldierId === promotedId);
  promoted.nameKr = '테스트';
  promoted.nameKrStatus = 'confirmed';
  promoted.validationStatus = 'PASS';
  const promotedResult = buildResult({ canonical: promotedCanonical, lower, provisional, boundary, siteAdmission, localizationContract, localizationAudit });
  tests.push({ name: 'canonical-promotion-requires-reconciliation', passed: promotedResult.status === 'FAIL' && promotedResult.errors.some((code) => code.startsWith('LOWER_CONFIRMED_CANONICAL_OVERLAP') || code === 'CANONICAL_NAMEKR_NULL_OVERLAY_SET_MISMATCH') });

  const missingLower = clone(lower);
  missingLower.records = missingLower.records.slice(1);
  const missingLowerResult = buildResult({ canonical, lower: missingLower, provisional, boundary, siteAdmission, localizationContract, localizationAudit });
  tests.push({ name: 'missing-overlay-fails-closed', passed: missingLowerResult.status === 'FAIL' && missingLowerResult.errors.some((code) => code.startsWith('LOWER_TIER_PRESENTATION_COUNT_MISMATCH') || code === 'CANONICAL_NAMEKR_NULL_OVERLAY_SET_MISMATCH') });

  const unresolvedLower = clone(lower);
  unresolvedLower.coverage.unresolvedCount = 1;
  const unresolvedLowerResult = buildResult({ canonical, lower: unresolvedLower, provisional, boundary, siteAdmission, localizationContract, localizationAudit });
  tests.push({ name: 'lower-tier-unresolved-drift-fails-closed', passed: unresolvedLowerResult.status === 'FAIL' && unresolvedLowerResult.errors.includes('LOWER_TIER_PRESENTATION_UNRESOLVED:1') });

  const changedContract = clone(localizationContract);
  changedContract.sources.lowerTierPresentation.effectiveDisplayStatus = 'provisional-display';
  const changedContractResult = buildResult({ canonical, lower, provisional, boundary, siteAdmission, localizationContract: changedContract, localizationAudit });
  tests.push({ name: 'localization-contract-drift-fails-closed', passed: changedContractResult.status === 'FAIL' && changedContractResult.errors.includes('LOCALIZATION_CONTRACT_LOWER_TIER_BOUNDARY_MISMATCH') });

  const changedAudit = clone(localizationAudit);
  changedAudit.reviews = changedAudit.reviews.slice(0, 1);
  const changedAuditResult = buildResult({ canonical, lower, provisional, boundary, siteAdmission, localizationContract, localizationAudit: changedAudit });
  tests.push({ name: 'localization-audit-review-drift-fails-closed', passed: changedAuditResult.status === 'FAIL' && changedAuditResult.errors.includes('LOCALIZATION_AUDIT_REVIEW_SET_MISMATCH') });

  const changedReview = clone(siteAdmission);
  const review = changedReview.reviews.find((row) => row.code === 'KR_NAME_UNRESOLVED');
  review.count = 40;
  const changedReviewResult = buildResult({ canonical, lower, provisional, boundary, siteAdmission: changedReview, localizationContract, localizationAudit });
  tests.push({ name: 'review-count-drift-detected-by-checkpoint', passed: changedReviewResult.status === 'PASS' && validateCheckpoint(changedReviewResult).includes('CHECKPOINT_EXPECTED_SUMMARY_MISMATCH') });

  const colliding = clone(provisional);
  colliding.records = [...colliding.records, { ...colliding.records[0], soldierId: lower.records[0].soldierId }];
  const collisionResult = buildResult({ canonical, lower, provisional: colliding, boundary, siteAdmission, localizationContract, localizationAudit });
  tests.push({ name: 'overlay-collision-fails-closed', passed: collisionResult.status === 'FAIL' && collisionResult.errors.some((code) => code.startsWith('OVERLAY_COLLISION')) });

  return {
    status: tests.every((test) => test.passed) ? 'PASS' : 'FAIL',
    tests,
  };
}

const args = new Set(process.argv.slice(2));
if (args.has('--self-test')) {
  const result = runSelfTest();
  console.log(`Soldier Name Presentation Stage 10 self-test: ${result.status} (${result.tests.filter((test) => test.passed).length}/${result.tests.length})`);
  for (const test of result.tests.filter((row) => !row.passed)) console.error(`FAILED ${test.name}`);
  if (result.status !== 'PASS') process.exit(1);
  process.exit(0);
}

const result = buildResult();
if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'PASS') process.exit(1);
  process.exit(0);
}

const checkpointErrors = validateCheckpoint(result);
if (result.status !== 'PASS' || checkpointErrors.length > 0) {
  console.error('Soldier Name Presentation Stage 10: FAIL');
  for (const error of [...result.errors, ...checkpointErrors]) console.error(error);
  process.exit(1);
}

console.log('Soldier Name Presentation Stage 10: PASS');
console.log(`canonical nameKr null ${result.summary.canonicalNameKrNullCount}; lower-tier confirmed ${result.summary.lowerTierConfirmedPresentationCount}; T3 official unresolved ${result.summary.officialKoreanNameUnresolvedCount}; display gap ${result.summary.displayGapCount}`);
console.log('review disposition: display gap RESOLVED_BY_PRESENTATION_EVIDENCE; identity/presentation BOUNDARY_NOTE; KR_NAME_UNRESOLVED reported 41 / resolved 39 / remaining 2');
