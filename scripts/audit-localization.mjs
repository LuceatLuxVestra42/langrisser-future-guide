import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/localization-audit.v1.json';
const EXPECTED_PATH = 'data/validation/localization-audit-soldier-stage1.v1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
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

function auditSoldierLocalization() {
  const contract = readJson(CONTRACT_PATH);
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

  const canonicalPath = contract.sources?.canonicalSoldierList?.path;
  const lowerPath = contract.sources?.lowerTierPresentation?.path;
  const provisionalPath = contract.sources?.tier3ProvisionalPresentation?.path;
  const boundaryValidationPath = contract.sources?.tier3ProvisionalValidation?.path;

  const canonical = readJson(canonicalPath);
  const lower = readJson(lowerPath);
  const provisional = readJson(provisionalPath);
  const boundaryValidation = readJson(boundaryValidationPath);

  const canonicalRecords = Array.isArray(canonical.records) ? canonical.records : [];
  const lowerRecords = Array.isArray(lower.records) ? lower.records : [];
  const provisionalRecords = Array.isArray(provisional.records) ? provisional.records : [];

  const canonicalIndex = uniqueBy(canonicalRecords, 'soldierId');
  const lowerIndex = uniqueBy(lowerRecords, 'soldierId');
  const provisionalIndex = uniqueBy(provisionalRecords, 'soldierId');

  const expectedCanonicalCount = contract.sources.canonicalSoldierList.expectedRecordCount;
  if (canonicalRecords.length !== expectedCanonicalCount) {
    errors.push(fail('CANONICAL_COUNT_MISMATCH', `Canonical Soldier count ${canonicalRecords.length} != ${expectedCanonicalCount}.`));
  }
  if (canonicalIndex.duplicates.length) {
    errors.push(fail('DUPLICATE_CANONICAL_ID', 'Canonical Soldier IDs are not unique.', { soldierIds: canonicalIndex.duplicates }));
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
    if (typeof record.nameKr !== 'string' || !record.nameKr.trim()) {
      errors.push(fail('MISSING_DISPLAY', `Tier 1-2 presentation Soldier ${record.soldierId} has an empty Korean display name.`));
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
    if (typeof record.displayNameKr !== 'string' || !record.displayNameKr.trim()) {
      errors.push(fail('MISSING_DISPLAY', `Tier 3 provisional Soldier ${record.soldierId} has an empty Korean display name.`));
    }
    if (
      base.nameKr !== null ||
      base.nameKrStatus !== 'unreleased' ||
      base.validationStatus !== 'REVIEW'
    ) {
      errors.push(fail('INVALID_PROMOTION', `Tier 3 provisional Soldier ${record.soldierId} was promoted into canonical Korean-name state.`, {
        nameKr: base.nameKr,
        nameKrStatus: base.nameKrStatus,
        validationStatus: base.validationStatus,
      }));
    } else {
      reviews.push(review('PROVISIONAL_UNRESOLVED', `Tier 3 Soldier ${record.soldierId} uses an approved provisional Korean display name while the official Korean server name remains unresolved.`, {
        soldierId: record.soldierId,
        nameCn: record.nameCn,
        displayNameKr: record.displayNameKr,
      }));
    }
  }

  const overlayCollisions = lowerRecords
    .map((record) => record.soldierId)
    .filter((soldierId) => provisionalIndex.map.has(soldierId));
  if (overlayCollisions.length) {
    errors.push(fail('OVERLAY_COLLISION', 'A Soldier ID appears in both presentation overlays.', { soldierIds: overlayCollisions }));
  }

  if (boundaryValidation.status !== contract.sources.tier3ProvisionalValidation.expectedStatus) {
    errors.push(fail('BOUNDARY_VALIDATION_MISMATCH', 'Existing tier-3 provisional boundary validation is not PASS.'));
  }

  const checks = {
    contractFrozen: contract.status === 'FROZEN',
    canonicalCountMatches: canonicalRecords.length === expectedCanonicalCount,
    canonicalIdsUnique: canonicalIndex.duplicates.length === 0,
    lowerTierCoverageMatches: lowerRecords.length === expectedLowerCount && lowerCanonicalCount === expectedLowerCount,
    lowerTierIdsUnique: lowerIndex.duplicates.length === 0,
    provisionalCoverageMatches: provisionalRecords.length === expectedProvisionalCount,
    provisionalIdsUnique: provisionalIndex.duplicates.length === 0,
    overlayCollisionCount: overlayCollisions.length,
    provisionalBoundaryValidationPass: boundaryValidation.status === contract.sources.tier3ProvisionalValidation.expectedStatus,
    readOnlyExecution: true,
  };

  const status = errors.length > 0 ? 'FAIL' : reviews.length > 0 ? 'PASS_WITH_REVIEW' : 'PASS';

  return {
    version: 1,
    schemaId: 'localization-audit-soldier-stage1/v1',
    stage: 1,
    entity: 'Soldier',
    status,
    mode: 'READ_ONLY_AUDIT',
    sources: {
      contract: CONTRACT_PATH,
      canonical: canonicalPath,
      lowerTierPresentation: lowerPath,
      tier3ProvisionalPresentation: provisionalPath,
      tier3ProvisionalValidation: boundaryValidationPath,
    },
    summary: {
      canonicalRecords: canonicalRecords.length,
      canonicalUniqueIds: canonicalIndex.map.size,
      normalRecords: canonical.summary?.normalCount ?? null,
      spRecords: canonical.summary?.spCount ?? null,
      normalTier3Records: canonical.summary?.normalTier3Count ?? null,
      lowerTierCanonicalRecords: lowerCanonicalCount,
      lowerTierPresentationRecords: lowerRecords.length,
      tier3ProvisionalPresentationRecords: provisionalRecords.length,
      overlayCollisions: overlayCollisions.length,
      errors: errors.length,
      reviews: reviews.length,
    },
    checks,
    errors,
    reviews,
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

const args = new Set(process.argv.slice(2));
const result = auditSoldierLocalization();

if (args.has('--check')) {
  const expected = readJson(EXPECTED_PATH);
  if (JSON.stringify(stable(result)) !== JSON.stringify(stable(expected))) {
    console.error('Localization audit snapshot mismatch.');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(`Localization Audit Stage 1: ${result.status}`);
  console.log(`Soldier ${result.summary.canonicalRecords}, errors ${result.summary.errors}, reviews ${result.summary.reviews}`);
} else if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`LOCALIZATION AUDIT — ${result.entity}`);
  console.log(`status: ${result.status}`);
  console.log(`canonical: ${result.summary.canonicalRecords}`);
  console.log(`lower-tier presentation: ${result.summary.lowerTierPresentationRecords}`);
  console.log(`T3 provisional presentation: ${result.summary.tier3ProvisionalPresentationRecords}`);
  console.log(`errors: ${result.summary.errors}`);
  console.log(`reviews: ${result.summary.reviews}`);
}

if (result.status === 'FAIL') process.exit(1);
