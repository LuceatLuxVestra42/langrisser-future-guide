import { createHash } from 'node:crypto';
import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';

const POSIX_SEP = '/';
const PATH_LOCATOR_KINDS = new Set(['FULL_PATH', 'STATIC_PATH', 'SPINE_PATH']);

function toPosix(value) {
  return String(value).replaceAll('\\', POSIX_SEP).replace(/^\.\//, '').replace(/\/+/g, POSIX_SEP);
}

function normalizeRelativePath(value) {
  const normalized = path.posix.normalize(toPosix(value));
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..' || normalized.startsWith('/')) {
    throw new Error(`invalid repository-relative path: ${value}`);
  }
  return normalized;
}

function extensionOf(basename) {
  const ext = path.posix.extname(basename).toLowerCase();
  return ext || '<none>';
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function signatureOf(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'PNG';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPEG';
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString('ascii');
    if (head === 'GIF87a' || head === 'GIF89a') return 'GIF';
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'WEBP';
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === 'OggS') return 'OGG';
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === 'Unity') return 'UNITY';
  return `HEX:${bytes.subarray(0, Math.min(8, bytes.length)).toString('hex') || 'empty'}`;
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || signatureOf(bytes) !== 'PNG') return null;
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function gifDimensions(bytes) {
  if (bytes.length < 10 || signatureOf(bytes) !== 'GIF') return null;
  return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

function jpegDimensions(bytes) {
  if (signatureOf(bytes) !== 'JPEG') return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    const isSof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isSof && length >= 7) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes) {
  if (signatureOf(bytes) !== 'WEBP' || bytes.length < 30) return null;
  const chunk = bytes.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { width, height };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const packed = bytes.readUInt32LE(21);
    const width = 1 + (packed & 0x3fff);
    const height = 1 + ((packed >>> 14) & 0x3fff);
    return { width, height };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    for (let i = 20; i + 9 < bytes.length && i < 40; i += 1) {
      if (bytes[i] === 0x9d && bytes[i + 1] === 0x01 && bytes[i + 2] === 0x2a) {
        return {
          width: bytes.readUInt16LE(i + 3) & 0x3fff,
          height: bytes.readUInt16LE(i + 5) & 0x3fff,
        };
      }
    }
  }
  return null;
}

function dimensionsOf(bytes) {
  return pngDimensions(bytes) ?? jpegDimensions(bytes) ?? gifDimensions(bytes) ?? webpDimensions(bytes) ?? { width: null, height: null };
}

async function walkFiles(rootPath, current = '') {
  const directory = path.join(rootPath, current);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const files = [];
  for (const entry of entries) {
    const relative = current ? path.posix.join(toPosix(current), entry.name) : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      files.push(...await walkFiles(rootPath, relative));
      continue;
    }
    if (entry.isFile()) files.push(normalizeRelativePath(relative));
  }
  return files;
}

function annotateGroups(records) {
  const byHash = new Map();
  const byBasename = new Map();
  for (const record of records) {
    if (!byHash.has(record.sha256)) byHash.set(record.sha256, []);
    byHash.get(record.sha256).push(record);
    if (!byBasename.has(record.basename)) byBasename.set(record.basename, []);
    byBasename.get(record.basename).push(record);
  }
  for (const group of byHash.values()) {
    if (group.length > 1) {
      const id = `sha256:${group[0].sha256}`;
      for (const record of group) record.exactDuplicateGroup = id;
    }
  }
  for (const [basename, group] of byBasename.entries()) {
    if (group.length > 1) {
      const id = `basename:${basename}`;
      for (const record of group) record.basenameCollisionGroup = id;
    }
  }
}

export async function scanAssetRoot(rootPath, { sourceArtifact = null } = {}) {
  const stat = await lstat(rootPath);
  if (!stat.isDirectory()) throw new Error(`asset root must be a directory: ${rootPath}`);
  const relativePaths = await walkFiles(rootPath);
  const records = [];
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(rootPath, ...relativePath.split('/'));
    const bytes = await readFile(absolutePath);
    const basename = path.posix.basename(relativePath);
    const { width, height } = dimensionsOf(bytes);
    records.push({
      sourceArtifact,
      sourcePath: relativePath,
      relativePath,
      basename,
      extension: extensionOf(basename),
      byteSize: bytes.length,
      signature: signatureOf(bytes),
      width,
      height,
      sha256: sha256(bytes),
      exactDuplicateGroup: null,
      basenameCollisionGroup: null,
    });
  }
  annotateGroups(records);
  records.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'));
  return records;
}

function approvedRootContains(record, approvedRoot) {
  if (!approvedRoot) return true;
  const root = normalizeRelativePath(approvedRoot).replace(/\/$/, '');
  return record.relativePath === root || record.relativePath.startsWith(`${root}/`);
}

function exactPathCandidates(locator, inventory) {
  const value = normalizeRelativePath(locator.value);
  const approvedRoot = locator.approvedRoot ? normalizeRelativePath(locator.approvedRoot) : null;
  const scopedValue = approvedRoot && !(value === approvedRoot || value.startsWith(`${approvedRoot}/`))
    ? path.posix.join(approvedRoot, value)
    : value;
  return inventory.filter((record) => record.relativePath === scopedValue && approvedRootContains(record, approvedRoot));
}

function exactFilenameCandidates(locator, inventory) {
  const filename = path.posix.basename(toPosix(locator.value));
  return inventory.filter((record) => record.basename === filename && approvedRootContains(record, locator.approvedRoot));
}

function resourceIdCandidates(locator, inventory, resourceMap) {
  if (!resourceMap) return { candidates: [], supported: false };
  const key = String(locator.value);
  const raw = resourceMap instanceof Map ? resourceMap.get(key) ?? resourceMap.get(locator.value) : resourceMap[key];
  if (raw == null) return { candidates: [], supported: true };
  const values = Array.isArray(raw) ? raw : [raw];
  const paths = values.map(normalizeRelativePath);
  const pathSet = new Set(paths);
  return {
    candidates: inventory.filter((record) => pathSet.has(record.relativePath) && approvedRootContains(record, locator.approvedRoot)),
    supported: true,
  };
}

export function resolveExpectedLocator(locator, inventory, { resourceMap = null } = {}) {
  if (!locator || typeof locator !== 'object') throw new Error('locator must be an object');
  let candidates;
  let supported = true;
  if (PATH_LOCATOR_KINDS.has(locator.locatorKind)) candidates = exactPathCandidates(locator, inventory);
  else if (locator.locatorKind === 'EXACT_FILENAME') candidates = exactFilenameCandidates(locator, inventory);
  else if (locator.locatorKind === 'RESOURCE_ID') ({ candidates, supported } = resourceIdCandidates(locator, inventory, resourceMap));
  else throw new Error(`unsupported locator kind: ${locator.locatorKind}`);

  candidates = [...candidates].sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'));
  if (!supported) return { status: 'PENDING', reason: 'RESOURCE_MAP_REQUIRED', matches: [] };
  if (candidates.length === 0) return { status: 'PENDING', reason: 'NO_EXACT_MATCH', matches: [] };
  if (candidates.length > 1) return { status: 'AMBIGUOUS', reason: 'MULTIPLE_EXACT_MATCHES', matches: candidates };
  return { status: 'RESOLVED', reason: 'EXACT_MATCH', matches: candidates };
}

export function buildEvidence(record, expectedLocatorIndex) {
  if (!record) throw new Error('record is required');
  const evidence = {
    expectedLocatorIndex,
    sourcePath: record.sourcePath,
    relativePath: record.relativePath,
    basename: record.basename,
    extension: record.extension,
    byteSize: record.byteSize,
    signature: record.signature,
    sha256: record.sha256,
  };
  if (record.sourceArtifact) evidence.sourceArtifact = record.sourceArtifact;
  if (record.width !== null) evidence.width = record.width;
  if (record.height !== null) evidence.height = record.height;
  if (record.exactDuplicateGroup) evidence.exactDuplicateGroup = record.exactDuplicateGroup;
  if (record.basenameCollisionGroup) evidence.basenameCollisionGroup = record.basenameCollisionGroup;
  return evidence;
}

export function resolveRecordEvidence(record, inventory, options = {}) {
  const results = record.expectedLocators.map((locator, expectedLocatorIndex) => {
    const resolution = resolveExpectedLocator(locator, inventory, options);
    return {
      expectedLocatorIndex,
      locator,
      ...resolution,
      evidence: resolution.status === 'RESOLVED' ? [buildEvidence(resolution.matches[0], expectedLocatorIndex)] : [],
    };
  });
  return results;
}

export function compareByteParity(leftRecord, rightRecord) {
  if (!leftRecord || !rightRecord) return { equal: false, reason: 'MISSING_RECORD' };
  if (leftRecord.byteSize !== rightRecord.byteSize) return { equal: false, reason: 'BYTE_SIZE_MISMATCH' };
  if (leftRecord.sha256 !== rightRecord.sha256) return { equal: false, reason: 'SHA256_MISMATCH' };
  return { equal: true, reason: 'EXACT_BYTE_PARITY' };
}

export function stableInventoryJson(records) {
  const clean = [...records]
    .map((record) => ({ ...record }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'));
  return `${JSON.stringify(clean, null, 2)}\n`;
}
