const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const semanticPredecessor = {
  commit: '1a80d5c63baf8fe6ffa42823977572a8ceba5dd1',
  path: 'scripts/finalize-soldier-stage6-6-expansion-basis.cjs',
  blobSha: 'c3f8e6b0e7085db7c759e8c3c5246ef90397ce96',
};

const paths = {
  fullRecords: 'data/generated/soldier-stage6-1-full-records.v1.json',
  fullValidation: 'data/validation/soldier-stage6-1-full-records.v1.json',
  stage5_2: 'data/generated/soldier-detail-stage5-2.v1.json',
  stage5_2Validation: 'data/validation/soldier-stage5-2-combat.v1.json',
  stage5_3: 'data/generated/soldier-detail-stage5-3.v1.json',
  stage5_3Validation: 'data/validation/soldier-stage5-3-ability.v1.json',
  stage5_4: 'data/generated/soldier-detail-stage5-4.v1.json',
  stage5_4Validation: 'data/validation/soldier-stage5-4-training.v1.json',
  stage5_6: 'data/generated/soldier-detail-stage5-6.v1.json',
  stage5_6Validation: 'data/validation/soldier-stage5-6-sp-detail.v1.json',
  relationSet: 'data/generated/hero-soldier-relations.v1.json',
  relationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
  stage6_5Manifest: 'data/generated/hero-soldier-page-links-stage6-5.v1.json',
  stage6_5Validation: 'data/validation/soldier-stage6-5-reciprocal-links.v1.json',
  output: 'data/generated/soldier-stage6-6-expansion-basis.v1.json',
  validation: 'data/validation/soldier-stage6-6-expansion-basis.v1.json',
};

function abs(relativePath) { return path.join(rootDir, relativePath); }
function loadJson(relativePath) { return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8')); }
function writeJson(relativePath, value) { fs.writeFileSync(abs(relativePath), `${JSON.stringify(value, null, 2)}\n`); }
function gitBlobSha(relativePath) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${relativePath}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readPrior(relativePath) {
  try { return loadJson(relativePath); } catch { return null; }
}

function runSemanticPredecessor() {
  let source;
  try {
    source = execFileSync('git', ['show', `${semanticPredecessor.commit}:${semanticPredecessor.path}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`Unable to load Stage 6-6 semantic predecessor ${semanticPredecessor.commit}: ${error.message}`);
  }

  const predecessorBlob = execFileSync('git', ['rev-parse', `${semanticPredecessor.commit}:${semanticPredecessor.path}`], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (predecessorBlob !== semanticPredecessor.blobSha) {
    throw new Error(`Stage 6-6 semantic predecessor blob mismatch: actual=${predecessorBlob} expected=${semanticPredecessor.blobSha}`);
  }

  const tempPath = path.join(path.dirname(abs(semanticPredecessor.path)), `.stage6-6-semantic-predecessor-${process.pid}.cjs`);
  fs.writeFileSync(tempPath, source, 'utf8');
  try {
    const result = spawnSync(process.execPath, [tempPath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) {
      throw new Error(`Stage 6-6 semantic predecessor failed with exit ${result.status}`);
    }
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

async function main() {
  const {
    STAGE66_FRESHNESS_MODE,
    buildStage66FreshnessEnvelope,
    buildStage66OutputDigest,
    buildStage66SourceDigest,
    buildStage66SourceRef,
    buildStage66ValidationDigest,
    classifyStage66SourceRef,
  } = await import('./lib/soldier-stage6-6-semantic-projections.mjs');
  const { sameSemanticDigest } = await import('./lib/frozen-semantic-digest.mjs');

  const priorOutput = readPrior(paths.output);
  const priorValidation = readPrior(paths.validation);

  runSemanticPredecessor();

  const sourceValues = Object.fromEntries(
    Object.entries(paths)
      .filter(([label]) => !['output', 'validation'].includes(label))
      .map(([label, relativePath]) => [label, loadJson(relativePath)]),
  );

  const output = loadJson(paths.output);
  const validation = loadJson(paths.validation);
  if (output.status !== 'PASS' || validation.status !== 'PASS') {
    throw new Error(`Semantic predecessor did not produce PASS artifacts: output=${output.status} validation=${validation.status}`);
  }

  const observations = [];
  const sources = {};
  for (const [label, relativePath] of Object.entries(paths)) {
    if (label === 'output' || label === 'validation') continue;
    const value = sourceValues[label];
    const currentBlob = gitBlobSha(relativePath);
    const currentDigest = buildStage66SourceDigest(label, value);
    const priorRef = priorOutput?.sources?.[label] ?? null;
    const classification = classifyStage66SourceRef(priorRef, currentDigest, currentBlob);
    observations.push({ label, classification });
    sources[label] = buildStage66SourceRef({
      label,
      path: relativePath,
      value,
      currentGitBlobSha: currentBlob,
      priorRef,
    });
  }

  output.sources = sources;
  validation.sources = sources;

  const outputDigest = buildStage66OutputDigest(output);
  const validationDigest = buildStage66ValidationDigest(validation);

  if (sameSemanticDigest(priorOutput?.freshness?.semanticDigest, outputDigest) && priorOutput?.generatedAt != null) {
    output.generatedAt = priorOutput.generatedAt;
  }
  if (sameSemanticDigest(priorValidation?.freshness?.semanticDigest, validationDigest) && priorValidation?.generatedAt != null) {
    validation.generatedAt = priorValidation.generatedAt;
  }

  output.freshness = {
    ...buildStage66FreshnessEnvelope(outputDigest),
    pilotSemanticPredecessor: semanticPredecessor,
  };
  validation.freshness = {
    ...buildStage66FreshnessEnvelope(validationDigest),
    pilotSemanticPredecessor: semanticPredecessor,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  for (const [label, ref] of Object.entries(sources)) {
    const currentDigest = buildStage66SourceDigest(label, sourceValues[label]);
    const classification = classifyStage66SourceRef(ref, currentDigest, gitBlobSha(ref.path));
    if (!['SEMANTIC_FRESH', 'PROVENANCE_ONLY_CHANGED'].includes(classification)) {
      throw new Error(`Freshly written source ref ${label} is not semantically fresh: ${classification}`);
    }
  }

  const counts = observations.reduce((acc, item) => {
    acc[item.classification] = (acc[item.classification] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Soldier Stage 6-6 Freshness V2 pilot: ${STAGE66_FRESHNESS_MODE}`);
  console.log(`Source freshness observations: ${JSON.stringify(counts)}`);
  console.log(`Output semantic digest: ${output.freshness.semanticDigest.digest}`);
  console.log(`Validation semantic digest: ${validation.freshness.semanticDigest.digest}`);
}

main().catch((error) => {
  console.error(`Soldier Stage 6-6 Freshness V2 pilot: FAIL: ${error.stack || error.message}`);
  process.exitCode = 1;
});
