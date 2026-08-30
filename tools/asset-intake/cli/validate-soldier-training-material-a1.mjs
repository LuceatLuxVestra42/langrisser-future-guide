import fs from 'node:fs';
import { collectContractErrors, stableJson } from '../core/contract-v1.mjs';
import { adaptSoldierTrainingMaterialContractDocument } from '../adapters/soldier-training-material-v1.mjs';

const SOURCE_PATH = 'data/generated/soldier-training-material-iteminfo.v1.json';
const CONTRACT_PATH = 'data/contracts/soldier-training-material-asset-intake.v1.json';
const SUMMARY_PATH = 'data/validation/soldier-training-material-assets-a1.v1.json';

const source = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
const checks = [];
const failures = [];
const check = (name, pass, detail = null) => {
  checks.push({ name, pass, detail });
  if (!pass) failures.push(`${name}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
};

check('source PASS', source.status === 'PASS', source.status);
check('source schema', source.schemaId === 'soldier-training-material-iteminfo/v1', source.schemaId);
check('source item count 24', source.items.length === 24, source.items.length);
check('contract shared validation', collectContractErrors(contract).length === 0, collectContractErrors(contract));
check('contract domain', contract.domain === 'soldier-training-material', contract.domain);
check('contract record count 24', contract.records.length === 24, contract.records.length);

const sourceById = new Map(source.items.map((item) => [item.itemId, item]));
for (const record of contract.records) {
  const itemId = record.canonicalKey.value;
  const item = sourceById.get(itemId);
  const locator = record.expectedLocators[0];
  check(`item ${itemId} source exists`, Boolean(item), itemId);
  check(`item ${itemId} key kind`, record.canonicalKey.kind === 'itemId', record.canonicalKey.kind);
  check(`item ${itemId} exact locator count`, record.expectedLocators.length === 1, record.expectedLocators.length);
  check(`item ${itemId} locator role`, locator?.assetRole === 'trainingMaterialIcon', locator?.assetRole ?? null);
  check(`item ${itemId} locator kind`, locator?.locatorKind === 'FULL_PATH', locator?.locatorKind ?? null);
  check(`item ${itemId} locator parity`, locator?.value === item?.iconPath, { locator: locator?.value ?? null, source: item?.iconPath ?? null });
  check(`item ${itemId} pending`, record.normalizedResolutionClass === 'PENDING', record.normalizedResolutionClass);
  check(`item ${itemId} evidence empty`, record.evidence.length === 0, record.evidence.length);
  check(`item ${itemId} target absent`, !Object.hasOwn(record, 'target'), Object.hasOwn(record, 'target'));
}

const permuted = {
  ...contract,
  records: [...contract.records].reverse().map((record) => ({
    ...record,
    expectedLocators: [...record.expectedLocators].reverse(),
    evidence: [...record.evidence].reverse(),
  })),
};
check('deterministic serialization', stableJson(contract) === stableJson(permuted), 'record enumeration order independent');

const emptyResult = adaptSoldierTrainingMaterialContractDocument(contract, []);
check('adapter empty inventory total 24', emptyResult.diagnostics.recordCounts.total === 24, emptyResult.diagnostics.recordCounts);
check('adapter empty inventory pending 24', emptyResult.diagnostics.recordCounts.pending === 24, emptyResult.diagnostics.recordCounts);
check('adapter empty inventory resolved 0', emptyResult.diagnostics.recordCounts.resolved === 0, emptyResult.diagnostics.recordCounts);
check('adapter empty inventory evidence 0', emptyResult.diagnostics.evidenceCount === 0, emptyResult.diagnostics.evidenceCount);
check('adapter exact no-match reasons', emptyResult.diagnostics.records.every((record) => record.locatorResult.reason === 'NO_EXACT_MATCH'), emptyResult.diagnostics.records.map((record) => record.locatorResult.reason));

const invalid = structuredClone(contract);
invalid.records[0].expectedLocators[0].locatorKind = 'EXACT_FILENAME';
let invalidRejected = false;
try {
  adaptSoldierTrainingMaterialContractDocument(invalid, []);
} catch {
  invalidRejected = true;
}
check('adapter rejects non-FULL_PATH input', invalidRejected, invalidRejected);

check('summary PASS', summary.status === 'PASS' && summary.completion === 'COMPLETE', { status: summary.status, completion: summary.completion });
check('summary canonical 24', summary.counts?.canonicalRecords === 24 && summary.counts?.uniqueItemIds === 24, summary.counts);
check('summary locator 24', summary.counts?.fullPathLocators === 24, summary.counts?.fullPathLocators);
check('summary pending 24', summary.counts?.pendingRecords === 24, summary.counts?.pendingRecords);
check('summary evidence 0', summary.counts?.evidenceRecords === 0, summary.counts?.evidenceRecords);
check('summary no semantic recompute', summary.boundaries?.semanticRecomputed === false, summary.boundaries);

const result = {
  stage: 'Soldier Training Material Assets A1',
  status: failures.length === 0 ? 'PASS_SOLDIER_TRAINING_MATERIAL_ASSETS_A1' : 'FAIL_SOLDIER_TRAINING_MATERIAL_ASSETS_A1',
  completion: failures.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
  counts: {
    checks: checks.length,
    passed: checks.filter((item) => item.pass).length,
    failed: failures.length,
    sourceItems: source.items.length,
    contractRecords: contract.records.length,
    adapterPendingWithEmptyInventory: emptyResult.diagnostics.recordCounts.pending,
  },
  failures,
  nextStartPoint: 'A2 exact source census for the frozen 24 training-material icon locators',
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
