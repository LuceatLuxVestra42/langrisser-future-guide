import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveConfigDataSourcePath } from '../../tools/configdata-lookup/lib/source-root.mjs';

export const STAGE2_CONTRACT_PATH = 'data/contracts/configdata-lookup-stage2-forward-join-contract.v1.json';
export const STAGE1_SUMMARY_PATH = 'data/validation/configdata-lookup-stage1-summary.v1.json';

export async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return { text, value: JSON.parse(text) };
}

export function sha256Utf8(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalizePositiveIntegerId(value, context, allowEmpty) {
  if (value === undefined || value === null || value === '' || value === 0 || value === '0') {
    if (allowEmpty) return null;
    throw new Error(`${context}: missing/non-positive ID`);
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      if (allowEmpty && Number.isFinite(value) && value <= 0) return null;
      throw new Error(`${context}: expected a positive safe integer ID, got ${String(value)}`);
    }
    return String(value);
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const normalized = BigInt(value);
    if (normalized <= 0n) {
      if (allowEmpty) return null;
      throw new Error(`${context}: non-positive string ID ${value}`);
    }
    return normalized.toString();
  }

  throw new Error(`${context}: expected a numeric ID, got ${typeof value}`);
}

function compareIds(a, b) {
  const aa = BigInt(a);
  const bb = BigInt(b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function compareEdges(a, b) {
  const sourceCompare = compareIds(a[0], b[0]);
  return sourceCompare || compareIds(a[1], b[1]);
}

export async function loadStage2Contract() {
  return (await readJson(STAGE2_CONTRACT_PATH)).value;
}

export async function loadSourceTypes(contract) {
  const loaded = {};

  for (const [type, filePath] of Object.entries(contract.sourceTypes)) {
    const text = await fs.readFile(resolveConfigDataSourcePath(filePath), 'utf8');
    const root = JSON.parse(text);
    if (!Array.isArray(root)) throw new Error(`${type}: ${filePath} must be a root array`);

    const byId = new Map();
    for (let recordIndex = 0; recordIndex < root.length; recordIndex += 1) {
      const record = root[recordIndex];
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error(`${type}: non-object source record at ${recordIndex}`);
      }
      const id = normalizePositiveIntegerId(record.ID, `${type}[${recordIndex}].ID`, false);
      if (byId.has(id)) throw new Error(`${type}: duplicate ID ${id}`);
      byId.set(id, { record, recordIndex });
    }

    loaded[type] = {
      type,
      path: filePath,
      text,
      sha256: sha256Utf8(text),
      records: root,
      byId,
      recordCount: root.length,
    };
  }

  return loaded;
}

function extractRelationEdges(relation, loaded) {
  const source = loaded[relation.sourceType];
  const target = loaded[relation.targetType];
  if (!source) throw new Error(`${relation.name}: unknown sourceType ${relation.sourceType}`);
  if (!target) throw new Error(`${relation.name}: unknown targetType ${relation.targetType}`);

  const edges = [];
  const seen = new Set();
  let duplicateRawReferenceCount = 0;
  let omittedEmptyReferenceCount = 0;
  let sourceRecordsWithField = 0;
  let sourceRecordsWithEdges = 0;

  function addReference(sourceId, rawTarget, context) {
    const targetId = normalizePositiveIntegerId(rawTarget, context, true);
    if (targetId === null) {
      omittedEmptyReferenceCount += 1;
      return false;
    }
    if (!target.byId.has(targetId)) {
      throw new Error(`${relation.name}: ${sourceId} -> missing ${relation.targetType} ${targetId}`);
    }
    const edgeKey = `${sourceId}\u0000${targetId}`;
    if (seen.has(edgeKey)) {
      duplicateRawReferenceCount += 1;
      return false;
    }
    seen.add(edgeKey);
    edges.push([sourceId, targetId]);
    return true;
  }

  for (let recordIndex = 0; recordIndex < source.records.length; recordIndex += 1) {
    const record = source.records[recordIndex];
    const sourceId = normalizePositiveIntegerId(record.ID, `${relation.sourceType}[${recordIndex}].ID`, false);
    if (!Object.hasOwn(record, relation.sourceField)) continue;
    sourceRecordsWithField += 1;

    const rawValue = record[relation.sourceField];
    let emittedForRecord = false;

    if (relation.cardinality === 'ONE') {
      if (Array.isArray(rawValue)) {
        throw new Error(`${relation.name}: ${relation.sourceField} must be scalar for source ${sourceId}`);
      }
      emittedForRecord = addReference(sourceId, rawValue, `${relation.name} source ${sourceId}`) || emittedForRecord;
    } else if (relation.cardinality === 'MANY') {
      if (rawValue === undefined || rawValue === null) continue;
      if (!Array.isArray(rawValue)) {
        throw new Error(`${relation.name}: ${relation.sourceField} must be an array for source ${sourceId}`);
      }
      for (let i = 0; i < rawValue.length; i += 1) {
        emittedForRecord = addReference(sourceId, rawValue[i], `${relation.name} source ${sourceId}[${i}]`) || emittedForRecord;
      }
    } else {
      throw new Error(`${relation.name}: unsupported cardinality ${relation.cardinality}`);
    }

    if (emittedForRecord) sourceRecordsWithEdges += 1;
  }

  edges.sort(compareEdges);

  return {
    name: relation.name,
    sourceType: relation.sourceType,
    sourceField: relation.sourceField,
    cardinality: relation.cardinality,
    targetType: relation.targetType,
    semanticStatus: relation.semanticStatus,
    ...(relation.note ? { note: relation.note } : {}),
    sourceRecordsWithField,
    sourceRecordsWithEdges,
    edgeCount: edges.length,
    duplicateRawReferenceCount,
    omittedEmptyReferenceCount,
    edges,
  };
}

export function buildDomainIndex(domain, contract, loaded) {
  const relationSpecs = contract.relations.filter((relation) => relation.domain === domain);
  if (relationSpecs.length === 0) throw new Error(`${domain}: no Stage 2 relations declared`);

  const sourceTypeNames = [];
  const sourceTypeSeen = new Set();
  for (const relation of relationSpecs) {
    for (const type of [relation.sourceType, relation.targetType]) {
      if (!sourceTypeSeen.has(type)) {
        sourceTypeSeen.add(type);
        sourceTypeNames.push(type);
      }
    }
  }

  const sources = {};
  for (const type of sourceTypeNames) {
    const source = loaded[type];
    sources[type] = {
      path: source.path,
      sha256: source.sha256,
      recordCount: source.recordCount,
    };
  }

  const relations = relationSpecs.map((relation) => extractRelationEdges(relation, loaded));
  const totalEdgeCount = relations.reduce((sum, relation) => sum + relation.edgeCount, 0);
  const totalDuplicateRawReferenceCount = relations.reduce((sum, relation) => sum + relation.duplicateRawReferenceCount, 0);
  const totalOmittedEmptyReferenceCount = relations.reduce((sum, relation) => sum + relation.omittedEmptyReferenceCount, 0);

  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_2',
    status: 'FORWARD_JOIN_INDEX_MATERIALIZED',
    domain,
    contract: STAGE2_CONTRACT_PATH,
    sources,
    relationCount: relations.length,
    totalEdgeCount,
    totalDuplicateRawReferenceCount,
    totalOmittedEmptyReferenceCount,
    relations,
  };
}

export function buildSummary(contract, domainIndexes) {
  const domains = {};
  let relationCount = 0;
  let totalEdgeCount = 0;
  let totalDuplicateRawReferenceCount = 0;
  let totalOmittedEmptyReferenceCount = 0;

  for (const [domain, index] of Object.entries(domainIndexes)) {
    domains[domain] = {
      output: contract.outputs[domain],
      relationCount: index.relationCount,
      totalEdgeCount: index.totalEdgeCount,
      totalDuplicateRawReferenceCount: index.totalDuplicateRawReferenceCount,
      totalOmittedEmptyReferenceCount: index.totalOmittedEmptyReferenceCount,
      relations: Object.fromEntries(index.relations.map((relation) => [relation.name, {
        edgeCount: relation.edgeCount,
        sourceRecordsWithField: relation.sourceRecordsWithField,
        sourceRecordsWithEdges: relation.sourceRecordsWithEdges,
        duplicateRawReferenceCount: relation.duplicateRawReferenceCount,
        omittedEmptyReferenceCount: relation.omittedEmptyReferenceCount,
        semanticStatus: relation.semanticStatus,
      }])),
    };
    relationCount += index.relationCount;
    totalEdgeCount += index.totalEdgeCount;
    totalDuplicateRawReferenceCount += index.totalDuplicateRawReferenceCount;
    totalOmittedEmptyReferenceCount += index.totalOmittedEmptyReferenceCount;
  }

  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_2',
    status: 'PASS_CONFIGDATA_LOOKUP_STAGE2_FORWARD_JOINS',
    contract: STAGE2_CONTRACT_PATH,
    domainCount: Object.keys(domains).length,
    relationCount,
    totalEdgeCount,
    totalDuplicateRawReferenceCount,
    totalOmittedEmptyReferenceCount,
    domains,
    semanticBoundary: {
      directAllowlistedReferencesOnly: true,
      inverseRelationsGenerated: false,
      transitiveRelationsGenerated: false,
      canonicalRelationsRecomputed: false,
      nameJoinUsed: false,
      idArithmeticUsed: false,
      soldierGrowthPathSelected: false,
      equipmentMaxSkillSelected: false,
    },
  };
}

export function renderForwardIndex(value) {
  const pretty = JSON.stringify(value, null, 2);
  return `${pretty.replace(/\[\n\s+"(\d+)",\n\s+"(\d+)"\n\s+\]/g, '["$1","$2"]')}\n`;
}

export function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
}
