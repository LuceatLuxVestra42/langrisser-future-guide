import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PACK_CONTRACT = 'data/contracts/hero-card-icon-source-pack.v1.json';
const H5_POLICY_CONTRACT = 'data/contracts/hero-card-icon-source-pack-h5-runtime-policy.v1.json';
const HYDRATOR = 'scripts/hydrate-hero-card-icon-source-pack-v1.mjs';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(message, detail = null) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`invalid ${label}`, value ?? null);
}

function assertPositiveInt(value, label) {
  if (!Number.isInteger(value) || value <= 0) fail(`invalid ${label}`, value ?? null);
}

function validateH2(contract) {
  if (
    contract?.version !== 1 ||
    contract?.contract !== 'hero-card-icon-source-pack' ||
    contract?.status !== 'PASS' ||
    contract?.owner !== 'hero-assets' ||
    contract?.stage !== 'repository-size-reduction-H2'
  ) fail('H2 source-pack contract is not an admitted predecessor');

  const predecessor = contract?.authoritativePredecessor;
  if (
    predecessor?.repository !== 'LuceatLuxVestra42/langrisser-future-guide' ||
    !/^[a-f0-9]{40}$/.test(predecessor?.sourceCommitSha ?? '') ||
    predecessor?.sourceManifest !== 'data/generated/hero-card-icon-assets.v1.json' ||
    predecessor?.sourceFreezeState !== 'HERO_CARD_ICON_ASSETS_FROZEN' ||
    predecessor?.webDeliveryManifest !== 'data/generated/hero-card-icon-web-delivery.v1.json' ||
    predecessor?.webDeliveryFreezeState !== 'HERO_CARD_ICON_WEB_DELIVERY_FROZEN' ||
    predecessor?.sourcePublicPath !== 'public/images/heroes/card-icons'
  ) fail('H2 authoritative predecessor drift', predecessor ?? null);

  if (
    contract?.authority?.semanticAndSourceIdentity !== predecessor.sourceManifest ||
    contract?.authority?.productionWebDelivery !== predecessor.webDeliveryManifest ||
    contract?.authority?.externalByteTransport !== 'THIS_CONTRACT_PLUS_PINNED_SHA256' ||
    contract?.authority?.externalInventoryMayCreateSemanticMappings !== false
  ) fail('H2 authority boundary drift');

  if (
    contract?.coverage?.fileCount !== 267 ||
    contract?.coverage?.heroCount !== 267 ||
    contract?.coverage?.totalSourceBytes !== 8990485 ||
    contract?.coverage?.missingCount !== 0 ||
    contract?.coverage?.extraCount !== 0 ||
    contract?.coverage?.duplicateCount !== 0
  ) fail('H2 exact coverage drift', contract?.coverage ?? null);

  if (
    contract?.storage?.kind !== 'GITHUB_RELEASE_ASSET' ||
    contract?.storage?.repository !== 'LuceatLuxVestra42/langrisser-future-guide' ||
    contract?.storage?.immutabilityPolicy !== 'CONTENT_HASH_PINNED_FAIL_CLOSED'
  ) fail('H2 storage boundary drift');

  for (const key of ['archive', 'inventory', 'checksums']) {
    assertPositiveInt(contract.storage?.[key]?.assetId, `${key}.assetId`);
    assertPositiveInt(contract.storage?.[key]?.bytes, `${key}.bytes`);
    assertSha256(contract.storage?.[key]?.sha256, `${key}.sha256`);
  }

  if (
    contract?.integrityPolicy?.exactFileSetRequired !== true ||
    contract?.integrityPolicy?.perFileSha256MustMatchFrozenSourceManifest !== true ||
    contract?.integrityPolicy?.perFileSizeMustMatchFrozenSourceManifest !== true ||
    contract?.integrityPolicy?.heroIdToFileNameMustRemainExact !== true ||
    contract?.integrityPolicy?.failClosedOnAnyMismatch !== true
  ) fail('H2 integrity policy drift');

  if (
    contract?.productionPolicy?.sourcePackFetchedAtRuntime !== false ||
    contract?.productionPolicy?.productionWebDeliveryFormat !== 'LOSSLESS_WEBP' ||
    contract?.productionPolicy?.productionWebDeliveryCount !== 267 ||
    contract?.productionPolicy?.productionWebDeliveryBytes !== 5772910 ||
    contract?.productionPolicy?.runtimePathChange !== false ||
    contract?.productionPolicy?.webpReencodingInThisStage !== false ||
    contract?.productionPolicy?.detailCardArtworkChange !== false
  ) fail('H2 production boundary drift');

  if (
    contract?.semanticBoundary?.canonicalHeroChanges !== false ||
    contract?.semanticBoundary?.heroRelationChanges !== false ||
    contract?.semanticBoundary?.localizationChanges !== false ||
    contract?.semanticBoundary?.nameJoinIntroduced !== false ||
    contract?.semanticBoundary?.idArithmeticIntroduced !== false ||
    contract?.semanticBoundary?.filenameSimilarityIntroduced !== false ||
    contract?.semanticBoundary?.sourceMeaningReinterpreted !== false
  ) fail('H2 semantic boundary drift');
}

function validateH5(policy, h2) {
  if (
    policy?.version !== 1 ||
    policy?.contract !== 'hero-card-icon-source-pack-runtime-policy' ||
    policy?.status !== 'PASS' ||
    policy?.owner !== 'hero-card-icon-source-pack-assets' ||
    policy?.stage !== 'repository-size-reduction-H5' ||
    policy?.completion !== 'H5_POLICY_COMPLETE'
  ) fail('H5 runtime/source transport policy is not complete');

  if (
    policy?.authority?.sourceIdentityManifest !== h2.authority.semanticAndSourceIdentity ||
    policy?.authority?.sourceIdentityFreezeState !== h2.authoritativePredecessor.sourceFreezeState ||
    policy?.authority?.externalSourceTransportContract !== SOURCE_PACK_CONTRACT ||
    policy?.authority?.productionWebDeliveryManifest !== h2.authority.productionWebDelivery ||
    policy?.authority?.productionWebDeliveryFreezeState !== h2.authoritativePredecessor.webDeliveryFreezeState ||
    policy?.authority?.currentRepositorySourceByteTransport !== 'EXTERNAL_EXACT_BYTE_SOURCE_PACK' ||
    policy?.authority?.frozenManifestPathMetadataCreatesCurrentRetentionRequirement !== false
  ) fail('H5 authority boundary drift', policy?.authority ?? null);

  const transport = policy?.sourceTransportPolicy;
  if (
    transport?.repositoryTrackedSourcePngRequired !== false ||
    transport?.sourcePackHydrationOnDemandAllowed !== true ||
    transport?.hydrator !== HYDRATOR ||
    transport?.sourcePackContract !== SOURCE_PACK_CONTRACT ||
    transport?.sourcePackStorageKind !== h2.storage.kind ||
    transport?.sourcePackIntegrityMode !== h2.storage.immutabilityPolicy ||
    transport?.expectedSourceFileCount !== h2.coverage.fileCount ||
    transport?.expectedSourceTotalBytes !== h2.coverage.totalSourceBytes ||
    transport?.sourcePngDeletionPerformedInThisStage !== false ||
    transport?.sourcePngDeletionDeferredToStage !== 'H6'
  ) fail('H5 source transport policy drift', transport ?? null);

  const interpretation = policy?.frozenManifestInterpretation;
  if (
    interpretation?.sourceManifestExpectedFilePathRole !== 'FROZEN_SOURCE_IDENTITY_LOCATOR' ||
    interpretation?.sourceManifestWebAssetPathRole !== 'FROZEN_SOURCE_PNG_LOCATOR_NOT_RUNTIME_DELIVERY' ||
    interpretation?.webManifestSourcePngFilePathRole !== 'FROZEN_WEBP_CONVERSION_INPUT_LOCATOR' ||
    interpretation?.webManifestSourcePngPathRole !== 'FROZEN_SOURCE_PNG_LOCATOR_NOT_RUNTIME_FALLBACK' ||
    interpretation?.webManifestPngAuthoritativeSourceRetainedFieldRole !== 'PRE_H5_ADMISSION_RETENTION_STATE' ||
    interpretation?.webManifestPngAuthoritativeSourceRetainedFieldIsCurrentRetentionAuthority !== false ||
    interpretation?.sourceRecordIdentityAndSha256RemainAuthoritative !== true
  ) fail('H5 frozen-manifest interpretation drift');

  const production = policy?.productionPolicy;
  if (
    production?.runtimeFetchesExternalSourcePack !== false ||
    production?.runtimeUsesLosslessWebp !== true ||
    production?.productionWebDeliveryFormat !== h2.productionPolicy.productionWebDeliveryFormat ||
    production?.productionWebDeliveryCount !== h2.productionPolicy.productionWebDeliveryCount ||
    production?.productionWebDeliveryBytes !== h2.productionPolicy.productionWebDeliveryBytes ||
    production?.productionWebPathPattern !== '/images/heroes/card-icons-webp/{id}.webp' ||
    production?.sourcePngRuntimeFallbackEnabled !== false ||
    production?.remoteRuntimeHotlinkEnabled !== false ||
    production?.runtimePathChange !== false ||
    production?.webpReencodingInThisStage !== false ||
    production?.detailCardArtworkChange !== false
  ) fail('H5 production policy drift', production ?? null);

  if (
    policy?.semanticBoundary?.canonicalHeroChanges !== false ||
    policy?.semanticBoundary?.heroRelationChanges !== false ||
    policy?.semanticBoundary?.localizationChanges !== false ||
    policy?.semanticBoundary?.nameJoinIntroduced !== false ||
    policy?.semanticBoundary?.idArithmeticIntroduced !== false ||
    policy?.semanticBoundary?.filenameSimilarityIntroduced !== false ||
    policy?.semanticBoundary?.sourceMeaningReinterpreted !== false ||
    policy?.semanticBoundary?.semanticRecomputationAllowed !== false ||
    policy?.nextOwner !== 'hero-card-icon-source-pack-assets' ||
    policy?.nextStage !== 'H6-delete-tracked-source-png'
  ) fail('H5 semantic/handoff boundary drift');

  const currentSource = readJson(policy.authority.sourceIdentityManifest);
  const currentDelivery = readJson(policy.authority.productionWebDeliveryManifest);
  if (
    currentSource?.status !== 'PASS' ||
    currentSource?.completion !== 'COMPLETE' ||
    currentSource?.freezeState !== policy.authority.sourceIdentityFreezeState ||
    currentSource?.summary?.heroCount !== 267 ||
    currentSource?.summary?.fileCount !== 267 ||
    currentSource?.records?.length !== 267
  ) fail('current frozen source identity manifest drift');

  if (
    currentDelivery?.status !== 'PASS' ||
    currentDelivery?.completion !== 'COMPLETE' ||
    currentDelivery?.freezeState !== policy.authority.productionWebDeliveryFreezeState ||
    currentDelivery?.sourceManifest !== policy.authority.sourceIdentityManifest ||
    currentDelivery?.sourceFreezeState !== policy.authority.sourceIdentityFreezeState ||
    currentDelivery?.sourcePolicy?.pngAuthoritativeSourceRetained !== true ||
    currentDelivery?.sourcePolicy?.webDeliveryFormat !== 'LOSSLESS_WEBP' ||
    currentDelivery?.sourcePolicy?.semanticRelationReopened !== false ||
    currentDelivery?.sourcePolicy?.remoteRuntimeHotlink !== false ||
    currentDelivery?.summary?.sourcePngCount !== 267 ||
    currentDelivery?.summary?.sourcePngTotalBytes !== 8990485 ||
    currentDelivery?.summary?.webDeliveryCount !== 267 ||
    currentDelivery?.summary?.webDeliveryTotalBytes !== 5772910 ||
    currentDelivery?.records?.length !== 267
  ) fail('current frozen WebP delivery manifest drift');
}

function loadFrozenExpected(h2) {
  const predecessor = h2.authoritativePredecessor;
  try {
    git('cat-file', '-e', `${predecessor.sourceCommitSha}^{commit}`);
  } catch {
    fail('pinned source commit unavailable; full history required', predecessor.sourceCommitSha);
  }

  const source = JSON.parse(git('show', `${predecessor.sourceCommitSha}:${predecessor.sourceManifest}`));
  if (
    source?.version !== 1 ||
    source?.status !== 'PASS' ||
    source?.completion !== 'COMPLETE' ||
    source?.freezeState !== predecessor.sourceFreezeState ||
    source?.source?.localAssetRoot !== predecessor.sourcePublicPath
  ) fail('pinned source manifest drift');

  const records = Array.isArray(source?.records) ? source.records : [];
  if (records.length !== 267) fail('pinned source record count drift', records.length);

  const expected = new Map();
  let totalBytes = 0;
  for (const record of records) {
    const fileName = `${record?.heroId}.png`;
    if (
      !Number.isInteger(record?.heroId) ||
      record?.expectedFilePath !== `${predecessor.sourcePublicPath}/${fileName}` ||
      expected.has(fileName)
    ) fail('invalid pinned Hero ID/source filename binding', record ?? null);
    assertPositiveInt(record.byteLength, `${fileName} byteLength`);
    assertSha256(record.sha256, `${fileName} sha256`);
    expected.set(fileName, { heroId: record.heroId, byteLength: record.byteLength, sha256: record.sha256 });
    totalBytes += record.byteLength;
  }
  if (totalBytes !== 8990485) fail('pinned source byte total drift', totalBytes);
  return expected;
}

function hydrateAndVerify(h2, expected) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-card-icon-owner-'));
  const target = path.join(tempRoot, 'hydrated');
  try {
    execFileSync(process.execPath, [path.join(ROOT, HYDRATOR), '--target-dir', target], {
      cwd: ROOT,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    const entries = fs.readdirSync(target, { withFileTypes: true });
    if (entries.some((entry) => !entry.isFile())) fail('hydrated target contains non-file entries');
    const actual = entries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const wanted = [...expected.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail('hydrated exact file set mismatch');

    let totalBytes = 0;
    for (const [fileName, frozen] of expected) {
      const bytes = fs.readFileSync(path.join(target, fileName));
      if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) fail('hydrated file is not PNG', fileName);
      const digest = sha256(bytes);
      if (bytes.length !== frozen.byteLength || digest !== frozen.sha256) {
        fail('hydrated exact-byte parity mismatch', {
          heroId: frozen.heroId,
          fileName,
          expectedBytes: frozen.byteLength,
          actualBytes: bytes.length,
          expectedSha256: frozen.sha256,
          actualSha256: digest,
        });
      }
      totalBytes += bytes.length;
    }
    if (totalBytes !== h2.coverage.totalSourceBytes) fail('hydrated total byte mismatch', totalBytes);
    return { fileCount: actual.length, totalBytes };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  const h2 = readJson(SOURCE_PACK_CONTRACT);
  validateH2(h2);
  const h5 = readJson(H5_POLICY_CONTRACT);
  validateH5(h5, h2);
  const expected = loadFrozenExpected(h2);
  const verified = hydrateAndVerify(h2, expected);

  console.log('HERO CARD ICON SOURCE PACK OWNER VALIDATOR: PASS');
  console.log(JSON.stringify({
    sourcePackContract: SOURCE_PACK_CONTRACT,
    runtimePolicyContract: H5_POLICY_CONTRACT,
    sourceCommitSha: h2.authoritativePredecessor.sourceCommitSha,
    releaseTag: h2.storage.releaseTag,
    fileCount: verified.fileCount,
    totalBytes: verified.totalBytes,
    exactByteParity: true,
    currentSourceByteTransport: h5.authority.currentRepositorySourceByteTransport,
    repositoryTrackedSourcePngRequired: false,
    runtimeFetchesExternalSourcePack: false,
    productionWebDeliveryFormat: 'LOSSLESS_WEBP',
    productionWebDeliveryBytes: 5772910,
    semanticRecomputation: false,
    canonicalHeroChanges: false,
    heroRelationChanges: false,
    detailCardArtworkChanged: false,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`HERO CARD ICON SOURCE PACK OWNER VALIDATOR: FAIL - ${error.message}`);
  if (error.detail !== undefined && error.detail !== null) console.error(JSON.stringify(error.detail, null, 2));
  process.exitCode = 1;
}
