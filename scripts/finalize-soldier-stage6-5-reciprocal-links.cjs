const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const predecessorCommit = '10cb5afade8b5650bfb01604232efa8235c57e08';
const predecessorBlob = '29d16d728625168569f3c916e18acd833fd4ea1e';
const predecessorPath = 'scripts/finalize-soldier-stage6-5-reciprocal-links.cjs';
const paths = {
  relationSet: 'data/generated/hero-soldier-relations.v1.json',
  relationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
  byHero: 'data/generated/hero-soldier-by-hero.v1.json',
  bySoldier: 'data/generated/hero-soldier-by-soldier.v1.json',
  heroPage: 'data/generated/hero-page-soldiers-stage5-3.v1.json',
  soldierRecords: 'data/generated/soldier-stage6-1-full-records.v1.json',
  output: 'data/generated/hero-soldier-page-links-stage6-5.v1.json',
  validation: 'data/validation/soldier-stage6-5-reciprocal-links.v1.json',
};

function abs(p) { return path.join(rootDir, p); }
function loadJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, value) { fs.writeFileSync(abs(p), `${JSON.stringify(value, null, 2)}\n`); }
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

function runFrozenPredecessor() {
  const actualBlob = execFileSync('git', ['rev-parse', `${predecessorCommit}:${predecessorPath}`], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  if (actualBlob !== predecessorBlob) {
    throw new Error(`Stage 6-5 predecessor blob mismatch: expected ${predecessorBlob}, got ${actualBlob}`);
  }

  const source = execFileSync('git', ['show', `${predecessorCommit}:${predecessorPath}`], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const tempPath = path.join(__dirname, '.soldier-stage6-5-r1-predecessor.cjs');
  fs.writeFileSync(tempPath, source);
  try {
    const result = spawnSync(process.execPath, [tempPath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status === null) throw new Error('Stage 6-5 predecessor terminated without an exit status');
    return result.status;
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

async function main() {
  const predecessorExit = runFrozenPredecessor();
  if (!fs.existsSync(abs(paths.output)) || !fs.existsSync(abs(paths.validation))) {
    throw new Error('Stage 6-5 predecessor did not materialize both frozen artifacts');
  }

  const {
    STAGE65_FRESHNESS_MODE,
    STAGE65_MEMBERSHIP_PROJECTION,
    buildStage65FreshnessEnvelope,
    buildStage65MembershipDigest,
    classifyStage65Snapshot,
    pairsFromByHeroArtifact,
    pairsFromBySoldierArtifact,
    pairsFromRelationArtifact,
  } = await import('./lib/soldier-stage6-5-semantic-projections.mjs');

  const relationSet = loadJson(paths.relationSet);
  const relationValidation = loadJson(paths.relationValidation);
  const byHero = loadJson(paths.byHero);
  const bySoldier = loadJson(paths.bySoldier);
  const heroPage = loadJson(paths.heroPage);
  const output = loadJson(paths.output);
  const validation = loadJson(paths.validation);

  const relationBlobSha = gitBlobSha(paths.relationSet);
  const canonicalDigest = buildStage65MembershipDigest(pairsFromRelationArtifact(relationSet));
  const byHeroDigest = buildStage65MembershipDigest(pairsFromByHeroArtifact(byHero));
  const bySoldierDigest = buildStage65MembershipDigest(pairsFromBySoldierArtifact(bySoldier));
  const heroPageDigest = buildStage65MembershipDigest(pairsFromByHeroArtifact(heroPage));

  const checks = validation?.checks ?? {};
  const canonicalHealthy = Number(checks.canonicalInvalidPairs || 0) === 0
    && Number(checks.canonicalDuplicatePairs || 0) === 0;
  const sharedHealthy = canonicalHealthy
    && Number(checks.sharedIndexPairMismatch || 0) === 0;
  const snapshotDefs = [
    {
      label: 'relationValidation',
      recordedGitBlobSha: relationValidation?.relationSet?.gitBlobSha ?? null,
      currentDigest: canonicalDigest,
      semanticHealthy: relationValidation?.status === 'PASS'
        && sharedHealthy
        && Number(checks.inheritedRelationValidationMismatch || 0) === 0,
    },
    {
      label: 'byHero',
      recordedGitBlobSha: byHero?.relationSet?.gitBlobSha ?? null,
      currentDigest: byHeroDigest,
      semanticHealthy: sharedHealthy
        && Number(checks.byHeroInvalidPairs || 0) === 0
        && Number(checks.byHeroDuplicatePairs || 0) === 0,
    },
    {
      label: 'bySoldier',
      recordedGitBlobSha: bySoldier?.relationSet?.gitBlobSha ?? null,
      currentDigest: bySoldierDigest,
      semanticHealthy: sharedHealthy
        && Number(checks.bySoldierInvalidPairs || 0) === 0
        && Number(checks.bySoldierDuplicatePairs || 0) === 0,
    },
    {
      label: 'heroPage',
      recordedGitBlobSha: heroPage?.sources?.byHero?.relationSetGitBlobSha ?? null,
      currentDigest: heroPageDigest,
      semanticHealthy: canonicalHealthy
        && Number(checks.heroPageInvalidPairs || 0) === 0
        && Number(checks.heroPageDuplicatePairs || 0) === 0
        && Number(checks.heroPagePairMismatch || 0) === 0,
    },
  ];

  const snapshotObservations = snapshotDefs.map((entry) => {
    const classification = classifyStage65Snapshot({
      recordedGitBlobSha: entry.recordedGitBlobSha,
      currentGitBlobSha: relationBlobSha,
      currentDigest: entry.currentDigest,
      canonicalDigest,
      semanticHealthy: entry.semanticHealthy,
    });
    return {
      label: entry.label,
      path: paths.relationSet,
      recordedGitBlobSha: entry.recordedGitBlobSha,
      currentGitBlobSha: relationBlobSha,
      semanticDigest: entry.currentDigest,
      classification,
    };
  });
  const blockingSnapshots = snapshotObservations.filter((entry) =>
    entry.classification === 'SEMANTIC_STALE' || entry.classification === 'SEMANTIC_UNKNOWN');
  const rawBlobMismatchCount = snapshotObservations.filter((entry) =>
    entry.recordedGitBlobSha !== entry.currentGitBlobSha).length;
  const provenanceOnlyChangedCount = snapshotObservations.filter((entry) =>
    entry.classification === 'PROVENANCE_ONLY_CHANGED').length;

  const rawSnapshotError = /relation snapshot references differ from the canonical relation blob/;
  const errors = (Array.isArray(validation.errors) ? validation.errors : [])
    .filter((error) => typeof error !== 'string' || !rawSnapshotError.test(error));
  if (blockingSnapshots.length) {
    errors.push(`${blockingSnapshots.length} relation snapshot semantic freshness checks failed`);
  }
  if (predecessorExit !== 0 && errors.length === 0 && rawBlobMismatchCount === 0) {
    errors.push(`Frozen Stage 6-5 predecessor exited ${predecessorExit} without a provenance-only snapshot explanation`);
  }

  const status = errors.length ? 'FAIL' : 'PASS';
  const freshness = buildStage65FreshnessEnvelope(canonicalDigest, snapshotObservations);
  freshness.scope = 'RECIPROCAL_MEMBERSHIP_ONLY';
  freshness.projection = STAGE65_MEMBERSHIP_PROJECTION;
  freshness.rawBlobMismatchCount = rawBlobMismatchCount;
  freshness.provenanceOnlyChangedCount = provenanceOnlyChangedCount;
  freshness.semanticStaleCount = snapshotObservations.filter((entry) => entry.classification === 'SEMANTIC_STALE').length;
  freshness.semanticUnknownCount = snapshotObservations.filter((entry) => entry.classification === 'SEMANTIC_UNKNOWN').length;
  freshness.predecessor = {
    commit: predecessorCommit,
    blob: predecessorBlob,
    exitCode: predecessorExit,
  };

  output.status = status;
  output.freshness = {
    contract: freshness.contract,
    freshnessMode: STAGE65_FRESHNESS_MODE,
    scope: freshness.scope,
    semanticDigest: canonicalDigest,
  };

  validation.status = status;
  validation.checks.relationSnapshotMismatch = blockingSnapshots.length;
  validation.coverage.snapshotMismatches = blockingSnapshots.map((entry) => ({
    name: entry.label,
    expectedSemanticDigest: canonicalDigest.digest,
    actualSemanticDigest: entry.semanticDigest?.digest ?? null,
    classification: entry.classification,
  }));
  validation.errors = errors;
  validation.freshness = freshness;

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  console.log(`Soldier Stage 6-5 Semantic Freshness R1: ${status}`);
  console.log(`Membership projection: ${STAGE65_MEMBERSHIP_PROJECTION}`);
  console.log(`Raw blob mismatches / provenance-only / blocking: ${rawBlobMismatchCount}/${provenanceOnlyChangedCount}/${blockingSnapshots.length}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
