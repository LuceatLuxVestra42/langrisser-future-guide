import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONFIGDATA_SOURCE_ROOT_ENV = 'CONFIGDATA_SOURCE_ROOT';
export const LOGICAL_CONFIGDATA_ROOT = 'data/configdata';
export const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

function fail(message, detail = null) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

export function validateLogicalConfigDataPath(logicalPath) {
  if (typeof logicalPath !== 'string' || logicalPath.length === 0) {
    fail('ConfigData logical path must be a non-empty string', logicalPath ?? null);
  }
  if (path.isAbsolute(logicalPath) || logicalPath.startsWith('/') || logicalPath.includes('\\')) {
    fail('ConfigData logical path must be a relative POSIX path', logicalPath);
  }

  const segments = logicalPath.split('/');
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    fail('ConfigData logical path contains an unsafe segment', logicalPath);
  }
  if (!logicalPath.startsWith(`${LOGICAL_CONFIGDATA_ROOT}/`)) {
    fail('ConfigData logical path is outside the admitted namespace', logicalPath);
  }
  if (!logicalPath.endsWith('.json')) {
    fail('ConfigData logical source must be a JSON file', logicalPath);
  }

  return logicalPath;
}

export function getConfigDataSourceRoot(env = process.env) {
  const configured = env?.[CONFIGDATA_SOURCE_ROOT_ENV];
  if (configured === undefined || configured === null || configured === '') {
    return REPOSITORY_ROOT;
  }
  if (typeof configured !== 'string' || !path.isAbsolute(configured)) {
    fail(`${CONFIGDATA_SOURCE_ROOT_ENV} must be an absolute filesystem path`, configured ?? null);
  }
  return path.resolve(configured);
}

export function resolveConfigDataSourcePath(logicalPath, options = {}) {
  validateLogicalConfigDataPath(logicalPath);

  const sourceRoot = options.sourceRoot ?? getConfigDataSourceRoot(options.env ?? process.env);
  if (typeof sourceRoot !== 'string' || !path.isAbsolute(sourceRoot)) {
    fail('ConfigData physical source root must be absolute', sourceRoot ?? null);
  }

  const normalizedRoot = path.resolve(sourceRoot);
  const physicalPath = path.resolve(normalizedRoot, ...logicalPath.split('/'));
  const relative = path.relative(normalizedRoot, physicalPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('Resolved ConfigData path escaped the physical source root', {
      logicalPath,
      sourceRoot: normalizedRoot,
      physicalPath,
    });
  }

  return physicalPath;
}
