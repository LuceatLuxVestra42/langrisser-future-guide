import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const STAGE2_SCRIPT = 'scripts/audit-localization.mjs';
const LOWER_PATH = 'data/presentation/soldier-lower-tier-name-kr.v1.json';
const EXPECTED_PATH = 'data/validation/localization-audit-soldier-stage2-1.v1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function fingerprintLowerTier(records) {
  const payload = records
    .map((record) => [record.soldierId, record.tier, record.nameCn, record.nameKr])
    .sort((left, right) => left[0] - right[0]);
  return crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

function runStage2(argument) {
  const run = spawnSync(process.execPath, [STAGE2_SCRIPT, argument], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return {
    status: run.status ?? 1,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
  };
}

function loadStage2Result() {
  const run = runStage2('--json');
  if (run.status !== 0) {
    throw new Error(`Stage 2 audit failed before Stage 2.1 drift evaluation.\n${run.stdout}${run.stderr}`);
  }
  return JSON.parse(run.stdout);
}

function buildResult() {
  const stage2 = loadStage2Result();
  const lower = readJson(LOWER_PATH);
  const records = Array.isArray(lower.records) ? lower.records : [];
  return {
    version: 1,
    schemaId: 'localization-audit-soldier-stage2-1/v1',
    stage: '2.1',
    entity: 'Soldier',
    status: stage2.status,
    mode: 'READ_ONLY_AUDIT',
    purpose: 'freeze exact confirmed lower-tier Korean presentation strings so silent spacing or wording drift requires explicit snapshot approval',
    stage2: {
      schemaId: stage2.schemaId,
      status: stage2.status,
      canonicalRecords: stage2.summary?.canonicalRecords ?? null,
      effectiveKoreanDisplayRecords: stage2.summary?.effectiveKoreanDisplayRecords ?? null,
      errors: stage2.summary?.errors ?? null,
      reviews: stage2.summary?.reviews ?? null,
    },
    lowerTierPresentation: {
      path: LOWER_PATH,
      recordCount: records.length,
      fingerprintAlgorithm: 'sha256',
      fingerprintSort: 'soldierId-ascending',
      fingerprintFields: ['soldierId', 'tier', 'nameCn', 'nameKr'],
      fingerprint: fingerprintLowerTier(records),
    },
    readOnlyExecution: true,
  };
}

function runSelfTest() {
  const stage2SelfTest = runStage2('--self-test');
  const match = stage2SelfTest.stdout.match(/PASS \((\d+)\/(\d+)\)/);
  const basePassed = stage2SelfTest.status === 0 && match ? Number(match[1]) : 0;
  const baseTotal = match ? Number(match[2]) : 6;

  const lower = readJson(LOWER_PATH);
  const baselineRecords = Array.isArray(lower.records) ? lower.records : [];
  const mutatedRecords = JSON.parse(JSON.stringify(baselineRecords));
  const target = mutatedRecords.find((record) => typeof record.nameKr === 'string' && record.nameKr.includes(' ')) ?? mutatedRecords[0];
  if (target) {
    target.nameKr = target.nameKr.includes(' ')
      ? target.nameKr.replace(' ', '')
      : `${target.nameKr} `;
  }
  const driftDetected = fingerprintLowerTier(baselineRecords) !== fingerprintLowerTier(mutatedRecords);
  const total = baseTotal + 1;
  const passed = basePassed + (driftDetected ? 1 : 0);
  return {
    status: stage2SelfTest.status === 0 && basePassed === baseTotal && driftDetected ? 'PASS' : 'FAIL',
    total,
    passed,
    driftDetected,
  };
}

const args = new Set(process.argv.slice(2));

if (args.has('--self-test')) {
  const result = runSelfTest();
  console.log(`Localization Audit Stage 2.1 self-test: ${result.status} (${result.passed}/${result.total})`);
  if (!result.driftDetected) console.error('Confirmed presentation string drift fingerprint self-test did not change.');
  if (result.status === 'FAIL') process.exit(1);
  process.exit(0);
}

const result = buildResult();

if (args.has('--check')) {
  const stage2Check = runStage2('--check');
  if (stage2Check.status !== 0) {
    process.stderr.write(stage2Check.stdout);
    process.stderr.write(stage2Check.stderr);
    process.exit(1);
  }

  const expected = readJson(EXPECTED_PATH);
  if (result.lowerTierPresentation.fingerprint !== expected.lowerTierPresentation?.fingerprint) {
    console.error('Localization Audit Stage 2.1: FAIL');
    console.error('CONFIRMED_PRESENTATION_DRIFT: lower-tier Korean presentation fingerprint changed.');
    console.error(`expected ${expected.lowerTierPresentation?.fingerprint ?? 'missing'}`);
    console.error(`current  ${result.lowerTierPresentation.fingerprint}`);
    process.exit(1);
  }
  if (JSON.stringify(stable(result)) !== JSON.stringify(stable(expected))) {
    console.error('Localization Audit Stage 2.1 snapshot mismatch.');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(`Localization Audit Stage 2.1: ${result.status}`);
  console.log(`Soldier ${result.stage2.canonicalRecords}, display ${result.stage2.effectiveKoreanDisplayRecords}, errors ${result.stage2.errors}, reviews ${result.stage2.reviews}`);
  console.log(`Lower-tier confirmed presentation fingerprint: ${result.lowerTierPresentation.fingerprint}`);
} else if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`LOCALIZATION AUDIT — ${result.entity} / Stage 2.1`);
  console.log(`status: ${result.status}`);
  console.log(`lower-tier confirmed presentation: ${result.lowerTierPresentation.recordCount}`);
  console.log(`fingerprint: ${result.lowerTierPresentation.fingerprint}`);
}
