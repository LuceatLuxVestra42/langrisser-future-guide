import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SOURCE_PROVENANCE_HASH_ALGORITHM = 'git-blob-sha1';

function resolveRepositoryPath(repoRoot, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error(`SOURCE_UNAVAILABLE: invalid repository-relative source path: ${relativePath}`);
  }
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`SOURCE_UNAVAILABLE: source path escapes repository: ${relativePath}`);
  }
  return absolute;
}

export function gitBlobSha(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('gitBlobSha requires a Buffer.');
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

export function captureSourceProvenance({ repoRoot = process.cwd(), sourcePath } = {}) {
  const absolute = resolveRepositoryPath(repoRoot, sourcePath);
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    throw new Error(`SOURCE_UNAVAILABLE: ${sourcePath}`);
  }
  if (!stat.isFile()) throw new Error(`SOURCE_UNAVAILABLE: ${sourcePath}`);

  let bytes;
  try {
    bytes = fs.readFileSync(absolute);
  } catch {
    throw new Error(`SOURCE_UNAVAILABLE: ${sourcePath}`);
  }

  return {
    sourcePath,
    hashAlgorithm: SOURCE_PROVENANCE_HASH_ALGORITHM,
    gitBlobSha: gitBlobSha(bytes),
  };
}

export function validateSourceProvenance({ repoRoot = process.cwd(), sourcePath, provenance } = {}) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new Error(`INVALID_PROVENANCE: ${sourcePath}`);
  }
  if (provenance.sourcePath !== sourcePath) {
    throw new Error(`PROVENANCE_PATH_MISMATCH: expected ${sourcePath}, recorded ${provenance.sourcePath ?? 'missing'}`);
  }
  if (provenance.hashAlgorithm !== SOURCE_PROVENANCE_HASH_ALGORITHM) {
    throw new Error(`INVALID_PROVENANCE: unsupported hash algorithm for ${sourcePath}: ${provenance.hashAlgorithm ?? 'missing'}`);
  }
  if (typeof provenance.gitBlobSha !== 'string' || !/^[0-9a-f]{40}$/.test(provenance.gitBlobSha)) {
    throw new Error(`INVALID_PROVENANCE: malformed gitBlobSha for ${sourcePath}`);
  }

  const current = captureSourceProvenance({ repoRoot, sourcePath });
  if (current.gitBlobSha !== provenance.gitBlobSha) {
    throw new Error(`STALE_SOURCE_PROVENANCE: ${sourcePath} expected ${provenance.gitBlobSha} actual ${current.gitBlobSha}`);
  }

  return {
    status: 'FRESH',
    ...current,
  };
}
