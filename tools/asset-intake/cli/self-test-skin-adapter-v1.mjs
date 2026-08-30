import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  adaptSkinContractDocument,
  buildSkinModelResourceMap,
  stableSkinAdapterJson,
} from '../adapters/skin-v1.mjs';
import { collectContractErrors } from '../core/contract-v1.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const fixturePath = path.join(repoRoot, 'tools/asset-intake/fixtures/skin-stage1-contract-fixtures.v1.json');
const legacyEvidencePath = path.join(repoRoot, 'data/evidence/skin-stage3-2-static-source-evidence.v1.json');

const frozen = JSON.parse(await readFile(fixturePath, 'utf8'));
const legacyStatic = JSON.parse(await readFile(legacyEvidencePath, 'utf8'));
const checks = [];
const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });

function inventoryRecord(relativePath, sourceArtifact = 'SELF_TEST_AUTHORITATIVE_ROOT') {
  const basename = path.posix.basename(relativePath);
  return {
    sourceArtifact,
    sourcePath: relativePath,
    relativePath,
    basename,
    extension: path.posix.extname(basename).toLowerCase() || '<none>',
    byteSize: Buffer.byteLength(relativePath),
    signature: 'SELF_TEST',
    width: null,
    height: null,
    sha256: createHash('sha256').update(relativePath).digest('hex'),
    exactDuplicateGroup: null,
    basenameCollisionGroup: null,
  };
}

const modelEntries = [102, 1021, 1022, 1023, 1024, 1901, 3701].map((skinResourceId) => ({
  skinResourceId,
  prefabPath: `Spine/General/SelfTest/${skinResourceId}.prefab`,
  assetEntryStatus: 'CONFIRMED',
}));
const resourceMap = buildSkinModelResourceMap(modelEntries);
const pathLocators = frozen.records.flatMap((record) => record.expectedLocators)
  .filter((locator) => locator.locatorKind !== 'RESOURCE_ID')
  .map((locator) => locator.value);
const authoritativeInventory = [
  ...pathLocators.map((value) => inventoryRecord(value)),
  ...Object.values(resourceMap).map((value) => inventoryRecord(value)),
];

const positive = adaptSkinContractDocument(frozen, authoritativeInventory, { resourceMap });
check('positive records all resolved', positive.diagnostics.recordCounts.resolved === 3);
check('positive locators all resolved', positive.diagnostics.locatorCounts.resolved === 13);
check('positive evidence covers all locators', positive.diagnostics.evidenceCount === 13);
check('positive contract validates', collectContractErrors(positive.document).length === 0);
check('canonical keys preserved', positive.document.records.map((r) => r.canonicalKey.value).join(',') === '102,1901,3701');
check('no semantic fields leaked', positive.document.records.every((r) => !Object.hasOwn(r, 'heroId') && !Object.hasOwn(r, 'sourceOrder')));

const stableA = stableSkinAdapterJson(positive.document);
const reversed = adaptSkinContractDocument(frozen, [...authoritativeInventory].reverse(), { resourceMap });
const stableB = stableSkinAdapterJson(reversed.document);
check('inventory order does not affect stable output', stableA === stableB);

const parsedStable = JSON.parse(stableA);
const evidenceIndexesStayLinked = parsedStable.records.every((record) => record.evidence.every((evidence) => {
  const locator = record.expectedLocators[evidence.expectedLocatorIndex];
  if (!locator) return false;
  if (locator.locatorKind === 'RESOURCE_ID') return resourceMap[String(locator.value)] === evidence.relativePath;
  return locator.value === evidence.relativePath;
}));
check('serialized evidence indexes remain linked to locators', evidenceIndexesStayLinked);

const noResourceMap = adaptSkinContractDocument(frozen, authoritativeInventory);
check('missing resource map keeps all records pending', noResourceMap.diagnostics.recordCounts.pending === 3);
check('missing resource map emits no partial contract evidence', noResourceMap.diagnostics.evidenceCount === 0);
check('missing resource map reports seven pending resource locators', noResourceMap.diagnostics.locatorCounts.pending === 7);

const missingStaticPath = pathLocators[0];
const missingInventory = authoritativeInventory.filter((record) => record.relativePath !== missingStaticPath);
const missing = adaptSkinContractDocument(frozen, missingInventory, { resourceMap });
check('one missing exact path keeps affected record pending', missing.diagnostics.recordCounts.pending === 1 && missing.diagnostics.recordCounts.resolved === 2);
check('pending affected record has no partial evidence', missing.document.records.find((r) => r.canonicalKey.value === 102).evidence.length === 0);

const duplicate = { ...inventoryRecord(pathLocators[0], 'SELF_TEST_SECOND_ROOT') };
const ambiguous = adaptSkinContractDocument(frozen, [...authoritativeInventory, duplicate], { resourceMap });
check('duplicate exact path produces ambiguous record', ambiguous.diagnostics.recordCounts.ambiguous === 1);
check('ambiguous record is fail-closed with no contract evidence', ambiguous.document.records.find((r) => r.canonicalKey.value === 102).evidence.length === 0);

let conflictingMapRejected = false;
try {
  buildSkinModelResourceMap([
    { skinResourceId: 102, prefabPath: 'A.prefab', assetEntryStatus: 'CONFIRMED' },
    { skinResourceId: 102, prefabPath: 'B.prefab', assetEntryStatus: 'CONFIRMED' },
  ]);
} catch {
  conflictingMapRejected = true;
}
check('conflicting model resource map is rejected', conflictingMapRejected);

let unconfirmedMapRejected = false;
try {
  buildSkinModelResourceMap([{ skinResourceId: 102, prefabPath: 'A.prefab', assetEntryStatus: 'PENDING' }]);
} catch {
  unconfirmedMapRejected = true;
}
check('unconfirmed model resource map is rejected', unconfirmedMapRejected);

const legacyInventory = legacyStatic.records.map((record) => inventoryRecord(`legacy-drive/${record.expectedBasename}`, legacyEvidencePath));
legacyInventory.forEach((record, index) => {
  const source = legacyStatic.records[index];
  record.byteSize = source.sizeBytes;
  record.signature = 'PNG';
  record.width = source.width;
  record.height = source.height;
  record.sha256 = source.sha256;
});
const legacyOnly = adaptSkinContractDocument(frozen, legacyInventory);
check('real legacy basename evidence does not impersonate Unity full paths', legacyOnly.diagnostics.recordCounts.pending === 3);
check('real legacy evidence does not emit normalized contract evidence', legacyOnly.diagnostics.evidenceCount === 0);

const failed = checks.filter((item) => !item.pass);
const summary = {
  stage: 'Asset Intake Stage 3 - Skin Adapter',
  status: failed.length === 0 ? 'PASS_ASSET_INTAKE_STAGE3_SKIN_ADAPTER_V1' : 'FAIL_ASSET_INTAKE_STAGE3_SKIN_ADAPTER_V1',
  checks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  hardErrors: failed.length,
  results: checks,
};
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exit(1);
