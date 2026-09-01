import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = 'data/contracts/hero-card-icon-source-pack.v1.json';
const RUNTIME_POLICY_PATH = 'data/contracts/hero-card-icon-source-pack-h5-runtime-policy.v1.json';
const HYDRATOR_PATH = 'scripts/hydrate-hero-card-icon-source-pack-v1.mjs';
const EXPECTED_OWNER = 'hero-assets';
const EXPECTED_STAGE = 'repository-size-reduction-H2';
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

function jsonAtCommit(commitSha, relativePath) {
  return JSON.parse(git('show', `${commitSha}:${relativePath}`));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function ensureSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`invalid ${label}`, value ?? null);
  }
}

function ensurePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) fail(`invalid ${label}`, value ?? null);
}

function validateContract(contract) {
  if (
    contract?.version !== 1 ||
    contract?.contract !== 'hero-card-icon-source-pack' ||
    contract?.status !== 'PASS' ||
    contract?.owner !== EXPECTED_OWNER ||
    contract?.stage !== EXPECTED_STAGE
  ) {
    fail('H2 source-pack contract is not an admitted PASS predecessor');
  }

  const predecessor = contract?.authoritativePredecessor;
  if (
    predecessor?.repository !== 'LuceatLuxVestra42/langrisser-future-guide' ||
    typeof predecessor?.sourceManifest !== 'string' ||
    typeof predecessor?.webDeliveryManifest !== 'string' ||
    typeof predecessor?.sourcePublicPath !== 'string' ||
    !/^[a-f0-9]{40}$/.test(predecessor?.sourceCommitSha ?? '')
  ) {
    fail('invalid H2 authoritative predecessor binding', predecessor ?? null);
  }

  const coverage = contract?.coverage;
  ensurePositiveInteger(coverage?.fileCount, 'coverage.fileCount');
  ensurePositiveInteger(coverage?.totalSourceBytes, 'coverage.totalSourceBytes');
  if (
    coverage?.heroCount !== coverage.fileCount ||
    coverage?.missingCount !== 0 ||
    coverage?.extraCount !== 0 ||
    coverage?.duplicateCount !== 0
  ) {
    fail('H2 exact coverage contract drift', coverage ?? null);
  }

  for (const key of ['archive', 'inventory', 'checksums']) {
    ensurePositiveInteger(contract?.storage?.[key]?.assetId, `storage.${key}.assetId`);
    ensurePositiveInteger(contract?.storage?.[key]?.bytes, `storage.${key}.bytes`);
    ensureSha256(contract?.storage?.[key]?.sha256, `storage.${key}.sha256`);
  }

  if (
    contract?.storage?.kind !== 'GITHUB_RELEASE_ASSET' ||
    contract?.storage?.immutabilityPolicy !== 'CONTENT_HASH_PINNED_FAIL_CLOSED' ||
    contract?.integrityPolicy?.exactFileSetRequired !== true ||
    contract?.integrityPolicy?.perFileSha256MustMatchFrozenSourceManifest !== true ||
    contract?.integrityPolicy?.perFileSizeMustMatchFrozenSourceManifest !== true ||
    contract?.integrityPolicy?.heroIdToFileNameMustRemainExact !== true ||
    contract?.integrityPolicy?.failClosedOnAnyMismatch !== true
  ) {
    fail('H2 source-pack integrity boundary drift');
  }

  if (
    contract?.productionPolicy?.sourcePackFetchedAtRuntime !== false ||
    contract?.productionPolicy?.productionWebDeliveryFormat !== 'LOSSLESS_WEBP' ||
    contract?.productionPolicy?.runtimePathChange !== false ||
    contract?.productionPolicy?.webpReencodingInThisStage !== false ||
    contract?.productionPolicy?.detailCardArtworkChange !== false
  ) {
    fail('H2 production boundary drift');
  }

  if (
    contract?.semanticBoundary?.canonicalHeroChanges !== false ||
    contract?.semanticBoundary?.heroRelationChanges !== false ||
    contract?.semanticBoundary?.localizationChanges !== false ||
    contract?.semanticBoundary?.nameJoinIntroduced !== false ||
    contract?.semanticBoundary?.idArithmeticIntroduced !== false ||
    contract?.semanticBoundary?.filenameSimilarityIntroduced !== false ||
    contract?.semanticBoundary?.sourceMeaningReinterpreted !== false
  ) {
    fail('H2 semantic boundary drift');
  }
}

function validateRuntimePolicy(policy, contract) {
  if (
    policy?.version !== 1 ||
    policy?.contract !== 'hero-card-icon-source-pack-runtime-policy' ||
    policy?.status !== 'PASS' ||
    policy?.owner !== 'hero-card-icon-source-pack-assets' ||
    policy?.stage !== 'repository-size-reduction-H5'
  ) {
    fail('H5 runtime/source transport policy is not admitted');
  }

  if (
    policy?.authority?.sourceIdentityManifest !== contract.authority.semanticAndSourceIdentity ||
    policy?.authority?.sourceIdentityFreezeState !== contract.authoritativePredecessor.sourceFreezeState ||
    policy?.authority?.externalSourceTransportContract !== CONTRACT_PATH ||
    policy?.authority?.productionWebDeliveryManifest !== contract.authority.productionWebDelivery ||
    policy?.authority?.productionWebDeliveryFreezeState !== contract.authoritativePredecessor.webDeliveryFreezeState ||
    policy?.authority?.currentRepositorySourceByteTransport !== 'EXTERNAL_EXACT_BYTE_SOURCE_PACK' ||
    policy?.authority?.frozenManifestPathMetadataCreatesCurrentRetentionRequirement !== false
  ) {
    fail('H5 authority boundary drift', policy?.authority ?? null);
  }

  const transport = policy?.sourceTransportPolicy;
  if (
    transport?.repositoryTrackedSourcePngRequired !== false ||
    transport?.sourcePackHydrationOnDemandAllowed !== true ||
    transport?.hydrator !== HYDRATOR_PATH ||
    transport?.sourcePackContract !== CONTRACT_PATH ||
    transport?.sourcePackStorageKind !== contract.storage.kind ||
    transport?.sourcePackIntegrityMode !== contract.storage.immutabilityPolicy ||
    transport?.expectedSourceFileCount !== contract.coverage.fileCount ||
    transport?.expectedSourceTotalBytes !== contract.coverage.totalSourceBytes ||
    transport?.sourcePngDeletionPerformedInThisStage !== false ||
    transport?.sourcePngDeletionDeferredToStage !== 'H6'
  ) {
    fail('H5 source transport policy drift', transport ?? null);
  }

  const interpretation = policy?.frozenManifestInterpretation;
  if (
    interpretation?.sourceManifestExpectedFilePathRole !== 'FROZEN_SOURCE_IDENTITY_LOCATOR' ||
    interpretation?.sourceManifestWebAssetPathRole !== 'FROZEN_SOURCE_PNG_LOCATOR_NOT_RUNTIME_DELIVERY' ||
    interpretation?.webManifestSourcePngFilePathRole !== 'FROZEN_WEBP_CONVERSION_INPUT_LOCATOR' ||
    interpretation?.webManifestSourcePngPathRole !== 'FROZEN_SOURCE_PNG_LOCATOR_NOT_RUNTIME_FALLBACK' ||
    interpretation?.webManifestPngAuthoritativeSourceRetainedFieldRole !== 'PRE_H5_ADMISSION_RETENTION_STATE' ||
    interpretation?.webManifestPngAuthoritativeSourceRetainedFieldIsCurrentRetentionAuthority !== false ||
    interpretation?.sourceRecordIdentityAndSha256RemainAuthoritative !== true
  ) {
    fail('H5 frozen manifest interpretation drift', interpretation ?? null);
  }

  const production = policy?.productionPolicy;
  if (
    production?.runtimeFetchesExternalSourcePack !== false ||
    production?.runtimeUsesLosslessWebp !== true ||
    production?.productionWebDeliveryFormat !== contract.productionPolicy.productionWebDeliveryFormat ||
    production?.productionWebDeliveryCount !== contract.productionPolicy.productionWebDeliveryCount ||
    production?.productionWebDeliveryBytes !== contract.productionPolicy.productionWebDeliveryBytes ||
    production?.productionWebPathPattern !== '/images/heroes/card-icons-webp/{id}.webp' ||
    production?.sourcePngRuntimeFallbackEnabled !== false ||
    production?.remoteRuntimeHotlinkEnabled !== false ||
    production?.runtimePathChange !== false ||
    production?.webpReencodingInThisStage !== false ||
    production?.detailCardArtworkChange !== false
  ) {
    fail('H5 production policy drift', production ?? null);
  }

  if (
    policy?.semanticBoundary?.canonicalHeroChanges !== false ||
    policy?.semanticBoundary?.heroRelationChanges !== false ||
    policy?.semanticBoundary?.localizationChanges !== false ||
    policy?.semanticBoundary?.nameJoinIntroduced !== false ||
    policy?.semanticBoundary?.idArithmeticIntroduced !== false ||
    policy?.semanticBoundary?.filenameSimilarityIntroduced !== false ||
    policy?.semanticBoundary?.sourceMeaningReinterpreted !== false ||
    policy?.semanticBoundary?.semanticRecomputationAllowed !== false
  ) {
    fail('H5 semantic boundary drift', policy?.semanticBoundary ?? null);
  }

  if (
    policy?.completion !== 'H5_POLICY_ADMITTED_PENDING_VALIDATION' ||
    policy?.nextOwner !== 'hero-card-icon-source-pack-assets' ||
    policy?.nextStage !== 'H6-delete-tracked-source-png'
  ) {
    fail('H5 handoff boundary drift');
  }

  const currentSource = readJson(policy.authority.sourceIdentityManifest);
  const currentDelivery = readJson(policy.authority.productionWebDeliveryManifest);
  if (
    currentSource?.version !== 1 ||
    currentSource?.status !== 'PASS' ||
    currentSource?.completion !== 'COMPLETE' ||
    currentSource?.freezeState !== policy.authority.sourceIdentityFreezeState ||
    currentSource?.summary?.heroCount !== contract.coverage.heroCount ||
    currentSource?.summary?.fileCount !== contract.coverage.fileCount ||
    currentSource?.records?.length !== contract.coverage.fileCount
  ) {
    fail('current frozen source identity manifest drift');
  }
  if (
    currentDelivery?.version !== 1 ||
    currentDelivery?.status !== 'PASS' ||
    currentDelivery?.completion !== 'COMPLETE' ||
    currentDelivery?.freezeState !== policy.authority.productionWebDeliveryFreezeState ||
    currentDelivery?.sourceManifest !== policy.authority.sourceIdentityManifest ||
    currentDelivery?.sourceFreezeState !== policy.authority.sourceIdentityFreezeState ||
    currentDelivery?.sourcePolicy?.pngAuthoritativeSourceRetained !== true ||
    currentDelivery?.sourcePolicy?.webDeliveryFormat !== production.productionWebDeliveryFormat ||
    currentDelivery?.sourcePolicy?.semanticRelationReopened !== false ||
    currentDelivery?.sourcePolicy?.remoteRuntimeHotlink !== false ||
    currentDelivery?.summary?.sourcePngCount !== contract.coverage.fileCount ||
    currentDelivery?.summary?.sourcePngTotalBytes !== contract.coverage.totalSourceBytes ||
    currentDelivery?.summary?.webDeliveryCount !== production.productionWebDeliveryCount ||
    currentDelivery?.summary?.webDeliveryTotalBytes !== production.productionWebDeliveryBytes ||
    currentDelivery?.records?.length !== production.productionWebDeliveryCount
  ) {
    fail('current frozen WebP delivery manifest drift');
  }
}

function loadFrozenExpectedRecords(contract) {
  const predecessor = contract.authoritativePredecessor;
  try {
    git('cat-file', '-e', `${predecessor.sourceCommitSha}^{commit}`);
  } catch {
    fail('pinned source commit is unavailable; full history is required', predecessor.sourceCommitSha);
  }

  const sourceManifest = jsonAtCommit(predecessor.sourceCommitSha, predecessor.sourceManifest);
  if (
    sourceManifest?.version !== predecessor.sourceManifestVersion ||
    sourceManifest?.status !== 'PASS' ||
    sourceManifest?.completion !== 'COMPLETE' ||
    sourceManifest?.freezeState !== predecessor.sourceFreezeState ||
    sourceManifest?.source?.localAssetRoot !== predecessor.sourcePublicPath
  ) {
    fail('pinned frozen source manifest drift');
  }

  const records = Array.isArray(sourceManifest?.records) ? sourceManifest.records : [];
  if (records.length !== contract.coverage.fileCount) {
    fail('pinned source manifest count mismatch', {
      expected: contract.coverage.fileCount,
      actual: records.length,
    });
  }

  const expected = new Map();
  let totalBytes = 0;
  for (const record of records) {
    const heroId = record?.heroId;
    const fileName = `${heroId}.png`;
    if (
      !Number.isInteger(heroId) ||
      record?.expectedFilePath !== `${predecessor.sourcePublicPath}/${fileName}` ||
      path.posix.basename(record.expectedFilePath) !== fileName
    ) {
      fail('invalid frozen Hero ID to source filename binding', record ?? null);
    }
    if (expected.has(fileName)) fail('duplicate frozen source filename', fileName);
    ensurePositiveInteger(record?.byteLength, `source ${fileName} byteLength`);
    ensureSha256(record?.sha256, `source ${fileName} sha256`);
    expected.set(fileName, {
      heroId,
      byteLength: record.byteLength,
      sha256: record.sha256,
    });
    totalBytes += record.byteLength;
  }

  if (totalBytes !== contract.coverage.totalSourceBytes) {
    fail('pinned source manifest total byte mismatch', {
      expected: contract.coverage.totalSourceBytes,
      actual: totalBytes,
    });
  }

  return expected;
}

function runHydrator(targetDir) {
  execFileSync(process.execPath, [path.join(ROOT, HYDRATOR_PATH), '--target-dir', targetDir], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function verifyHydratedTarget(targetDir, expected, contract) {
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    fail('hydrator did not create the expected target directory', targetDir);
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile())) {
    fail('hydrated target contains a non-file entry');
  }

  const actualNames = entries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const expectedNames = [...expected.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail('hydrated target exact file set mismatch', {
      missing: expectedNames.filter((name) => !actualNames.includes(name)),
      extra: actualNames.filter((name) => !expectedNames.includes(name)),
    });
  }

  let totalBytes = 0;
  for (const [fileName, frozen] of expected) {
    const bytes = fs.readFileSync(path.join(targetDir, fileName));
    if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      fail('hydrated source is not a PNG byte stream', fileName);
    }
    const digest = sha256(bytes);
    if (bytes.length !== frozen.byteLength || digest !== frozen.sha256) {
      fail('hydrated source differs from frozen exact bytes', {
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

  if (totalBytes !== contract.coverage.totalSourceBytes) {
    fail('hydrated total byte mismatch', {
      expected: contract.coverage.totalSourceBytes,
      actual: totalBytes,
    });
  }

  return { fileCount: actualNames.length, totalBytes };
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  validateContract(contract);
  const runtimePolicy = readJson(RUNTIME_POLICY_PATH);
  validateRuntimePolicy(runtimePolicy, contract);
  const expected = loadFrozenExpectedRecords(contract);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-card-icon-h4-owner-'));
  const targetDir = path.join(tempRoot, 'hydrated');

  try {
    runHydrator(targetDir);
    const verified = verifyHydratedTarget(targetDir, expected, contract);

    console.log('HERO CARD ICON SOURCE PACK OWNER VALIDATOR: PASS');
    console.log(JSON.stringify({
      sourcePackContract: CONTRACT_PATH,
      runtimePolicy: RUNTIME_POLICY_PATH,
      hydrator: HYDRATOR_PATH,
      sourceCommitSha: contract.authoritativePredecessor.sourceCommitSha,
      releaseTag: contract.storage.releaseTag,
      fileCount: verified.fileCount,
      totalBytes: verified.totalBytes,
      archiveSha256: contract.storage.archive.sha256,
      inventorySha256: contract.storage.inventory.sha256,
      checksumsSha256: contract.storage.checksums.sha256,
      exactByteParity: true,
      repositoryTrackedSourcePngRequired: false,
      currentSourceByteTransport: runtimePolicy.authority.currentRepositorySourceByteTransport,
      runtimeFetchesExternalSourcePack: false,
      productionWebDeliveryFormat: runtimePolicy.productionPolicy.productionWebDeliveryFormat,
      semanticRecomputation: false,
      canonicalHeroChanges: false,
      heroRelationChanges: false,
      productionWebpChanged: false,
      detailCardArtworkChanged: false,
    }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`HERO CARD ICON SOURCE PACK OWNER VALIDATOR: FAIL - ${error.message}`);
  if (error.detail !== undefined && error.detail !== null) {
    console.error(JSON.stringify(error.detail, null, 2));
  }
  process.exitCode = 1;
}
