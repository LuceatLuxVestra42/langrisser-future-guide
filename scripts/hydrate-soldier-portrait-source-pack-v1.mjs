import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONTRACT = 'data/contracts/soldier-portrait-source-pack.v1.json';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function fail(message, detail = null) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

function readJson(relativeOrAbsolutePath) {
  const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(ROOT, relativeOrAbsolutePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function assertHexSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`invalid SHA-256 for ${label}`, value);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} mismatch`, { expected, actual });
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b, 'en'));
}

function exactArrayEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function releaseAssetUrl(repository, releaseTag, assetName) {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(releaseTag)}/${encodeURIComponent(assetName)}`;
}

async function downloadPinnedAsset(repository, releaseTag, assetSpec, outDir) {
  if (!assetSpec || typeof assetSpec.name !== 'string' || !Number.isInteger(assetSpec.bytes)) {
    fail('invalid contract asset specification', assetSpec);
  }
  assertHexSha256(assetSpec.sha256, assetSpec.name);

  const url = releaseAssetUrl(repository, releaseTag, assetSpec.name);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'langrisser-soldier-source-pack-hydrator-v1' },
  });
  if (!response.ok) fail('release asset download failed', { asset: assetSpec.name, status: response.status, url });

  const bytes = Buffer.from(await response.arrayBuffer());
  assertEqual(bytes.length, assetSpec.bytes, `${assetSpec.name} byte size`);
  const actualSha256 = sha256(bytes);
  assertEqual(actualSha256, assetSpec.sha256, `${assetSpec.name} SHA-256`);

  const outputPath = path.join(outDir, assetSpec.name);
  fs.writeFileSync(outputPath, bytes);
  return { path: outputPath, bytes: bytes.length, sha256: actualSha256, url };
}

function validateContract(contract) {
  assertEqual(contract?.version, 1, 'contract version');
  assertEqual(contract?.contract, 'soldier-portrait-source-pack', 'contract identity');
  assertEqual(contract?.status, 'PASS', 'contract status');
  assertEqual(contract?.owner, 'soldier-assets', 'contract owner');
  assertEqual(contract?.authority?.externalInventoryRole, 'BYTE_INVENTORY_PROJECTION_ONLY', 'inventory authority role');
  assertEqual(contract?.authority?.externalInventoryMayCreateSemanticMappings, false, 'inventory semantic mapping policy');
  assertEqual(contract?.storage?.kind, 'GITHUB_RELEASE_ASSET', 'storage kind');
  assertEqual(contract?.storage?.immutabilityPolicy, 'CONTENT_HASH_PINNED_FAIL_CLOSED', 'storage immutability policy');
  assertEqual(contract?.integrityPolicy?.failClosedOnAnyMismatch, true, 'fail-closed policy');
  assertEqual(contract?.integrityPolicy?.exactFileSetRequired, true, 'exact file-set policy');
  assertEqual(contract?.integrityPolicy?.perFileSha256MustMatchV9Manifest, true, 'per-file SHA policy');
  assertEqual(contract?.integrityPolicy?.perFileSizeMustMatchV9Manifest, true, 'per-file size policy');
  assertEqual(contract?.integrityPolicy?.soldierIdToFileNameMustRemainExact, true, 'ID-to-file policy');
  assertEqual(contract?.productionPolicy?.sourcePackFetchedAtRuntime, false, 'runtime source-pack policy');
  assertEqual(contract?.productionPolicy?.runtimePathChange, false, 'runtime path-change policy');
  assertEqual(contract?.semanticBoundary?.canonicalSoldierChanges, false, 'canonical Soldier boundary');
  assertEqual(contract?.semanticBoundary?.heroSoldierRelationChanges, false, 'Hero-Soldier boundary');
  assertEqual(contract?.semanticBoundary?.sourceMeaningReinterpreted, false, 'source-meaning boundary');

  if (typeof contract?.storage?.repository !== 'string' || !contract.storage.repository.includes('/')) {
    fail('invalid storage repository', contract?.storage?.repository);
  }
  if (typeof contract?.storage?.releaseTag !== 'string' || contract.storage.releaseTag.length === 0) {
    fail('invalid release tag', contract?.storage?.releaseTag);
  }
  if (typeof contract?.authoritativePredecessor?.sourceManifest !== 'string') {
    fail('missing authoritative source manifest path');
  }

  for (const key of ['archive', 'inventory', 'checksums']) {
    const spec = contract.storage[key];
    if (!spec || typeof spec.name !== 'string' || !Number.isInteger(spec.bytes) || spec.bytes <= 0) {
      fail(`invalid storage.${key} contract`, spec);
    }
    assertHexSha256(spec.sha256, `storage.${key}`);
  }
}

function validateManifestAndInventory(contract, manifest, inventory) {
  assertEqual(manifest?.version, contract.authoritativePredecessor.sourceManifestVersion, 'source manifest version');
  assertEqual(manifest?.status, 'PASS', 'source manifest status');
  assertEqual(manifest?.assetsReady, true, 'source manifest assetsReady');
  assertEqual(manifest?.publicRoot, contract.authoritativePredecessor.sourcePublicRoot, 'source manifest publicRoot');

  const manifestRecords = Array.isArray(manifest?.records) ? manifest.records : [];
  const expectedCount = contract.coverage.fileCount;
  assertEqual(manifestRecords.length, expectedCount, 'source manifest record count');
  assertEqual(manifest?.coverage?.canonicalSoldierCount, contract.coverage.canonicalSoldierCount, 'canonical Soldier coverage');
  assertEqual(manifest?.coverage?.canonicalNormalCount, contract.coverage.canonicalNormalCount, 'normal Soldier coverage');
  assertEqual(manifest?.coverage?.canonicalSpCount, contract.coverage.canonicalSpCount, 'SP Soldier coverage');

  assertEqual(inventory?.version, 1, 'inventory version');
  assertEqual(inventory?.schemaId, 'soldier-portrait-source-pack-inventory/v1', 'inventory schema');
  assertEqual(inventory?.status, 'PASS', 'inventory status');
  assertEqual(inventory?.sourceCommitSha, contract.authoritativePredecessor.sourceCommitSha, 'inventory source commit');
  assertEqual(inventory?.sourceManifest?.path, contract.authoritativePredecessor.sourceManifest, 'inventory source manifest path');
  assertEqual(inventory?.sourceManifest?.version, contract.authoritativePredecessor.sourceManifestVersion, 'inventory source manifest version');
  assertEqual(inventory?.archive?.fileName, contract.storage.archive.name, 'inventory archive filename');
  assertEqual(inventory?.archive?.size, contract.storage.archive.bytes, 'inventory archive byte size');
  assertEqual(inventory?.archive?.sha256, contract.storage.archive.sha256, 'inventory archive SHA-256');
  assertEqual(inventory?.coverage?.fileCount, contract.coverage.fileCount, 'inventory file count');
  assertEqual(inventory?.coverage?.totalBytes, contract.coverage.totalSourceBytes, 'inventory source bytes');
  assertEqual(inventory?.coverage?.canonicalSoldierCount, contract.coverage.canonicalSoldierCount, 'inventory canonical count');
  assertEqual(inventory?.coverage?.normalCount, contract.coverage.canonicalNormalCount, 'inventory normal count');
  assertEqual(inventory?.coverage?.spCount, contract.coverage.canonicalSpCount, 'inventory SP count');
  assertEqual(inventory?.policy?.exactBytesOnly, true, 'inventory exact-byte policy');
  assertEqual(inventory?.policy?.noReencoding, true, 'inventory re-encoding policy');
  assertEqual(inventory?.policy?.noNameJoin, true, 'inventory name-JOIN policy');
  assertEqual(inventory?.policy?.noIdArithmetic, true, 'inventory ID-arithmetic policy');

  const inventoryRecords = Array.isArray(inventory?.records) ? inventory.records : [];
  assertEqual(inventoryRecords.length, expectedCount, 'inventory record count');

  const manifestById = new Map();
  const inventoryById = new Map();
  let totalBytes = 0;
  for (const record of manifestRecords) {
    const soldierId = record?.soldierId;
    const fileName = record?.fileName;
    if (!Number.isInteger(soldierId) || fileName !== `${soldierId}.png`) {
      fail('invalid v9 Soldier ID -> filename binding', { soldierId, fileName });
    }
    if (manifestById.has(soldierId)) fail('duplicate Soldier ID in v9 manifest', soldierId);
    assertHexSha256(record?.sha256, `v9 record ${soldierId}`);
    if (!Number.isInteger(record?.size) || record.size <= 0) fail('invalid v9 source size', { soldierId, size: record?.size });
    manifestById.set(soldierId, record);
    totalBytes += record.size;
  }
  assertEqual(totalBytes, contract.coverage.totalSourceBytes, 'v9 total source bytes');

  for (const record of inventoryRecords) {
    const soldierId = record?.soldierId;
    if (!Number.isInteger(soldierId) || inventoryById.has(soldierId)) {
      fail('invalid or duplicate Soldier ID in inventory', soldierId);
    }
    inventoryById.set(soldierId, record);
  }

  for (const [soldierId, source] of manifestById) {
    const external = inventoryById.get(soldierId);
    if (!external) fail('inventory is missing v9 Soldier record', soldierId);
    assertEqual(external.fileName, source.fileName, `inventory filename for ${soldierId}`);
    assertEqual(external.size, source.size, `inventory byte size for ${soldierId}`);
    assertEqual(external.sha256, source.sha256, `inventory SHA-256 for ${soldierId}`);
    assertEqual(external.isSp, source.isSp === true, `inventory SP flag for ${soldierId}`);
  }

  return { manifestRecords, manifestById };
}

function validateChecksumFile(checksumText, contract) {
  const parsed = new Map();
  const lines = checksumText.trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/);
    if (!match) fail('invalid checksum line', line);
    if (parsed.has(match[2])) fail('duplicate checksum filename', match[2]);
    parsed.set(match[2], match[1]);
  }
  assertEqual(parsed.size, 2, 'checksum entry count');
  assertEqual(parsed.get(contract.storage.archive.name), contract.storage.archive.sha256, 'checksum archive SHA-256');
  assertEqual(parsed.get(contract.storage.inventory.name), contract.storage.inventory.sha256, 'checksum inventory SHA-256');
}

function listArchiveFiles(archivePath, expectedNames) {
  const listing = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' });
  const files = [];
  for (const raw of listing.split(/\r?\n/).filter(Boolean)) {
    let entry = raw;
    while (entry.startsWith('./')) entry = entry.slice(2);
    if (entry === '' || entry === '.') continue;
    if (entry.endsWith('/')) fail('archive contains unexpected directory entry', raw);
    if (path.isAbsolute(entry) || entry.includes('/') || entry === '..' || entry.includes('../')) {
      fail('archive contains unsafe or nested entry', raw);
    }
    files.push(entry);
  }

  const actualNames = sorted(files);
  if (!exactArrayEqual(actualNames, expectedNames)) {
    fail('archive file set differs from v9 manifest', {
      expectedCount: expectedNames.length,
      actualCount: actualNames.length,
      missing: expectedNames.filter((name) => !actualNames.includes(name)),
      extra: actualNames.filter((name) => !expectedNames.includes(name)),
    });
  }
}

function validateExtractedFiles(extractDir, manifestRecords) {
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile())) fail('extracted source pack contains non-file entries');

  const expectedNames = sorted(manifestRecords.map((record) => record.fileName));
  const actualNames = sorted(entries.map((entry) => entry.name));
  if (!exactArrayEqual(actualNames, expectedNames)) {
    fail('extracted source file set differs from v9 manifest', { expectedCount: expectedNames.length, actualCount: actualNames.length });
  }

  let totalBytes = 0;
  for (const record of manifestRecords) {
    const sourcePath = path.join(extractDir, record.fileName);
    const bytes = fs.readFileSync(sourcePath);
    assertEqual(bytes.length, record.size, `extracted byte size for ${record.soldierId}`);
    assertEqual(sha256(bytes), record.sha256, `extracted SHA-256 for ${record.soldierId}`);
    if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      fail('extracted source is not a PNG byte stream', { soldierId: record.soldierId, fileName: record.fileName });
    }
    totalBytes += bytes.length;
  }
  return totalBytes;
}

function hydrateVerifiedFiles(extractDir, hydrateDirArg, manifestRecords) {
  const hydrateDir = path.isAbsolute(hydrateDirArg) ? hydrateDirArg : path.resolve(ROOT, hydrateDirArg);
  if (hydrateDir === ROOT) fail('refusing to hydrate into repository root');

  if (fs.existsSync(hydrateDir)) {
    const existing = fs.readdirSync(hydrateDir);
    if (existing.length > 0) fail('hydrate destination must be absent or empty; refusing to overwrite', { hydrateDir, existingCount: existing.length });
  } else {
    fs.mkdirSync(hydrateDir, { recursive: true });
  }

  for (const record of manifestRecords) {
    const sourcePath = path.join(extractDir, record.fileName);
    const destinationPath = path.join(hydrateDir, record.fileName);
    fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
    const hydrated = fs.readFileSync(destinationPath);
    assertEqual(hydrated.length, record.size, `hydrated byte size for ${record.soldierId}`);
    assertEqual(sha256(hydrated), record.sha256, `hydrated SHA-256 for ${record.soldierId}`);
  }
  return hydrateDir;
}

async function main() {
  if (hasFlag('--help')) {
    console.log('Usage: node scripts/hydrate-soldier-portrait-source-pack-v1.mjs [--contract <path>] [--hydrate-dir <empty-path>] [--keep-work-dir]');
    console.log('Without --hydrate-dir the command verifies the pinned external source pack only.');
    return;
  }

  const contractPath = arg('--contract', DEFAULT_CONTRACT);
  const hydrateDirArg = arg('--hydrate-dir');
  const keepWorkDir = hasFlag('--keep-work-dir');
  const contract = readJson(contractPath);
  validateContract(contract);

  const sourceManifestPath = contract.authoritativePredecessor.sourceManifest;
  const manifest = readJson(sourceManifestPath);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soldier-portrait-source-pack-v1-'));
  const downloadDir = path.join(workDir, 'download');
  const extractDir = path.join(workDir, 'extract');
  fs.mkdirSync(downloadDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    const repository = contract.storage.repository;
    const releaseTag = contract.storage.releaseTag;
    const archive = await downloadPinnedAsset(repository, releaseTag, contract.storage.archive, downloadDir);
    const inventoryAsset = await downloadPinnedAsset(repository, releaseTag, contract.storage.inventory, downloadDir);
    const checksumsAsset = await downloadPinnedAsset(repository, releaseTag, contract.storage.checksums, downloadDir);

    const inventory = JSON.parse(fs.readFileSync(inventoryAsset.path, 'utf8'));
    const { manifestRecords } = validateManifestAndInventory(contract, manifest, inventory);
    validateChecksumFile(fs.readFileSync(checksumsAsset.path, 'utf8'), contract);

    const expectedNames = sorted(manifestRecords.map((record) => record.fileName));
    listArchiveFiles(archive.path, expectedNames);
    execFileSync('tar', ['-xzf', archive.path, '-C', extractDir], { stdio: 'inherit' });
    const totalExtractedBytes = validateExtractedFiles(extractDir, manifestRecords);
    assertEqual(totalExtractedBytes, contract.coverage.totalSourceBytes, 'extracted total source bytes');

    let hydratedDirectory = null;
    if (hydrateDirArg) hydratedDirectory = hydrateVerifiedFiles(extractDir, hydrateDirArg, manifestRecords);

    console.log('SOLDIER SOURCE PACK A3: PASS');
    console.log(JSON.stringify({
      contract: contractPath,
      sourceCommitSha: contract.authoritativePredecessor.sourceCommitSha,
      releaseTag,
      fileCount: manifestRecords.length,
      totalSourceBytes: totalExtractedBytes,
      archiveSha256: archive.sha256,
      inventorySha256: inventoryAsset.sha256,
      checksumsSha256: checksumsAsset.sha256,
      hydrated: hydratedDirectory !== null,
      hydratedDirectory,
      runtimeSourcePackFetch: false,
      semanticChanges: false,
      workDir: keepWorkDir ? workDir : null,
    }, null, 2));
  } finally {
    if (!keepWorkDir) fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`SOLDIER SOURCE PACK A3: FAIL - ${error.message}`);
  if (error.detail !== undefined && error.detail !== null) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
