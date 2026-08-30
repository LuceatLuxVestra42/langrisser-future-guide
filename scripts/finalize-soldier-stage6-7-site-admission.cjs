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
function readHistoricalJson(blobSha) {
  const content = execFileSync('git', ['cat-file', '-p', blobSha], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(content);
}
function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function allZeroChecks(checks) {
  return isObject(checks) && Object.values(checks).every((value) => value === 0 || value === null);
}
function addMismatch(list, name, actual, expected) {
  if (actual !== expected) list.push(`${name}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}
function collectLegacySourceRefs(value, label, out = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLegacySourceRefs(item, `${label}[${index}]`, out));
    return out;
  }
  if (!isObject(value)) return out;

  if (typeof value.path === 'string' && typeof value.gitBlobSha === 'string') {
    if (value.semanticDigest) {
      out.push({
        label,
        path: value.path,
        expectedSha: value.gitBlobSha,
        semanticDigest: value.semanticDigest,
        v2Descriptor: true,
      });
    } else {
      out.push({ label, path: value.path, expectedSha: value.gitBlobSha, v2Descriptor: false });
    }
    return out;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'freshness') continue;
    collectLegacySourceRefs(child, `${label}.${key}`, out);
  }
  return out;
}

async function main() {
  const {
    STAGE67_FRESHNESS_MODE,
    buildStage67Stage66Digest,
    buildStage67V2Ref,
    classifyStage67Ref,
    proveLegacyStage67Migration,
    verifyStage66EmbeddedFreshness,
  } = await import('./lib/soldier-stage6-7-semantic-freshness.mjs');

  const priorOutput = readPrior(paths.output);

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

  const errors = [];
  const reviewCodes = new Map();
  const statusFailures = [];
  const coverageMismatches = [];
  const sourceSnapshotMismatches = [];
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

  // Keep all pre-P4 upstream snapshot checks as legacy exact-SHA checks, except
  // Stage 6-6 itself. Stage 6-6 is a separately owned V2 producer and is consumed
  // atomically here through its registered output/validation semantic digests.
  const legacySourceRoots = [
    ['checkpoint', checkpoint],
    ['stage5_7', stage5_7],
    ['stage5_8', stage5_8],
    ['stage6_1', stage6_1],
    ['stage6_2', stage6_2],
    ['stage6_3', stage6_3],
    ['stage6_4', stage6_4],
    ['stage6_5', stage6_5],
  ];
  const refs = legacySourceRoots.flatMap(([label, value]) => collectLegacySourceRefs(value, label));
  const expectedByPath = new Map();
  for (const ref of refs) {
    if (ref.v2Descriptor) {
      // P4 does not invent projection dispatch for unrelated V2 descriptors.
      // If such a descriptor appears in a legacy-owned subtree, fail closed until
      // its owning projection is explicitly registered for this consumer.
      sourceSemanticDependencyFailures.push({
        label: ref.label,
        path: ref.path,
        code: 'unregistered-nested-v2-descriptor',
        projection: ref.semanticDigest?.projection ?? null,
      });
      continue;
    }
    if (!expectedByPath.has(ref.path)) expectedByPath.set(ref.path, new Set());
    expectedByPath.get(ref.path).add(ref.expectedSha);
  }
  for (const [p, expectedSet] of [...expectedByPath.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const expected = [...expectedSet].sort();
    const actual = gitBlobSha(p);
    if (expected.length !== 1 || actual !== expected[0]) {
      sourceSnapshotMismatches.push({ path: p, expected, actual });
    }
  }

  const migrateStage66Ref = (label, relativePath, value, priorRef) => {
    const currentBlob = gitBlobSha(relativePath);
    if (typeof currentBlob !== 'string' || currentBlob.length === 0) {
      sourceSemanticDependencyFailures.push({ label, path: relativePath, code: 'source-blob-unavailable' });
      return null;
    }
    if (!verifyStage66EmbeddedFreshness(label, value)) {
      sourceSemanticDependencyFailures.push({ label, path: relativePath, code: 'stage6-6-embedded-semantic-digest-invalid' });
      return null;
    }

    const proof = proveLegacyStage67Migration({
      label,
      path: relativePath,
      currentValue: value,
      currentGitBlobSha: currentBlob,
      priorRef,
      readHistoricalJson,
    });
    freshnessObservations.push({ label, classification: proof.classification, reason: proof.reason });
    if (!proof.ok) {
      sourceSemanticDependencyFailures.push({
        label,
        path: relativePath,
        code: proof.classification,
        reason: proof.reason,
      });
      return null;
    }

    if (priorRef?.semanticDigest) {
      return buildStage67V2Ref({
        path: relativePath,
        currentDigest: proof.currentDigest,
        currentGitBlobSha: currentBlob,
        priorRef,
      });
    }

    return {
      path: relativePath,
      gitBlobSha: priorRef.gitBlobSha,
      semanticDigest: proof.currentDigest,
      freshnessMode: STAGE67_FRESHNESS_MODE,
    };
  };

  const stage66ManifestRef = migrateStage66Ref(
    'stage6_6Manifest',
    paths.stage6_6Manifest,
    stage6_6Manifest,
    priorOutput?.sources?.stage6_6Manifest ?? null,
  );
  const stage66ValidationRef = migrateStage66Ref(
    'stage6_6',
    paths.stage6_6,
    stage6_6,
    priorOutput?.sources?.stage6_6 ?? null,
  );
  const expansionBasisRef = migrateStage66Ref(
    'expansionBasis',
    paths.stage6_6Manifest,
    stage6_6Manifest,
    priorOutput?.keyArtifacts?.expansionBasis ?? null,
  );

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

  const gates = {
    generationComplete: stage6_1?.coverage?.generatedRecords === expected.canonicalSoldiers && allZeroChecks(stage6_1.checks),
    validationClassified: stage6_2?.coverage?.failRecords === 0 && stage6_2?.checks?.undeclaredReviewCodes === 0,
    representativeQa: stage6_3?.coverage?.fixtureCategories === 6 && stage6_3?.coverage?.passedFixtures === 6 && stage6_3?.coverage?.failedFixtures === 0,
    listAndRelease: stage5_7.status === 'PASS' && stage5_8.status === 'PASS' && stage5_7?.coverage?.generatedRecords === expected.canonicalSoldiers,
    filterQa: stage6_4?.coverage?.failedTests === 0 && stage6_4?.coverage?.passedTests === stage6_4?.coverage?.testCount,
    reciprocalHeroLinks: stage6_5?.checks?.reciprocalPagePairMismatch === 0 && stage6_5Manifest?.summary?.reciprocalMismatchCount === 0,
    expansionFoundation: stage6_6Manifest?.simulatorReadiness?.status === 'FOUNDATION_READY' && allZeroChecks(stage6_6.checks),
    sourceSnapshotsFrozen: sourceSnapshotMismatches.length === 0 && sourceSemanticDependencyFailures.length === 0,
    derivationDocumented: documentationMissing.length === 0,
  };
  for (const [name, pass] of Object.entries(gates)) if (!pass) admissionGateFailures.push(name);

  if (statusFailures.length) errors.push(`Upstream status failure: ${statusFailures.join(', ')}`);
  if (sourceSnapshotMismatches.length) errors.push(`${sourceSnapshotMismatches.length} frozen source snapshot mismatches`);
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

  const keyArtifacts = {
    detail: { path: checkpoint.generatedBaseline.soldierDetailFinal.path, gitBlobSha: gitBlobSha(checkpoint.generatedBaseline.soldierDetailFinal.path) },
    list: { path: checkpoint.generatedBaseline.soldierListFinal.path, gitBlobSha: gitBlobSha(checkpoint.generatedBaseline.soldierListFinal.path) },
    releaseMetadata: { path: checkpoint.generatedBaseline.soldierReleaseMetadata.path, gitBlobSha: gitBlobSha(checkpoint.generatedBaseline.soldierReleaseMetadata.path) },
    fullRecords: { path: stage6_2.sources.fullRecords.path, gitBlobSha: gitBlobSha(stage6_2.sources.fullRecords.path) },
    reciprocalLinks: { path: paths.stage6_5Manifest, gitBlobSha: gitBlobSha(paths.stage6_5Manifest) },
    expansionBasis: expansionBasisRef,
  };

  const sources = Object.fromEntries(Object.entries(paths)
    .filter(([key]) => !['output', 'validation'].includes(key))
    .map(([key, p]) => {
      if (key === 'stage6_6Manifest') return [key, stage66ManifestRef];
      if (key === 'stage6_6') return [key, stage66ValidationRef];
      return [key, { path: p, gitBlobSha: gitBlobSha(p) }];
    }));

  const output = {
    version: 1,
    schemaId: 'soldier-stage6-7-site-admission/v1',
    stage: '6-7',
    status,
    admissionStatus,
    generatedAt,
    scope: 'SOLDIER_PAGE_DATA_ADMISSION',
    purpose: 'Final gate proving canonical Soldier data can stably support list, detail, filters, reciprocal Hero links and later expansion without reopening semantic or JOIN inference.',
    admissionRule: 'Admit Soldier page data when every canonical record is generated, automated validation has no FAIL records, REVIEW items are explicit, representative/filter/reciprocal QA passes, expansion inputs are preserved, legacy frozen dependencies retain exact SHA parity, and migrated Stage 6-6 dependencies are semantically fresh under frozen-semantic-freshness/v2. Provenance-only drift remains visible but is not semantic failure.',
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
      sourceSnapshotMismatches: sourceSnapshotMismatches.length,
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
    sourceSnapshotMismatches,
    sourceSemanticDependencyFailures,
    coverageMismatches,
    documentationMissing,
    admissionGateFailures,
    errors,
    reviews: reviewSummary,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  for (const [label, ref, value] of [
    ['stage6_6Manifest', output.sources.stage6_6Manifest, stage6_6Manifest],
    ['stage6_6', output.sources.stage6_6, stage6_6],
    ['expansionBasis', output.keyArtifacts.expansionBasis, stage6_6Manifest],
  ]) {
    if (!ref) continue;
    const currentDigest = buildStage67Stage66Digest(label, value);
    const classification = classifyStage67Ref(ref, currentDigest, gitBlobSha(ref.path));
    if (!['SEMANTIC_FRESH', 'PROVENANCE_ONLY_CHANGED'].includes(classification)) {
      throw new Error(`Freshly written Stage 6-7 V2 ref ${label} is not semantically fresh: ${classification}`);
    }
  }

  const freshnessCounts = freshnessObservations.reduce((acc, item) => {
    acc[item.classification] = (acc[item.classification] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Soldier Stage 6-7: ${status}`);
  console.log(`Admission: ${admissionStatus}`);
  console.log(`Freshness V2 observations: ${JSON.stringify(freshnessCounts)}`);
  console.log(`Records PASS/REVIEW/FAIL: ${output.summary.passRecords}/${output.summary.reviewRecords}/${output.summary.failRecords}`);
  console.log(`Representative QA: ${output.summary.representativeFixturesPassed}/${output.summary.representativeFixtures}`);
  console.log(`Filter QA: ${output.summary.filterTestsPassed}/${output.summary.filterTests}`);
  console.log(`Reciprocal mismatch: ${output.summary.reciprocalMismatchCount}`);
  console.log(`Legacy snapshot mismatches: ${sourceSnapshotMismatches.length}`);
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
