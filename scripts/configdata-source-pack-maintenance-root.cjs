'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOGICAL_CONFIGDATA = path.join('data', 'configdata');
const EXPECTED_FILE_COUNT = 753;
const CACHE_MARKER = '.configdata-source-pack-maintenance-root.v1.json';
const CONTRACT_PATH = path.join(ROOT, 'data', 'contracts', 'configdata-source-pack-contract.v1.json');
const HYDRATOR_PATH = path.join(ROOT, 'scripts', 'hydrate-configdata-source-pack-v1.mjs');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function directJsonEntries(sourceRoot) {
  const dir = path.join(sourceRoot, LOGICAL_CONFIGDATA);
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  const unexpected = entries.filter((entry) => !entry.isFile() || !entry.name.endsWith('.json'));
  return { dir, entries, jsonFiles, unexpected };
}

function requireCompleteSourceRoot(sourceRoot, label) {
  const shape = directJsonEntries(sourceRoot);
  if (!shape) throw new Error(`${label}: missing ${LOGICAL_CONFIGDATA}`);
  if (
    shape.entries.length !== EXPECTED_FILE_COUNT ||
    shape.jsonFiles.length !== EXPECTED_FILE_COUNT ||
    shape.unexpected.length !== 0
  ) {
    throw new Error(`${label}: expected exactly ${EXPECTED_FILE_COUNT} direct JSON files under ${LOGICAL_CONFIGDATA}; found entries=${shape.entries.length}, json=${shape.jsonFiles.length}`);
  }
  return path.resolve(sourceRoot);
}

function contractIdentity() {
  const contract = readJson(CONTRACT_PATH);
  if (
    contract?.stage !== 'repository-size-reduction-B2' ||
    contract?.status !== 'PASS' ||
    contract?.owner !== 'configdata-source-pack' ||
    contract?.coverage?.fileCount !== EXPECTED_FILE_COUNT ||
    contract?.authority?.logicalRawPathNamespace !== 'data/configdata' ||
    contract?.storage?.immutabilityPolicy !== 'CONTENT_HASH_PINNED_FAIL_CLOSED'
  ) {
    throw new Error('maintenance ConfigData resolver: B2 source-pack contract drift');
  }
  return {
    sourceCommitSha: contract.authoritativePredecessor.sourceCommitSha,
    sourceTreeGitSha1: contract.authoritativePredecessor.sourceTreeGitSha1,
    archiveSha256: contract.storage.archive.sha256,
    inventorySha256: contract.storage.inventory.sha256,
    checksumsSha256: contract.storage.checksums.sha256,
    fileCount: contract.coverage.fileCount,
    logicalRawPathNamespace: contract.authority.logicalRawPathNamespace,
  };
}

function markerMatches(marker, identity) {
  return marker?.version === 1 &&
    marker?.status === 'PASS' &&
    marker?.resolver === 'CONFIGDATA_SOURCE_PACK_MAINTENANCE_ROOT' &&
    Object.keys(identity).every((key) => marker.identity?.[key] === identity[key]);
}

function verifiedCacheRoot(identity) {
  const base = process.env.RUNNER_TEMP || os.tmpdir();
  const target = path.join(base, `langrisser-configdata-maintenance-v1-${identity.archiveSha256.slice(0, 16)}`);
  const markerPath = path.join(target, CACHE_MARKER);

  if (fs.existsSync(markerPath)) {
    try {
      const marker = readJson(markerPath);
      if (markerMatches(marker, identity)) return requireCompleteSourceRoot(target, 'cached external ConfigData root');
    } catch {
      // Fail closed by discarding an unverifiable cache and rebuilding it from the pinned B2 pack.
    }
  }

  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  const result = spawnSync(process.execPath, [HYDRATOR_PATH, '--target-dir', target], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`maintenance ConfigData resolver: B2 hydration failed with exit ${result.status}`);

  const completeRoot = requireCompleteSourceRoot(target, 'hydrated external ConfigData root');
  fs.writeFileSync(markerPath, `${JSON.stringify({
    version: 1,
    status: 'PASS',
    resolver: 'CONFIGDATA_SOURCE_PACK_MAINTENANCE_ROOT',
    identity,
  }, null, 2)}\n`);
  return completeRoot;
}

function resolveConfigDataSourceRoot() {
  const identity = contractIdentity();
  const explicit = process.env.CONFIGDATA_SOURCE_ROOT;
  if (explicit) return requireCompleteSourceRoot(path.resolve(explicit), 'CONFIGDATA_SOURCE_ROOT');

  const tracked = directJsonEntries(ROOT);
  if (tracked) {
    if (
      tracked.entries.length !== EXPECTED_FILE_COUNT ||
      tracked.jsonFiles.length !== EXPECTED_FILE_COUNT ||
      tracked.unexpected.length !== 0
    ) {
      throw new Error(`tracked ConfigData root is partial; expected exactly ${EXPECTED_FILE_COUNT} direct JSON files`);
    }
    return ROOT;
  }

  return verifiedCacheRoot(identity);
}

function resolveConfigDataDir() {
  return path.join(resolveConfigDataSourceRoot(), LOGICAL_CONFIGDATA);
}

function resolveConfigDataFile(fileName) {
  if (typeof fileName !== 'string' || !fileName.endsWith('.json') || path.basename(fileName) !== fileName) {
    throw new Error(`invalid ConfigData filename: ${String(fileName)}`);
  }
  return path.join(resolveConfigDataDir(), fileName);
}

module.exports = {
  ROOT,
  EXPECTED_FILE_COUNT,
  resolveConfigDataSourceRoot,
  resolveConfigDataDir,
  resolveConfigDataFile,
};
