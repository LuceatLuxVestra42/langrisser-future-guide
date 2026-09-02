import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveBatch, validateAdmission } from './resolve-soldier-portrait-batch-b4.mjs';
import { processBatch } from './process-soldier-portrait-batch-b4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_BATCH_PATH = 'data/contracts/soldier-portrait-b4-fixture-batch.v1.json';
const CURRENT_PLAN_PATH = 'data/validation/soldier-portrait-batch-plan.v1.json';
const LOCATOR_PATH = 'data/contracts/soldier-portrait-assets-current.v1.json';
const IMAGE_HELPER = path.join(ROOT, 'scripts/inspect-soldier-portrait-image-b4.py');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function assert(condition, message, detail = null) {
  if (!condition) throw new Error(`${message}${detail == null ? '' : `: ${JSON.stringify(detail)}`}`);
}

function assertJson(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message, { expected, actual });
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function expectBlocker(label, expectedCode, operation) {
  try {
    await operation();
  } catch (error) {
    assert(error?.code === expectedCode, `${label} blocker code`, { expectedCode, actual: error?.code ?? error?.message });
    return;
  }
  throw new Error(`${label} must fail closed`);
}

function copyPngs(sourceDir, destinationDir, ids) {
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const id of ids) fs.copyFileSync(path.join(sourceDir, `${id}.png`), path.join(destinationDir, `${id}.png`));
}

function generateOpaque(filePath, seed) {
  const result = spawnSync('python3', [IMAGE_HELPER, 'generate-fixture', filePath, '--seed', String(seed), '--opaque'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert(!result.error && result.status === 0, 'opaque fixture generation', { status: result.status, stderr: result.stderr });
}

const currentPlan = readJson(CURRENT_PLAN_PATH);
assert(currentPlan.status === 'NO_UPDATE_REQUIRED', 'production B3 checkpoint must remain NO_UPDATE_REQUIRED');
assertJson(currentPlan.result?.newIds ?? [], [], 'production B3 newIds remain empty');
assertJson(currentPlan.result?.removedIds ?? [], [], 'production B3 removedIds remain empty');

const fixtureBatch = readJson(FIXTURE_BATCH_PATH);
assert(fixtureBatch.fixtureOnly === true, 'fixture batch boundary');
assert(fixtureBatch.status === 'BATCH_READY', 'fixture batch status');
assert(Array.isArray(fixtureBatch.newIds) && fixtureBatch.newIds.length === 4, 'fixture batch must exercise N=4');
assertJson(fixtureBatch.removedIds, [], 'fixture removedIds');
assert(fixtureBatch.boundaries?.semanticAuthority === false, 'fixture must not be semantic authority');
assert(fixtureBatch.boundaries?.productionAdmissionAllowed === false, 'fixture production admission must be disabled');

validateAdmission([...fixtureBatch.newIds].sort((a, b) => a - b), fixtureBatch, 'fixture');
const badAdmission = structuredClone(fixtureBatch);
badAdmission.records = badAdmission.records.slice(0, -1);
await expectBlocker('admission missing ID', 'admission-id-set-mismatch', async () => {
  validateAdmission([...fixtureBatch.newIds].sort((a, b) => a - b), badAdmission, 'fixture');
});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'soldier-b4-'));
try {
  await expectBlocker('production mode on zero-delta B3', 'batch-not-ready', async () => {
    await resolveBatch({
      mode: 'production',
      batch: currentPlan,
      admission: fixtureBatch,
      outDir: path.join(tempRoot, 'must-not-create-production-intake'),
    });
  });

  const intakeDir = path.join(tempRoot, 'fixture-intake');
  const resolution = await resolveBatch({ mode: 'fixture', batch: fixtureBatch, admission: fixtureBatch, outDir: intakeDir });
  assertJson(resolution.expectedIds, fixtureBatch.newIds, 'fixture resolved IDs');
  assert(resolution.records.length === fixtureBatch.newIds.length, 'fixture resolution record count');

  const missingDir = path.join(tempRoot, 'missing-intake');
  copyPngs(intakeDir, missingDir, fixtureBatch.newIds.slice(0, -1));
  await expectBlocker('missing intake PNG', 'file-set-mismatch', async () => {
    await processBatch({ mode: 'fixture', batch: fixtureBatch, resolution, intakeDir: missingDir, outputDir: path.join(tempRoot, 'missing-output') });
  });

  const extraDir = path.join(tempRoot, 'extra-intake');
  copyPngs(intakeDir, extraDir, fixtureBatch.newIds);
  fs.copyFileSync(path.join(extraDir, `${fixtureBatch.newIds[0]}.png`), path.join(extraDir, '999999.png'));
  await expectBlocker('extra intake PNG', 'file-set-mismatch', async () => {
    await processBatch({ mode: 'fixture', batch: fixtureBatch, resolution, intakeDir: extraDir, outputDir: path.join(tempRoot, 'extra-output') });
  });

  const opaqueDir = path.join(tempRoot, 'opaque-intake');
  copyPngs(intakeDir, opaqueDir, fixtureBatch.newIds);
  const opaqueResolution = structuredClone(resolution);
  const opaqueId = fixtureBatch.newIds[0];
  const opaquePath = path.join(opaqueDir, `${opaqueId}.png`);
  generateOpaque(opaquePath, opaqueId);
  const opaqueBytes = fs.readFileSync(opaquePath);
  const opaqueRecord = opaqueResolution.records.find((record) => record.soldierId === opaqueId);
  opaqueRecord.size = opaqueBytes.length;
  opaqueRecord.sha256 = sha256(opaqueBytes);
  await expectBlocker('opaque intake PNG', 'source-transparency-ratio', async () => {
    await processBatch({ mode: 'fixture', batch: fixtureBatch, resolution: opaqueResolution, intakeDir: opaqueDir, outputDir: path.join(tempRoot, 'opaque-output') });
  });

  const successOutput = path.join(tempRoot, 'success-output');
  const result = await processBatch({ mode: 'fixture', batch: fixtureBatch, resolution, intakeDir, outputDir: successOutput });
  const locator = readJson(LOCATOR_PATH);
  const sourceManifest = readJson(locator.currentSourceManifest);
  const webManifest = readJson(locator.currentWebManifest);

  assert(result.status === 'PASS' && result.fixtureOnly === true, 'fixture batch result status');
  assert(result.baseSourceCount === sourceManifest.records.length, 'base source count is relational');
  assert(result.hydratedPreviousSourceCount === sourceManifest.records.length, 'all previous source bytes hydrated');
  assert(result.newSourceCount === fixtureBatch.newIds.length, 'new source count');
  assert(result.candidateSourceCount === sourceManifest.records.length + fixtureBatch.newIds.length, 'candidate source count');
  assert(result.reusedWebpCount === webManifest.records.length, 'existing WebP count reused');
  assertJson(result.generatedWebpIds, fixtureBatch.newIds, 'new-only generated WebP IDs');
  assert(result.candidateWebpCount === webManifest.records.length + fixtureBatch.newIds.length, 'candidate WebP count');
  assert(result.productionLocatorChanged === false, 'production locator unchanged');
  assert(result.productionWebCurrentChanged === false, 'production web-current unchanged');
  assert(result.repositoryAssetBytesChanged === false, 'repository asset bytes unchanged');
  assert(result.boundaries?.oldPngRedownloaded === false, 'old PNGs must not be redownloaded');
  assert(result.boundaries?.oldWebpReencoded === false, 'old WebPs must not be reencoded');
  assert(result.boundaries?.newOnlyWebpConversion === true, 'only new PNGs converted');

  const metaDir = path.join(successOutput, 'meta');
  const sourceCandidate = JSON.parse(fs.readFileSync(path.join(metaDir, 'source-manifest-candidate.json'), 'utf8'));
  const webCandidate = JSON.parse(fs.readFileSync(path.join(metaDir, 'web-manifest-candidate.json'), 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(path.join(metaDir, 'source-pack-inventory-candidate.json'), 'utf8'));
  const candidateContract = JSON.parse(fs.readFileSync(path.join(metaDir, 'source-pack-candidate-contract.json'), 'utf8'));
  assert(sourceCandidate.status === 'FIXTURE_CANDIDATE' && sourceCandidate.fixtureOnly === true, 'source candidate fixture boundary');
  assert(sourceCandidate.coverage.candidateCount === result.candidateSourceCount, 'source candidate coverage');
  assert(webCandidate.policy?.newWebpOnlyConversion === true && webCandidate.policy?.decodedPixelExact === true, 'WebP candidate lossless policy');
  assert(inventory.coverage.fileCount === result.candidateSourceCount, 'candidate inventory full file set');
  assert(candidateContract.promotionPolicy?.releaseAssetOverwriteAllowed === false, 'source pack overwrite prohibited');
  assert(candidateContract.promotionPolicy?.currentLocatorMutationAllowedInB4 === false, 'B4 cannot mutate current locator');
  assert(candidateContract.promotionPolicy?.productionAdmissionAllowedForFixture === false, 'fixture cannot be admitted');
  assert(fs.existsSync(path.join(metaDir, 'source-pack-candidate.tar.gz')), 'candidate archive exists');
  assert(fs.existsSync(path.join(metaDir, 'source-pack-candidate.sha256')), 'candidate checksums exist');

  console.log('SOLDIER PORTRAIT B4 FIXTURE PIPELINE: PASS');
  console.log(JSON.stringify({
    productionPlan: currentPlan.status,
    fixtureIds: fixtureBatch.newIds,
    previousSourceHydrated: result.hydratedPreviousSourceCount,
    generatedWebpIds: result.generatedWebpIds,
    candidateSourceCount: result.candidateSourceCount,
    candidateWebpCount: result.candidateWebpCount,
    missingGate: 'BLOCKER',
    extraGate: 'BLOCKER',
    transparencyGate: 'BLOCKER',
    productionLocatorChanged: false
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
