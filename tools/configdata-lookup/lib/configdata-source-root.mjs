import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONFIGDATA_SOURCE_ROOT_ENV = 'CONFIGDATA_SOURCE_ROOT';
export const LOGICAL_CONFIGDATA_ROOT = 'data/configdata';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const STATE = Symbol.for('langrisser.configdataLookup.sourceRootReadRedirect.v1');

function normalizeRoot(root) {
  const resolved = path.resolve(root);
  if (!path.isAbsolute(resolved)) throw new Error(`${CONFIGDATA_SOURCE_ROOT_ENV} must resolve to an absolute path`);
  return resolved;
}

export function getDefaultConfigDataSourceRoot() {
  return REPO_ROOT;
}

export function getConfiguredConfigDataSourceRoot(env = process.env) {
  const configured = env[CONFIGDATA_SOURCE_ROOT_ENV];
  if (configured === undefined || configured === '') return REPO_ROOT;
  if (!path.isAbsolute(configured)) {
    throw new Error(`${CONFIGDATA_SOURCE_ROOT_ENV} must be an absolute workspace root containing ${LOGICAL_CONFIGDATA_ROOT}`);
  }
  return normalizeRoot(configured);
}

export function isLogicalConfigDataPath(filePath) {
  if (typeof filePath !== 'string') return false;
  if (filePath.includes('\\')) return false;
  if (path.posix.isAbsolute(filePath)) return false;
  if (path.posix.normalize(filePath) !== filePath) return false;
  if (!filePath.startsWith(`${LOGICAL_CONFIGDATA_ROOT}/`)) return false;
  if (!filePath.endsWith('.json')) return false;
  return true;
}

export function resolveConfigDataSourcePath(logicalPath, sourceRoot = getConfiguredConfigDataSourceRoot()) {
  if (!isLogicalConfigDataPath(logicalPath)) {
    throw new Error(`ConfigData source path must stay in logical namespace ${LOGICAL_CONFIGDATA_ROOT}/...json: ${String(logicalPath)}`);
  }

  const root = normalizeRoot(sourceRoot);
  const resolved = path.resolve(root, ...logicalPath.split('/'));
  const expectedPrefix = `${root}${path.sep}`;
  if (!resolved.startsWith(expectedPrefix)) {
    throw new Error(`Resolved ConfigData source escaped physical source root: ${logicalPath}`);
  }
  return resolved;
}

export function installConfigDataSourceRootReadRedirect({ sourceRoot = getConfiguredConfigDataSourceRoot() } = {}) {
  const normalizedRoot = normalizeRoot(sourceRoot);
  const existing = fs[STATE];

  if (existing) {
    const previousRoot = existing.sourceRoot;
    existing.sourceRoot = normalizedRoot;
    return {
      sourceRoot: normalizedRoot,
      logicalRoot: LOGICAL_CONFIGDATA_ROOT,
      repoRoot: REPO_ROOT,
      restore() {
        existing.sourceRoot = previousRoot;
      },
    };
  }

  const originalReadFile = fs.readFile.bind(fs);
  const state = {
    sourceRoot: normalizedRoot,
    originalReadFile,
  };

  Object.defineProperty(fs, STATE, {
    value: state,
    writable: false,
    configurable: false,
    enumerable: false,
  });

  fs.readFile = async function configDataSourceRootAwareReadFile(filePath, ...args) {
    if (isLogicalConfigDataPath(filePath)) {
      return originalReadFile(resolveConfigDataSourcePath(filePath, state.sourceRoot), ...args);
    }
    return originalReadFile(filePath, ...args);
  };

  return {
    sourceRoot: normalizedRoot,
    logicalRoot: LOGICAL_CONFIGDATA_ROOT,
    repoRoot: REPO_ROOT,
    restore() {
      state.sourceRoot = REPO_ROOT;
    },
  };
}
