import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONTRACT = 'data/contracts/configdata-source-pack-contract.v1.json';
const EXPECTED_OWNER = 'configdata-source-pack';
const EXPECTED_STAGE = 'repository-size-reduction-B2';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function fail(message, detail = null) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function ensureSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`invalid ${label}`, value ?? null);
}

function ensurePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) fail(`invalid ${label}`, value ?? null);
}

function utf8BytewiseCompare(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function apiHeaders() {
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'langrisser-future-guide-configdata-b2',
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

function validateContract(contract) {
  if (
    contract?.version !== 1 ||
    contract?.contract !== 'configdata-source-pack' ||
    contract?.stage !== EXPECTED_STAGE ||
    contract?.status !== 'PASS' ||
    contract?.owner !== EXPECTED_OWNER
  ) fail('B2 source-pack contract is not admitted PASS input');

  if (
    contract?.authority?.semanticContentAuthority !== 'PINNED_UNITYDATATOOL_PARSED_CONFIGDATA_SNAPSHOT' ||
    contract?.authority?.logicalRawPathNamespace !== 'data/configdata' ||
    contract?.authority?.externalByteTransport !== 'THIS_CONTRACT_PLUS_PINNED_SHA256' ||
    contract?.authority?.externalInventoryRole !== 'EXACT_BYTE_IDENTITY_PROJECTION_ONLY' ||
    contract?.authority?.externalInventoryMayCreateSemanticMappings !== false ||
    contract?.authority?.materializedLookupRemainsNormalQuerySource !== true ||
    contract?.authority?.rawConfigDataQueryFallback !== false
  ) fail('B2 authority boundary drift', contract?.authority ?? null);

  const predecessor = contract?.authoritativePredecessor;
  if (
    predecessor?.repository !== 'LuceatLuxVestra42/langrisser-future-guide' ||
    predecessor?.logicalSourceRoot !== 'data/configdata' ||
    predecessor?.fileCount !== 753 ||
    predecessor?.totalSourceBytes !== 308284658 ||
    !/^[a-f0-9]{40}$/.test(predecessor?.sourceCommitSha ?? '') ||
    !/^[a-f0-9]{40}$/.test(predecessor?.sourceTreeGitSha1 ?? '')
  ) fail('B2 authoritative predecessor drift', predecessor ?? null);

  const storage = contract?.storage;
  if (
    storage?.kind !== 'GITHUB_RELEASE_ASSET' ||
    storage?.repository !== predecessor.repository ||
    storage?.releaseTargetCommitSha !== predecessor.sourceCommitSha ||
    storage?.immutabilityPolicy !== 'CONTENT_HASH_PINNED_FAIL_CLOSED'
  ) fail('unsupported B2 storage contract', storage ?? null);

  for (const key of ['archive', 'inventory', 'checksums']) {
    const spec = storage?.[key];
    ensurePositiveInteger(spec?.assetId, `${key}.assetId`);
    ensurePositiveInteger(spec?.bytes, `${key}.bytes`);
    if (typeof spec?.name !== 'string' || spec.name.length === 0) fail(`invalid ${key}.name`);
    ensureSha256(spec?.sha256, `${key}.sha256`);
  }

  if (
    contract?.identityPolicy?.exactFileSetRequired !== true ||
    contract?.identityPolicy?.perFileSha256Required !== true ||
    contract?.identityPolicy?.perFileByteLengthRequired !== true ||
    contract?.identityPolicy?.inventorySourceCommitMustMatch !== true ||
    contract?.identityPolicy?.inventorySourceTreeMustMatch !== true ||
    contract?.identityPolicy?.archiveSha256Role !== 'TRANSPORT_CONTAINER_INTEGRITY_ONLY' ||
    contract?.identityPolicy?.archiveSha256CreatesSemanticAuthority !== false ||
    contract?.identityPolicy?.jsonReserializationAllowed !== false ||
    contract?.identityPolicy?.textTranscodingAllowed !== false ||
    contract?.identityPolicy?.newlineNormalizationAllowed !== false ||
    contract?.identityPolicy?.failClosedOnAnyMismatch !== true
  ) fail('B2 identity policy is not fail-closed', contract?.identityPolicy ?? null);

  if (
    contract?.hydrationPolicy?.targetMustBeOutsideRepository !== true ||
    contract?.hydrationPolicy?.targetMustBeAbsentOrEmpty !== true ||
    contract?.hydrationPolicy?.logicalPathsPreservedBelowTargetRoot !== true ||
    contract?.hydrationPolicy?.releaseMetadataMustMatchContract !== true ||
    contract?.hydrationPolicy?.assetIdsNamesSizesAndDigestsMustMatch !== true ||
    contract?.hydrationPolicy?.checksumsAssetMustMatchPinnedDigest !== true ||
    contract?.hydrationPolicy?.inventoryMustMatchPinnedDigest !== true ||
    contract?.hydrationPolicy?.archiveMustMatchPinnedDigest !== true ||
    contract?.hydrationPolicy?.ustarHeadersMustMatchB1aFormat !== true ||
    contract?.hydrationPolicy?.memberOrderMustMatchInventory !== true ||
    contract?.hydrationPolicy?.exactFileSetMustMatchInventory !== true ||
    contract?.hydrationPolicy?.perFileSha256AndSizeMustMatchInventory !== true ||
    contract?.hydrationPolicy?.partialHydrationMayBePublished !== false ||
    contract?.hydrationPolicy?.hydratorIncludesVerifier !== true
  ) fail('B2 hydration policy drift', contract?.hydrationPolicy ?? null);

  if (
    contract?.productionBoundary?.productionRuntimeFetchesSourcePack !== false ||
    contract?.productionBoundary?.productionRuntimeReadsRawConfigData !== false ||
    contract?.productionBoundary?.rawConfigDataRuntimeFallbackAllowed !== false ||
    contract?.productionBoundary?.frontendSemanticJoinIntroduced !== false ||
    contract?.productionBoundary?.runtimePathChangedInB2 !== false
  ) fail('B2 production boundary drift', contract?.productionBoundary ?? null);

  if (
    contract?.semanticBoundary?.semanticAuthorityChanged !== false ||
    contract?.semanticBoundary?.frozenSemanticDomainsReopened !== false ||
    contract?.semanticBoundary?.canonicalIdentityChanges !== false ||
    contract?.semanticBoundary?.relationChanges !== false ||
    contract?.semanticBoundary?.nameJoinIntroduced !== false ||
    contract?.semanticBoundary?.idArithmeticIntroduced !== false ||
    contract?.semanticBoundary?.filenameSimilarityIntroduced !== false ||
    contract?.semanticBoundary?.sourceMeaningReinterpreted !== false
  ) fail('B2 semantic boundary drift', contract?.semanticBoundary ?? null);
}

function validateFormat(format, contract) {
  if (
    format?.version !== 1 ||
    format?.contract !== 'configdata-source-pack-format' ||
    format?.stage !== 'repository-size-reduction-B1a' ||
    format?.status !== 'PASS' ||
    format?.owner !== EXPECTED_OWNER
  ) fail('B1a format contract is not admitted PASS input');
  if (
    format?.authoritativePredecessor?.rawSourceCommitSha !== contract.authoritativePredecessor.sourceCommitSha ||
    format?.authoritativePredecessor?.logicalSourceRoot !== contract.authoritativePredecessor.logicalSourceRoot ||
    format?.archive?.format !== 'POSIX_USTAR' ||
    format?.archive?.compression !== 'NONE' ||
    format?.archive?.blockSize !== 512 ||
    format?.archive?.endOfArchiveZeroBlockCount !== 2 ||
    format?.archive?.extensionsAllowed !== false ||
    format?.archive?.paxHeadersAllowed !== false ||
    format?.archive?.gnuExtensionsAllowed !== false ||
    format?.regularFileHeader?.modeOctal !== '0644' ||
    format?.regularFileHeader?.uid !== 0 ||
    format?.regularFileHeader?.gid !== 0 ||
    format?.regularFileHeader?.mtimeUnixSeconds !== 0 ||
    format?.regularFileHeader?.typeFlag !== '0' ||
    format?.regularFileHeader?.ustarVersion !== '00'
  ) fail('B1a format boundary drift');
}

function validateTarget(targetDirAbs) {
  if (targetDirAbs === path.parse(targetDirAbs).root) fail('refusing filesystem-root hydration target', targetDirAbs);
  const relative = path.relative(ROOT, targetDirAbs);
  const insideRepo = relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  if (insideRepo) fail('hydration target must remain outside repository', targetDirAbs);
  if (!fs.existsSync(targetDirAbs)) return;
  const stat = fs.statSync(targetDirAbs);
  if (!stat.isDirectory()) fail('hydration target exists and is not a directory', targetDirAbs);
  const entries = fs.readdirSync(targetDirAbs);
  if (entries.length !== 0) fail('hydration target must be absent or empty', { targetDirAbs, entryCount: entries.length });
}

function parseChecksums(bytes, archiveName, inventoryName) {
  const lines = bytes.toString('utf8').split(/\r?\n/).filter(Boolean);
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
    fail('checksum asset file set mismatch', [...parsed.keys()]);
  }
  return parsed;
}

function readCString(buffer, offset, length) {
  const field = buffer.subarray(offset, offset + length);
  const zero = field.indexOf(0);
  return field.subarray(0, zero >= 0 ? zero : field.length).toString('utf8');
}

function parseOctal(buffer, offset, length, label) {
  const text = buffer.subarray(offset, offset + length).toString('ascii').replace(/\0/g, '').trim();
  if (!/^[0-7]+$/.test(text)) fail(`invalid USTAR ${label} octal field`, text);
  return Number.parseInt(text, 8);
}

function isZeroBlock(buffer, offset, blockSize) {
  const block = buffer.subarray(offset, offset + blockSize);
  return block.length === blockSize && block.every(byte => byte === 0);
}

function validateHeader(header, record, format) {
  const name = readCString(header, 0, 100);
  if (name !== record.path) fail('USTAR member path mismatch', { expected: record.path, actual: name });
  if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) fail('unsafe USTAR member path', name);
  if (readCString(header, 345, 155) !== '') fail('USTAR prefix field must remain empty', name);
  if (parseOctal(header, 100, 8, 'mode') !== Number.parseInt(format.regularFileHeader.modeOctal, 8)) fail('USTAR mode drift', name);
  if (parseOctal(header, 108, 8, 'uid') !== format.regularFileHeader.uid) fail('USTAR uid drift', name);
  if (parseOctal(header, 116, 8, 'gid') !== format.regularFileHeader.gid) fail('USTAR gid drift', name);
  if (parseOctal(header, 124, 12, 'size') !== record.byteLength) fail('USTAR size drift', name);
  if (parseOctal(header, 136, 12, 'mtime') !== format.regularFileHeader.mtimeUnixSeconds) fail('USTAR mtime drift', name);
  if (String.fromCharCode(header[156]) !== format.regularFileHeader.typeFlag) fail('USTAR typeflag drift', name);
  if (readCString(header, 157, 100) !== '') fail('USTAR linkname must remain empty', name);
  if (!header.subarray(257, 263).equals(Buffer.from([0x75, 0x73, 0x74, 0x61, 0x72, 0x00]))) fail('USTAR magic drift', name);
  if (header.subarray(263, 265).toString('ascii') !== format.regularFileHeader.ustarVersion) fail('USTAR version drift', name);
  if (readCString(header, 265, 32) !== '' || readCString(header, 297, 32) !== '') fail('USTAR user/group name drift', name);
  if (parseOctal(header, 329, 8, 'device major') !== 0 || parseOctal(header, 337, 8, 'device minor') !== 0) fail('USTAR device field drift', name);

  const expectedChecksum = parseOctal(header, 148, 8, 'checksum');
  const copy = Buffer.from(header);
  copy.fill(0x20, 148, 156);
  let actualChecksum = 0;
  for (const byte of copy) actualChecksum += byte;
  if (actualChecksum !== expectedChecksum) fail('USTAR header checksum mismatch', { name, expectedChecksum, actualChecksum });
}

function validateInventory(inventory, contract) {
  if (
    inventory?.version !== 1 ||
    inventory?.schemaId !== 'configdata-source-pack-inventory/v1' ||
    inventory?.stage !== 'repository-size-reduction-B1b' ||
    inventory?.status !== 'PASS' ||
    inventory?.owner !== EXPECTED_OWNER
  ) fail('B1b inventory identity drift');

  const predecessor = contract.authoritativePredecessor;
  if (
    inventory?.source?.repository !== predecessor.repository ||
    inventory?.source?.commitSha !== predecessor.sourceCommitSha ||
    inventory?.source?.logicalRoot !== predecessor.logicalSourceRoot ||
    inventory?.source?.gitTreeSha1 !== predecessor.sourceTreeGitSha1
  ) fail('B1b inventory source binding mismatch', inventory?.source ?? null);

  if (
    inventory?.coverage?.fileCount !== contract.coverage.fileCount ||
    inventory?.coverage?.totalSourceBytes !== contract.coverage.totalSourceBytes ||
    inventory?.coverage?.missingCount !== 0 ||
    inventory?.coverage?.extraCount !== 0 ||
    inventory?.coverage?.duplicatePathCount !== 0
  ) fail('B1b inventory coverage drift', inventory?.coverage ?? null);

  if (
    inventory?.archive?.fileName !== contract.storage.archive.name ||
    inventory?.archive?.format !== 'POSIX_USTAR' ||
    inventory?.archive?.compression !== 'NONE' ||
    inventory?.archive?.byteLength !== contract.storage.archive.bytes ||
    inventory?.archive?.sha256 !== contract.storage.archive.sha256 ||
    inventory?.archive?.repeatBuildByteIdentical !== true ||
    inventory?.archive?.roundTripExactBytesVerified !== true
  ) fail('B1b inventory archive binding mismatch', inventory?.archive ?? null);

  const records = Array.isArray(inventory?.records) ? inventory.records : [];
  if (records.length !== contract.coverage.fileCount) fail('B1b inventory record count drift', records.length);
  const seen = new Set();
  let total = 0;
  for (const record of records) {
    if (typeof record?.path !== 'string' || !record.path.startsWith(`${predecessor.logicalSourceRoot}/`)) fail('invalid inventory path', record?.path ?? null);
    if (record.fileName !== path.posix.basename(record.path) || !record.fileName.endsWith('.json')) fail('invalid inventory filename binding', record);
    if (seen.has(record.path)) fail('duplicate inventory path', record.path);
    seen.add(record.path);
    ensurePositiveInteger(record.byteLength, `${record.path}.byteLength`);
    ensureSha256(record.sha256, `${record.path}.sha256`);
    total += record.byteLength;
  }
  const sorted = [...records].sort((a, b) => utf8BytewiseCompare(a.path, b.path));
  if (records.some((record, index) => record.path !== sorted[index].path)) fail('inventory member order is not frozen UTF-8 byte order');
  if (total !== contract.coverage.totalSourceBytes) fail('inventory total source byte mismatch', { expected: contract.coverage.totalSourceBytes, actual: total });
  return records;
}

function verifyTarAndHydrate(archiveBytes, records, format, targetDirAbs, compareRepoSource) {
  const blockSize = format.archive.blockSize;
  let offset = 0;
  let index = 0;
  let zeroBlocks = 0;
  let stageDir = null;

  if (targetDirAbs) {
    fs.mkdirSync(path.dirname(targetDirAbs), { recursive: true });
    stageDir = fs.mkdtempSync(path.join(path.dirname(targetDirAbs), '.configdata-hydrate-'));
  }

  try {
    while (offset < archiveBytes.length) {
      if (isZeroBlock(archiveBytes, offset, blockSize)) {
        zeroBlocks += 1;
        offset += blockSize;
        if (zeroBlocks === format.archive.endOfArchiveZeroBlockCount) break;
        continue;
      }
      if (zeroBlocks !== 0) fail('non-zero USTAR block after end marker started');
      const record = records[index];
      if (!record) fail('archive contains extra member beyond inventory');
      const header = archiveBytes.subarray(offset, offset + blockSize);
      if (header.length !== blockSize) fail('truncated USTAR header');
      validateHeader(header, record, format);
      offset += blockSize;

      const fileBytes = archiveBytes.subarray(offset, offset + record.byteLength);
      if (fileBytes.length !== record.byteLength) fail('truncated USTAR member data', record.path);
      const digest = sha256(fileBytes);
      if (digest !== record.sha256) fail('USTAR member SHA-256 mismatch', { path: record.path, expected: record.sha256, actual: digest });

      if (compareRepoSource) {
        const repoPath = path.join(ROOT, record.path);
        if (!fs.existsSync(repoPath)) fail('tracked source parity file missing', record.path);
        const tracked = fs.readFileSync(repoPath);
        if (tracked.length !== record.byteLength || sha256(tracked) !== record.sha256 || !tracked.equals(fileBytes)) {
          fail('external snapshot differs from tracked source bytes', record.path);
        }
      }

      if (stageDir) {
        const outputPath = path.join(stageDir, ...record.path.split('/'));
        const relative = path.relative(stageDir, outputPath);
        if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) fail('unsafe extraction path', record.path);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, fileBytes);
      }

      offset += record.byteLength;
      const remainder = record.byteLength % blockSize;
      if (remainder !== 0) {
        const padding = archiveBytes.subarray(offset, offset + (blockSize - remainder));
        if (padding.some(byte => byte !== format.regularFileHeader.dataPaddingByte)) fail('non-zero USTAR data padding', record.path);
        offset += blockSize - remainder;
      }
      index += 1;
    }

    if (zeroBlocks !== format.archive.endOfArchiveZeroBlockCount) fail('USTAR end marker count mismatch', zeroBlocks);
    if (index !== records.length) fail('archive member count differs from inventory', { expected: records.length, actual: index });
    if (offset !== archiveBytes.length) fail('archive has trailing bytes after frozen two-block end marker', { parsedBytes: offset, archiveBytes: archiveBytes.length });

    if (stageDir) {
      const hydratedRoot = path.join(stageDir, 'data', 'configdata');
      const hydratedEntries = fs.readdirSync(hydratedRoot, { withFileTypes: true });
      if (hydratedEntries.length !== records.length || hydratedEntries.some(entry => !entry.isFile())) fail('hydrated file-set shape mismatch');
      if (fs.existsSync(targetDirAbs)) fs.rmSync(targetDirAbs, { recursive: true, force: true });
      fs.renameSync(stageDir, targetDirAbs);
      stageDir = null;
    }
  } finally {
    if (stageDir) fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

async function main() {
  const contractPath = arg('--contract', DEFAULT_CONTRACT);
  const verifyOnly = hasArg('--verify-only');
  const compareRepoSource = hasArg('--compare-repo-source');
  const targetArg = arg('--target-dir');
  if (!verifyOnly && !targetArg) fail('--target-dir is required unless --verify-only is used');
  if (verifyOnly && targetArg) fail('--verify-only and --target-dir are mutually exclusive');

  const targetDirAbs = targetArg ? path.resolve(targetArg) : null;
  if (targetDirAbs) validateTarget(targetDirAbs);

  const contract = readJson(contractPath);
  validateContract(contract);
  const format = readJson(contract.authoritativePredecessor.formatContract);
  validateFormat(format, contract);

  const storage = contract.storage;
  const releaseUrl = `https://api.github.com/repos/${storage.repository}/releases/tags/${encodeURIComponent(storage.releaseTag)}`;
  const release = await fetchJson(releaseUrl, 'GitHub Release metadata');
  if (
    release?.id !== storage.releaseId ||
    release?.tag_name !== storage.releaseTag ||
    release?.target_commitish !== storage.releaseTargetCommitSha ||
    release?.draft !== false ||
    release?.prerelease !== false
  ) fail('GitHub Release identity mismatch');

  const releaseAssets = Array.isArray(release?.assets) ? release.assets : [];
  const resolved = {};
  for (const key of ['archive', 'inventory', 'checksums']) {
    const spec = storage[key];
    const asset = releaseAssets.find(item => item?.id === spec.assetId);
    if (!asset) fail(`pinned ${key} asset ID missing from Release`, spec.assetId);
    if (asset.name !== spec.name || asset.size !== spec.bytes || asset.digest !== `sha256:${spec.sha256}`) {
      fail(`published ${key} asset metadata mismatch`, { expected: spec, actual: { id: asset.id, name: asset.name, size: asset.size, digest: asset.digest } });
    }
    resolved[key] = asset;
  }

  const checksumsBytes = await fetchBytes(resolved.checksums.browser_download_url, 'checksums asset');
  if (checksumsBytes.length !== storage.checksums.bytes || sha256(checksumsBytes) !== storage.checksums.sha256) fail('checksums asset digest mismatch');
  const checksums = parseChecksums(checksumsBytes, storage.archive.name, storage.inventory.name);
  if (checksums.get(storage.archive.name) !== storage.archive.sha256 || checksums.get(storage.inventory.name) !== storage.inventory.sha256) fail('checksums asset values differ from B2 pins');

  const inventoryBytes = await fetchBytes(resolved.inventory.browser_download_url, 'inventory asset');
  if (inventoryBytes.length !== storage.inventory.bytes || sha256(inventoryBytes) !== storage.inventory.sha256) fail('inventory asset digest mismatch');
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));
  const records = validateInventory(inventory, contract);

  const archiveBytes = await fetchBytes(resolved.archive.browser_download_url, 'archive asset');
  if (archiveBytes.length !== storage.archive.bytes || sha256(archiveBytes) !== storage.archive.sha256) fail('archive asset digest mismatch');
  verifyTarAndHydrate(archiveBytes, records, format, targetDirAbs, compareRepoSource);

  console.log(JSON.stringify({
    status: 'PASS',
    checkpoint: 'CONFIGDATA_SOURCE_PACK_B2_HYDRATION',
    releaseTag: storage.releaseTag,
    fileCount: records.length,
    totalSourceBytes: contract.coverage.totalSourceBytes,
    archiveBytes: archiveBytes.length,
    archiveSha256: storage.archive.sha256,
    inventorySha256: storage.inventory.sha256,
    trackedSourceParityVerified: compareRepoSource,
    hydratedTarget: targetDirAbs,
    semanticAuthorityChanged: false,
    frozenSemanticDomainsReopened: false,
    nextStage: contract.handoff.nextStage,
  }, null, 2));
}

main().catch(error => {
  console.error(`CONFIGDATA SOURCE PACK B2: FAIL - ${error.message}`);
  if (error.detail !== undefined && error.detail !== null) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
