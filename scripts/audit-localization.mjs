import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/localization-audit.v1.json';
const EXPECTED_PATH = 'data/validation/localization-audit-soldier-stage2.v1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fail(code, message, context = {}) {
  return { severity: 'FAIL', code, message, context };
}

function review(code, message, context = {}) {
  return { severity: 'REVIEW', code, message, context };
}

function uniqueBy(records, key) {
  const seen = new Map();
  const duplicates = [];
  for (const record of records) {
    const value = record[key];
    if (seen.has(value)) duplicates.push(value);
    else seen.set(value, record);
  }
  return { map: seen, duplicates };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeDisplay(value) {
  return nonEmptyString(value) ? value.trim().replace(/\s+/g, ' ') : null;
}

function loadInputs() {
  const contract = readJson(CONTRACT_PATH);
  return {
    contract,
    canonical: readJson(contract.sources.canonicalSoldierList.path),
    lower: readJson(contract.sources.lowerTierPresentation.path),
    provisional: readJson(contract.sources.tier3ProvisionalPresentation.path),
    boundaryValidation: readJson(contract.sources.tier3ProvisionalValidation.path),
  };
}

function auditSoldierLocalization(input = loadInputs()) {
  const { contract, canonical, lower, provisional, boundaryValidation } = input;
  const errors = [];
  const reviews = [];

  if (
    contract.schemaId !== 'localization-audit-contract/v1' ||
    contract.stage !== '0' ||
    contract.status !== 'FROZEN' ||
    contract.scope?.mode !== 'READ_ONLY_AUDIT' ||
    contract.scope?.initialEntity !== 'Soldier'
  ) {
    errors.push(fail('CONTRACT_MISMATCH', 'Stage 0 localization audit contract is not the expected frozen Soldier read-only contract.'));
  }

  const canonicalRecords = Array.isArray(canonical.records) ? canonical.records : [];
  const lowerRecords = Array.isArray(lower.records) ? lower.records : [];
  const provisionalRecords = Array.isArray(provisional.records) ? provisional.records : [];

  const canonicalIndex = uniqueBy(canonicalRecords, 'soldierId');
  const lowerIndex = uniqueBy(lowerRecords, 'soldierId');
  const provisionalIndex = uniqueBy(provisionalRecords, 'soldierId');
  const boundaryTargetIds = new Set(
    Array.isArray(boundaryValidation.targets)
      ? boundaryValidation.targets.map((record) => record.soldierId)
      : [],
  );

  const expectedCanonicalCount = contract.sources.canonicalSoldierList.expectedRecordCount;
  if (canonicalRecords.length !== expectedCanonicalCount) {
    errors.push(fail('CANONICAL_COUNT_MISMATCH', `Canonical Soldier count ${canonicalRecords.length} != ${expectedCanonicalCount}.`));
  }
  if (canonicalIndex.duplicates.length) {
    errors.push(fail('DUPLICATE_CANONICAL_ID', 'Canonical Soldier IDs are not unique.', { soldierIds: canonicalIndex.duplicates }));
  }

  let canonicalStateConflicts = 0;
  for (const record of canonicalRecords) {
    const hasKr = nonEmptyString(record.nameKr);
    const isConfirmed = record.nameKrStatus === 'confirmed';
    if ((hasKr && !isConfirmed) || (!hasKr && isConfirmed)) {
      canonicalStateConflicts += 1;
      errors.push(fail('CANONICAL_LOCALIZATION_STATE_CONFLICT', `Canonical Korean name/status mismatch for Soldier ${record.soldierId}.`, {
        soldierId: record.soldierId,
        nameKr: record.nameKr,
        nameKrStatus: record.nameKrStatus,
        validationStatus: record.validationStatus,
      }));
    }
  }

  const expectedLowerCount = contract.sources.lowerTierPresentation.expectedRecordCount;
  if (
    lower.status !== contract.sources.lowerTierPresentation.expectedStatus ||
    lower.scope !== contract.sources.lowerTierPresentation.expectedScope ||
    lower.source?.identityMutation !== false ||
    lowerRecords.length !== expectedLowerCount
  ) {
    errors.push(fail('LOWER_TIER_SOURCE_CONTRACT_MISMATCH', 'Tier 1-2 Korean presentation source does not match the frozen contract.'));
  }
  if (lowerIndex.duplicates.length) {
    errors.push(fail('DUPLICATE_PRESENTATION_ID', 'Tier 1-2 presentation source contains duplicate Soldier IDs.', { soldierIds: lowerIndex.duplicates }));
  }

  let staleConfirmedOverlayCount = 0;
  for (const record of lowerRecords) {
    const base = canonicalIndex.map.get(record.soldierId);
    if (!base) {
      errors.push(fail('UNKNOWN_CANONICAL_ID', `Tier 1-2 presentation Soldier ${record.soldierId} does not exist in canonical Soldier list.`));
      continue;
    }
    if (
      base.isSp ||
      (base.tier !== 1 && base.tier !== 2) ||
      record.tier !== base.tier ||
      record.nameCn !== base.nameCn
    ) {
      errors.push(fail('IDENTITY_MISMATCH', `Tier 1-2 presentation identity mismatch for Soldier ${record.soldierId}.`, {
        canonical: { tier: base.tier, nameCn: base.nameCn, isSp: base.isSp },
        presentation: { tier: record.tier, nameCn: record.nameCn },
      }));
    }
    if (!nonEmptyString(record.nameKr)) {
      errors.push(fail('MISSING_DISPLAY', `Tier 1-2 presentation Soldier ${record.soldierId} has an empty Korean display name.`));
    }
    if (nonEmptyString(base.nameKr) && base.nameKrStatus === 'confirmed') {
      staleConfirmedOverlayCount += 1;
      reviews.push(review('STALE_CONFIRMED_OVERLAY', `Tier 1-2 Soldier ${record.soldierId} has both a confirmed canonical Korean name and a presentation backfill.`, {
        soldierId: record.soldierId,
        canonicalNameKr: base.nameKr,
        presentationNameKr: record.nameKr,
      }));
    }
  }

  const lowerCanonicalCount = canonicalRecords.filter(
    (record) => !record.isSp && (record.tier === 1 || record.tier === 2),
  ).length;
  if (lowerCanonicalCount !== expectedLowerCount) {
    errors.push(fail('LOWER_TIER_CANONICAL_COVERAGE_MISMATCH', `Canonical tier 1-2 Soldier count ${lowerCanonicalCount} != ${expectedLowerCount}.`));
  }
  for (const base of canonicalRecords) {
    if (!base.isSp && (base.tier === 1 || base.tier === 2) && !lowerIndex.map.has(base.soldierId)) {
      errors.push(fail('MISSING_DISPLAY', `Missing required tier 1-2 Korean presentation mapping for Soldier ${base.soldierId}.`));
    }
  }

  const expectedProvisionalCount = contract.sources.tier3ProvisionalPresentation.expectedRecordCount;
  if (
    provisional.status !== contract.sources.tier3ProvisionalPresentation.expectedStatus ||
    provisional.scope !== contract.sources.tier3ProvisionalPresentation.expectedScope ||
    provisional.source?.officialKoreanNameConfirmed !== false ||
    provisional.source?.identityMutation !== false ||
    provisionalRecords.length !== expectedProvisionalCount
  ) {
    errors.push(fail('PROVISIONAL_SOURCE_CONTRACT_MISMATCH', 'Tier 3 provisional Korean presentation source does not match the frozen contract.'));
  }
  if (provisionalIndex.duplicates.length) {
    errors.push(fail('DUPLICATE_PRESENTATION_ID', 'Tier 3 provisional presentation source contains duplicate Soldier IDs.', { soldierIds: provisionalIndex.duplicates }));
  }

  let invalidPromotionCount = 0;
  let staleProvisionalCount = 0;
  for (const record of provisionalRecords) {
    const base = canonicalIndex.map.get(record.soldierId);
    if (!base) {
      errors.push(fail('UNKNOWN_CANONICAL_ID', `Tier 3 provisional Soldier ${record.soldierId} does not exist in canonical Soldier list.`));
      continue;
    }
    if (
      base.isSp ||
      base.tier !== 3 ||
      record.tier !== 3 ||
      record.nameCn !== base.nameCn ||
      record.armyType !== base.armyType ||
      record.status !== contract.sources.tier3ProvisionalPresentation.requiredRecordStatus
    ) {
      errors.push(fail('IDENTITY_MISMATCH', `Tier 3 provisional presentation identity mismatch for Soldier ${record.soldierId}.`, {
        canonical: { tier: base.tier, nameCn: base.nameCn, armyType: base.armyType, isSp: base.isSp },
        presentation: { tier: record.tier, nameCn: record.nameCn, armyType: record.armyType, status: record.status },
      }));
    }
    if (!nonEmptyString(record.displayNameKr)) {
      errors.push(fail('MISSING_DISPLAY', `Tier 3 provisional Soldier ${record.soldierId} has an empty Korean display name.`));
    }

    const stillUnresolved =
      base.nameKr === null &&
      base.nameKrStatus === 'unreleased' &&
      base.validationStatus === 'REVIEW';
    const looksOfficiallyConfirmed =
      nonEmptyString(base.nameKr) &&
      base.nameKrStatus === 'confirmed' &&
      base.validationStatus === 'PASS';

    if (stillUnresolved) {
      reviews.push(review('PROVISIONAL_UNRESOLVED', `Tier 3 Soldier ${record.soldierId} uses an approved provisional Korean display name while the official Korean server name remains unresolved.`, {
        soldierId: record.soldierId,
        nameCn: record.nameCn,
        displayNameKr: record.displayNameKr,
      }));
    } else if (looksOfficiallyConfirmed && !boundaryTargetIds.has(record.soldierId)) {
      staleProvisionalCount += 1;
      reviews.push(review('STALE_PROVISIONAL', `Tier 3 Soldier ${record.soldierId} is canonically confirmed but a provisional presentation overlay still remains.`, {
        soldierId: record.soldierId,
        canonicalNameKr: base.nameKr,
        provisionalDisplayNameKr: record.displayNameKr,
      }));
    } else {
      invalidPromotionCount += 1;
      errors.push(fail('INVALID_PROMOTION', `Tier 3 provisional Soldier ${record.soldierId} left the frozen null/unreleased/REVIEW canonical boundary without an approved transition.`, {
        soldierId: record.soldierId,
        nameKr: base.nameKr,
        nameKrStatus: base.nameKrStatus,
        validationStatus: base.validationStatus,
      }));
    }
  }

  const overlayCollisions = lowerRecords
    .map((record) => record.soldierId)
    .filter((soldierId) => provisionalIndex.map.has(soldierId));
  if (overlayCollisions.length) {
    errors.push(fail('OVERLAY_COLLISION', 'A Soldier ID appears in both presentation overlays.', { soldierIds: overlayCollisions }));
  }

  const expectedTier3Confirmed = contract.baseline?.tier3ConfirmedKoreanNames;
  const tier3ConfirmedCanonical = canonicalRecords.filter(
    (record) => !record.isSp && record.tier === 3 && nonEmptyString(record.nameKr) && record.nameKrStatus === 'confirmed',
  ).length;
  if (Number.isInteger(expectedTier3Confirmed) && tier3ConfirmedCanonical !== expectedTier3Confirmed) {
    errors.push(fail('T3_CONFIRMED_COVERAGE_MISMATCH', `Confirmed canonical tier-3 Korean names ${tier3ConfirmedCanonical} != ${expectedTier3Confirmed}.`));
  }

  const effectiveRecords = canonicalRecords.map((base) => {
    const lowerPresentation = lowerIndex.map.get(base.soldierId);
    const provisionalPresentation = provisionalIndex.map.get(base.soldierId);
    const displayNameKr = lowerPresentation?.nameKr ?? provisionalPresentation?.displayNameKr ?? base.nameKr ?? null;
    const displayStatus = lowerPresentation
      ? contract.sources.lowerTierPresentation.effectiveDisplayStatus
      : provisionalPresentation
        ? contract.sources.tier3ProvisionalPresentation.effectiveDisplayStatus
        : base.nameKrStatus;
    return {
      soldierId: base.soldierId,
      nameCn: base.nameCn,
      displayNameKr,
      displayStatus,
      source: lowerPresentation ? 'lower-tier-presentation' : provisionalPresentation ? 'tier3-provisional-presentation' : 'canonical',
    };
  });

  const missingEffectiveDisplay = effectiveRecords.filter((record) => !nonEmptyString(record.displayNameKr));
  if (missingEffectiveDisplay.length) {
    errors.push(fail('MISSING_DISPLAY', 'One or more canonical Soldiers have no effective Korean display name.', {
      soldierIds: missingEffectiveDisplay.map((record) => record.soldierId),
    }));
  }

  const displayGroups = new Map();
  for (const record of effectiveRecords) {
    const normalized = normalizeDisplay(record.displayNameKr);
    if (!normalized) continue;
    if (!displayGroups.has(normalized)) displayGroups.set(normalized, []);
    displayGroups.get(normalized).push(record);
  }
  const duplicateKrGroups = [...displayGroups.entries()]
    .filter(([, records]) => records.length > 1)
    .map(([nameKr, records]) => ({
      nameKr,
      soldierIds: records.map((record) => record.soldierId).sort((a, b) => a - b),
      sources: records.map((record) => record.source),
    }))
    .sort((a, b) => a.nameKr.localeCompare(b.nameKr, 'ko'));
  for (const group of duplicateKrGroups) {
    reviews.push(review('DUPLICATE_KR_NAME', `Multiple Soldier IDs resolve to the same effective Korean display name: ${group.nameKr}.`, group));
  }

  if (boundaryValidation.status !== contract.sources.tier3ProvisionalValidation.expectedStatus) {
    errors.push(fail('BOUNDARY_VALIDATION_MISMATCH', 'Existing tier-3 provisional boundary validation is not PASS.'));
  }

  const checks = {
    contractFrozen: contract.status === 'FROZEN',
    canonicalCountMatches: canonicalRecords.length === expectedCanonicalCount,
    canonicalIdsUnique: canonicalIndex.duplicates.length === 0,
    canonicalLocalizationStateConflicts: canonicalStateConflicts,
    lowerTierCoverageMatches: lowerRecords.length === expectedLowerCount && lowerCanonicalCount === expectedLowerCount,
    lowerTierIdsUnique: lowerIndex.duplicates.length === 0,
    staleConfirmedOverlayCount,
    provisionalCoverageMatches: provisionalRecords.length === expectedProvisionalCount,
    provisionalIdsUnique: provisionalIndex.duplicates.length === 0,
    invalidPromotionCount,
    staleProvisionalCount,
    overlayCollisionCount: overlayCollisions.length,
    tier3ConfirmedCanonical,
    effectiveDisplayCount: effectiveRecords.length - missingEffectiveDisplay.length,
    missingEffectiveDisplayCount: missingEffectiveDisplay.length,
    duplicateKrNameGroups: duplicateKrGroups.length,
    provisionalBoundaryValidationPass: boundaryValidation.status === contract.sources.tier3ProvisionalValidation.expectedStatus,
    readOnlyExecution: true,
  };

  const status = errors.length > 0 ? 'FAIL' : reviews.length > 0 ? 'PASS_WITH_REVIEW' : 'PASS';

  return {
    version: 1,
    schemaId: 'localization-audit-soldier-stage2/v1',
    stage: 2,
    entity: 'Soldier',
    status,
    mode: 'READ_ONLY_AUDIT',
    sources: {
      contract: CONTRACT_PATH,
      canonical: contract.sources.canonicalSoldierList.path,
      lowerTierPresentation: contract.sources.lowerTierPresentation.path,
      tier3ProvisionalPresentation: contract.sources.tier3ProvisionalPresentation.path,
      tier3ProvisionalValidation: contract.sources.tier3ProvisionalValidation.path,
    },
    summary: {
      canonicalRecords: canonicalRecords.length,
      canonicalUniqueIds: canonicalIndex.map.size,
      normalRecords: canonical.summary?.normalCount ?? null,
      spRecords: canonical.summary?.spCount ?? null,
      normalTier3Records: canonical.summary?.normalTier3Count ?? null,
      tier3ConfirmedCanonical,
      lowerTierCanonicalRecords: lowerCanonicalCount,
      lowerTierPresentationRecords: lowerRecords.length,
      tier3ProvisionalPresentationRecords: provisionalRecords.length,
      effectiveKoreanDisplayRecords: effectiveRecords.length - missingEffectiveDisplay.length,
      canonicalStateConflicts,
      staleConfirmedOverlays: staleConfirmedOverlayCount,
      invalidPromotions: invalidPromotionCount,
      staleProvisionals: staleProvisionalCount,
      overlayCollisions: overlayCollisions.length,
      duplicateKrNameGroups: duplicateKrGroups.length,
      errors: errors.length,
      reviews: reviews.length,
    },
    checks,
    errors,
    reviews,
  };
}

function hasIssue(result, severity, code) {
  const bucket = severity === 'FAIL' ? result.errors : result.reviews;
  return bucket.some((issue) => issue.code === code);
}

function runSelfTests() {
  const base = loadInputs();
  const tests = [];

  const invalidPromotion = clone(base);
  const promoted = invalidPromotion.canonical.records.find((record) => record.soldierId === 136);
  promoted.nameKr = '잿빛 호위대';
  promoted.nameKrStatus = 'confirmed';
  promoted.validationStatus = 'PASS';
  tests.push({
    name: 'invalid-promotion',
    pass: hasIssue(auditSoldierLocalization(invalidPromotion), 'FAIL', 'INVALID_PROMOTION'),
  });

  const identityMismatch = clone(base);
  identityMismatch.lower.records[0].nameCn = '__BROKEN_CN__';
  tests.push({
    name: 'identity-mismatch',
    pass: hasIssue(auditSoldierLocalization(identityMismatch), 'FAIL', 'IDENTITY_MISMATCH'),
  });

  const duplicateId = clone(base);
  duplicateId.lower.records.push(clone(duplicateId.lower.records[0]));
  duplicateId.contract.sources.lowerTierPresentation.expectedRecordCount += 1;
  tests.push({
    name: 'duplicate-presentation-id',
    pass: hasIssue(auditSoldierLocalization(duplicateId), 'FAIL', 'DUPLICATE_PRESENTATION_ID'),
  });

  const missingDisplay = clone(base);
  missingDisplay.lower.records[0].nameKr = '';
  tests.push({
    name: 'missing-display',
    pass: hasIssue(auditSoldierLocalization(missingDisplay), 'FAIL', 'MISSING_DISPLAY'),
  });

  const stateConflict = clone(base);
  const stateTarget = stateConflict.canonical.records.find((record) => record.nameKrStatus === 'confirmed' && nonEmptyString(record.nameKr));
  stateTarget.nameKrStatus = 'pending';
  tests.push({
    name: 'canonical-state-conflict',
    pass: hasIssue(auditSoldierLocalization(stateConflict), 'FAIL', 'CANONICAL_LOCALIZATION_STATE_CONFLICT'),
  });

  const duplicateName = clone(base);
  duplicateName.lower.records[1].nameKr = duplicateName.lower.records[0].nameKr;
  tests.push({
    name: 'duplicate-korean-name',
    pass: hasIssue(auditSoldierLocalization(duplicateName), 'REVIEW', 'DUPLICATE_KR_NAME'),
  });

  const failed = tests.filter((test) => !test.pass);
  return { status: failed.length ? 'FAIL' : 'PASS', total: tests.length, passed: tests.length - failed.length, failed };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

const args = new Set(process.argv.slice(2));

if (args.has('--self-test')) {
  const selfTest = runSelfTests();
  console.log(`Localization Audit Stage 2 self-test: ${selfTest.status} (${selfTest.passed}/${selfTest.total})`);
  if (selfTest.failed.length) console.error(JSON.stringify(selfTest.failed, null, 2));
  if (selfTest.status === 'FAIL') process.exit(1);
  process.exit(0);
}

const result = auditSoldierLocalization();

if (args.has('--check')) {
  const expected = readJson(EXPECTED_PATH);
  if (JSON.stringify(stable(result)) !== JSON.stringify(stable(expected))) {
    console.error('Localization audit Stage 2 snapshot mismatch.');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(`Localization Audit Stage 2: ${result.status}`);
  console.log(`Soldier ${result.summary.canonicalRecords}, display ${result.summary.effectiveKoreanDisplayRecords}, errors ${result.summary.errors}, reviews ${result.summary.reviews}`);
} else if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`LOCALIZATION AUDIT — ${result.entity} / Stage 2`);
  console.log(`status: ${result.status}`);
  console.log(`canonical: ${result.summary.canonicalRecords}`);
  console.log(`effective Korean display: ${result.summary.effectiveKoreanDisplayRecords}`);
  console.log(`T3 confirmed canonical: ${result.summary.tier3ConfirmedCanonical}`);
  console.log(`lower-tier presentation: ${result.summary.lowerTierPresentationRecords}`);
  console.log(`T3 provisional presentation: ${result.summary.tier3ProvisionalPresentationRecords}`);
  console.log(`errors: ${result.summary.errors}`);
  console.log(`reviews: ${result.summary.reviews}`);
}

if (result.status === 'FAIL') process.exit(1);
