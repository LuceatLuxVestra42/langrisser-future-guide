const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
  checkpoint: 'data/validation/soldier-stage6-0-checkpoint.v1.json',
  stage5_7: 'data/validation/soldier-stage5-7-list.v1.json',
  stage5_8: 'data/validation/soldier-stage5-8-release.v1.json',
  stage6_1: 'data/validation/soldier-stage6-1-full-records.v1.json',
  stage6_2: 'data/validation/soldier-stage6-2-classification.v1.json',
  stage6_3: 'data/validation/soldier-stage6-3-representative-qa.v1.json',
  stage6_4: 'data/validation/soldier-stage6-4-filter-qa.v1.json',
  stage6_5Manifest: 'data/generated/hero-soldier-page-links-stage6-5.v1.json',
  stage6_5: 'data/validation/soldier-stage6-5-reciprocal-links.v1.json',
  stage6_6Manifest: 'data/generated/soldier-stage6-6-expansion-basis.v1.json',
  stage6_6: 'data/validation/soldier-stage6-6-expansion-basis.v1.json',
  output: 'data/generated/soldier-stage6-7-site-admission.v1.json',
  validation: 'data/validation/soldier-stage6-7-site-admission.v1.json',
};

function abs(p) { return path.join(rootDir, p); }
function loadJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, value) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n');
}
function readPrior(p) {
  try { return loadJson(p); } catch { return null; }
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
function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function allZeroChecks(checks) {
  return isObject(checks) && Object.values(checks).every((value) => value === 0 || value === null);
}
function addMismatch(list, name, actual, expected) {
  if (actual !== expected) list.push(`${name}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

async function main() {
  const {
    STAGE67_FRESHNESS_MODE,
    buildStage67DirectSourceDigest,
    buildStage67FreshnessEnvelope,
    buildStage67KeyArtifactDigest,
    buildStage67OutputDigest,
    buildStage67Ref,
    buildStage67ValidationDigest,
    classifyStage67Ref,
    verifyStage66EmbeddedFreshness,
  } = await import('./lib/soldier-stage6-7-semantic-projections.mjs');
  const { sameSemanticDigest } = await import('./lib/frozen-semantic-digest.mjs');

  const priorOutput = readPrior(paths.output);
  const priorValidation = readPrior(paths.validation);

  const contract = loadJson(paths.contract);
  const checkpoint = loadJson(paths.checkpoint);
  const stage5_7 = loadJson(paths.stage5_7);
  const stage5_8 = loadJson(paths.stage5_8);
  const stage6_1 = loadJson(paths.stage6_1);
  const stage6_2 = loadJson(paths.stage6_2);
  const stage6_3 = loadJson(paths.stage6_3);
  const stage6_4 = loadJson(paths.stage6_4);
  const stage6_5Manifest = loadJson(paths.stage6_5Manifest);
  const stage6_5 = loadJson(paths.stage6_5);
  const stage6_6Manifest = loadJson(paths.stage6_6Manifest);
  const stage6_6 = loadJson(paths.stage6_6);

  const sourceValues = {
    contract,
    checkpoint,
    stage5_7,
    stage5_8,
    stage6_1,
    stage6_2,
    stage6_3,
    stage6_4,
    stage6_5Manifest,
    stage6_5,
    stage6_6Manifest,
    stage6_6,
  };

  const errors = [];
  const reviewCodes = new Map();
  const statusFailures = [];
  const coverageMismatches = [];
  const sourceSemanticDependencyFailures = [];
  const documentationMissing = [];
  const admissionGateFailures = [];
  const freshnessObservations = [];

  const requiredPass = [
    ['checkpoint', checkpoint.status],
    ['stage5_7', stage5_7.status],
    ['stage5_8', stage5_8.status],
    ['stage6_1', stage6_1.status],
    ['stage6_2', stage6_2.status],
    ['stage6_3', stage6_3.status],
    ['stage6_4', stage6_4.status],
    ['stage6_5Manifest', stage6_5Manifest.status],
    ['stage6_5', stage6_5.status],
    ['stage6_6Manifest', stage6_6Manifest.status],
    ['stage6_6', stage6_6.status],
  ];
  if (contract.status !== 'FROZEN') statusFailures.push(`contract=${contract.status}`);
  for (const [name, status] of requiredPass) if (status !== 'PASS') statusFailures.push(`${name}=${status}`);
  if (!['PASS', 'PASS_WITH_REVIEW'].includes(stage6_2.classificationStatus)) {
    statusFailures.push(`stage6_2.classificationStatus=${stage6_2.classificationStatus}`);
  }

  for (const [label, value] of [['stage6_6Manifest', stage6_6Manifest], ['stage6_6', stage6_6]]) {
    if (!verifyStage66EmbeddedFreshness(label, value)) {
      sourceSemanticDependencyFailures.push({ label, code: 'stage6-6-embedded-semantic-digest-invalid' });
    }
  }

  const sources = {};
  for (const [label, relativePath] of Object.entries(paths)) {
    if (label === 'output' || label === 'validation') continue;
    const currentBlob = gitBlobSha(relativePath);
    if (typeof currentBlob !== 'string' || currentBlob.length === 0) {
      sourceSemanticDependencyFailures.push({ label, path: relativePath, code: 'source-blob-unavailable' });
      continue;
    }
    try {
      const currentDigest = buildStage67DirectSourceDigest(label, sourceValues[label]);
      const priorRef = priorOutput?.sources?.[label] ?? null;
      const classification = priorRef?.semanticDigest
        ? classifyStage67Ref(priorRef, currentDigest, currentBlob)
        : 'LEGACY_MIGRATION';
      freshnessObservations.push({ kind: 'source', label, classification });
      sources[label] = buildStage67Ref({
        path: relativePath,
        currentDigest,
        currentGitBlobSha: currentBlob,
        priorRef,
      });
    } catch (error) {
      sourceSemanticDependencyFailures.push({ label, path: relativePath, code: 'source-semantic-digest-error', detail: error.message });
    }
  }

  const expected = checkpoint.expectedCoverage || {};
  addMismatch(coverageMismatches, 'stage6_1 canonicalSoldiers', stage6_1?.coverage?.canonicalSoldiers, expected.canonicalSoldiers);
  addMismatch(coverageMismatches, 'stage6_1 generatedRecords', stage6_1?.coverage?.generatedRecords, expected.canonicalSoldiers);
  addMismatch(coverageMismatches, 'stage6_1 normalCount', stage6_1?.coverage?.normalCount, expected.normalSoldiers);
  addMismatch(coverageMismatches, 'stage6_1 spCount', stage6_1?.coverage?.spCount, expected.spSoldiers);
  addMismatch(coverageMismatches, 'stage6_1 normalTier3Count', stage6_1?.coverage?.normalTier3Count, expected.normalTier3);
  addMismatch(coverageMismatches, 'stage5_7 generatedRecords', stage5_7?.coverage?.generatedRecords, expected.canonicalSoldiers);
  addMismatch(coverageMismatches, 'stage5_8 canonicalSoldiers', stage5_8?.coverage?.canonicalSoldiers, expected.canonicalSoldiers);
  addMismatch(coverageMismatches, 'stage6_2 canonicalSoldiers', stage6_2?.coverage?.canonicalSoldiers, expected.canonicalSoldiers);
  addMismatch(coverageMismatches, 'stage6_2 failRecords', stage6_2?.coverage?.failRecords, 0);
  addMismatch(coverageMismatches, 'stage6_3 passedFixtures', stage6_3?.coverage?.passedFixtures, stage6_3?.coverage?.fixtureCategories);
  addMismatch(coverageMismatches, 'stage6_4 canonicalSoldiers', stage6_4?.coverage?.canonicalSoldiers, expected.canonicalSoldiers);
  addMismatch(coverageMismatches, 'stage6_4 failedTests', stage6_4?.coverage?.failedTests, 0);
  addMismatch(coverageMismatches, 'stage6_4 passedTests', stage6_4?.coverage?.passedTests, stage6_4?.coverage?.testCount);
  addMismatch(coverageMismatches, 'stage6_5 soldierKeys', stage6_5?.coverage?.soldierKeys, expected.relationBySoldierKeys);
  addMismatch(coverageMismatches, 'stage6_5 canonicalRelationCount', stage6_5?.coverage?.canonicalRelationCount, expected.heroSoldierRelationEdges);
  addMismatch(coverageMismatches, 'stage6_5 reciprocalMismatchCount', stage6_5Manifest?.summary?.reciprocalMismatchCount, 0);
  addMismatch(coverageMismatches, 'stage6_6 canonicalSoldiers', stage6_6?.coverage?.canonicalSoldiers, expected.canonicalSoldiers);
  addMismatch(coverageMismatches, 'stage6_6 relationEdges', stage6_6?.coverage?.relationEdges, expected.heroSoldierRelationEdges);
  addMismatch(coverageMismatches, 'stage6_6 stage1 missions', stage6_6?.coverage?.spStage1MissionCount, expected.stage1MissionCount);
  addMismatch(coverageMismatches, 'stage6_6 stage2 missions', stage6_6?.coverage?.spStage2MissionCount, expected.stage2MissionCount);

  for (const review of stage6_2.reviews || []) {
    if (review?.classification !== 'REVIEW' || typeof review?.code !== 'string') {
      errors.push('Stage 6-2 contains a non-explicit REVIEW entry');
      continue;
    }
    reviewCodes.set(review.code, review.count ?? null);
  }
  for (const review of [...(stage6_5.reviews || []), ...(stage6_6.reviews || [])]) {
    if (review?.classification !== 'REVIEW' || typeof review?.code !== 'string') {
      errors.push('Stage 6-5/6-6 contains a non-explicit REVIEW entry');
      continue;
    }
    if (!reviewCodes.has(review.code)) reviewCodes.set(review.code, review.count ?? null);
  }

  if (!contract.ownership || !Array.isArray(contract.conditionalRules) || !Array.isArray(contract.forbidden)) {
    documentationMissing.push('Stage 5-1 contract ownership/rules');
  }
  if (!stage6_5Manifest?.authority?.rule || !stage6_5Manifest?.consumers?.heroPage || !stage6_5Manifest?.consumers?.soldierPage) {
    documentationMissing.push('Stage 6-5 reciprocal authority/consumers');
  }
  const authorities = stage6_6Manifest?.authorities || {};
  for (const key of ['fullStats', 'normalTraitLevels', 'trainingCosts', 'spExpansion', 'heroEligibilityProvenance']) {
    if (!authorities[key]?.source || !authorities[key]?.rule) documentationMissing.push(`Stage 6-6 authority ${key}`);
  }

  const keyArtifactPaths = {
    detail: checkpoint?.generatedBaseline?.soldierDetailFinal?.path ?? null,
    list: checkpoint?.generatedBaseline?.soldierListFinal?.path ?? null,
    releaseMetadata: checkpoint?.generatedBaseline?.soldierReleaseMetadata?.path ?? null,
    fullRecords: stage6_2?.sources?.fullRecords?.path ?? null,
    reciprocalLinks: paths.stage6_5Manifest,
    expansionBasis: paths.stage6_6Manifest,
  };
  const keyArtifacts = {};
  for (const [label, relativePath] of Object.entries(keyArtifactPaths)) {
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
      sourceSemanticDependencyFailures.push({ label, path: relativePath, code: 'key-artifact-path-missing' });
      continue;
    }
    const currentBlob = gitBlobSha(relativePath);
    if (typeof currentBlob !== 'string' || currentBlob.length === 0) {
      sourceSemanticDependencyFailures.push({ label, path: relativePath, code: 'key-artifact-blob-unavailable' });
      continue;
    }
    try {
      const value = loadJson(relativePath);
      const currentDigest = buildStage67KeyArtifactDigest(label, value);
      const priorRef = priorOutput?.keyArtifacts?.[label] ?? null;
      const classification = priorRef?.semanticDigest
        ? classifyStage67Ref(priorRef, currentDigest, currentBlob)
        : 'LEGACY_MIGRATION';
      freshnessObservations.push({ kind: 'keyArtifact', label, classification });
      keyArtifacts[label] = buildStage67Ref({
        path: relativePath,
        currentDigest,
        currentGitBlobSha: currentBlob,
        priorRef,
      });
    } catch (error) {
      sourceSemanticDependencyFailures.push({ label, path: relativePath, code: 'key-artifact-semantic-digest-error', detail: error.message });
    }
  }

  const gates = {
    generationComplete: stage6_1?.coverage?.generatedRecords === expected.canonicalSoldiers && allZeroChecks(stage6_1.checks),
    validationClassified: stage6_2?.coverage?.failRecords === 0 && stage6_2?.checks?.undeclaredReviewCodes === 0,
    representativeQa: stage6_3?.coverage?.fixtureCategories === 6 && stage6_3?.coverage?.passedFixtures === 6 && stage6_3?.coverage?.failedFixtures === 0,
    listAndRelease: stage5_7.status === 'PASS' && stage5_8.status === 'PASS' && stage5_7?.coverage?.generatedRecords === expected.canonicalSoldiers,
    filterQa: stage6_4?.coverage?.failedTests === 0 && stage6_4?.coverage?.passedTests === stage6_4?.coverage?.testCount,
    reciprocalHeroLinks: stage6_5?.checks?.reciprocalPagePairMismatch === 0 && stage6_5Manifest?.summary?.reciprocalMismatchCount === 0,
    expansionFoundation: stage6_6Manifest?.simulatorReadiness?.status === 'FOUNDATION_READY' && allZeroChecks(stage6_6.checks),
    sourceSnapshotsFrozen: sourceSemanticDependencyFailures.length === 0 && Object.keys(sources).length === 12 && Object.keys(keyArtifacts).length === 6,
    derivationDocumented: documentationMissing.length === 0,
  };
  for (const [name, pass] of Object.entries(gates)) if (!pass) admissionGateFailures.push(name);

  if (statusFailures.length) errors.push(`Upstream status failure: ${statusFailures.join(', ')}`);
  if (sourceSemanticDependencyFailures.length) errors.push(`${sourceSemanticDependencyFailures.length} semantic freshness dependency failures`);
  if (coverageMismatches.length) errors.push(`${coverageMismatches.length} coverage mismatches`);
  if (documentationMissing.length) errors.push(`${documentationMissing.length} derivation documentation requirements missing`);
  if (admissionGateFailures.length) errors.push(`Admission gates failed: ${admissionGateFailures.join(', ')}`);

  const status = errors.length ? 'FAIL' : 'PASS';
  const hasReview = (stage6_2?.coverage?.reviewRecords ?? 0) > 0 || reviewCodes.size > 0;
  const admissionStatus = status === 'PASS' ? (hasReview ? 'READY_WITH_REVIEW' : 'READY') : 'BLOCKED';
  const generatedAt = stage6_1.generatedAt ?? stage6_2.generatedAt ?? null;
  const reviewSummary = [...reviewCodes.entries()]
    .map(([code, count]) => ({ code, count, classification: 'REVIEW' }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const output = {
    version: 1,
    schemaId: 'soldier-stage6-7-site-admission/v1',
    stage: '6-7',
    status,
    admissionStatus,
    generatedAt,
    scope: 'SOLDIER_PAGE_DATA_ADMISSION',
    purpose: 'Final gate proving canonical Soldier data can stably support list, detail, filters, reciprocal Hero links and later expansion without reopening semantic or JOIN inference.',
    admissionRule: 'Admit Soldier page data when every canonical record is generated, automated validation has no FAIL records, REVIEW items are explicit, representative/filter/reciprocal QA passes, expansion inputs are preserved, and each direct frozen dependency is semantically fresh under frozen-semantic-freshness/v2. Raw Git blob drift remains audit provenance and is not semantic authority.',
    capabilities: {
      listData: gates.listAndRelease ? 'READY' : 'BLOCKED',
      detailData: gates.generationComplete ? 'READY' : 'BLOCKED',
      filterSemantics: gates.filterQa ? 'READY' : 'BLOCKED',
      reciprocalHeroLinks: gates.reciprocalHeroLinks ? 'READY' : 'BLOCKED',
      representativeCoverage: gates.representativeQa ? 'READY' : 'BLOCKED',
      simulatorDataFoundation: gates.expansionFoundation ? 'FOUNDATION_READY' : 'BLOCKED',
    },
    notClaimedByStage6_7: [
      'concrete frontend rendering components or deployed routes',
      'canonical Soldier image/icon asset identifiers while REPRESENTATIVE_ASSET_ID_UNFROZEN remains REVIEW',
      'combat formulas or interactive simulator UI',
      'unconfirmed release dates, SP internal order or same-patch order',
    ],
    summary: {
      canonicalSoldiers: expected.canonicalSoldiers,
      normalSoldiers: expected.normalSoldiers,
      spSoldiers: expected.spSoldiers,
      normalTier3: expected.normalTier3,
      passRecords: stage6_2?.coverage?.passRecords ?? null,
      reviewRecords: stage6_2?.coverage?.reviewRecords ?? null,
      failRecords: stage6_2?.coverage?.failRecords ?? null,
      representativeFixtures: stage6_3?.coverage?.fixtureCategories ?? null,
      representativeFixturesPassed: stage6_3?.coverage?.passedFixtures ?? null,
      filterTests: stage6_4?.coverage?.testCount ?? null,
      filterTestsPassed: stage6_4?.coverage?.passedTests ?? null,
      heroKeys: stage6_5?.coverage?.heroKeys ?? null,
      soldierKeys: stage6_5?.coverage?.soldierKeys ?? null,
      heroSoldierRelations: stage6_5?.coverage?.canonicalRelationCount ?? null,
      reciprocalMismatchCount: stage6_5Manifest?.summary?.reciprocalMismatchCount ?? null,
      relationProvenance: stage6_6?.coverage?.relationProvenance ?? null,
      normalAbilityLevelRecords: stage6_6?.coverage?.normalAbilityLevelRecords ?? null,
      normalTrainingLevelRecords: stage6_6?.coverage?.normalTrainingLevelRecords ?? null,
    },
    admissionGates: Object.fromEntries(Object.entries(gates).map(([name, pass]) => [name, pass ? 'PASS' : 'FAIL'])),
    reviews: reviewSummary,
    keyArtifacts,
    sources,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage6-7-site-admission-validation/v1',
    stage: '6-7',
    status,
    admissionStatus,
    generatedAt,
    checks: {
      upstreamStatusFailures: statusFailures.length,
      sourceSnapshotMismatches: 0,
      sourceSemanticDependencyFailures: sourceSemanticDependencyFailures.length,
      coverageMismatches: coverageMismatches.length,
      recordFailCount: stage6_2?.coverage?.failRecords ?? null,
      undeclaredReviewCodes: stage6_2?.checks?.undeclaredReviewCodes ?? null,
      representativeFailedFixtures: stage6_3?.coverage?.failedFixtures ?? null,
      filterFailedTests: stage6_4?.coverage?.failedTests ?? null,
      reciprocalPagePairMismatch: stage6_5?.checks?.reciprocalPagePairMismatch ?? null,
      expansionPreservationFailures: allZeroChecks(stage6_6.checks) ? 0 : 1,
      documentationMissing: documentationMissing.length,
      admissionGateFailures: admissionGateFailures.length,
    },
    coverage: output.summary,
    admissionGates: output.admissionGates,
    sourceSnapshotMismatches: [],
    sourceSemanticDependencyFailures,
    coverageMismatches,
    documentationMissing,
    admissionGateFailures,
    errors,
    reviews: reviewSummary,
  };

  const outputDigest = buildStage67OutputDigest(output);
  const validationDigest = buildStage67ValidationDigest(validation);
  if (sameSemanticDigest(priorOutput?.freshness?.semanticDigest, outputDigest) && priorOutput?.generatedAt != null) {
    output.generatedAt = priorOutput.generatedAt;
  }
  if (sameSemanticDigest(priorValidation?.freshness?.semanticDigest, validationDigest) && priorValidation?.generatedAt != null) {
    validation.generatedAt = priorValidation.generatedAt;
  }
  output.freshness = buildStage67FreshnessEnvelope(outputDigest);
  validation.freshness = buildStage67FreshnessEnvelope(validationDigest);

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  for (const [label, ref] of Object.entries(output.sources || {})) {
    const currentDigest = buildStage67DirectSourceDigest(label, sourceValues[label]);
    const classification = classifyStage67Ref(ref, currentDigest, gitBlobSha(ref.path));
    if (!['SEMANTIC_FRESH', 'PROVENANCE_ONLY_CHANGED'].includes(classification)) {
      throw new Error(`Freshly written source ref ${label} is not semantically fresh: ${classification}`);
    }
  }
  for (const [label, ref] of Object.entries(output.keyArtifacts || {})) {
    const currentDigest = buildStage67KeyArtifactDigest(label, loadJson(ref.path));
    const classification = classifyStage67Ref(ref, currentDigest, gitBlobSha(ref.path));
    if (!['SEMANTIC_FRESH', 'PROVENANCE_ONLY_CHANGED'].includes(classification)) {
      throw new Error(`Freshly written key artifact ref ${label} is not semantically fresh: ${classification}`);
    }
  }

  const counts = freshnessObservations.reduce((acc, item) => {
    acc[item.classification] = (acc[item.classification] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Soldier Stage 6-7: ${status}`);
  console.log(`Admission: ${admissionStatus}`);
  console.log(`Freshness V2: ${STAGE67_FRESHNESS_MODE}`);
  console.log(`Freshness observations: ${JSON.stringify(counts)}`);
  console.log(`Records PASS/REVIEW/FAIL: ${output.summary.passRecords}/${output.summary.reviewRecords}/${output.summary.failRecords}`);
  console.log(`Representative QA: ${output.summary.representativeFixturesPassed}/${output.summary.representativeFixtures}`);
  console.log(`Filter QA: ${output.summary.filterTestsPassed}/${output.summary.filterTests}`);
  console.log(`Reciprocal mismatch: ${output.summary.reciprocalMismatchCount}`);
  console.log(`Semantic dependency failures: ${sourceSemanticDependencyFailures.length}`);

  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Soldier Stage 6-7 Freshness V2: FAIL: ${error.stack || error.message}`);
  process.exitCode = 1;
});
