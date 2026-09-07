import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { lookupEntity } from './lookup.mjs';
import {
  getConfiguredConfigDataSourceRoot,
  resolveConfigDataSourcePath,
} from './configdata-source-root.mjs';

const ACCEPTED_CONTAINERS = ['ROOT_ARRAY', 'records', 'data', 'items'];

function sha256Utf8(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function extractRecords(root) {
  if (Array.isArray(root)) return { records: root, containerPath: '$' };
  if (root && typeof root === 'object') {
    for (const key of ACCEPTED_CONTAINERS) {
      if (key === 'ROOT_ARRAY') continue;
      if (Array.isArray(root[key])) return { records: root[key], containerPath: `$.${key}` };
    }
  }
  throw new Error('Unsupported ConfigData source container.');
}

function normalizeExpectedId(value) {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text) || BigInt(text) <= 0n) {
    throw new Error(`expectedId must be a positive integer ID, got ${text || '(empty)'}`);
  }
  return BigInt(text).toString();
}

export async function readSourceRecordByLocator({
  locator,
  expectedId,
  primaryKey = 'ID',
  sourceRoot = getConfiguredConfigDataSourceRoot(),
} = {}) {
  if (!locator || typeof locator !== 'object') throw new Error('locator is required');
  if (typeof locator.source !== 'string' || locator.source.length === 0) throw new Error('locator.source is required');
  if (typeof locator.sourceSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(locator.sourceSha256)) {
    throw new Error('locator.sourceSha256 must be a lowercase SHA-256 hex digest');
  }
  if (!Number.isInteger(locator.recordIndex) || locator.recordIndex < 0) {
    throw new Error(`locator.recordIndex must be a non-negative integer, got ${String(locator.recordIndex)}`);
  }

  const id = normalizeExpectedId(expectedId);
  const physicalPath = resolveConfigDataSourcePath(locator.source, sourceRoot);
  const sourceText = await fs.readFile(physicalPath, 'utf8');
  const actualSha256 = sha256Utf8(sourceText);
  if (actualSha256 !== locator.sourceSha256) {
    throw new Error(`${locator.source}: source SHA-256 mismatch`);
  }

  const root = JSON.parse(sourceText);
  const { records, containerPath } = extractRecords(root);
  if (containerPath !== locator.containerPath) {
    throw new Error(`${locator.source}: containerPath mismatch; locator=${locator.containerPath} actual=${containerPath}`);
  }
  if (locator.recordIndex >= records.length) {
    throw new Error(`${locator.source}: recordIndex ${locator.recordIndex} out of range ${records.length}`);
  }

  const record = records[locator.recordIndex];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`${locator.source}: non-object record at recordIndex ${locator.recordIndex}`);
  }

  const actualId = String(record[primaryKey] ?? '');
  if (actualId !== id) {
    throw new Error(`${locator.source}: ${primaryKey} mismatch at recordIndex ${locator.recordIndex}; expected ${id}, got ${actualId || '(missing)'}`);
  }

  return {
    source: locator.source,
    sourceSha256: actualSha256,
    containerPath,
    recordIndex: locator.recordIndex,
    primaryKey,
    id,
    record,
  };
}

export async function readIndexedSourceRecord(entity, id, options = {}) {
  const lookup = await lookupEntity(entity, id);
  if (!lookup.locator) throw new Error(`${lookup.entity} ${lookup.id}: no Stage 1 locator`);
  return readSourceRecordByLocator({
    locator: lookup.locator,
    expectedId: lookup.id,
    primaryKey: 'ID',
    sourceRoot: options.sourceRoot ?? getConfiguredConfigDataSourceRoot(),
  });
}
