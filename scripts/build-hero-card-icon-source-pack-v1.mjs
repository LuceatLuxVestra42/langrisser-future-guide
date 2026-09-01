import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = 'public/images/heroes/card-icons';
const SOURCE_MANIFEST = 'data/generated/hero-card-icon-assets.v1.json';
const WEB_MANIFEST = 'data/generated/hero-card-icon-web-delivery.v1.json';
const EXPECTED_COUNT = 267;
const EXPECTED_TOTAL_BYTES = 8990485;

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function fail(message, detail = null) {
  console.error(`HERO CARD ICON SOURCE PACK H1: FAIL - ${message}`);
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
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
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

if (
  manifest?.version !== 1 ||
  manifest?.stage !== 'hero-card-icon-assets' ||
  manifest?.status !== 'PASS' ||
  manifest?.completion !== 'COMPLETE' ||
  manifest?.freezeState !== 'HERO_CARD_ICON_ASSETS_FROZEN'
) {
  fail('source manifest is not the frozen Hero card-icon v1 PASS input');
}
if (manifest?.source?.localAssetRoot !== SOURCE_DIR) {
  fail('unexpected source localAssetRoot', manifest?.source?.localAssetRoot);
}
if (
  manifest?.sourcePolicy?.rawConfigDataRead !== false ||
  manifest?.sourcePolicy?.fuzzyMatching !== false ||
  manifest?.sourcePolicy?.nameSimilarityJoin !== false ||
  manifest?.sourcePolicy?.idArithmetic !== false ||
  manifest?.sourcePolicy?.semanticRelationReopened !== false
) {
  fail('source semantic boundary drift', manifest?.sourcePolicy ?? null);
}
if (
  manifest?.summary?.heroCount !== EXPECTED_COUNT ||
  manifest?.summary?.resolvedCount !== EXPECTED_COUNT ||
  manifest?.summary?.fileCount !== EXPECTED_COUNT ||
  manifest?.summary?.pendingCount !== 0 ||
  manifest?.summary?.hardErrorCount !== 0
) {
  fail('source manifest coverage drift', manifest?.summary ?? null);
}

if (
  webManifest?.version !== 1 ||
  webManifest?.stage !== 'hero-card-icon-web-delivery' ||
  webManifest?.status !== 'PASS' ||
  webManifest?.completion !== 'COMPLETE' ||
  webManifest?.freezeState !== 'HERO_CARD_ICON_WEB_DELIVERY_FROZEN' ||
  webManifest?.sourceManifest !== SOURCE_MANIFEST
) {
  fail('web delivery manifest is not bound to the frozen source manifest');
}
if (
  webManifest?.sourcePolicy?.webDeliveryFormat !== 'LOSSLESS_WEBP' ||
  webManifest?.sourcePolicy?.semanticRelationReopened !== false ||
  webManifest?.sourcePolicy?.remoteRuntimeHotlink !== false
) {
  fail('web delivery boundary drift', webManifest?.sourcePolicy ?? null);
}
if (
  webManifest?.summary?.heroCount !== EXPECTED_COUNT ||
  webManifest?.summary?.sourcePngCount !== EXPECTED_COUNT ||
  webManifest?.summary?.webDeliveryCount !== EXPECTED_COUNT ||
  webManifest?.summary?.sourcePngTotalBytes !== EXPECTED_TOTAL_BYTES ||
  webManifest?.summary?.pendingCount !== 0 ||
  webManifest?.summary?.hardErrorCount !== 0
) {
  fail('web delivery coverage drift', webManifest?.summary ?? null);
}

const records = Array.isArray(manifest?.records) ? manifest.records : [];
if (records.length !== EXPECTED_COUNT) fail('source manifest record count drift', records.length);

const sourceDirAbs = path.join(ROOT, SOURCE_DIR);
const entries = fs.readdirSync(sourceDirAbs, { withFileTypes: true });
if (entries.some((entry) => !entry.isFile())) fail('source directory contains non-file entries');
const actualNames = entries.map((entry) => entry.name).sort();
if (actualNames.length !== EXPECTED_COUNT) fail('repository source file count drift', actualNames.length);

const expectedNames = records
  .map((record) => path.basename(record?.expectedFilePath ?? ''))
  .sort();
if (new Set(expectedNames).size !== EXPECTED_COUNT || expectedNames.some((name) => !name.endsWith('.png'))) {
  fail('duplicate or invalid manifest file names');
}
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  fail('repository source file set differs from frozen Hero card-icon manifest', {
    missing: expectedNames.filter((name) => !actualNames.includes(name)),
    extra: actualNames.filter((name) => !expectedNames.includes(name)),
  });
}

const webRecords = Array.isArray(webManifest?.records) ? webManifest.records : [];
if (webRecords.length !== EXPECTED_COUNT) fail('web delivery record count drift', webRecords.length);
const webByHeroId = new Map(webRecords.map((record) => [record?.heroId, record]));
if (webByHeroId.size !== EXPECTED_COUNT) fail('duplicate or invalid web delivery hero IDs');

let totalBytes = 0;
const inventoryRecords = [];
for (const record of records) {
  const heroId = record?.heroId;
  const expectedFilePath = record?.expectedFilePath;
  const fileName = path.basename(expectedFilePath ?? '');
  if (!Number.isInteger(heroId) || expectedFilePath !== `${SOURCE_DIR}/${heroId}.png` || fileName !== `${heroId}.png`) {
    fail('invalid exact Hero ID -> filename binding', { heroId, expectedFilePath, fileName });
  }
  if (typeof record?.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    fail('invalid source SHA-256 in Hero card-icon manifest', heroId);
  }
  if (!Number.isInteger(record?.byteLength) || record.byteLength <= 0) {
    fail('invalid source byteLength in Hero card-icon manifest', heroId);
  }

  const bytes = fs.readFileSync(path.join(sourceDirAbs, fileName));
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== record.sha256) {
    fail('repository PNG SHA-256 mismatch', {
      heroId,
      fileName,
      expected: record.sha256,
      actual: actualSha256,
    });
  }
  if (bytes.length !== record.byteLength) {
    fail('repository PNG size mismatch', {
      heroId,
      fileName,
      expected: record.byteLength,
      actual: bytes.length,
    });
  }
  if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    fail('repository source is not a PNG byte stream', { heroId, fileName });
  }

  const webRecord = webByHeroId.get(heroId);
  if (
    webRecord?.sourcePngFilePath !== expectedFilePath ||
    webRecord?.sourcePngSha256 !== record.sha256 ||
    webRecord?.sourcePngByteLength !== record.byteLength
  ) {
    fail('web delivery source binding mismatch', {
      heroId,
      sourceRecord: {
        expectedFilePath,
        sha256: record.sha256,
        byteLength: record.byteLength,
      },
      webRecord: webRecord ?? null,
    });
  }

  totalBytes += bytes.length;
  inventoryRecords.push({
    heroId,
    fileName,
    size: bytes.length,
    sha256: actualSha256,
    width: record?.width ?? null,
    height: record?.height ?? null,
  });
}

if (totalBytes !== EXPECTED_TOTAL_BYTES) fail('repository PNG total byte drift', totalBytes);

const outDir = path.resolve(ROOT, outDirArg);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const shortSha = sourceSha.slice(0, 8);
const archiveBase = `hero-card-icon-source-v1-${shortSha}`;
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

const extractedEntries = fs.readdirSync(verifyDir, { withFileTypes: true });
if (extractedEntries.some((entry) => !entry.isFile())) fail('archive extraction contains non-file entries');
const extractedNames = extractedEntries.map((entry) => entry.name).sort();
if (JSON.stringify(extractedNames) !== JSON.stringify(expectedNames)) {
  fail('archive extraction file set mismatch', { extractedCount: extractedNames.length });
}
for (const record of inventoryRecords) {
  const extracted = fs.readFileSync(path.join(verifyDir, record.fileName));
  const extractedSha = sha256(extracted);
  if (extractedSha !== record.sha256 || extracted.length !== record.size) {
    fail('archive round-trip byte mismatch', { heroId: record.heroId, fileName: record.fileName });
  }
}
fs.rmSync(verifyDir, { recursive: true, force: true });

const archiveBytes = fs.readFileSync(archivePath);
const archiveSha256 = sha256(archiveBytes);
const sourceManifestBlobSha = git('rev-parse', `${sourceSha}:${SOURCE_MANIFEST}`);
const webManifestBlobSha = git('rev-parse', `${sourceSha}:${WEB_MANIFEST}`);

const inventory = {
  version: 1,
  schemaId: 'hero-card-icon-source-pack-inventory/v1',
  stage: 'repository-size-reduction-H1',
  status: 'PASS',
  sourceCommitSha: sourceSha,
  sourceDirectory: SOURCE_DIR,
  sourceManifest: {
    path: SOURCE_MANIFEST,
    version: 1,
    freezeState: manifest.freezeState,
    gitBlobSha: sourceManifestBlobSha,
  },
  webManifestBinding: {
    path: WEB_MANIFEST,
    version: 1,
    freezeState: webManifest.freezeState,
    gitBlobSha: webManifestBlobSha,
    deliveryFormat: webManifest.sourcePolicy.webDeliveryFormat,
    webDeliveryCount: webManifest.summary.webDeliveryCount,
  },
  policy: {
    exactBytesOnly: true,
    noReencoding: true,
    noNameJoin: true,
    noFilenameSimilarity: true,
    noIdArithmetic: true,
    noSemanticRelationReopen: true,
    archiveRoundTripSha256Verified: true,
  },
  coverage: {
    fileCount: inventoryRecords.length,
    totalBytes,
    heroCount: manifest.summary.heroCount,
    missingCount: 0,
    extraCount: 0,
    duplicateCount: 0,
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
fs.writeFileSync(
  checksumsPath,
  `${archiveSha256}  ${path.basename(archivePath)}\n${inventorySha256}  ${path.basename(inventoryPath)}\n`,
);

console.log('HERO CARD ICON SOURCE PACK H1: PASS');
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
