import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT_VERSION,
  LOCATOR_KINDS,
  NORMALIZED_RESOLUTION_CLASSES,
  collectContractErrors,
  stableJson,
} from '../core/contract-v1.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const toolRoot = path.resolve(here, '..');
const schemaPath = path.join(toolRoot, 'contract', 'asset-intake-contract.v1.schema.json');
const fixturePath = path.join(toolRoot, 'fixtures', 'skin-stage1-contract-fixtures.v1.json');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const checks = [];
const hardErrors = [];

function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  if (!pass) hardErrors.push(`${name}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
}

check('schema contractVersion parity', schema.properties?.contractVersion?.const === CONTRACT_VERSION, {
  expected: CONTRACT_VERSION,
  actual: schema.properties?.contractVersion?.const ?? null,
});
check(
  'schema normalizedResolutionClass enum parity',
  JSON.stringify(schema.$defs?.record?.properties?.normalizedResolutionClass?.enum) === JSON.stringify(NORMALIZED_RESOLUTION_CLASSES),
  schema.$defs?.record?.properties?.normalizedResolutionClass?.enum ?? null,
);
check(
  'schema locatorKind enum parity',
  JSON.stringify(schema.$defs?.expectedLocator?.properties?.locatorKind?.enum) === JSON.stringify(LOCATOR_KINDS),
  schema.$defs?.expectedLocator?.properties?.locatorKind?.enum ?? null,
);

const contractErrors = collectContractErrors(fixture);
check('fixture shared-contract validation', contractErrors.length === 0, contractErrors);
check('fixture domain skin', fixture.domain === 'skin', fixture.domain);
check('fixture source readiness status', fixture.sourceContext?.status === 'READY_FOR_ASSET_EVIDENCE', fixture.sourceContext?.status ?? null);
check('fixture record count 3', fixture.records.length === 3, fixture.records.length);

const expected = new Map([
  [102, {
    staticArtwork: ['STATIC_PATH', 'UI/Icon/HeroSkin_ABS/Skin/Skin_Matthew_01.png'],
    spinePrefab: ['SPINE_PATH', 'Spine/Char/Mathew_ABS/Mathew_Skin01_Prefab.prefab'],
    modelResource: ['RESOURCE_ID', 102, 1021, 1022, 1023, 1024],
  }],
  [1901, {
    staticArtwork: ['STATIC_PATH', 'UI/Icon/HeroSkin2_ABS/Skin/Skin_Lista_Skin01.png'],
    spinePrefab: ['SPINE_PATH', 'Spine/Char/Lista_ABS/Lista_Skin01_Prefab.prefab'],
    modelResource: ['RESOURCE_ID', 1901],
  }],
  [3701, {
    staticArtwork: ['STATIC_PATH', 'UI/Icon/HeroSkin_ABS/Skin/Skin_Zigodlla_01.png'],
    spinePrefab: ['SPINE_PATH', 'Spine/Char/Zigodlla_ABS/Zigodlla_Skin01_Prefab.prefab'],
    modelResource: ['RESOURCE_ID', 3701],
  }],
]);

for (const record of fixture.records) {
  const skinId = record.canonicalKey.value;
  const expectedRecord = expected.get(skinId);
  check(`fixture ${skinId} expected`, Boolean(expectedRecord), skinId);
  check(`fixture ${skinId} key kind`, record.canonicalKey.kind === 'skinId', record.canonicalKey.kind);
  check(`fixture ${skinId} domain status preserved`, record.domainNativeStatus === 'READY_FOR_ASSET_EVIDENCE', record.domainNativeStatus);
  check(`fixture ${skinId} normalized pending`, record.normalizedResolutionClass === 'PENDING', record.normalizedResolutionClass);
  check(`fixture ${skinId} evidence empty`, record.evidence.length === 0, record.evidence.length);
  check(`fixture ${skinId} target not inferred`, !Object.hasOwn(record, 'target'), Object.hasOwn(record, 'target'));
  if (!expectedRecord) continue;

  const staticLocator = record.expectedLocators.find((item) => item.assetRole === 'staticArtwork');
  const spineLocator = record.expectedLocators.find((item) => item.assetRole === 'spinePrefab');
  const resourceLocators = record.expectedLocators.filter((item) => item.assetRole === 'modelResource').map((item) => item.value).sort((a, b) => a - b);
  check(`fixture ${skinId} static locator parity`, staticLocator?.locatorKind === expectedRecord.staticArtwork[0] && staticLocator?.value === expectedRecord.staticArtwork[1], staticLocator ?? null);
  check(`fixture ${skinId} Spine locator parity`, spineLocator?.locatorKind === expectedRecord.spinePrefab[0] && spineLocator?.value === expectedRecord.spinePrefab[1], spineLocator ?? null);
  check(
    `fixture ${skinId} model resource parity`,
    record.expectedLocators.filter((item) => item.assetRole === 'modelResource').every((item) => item.locatorKind === expectedRecord.modelResource[0]) && JSON.stringify(resourceLocators) === JSON.stringify(expectedRecord.modelResource.slice(1)),
    resourceLocators,
  );
}

const permuted = {
  ...fixture,
  records: [...fixture.records].reverse().map((record) => ({
    ...record,
    expectedLocators: [...record.expectedLocators].reverse(),
    evidence: [...record.evidence].reverse(),
  })),
};
check('deterministic canonical serialization', stableJson(fixture) === stableJson(permuted), 'stable across record/locator enumeration order');

const resolvedWithoutEvidence = structuredClone(fixture);
resolvedWithoutEvidence.records[0].normalizedResolutionClass = 'RESOLVED';
check('guard rejects RESOLVED without evidence', collectContractErrors(resolvedWithoutEvidence).some((error) => error.includes('must be non-empty when RESOLVED')), collectContractErrors(resolvedWithoutEvidence));

const semanticLeak = structuredClone(fixture);
semanticLeak.records[0].heroId = 1;
check('guard rejects domain semantic field leak', collectContractErrors(semanticLeak).some((error) => error.includes('heroId')), collectContractErrors(semanticLeak));

const duplicateCanonicalKey = structuredClone(fixture);
duplicateCanonicalKey.records[1].canonicalKey = { ...duplicateCanonicalKey.records[0].canonicalKey };
check('guard rejects duplicate canonical key', collectContractErrors(duplicateCanonicalKey).some((error) => error.includes('duplicates skinId:102')), collectContractErrors(duplicateCanonicalKey));

const unknownField = structuredClone(fixture);
unknownField.records[0].guessedOwner = 1;
check('guard rejects unknown contract field', collectContractErrors(unknownField).some((error) => error.includes('guessedOwner is not part of Asset Intake contract v1')), collectContractErrors(unknownField));

const summary = {
  stage: 'Asset Intake Stage 1',
  status: hardErrors.length === 0 ? 'PASS_ASSET_INTAKE_STAGE1' : 'FAIL_ASSET_INTAKE_STAGE1',
  completion: hardErrors.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
  freezeState: hardErrors.length === 0 ? 'ASSET_INTAKE_STAGE1_CONTRACT_FROZEN' : 'UNFROZEN',
  contractVersion: CONTRACT_VERSION,
  implementationScope: {
    sharedContractSchema: true,
    deterministicCore: true,
    representativeFixtureValidator: true,
    assetByteScanImplemented: false,
    domainAdapterImplemented: false,
    frontendChanged: false,
    buildHookInstalled: false
  },
  normalizedResolutionClasses: NORMALIZED_RESOLUTION_CLASSES,
  locatorKinds: LOCATOR_KINDS,
  fixture: {
    domain: fixture.domain,
    sourceStatus: fixture.sourceContext?.status ?? null,
    skinIds: fixture.records.map((record) => record.canonicalKey.value).sort((a, b) => a - b),
    records: fixture.records.length,
    evidenceRecords: fixture.records.reduce((sum, record) => sum + record.evidence.length, 0)
  },
  counts: {
    checks: checks.length,
    passed: checks.filter((item) => item.pass).length,
    failed: checks.filter((item) => !item.pass).length,
    hardErrors: hardErrors.length
  },
  guardTests: [
    'RESOLVED_REQUIRES_EVIDENCE',
    'DOMAIN_SEMANTIC_FIELD_REJECTED',
    'DUPLICATE_CANONICAL_KEY_REJECTED',
    'UNKNOWN_CONTRACT_FIELD_REJECTED'
  ],
  hardErrors,
  reviews: [],
  nextStage: 'STAGE2_SKIN_REPRESENTATIVE_ASSET_EVIDENCE'
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (hardErrors.length > 0) process.exitCode = 1;
