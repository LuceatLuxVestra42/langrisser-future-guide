import {
  CONTRACT_VERSION,
  canonicalizeContractDocument,
  collectContractErrors,
  stableJson,
} from '../core/contract-v1.mjs';
import { resolveRecordEvidence } from '../core/engine-v1.mjs';

const keyText = (record) => `${record.canonicalKey.kind}:${String(record.canonicalKey.value)}`;

function assertFrozenSkinInput(document) {
  const errors = collectContractErrors(document);
  if (errors.length) throw new Error(`invalid Asset Intake input: ${errors.join('; ')}`);
  if (document.contractVersion !== CONTRACT_VERSION) throw new Error(`unsupported contractVersion: ${document.contractVersion}`);
  if (document.domain !== 'skin') throw new Error(`skin adapter requires domain=skin, got ${document.domain}`);
  for (const record of document.records) {
    if (record.canonicalKey.kind !== 'skinId') throw new Error(`skin adapter requires canonicalKey.kind=skinId, got ${record.canonicalKey.kind}`);
  }
}

export function buildSkinModelResourceMap(entries) {
  if (!Array.isArray(entries)) throw new Error('model resource entries must be an array');
  const map = {};
  for (const [index, entry] of entries.entries()) {
    if (!entry || !Number.isInteger(entry.skinResourceId)) throw new Error(`model resource entry ${index} has invalid skinResourceId`);
    if (typeof entry.prefabPath !== 'string' || !entry.prefabPath) throw new Error(`model resource entry ${index} has invalid prefabPath`);
    if (entry.assetEntryStatus != null && entry.assetEntryStatus !== 'CONFIRMED') {
      throw new Error(`model resource ${entry.skinResourceId} is not CONFIRMED`);
    }
    const key = String(entry.skinResourceId);
    if (Object.hasOwn(map, key) && map[key] !== entry.prefabPath) {
      throw new Error(`model resource ${entry.skinResourceId} maps to conflicting prefab paths`);
    }
    map[key] = entry.prefabPath;
  }
  return map;
}

function summarizeLocatorResult(result) {
  return {
    expectedLocatorIndex: result.expectedLocatorIndex,
    assetRole: result.locator.assetRole,
    locatorKind: result.locator.locatorKind,
    value: result.locator.value,
    status: result.status,
    reason: result.reason,
    matchCount: result.matches.length,
    matchedRelativePaths: result.matches.map((match) => match.relativePath),
  };
}

function normalizedClassFor(results) {
  if (results.every((result) => result.status === 'RESOLVED')) return 'RESOLVED';
  if (results.some((result) => result.status === 'AMBIGUOUS')) return 'AMBIGUOUS';
  return 'PENDING';
}

export function adaptSkinContractDocument(inputDocument, inventory, { resourceMap = null, sourceContext = null } = {}) {
  assertFrozenSkinInput(inputDocument);
  if (!Array.isArray(inventory)) throw new Error('inventory must be an array');

  // Canonicalize before resolution so evidence expectedLocatorIndex values refer to
  // the exact locator ordering that will be serialized by contract-v1 stableJson.
  const canonicalInput = canonicalizeContractDocument(inputDocument);
  const diagnostics = [];
  const records = canonicalInput.records.map((record) => {
    const results = resolveRecordEvidence(record, inventory, { resourceMap });
    const normalizedResolutionClass = normalizedClassFor(results);
    const allResolved = normalizedResolutionClass === 'RESOLVED';
    const evidence = allResolved ? results.flatMap((result) => result.evidence) : [];

    diagnostics.push({
      canonicalKey: { ...record.canonicalKey },
      normalizedResolutionClass,
      locatorResults: results.map(summarizeLocatorResult),
    });

    return {
      ...record,
      normalizedResolutionClass,
      evidence,
    };
  });

  const document = canonicalizeContractDocument({
    ...canonicalInput,
    ...(sourceContext ? { sourceContext } : {}),
    records,
  });
  const outputErrors = collectContractErrors(document);
  if (outputErrors.length) throw new Error(`skin adapter produced invalid contract: ${outputErrors.join('; ')}`);

  diagnostics.sort((a, b) => keyText(a).localeCompare(keyText(b), 'en'));
  const locatorResults = diagnostics.flatMap((record) => record.locatorResults);
  const count = (status) => locatorResults.filter((result) => result.status === status).length;
  const recordCount = (status) => diagnostics.filter((record) => record.normalizedResolutionClass === status).length;

  return {
    document,
    diagnostics: {
      stage: 'Asset Intake Stage 3 - Skin Adapter',
      status: 'SKIN_ADAPTER_EXECUTED',
      contractVersion: CONTRACT_VERSION,
      recordCounts: {
        total: diagnostics.length,
        resolved: recordCount('RESOLVED'),
        pending: recordCount('PENDING'),
        ambiguous: recordCount('AMBIGUOUS'),
      },
      locatorCounts: {
        total: locatorResults.length,
        resolved: count('RESOLVED'),
        pending: count('PENDING'),
        ambiguous: count('AMBIGUOUS'),
      },
      evidenceCount: document.records.reduce((sum, record) => sum + record.evidence.length, 0),
      records: diagnostics,
    },
  };
}

export function stableSkinAdapterJson(document) {
  return stableJson(document);
}
