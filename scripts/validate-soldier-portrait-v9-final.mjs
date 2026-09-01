import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCATOR_PATH = 'data/contracts/soldier-portrait-assets-current.v1.json';
const SOLDIER_MASTER_PATH = 'data/generated/soldier-master.v1.json';
const SOURCE_PACK_VERIFIER = 'scripts/hydrate-soldier-portrait-source-pack-v1.mjs';

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortedIds = (records) => [...new Set(records.map((record) => record?.soldierId).filter(Number.isInteger))].sort((a, b) => a - b);
const errors = [];
const fail = (code, detail) => errors.push({ code, detail });

const locator = readJson(LOCATOR_PATH);
if (
  locator?.schemaId !== 'soldier-portrait-assets-current/v1' ||
  locator?.status !== 'CURRENT' ||
  locator?.owner !== 'soldier-assets' ||
  locator?.role?.semanticAuthority !== false ||
  locator?.role?.operationalLocatorOnly !== true ||
  locator?.role?.selectsExistingFrozenArtifactsOnly !== true ||
  locator?.boundaries?.semanticRecomputationCount !== 0 ||
  locator?.boundaries?.canonicalJoinRecomputationCount !== 0 ||
  locator?.boundaries?.nameJoinInference !== false ||
  locator?.boundaries?.idArithmeticInference !== false ||
  locator?.boundaries?.filenameSimilarityInference !== false ||
  locator?.boundaries?.versionNumberDiscovery !== false ||
  locator?.boundaries?.assetByteMutation !== false ||
  locator?.updatePolicy?.explicitPointerUpdateOnly !== true ||
  locator?.updatePolicy?.automaticHighestVersionSelection !== false
) {
  fail('current-asset-locator-boundary', locator ?? null);
}

const selectedPaths = {
  manifest: locator?.currentSourceManifest,
  sourcePackContract: locator?.currentSourcePackContract,
  webManifest: locator?.currentWebManifest,
};
for (const [key, selectedPath] of Object.entries(selectedPaths)) {
  if (typeof selectedPath !== 'string' || selectedPath.length === 0 || !fs.existsSync(path.join(ROOT, selectedPath))) {
    fail(`locator-${key}-missing`, selectedPath ?? null);
  }
}

if (errors.length) {
  console.error(`SOLDIER PORTRAIT CURRENT VALIDATION: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error.code}: ${JSON.stringify(error.detail)}`);
  process.exit(1);
}

const manifest = readJson(selectedPaths.manifest);
const sourcePackContract = readJson(selectedPaths.sourcePackContract);
const webManifest = readJson(selectedPaths.webManifest);
const soldierMaster = readJson(SOLDIER_MASTER_PATH);
const auditPath = manifest?.sources?.sourceAudit;
const audit = typeof auditPath === 'string' && fs.existsSync(path.join(ROOT, auditPath)) ? readJson(auditPath) : null;

const canonical = Array.isArray(soldierMaster?.records) ? soldierMaster.records : [];
const records = Array.isArray(manifest?.records) ? manifest.records : [];
const webRecords = Array.isArray(webManifest?.records) ? webManifest.records : [];
const canonicalIds = sortedIds(canonical);
const manifestIds = sortedIds(records);
const webIds = sortedIds(webRecords);
const canonicalNormalCount = canonical.filter((record) => record?.isSp === false).length;
const canonicalSpCount = canonical.filter((record) => record?.isSp === true).length;
const canonicalUnknownSpCount = canonical.length - canonicalNormalCount - canonicalSpCount;
const sourceById = new Map(records.map((record) => [record?.soldierId, record]));

if (canonical.length !== canonicalIds.length) fail('canonical-id-uniqueness', { records: canonical.length, uniqueIds: canonicalIds.length });
if (canonicalUnknownSpCount !== 0) fail('canonical-sp-classification', { unknown: canonicalUnknownSpCount });
if (records.length !== manifestIds.length) fail('source-manifest-id-uniqueness', { records: records.length, uniqueIds: manifestIds.length });
if (webRecords.length !== webIds.length) fail('web-manifest-id-uniqueness', { records: webRecords.length, uniqueIds: webIds.length });
if (!sameJson(manifestIds, canonicalIds)) fail('canonical-source-id-parity', { canonical: canonicalIds.length, source: manifestIds.length });
if (!sameJson(webIds, canonicalIds)) fail('canonical-web-id-parity', { canonical: canonicalIds.length, web: webIds.length });

if (manifest?.status !== 'PASS' || manifest?.assetsReady !== true) {
  fail('source-manifest-readiness', { status: manifest?.status ?? null, assetsReady: manifest?.assetsReady ?? null });
}
if (typeof manifest?.version !== 'number' || !Number.isFinite(manifest.version)) fail('source-manifest-version', manifest?.version ?? null);
if (typeof manifest?.publicRoot !== 'string' || manifest.publicRoot.length === 0) fail('source-manifest-public-root', manifest?.publicRoot ?? null);
if (typeof auditPath !== 'string' || audit === null) fail('source-audit-link', auditPath ?? null);
if (audit?.status !== 'PASS') fail('source-audit-status', audit?.status ?? null);

const coverage = manifest?.coverage ?? {};
const expectedCoverage = {
  canonicalSoldierCount: canonicalIds.length,
  canonicalNormalCount,
  canonicalSpCount,
  resolvedCount: records.length,
  unresolvedCount: canonicalIds.length - records.length,
  resolvedNormalCount: records.filter((record) => record?.isSp === false).length,
  resolvedSpCount: records.filter((record) => record?.isSp === true).length,
};
for (const [key, expected] of Object.entries(expectedCoverage)) {
  if (coverage?.[key] !== expected) fail(`coverage-${key}`, { expected, actual: coverage?.[key] ?? null });
}
if (expectedCoverage.unresolvedCount !== 0) fail('source-manifest-unresolved', expectedCoverage.unresolvedCount);

const sourceKinds = [...new Set(records.map((record) => record?.sourceKind).filter((value) => typeof value === 'string' && value.length > 0))];
if (manifest?.policy?.allPortraitsUseOneSourceFamily === true && sourceKinds.length !== 1) {
  fail('source-family-count', sourceKinds);
}
if (coverage?.sourceCounts && typeof coverage.sourceCounts === 'object') {
  const sourceCountTotal = Object.values(coverage.sourceCounts).reduce((sum, value) => sum + (Number.isInteger(value) ? value : 0), 0);
  if (sourceCountTotal !== records.length) fail('source-family-coverage-total', { expected: records.length, actual: sourceCountTotal });
  for (const sourceKind of sourceKinds) {
    const count = records.filter((record) => record?.sourceKind === sourceKind).length;
    if (coverage.sourceCounts[sourceKind] !== count) fail('source-family-coverage', { sourceKind, expected: count, actual: coverage.sourceCounts[sourceKind] ?? null });
  }
}

const auditChecks = {
  canonicalCount: canonicalIds.length,
  normalCount: canonicalNormalCount,
  spCount: canonicalSpCount,
  cleanResolvedCount: records.length,
  unresolvedCount: 0,
};
for (const [key, expected] of Object.entries(auditChecks)) {
  if (audit?.[key] !== expected) fail(`audit-${key}`, { expected, actual: audit?.[key] ?? null });
}
if (!Array.isArray(audit?.unresolved) || audit.unresolved.length !== 0) fail('audit-unresolved', audit?.unresolved ?? null);

const policy = manifest?.policy ?? {};
const requiredPolicy = {
  noGuessing: true,
  generatedImageUsed: false,
  backgroundRemovalUsed: false,
  syntheticEditingUsed: false,
  nameSimilarityUsed: false,
  idArithmeticUsed: false,
  normalSpPortraitReuse: false,
  allPortraitsUseOneSourceFamily: true,
};
for (const [key, expected] of Object.entries(requiredPolicy)) {
  if (policy?.[key] !== expected) fail(`policy-${key}`, { expected, actual: policy?.[key] ?? null });
}
if (typeof policy?.identityJoin !== 'string' || policy.identityJoin.length === 0) fail('identity-join-policy', policy?.identityJoin ?? null);

const gate = policy?.transparencyGate ?? {};
const auditGate = audit?.thresholds ?? {};
if (gate?.sourceMustBePng !== true || gate?.sourceMustContainAlpha !== true) fail('source-format-gate', gate);
for (const key of ['minimumTransparentPixelRatio', 'minimumBorderTransparentPixelRatio', 'requiredTransparentCorners']) {
  if (!Number.isFinite(gate?.[key])) fail(`manifest-gate-${key}`, gate?.[key] ?? null);
  if (auditGate?.[key] !== gate?.[key]) fail(`audit-gate-${key}`, { manifest: gate?.[key] ?? null, audit: auditGate?.[key] ?? null });
}

let sourceTotalBytes = 0;
const seenSourceFileNames = new Set();
for (const record of records) {
  const soldierId = record?.soldierId;
  if (!Number.isInteger(soldierId)) {
    fail('source-record-invalid-soldier-id', soldierId ?? null);
    continue;
  }
  if (record?.isSp !== true && record?.isSp !== false) fail('source-record-invalid-sp-flag', soldierId);
  if (typeof record?.sourceKind !== 'string' || record.sourceKind.length === 0) fail('source-record-kind', soldierId);
  if (typeof record?.sourceFileName !== 'string' || !record.sourceFileName.toLowerCase().endsWith('.png')) fail('source-record-file', soldierId);
  if (typeof record?.sourceUrl !== 'string' || !/^https:\/\//.test(record.sourceUrl)) fail('source-record-url', soldierId);
  if (record?.fileName !== `${soldierId}.png`) fail('source-record-canonical-filename', { soldierId, fileName: record?.fileName ?? null });
  if (record?.sourceFileName === record?.fileName) fail('source-record-name-not-separated', soldierId);
  if (seenSourceFileNames.has(record?.fileName)) fail('source-record-duplicate-filename', record?.fileName ?? null);
  seenSourceFileNames.add(record?.fileName);
  if (typeof record?.resolutionMethod !== 'string' || record.resolutionMethod.length === 0) fail('source-record-resolution-method', soldierId);
  if (!Number.isInteger(record?.size) || record.size <= 0) fail('source-record-size', soldierId);
  else sourceTotalBytes += record.size;
  if (!Number.isInteger(record?.width) || record.width <= 0 || !Number.isInteger(record?.height) || record.height <= 0) fail('source-record-dimensions', soldierId);
  if (typeof record?.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) fail('source-record-sha256', soldierId);
  if (record?.sourceHasAlpha !== true) fail('source-record-alpha', soldierId);
  if (!Number.isFinite(record?.transparentPixelRatio) || record.transparentPixelRatio < gate.minimumTransparentPixelRatio) fail('source-record-transparent-ratio', soldierId);
  if (!Number.isFinite(record?.borderTransparentPixelRatio) || record.borderTransparentPixelRatio < gate.minimumBorderTransparentPixelRatio) fail('source-record-border-transparent-ratio', soldierId);
  if (!Number.isInteger(record?.transparentCornerCount) || record.transparentCornerCount < gate.requiredTransparentCorners) fail('source-record-transparent-corners', soldierId);
}

const sourceDirectoryRelative = sourcePackContract?.authoritativePredecessor?.sourcePublicPath;
if (typeof sourceDirectoryRelative === 'string' && sourceDirectoryRelative.length > 0) {
  const sourceDirectory = path.join(ROOT, sourceDirectoryRelative);
  if (fs.existsSync(sourceDirectory)) {
    const retainedPngs = fs.readdirSync(sourceDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'));
    if (retainedPngs.length > 0) {
      fail('repository-source-png-retained', {
        directory: sourceDirectoryRelative,
        pngCount: retainedPngs.length,
        examples: retainedPngs.slice(0, 10).map((entry) => entry.name),
      });
    }
  }
}

if (
  !Number.isInteger(sourcePackContract?.version) ||
  sourcePackContract.version <= 0 ||
  sourcePackContract?.contract !== 'soldier-portrait-source-pack' ||
  sourcePackContract?.status !== 'PASS' ||
  sourcePackContract?.owner !== 'soldier-assets'
) {
  fail('source-pack-contract-identity', {
    version: sourcePackContract?.version ?? null,
    contract: sourcePackContract?.contract ?? null,
    status: sourcePackContract?.status ?? null,
    owner: sourcePackContract?.owner ?? null,
  });
}
if (
  sourcePackContract?.authority?.semanticAndSourceIdentity !== selectedPaths.manifest ||
  sourcePackContract?.authority?.externalByteTransport !== 'THIS_CONTRACT_PLUS_PINNED_SHA256' ||
  sourcePackContract?.authority?.externalInventoryMayCreateSemanticMappings !== false ||
  sourcePackContract?.authoritativePredecessor?.sourceManifest !== selectedPaths.manifest
) {
  fail('source-pack-authority-boundary', {
    authority: sourcePackContract?.authority ?? null,
    predecessor: sourcePackContract?.authoritativePredecessor ?? null,
  });
}
const packCoverage = sourcePackContract?.coverage ?? {};
const expectedPackCoverage = {
  fileCount: records.length,
  totalSourceBytes: sourceTotalBytes,
  canonicalSoldierCount: canonicalIds.length,
  canonicalNormalCount,
  canonicalSpCount,
  missingCount: 0,
  extraCount: 0,
  duplicateCount: 0,
};
for (const [key, expected] of Object.entries(expectedPackCoverage)) {
  if (packCoverage?.[key] !== expected) fail(`source-pack-coverage-${key}`, { expected, actual: packCoverage?.[key] ?? null });
}
const integrityPolicy = sourcePackContract?.integrityPolicy ?? {};
const shaParityDeclared = integrityPolicy?.perFileSha256MustMatchSourceManifest === true || integrityPolicy?.perFileSha256MustMatchV9Manifest === true;
const sizeParityDeclared = integrityPolicy?.perFileSizeMustMatchSourceManifest === true || integrityPolicy?.perFileSizeMustMatchV9Manifest === true;
if (
  integrityPolicy?.failClosedOnAnyMismatch !== true ||
  integrityPolicy?.exactFileSetRequired !== true ||
  shaParityDeclared !== true ||
  sizeParityDeclared !== true ||
  integrityPolicy?.soldierIdToFileNameMustRemainExact !== true
) {
  fail('source-pack-integrity-policy', integrityPolicy);
}
if (
  sourcePackContract?.productionPolicy?.sourcePackFetchedAtRuntime !== false ||
  sourcePackContract?.productionPolicy?.productionWebManifest !== selectedPaths.webManifest ||
  sourcePackContract?.productionPolicy?.runtimePathChange !== false ||
  sourcePackContract?.productionPolicy?.webpReencodingInThisStage !== false
) {
  fail('source-pack-production-boundary', sourcePackContract?.productionPolicy ?? null);
}
if (
  sourcePackContract?.semanticBoundary?.canonicalSoldierChanges !== false ||
  sourcePackContract?.semanticBoundary?.heroSoldierRelationChanges !== false ||
  sourcePackContract?.semanticBoundary?.localizationChanges !== false ||
  sourcePackContract?.semanticBoundary?.nameJoinIntroduced !== false ||
  sourcePackContract?.semanticBoundary?.idArithmeticIntroduced !== false ||
  sourcePackContract?.semanticBoundary?.sourceMeaningReinterpreted !== false
) {
  fail('source-pack-semantic-boundary', sourcePackContract?.semanticBoundary ?? null);
}

if (
  !Number.isFinite(webManifest?.version) ||
  webManifest?.status !== 'PASS' ||
  typeof webManifest?.publicRoot !== 'string' ||
  webManifest.publicRoot.length === 0 ||
  webManifest?.assetsReady !== true ||
  webManifest?.sourceManifest !== selectedPaths.manifest
) {
  fail('web-manifest-identity', {
    version: webManifest?.version ?? null,
    status: webManifest?.status ?? null,
    publicRoot: webManifest?.publicRoot ?? null,
    assetsReady: webManifest?.assetsReady ?? null,
    sourceManifest: webManifest?.sourceManifest ?? null,
  });
}
if (
  webManifest?.policy?.sourcePngPreserved !== true ||
  webManifest?.policy?.webpMode !== 'lossless' ||
  webManifest?.policy?.decodedPixelExact !== true ||
  webManifest?.policy?.alphaPreservedByDecodedPixelEquality !== true ||
  webManifest?.policy?.dimensionsPreserved !== true
) {
  fail('web-manifest-policy', webManifest?.policy ?? null);
}
const expectedWebCoverage = {
  canonicalSoldierCount: canonicalIds.length,
  resolvedCount: webRecords.length,
  unresolvedCount: canonicalIds.length - webRecords.length,
  resolvedSpCount: webRecords.filter((record) => record?.isSp === true).length,
};
for (const [key, expected] of Object.entries(expectedWebCoverage)) {
  if (webManifest?.coverage?.[key] !== expected) fail(`web-manifest-coverage-${key}`, { expected, actual: webManifest?.coverage?.[key] ?? null });
}
if (expectedWebCoverage.unresolvedCount !== 0) fail('web-manifest-unresolved', expectedWebCoverage.unresolvedCount);
if (sourcePackContract?.productionPolicy?.productionPublicRoot !== webManifest.publicRoot) {
  fail('source-pack-web-public-root', { contract: sourcePackContract?.productionPolicy?.productionPublicRoot ?? null, web: webManifest.publicRoot });
}
if (sourcePackContract?.productionPolicy?.productionWebpCount !== webRecords.length) {
  fail('source-pack-web-count', { contract: sourcePackContract?.productionPolicy?.productionWebpCount ?? null, web: webRecords.length });
}

const expectedWebpDirectory = path.join(ROOT, 'public', webManifest.publicRoot);
let actualWebpTotalBytes = 0;
let verifiedWebpCount = 0;
if (!fs.existsSync(expectedWebpDirectory)) {
  fail('webp-directory-missing', path.relative(ROOT, expectedWebpDirectory));
} else {
  const entries = fs.readdirSync(expectedWebpDirectory, { withFileTypes: true });
  const actualFiles = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const expectedFiles = webRecords.map((record) => record?.fileName).filter((name) => typeof name === 'string').sort();
  if (!sameJson(actualFiles, expectedFiles)) {
    fail('webp-file-set', {
      actualCount: actualFiles.length,
      expectedCount: expectedFiles.length,
      missing: expectedFiles.filter((name) => !actualFiles.includes(name)).slice(0, 20),
      extra: actualFiles.filter((name) => !expectedFiles.includes(name)).slice(0, 20),
    });
  }

  for (const record of webRecords) {
    const soldierId = record?.soldierId;
    const sourceRecord = sourceById.get(soldierId);
    if (!Number.isInteger(soldierId) || !sourceRecord) {
      fail('web-record-source-missing', soldierId ?? null);
      continue;
    }
    if (
      record?.fileName !== `${soldierId}.webp` ||
      typeof record?.sourceKind !== 'string' ||
      record.sourceKind.length === 0 ||
      typeof record?.resolutionMethod !== 'string' ||
      record.resolutionMethod.length === 0 ||
      record?.sourcePngFileName !== `${soldierId}.png` ||
      record?.sourcePngSha256 !== sourceRecord.sha256 ||
      record?.width !== sourceRecord.width ||
      record?.height !== sourceRecord.height ||
      record?.isSp !== sourceRecord.isSp ||
      !Number.isInteger(record?.size) ||
      record.size <= 0 ||
      typeof record?.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.sha256)
    ) {
      fail('web-record-source-parity', soldierId);
      continue;
    }

    const filePath = path.join(expectedWebpDirectory, record.fileName);
    if (!fs.existsSync(filePath)) {
      fail('webp-file-missing', record.fileName);
      continue;
    }
    const bytes = fs.readFileSync(filePath);
    const stat = fs.statSync(filePath);
    actualWebpTotalBytes += stat.size;
    if (stat.size !== record.size) fail('webp-size-mismatch', { soldierId, expected: record.size, actual: stat.size });
    const actualSha = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actualSha !== record.sha256) fail('webp-sha256-mismatch', { soldierId, expected: record.sha256, actual: actualSha });
    if (bytes.length < 12 || bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') {
      fail('webp-signature', soldierId);
    }
    verifiedWebpCount += 1;
  }
}

const declaredPngBytes = webManifest?.sizeAudit?.pngTotalBytes;
const declaredWebpBytes = webManifest?.sizeAudit?.webpTotalBytes;
const declaredSavingBytes = webManifest?.sizeAudit?.savingBytes;
if (declaredPngBytes !== sourceTotalBytes) fail('web-manifest-png-total-bytes', { expected: sourceTotalBytes, actual: declaredPngBytes ?? null });
if (declaredWebpBytes !== actualWebpTotalBytes) fail('web-manifest-webp-total-bytes', { expected: actualWebpTotalBytes, actual: declaredWebpBytes ?? null });
if (declaredSavingBytes !== sourceTotalBytes - actualWebpTotalBytes) {
  fail('web-manifest-saving-bytes', { expected: sourceTotalBytes - actualWebpTotalBytes, actual: declaredSavingBytes ?? null });
}
if (verifiedWebpCount !== webRecords.length) fail('webp-verified-count', { expected: webRecords.length, actual: verifiedWebpCount });

if (errors.length) {
  console.error(`SOLDIER PORTRAIT CURRENT VALIDATION: FAIL (${errors.length})`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error.code}: ${JSON.stringify(error.detail)}`);
  process.exit(1);
}

const externalVerifierPath = path.join(ROOT, SOURCE_PACK_VERIFIER);
if (!fs.existsSync(externalVerifierPath)) {
  console.error('SOLDIER PORTRAIT CURRENT VALIDATION: FAIL');
  console.error(`- external-source-verifier-missing: ${SOURCE_PACK_VERIFIER}`);
  process.exit(1);
}

const externalVerification = spawnSync(process.execPath, [externalVerifierPath, '--contract', selectedPaths.sourcePackContract], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
});
if (externalVerification.error || externalVerification.status !== 0) {
  console.error('SOLDIER PORTRAIT CURRENT VALIDATION: FAIL');
  console.error(`- external-source-pack-verification: ${externalVerification.error?.message ?? `exit ${externalVerification.status}`}`);
  process.exit(1);
}

console.log('SOLDIER PORTRAIT CURRENT VALIDATION: PASS');
console.log(JSON.stringify({
  locator: LOCATOR_PATH,
  sourceManifest: selectedPaths.manifest,
  sourceManifestVersion: manifest.version,
  sourcePackContract: selectedPaths.sourcePackContract,
  sourcePackContractVersion: sourcePackContract.version,
  webManifest: selectedPaths.webManifest,
  webManifestVersion: webManifest.version,
  canonical: canonicalIds.length,
  normal: canonicalNormalCount,
  sp: canonicalSpCount,
  resolved: records.length,
  unresolved: canonicalIds.length - records.length,
  sourceFamilies: sourceKinds,
  repositorySourcePngCount: 0,
  externalSourcePackVerified: true,
  productionWebpVerified: verifiedWebpCount,
  productionWebpBytes: actualWebpTotalBytes,
  productionPublicRoot: webManifest.publicRoot,
  runtimePathChanged: false,
  semanticChanges: false,
}, null, 2));
