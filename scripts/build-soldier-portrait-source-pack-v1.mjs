import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = 'public/images/soldiers';
const SOURCE_MANIFEST = 'data/generated/soldier-portrait-manifest.v9.json';
const WEB_MANIFEST = 'data/generated/soldier-portrait-web-manifest.v1.json';
const EXPECTED_COUNT = 224;
const EXPECTED_TOTAL_BYTES = 48931121;

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function fail(message, detail = null) {
  console.error(`SOLDIER SOURCE PACK A1: FAIL - ${message}`);
  if (detail !== null) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const sourceSha = arg('--source-sha');
const outDirArg = arg('--out-dir', 'dist/source-pack');
if (!sourceSha || !/^[a-f0-9]{40}$/.test(sourceSha)) fail('invalid --source-sha', sourceSha);

try {
  git('cat-file', '-e', `${sourceSha}^{commit}`);
} catch {
  fail('source commit is not available in checkout', sourceSha);
}

const protectedPaths = [SOURCE_DIR, SOURCE_MANIFEST, WEB_MANIFEST];
try {
  execFileSync('git', ['diff', '--quiet', `${sourceSha}..HEAD`, '--', ...protectedPaths], {
    cwd: ROOT,
    stdio: 'ignore',
  });
} catch {
  fail('source assets/manifests differ from pinned source commit', { sourceSha, protectedPaths });
}

const manifest = readJson(SOURCE_MANIFEST);
const webManifest = readJson(WEB_MANIFEST);
if (manifest?.version !== 9 || manifest?.status !== 'PASS' || manifest?.assetsReady !== true) {
  fail('source manifest is not the frozen v9 PASS input');
}
if (manifest?.publicRoot !== 'images/soldiers') fail('unexpected source publicRoot', manifest?.publicRoot);
if (webManifest?.status !== 'PASS' || webManifest?.sourceManifest !== SOURCE_MANIFEST) {
  fail('web manifest is not bound to the v9 source manifest');
}
if (webManifest?.sizeAudit?.pngTotalBytes !== EXPECTED_TOTAL_BYTES) {
  fail('web manifest PNG byte total drift', webManifest?.sizeAudit?.pngTotalBytes);
}

const records = Array.isArray(manifest?.records) ? manifest.records : [];
if (records.length !== EXPECTED_COUNT) fail('source manifest record count drift', records.length);

const sourceDirAbs = path.join(ROOT, SOURCE_DIR);
const entries = fs.readdirSync(sourceDirAbs, { withFileTypes: true });
if (entries.some((entry) => !entry.isFile())) fail('source directory contains non-file entries');
const actualNames = entries.map((entry) => entry.name).sort();
if (actualNames.length !== EXPECTED_COUNT) fail('repository source file count drift', actualNames.length);

const expectedNames = records.map((record) => record?.fileName).sort();
if (new Set(expectedNames).size !== EXPECTED_COUNT) fail('duplicate or invalid manifest file names');
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  fail('repository source file set differs from v9 manifest', {
    missing: expectedNames.filter((name) => !actualNames.includes(name)),
    extra: actualNames.filter((name) => !expectedNames.includes(name)),
  });
}

let totalBytes = 0;
const inventoryRecords = [];
for (const record of records) {
  const soldierId = record?.soldierId;
  const fileName = record?.fileName;
  if (!Number.isInteger(soldierId) || fileName !== `${soldierId}.png`) {
    fail('invalid exact ID -> filename binding', { soldierId, fileName });
  }
  if (typeof record?.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    fail('invalid source SHA-256 in v9 manifest', soldierId);
  }

  const bytes = fs.readFileSync(path.join(sourceDirAbs, fileName));
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== record.sha256) {
    fail('repository PNG SHA-256 mismatch', { soldierId, fileName, expected: record.sha256, actual: actualSha256 });
  }
  if (bytes.length !== record.size) {
    fail('repository PNG size mismatch', { soldierId, fileName, expected: record.size, actual: bytes.length });
  }
  if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    fail('repository source is not a PNG byte stream', { soldierId, fileName });
  }

  totalBytes += bytes.length;
  inventoryRecords.push({ soldierId, fileName, size: bytes.length, sha256: actualSha256, isSp: record?.isSp === true });
}

if (totalBytes !== EXPECTED_TOTAL_BYTES) fail('repository PNG total byte drift', totalBytes);

const outDir = path.resolve(ROOT, outDirArg);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const shortSha = sourceSha.slice(0, 8);
const archiveBase = `soldier-portrait-source-v9-${shortSha}`;
const tarPath = path.join(outDir, `${archiveBase}.tar`);
const archivePath = `${tarPath}.gz`;

execFileSync('tar', [
  '--sort=name',
  '--mtime=@0',
  '--owner=0',
  '--group=0',
  '--numeric-owner',
  '-C',
  sourceDirAbs,
  '-cf',
  tarPath,
  '.',
], { cwd: ROOT, stdio: 'inherit' });
execFileSync('gzip', ['-n', '-9', tarPath], { cwd: ROOT, stdio: 'inherit' });

const verifyDir = path.join(outDir, '.verify');
fs.mkdirSync(verifyDir, { recursive: true });
execFileSync('tar', ['-xzf', archivePath, '-C', verifyDir], { cwd: ROOT, stdio: 'inherit' });

const extractedNames = fs.readdirSync(verifyDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(extractedNames) !== JSON.stringify(expectedNames)) {
  fail('archive extraction file set mismatch', { extractedCount: extractedNames.length });
}
for (const record of inventoryRecords) {
  const extracted = fs.readFileSync(path.join(verifyDir, record.fileName));
  const extractedSha = sha256(extracted);
  if (extractedSha !== record.sha256 || extracted.length !== record.size) {
    fail('archive round-trip byte mismatch', { soldierId: record.soldierId, fileName: record.fileName });
  }
}
fs.rmSync(verifyDir, { recursive: true, force: true });

const archiveBytes = fs.readFileSync(archivePath);
const archiveSha256 = sha256(archiveBytes);
const sourceManifestBlobSha = git('rev-parse', `${sourceSha}:${SOURCE_MANIFEST}`);
const webManifestBlobSha = git('rev-parse', `${sourceSha}:${WEB_MANIFEST}`);

const inventory = {
  version: 1,
  schemaId: 'soldier-portrait-source-pack-inventory/v1',
  stage: 'repository-size-reduction-1A-A1',
  status: 'PASS',
  sourceCommitSha: sourceSha,
  sourceDirectory: SOURCE_DIR,
  sourceManifest: {
    path: SOURCE_MANIFEST,
    version: 9,
    gitBlobSha: sourceManifestBlobSha,
  },
  webManifestBinding: {
    path: WEB_MANIFEST,
    gitBlobSha: webManifestBlobSha,
    publicRoot: webManifest.publicRoot,
  },
  policy: {
    exactBytesOnly: true,
    noReencoding: true,
    noNameJoin: true,
    noFilenameSimilarity: true,
    noIdArithmetic: true,
    archiveRoundTripSha256Verified: true,
  },
  coverage: {
    fileCount: inventoryRecords.length,
    totalBytes,
    canonicalSoldierCount: manifest.coverage?.canonicalSoldierCount,
    normalCount: manifest.coverage?.canonicalNormalCount,
    spCount: manifest.coverage?.canonicalSpCount,
  },
  archive: {
    fileName: path.basename(archivePath),
    format: 'tar.gz',
    deterministicTar: true,
    gzipTimestampSuppressed: true,
    size: archiveBytes.length,
    sha256: archiveSha256,
  },
  records: inventoryRecords,
};

const inventoryPath = path.join(outDir, `${archiveBase}.inventory.json`);
fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
const inventorySha256 = sha256(fs.readFileSync(inventoryPath));
const checksumsPath = path.join(outDir, `${archiveBase}.sha256`);
fs.writeFileSync(checksumsPath,
  `${archiveSha256}  ${path.basename(archivePath)}\n${inventorySha256}  ${path.basename(inventoryPath)}\n`,
);

console.log('SOLDIER SOURCE PACK A1: PASS');
console.log(JSON.stringify({
  sourceCommitSha: sourceSha,
  fileCount: inventoryRecords.length,
  totalBytes,
  archive: path.basename(archivePath),
  archiveBytes: archiveBytes.length,
  archiveSha256,
  inventory: path.basename(inventoryPath),
  inventorySha256,
  checksums: path.basename(checksumsPath),
}, null, 2));