export const CONTRACT_VERSION = 'asset-intake/v1';
export const NORMALIZED_RESOLUTION_CLASSES = Object.freeze(['RESOLVED', 'PENDING', 'AMBIGUOUS', 'REJECTED', 'INVALID']);
export const LOCATOR_KINDS = Object.freeze(['FULL_PATH', 'EXACT_FILENAME', 'RESOURCE_ID', 'STATIC_PATH', 'SPINE_PATH']);
export const DOMAIN_SEMANTIC_FIELDS = Object.freeze([
  'heroId', 'soldierId', 'equipmentId', 'bannerId', 'ownerId', 'sourceOrder',
  'name', 'nameKr', 'nameCn', 'relation', 'relations', 'canonicalIdentity',
]);

const allowedRecordKeys = new Set(['canonicalKey', 'domainNativeStatus', 'normalizedResolutionClass', 'expectedLocators', 'target', 'evidence']);
const keyText = (x) => `${x.kind}:${String(x.value)}`;
const locatorText = (x) => `${x.assetRole}\0${x.locatorKind}\0${String(x.value)}\0${x.approvedRoot ?? ''}`;
const evidenceText = (x) => `${String(x.expectedLocatorIndex).padStart(8, '0')}\0${x.sourcePath}\0${x.sha256}`;
const valueOk = (x) => (typeof x === 'string' && x.length > 0) || Number.isInteger(x);

export function canonicalizeContractDocument(document) {
  return {
    ...document,
    records: [...document.records]
      .map((record) => ({
        ...record,
        expectedLocators: [...record.expectedLocators].sort((a, b) => locatorText(a).localeCompare(locatorText(b), 'en')),
        evidence: [...record.evidence].sort((a, b) => evidenceText(a).localeCompare(evidenceText(b), 'en')),
      }))
      .sort((a, b) => keyText(a.canonicalKey).localeCompare(keyText(b.canonicalKey), 'en')),
  };
}

export const stableJson = (document) => `${JSON.stringify(canonicalizeContractDocument(document), null, 2)}\n`;

export function collectContractErrors(document) {
  const errors = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) return ['document must be an object'];
  if (document.contractVersion !== CONTRACT_VERSION) errors.push(`contractVersion must be ${CONTRACT_VERSION}`);
  if (typeof document.domain !== 'string' || !document.domain) errors.push('domain must be a non-empty string');
  if (!Array.isArray(document.records)) return [...errors, 'records must be an array'];

  const seenKeys = new Set();
  document.records.forEach((record, index) => {
    const p = `records[${index}]`;
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push(`${p} must be an object`);
      return;
    }
    Object.keys(record).forEach((key) => {
      if (!allowedRecordKeys.has(key)) errors.push(`${p}.${key} is not part of Asset Intake contract v1`);
    });
    DOMAIN_SEMANTIC_FIELDS.forEach((key) => {
      if (Object.hasOwn(record, key) && !errors.includes(`${p}.${key} is not part of Asset Intake contract v1`)) {
        errors.push(`${p}.${key} is a domain semantic field and cannot be shared-contract state`);
      }
    });

    const key = record.canonicalKey;
    if (!key || typeof key.kind !== 'string' || !key.kind || !valueOk(key.value)) {
      errors.push(`${p}.canonicalKey is invalid`);
    } else {
      const text = keyText(key);
      if (seenKeys.has(text)) errors.push(`${p}.canonicalKey duplicates ${text}`);
      seenKeys.add(text);
    }
    if (typeof record.domainNativeStatus !== 'string' || !record.domainNativeStatus) errors.push(`${p}.domainNativeStatus is invalid`);
    if (!NORMALIZED_RESOLUTION_CLASSES.includes(record.normalizedResolutionClass)) errors.push(`${p}.normalizedResolutionClass is invalid`);

    if (!Array.isArray(record.expectedLocators) || record.expectedLocators.length === 0) {
      errors.push(`${p}.expectedLocators must contain at least one locator`);
    } else {
      const seenLocators = new Set();
      record.expectedLocators.forEach((locator, locatorIndex) => {
        const lp = `${p}.expectedLocators[${locatorIndex}]`;
        if (!locator || typeof locator.assetRole !== 'string' || !locator.assetRole || !LOCATOR_KINDS.includes(locator.locatorKind) || !valueOk(locator.value)) {
          errors.push(`${lp} is invalid`);
          return;
        }
        const text = locatorText(locator);
        if (seenLocators.has(text)) errors.push(`${lp} duplicates an expected locator`);
        seenLocators.add(text);
      });
    }

    if (!Array.isArray(record.evidence)) {
      errors.push(`${p}.evidence must be an array`);
      return;
    }
    if (record.normalizedResolutionClass === 'RESOLVED' && record.evidence.length === 0) errors.push(`${p}.evidence must be non-empty when RESOLVED`);
    if (record.normalizedResolutionClass === 'PENDING' && record.evidence.length !== 0) errors.push(`${p}.evidence must be empty when PENDING`);
    record.evidence.forEach((evidence, evidenceIndex) => {
      const ep = `${p}.evidence[${evidenceIndex}]`;
      if (!Number.isInteger(evidence.expectedLocatorIndex) || evidence.expectedLocatorIndex < 0 || evidence.expectedLocatorIndex >= record.expectedLocators.length) errors.push(`${ep}.expectedLocatorIndex is invalid`);
      if (!Number.isInteger(evidence.byteSize) || evidence.byteSize < 0) errors.push(`${ep}.byteSize is invalid`);
      if (!/^[0-9a-f]{64}$/.test(evidence.sha256 ?? '')) errors.push(`${ep}.sha256 is invalid`);
      ['sourcePath', 'relativePath', 'basename', 'extension', 'signature'].forEach((field) => {
        if (typeof evidence[field] !== 'string' || !evidence[field]) errors.push(`${ep}.${field} is invalid`);
      });
    });
  });
  return errors;
}
