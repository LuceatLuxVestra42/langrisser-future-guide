const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  checkpoint: 'data/validation/soldier-stage6-0-checkpoint.v1.json',
  fullRecords: 'data/generated/soldier-stage6-1-full-records.v1.json',
  fullValidation: 'data/validation/soldier-stage6-1-full-records.v1.json',
  stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
  abilityValidation: 'data/validation/soldier-stage5-3-ability.v1.json',
  spValidation: 'data/validation/soldier-stage5-6-sp-detail.v1.json',
  relationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
  output: 'data/generated/soldier-stage6-2-classification.v1.json',
  validation: 'data/validation/soldier-stage6-2-classification.v1.json',
};

function abs(p) { return path.join(rootDir, p); }
function loadJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, value) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n');
}
function gitBlobSha(p) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${p}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function nonZeroChecks(obj) {
  return Object.entries(obj?.checks ?? {})
    .filter(([, value]) => typeof value === 'number' && value !== 0)
    .map(([key, value]) => ({ key, value }));
}
function addIds(set, values) {
  if (!Array.isArray(values)) return;
  for (const value of values) if (Number.isInteger(value)) set.add(value);
}

function main() {
  const checkpoint = loadJson(paths.checkpoint);
  const full = loadJson(paths.fullRecords);
  const fullValidation = loadJson(paths.fullValidation);
  const stage3Validation = loadJson(paths.stage3Validation);
  const abilityValidation = loadJson(paths.abilityValidation);
  const spValidation = loadJson(paths.spValidation);
  const relationValidation = loadJson(paths.relationValidation);

  const records = Array.isArray(full.records) ? full.records : [];
  const failures = [];
  const reviews = [];
  const failIds = new Set();

  const requiredPassSources = [
    ['stage6_0_checkpoint', checkpoint],
    ['stage6_1_full_records', full],
    ['stage6_1_validation', fullValidation],
    ['stage3_validation', stage3Validation],
    ['stage5_3_ability_validation', abilityValidation],
    ['stage5_6_sp_validation', spValidation],
    ['hero_soldier_relation_validation', relationValidation],
  ];
  for (const [name, source] of requiredPassSources) {
    if (source?.status !== 'PASS') failures.push({ code: 'UPSTREAM_NOT_PASS', source: name, detail: `status=${source?.status ?? null}` });
  }

  const gateSources = [
    ['STAGE6_1', fullValidation],
    ['STAGE3', stage3Validation],
    ['ABILITY', abilityValidation],
    ['SP', spValidation],
    ['RELATION', relationValidation],
  ];
  for (const [prefix, source] of gateSources) {
    for (const check of nonZeroChecks(source)) {
      failures.push({ code: `${prefix}_${check.key}`, source: source.schemaId ?? source.stage ?? prefix, count: check.value });
    }
  }

  // Explicit FAIL examples required by Stage 6-2 policy.
  const failPolicyChecks = {
    duplicateSoldierIds: stage3Validation?.checks?.duplicateSoldierIds ?? 0,
    missingTrainingLevelRefs: stage3Validation?.checks?.missingTrainingLevelRefs ?? 0,
    missingBaseHeroIds: stage3Validation?.checks?.missingBaseHeroIds ?? 0,
    missingSpHeroIds: stage3Validation?.checks?.missingSpHeroIds ?? 0,
    missingSpRelations: spValidation?.checks?.missingSpRelations ?? 0,
    byHeroPairMismatch: relationValidation?.checks?.byHeroPairMismatch ?? 0,
    bySoldierPairMismatch: relationValidation?.checks?.bySoldierPairMismatch ?? 0,
    crossIndexPairMismatch: relationValidation?.checks?.crossIndexPairMismatch ?? 0,
  };

  // Record-level FAIL IDs available from Stage 6-1 / SP validation detail arrays.
  const fullCoverage = fullValidation?.coverage ?? {};
  for (const key of ['missingListIds','missingReleaseIds','extraListIds','extraReleaseIds','identityMismatches','releaseMismatches','malformedDetailIds','malformedListIds']) {
    addIds(failIds, fullCoverage[key]);
  }
  const spCoverage = spValidation?.coverage ?? {};
  for (const key of ['missingSpRelations','extraSpRelations','relationIdMismatches','descriptionPreservationMismatches','invalidStatDeltas','malformedStage1','malformedStage2','falseStage2Leak','expandedHeroMismatches','nonSpWithSpDetail','missionTypeMismatches']) {
    addIds(failIds, spCoverage[key]);
  }

  const classifiedRecords = [];
  let passCount = 0;
  let reviewCount = 0;
  let failCount = 0;
  const reviewReasonCounts = new Map();

  for (const record of records) {
    const soldierId = record?.soldierId;
    const reasons = [];
    if (failIds.has(soldierId)) {
      classifiedRecords.push({ soldierId, classification: 'FAIL', reasons: ['STRUCTURAL_OR_RELATION_VALIDATION_FAILURE'] });
      failCount += 1;
      continue;
    }

    if (record?.identity?.nameKr == null) reasons.push('KR_NAME_UNRESOLVED');
    if (record?.identity?.validationStatus && record.identity.validationStatus !== 'PASS') reasons.push('IDENTITY_PRESENTATION_REVIEW');
    if (record?.release?.releaseStatus !== 'CONFIRMED') reasons.push('RELEASE_DATE_UNRESOLVED');
    if (record?.identity?.isSp === true) reasons.push('SP_INTERNAL_RELEASE_ORDER_UNRESOLVED');
    if (record?.identity?.isSp !== true && record?.identity?.tier !== 3) reasons.push('LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED');

    const uniqueReasons = [...new Set(reasons)];
    if (uniqueReasons.length) {
      reviewCount += 1;
      for (const reason of uniqueReasons) reviewReasonCounts.set(reason, (reviewReasonCounts.get(reason) ?? 0) + 1);
      classifiedRecords.push({ soldierId, classification: 'REVIEW', reasons: uniqueReasons });
    } else {
      passCount += 1;
      classifiedRecords.push({ soldierId, classification: 'PASS', reasons: [] });
    }
  }

  const knownReviewCodes = new Set((checkpoint.knownReviews ?? []).map(r => r?.code).filter(Boolean));
  const recordReviewCodes = new Set([...reviewReasonCounts.keys()].filter(code => code !== 'IDENTITY_PRESENTATION_REVIEW'));
  const missingKnownReviewCodes = [...recordReviewCodes].filter(code => !knownReviewCodes.has(code));
  if (missingKnownReviewCodes.length) {
    failures.push({ code: 'UNDECLARED_REVIEW_CODE', detail: missingKnownReviewCodes });
  }

  // Global-only REVIEW items intentionally do not force every Soldier row into REVIEW.
  for (const review of checkpoint.knownReviews ?? []) {
    reviews.push({
      code: review.code,
      count: Number.isInteger(review.count) ? review.count : null,
      classification: 'REVIEW',
      scope: ['REPRESENTATIVE_ASSET_ID_UNFROZEN','SAME_PATCH_ORDER_UNRESOLVED'].includes(review.code) ? 'GLOBAL' : 'RECORD_OR_POLICY',
      rule: review.rule,
    });
  }
  reviews.push({
    code: 'IDENTITY_PRESENTATION_REVIEW',
    count: reviewReasonCounts.get('IDENTITY_PRESENTATION_REVIEW') ?? 0,
    classification: 'REVIEW',
    scope: 'RECORD',
    rule: 'Preserve canonical validationStatus; presentation metadata review is non-blocking unless it creates an invalid identity or JOIN.',
  });

  const expected = checkpoint.expectedCoverage ?? {};
  const baselineMismatches = [];
  if (Number.isInteger(expected.canonicalSoldiers) && records.length !== expected.canonicalSoldiers) baselineMismatches.push(`records=${records.length}/${expected.canonicalSoldiers}`);
  if (passCount + reviewCount + failCount !== records.length) baselineMismatches.push('classification total does not equal record count');
  if (Number.isInteger(expected.nullNameKrCount) && (reviewReasonCounts.get('KR_NAME_UNRESOLVED') ?? 0) !== expected.nullNameKrCount) baselineMismatches.push(`KR_NAME_UNRESOLVED=${reviewReasonCounts.get('KR_NAME_UNRESOLVED') ?? 0}/${expected.nullNameKrCount}`);
  if (Number.isInteger(expected.unresolvedReleaseCount) && (reviewReasonCounts.get('RELEASE_DATE_UNRESOLVED') ?? 0) !== expected.unresolvedReleaseCount) baselineMismatches.push(`RELEASE_DATE_UNRESOLVED=${reviewReasonCounts.get('RELEASE_DATE_UNRESOLVED') ?? 0}/${expected.unresolvedReleaseCount}`);
  if (Number.isInteger(expected.spSoldiers) && (reviewReasonCounts.get('SP_INTERNAL_RELEASE_ORDER_UNRESOLVED') ?? 0) !== expected.spSoldiers) baselineMismatches.push(`SP_INTERNAL_RELEASE_ORDER_UNRESOLVED=${reviewReasonCounts.get('SP_INTERNAL_RELEASE_ORDER_UNRESOLVED') ?? 0}/${expected.spSoldiers}`);
  if (Number.isInteger(expected.lowerTierReleaseBucketCount) && (reviewReasonCounts.get('LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED') ?? 0) !== expected.lowerTierReleaseBucketCount) baselineMismatches.push(`LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED=${reviewReasonCounts.get('LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED') ?? 0}/${expected.lowerTierReleaseBucketCount}`);
  if (baselineMismatches.length) failures.push({ code: 'BASELINE_MISMATCH', detail: baselineMismatches });

  const status = failures.length || failCount ? 'FAIL' : 'PASS';
  const classificationStatus = status === 'FAIL' ? 'FAIL' : (reviewCount || reviews.length ? 'PASS_WITH_REVIEW' : 'PASS');
  const generatedAt = full.generatedAt ?? fullValidation.generatedAt ?? null;
  const sources = Object.fromEntries(Object.entries(paths)
    .filter(([key]) => !['output','validation'].includes(key))
    .map(([key, p]) => [key, { path: p, gitBlobSha: gitBlobSha(p) }]));

  const output = {
    version: 1,
    schemaId: 'soldier-stage6-2-classification/v1',
    stage: '6-2',
    status,
    classificationStatus,
    generatedAt,
    policy: {
      PASS: 'No blocking data-integrity, JOIN, relation, structural, or required-reference failure.',
      REVIEW: 'Known non-blocking presentation/release/UI-policy uncertainty that must remain explicit.',
      FAIL: 'Blocking structural or semantic regression such as duplicate Soldier IDs, missing TrainingTech references, missing SP relations, nonexistent Hero IDs, or Hero-Soldier directional mismatch.',
    },
    sources,
    summary: {
      records: records.length,
      passRecords: passCount,
      reviewRecords: reviewCount,
      failRecords: failCount,
      blockingFailureCount: failures.length,
      reviewIssueCount: reviews.length,
      reviewReasonCounts: Object.fromEntries([...reviewReasonCounts.entries()].sort(([a],[b]) => a.localeCompare(b))),
    },
    failPolicyChecks,
    failures,
    reviews,
    records: classifiedRecords,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage6-2-classification-validation/v1',
    stage: '6-2',
    status,
    classificationStatus,
    generatedAt,
    sources,
    checks: {
      upstreamNonPass: requiredPassSources.filter(([, source]) => source?.status !== 'PASS').length,
      nonZeroValidationGates: gateSources.reduce((sum, [, source]) => sum + nonZeroChecks(source).length, 0),
      duplicateSoldierIds: failPolicyChecks.duplicateSoldierIds,
      missingTrainingLevelRefs: failPolicyChecks.missingTrainingLevelRefs,
      missingBaseHeroIds: failPolicyChecks.missingBaseHeroIds,
      missingSpHeroIds: failPolicyChecks.missingSpHeroIds,
      missingSpRelations: failPolicyChecks.missingSpRelations,
      byHeroPairMismatch: failPolicyChecks.byHeroPairMismatch,
      bySoldierPairMismatch: failPolicyChecks.bySoldierPairMismatch,
      crossIndexPairMismatch: failPolicyChecks.crossIndexPairMismatch,
      recordFailCount: failCount,
      undeclaredReviewCodes: missingKnownReviewCodes.length,
      baselineMismatches: baselineMismatches.length,
      classificationTotalMismatch: passCount + reviewCount + failCount === records.length ? 0 : 1,
    },
    coverage: {
      canonicalSoldiers: records.length,
      passRecords: passCount,
      reviewRecords: reviewCount,
      failRecords: failCount,
      failSoldierIds: [...failIds].sort((a,b)=>a-b),
      reviewReasonCounts: Object.fromEntries([...reviewReasonCounts.entries()].sort(([a],[b]) => a.localeCompare(b))),
      baselineMismatches,
    },
    errors: failures,
    reviews,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);
  console.log(`Soldier Stage 6-2: ${status} (${classificationStatus})`);
  console.log(`Records PASS/REVIEW/FAIL: ${passCount}/${reviewCount}/${failCount}`);
  console.log(`Blocking failures: ${failures.length}`);
  if (failures.length || failCount) process.exitCode = 1;
}

main();
