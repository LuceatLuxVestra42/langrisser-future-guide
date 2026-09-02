import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMAT_CONTRACT = 'data/contracts/configdata-source-pack-format.v1.json';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function fail(message, detail = null) {
  console.error(`CONFIGDATA SOURCE PACK B1b: FAIL - ${message}`);
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

function utf8BytewiseCompare(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function writeAsciiField(buffer, offset, length, value, fieldName) {
  const bytes = Buffer.from(value, 'ascii');
  if (bytes.length > length) fail(`${fieldName} exceeds USTAR field width`, { value, length });
  bytes.copy(buffer, offset);
}

function writeOctalField(buffer, offset, length, value, fieldName) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`invalid ${fieldName}`, value);
  const octal = value.toString(8);
  if (octal.length > length - 1) fail(`${fieldName} exceeds USTAR octal field`, { value, length });
  const text = octal.padStart(length - 1, '0');
  buffer.write(text, offset, length - 1, 'ascii');
  buffer[offset + length - 1] = 0;
}

function createUstarHeader(memberPath, byteLength, format) {
  const header = Buffer.alloc(format.archive.blockSize, 0);
  const memberBytes = Buffer.from(memberPath, 'utf8');
  if (memberBytes.length > format.archive.memberPathUtf8ByteLengthMax) {
    fail('archive member path is not representable in frozen USTAR name field', {
      memberPath,
      utf8Bytes: memberBytes.length,
      max: format.archive.memberPathUtf8ByteLengthMax,
    });
  }
  memberBytes.copy(header, 0);

  writeOctalField(header, 100, 8, Number.parseInt(format.regularFileHeader.modeOctal, 8), 'mode');
  writeOctalField(header, 108, 8, format.regularFileHeader.uid, 'uid');
  writeOctalField(header, 116, 8, format.regularFileHeader.gid, 'gid');
  writeOctalField(header, 124, 12, byteLength, 'size');
  writeOctalField(header, 136, 12, format.regularFileHeader.mtimeUnixSeconds, 'mtime');

  header.fill(0x20, 148, 156);
  writeAsciiField(header, 156, 1, format.regularFileHeader.typeFlag, 'typeFlag');
  writeAsciiField(header, 157, 100, format.regularFileHeader.linkName, 'linkName');
  Buffer.from([0x75, 0x73, 0x74, 0x61, 0x72, 0x00]).copy(header, 257);
  writeAsciiField(header, 263, 2, format.regularFileHeader.ustarVersion, 'ustarVersion');
  writeAsciiField(header, 265, 32, format.regularFileHeader.userName, 'userName');
  writeAsciiField(header, 297, 32, format.regularFileHeader.groupName, 'groupName');
  writeOctalField(header, 329, 8, format.regularFileHeader.deviceMajor, 'deviceMajor');
  writeOctalField(header, 337, 8, format.regularFileHeader.deviceMinor, 'deviceMinor');

  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumOctal = checksum.toString(8);
  if (checksumOctal.length > 6) fail('USTAR checksum field overflow', checksum);
  header.write(checksumOctal.padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function writeDeterministicTar(targetPath, records, format) {
  const archiveHash = crypto.createHash('sha256');
  const fd = fs.openSync(targetPath, 'w');
  let writtenBytes = 0;

  const writeChunk = (chunk) => {
    fs.writeSync(fd, chunk);
    archiveHash.update(chunk);
    writtenBytes += chunk.length;
  };

  try {
    for (const record of records) {
      const bytes = fs.readFileSync(path.join(ROOT, record.path));
      if (bytes.length !== record.byteLength || sha256(bytes) !== record.sha256) {
        fail('source bytes changed while writing archive', { path: record.path });
      }
      writeChunk(createUstarHeader(record.path, bytes.length, format));
      writeChunk(bytes);
      const remainder = bytes.length % format.archive.blockSize;
      if (remainder !== 0) {
        writeChunk(Buffer.alloc(format.archive.blockSize - remainder, format.regularFileHeader.dataPaddingByte));
      }
    }
    writeChunk(Buffer.alloc(format.archive.blockSize * format.archive.endOfArchiveZeroBlockCount, 0));
  } finally {
    fs.closeSync(fd);
  }

  return {
    byteLength: writtenBytes,
    sha256: archiveHash.digest('hex'),
  };
}

function validateFormat(format) {
  if (
    format?.version !== 1 ||
    format?.contract !== 'configdata-source-pack-format' ||
    format?.stage !== 'repository-size-reduction-B1a' ||
    format?.status !== 'PASS' ||
    format?.owner !== 'configdata-source-pack'
  ) {
    fail('B1a format contract is not the admitted PASS input');
  }
  if (
    format?.archive?.format !== 'POSIX_USTAR' ||
    format?.archive?.compression !== 'NONE' ||
    format?.archive?.blockSize !== 512 ||
    format?.archive?.endOfArchiveZeroBlockCount !== 2 ||
    format?.archive?.extensionsAllowed !== false ||
    format?.archive?.paxHeadersAllowed !== false ||
    format?.archive?.gnuExtensionsAllowed !== false ||
    format?.archive?.memberPathUtf8ByteLengthMax !== 100
  ) {
    fail('B1a archive format drift', format?.archive ?? null);
  }
  if (
    format?.contentSelection?.scope !== 'DIRECT_CHILD_REGULAR_JSON_FILES_ONLY' ||
    format?.contentSelection?.recursive !== false ||
    format?.contentSelection?.directoriesIncludedAsMembers !== false ||
    format?.contentSelection?.symlinksAllowed !== false ||
    format?.contentSelection?.nonJsonFilesAllowed !== false ||
    format?.contentSelection?.sourceBytesMustRemainExact !== true ||
    format?.contentSelection?.jsonReserializationAllowed !== false ||
    format?.contentSelection?.textTranscodingAllowed !== false ||
    format?.contentSelection?.newlineNormalizationAllowed !== false
  ) {
    fail('B1a source-byte selection drift', format?.contentSelection ?? null);
  }
  if (
    format?.ordering?.key !== 'FULL_ARCHIVE_MEMBER_PATH_UTF8_BYTES' ||
    format?.ordering?.direction !== 'ASCENDING' ||
    format?.ordering?.localeAware !== false ||
    format?.ordering?.numericAware !== false ||
    format?.ordering?.caseFolding !== false
  ) {
    fail('B1a ordering drift', format?.ordering ?? null);
  }
  if (
    format?.regularFileHeader?.modeOctal !== '0644' ||
    format?.regularFileHeader?.uid !== 0 ||
    format?.regularFileHeader?.gid !== 0 ||
    format?.regularFileHeader?.mtimeUnixSeconds !== 0 ||
    format?.regularFileHeader?.typeFlag !== '0' ||
    format?.regularFileHeader?.linkName !== '' ||
    format?.regularFileHeader?.ustarMagic !== 'ustar\\0' ||
    format?.regularFileHeader?.ustarVersion !== '00' ||
    format?.regularFileHeader?.userName !== '' ||
    format?.regularFileHeader?.groupName !== '' ||
    format?.regularFileHeader?.deviceMajor !== 0 ||
    format?.regularFileHeader?.deviceMinor !== 0 ||
    format?.regularFileHeader?.dataPaddingByte !== 0
  ) {
    fail('B1a regular-file header drift', format?.regularFileHeader ?? null);
  }
}

const format = readJson(FORMAT_CONTRACT);
validateFormat(format);

const sourceSha = arg('--source-sha');
const outDirArg = arg('--out-dir', 'dist/configdata-source-pack');
if (!sourceSha || !/^[a-f0-9]{40}$/.test(sourceSha)) fail('invalid --source-sha', sourceSha);
if (sourceSha !== format.authoritativePredecessor.rawSourceCommitSha) {
  fail('--source-sha does not match B1a pinned raw source commit', {
    requested: sourceSha,
    pinned: format.authoritativePredecessor.rawSourceCommitSha,
  });
}

try {
  git('cat-file', '-e', `${sourceSha}^{commit}`);
} catch {
  fail('pinned raw source commit is not available in checkout', sourceSha);
}

const sourceDir = format.authoritativePredecessor.logicalSourceRoot;
try {
  execFileSync('git', ['diff', '--quiet', `${sourceSha}..HEAD`, '--', sourceDir], {
    cwd: ROOT,
    stdio: 'ignore',
  });
} catch {
  fail('tracked ConfigData bytes or file set differ from B1a pinned raw source commit', {
    sourceSha,
    sourceDir,
  });
}

const sourceDirAbs = path.join(ROOT, sourceDir);
const entries = fs.readdirSync(sourceDirAbs, { withFileTypes: true });
if (entries.length !== format.authoritativePredecessor.currentTrackedJsonCount) {
  fail('tracked ConfigData file count drift', entries.length);
}
if (entries.some((entry) => !entry.isFile() || !entry.name.endsWith('.json'))) {
  fail('tracked ConfigData root contains a non-regular or non-JSON entry');
}

const memberPaths = entries
  .map((entry) => `${format.contentSelection.memberPathPrefix}${entry.name}`)
  .sort(utf8BytewiseCompare);
if (new Set(memberPaths).size !== memberPaths.length) fail('duplicate ConfigData archive member path');

let totalSourceBytes = 0;
const records = [];
for (const memberPath of memberPaths) {
  const memberBytes = Buffer.from(memberPath, 'utf8');
  if (memberBytes.length > format.archive.memberPathUtf8ByteLengthMax) {
    fail('ConfigData path exceeds frozen USTAR member-path limit', {
      memberPath,
      utf8Bytes: memberBytes.length,
    });
  }
  const bytes = fs.readFileSync(path.join(ROOT, memberPath));
  totalSourceBytes += bytes.length;
  records.push({
    path: memberPath,
    fileName: path.basename(memberPath),
    byteLength: bytes.length,
    sha256: sha256(bytes),
  });
}

const outDir = path.resolve(ROOT, outDirArg);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const shortSha = sourceSha.slice(0, 8);
const archiveBase = `configdata-source-v1-${shortSha}`;
const archivePath = path.join(outDir, `${archiveBase}.tar`);
const repeatArchivePath = path.join(outDir, `${archiveBase}.repeat.tar`);

const archive = writeDeterministicTar(archivePath, records, format);
const repeated = writeDeterministicTar(repeatArchivePath, records, format);
if (archive.sha256 !== repeated.sha256 || archive.byteLength !== repeated.byteLength) {
  fail('deterministic archive repeat-build mismatch', { archive, repeated });
}
fs.rmSync(repeatArchivePath, { force: true });

const listedMembersText = execFileSync('tar', ['-tf', archivePath], {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const listedMembers = listedMembersText.trimEnd().split('\n').filter(Boolean);
if (JSON.stringify(listedMembers) !== JSON.stringify(memberPaths)) {
  fail('system tar member listing differs from frozen inventory order', {
    listedCount: listedMembers.length,
    expectedCount: memberPaths.length,
  });
}

const verifyDir = path.join(outDir, '.verify');
fs.mkdirSync(verifyDir, { recursive: true });
execFileSync('tar', ['-xf', archivePath, '-C', verifyDir], { cwd: ROOT, stdio: 'inherit' });
const extractedRoot = path.join(verifyDir, sourceDir);
const extractedEntries = fs.readdirSync(extractedRoot, { withFileTypes: true });
if (extractedEntries.length !== records.length || extractedEntries.some((entry) => !entry.isFile())) {
  fail('archive extraction file-set shape mismatch', extractedEntries.length);
}
for (const record of records) {
  const extracted = fs.readFileSync(path.join(verifyDir, record.path));
  if (extracted.length !== record.byteLength || sha256(extracted) !== record.sha256) {
    fail('archive round-trip exact-byte mismatch', { path: record.path });
  }
}
fs.rmSync(verifyDir, { recursive: true, force: true });

const sourceTreeGitSha1 = git('rev-parse', `${sourceSha}:${sourceDir}`);
const formatContractGitBlobSha1 = git('rev-parse', `HEAD:${FORMAT_CONTRACT}`);
const inventory = {
  version: 1,
  schemaId: 'configdata-source-pack-inventory/v1',
  stage: 'repository-size-reduction-B1b',
  status: 'PASS',
  owner: 'configdata-source-pack',
  source: {
    repository: 'LuceatLuxVestra42/langrisser-future-guide',
    commitSha: sourceSha,
    logicalRoot: sourceDir,
    gitTreeSha1: sourceTreeGitSha1,
  },
  formatContract: {
    path: FORMAT_CONTRACT,
    version: format.version,
    stage: format.stage,
    gitBlobSha1: formatContractGitBlobSha1,
  },
  identityPolicy: {
    exactFileSet: true,
    perFileSha256: true,
    perFileByteLength: true,
    archiveSha256Role: format.identityPolicy.archiveSha256Role,
    archiveSha256CreatesSemanticAuthority: false,
    noJsonReserialization: true,
    noTextTranscoding: true,
    noNewlineNormalization: true,
  },
  semanticBoundary: {
    semanticAuthorityChanged: false,
    frozenSemanticDomainsReopened: false,
    canonicalIdentityChanges: false,
    relationChanges: false,
    nameJoinIntroduced: false,
    idArithmeticIntroduced: false,
    filenameSimilarityIntroduced: false,
  },
  coverage: {
    fileCount: records.length,
    totalSourceBytes,
    missingCount: 0,
    extraCount: 0,
    duplicatePathCount: 0,
  },
  archive: {
    fileName: path.basename(archivePath),
    format: format.archive.format,
    compression: format.archive.compression,
    byteLength: archive.byteLength,
    sha256: archive.sha256,
    repeatBuildByteIdentical: true,
    systemTarMemberListingVerified: true,
    roundTripExactBytesVerified: true,
  },
  records,
};

const inventoryPath = path.join(outDir, `${archiveBase}.inventory.json`);
fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
const inventoryBytes = fs.readFileSync(inventoryPath);
const inventorySha256 = sha256(inventoryBytes);
const checksumsPath = path.join(outDir, `${archiveBase}.sha256`);
fs.writeFileSync(
  checksumsPath,
  `${archive.sha256}  ${path.basename(archivePath)}\n${inventorySha256}  ${path.basename(inventoryPath)}\n`,
);

console.log('CONFIGDATA SOURCE PACK B1b: PASS');
console.log(JSON.stringify({
  sourceCommitSha: sourceSha,
  sourceTreeGitSha1,
  fileCount: records.length,
  totalSourceBytes,
  archive: path.basename(archivePath),
  archiveBytes: archive.byteLength,
  archiveSha256: archive.sha256,
  inventory: path.basename(inventoryPath),
  inventoryBytes: inventoryBytes.length,
  inventorySha256,
  checksums: path.basename(checksumsPath),
}, null, 2));
