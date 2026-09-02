import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const resolver = require('./configdata-source-pack-maintenance-root.cjs');

export const ROOT = resolver.ROOT;
export const EXPECTED_FILE_COUNT = resolver.EXPECTED_FILE_COUNT;
export const resolveConfigDataSourceRoot = resolver.resolveConfigDataSourceRoot;
export const resolveConfigDataDir = resolver.resolveConfigDataDir;
export const resolveConfigDataFile = resolver.resolveConfigDataFile;
