import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const paths = {
  manifest: 'data/generated/soldier-portrait-manifest.v9.json',
  audit: 'data/validation/soldier-portrait-v9-source-audit.json',
  soldierMaster: 'data/generated/soldier-master.v1.json',
  webManifest: 'data/generated/soldier-portrait-web-manifest.v1.json',
  sourcePackContract: 'data/contracts/soldier-portrait-source-pack.v1.json',
  sourceDirectory: 'public/images/soldiers',
  webpDirectory: 'public/images/soldiers-webp',
  externalSourceVerifier: 'scripts/hydrate-soldier-portrait-source-pack-v1.mjs',
};

const manifest = readJson(paths.manifest);
const audit = readJson(paths.audit);
const soldierMaster = readJson(paths.soldierMaster);
const webManifest = readJson(paths.webManifest);
const sourcePackContract = readJson(paths.sourcePackContract);
const errors = [];
const fail = (code, detail) => errors.push({ code, detail });

const records = Array.isArray(manifest?.records) ? manifest.records : [];
const canonical = Array.isArray(soldierMaster?.records) ? soldierMaster.records : [];
const canonicalIds = [...new Set(canonical.map((record) => record?.soldierId).filter(Number.isInteger))].sort((a, b) => a - b);
const manifestIds = [...new Set(records.map((record) => record?.soldierId).filter(Number.isInteger))].sort((a, b) => a - b);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sourceById = new Map(records.map((record) => [record?.soldierId, record]));

if (manifest?.version !== 9) fail('manifest-version', manifest?.version ?? null);
if (manifest?.status !== 'PASS' || manifest?.assetsReady !== true) fail('manifest-readiness', { status: manifest?.status ?? null, assetsReady: manifest?.assetsReady ?? null });
if (manifest?.publicRoot !== 'images/soldiers') fail('public-root', manifest?.publicRoot ?? null);
if (manifest?.sources?.sourceAudit !== paths.audit) fail('source-audit-link', manifest?.sources?.sourceAudit ?? null);
if (audit?.status !== 'PASS') fail('source-audit-status', audit?.status ?? null);

const expectedCounts = { canonical: 224, normal: 168, sp: 56 };
if (canonicalIds.length !== expectedCounts.canonical) fail('canonical-soldier-count', canonicalIds.length);
if (records.length !== expectedCounts.canonical || manifestIds.length !== expectedCounts.canonical) fail('manifest-record-count', { records: records.length, uniqueIds: manifestIds.length });
if (!sameJson(manifestIds, canonicalIds)) fail('canonical-id-parity', { canonical: canonicalIds.length, manifest: manifestIds.length });

const coverage = manifest?.coverage || {};
const coverageChecks = {
  canonicalSoldierCount: 224,
  canonicalNormalCount: 168,
  canonicalSpCount: 56,
  resolvedCount: 224,
  unresolvedCount: 0,
  resolvedNormalCount: 168,
  resolvedSpCount: 56,
};
for (const [key, expected] of Object.entries(coverageChecks)) {
  if (coverage[key] !== expected) fail(`coverage-${key}`, { expected, actual: coverage[key] ?? null });
}
if (coverage?.sourceCounts?.BWIKI_CURRENT_CN_EXACT_TRANSPARENT_PNG_V9 !== 224) {
  fail('coverage-source-family', coverage?.sourceCounts ?? null);
}

const auditChecks = {
  canonicalCount: 224,
  normalCount: 168,
  spCount: 56,
  cleanResolvedCount: 224,
  unresolvedCount: 0,
};
for (const [key, expected] of Object.entries(auditChecks)) {
  if (audit[key] !== expected) fail(`audit-${key}`, { expected, actual: audit[key] ?? null });
}
if (!Array.isArray(audit?.unresolved) || audit.unresolved.length !== 0) fail('audit-unresolved', audit?.unresolved ?? null);

const policy = manifest?.policy || {};
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
  if (policy[key] !== expected) fail(`policy-${key}`, { expected, actual: policy[key] ?? null });
}
if (policy?.identityJoin !== 'canonical Soldier ID -> ConfigDataSoldierInfo exact ID -> exact current Chinese Name') {
  fail('identity-join-policy', policy?.identityJoin ?? null);
}

const gate = policy?.transparencyGate || {};
const auditGate = audit?.thresholds || {};
const expectedGate = {
  minimumTransparentPixelRatio: 0.08,
  minimumBorderTransparentPixelRatio: 0.5,
  requiredTransparentCorners: 3,
};
if (gate.sourceMustBePng !== true || gate.sourceMustContainAlpha !== true) fail('source-format-gate', gate);
for (const [key, expected] of Object.entries(expectedGate)) {
  if (gate[key] !== expected) fail(`manifest-gate-${key}`, { expected, actual: gate[key] ?? null });
  if (auditGate[key] !== expected) fail(`audit-gate-${key}`, { expected, actual: auditGate[key] ?? null });
}

let normalCount = 0;
let spCount = 0;
const seenDerivativeNames = new Set();
for (const record of records) {
  const soldierId = record?.soldierId;
  if (!Number.isInteger(soldierId)) {
    fail('record-invalid-soldier-id', soldierId ?? null);
    continue;
  }
  if (record?.isSp === true) spCount += 1;
  else if (record?.isSp === false) normalCount += 1;
  else fail('record-invalid-sp-flag', soldierId);

  if (record?.sourceKind !== 'BWIKI_CURRENT_CN_EXACT_TRANSPARENT_PNG_V9') fail('record-source-kind', soldierId);
  if (typeof record?.sourceFileName !== 'string' || !record.sourceFileName.endsWith('.png')) fail('record-source-file', soldierId);
  if (typeof record?.sourceUrl !== 'string' || !/^https:\/\//.test(record.sourceUrl)) fail('record-source-url', soldierId);
  if (record?.fileName !== `${soldierId}.png`) fail('record-derivative-filename', { soldierId, fileName: record?.fileName ?? null });
  if (record?.sourceFileName === record?.fileName) fail('source-derivative-name-not-separated', soldierId);
  if (seenDerivativeNames.has(record?.fileName)) fail('duplicate-derivative-filename', record?.fileName ?? null);
  seenDerivativeNames.add(record?.fileName);
  if (record?.resolutionMethod !== 'CANONICAL_ID_TO_CONFIGDATA_EXACT_CN_NAME_TO_BWIKI_EXACT_TRANSPARENT_FILE') fail('record-resolution-method', soldierId);
  if (!Number.isInteger(record?.size) || record.size <= 0) fail('record-size', soldierId);
  if (!Number.isInteger(record?.width) || record.width <= 0 || !Number.isInteger(record?.height) || record.height <= 0) fail('record-dimensions', soldierId);
  if (typeof record?.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) fail('record-sha256', soldierId);
  if (record?.sourceHasAlpha !== true) fail('record-alpha', soldierId);
  if (!Number.isFinite(record?.transparentPixelRatio) || record.transparentPixelRatio < expectedGate.minimumTransparentPixelRatio) fail('record-transparent-ratio', soldierId);
  if (!Number.isFinite(record?.borderTransparentPixelRatio) || record.borderTransparentPixelRatio < expectedGate.minimumBorderTransparentPixelRatio) fail('record-border-transparent-ratio', soldierId);
  if (!Number.isInteger(record?.transparentCornerCount) || record.transparentCornerCount < expectedGate.requiredTransparentCorners) fail('record-transparent-corners', soldierId);
}
if (normalCount !== expectedCounts.normal || spCount !== expectedCounts.sp) fail('record-normal-sp-counts', { normalCount, spCount });

// A6 post-deletion storage boundary: the repository source PNG copy must stay absent.
// Exact source bytes are retained and validated through the pinned external source-pack contract below.
const sourceDirectory = path.join(ROOT, paths.sourceDirectory);
if (fs.existsSync(sourceDirectory)) {
  const retainedEntries = fs.readdirSync(sourceDirectory, { withFileTypes: true });
  const retainedPngs = retainedEntries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'));
  if (retainedPngs.length > 0) {
    fail('repository-source-png-retained-after-a5', {
      directory: paths.sourceDirectory,
      pngCount: retainedPngs.length,
      examples: retainedPngs.slice(0, 10).map((entry) => entry.name),
    });
  }
}

if (
  sourcePackContract?.version !== 1 ||
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
  sourcePackContract?.authority?.semanticAndSourceIdentity !== paths.manifest ||
  sourcePackContract?.authority?.externalByteTransport !== 'THIS_CONTRACT_PLUS_PINNED_SHA256' ||
  sourcePackContract?.authority?.externalInventoryMayCreateSemanticMappings !== false
) {
  fail('source-pack-authority-boundary', sourcePackContract?.authority ?? null);
}
if (
  sourcePackContract?.coverage?.fileCount !== 224 ||
  sourcePackContract?.coverage?.totalSourceBytes !== 48931121 ||
  sourcePackContract?.coverage?.canonicalSoldierCount !== 224 ||
  sourcePackContract?.coverage?.canonicalNormalCount !== 168 ||
  sourcePackContract?.coverage?.canonicalSpCount !== 56 ||
  sourcePackContract?.coverage?.missingCount !== 0 ||
  sourcePackContract?.coverage?.extraCount !== 0 ||
  sourcePackContract?.coverage?.duplicateCount !== 0
) {
  fail('source-pack-coverage', sourcePackContract?.coverage ?? null);
}
if (
  sourcePackContract?.integrityPolicy?.failClosedOnAnyMismatch !== true ||
  sourcePackContract?.integrityPolicy?.exactFileSetRequired !== true ||
  sourcePackContract?.integrityPolicy?.perFileSha256MustMatchV9Manifest !== true ||
  sourcePackContract?.integrityPolicy?.perFileSizeMustMatchV9Manifest !== true
) {
  fail('source-pack-integrity-policy', sourcePackContract?.integrityPolicy ?? null);
}
if (
  sourcePackContract?.productionPolicy?.sourcePackFetchedAtRuntime !== false ||
  sourcePackContract?.productionPolicy?.productionWebManifest !== paths.webManifest ||
  sourcePackContract?.productionPolicy?.productionPublicRoot !== 'images/soldiers-webp' ||
  sourcePackContract?.productionPolicy?.productionWebpCount !== 224 ||
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

const webRecords = Array.isArray(webManifest?.records) ? webManifest.records : [];
if (
  webManifest?.version !== 1 ||
  webManifest?.stage !== 'frontend-soldier-portrait-webp-lossless' ||
  webManifest?.status !== 'PASS' ||
  webManifest?.publicRoot !== 'images/soldiers-webp' ||
  webManifest?.assetsReady !== true ||
  webManifest?.sourceManifest !== paths.manifest
) {
  fail('web-manifest-identity', {
    version: webManifest?.version ?? null,
    stage: webManifest?.stage ?? null,
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
if (
  webManifest?.coverage?.canonicalSoldierCount !== 224 ||
  webManifest?.coverage?.resolvedCount !== 224 ||
  webManifest?.coverage?.unresolvedCount !== 0 ||
  webManifest?.coverage?.resolvedSpCount !== 56 ||
  webRecords.length !== 224
) {
  fail('web-manifest-coverage', {
    coverage: webManifest?.coverage ?? null,
    records: webRecords.length,
  });
}
if (
  webManifest?.sizeAudit?.pngTotalBytes !== 48931121 ||
  webManifest?.sizeAudit?.webpTotalBytes !== 30577298 ||
  webManifest?.sizeAudit?.savingBytes !== 18353823
) {
  fail('web-manifest-size-audit', webManifest?.sizeAudit ?? null);
}

const webpDirectory = path.join(ROOT, paths.webpDirectory);
if (!fs.existsSync(webpDirectory)) {
  fail('webp-directory-missing', paths.webpDirectory);
} else {
  const entries = fs.readdirSync(webpDirectory, { withFileTypes: true });
  const actualFiles = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const expectedFiles = webRecords.map((record) => record?.fileName).filter((name) => typeof name === 'string').sort();
  if (actualFiles.length !== 224 || !sameJson(actualFiles, expectedFiles)) {
    fail('webp-file-set', {
      actualCount: actualFiles.length,
      expectedCount: expectedFiles.length,
      missing: expectedFiles.filter((name) => !actualFiles.includes(name)).slice(0, 20),
      extra: actualFiles.filter((name) => !expectedFiles.includes(name)).slice(0, 20),
    });
  }

  const webIds = new Set();
  let verifiedWebpCount = 0;
  let webpTotalBytes = 0;
  let webSpCount = 0;
  for (const record of webRecords) {
    const soldierId = record?.soldierId;
    if (!Number.isInteger(soldierId) || webIds.has(soldierId)) {
      fail('web-record-invalid-or-duplicate-id', soldierId ?? null);
      continue;
    }
    webIds.add(soldierId);
    if (record?.isSp === true) webSpCount += 1;

    const sourceRecord = sourceById.get(soldierId);
    if (!sourceRecord) {
      fail('web-record-source-missing', soldierId);
      continue;
    }
    if (
      record?.fileName !== `${soldierId}.webp` ||
      record?.sourceKind !== 'DERIVED_WEBP_LOSSLESS_FROM_V9_PNG' ||
      record?.resolutionMethod !== 'LOSSLESS_WEBP_PIXEL_EXACT_FROM_CANONICAL_V9_PNG' ||
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

    const filePath = path.join(webpDirectory, record.fileName);
    if (!fs.existsSync(filePath)) {
      fail('webp-file-missing', record.fileName);
      continue;
    }
    const bytes = fs.readFileSync(filePath);
    const stat = fs.statSync(filePath);
    webpTotalBytes += stat.size;
    if (stat.size !== record.size) fail('webp-size-mismatch', { soldierId, expected: record.size, actual: stat.size });
    const actualSha = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actualSha !== record.sha256) fail('webp-sha256-mismatch', { soldierId, expected: record.sha256, actual: actualSha });
    if (
      bytes.length < 12 ||
      bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      fail('webp-signature', soldierId);
    }
    verifiedWebpCount += 1;
  }
  if (webIds.size !== 224) fail('web-record-unique-id-count', webIds.size);
  if (webSpCount !== 56) fail('web-record-sp-count', webSpCount);
  if (verifiedWebpCount !== 224) fail('webp-verified-count', verifiedWebpCount);
  if (webpTotalBytes !== 30577298) fail('webp-total-bytes', { expected: 30577298, actual: webpTotalBytes });
}

if (errors.length) {
  console.error(`SOLDIER PORTRAIT V9 FINAL VALIDATION: FAIL (${errors.length})`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error.code}: ${JSON.stringify(error.detail)}`);
  process.exit(1);
}

const externalVerifierPath = path.join(ROOT, paths.externalSourceVerifier);
if (!fs.existsSync(externalVerifierPath)) {
  console.error('SOLDIER PORTRAIT V9 FINAL VALIDATION: FAIL');
  console.error(`- external-source-verifier-missing: ${paths.externalSourceVerifier}`);
  process.exit(1);
}

const externalVerification = spawnSync(process.execPath, [externalVerifierPath], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
});
if (externalVerification.error || externalVerification.status !== 0) {
  console.error('SOLDIER PORTRAIT V9 FINAL VALIDATION: FAIL');
  console.error(`- external-source-pack-verification: ${externalVerification.error?.message ?? `exit ${externalVerification.status}`}`);
  process.exit(1);
}

console.log('SOLDIER PORTRAIT V9 FINAL VALIDATION: PASS');
console.log(JSON.stringify({
  canonical: 224,
  normal: 168,
  sp: 56,
  resolved: 224,
  unresolved: 0,
  sourceFamily: 'BWIKI_CURRENT_CN_EXACT_TRANSPARENT_PNG_V9',
  repositorySourcePngCount: 0,
  externalSourcePackVerified: true,
  externalSourceVerifier: paths.externalSourceVerifier,
  productionWebpVerified: 224,
  productionWebpBytes: 30577298,
  productionPublicRoot: 'images/soldiers-webp',
  runtimePathChanged: false,
  semanticChanges: false,
}, null, 2));
