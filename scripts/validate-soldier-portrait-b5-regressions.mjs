import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveBatch, validateAdmission } from './resolve-soldier-portrait-batch-b4.mjs';
import { processBatch } from './process-soldier-portrait-batch-b4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = 'data/contracts/soldier-portrait-b5-regression.v1.json';
const B4_VALIDATION_PATH = 'data/validation/soldier-portrait-b4-fixture-validation.v1.json';
const FIXTURE_BATCH_PATH = 'data/contracts/soldier-portrait-b4-fixture-batch.v1.json';
const CURRENT_PLAN_PATH = 'data/validation/soldier-portrait-batch-plan.v1.json';
const LOCATOR_PATH = 'data/contracts/soldier-portrait-assets-current.v1.json';
const HYDRATOR_PATH = 'scripts/hydrate-soldier-portrait-source-pack-v1.mjs';
const OWNING_VALIDATOR_PATH = 'scripts/validate-soldier-portrait-v9-final.mjs';

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

function readJson(value) {
  return JSON.parse(fs.readFileSync(resolvePath(value), 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assert(condition, message, detail = null) {
  if (!condition) throw new Error(`${message}${detail == null ? '' : `: ${JSON.stringify(detail)}`}`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertJson(actual, expected, message) {
  assert(sameJson(actual, expected), message, { expected, actual });
}

function sortedIds(values) {
  return [...values].sort((a, b) => a - b);
}

async function expectBlocker(label, expectedCode, operation) {
  try {
    await operation();
  } catch (error) {
    assert(error?.code === expectedCode, `${label} blocker code`, {
      expected: expectedCode,
      actual: error?.code ?? error?.message ?? null,
      detail: error?.detail ?? null,
    });
    return;
  }
  throw new Error(`${label} must fail closed with ${expectedCode}`);
}

function expectProcessFailure(label, result, expectedNeedle) {
  assert(!result.error, `${label} process launch`, result.error?.message ?? null);
  assert(result.status !== 0, `${label} must exit non-zero`, { status: result.status });
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert(combined.includes(expectedNeedle), `${label} expected failure signature`, {
    expectedNeedle,
    status: result.status,
    output: combined.slice(-4000),
  });
}

function copyPngs(sourceDir, destinationDir, ids) {
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const id of ids) {
    fs.copyFileSync(path.join(sourceDir, `${id}.png`), path.join(destinationDir, `${id}.png`));
  }
}

function makeFixtureBatch(baseFixture, ids) {
  const wanted = sortedIds(ids);
  const selected = new Set(wanted);
  const batch = structuredClone(baseFixture);
  batch.status = 'BATCH_READY';
  batch.fixtureOnly = true;
  batch.newIds = wanted;
  batch.removedIds = [];
  batch.records = (baseFixture.records ?? []).filter((record) => selected.has(record?.soldierId));
  assertJson(sortedIds(batch.records.map((record) => record.soldierId)), wanted, 'fixture subset records');
  validateAdmission(wanted, batch, 'fixture');
  return batch;
}

async function runFixtureBatchCase({ label, ids, baseFixture, tempRoot, locator, sourceManifest, webManifest }) {
  const batch = makeFixtureBatch(baseFixture, ids);
  const intakeDir = path.join(tempRoot, `${label}-intake`);
  const outputDir = path.join(tempRoot, `${label}-output`);
  const resolution = await resolveBatch({ mode: 'fixture', batch, admission: batch, outDir: intakeDir });
  const result = await processBatch({ mode: 'fixture', batch, resolution, intakeDir, outputDir });

  assert(result.status === 'PASS', `${label} status`, result.status ?? null);
  assert(result.fixtureOnly === true, `${label} fixture boundary`);
  assertJson(result.generatedWebpIds, sortedIds(ids), `${label} generated WebP IDs`);
  assert(result.newSourceCount === ids.length, `${label} new source count`, result.newSourceCount);
  assert(result.candidateSourceCount === sourceManifest.records.length + ids.length, `${label} candidate source count`);
  assert(result.reusedWebpCount === webManifest.records.length, `${label} reused WebP count`);
  assert(result.candidateWebpCount === webManifest.records.length + ids.length, `${label} candidate WebP count`);
  assert(result.productionLocatorChanged === false, `${label} production locator unchanged`);
  assert(result.productionWebCurrentChanged === false, `${label} production web-current unchanged`);
  assert(result.repositoryAssetBytesChanged === false, `${label} repository bytes unchanged`);
  assert(result.boundaries?.oldPngRedownloaded === false, `${label} old PNG redownload boundary`);
  assert(result.boundaries?.oldWebpReencoded === false, `${label} old WebP reencode boundary`);
  assert(result.boundaries?.newOnlyWebpConversion === true, `${label} new-only WebP conversion`);

  return { batch, intakeDir, outputDir, resolution, result };
}

function runSourceDriftCase(tempRoot, locator) {
  const sourcePackContract = readJson(locator.currentSourcePackContract);
  const drifted = structuredClone(sourcePackContract);
  const originalSha = drifted.storage.archive.sha256;
  const replacementFirst = originalSha[0] === '0' ? '1' : '0';
  drifted.storage.archive.sha256 = `${replacementFirst}${originalSha.slice(1)}`;
  assert(drifted.storage.archive.sha256 !== originalSha, 'source drift fixture must change archive SHA');

  const driftContractPath = path.join(tempRoot, 'source-drift-contract.json');
  writeJson(driftContractPath, drifted);
  const result = spawnSync(process.execPath, [resolvePath(HYDRATOR_PATH), '--contract', driftContractPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  expectProcessFailure('source drift', result, `${sourcePackContract.storage.archive.name} SHA-256 mismatch`);
  return {
    releaseTag: sourcePackContract.storage.releaseTag,
    archive: sourcePackContract.storage.archive.name,
    expectedGate: 'pinned archive SHA-256 mismatch',
  };
}

function runWebpDriftCase(tempRoot, locator) {
  const webManifest = readJson(locator.currentWebManifest);
  const sandboxRoot = path.join(tempRoot, 'webp-drift-validator-root');
  const sandboxScripts = path.join(sandboxRoot, 'scripts');
  const sandboxWebDir = path.join(sandboxRoot, 'public', webManifest.publicRoot);
  fs.mkdirSync(sandboxScripts, { recursive: true });
  fs.mkdirSync(path.dirname(sandboxWebDir), { recursive: true });

  fs.symlinkSync(path.join(ROOT, 'data'), path.join(sandboxRoot, 'data'), 'dir');
  fs.copyFileSync(resolvePath(OWNING_VALIDATOR_PATH), path.join(sandboxScripts, path.basename(OWNING_VALIDATOR_PATH)));
  fs.copyFileSync(resolvePath(HYDRATOR_PATH), path.join(sandboxScripts, path.basename(HYDRATOR_PATH)));
  fs.cpSync(path.join(ROOT, 'public', webManifest.publicRoot), sandboxWebDir, { recursive: true });

  const target = [...webManifest.records].sort((a, b) => a.soldierId - b.soldierId)[0];
  assert(target && typeof target.fileName === 'string', 'webp drift target record');
  const targetPath = path.join(sandboxWebDir, target.fileName);
  const bytes = fs.readFileSync(targetPath);
  assert(bytes.length > 16, 'webp drift target byte length', bytes.length);
  bytes[bytes.length - 1] ^= 0x01;
  fs.writeFileSync(targetPath, bytes);

  const result = spawnSync(process.execPath, [path.join(sandboxScripts, path.basename(OWNING_VALIDATOR_PATH))], {
    cwd: sandboxRoot,
    encoding: 'utf8',
  });
  expectProcessFailure('WebP drift', result, 'webp-sha256-mismatch');
  return { soldierId: target.soldierId, fileName: target.fileName, expectedGate: 'webp-sha256-mismatch' };
}

const contract = readJson(CONTRACT_PATH);
assert(contract.schemaId === 'soldier-portrait-b5-regression/v1', 'B5 contract schema');
assert(contract.status === 'DESIGN_FROZEN' || contract.status === 'PASS', 'B5 contract status', contract.status);
assert(contract.owner === 'soldier-assets', 'B5 contract owner', contract.owner);
assert(contract.executionPolicy?.useExistingB4ResolverAndProcessor === true, 'B5 must reuse B4 processor');
assert(contract.executionPolicy?.useExistingSourcePackVerifier === true, 'B5 must reuse source-pack verifier');
assert(contract.executionPolicy?.useExistingOwningValidatorForWebpDrift === true, 'B5 must reuse owning validator');
assert(contract.executionPolicy?.trackedRepositoryMutationAllowed === false, 'B5 tracked mutation boundary');
assert(contract.boundaries?.semanticAuthority === false, 'B5 semantic authority boundary');
assert(contract.boundaries?.semanticRecomputation === false, 'B5 semantic recomputation boundary');
assert(contract.boundaries?.nameJoin === false, 'B5 name JOIN boundary');
assert(contract.boundaries?.idArithmetic === false, 'B5 ID arithmetic boundary');

const b4Validation = readJson(B4_VALIDATION_PATH);
assert(b4Validation.status === 'PASS', 'B4 predecessor must remain PASS', b4Validation.status);
assert(b4Validation.nextStage === 'B5 regression fixtures', 'B4 handoff must target B5', b4Validation.nextStage);

const currentPlan = readJson(CURRENT_PLAN_PATH);
const locator = readJson(LOCATOR_PATH);
const sourceManifest = readJson(locator.currentSourceManifest);
const webManifest = readJson(locator.currentWebManifest);
const baseFixture = readJson(FIXTURE_BATCH_PATH);

assert(currentPlan.status === contract.cases.zero.expectedProductionPlan, 'zero case production plan status', currentPlan.status);
assertJson(currentPlan.result?.newIds ?? [], [], 'zero case production newIds');
assertJson(currentPlan.result?.removedIds ?? [], [], 'zero case production removedIds');
assert(baseFixture.fixtureOnly === true && baseFixture.status === 'BATCH_READY', 'B4 fixture predecessor boundary');
assertJson(sortedIds(contract.cases.four.ids), sortedIds(baseFixture.newIds), 'four case must reuse admitted B4 fixture IDs');
assert(contract.cases.one.ids.length === 1, 'one case size');
assert(contract.cases.four.ids.length === 4, 'four case size');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'soldier-b5-'));
try {
  const zeroOut = path.join(tempRoot, 'zero-must-not-create-intake');
  await expectBlocker('zero delta', contract.cases.zero.expectedProcessorGate, async () => {
    await resolveBatch({ mode: 'production', batch: currentPlan, admission: baseFixture, outDir: zeroOut });
  });
  assert(!fs.existsSync(zeroOut), 'zero case must not create intake directory');

  const one = await runFixtureBatchCase({
    label: 'one',
    ids: contract.cases.one.ids,
    baseFixture,
    tempRoot,
    locator,
    sourceManifest,
    webManifest,
  });
  assert(one.result.generatedWebpIds.length === contract.cases.one.expectedGeneratedWebpCount, 'one case generated WebP count');

  const four = await runFixtureBatchCase({
    label: 'four',
    ids: contract.cases.four.ids,
    baseFixture,
    tempRoot,
    locator,
    sourceManifest,
    webManifest,
  });
  assert(four.result.generatedWebpIds.length === contract.cases.four.expectedGeneratedWebpCount, 'four case generated WebP count');

  const missingDir = path.join(tempRoot, 'missing-intake');
  copyPngs(four.intakeDir, missingDir, contract.cases.four.ids.slice(0, -1));
  await expectBlocker('missing intake', contract.cases.missing.expectedGate, async () => {
    await processBatch({
      mode: 'fixture',
      batch: four.batch,
      resolution: four.resolution,
      intakeDir: missingDir,
      outputDir: path.join(tempRoot, 'missing-output'),
    });
  });

  const extraDir = path.join(tempRoot, 'extra-intake');
  copyPngs(four.intakeDir, extraDir, contract.cases.four.ids);
  fs.copyFileSync(path.join(extraDir, `${contract.cases.four.ids[0]}.png`), path.join(extraDir, '999999.png'));
  await expectBlocker('extra intake', contract.cases.extra.expectedGate, async () => {
    await processBatch({
      mode: 'fixture',
      batch: four.batch,
      resolution: four.resolution,
      intakeDir: extraDir,
      outputDir: path.join(tempRoot, 'extra-output'),
    });
  });

  const sourceDrift = runSourceDriftCase(tempRoot, locator);
  const webpDrift = runWebpDriftCase(tempRoot, locator);

  const productionPlanAfter = readJson(CURRENT_PLAN_PATH);
  const locatorAfter = readJson(LOCATOR_PATH);
  assertJson(productionPlanAfter, currentPlan, 'production B3 plan must remain unchanged');
  assertJson(locatorAfter, locator, 'current asset locator must remain unchanged');

  console.log('SOLDIER PORTRAIT B5 REGRESSION FIXTURES: PASS');
  console.log(JSON.stringify({
    productionPlan: currentPlan.status,
    cases: {
      zero: { status: 'PASS', expectedGate: contract.cases.zero.expectedProcessorGate },
      one: { status: one.result.status, ids: one.result.generatedWebpIds, candidateSourceCount: one.result.candidateSourceCount, candidateWebpCount: one.result.candidateWebpCount },
      four: { status: four.result.status, ids: four.result.generatedWebpIds, candidateSourceCount: four.result.candidateSourceCount, candidateWebpCount: four.result.candidateWebpCount },
      missing: { status: 'PASS', expectedGate: contract.cases.missing.expectedGate },
      extra: { status: 'PASS', expectedGate: contract.cases.extra.expectedGate },
      sourceDrift: { status: 'PASS', ...sourceDrift },
      webpDrift: { status: 'PASS', ...webpDrift },
    },
    productionLocatorChanged: false,
    productionPlanChanged: false,
    repositoryAssetBytesChanged: false,
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
