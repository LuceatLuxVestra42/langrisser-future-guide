import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_HELPER = 'scripts/inspect-soldier-portrait-image-b4.py';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function fail(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  throw error;
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function readJson(value) {
  return JSON.parse(fs.readFileSync(resolvePath(value), 'utf8'));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sortedIds(values) {
  if (!Array.isArray(values) || values.some((value) => !Number.isInteger(value))) {
    fail('invalid-batch-id-list', values ?? null);
  }
  const result = [...new Set(values)].sort((a, b) => a - b);
  if (result.length !== values.length) fail('duplicate-batch-id', values);
  return result;
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function readBatchIds(batch) {
  const status = batch?.status;
  const newIds = sortedIds(batch?.newIds ?? batch?.result?.newIds ?? []);
  const removedIds = sortedIds(batch?.removedIds ?? batch?.result?.removedIds ?? []);
  return { status, newIds, removedIds };
}

export function validateAdmission(expectedIds, admission, mode) {
  const records = Array.isArray(admission?.records) ? admission.records : [];
  const recordIds = sortedIds(records.map((record) => record?.soldierId));
  if (!exactJson(recordIds, expectedIds)) {
    fail('admission-id-set-mismatch', { expectedIds, recordIds });
  }

  for (const record of records) {
    const id = record.soldierId;
    if (record?.fileName !== `${id}.png`) fail('admission-file-binding', { id, fileName: record?.fileName ?? null });
    if (typeof record?.sourceKind !== 'string' || record.sourceKind.length === 0) fail('admission-source-kind', id);
    if (typeof record?.resolutionMethod !== 'string' || record.resolutionMethod.length === 0) fail('admission-resolution-method', id);
    if (mode === 'production') {
      if (admission?.fixtureOnly === true) fail('production-admission-is-fixture');
      if (typeof record?.sourceUrl !== 'string' || !record.sourceUrl.startsWith('https://')) fail('production-source-url', id);
      if (typeof record?.sourceFileName !== 'string' || !record.sourceFileName.toLowerCase().endsWith('.png')) fail('production-source-file-name', id);
      if (record?.fixtureGenerator) fail('production-fixture-generator', id);
    } else {
      if (admission?.fixtureOnly !== true) fail('fixture-admission-boundary');
      if (record?.sourceKind !== 'B4_FIXTURE_ONLY') fail('fixture-source-kind', { id, sourceKind: record?.sourceKind ?? null });
      if (record?.fixtureGenerator !== 'TRANSPARENT_RGBA_PATTERN_V1') fail('fixture-generator', id);
      if (record?.sourceUrl != null) fail('fixture-source-url-must-be-null', id);
    }
  }
  return records;
}

function ensureEmptyDirectory(directory) {
  if (fs.existsSync(directory)) {
    const entries = fs.readdirSync(directory);
    if (entries.length > 0) fail('output-directory-not-empty', { directory, entries: entries.slice(0, 10) });
  } else {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function assertPng(bytes, id) {
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) fail('source-format-invalid', id);
}

async function fetchHttps(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'langrisser-soldier-portrait-b4-resolver' },
  });
  if (!response.ok) fail('source-download-failed', { url, status: response.status });
  return Buffer.from(await response.arrayBuffer());
}

function generateFixture(filePath, soldierId) {
  const helper = resolvePath(IMAGE_HELPER);
  const result = spawnSync('python3', [helper, 'generate-fixture', filePath, '--seed', String(soldierId)], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    fail('fixture-generation-failed', { soldierId, stderr: result.stderr, stdout: result.stdout });
  }
}

export async function resolveBatch({ mode, batch, admission, outDir }) {
  if (!['fixture', 'production'].includes(mode)) fail('invalid-mode', mode);
  const { status, newIds, removedIds } = readBatchIds(batch);
  if (removedIds.length > 0) fail('removed-ids-blocker', removedIds);
  if (status !== 'BATCH_READY' || newIds.length === 0) fail('batch-not-ready', { status, newIds });
  if (mode === 'fixture' && batch?.fixtureOnly !== true) fail('fixture-batch-boundary');
  if (mode === 'production' && batch?.fixtureOnly === true) fail('production-batch-is-fixture');

  const records = validateAdmission(newIds, admission, mode);
  const output = resolvePath(outDir);
  ensureEmptyDirectory(output);

  const resolved = [];
  for (const record of records) {
    const destination = path.join(output, `${record.soldierId}.png`);
    if (mode === 'fixture') {
      generateFixture(destination, record.soldierId);
    } else {
      const bytes = await fetchHttps(record.sourceUrl);
      assertPng(bytes, record.soldierId);
      fs.writeFileSync(destination, bytes, { flag: 'wx' });
    }
    const bytes = fs.readFileSync(destination);
    assertPng(bytes, record.soldierId);
    resolved.push({
      ...record,
      intakeFileName: `${record.soldierId}.png`,
      size: bytes.length,
      sha256: sha256(bytes),
    });
  }

  const resolution = {
    version: 1,
    schemaId: 'soldier-portrait-b4-intake-resolution/v1',
    status: 'RESOLVED',
    mode: mode.toUpperCase(),
    fixtureOnly: mode === 'fixture',
    expectedIds: newIds,
    records: resolved,
    boundaries: {
      semanticAuthority: false,
      explicitIdBindingOnly: true,
      nameJoin: false,
      idArithmetic: false,
      filenameSimilarity: false,
      automaticVersionDiscovery: false,
      existingAssetRedownload: false,
    },
  };
  fs.writeFileSync(path.join(output, 'intake-resolution.json'), `${JSON.stringify(resolution, null, 2)}\n`, { flag: 'wx' });
  return resolution;
}

async function main() {
  const mode = arg('--mode');
  const batchPath = arg('--batch');
  const admissionPath = arg('--admission', batchPath);
  const outDir = arg('--out-dir');
  if (!mode || !batchPath || !admissionPath || !outDir) {
    fail('usage', 'node scripts/resolve-soldier-portrait-batch-b4.mjs --mode <fixture|production> --batch <json> [--admission <json>] --out-dir <empty-dir>');
  }
  const resolution = await resolveBatch({ mode, batch: readJson(batchPath), admission: readJson(admissionPath), outDir });
  console.log('SOLDIER PORTRAIT B4 SOURCE RESOLUTION: PASS');
  console.log(JSON.stringify({ mode: resolution.mode, fixtureOnly: resolution.fixtureOnly, resolvedIds: resolution.expectedIds }, null, 2));
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error('SOLDIER PORTRAIT B4 SOURCE RESOLUTION: BLOCKER');
    console.error(JSON.stringify({ code: error.code ?? error.message, detail: error.detail ?? null }, null, 2));
    process.exitCode = 1;
  });
}
