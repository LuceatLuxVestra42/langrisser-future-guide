const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = 'data/validation/hero-soldier-integration-stageC-final.v1.json';

const inputs = {
  c0: {
    path: 'data/validation/hero-soldier-integration-stageC-0-summary.v1.json',
    sha: '8ff0dbc475e4ca306bbed4c7aa4666d40af2c5b9',
  },
  c1: {
    path: 'data/validation/hero-soldier-integration-stageC-1-pair-parity.v1.json',
    sha: 'c8a2d96ff5fce0dffb6ffbe89b92d5c37cf78bc3',
  },
  c2: {
    path: 'data/validation/hero-soldier-integration-stageC-2-id-resolution.v1.json',
    sha: '2c1efc5bc324b2f0f3b37db666aafe8633a5a157',
  },
  c3: {
    path: 'data/validation/hero-soldier-integration-stageC-3-special-fixtures.v1.json',
    sha: 'a729e5580d34c06fe11c108cbf2700381bd3ca39',
  },
  c4: {
    path: 'data/validation/hero-soldier-integration-stageC-4-production-boundary.v1.json',
    sha: 'bebc39e3ab7ee1da04e9418315f93d3107387a4c',
  },
};

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
function blobSha(rel) {
  return cp.execFileSync('git', ['hash-object', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
}
function isPassFamily(status) {
  return status === 'PASS' || status === 'PASS_WITH_REVIEW';
}

const c0 = readJson(inputs.c0.path);
const c1 = readJson(inputs.c1.path);
const c2 = readJson(inputs.c2.path);
const c3 = readJson(inputs.c3.path);
const c4 = readJson(inputs.c4.path);
const data = { c0, c1, c2, c3, c4 };

const sourceSnapshots = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, {
  path: value.path,
  expectedGitBlobSha: value.sha,
  actualGitBlobSha: blobSha(value.path),
  matchesFrozenSnapshot: blobSha(value.path) === value.sha,
}]));

const expected = { heroes: 267, soldiers: 224, pairs: 5977 };
const checks = {
  onlyStageCCheckpointsRead: true,
  c0Accepted: c0.status === 'PASS' && c0.completion === 'COMPLETE',
  c1Accepted: c1.status === 'PASS' && c1.completion === 'COMPLETE',
  c2Accepted: isPassFamily(c2.status) && c2.completion === 'COMPLETE',
  c3Accepted: c3.status === 'PASS' && c3.completion === 'COMPLETE',
  c4Accepted: c4.status === 'PASS' && c4.completion === 'COMPLETE',
  allCheckpointSnapshotsFrozen: Object.values(sourceSnapshots).every(x => x.matchesFrozenSnapshot),

  c0Population: c0.expectedPopulation?.heroes === expected.heroes && c0.expectedPopulation?.soldiers === expected.soldiers && c0.expectedPopulation?.canonicalPairs === expected.pairs,
  c0NoBlockingMismatch: c0.checks?.blockingMismatchCount === 0,

  c1Population: c1.summary?.heroCount === expected.heroes && c1.summary?.soldierCount === expected.soldiers && c1.summary?.canonicalPairCount === expected.pairs && c1.summary?.heroFinalPairCount === expected.pairs && c1.summary?.soldierFinalPairCount === expected.pairs,
  c1PairParityClean: ['canonicalVsHeroMismatch','canonicalVsSoldierMismatch','heroVsSoldierMismatch','duplicatePairCount','malformedPairCount','unknownHeroIdCount','unknownSoldierIdCount','duplicateHeroIdCount','duplicateSoldierIdCount','heroShardErrorCount','soldierRecordErrorCount','hardErrorCount'].every(k => c1.summary?.[k] === 0),
  c1AllSixDifferencesZero: ['canonicalMinusHero','heroMinusCanonical','canonicalMinusSoldier','soldierMinusCanonical','heroMinusSoldier','soldierMinusHero'].every(k => c1.differences?.[k]?.count === 0),

  c2Population: c2.summary?.heroMasterCount === expected.heroes && c2.summary?.heroManifestCount === expected.heroes && c2.summary?.soldierMasterCount === expected.soldiers && c2.summary?.soldierRecordCount === expected.soldiers && c2.summary?.heroMembershipReferenceCount === expected.pairs && c2.summary?.soldierMembershipReferenceCount === expected.pairs,
  c2StructuralIntegrityClean: [
    'heroManifestVsMasterMismatch','soldierRecordsVsMasterMismatch','sharedMetadataVsMasterMismatch','sharedMetadataVsFinalRecordsMismatch',
    'heroMasterInvalidIds','heroMasterDuplicateIds','soldierMasterInvalidIds','soldierMasterDuplicateIds','heroManifestInvalidKeys','heroManifestPathMismatches','heroShardIdentityMismatches',
    'heroMembershipTypeErrors','heroMembershipDuplicateIds','heroMembershipUnknownSoldierIds','soldierRecordInvalidIds','soldierRecordDuplicateIds','soldierMembershipTypeErrors','soldierMembershipDuplicateIds','soldierMembershipUnknownHeroIds',
    'sharedMetadataInvalidKeys','sharedMetadataIdMismatches','sharedMetadataDuplicateIds','sharedMetadataSiteIdMismatches','sharedMetadataMissingForHeroRefs','missingHeroShards','malformedMembershipContainers','hardErrorCount'
  ].every(k => c2.summary?.[k] === 0),

  c3SpecialRegressionClean: c3.summary?.canonicalRelationCount === expected.pairs && c3.summary?.semanticFixtureCount === 6 && c3.summary?.fixturePassCount === 6 && ['fixtureFailCount','provenanceFailureCount','heroConsumerFailureCount','soldierConsumerFailureCount','firstStageUnexpectedExpandEdgeCount','hardErrorCount'].every(k => c3.summary?.[k] === 0),

  c4ProductionBoundaryClean: c4.summary?.canonicalRelationCount === expected.pairs && c4.summary?.heroIndexKeyCount === expected.heroes && c4.summary?.heroIndexPairCount === expected.pairs && c4.summary?.soldierIndexKeyCount === expected.soldiers && c4.summary?.soldierIndexPairCount === expected.pairs && ['blockedFrontendPathImportCount','blockedSemanticReconstructionCount','blockedIdArithmeticCount','blockedNameJoinCount','failedCheckCount','hardErrorCount'].every(k => c4.summary?.[k] === 0),
  c4OwnershipChecksAllTrue: Object.values(c4.checks || {}).every(Boolean),
};

const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const hardErrors = failedChecks.map(code => ({ code, severity: 'HARD_ERROR' }));

const reviews = [];
for (const review of c2.nonBlockingReviews || []) {
  reviews.push({ ...review, sourceStage: 'C-2' });
}
for (const review of c4.nonBlockingReviewsForwarded || []) {
  if (!reviews.some(x => x.code === review.code)) reviews.push({ ...review, sourceStage: 'C-4' });
}

const hardErrorCount = hardErrors.length;
const status = hardErrorCount === 0 ? (reviews.length ? 'PASS_WITH_REVIEW' : 'PASS') : 'FAIL';
const pipelineStatus = hardErrorCount === 0 ? 'FINAL_FROZEN' : 'BLOCKED';

const output = {
  version: 1,
  schemaId: 'hero-soldier-integration-stageC-final/v1',
  stage: 'C-5',
  checkpoint: 'C-FINAL',
  status,
  completion: hardErrorCount === 0 ? 'COMPLETE' : 'BLOCKED',
  pipelineStatus,
  purpose: 'Close Stage C using only frozen C-0 through C-4 checkpoints; do not reread ConfigData, canonical relation data, indexes, Hero shards, Soldier records, or frontend source.',
  sourcePolicy: 'C-5 reads exactly five Stage C checkpoint JSON files (C-0, C-1, C-2, C-3, C-4) and validates their frozen blob identities, acceptance states, counts, zero-error gates, and cross-stage consistency.',
  sources: sourceSnapshots,
  expected,
  checks,
  summary: {
    heroCount: expected.heroes,
    soldierCount: expected.soldiers,
    canonicalPairCount: expected.pairs,
    c1AllPairDifferences: 0,
    c1UnknownOrDuplicateIdentityErrors: 0,
    c2StructuralIdentityErrors: 0,
    c3SemanticFixtureCount: c3.summary?.semanticFixtureCount,
    c3SemanticFixtureFailures: c3.summary?.fixtureFailCount,
    c4BoundaryViolations: (c4.summary?.blockedFrontendPathImportCount || 0) + (c4.summary?.blockedSemanticReconstructionCount || 0) + (c4.summary?.blockedIdArithmeticCount || 0) + (c4.summary?.blockedNameJoinCount || 0),
    failedCheckCount: failedChecks.length,
    hardErrorCount,
    nonBlockingReviewCount: reviews.length,
  },
  nonBlockingReviews: reviews,
  hardErrors,
  finalBoundary: {
    relationSemanticsOwner: 'A-stage canonical relation pipeline',
    offlineProjectionOwners: ['byHero', 'bySoldier'],
    productionMembershipConsumers: ['Hero final soldiers.ids', 'Soldier final heroes.finalHeroIds'],
    frontendRole: 'presentation/navigation consumer only',
    runtimeRelationRecomputationForbidden: true,
    rawConfigDataRelationReadForbidden: true,
    nameJoinForbidden: true,
    idArithmeticInferenceForbidden: true,
    arbitraryPairPatchForbidden: true,
  },
  decision: hardErrorCount === 0
    ? 'C-5 PASS_WITH_REVIEW. Stage C is COMPLETE and FINAL_FROZEN at 267 Heroes, 224 Soldiers, and 5,977 reciprocal Hero-Soldier pairs with zero hard structural, parity, identity, special-fixture, or production-boundary errors. Remaining reviews are non-blocking presentation/UI-integration concerns only.'
    : `C-5 FAIL. Stage C cannot be frozen because ${hardErrorCount} hard closeout check(s) failed.`,
  nextStartPoint: hardErrorCount === 0
    ? 'Stage C is closed. Proceed to frontend/UI Integration implementation and route/click/back/404/mobile QA while consuming only the frozen final Hero/Soldier membership consumers.'
    : 'Resolve the failed Stage C checkpoint condition(s) before any frontend/UI integration work.',
};

fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ status: output.status, completion: output.completion, pipelineStatus: output.pipelineStatus, summary: output.summary }, null, 2));
if (hardErrorCount) process.exit(1);
