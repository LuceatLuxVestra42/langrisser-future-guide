import {
  CONTRACT_VERSION,
  canonicalizeContractDocument,
  collectContractErrors,
  stableJson,
} from '../core/contract-v1.mjs';
import { resolveRecordEvidence } from '../core/engine-v1.mjs';

const DOMAIN = 'soldier-training-material';
const KEY_KIND = 'itemId';
const ASSET_ROLE = 'trainingMaterialIcon';
const LOCATOR_KIND = 'FULL_PATH';
const ICON_ROOT = 'UI/Icon/Item_ABS/';

function assertFrozenInput(document) {
  const errors = collectContractErrors(document);
  if (errors.length) throw new Error(`invalid Asset Intake input: ${errors.join('; ')}`);
  if (document.contractVersion !== CONTRACT_VERSION) throw new Error(`unsupported contractVersion: ${document.contractVersion}`);
  if (document.domain !== DOMAIN) throw new Error(`Soldier training-material adapter requires domain=${DOMAIN}`);

  for (const record of document.records) {
    if (record.canonicalKey.kind !== KEY_KIND) throw new Error(`canonicalKey.kind must be ${KEY_KIND}`);
    if (record.domainNativeStatus !== 'READY_FOR_ASSET_EVIDENCE') throw new Error(`unexpected domainNativeStatus for item ${record.canonicalKey.value}`);
    if (record.normalizedResolutionClass !== 'PENDING') throw new Error(`input must be PENDING for item ${record.canonicalKey.value}`);
    if (record.evidence.length !== 0) throw new Error(`input evidence must be empty for item ${record.canonicalKey.value}`);
    if (Object.hasOwn(record, 'target')) throw new Error(`target must not be inferred for item ${record.canonicalKey.value}`);
    if (record.expectedLocators.length !== 1) throw new Error(`exactly one locator required for item ${record.canonicalKey.value}`);
    const locator = record.expectedLocators[0];
    if (locator.assetRole !== ASSET_ROLE) throw new Error(`assetRole must be ${ASSET_ROLE}`);
    if (locator.locatorKind !== LOCATOR_KIND) throw new Error(`locatorKind must be ${LOCATOR_KIND}`);
    if (typeof locator.value !== 'string' || !locator.value.startsWith(ICON_ROOT) || !/^UI\/Icon\/Item_ABS\/Training_[A-Za-z0-9]+\.png$/.test(locator.value)) {
      throw new Error(`invalid frozen Training icon locator for item ${record.canonicalKey.value}: ${locator.value}`);
    }
  }
}

export function adaptSoldierTrainingMaterialContractDocument(inputDocument, inventory, { sourceContext = null } = {}) {
  assertFrozenInput(inputDocument);
  if (!Array.isArray(inventory)) throw new Error('inventory must be an array');

  const canonicalInput = canonicalizeContractDocument(inputDocument);
  const diagnostics = [];
  const records = canonicalInput.records.map((record) => {
    const result = resolveRecordEvidence(record, inventory)[0];
    diagnostics.push({
      canonicalKey: { ...record.canonicalKey },
      normalizedResolutionClass: result.status,
      locatorResult: {
        assetRole: result.locator.assetRole,
        locatorKind: result.locator.locatorKind,
        value: result.locator.value,
        status: result.status,
        reason: result.reason,
        matchCount: result.matches.length,
        matchedRelativePaths: result.matches.map((match) => match.relativePath),
      },
    });
    return {
      ...record,
      normalizedResolutionClass: result.status,
      evidence: result.status === 'RESOLVED' ? result.evidence : [],
    };
  });

  const document = canonicalizeContractDocument({
    ...canonicalInput,
    ...(sourceContext ? { sourceContext } : {}),
    records,
  });
  const outputErrors = collectContractErrors(document);
  if (outputErrors.length) throw new Error(`Soldier training-material adapter produced invalid contract: ${outputErrors.join('; ')}`);

  diagnostics.sort((a, b) => a.canonicalKey.value - b.canonicalKey.value);
  const count = (status) => diagnostics.filter((record) => record.normalizedResolutionClass === status).length;
  return {
    document,
    diagnostics: {
      stage: 'Soldier Training Material Assets A1 Adapter',
      status: 'SOLDIER_TRAINING_MATERIAL_ADAPTER_EXECUTED',
      contractVersion: CONTRACT_VERSION,
      recordCounts: {
        total: diagnostics.length,
        resolved: count('RESOLVED'),
        pending: count('PENDING'),
        ambiguous: count('AMBIGUOUS'),
      },
      evidenceCount: document.records.reduce((sum, record) => sum + record.evidence.length, 0),
      records: diagnostics,
    },
  };
}

export function stableSoldierTrainingMaterialAdapterJson(document) {
  return stableJson(document);
}
