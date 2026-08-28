import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const STAGE1_CONTRACT_PATH = 'data/contracts/configdata-lookup-stage1-id-index-contract.v1.json';
export const STAGE0_CONTRACT_PATH = 'data/contracts/configdata-lookup-stage0-contract.v1.json';

export async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return { text, value: JSON.parse(text) };
}

export function sha256Utf8(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function extractRecords(root, acceptedContainers) {
  if (Array.isArray(root) && acceptedContainers.includes('ROOT_ARRAY')) {
    return { records: root, containerPath: '$' };
  }

  if (root && typeof root === 'object' && !Array.isArray(root)) {
    for (const key of acceptedContainers) {
      if (key === 'ROOT_ARRAY') continue;
      if (Array.isArray(root[key])) {
        return { records: root[key], containerPath: `$.${key}` };
      }
    }
  }

  throw new Error('Unsupported ConfigData source container; fail-closed per Stage 1 contract.');
}

export function normalizeId(value, entity, recordIndex) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${entity}: missing/empty ID at recordIndex ${recordIndex}`);
  }

  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`${entity}: unsupported ID type ${typeof value} at recordIndex ${recordIndex}`);
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`${entity}: non-finite numeric ID at recordIndex ${recordIndex}`);
  }

  return String(value);
}

function compareIds(a, b) {
  const integer = /^-?\d+$/;
  if (integer.test(a) && integer.test(b)) {
    const aa = BigInt(a);
    const bb = BigInt(b);
    if (aa < bb) return -1;
    if (aa > bb) return 1;
    return 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function copyLabels(record, fields) {
  const labels = {};
  for (const field of fields) {
    const value = record?.[field];
    if (typeof value === 'string' && value.length > 0) labels[field] = value;
  }
  return labels;
}

export async function loadStage1Contract() {
  return (await readJson(STAGE1_CONTRACT_PATH)).value;
}

export async function loadStage0Contract() {
  return (await readJson(STAGE0_CONTRACT_PATH)).value;
}

export async function buildEntityIndex(entity, spec, contract) {
  const sourceText = await fs.readFile(spec.source, 'utf8');
  const root = JSON.parse(sourceText);
  const { records, containerPath } = extractRecords(root, contract.acceptedSourceContainers);

  const seen = new Set();
  const rows = [];

  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`${entity}: non-object source record at recordIndex ${recordIndex}`);
    }

    const id = normalizeId(record[spec.primaryKey], entity, recordIndex);
    if (seen.has(id)) throw new Error(`${entity}: duplicate primary key ${id}`);
    seen.add(id);

    rows.push({
      id,
      recordIndex,
      labels: copyLabels(record, spec.searchLabelFields ?? []),
    });
  }

  rows.sort((a, b) => compareIds(a.id, b.id));

  const ids = [];
  const byId = {};
  for (const row of rows) {
    ids.push(row.id);
    const entry = { recordIndex: row.recordIndex };
    if (Object.keys(row.labels).length > 0) entry.labels = row.labels;
    byId[row.id] = entry;
  }

  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_1',
    status: 'ID_INDEX_MATERIALIZED',
    entity,
    contract: STAGE1_CONTRACT_PATH,
    source: {
      path: spec.source,
      primaryKey: spec.primaryKey,
      containerPath,
      sha256: sha256Utf8(sourceText),
      recordCount: records.length,
    },
    index: {
      keyEncoding: 'STRINGIFIED_EXPLICIT_SOURCE_ID',
      entryCount: rows.length,
      ids,
      byId,
    },
  };
}

export function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, renderJson(value), 'utf8');
}

export async function buildSummary(contract, built) {
  const entities = {};
  let totalEntries = 0;

  for (const [entity, index] of Object.entries(built)) {
    entities[entity] = {
      source: index.source.path,
      output: contract.entities[entity].output,
      sourceSha256: index.source.sha256,
      sourceRecordCount: index.source.recordCount,
      indexEntryCount: index.index.entryCount,
      containerPath: index.source.containerPath,
    };
    totalEntries += index.index.entryCount;
  }

  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_1',
    status: 'PASS_CONFIGDATA_LOOKUP_STAGE1_ID_INDEX',
    contract: STAGE1_CONTRACT_PATH,
    entityCount: Object.keys(entities).length,
    totalEntries,
    entities,
    semanticBoundary: {
      fullSourceRecordsDuplicated: false,
      forwardRelationsGenerated: false,
      reverseRelationsGenerated: false,
      canonicalRelationsRecomputed: false,
      nameJoinUsed: false,
      idArithmeticUsed: false,
    },
  };
}
