import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONTRACT = 'data/contracts/hero-card-icon-source-pack.v1.json';
const EXPECTED_OWNER = 'hero-assets';
const EXPECTED_STAGE = 'repository-size-reduction-H2';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function fail(message, detail = null) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
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
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function jsonAtCommit(commitSha, relativePath) {
  return JSON.parse(git('show', `${commitSha}:${relativePath}`));
}

function exactKeys(object, expectedKeys, label) {
  const actual = Object.keys(object ?? {}).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} key set mismatch`, { expected, actual });
  }
}

function ensureSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`invalid ${label}`, value ?? null);
  }
}

function ensurePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) fail(`invalid ${label}`, value ?? null);
}

function apiHeaders() {
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'langrisser-future-guide-hero-card-icon-h3',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function fetchJson(url, label) {
  const response = await fetch(url, { headers: apiHeaders(), redirect: 'follow' });
  if (!response.ok) fail(`${label} request failed`, { status: response.status, url });
  return response.json();
}

async function fetchBytes(url, label) {
  const response = await fetch(url, { headers: apiHeaders(), redirect: 'follow' });
  if (!response.ok) fail(`${label} download failed`, { status: response.status, url });
  return Buffer.from(await response.arrayBuffer());
}

function assertEmptyTarget(targetDirAbs) {
  if (!fs.existsSync(targetDirAbs)) return;
  const stat = fs.statSync(targetDirAbs);
  if (!stat.isDirectory()) fail('target path exists and is not a directory', targetDirAbs);
  const entries = fs.readdirSync(targetDirAbs);
  if (entries.length !== 0) fail('target directory must be absent or empty', {
    targetDir: targetDirAbs,
    entryCount: entries.length,
  });
}

function validateTargetBoundary(targetDirAbs) {
  const repoRoot = path.resolve(ROOT);
  const detailCards = path.resolve(ROOT, 'public/images/heroes/cards');
  const productionWebp = path.resolve(ROOT, 'public/images/heroes/card-icons-webp');
  if (targetDirAbs === repoRoot || targetDirAbs === path.parse(targetDirAbs).root) {
    fail('refusing unsafe hydration target', targetDirAbs);
  }
  if (targetDirAbs === detailCards || targetDirAbs.startsWith(`${detailCards}${path.sep}`)) {
    fail('Hero detail-card artwork is outside H3 hydration scope', targetDirAbs);
  }
  if (targetDirAbs === productionWebp || targetDirAbs.startsWith(`${productionWebp}${path.sep}`)) {
    fail('production lossless WebP directory is outside H3 hydration scope', targetDirAbs);
  }
}

function parseChecksums(bytes, archiveName, inventoryName) {
  const text = bytes.toString('utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length !== 2) fail('checksum asset must contain exactly two entries', lines);
  const parsed = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
    if (!match) fail('invalid checksum line', line);
    const [, digest, name] = match;
    if (parsed.has(name)) fail('duplicate checksum entry', name);
    parsed.set(name, digest);
  }
  if (parsed.size !== 2 || !parsed.has(archiveName) || !parsed.has(inventoryName)) {
    fail('checksum file set mismatch', [...parsed.keys()]);
  }
  return parsed;
}

function validateTarMembers(archivePath, expectedNames) {
  const output = execFileSync('tar', ['-tzf', archivePath], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  const rawMembers = output.split(/\r?\n/).filter(Boolean);
  const normalizedFiles = [];
  let rootEntryCount = 0;

  for (const raw of rawMembers) {
    if (raw.includes('\\') || raw.startsWith('/')) fail('unsafe archive member path', raw);
    const segments = raw.split('/').filter((segment) => segment !== '' && segment !== '.');
    if (segments.includes('..')) fail('archive member contains path traversal', raw);
    const normalized = segments.join('/');
    if (normalized === '') {
      rootEntryCount += 1;
      continue;
    }
    if (normalized.includes('/')) fail('archive contains nested path outside flat source set', raw);
    if (!/^\d+\.png$/.test(normalized)) fail('archive contains unexpected member', raw);
    normalizedFiles.push(normalized);
  }

  if (rootEntryCount > 1) fail('archive contains duplicate root directory entries', rootEntryCount);
  if (new Set(normalizedFiles).size !== normalizedFiles.length) {
    fail('archive contains duplicate file members');
  }
  const actual = [...normalizedFiles].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const expected = [...expectedNames].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('archive member file set mismatch', {
      missing: expected.filter((name) => !actual.includes(name)),
      extra: actual.filter((name) => !expected.includes(name)),
    });
  }
}

async function main() {
  const contractPath = arg('--contract', DEFAULT_CONTRACT);
  const targetArg = arg('--target-dir');
  if (!targetArg) fail('--target-dir is required so hydration cannot silently overwrite repository assets');

  const targetDirAbs = path.resolve(ROOT, targetArg);
  validateTargetBoundary(targetDirAbs);
  assertEmptyTarget(targetDirAbs);

  const contract = readJson(contractPath);
  if (
    contract?.version !== 1 ||
    contract?.contract !== 'hero-card-icon-source-pack' ||
    contract?.status !== 'PASS' ||
    contract?.owner !== EXPECTED_OWNER ||
    contract?.stage !== EXPECTED_STAGE
  ) {
    fail('H2 Hero card-icon source-pack contract is not admitted PASS input');
  }

  const sourceManifestPath = contract?.authoritativePredecessor?.sourceManifest;
  const webManifestPath = contract?.authoritativePredecessor?.webDeliveryManifest;
  const sourceCommitSha = contract?.authoritativePredecessor?.sourceCommitSha;
  const sourcePublicPath = contract?.authoritativePredecessor?.sourcePublicPath;
  if (
    typeof sourceManifestPath !== 'string' ||
    typeof webManifestPath !== 'string' ||
    typeof sourcePublicPath !== 'string' ||
    !/^[a-f0-9]{40}$/.test(sourceCommitSha ?? '')
  ) {
    fail('invalid authoritative predecessor binding', contract?.authoritativePredecessor ?? null);
  }

  if (
    contract?.authority?.semanticAndSourceIdentity !== sourceManifestPath ||
    contract?.authority?.productionWebDelivery !== webManifestPath ||
    contract?.authority?.externalByteTransport !== 'THIS_CONTRACT_PLUS_PINNED_SHA256' ||
    contract?.authority?.externalInventoryRole !== 'BYTE_INVENTORY_PROJECTION_ONLY' ||
    contract?.authority?.externalInventoryMayCreateSemanticMappings !== false
  ) {
    fail('H2 authority boundary drift', contract?.authority ?? null);
  }

  const coverage = contract?.coverage;
  ensurePositiveInteger(coverage?.fileCount, 'contract coverage.fileCount');
  ensurePositiveInteger(coverage?.totalSourceBytes, 'contract coverage.totalSourceBytes');
  if (
    coverage?.heroCount !== coverage.fileCount ||
    coverage?.missingCount !== 0 ||
    coverage?.extraCount !== 0 ||
    coverage?.duplicateCount !== 0
  ) {
    fail('H2 contract coverage is not exact', coverage ?? null);
  }

  const storage = contract?.storage;
  if (
    storage?.kind !== 'GITHUB_RELEASE_ASSET' ||
    storage?.repository !== 'LuceatLuxVestra42/langrisser-future-guide' ||
    storage?.immutabilityPolicy !== 'CONTENT_HASH_PINNED_FAIL_CLOSED'
  ) {
    fail('unsupported or weakened storage contract', storage ?? null);
  }
  if (storage?.releaseTargetCommitSha !== sourceCommitSha) {
    fail('release target/source predecessor mismatch', {
      releaseTargetCommitSha: storage?.releaseTargetCommitSha ?? null,
      sourceCommitSha,
    });
  }

  for (const key of ['archive', 'inventory', 'checksums']) {
    const item = storage?.[key];
    ensurePositiveInteger(item?.assetId, `${key}.assetId`);
    ensurePositiveInteger(item?.bytes, `${key}.bytes`);
    if (typeof item?.name !== 'string' || item.name.length === 0) fail(`invalid ${key}.name`);
    ensureSha256(item?.sha256, `${key}.sha256`);
  }

  if (
    contract?.integrityPolicy?.archiveSha256Required !== true ||
    contract?.integrityPolicy?.inventorySha256Required !== true ||
    contract?.integrityPolicy?.checksumsAssetSha256Required !== true ||
    contract?.integrityPolicy?.archiveRoundTripVerificationRequired !== true ||
    contract?.integrityPolicy?.exactFileSetRequired !== true ||
    contract?.integrityPolicy?.perFileSha256MustMatchFrozenSourceManifest !== true ||
    contract?.integrityPolicy?.perFileSizeMustMatchFrozenSourceManifest !== true ||
    contract?.integrityPolicy?.heroIdToFileNameMustRemainExact !== true ||
    contract?.integrityPolicy?.failClosedOnAnyMismatch !== true
  ) {
    fail('H2 integrity policy is not fail-closed', contract?.integrityPolicy ?? null);
  }

  if (
    contract?.productionPolicy?.sourcePackFetchedAtRuntime !== false ||
    contract?.productionPolicy?.productionWebManifest !== webManifestPath ||
    contract?.productionPolicy?.productionWebDeliveryFormat !== 'LOSSLESS_WEBP' ||
    contract?.productionPolicy?.runtimePathChange !== false ||
    contract?.productionPolicy?.webpReencodingInThisStage !== false ||
    contract?.productionPolicy?.detailCardArtworkChange !== false
  ) {
    fail('H2 production boundary drift', contract?.productionPolicy ?? null);
  }

  if (
    contract?.semanticBoundary?.canonicalHeroChanges !== false ||
    contract?.semanticBoundary?.heroRelationChanges !== false ||
    contract?.semanticBoundary?.localizationChanges !== false ||
    contract?.semanticBoundary?.nameJoinIntroduced !== false ||
    contract?.semanticBoundary?.idArithmeticIntroduced !== false ||
    contract?.semanticBoundary?.filenameSimilarityIntroduced !== false ||
    contract?.semanticBoundary?.sourceMeaningReinterpreted !== false
  ) {
    fail('H2 semantic boundary drift', contract?.semanticBoundary ?? null);
  }

  try {
    git('cat-file', '-e', `${sourceCommitSha}^{commit}`);
  } catch {
    fail('pinned source commit is unavailable; use a full-history checkout', sourceCommitSha);
  }

  const sourceManifest = jsonAtCommit(sourceCommitSha, sourceManifestPath);
  const webManifest = jsonAtCommit(sourceCommitSha, webManifestPath);
  const sourceManifestBlobSha = git('rev-parse', `${sourceCommitSha}:${sourceManifestPath}`);
  const webManifestBlobSha = git('rev-parse', `${sourceCommitSha}:${webManifestPath}`);

  if (
    sourceManifest?.version !== contract.authoritativePredecessor.sourceManifestVersion ||
    sourceManifest?.status !== 'PASS' ||
    sourceManifest?.completion !== 'COMPLETE' ||
    sourceManifest?.freezeState !== contract.authoritativePredecessor.sourceFreezeState ||
    sourceManifest?.source?.localAssetRoot !== sourcePublicPath
  ) {
    fail('pinned source manifest predecessor drift');
  }
  if (
    webManifest?.status !== 'PASS' ||
    webManifest?.completion !== 'COMPLETE' ||
    webManifest?.freezeState !== contract.authoritativePredecessor.webDeliveryFreezeState ||
    webManifest?.sourceManifest !== sourceManifestPath ||
    webManifest?.sourcePolicy?.webDeliveryFormat !== contract.productionPolicy.productionWebDeliveryFormat ||
    webManifest?.summary?.webDeliveryCount !== contract.productionPolicy.productionWebDeliveryCount ||
    webManifest?.summary?.webDeliveryTotalBytes !== contract.productionPolicy.productionWebDeliveryBytes
  ) {
    fail('pinned web-delivery predecessor drift');
  }

  const sourceRecords = Array.isArray(sourceManifest?.records) ? sourceManifest.records : [];
  if (sourceRecords.length !== coverage.fileCount) {
    fail('pinned source manifest record count mismatch', sourceRecords.length);
  }

  const expectedByHeroId = new Map();
  let expectedTotalBytes = 0;
  for (const record of sourceRecords) {
    const heroId = record?.heroId;
    const fileName = `${heroId}.png`;
    if (
      !Number.isInteger(heroId) ||
      record?.expectedFilePath !== `${sourcePublicPath}/${fileName}` ||
      path.posix.basename(record.expectedFilePath) !== fileName
    ) {
      fail('invalid pinned Hero ID -> filename binding', {
        heroId: heroId ?? null,
        expectedFilePath: record?.expectedFilePath ?? null,
      });
    }
    if (expectedByHeroId.has(heroId)) fail('duplicate Hero ID in pinned source manifest', heroId);
    ensureSha256(record?.sha256, `source record ${heroId} sha256`);
    ensurePositiveInteger(record?.byteLength, `source record ${heroId} byteLength`);
    expectedByHeroId.set(heroId, {
      heroId,
      fileName,
      sha256: record.sha256,
      size: record.byteLength,
      width: record?.width ?? null,
      height: record?.height ?? null,
    });
    expectedTotalBytes += record.byteLength;
  }
  if (expectedTotalBytes !== coverage.totalSourceBytes) {
    fail('pinned source manifest total byte mismatch', {
      expected: coverage.totalSourceBytes,
      actual: expectedTotalBytes,
    });
  }

  const releaseUrl = `https://api.github.com/repos/${storage.repository}/releases/tags/${encodeURIComponent(storage.releaseTag)}`;
  const release = await fetchJson(releaseUrl, 'GitHub Release metadata');
  if (
    release?.id !== storage.releaseId ||
    release?.tag_name !== storage.releaseTag ||
    release?.target_commitish !== storage.releaseTargetCommitSha
  ) {
    fail('GitHub Release identity mismatch', {
      expected: {
        id: storage.releaseId,
        tag: storage.releaseTag,
        target: storage.releaseTargetCommitSha,
      },
      actual: {
        id: release?.id ?? null,
        tag: release?.tag_name ?? null,
        target: release?.target_commitish ?? null,
      },
    });
  }

  const releaseAssets = Array.isArray(release?.assets) ? release.assets : [];
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-card-icon-h3-download-'));
  let stageDir = null;
  try {
    const downloaded = {};
    for (const key of ['archive', 'inventory', 'checksums']) {
      const expected = storage[key];
      const asset = releaseAssets.find((candidate) => candidate?.id === expected.assetId);
      if (
        !asset ||
        asset?.name !== expected.name ||
        asset?.size !== expected.bytes ||
        typeof asset?.browser_download_url !== 'string'
      ) {
        fail(`Release ${key} asset metadata mismatch`, {
          expected: { id: expected.assetId, name: expected.name, bytes: expected.bytes },
          actual: asset ?? null,
        });
      }
      if (typeof asset.digest === 'string' && asset.digest.length > 0) {
        const expectedDigest = `sha256:${expected.sha256}`;
        if (asset.digest !== expectedDigest) {
          fail(`Release ${key} published digest mismatch`, {
            expected: expectedDigest,
            actual: asset.digest,
          });
        }
      }
      const bytes = await fetchBytes(asset.browser_download_url, `Release ${key} asset`);
      if (bytes.length !== expected.bytes) {
        fail(`${key} downloaded byte-length mismatch`, { expected: expected.bytes, actual: bytes.length });
      }
      const digest = sha256(bytes);
      if (digest !== expected.sha256) {
        fail(`${key} downloaded SHA-256 mismatch`, { expected: expected.sha256, actual: digest });
      }
      const localPath = path.join(downloadDir, expected.name);
      fs.writeFileSync(localPath, bytes);
      downloaded[key] = { bytes, path: localPath, digest };
    }

    const checksums = parseChecksums(
      downloaded.checksums.bytes,
      storage.archive.name,
      storage.inventory.name,
    );
    if (
      checksums.get(storage.archive.name) !== storage.archive.sha256 ||
      checksums.get(storage.inventory.name) !== storage.inventory.sha256
    ) {
      fail('checksum asset does not match H2 pinned archive/inventory SHA-256 values');
    }

    const inventory = JSON.parse(downloaded.inventory.bytes.toString('utf8'));
    if (
      inventory?.version !== 1 ||
      inventory?.schemaId !== 'hero-card-icon-source-pack-inventory/v1' ||
      inventory?.stage !== 'repository-size-reduction-H1' ||
      inventory?.status !== 'PASS' ||
      inventory?.sourceCommitSha !== sourceCommitSha ||
      inventory?.sourceDirectory !== sourcePublicPath
    ) {
      fail('external inventory identity mismatch');
    }
    if (
      inventory?.sourceManifest?.path !== sourceManifestPath ||
      inventory?.sourceManifest?.version !== contract.authoritativePredecessor.sourceManifestVersion ||
      inventory?.sourceManifest?.freezeState !== contract.authoritativePredecessor.sourceFreezeState ||
      inventory?.sourceManifest?.gitBlobSha !== sourceManifestBlobSha
    ) {
      fail('external inventory source-manifest binding mismatch', inventory?.sourceManifest ?? null);
    }
    if (
      inventory?.webManifestBinding?.path !== webManifestPath ||
      inventory?.webManifestBinding?.freezeState !== contract.authoritativePredecessor.webDeliveryFreezeState ||
      inventory?.webManifestBinding?.gitBlobSha !== webManifestBlobSha ||
      inventory?.webManifestBinding?.deliveryFormat !== contract.productionPolicy.productionWebDeliveryFormat ||
      inventory?.webManifestBinding?.webDeliveryCount !== contract.productionPolicy.productionWebDeliveryCount
    ) {
      fail('external inventory web-manifest binding mismatch', inventory?.webManifestBinding ?? null);
    }
    if (
      inventory?.policy?.exactBytesOnly !== true ||
      inventory?.policy?.noReencoding !== true ||
      inventory?.policy?.noNameJoin !== true ||
      inventory?.policy?.noFilenameSimilarity !== true ||
      inventory?.policy?.noIdArithmetic !== true ||
      inventory?.policy?.noSemanticRelationReopen !== true ||
      inventory?.policy?.archiveRoundTripSha256Verified !== true
    ) {
      fail('external inventory policy drift', inventory?.policy ?? null);
    }
    if (
      inventory?.coverage?.fileCount !== coverage.fileCount ||
      inventory?.coverage?.totalBytes !== coverage.totalSourceBytes ||
      inventory?.coverage?.heroCount !== coverage.heroCount ||
      inventory?.coverage?.missingCount !== 0 ||
      inventory?.coverage?.extraCount !== 0 ||
      inventory?.coverage?.duplicateCount !== 0
    ) {
      fail('external inventory coverage mismatch', inventory?.coverage ?? null);
    }
    if (
      inventory?.archive?.fileName !== storage.archive.name ||
      inventory?.archive?.format !== 'tar.gz' ||
      inventory?.archive?.size !== storage.archive.bytes ||
      inventory?.archive?.sha256 !== storage.archive.sha256 ||
      inventory?.archive?.deterministicTar !== true ||
      inventory?.archive?.gzipTimestampSuppressed !== true
    ) {
      fail('external inventory archive binding mismatch', inventory?.archive ?? null);
    }

    const inventoryRecords = Array.isArray(inventory?.records) ? inventory.records : [];
    if (inventoryRecords.length !== coverage.fileCount) {
      fail('external inventory record count mismatch', inventoryRecords.length);
    }
    const inventoryIds = new Set();
    for (const record of inventoryRecords) {
      const expected = expectedByHeroId.get(record?.heroId);
      if (!expected) fail('external inventory contains unknown Hero ID', record?.heroId ?? null);
      if (inventoryIds.has(record.heroId)) fail('external inventory contains duplicate Hero ID', record.heroId);
      inventoryIds.add(record.heroId);
      exactKeys(record, ['heroId', 'fileName', 'size', 'sha256', 'width', 'height'], `inventory Hero ${record.heroId}`);
      if (
        record.fileName !== expected.fileName ||
        record.size !== expected.size ||
        record.sha256 !== expected.sha256 ||
        record.width !== expected.width ||
        record.height !== expected.height
      ) {
        fail('external inventory record differs from pinned source manifest', {
          heroId: record.heroId,
          expected,
          actual: record,
        });
      }
    }
    if (inventoryIds.size !== expectedByHeroId.size) {
      fail('external inventory Hero ID coverage mismatch', {
        expected: expectedByHeroId.size,
        actual: inventoryIds.size,
      });
    }

    const expectedNames = [...expectedByHeroId.values()].map((record) => record.fileName);
    validateTarMembers(downloaded.archive.path, expectedNames);

    const targetParent = path.dirname(targetDirAbs);
    fs.mkdirSync(targetParent, { recursive: true });
    stageDir = fs.mkdtempSync(path.join(targetParent, '.hero-card-icon-h3-stage-'));
    execFileSync(
      'tar',
      ['--no-same-owner', '--no-same-permissions', '-xzf', downloaded.archive.path, '-C', stageDir],
      { cwd: ROOT, stdio: 'inherit' },
    );

    const extractedEntries = fs.readdirSync(stageDir, { withFileTypes: true });
    if (extractedEntries.some((entry) => !entry.isFile())) {
      fail('hydrated staging directory contains non-file entries');
    }
    const actualNames = extractedEntries
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const sortedExpectedNames = [...expectedNames].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (JSON.stringify(actualNames) !== JSON.stringify(sortedExpectedNames)) {
      fail('hydrated file set mismatch', {
        missing: sortedExpectedNames.filter((name) => !actualNames.includes(name)),
        extra: actualNames.filter((name) => !sortedExpectedNames.includes(name)),
      });
    }

    let hydratedTotalBytes = 0;
    for (const expected of expectedByHeroId.values()) {
      const filePath = path.join(stageDir, expected.fileName);
      const bytes = fs.readFileSync(filePath);
      if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        fail('hydrated file is not a PNG byte stream', expected.fileName);
      }
      const digest = sha256(bytes);
      if (digest !== expected.sha256 || bytes.length !== expected.size) {
        fail('hydrated exact-byte parity mismatch', {
          heroId: expected.heroId,
          fileName: expected.fileName,
          expectedSha256: expected.sha256,
          actualSha256: digest,
          expectedBytes: expected.size,
          actualBytes: bytes.length,
        });
      }
      hydratedTotalBytes += bytes.length;
    }
    if (hydratedTotalBytes !== coverage.totalSourceBytes) {
      fail('hydrated total byte mismatch', {
        expected: coverage.totalSourceBytes,
        actual: hydratedTotalBytes,
      });
    }

    assertEmptyTarget(targetDirAbs);
    if (fs.existsSync(targetDirAbs)) fs.rmSync(targetDirAbs, { recursive: true, force: true });
    fs.renameSync(stageDir, targetDirAbs);
    stageDir = null;

    console.log('HERO CARD ICON SOURCE PACK H3 HYDRATION: PASS');
    console.log(JSON.stringify({
      contract: contractPath,
      sourceCommitSha,
      releaseTag: storage.releaseTag,
      releaseId: storage.releaseId,
      targetDir: targetDirAbs,
      fileCount: coverage.fileCount,
      totalBytes: hydratedTotalBytes,
      archiveSha256: storage.archive.sha256,
      inventorySha256: storage.inventory.sha256,
      checksumsSha256: storage.checksums.sha256,
      exactByteParity: true,
      semanticRelationReopened: false,
      productionWebpChanged: false,
      detailCardArtworkChanged: false,
    }, null, 2));
  } finally {
    fs.rmSync(downloadDir, { recursive: true, force: true });
    if (stageDir && fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`HERO CARD ICON SOURCE PACK H3 HYDRATION: FAIL - ${error.message}`);
  if (error.detail !== undefined && error.detail !== null) {
    console.error(JSON.stringify(error.detail, null, 2));
  }
  process.exitCode = 1;
});
