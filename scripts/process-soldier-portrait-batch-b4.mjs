import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LOCATOR = 'data/contracts/soldier-portrait-assets-current.v1.json';
const HYDRATOR = 'scripts/hydrate-soldier-portrait-source-pack-v1.mjs';
const IMAGE_HELPER = 'scripts/inspect-soldier-portrait-image-b4.py';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function fail(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  throw error;
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function readJson(value) {
  return JSON.parse(fs.readFileSync(resolvePath(value), 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b, 'en'));
}

function sortedIds(values) {
  if (!Array.isArray(values) || values.some((value) => !Number.isInteger(value))) fail('invalid-id-list', values ?? null);
  const result = [...new Set(values)].sort((a, b) => a - b);
  if (result.length !== values.length) fail('duplicate-id-list', values);
  return result;
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getBatchState(batch) {
  return {
    status: batch?.status,
    newIds: sortedIds(batch?.newIds ?? batch?.result?.newIds ?? []),
    removedIds: sortedIds(batch?.removedIds ?? batch?.result?.removedIds ?? []),
  };
}

function ensureEmptyOutput(directory) {
  if (fs.existsSync(directory)) {
    const entries = fs.readdirSync(directory);
    if (entries.length > 0) fail('output-directory-not-empty', { directory, entries: entries.slice(0, 10) });
  } else {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function exactFileNames(directory, expected, extension = null) {
  const actual = sorted(fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (!extension || entry.name.toLowerCase().endsWith(extension)))
    .map((entry) => entry.name));
  const wanted = sorted(expected);
  if (!exactJson(actual, wanted)) {
    fail('file-set-mismatch', {
      directory,
      expectedCount: wanted.length,
      actualCount: actual.length,
      missing: wanted.filter((name) => !actual.includes(name)).slice(0, 20),
      extra: actual.filter((name) => !wanted.includes(name)).slice(0, 20),
    });
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    ...options,
  });
  if (result.error || result.status !== 0) {
    fail('command-failed', {
      command,
      args,
      status: result.status,
      error: result.error?.message ?? null,
      stdout: result.stdout ?? null,
      stderr: result.stderr ?? null,
    });
  }
  return result;
}

function inspectPng(filePath, gate) {
  const helper = resolvePath(IMAGE_HELPER);
  const result = run('python3', [helper, 'inspect', filePath]);
  const inspection = JSON.parse(result.stdout.trim());
  if (inspection.format !== 'PNG') fail('source-format-invalid', { filePath, inspection });
  if (gate?.sourceMustContainAlpha === true && inspection.sourceHasAlpha !== true) fail('source-alpha-missing', filePath);
  if (inspection.transparentPixelRatio < gate.minimumTransparentPixelRatio) fail('source-transparency-ratio', { filePath, inspection, gate });
  if (inspection.borderTransparentPixelRatio < gate.minimumBorderTransparentPixelRatio) fail('source-border-transparency-ratio', { filePath, inspection, gate });
  if (inspection.transparentCornerCount < gate.requiredTransparentCorners) fail('source-transparent-corners', { filePath, inspection, gate });
  return inspection;
}

function compareLossless(pngPath, webpPath) {
  const helper = resolvePath(IMAGE_HELPER);
  const result = run('python3', [helper, 'compare', pngPath, webpPath]);
  const comparison = JSON.parse(result.stdout.trim());
  if (comparison.decodedPixelExact !== true || comparison.dimensionsPreserved !== true) {
    fail('webp-decoded-pixel-parity', { pngPath, webpPath, comparison });
  }
  return comparison;
}

function validateLocator(locator) {
  if (
    locator?.schemaId !== 'soldier-portrait-assets-current/v1' ||
    locator?.status !== 'CURRENT' ||
    locator?.owner !== 'soldier-assets' ||
    locator?.role?.semanticAuthority !== false ||
    locator?.role?.operationalLocatorOnly !== true ||
    locator?.boundaries?.semanticRecomputationCount !== 0 ||
    locator?.boundaries?.nameJoinInference !== false ||
    locator?.boundaries?.idArithmeticInference !== false ||
    locator?.boundaries?.filenameSimilarityInference !== false ||
    locator?.boundaries?.versionNumberDiscovery !== false ||
    locator?.boundaries?.assetByteMutation !== false
  ) {
    fail('current-locator-boundary', locator ?? null);
  }
}

function validateResolution(resolution, expectedIds, intakeDir, mode) {
  if (
    resolution?.schemaId !== 'soldier-portrait-b4-intake-resolution/v1' ||
    resolution?.status !== 'RESOLVED' ||
    resolution?.boundaries?.semanticAuthority !== false ||
    resolution?.boundaries?.explicitIdBindingOnly !== true ||
    resolution?.boundaries?.nameJoin !== false ||
    resolution?.boundaries?.idArithmetic !== false ||
    resolution?.boundaries?.filenameSimilarity !== false ||
    resolution?.boundaries?.existingAssetRedownload !== false
  ) {
    fail('intake-resolution-boundary', resolution ?? null);
  }
  if (resolution.mode !== mode.toUpperCase()) fail('intake-resolution-mode', { expected: mode, actual: resolution.mode });
  if (mode === 'fixture' && resolution.fixtureOnly !== true) fail('fixture-resolution-boundary');
  if (mode === 'production' && resolution.fixtureOnly === true) fail('production-resolution-is-fixture');

  const records = Array.isArray(resolution.records) ? resolution.records : [];
  const ids = sortedIds(records.map((record) => record?.soldierId));
  if (!exactJson(ids, expectedIds) || !exactJson(sortedIds(resolution.expectedIds ?? []), expectedIds)) {
    fail('intake-resolution-id-set', { expectedIds, ids, declared: resolution.expectedIds ?? null });
  }

  exactFileNames(intakeDir, expectedIds.map((id) => `${id}.png`), '.png');
  for (const record of records) {
    const id = record.soldierId;
    if (record.intakeFileName !== `${id}.png` || record.fileName !== `${id}.png`) fail('intake-file-binding', record);
    const filePath = path.join(intakeDir, record.intakeFileName);
    const bytes = fs.readFileSync(filePath);
    if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) fail('intake-png-signature', id);
    if (bytes.length !== record.size) fail('intake-byte-size', { id, expected: record.size, actual: bytes.length });
    if (sha256(bytes) !== record.sha256) fail('intake-byte-sha256', id);
  }
  return records;
}

function copyExactFiles(sourceDir, destinationDir, names) {
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const name of names) {
    fs.copyFileSync(path.join(sourceDir, name), path.join(destinationDir, name), fs.constants.COPYFILE_EXCL);
  }
}

function createCandidateArchive(sourceDir, archivePath, names) {
  run('tar', ['-czf', archivePath, '-C', sourceDir, ...names]);
  const bytes = fs.readFileSync(archivePath);
  return { fileName: path.basename(archivePath), bytes: bytes.length, sha256: sha256(bytes) };
}

export async function processBatch({ mode, batch, resolution, intakeDir, outputDir, locatorPath = DEFAULT_LOCATOR }) {
  if (!['fixture', 'production'].includes(mode)) fail('invalid-mode', mode);
  const locator = readJson(locatorPath);
  validateLocator(locator);

  const batchState = getBatchState(batch);
  if (batchState.removedIds.length > 0) fail('removed-ids-blocker', batchState.removedIds);
  if (batchState.status !== 'BATCH_READY' || batchState.newIds.length === 0) fail('batch-not-ready', batchState);
  if (mode === 'fixture' && batch?.fixtureOnly !== true) fail('fixture-batch-boundary');
  if (mode === 'production' && batch?.fixtureOnly === true) fail('production-batch-is-fixture');

  const sourceManifest = readJson(locator.currentSourceManifest);
  const sourcePackContract = readJson(locator.currentSourcePackContract);
  const webManifest = readJson(locator.currentWebManifest);
  if (sourceManifest?.status !== 'PASS' || sourceManifest?.assetsReady !== true) fail('current-source-manifest-not-admitted');
  if (webManifest?.status !== 'PASS' || webManifest?.assetsReady !== true) fail('current-web-manifest-not-admitted');
  if (webManifest?.sourceManifest !== locator.currentSourceManifest) fail('current-web-source-pointer-drift');
  if (sourcePackContract?.authority?.semanticAndSourceIdentity !== locator.currentSourceManifest) fail('current-source-pack-pointer-drift');

  const baseSourceIds = sortedIds((sourceManifest.records ?? []).map((record) => record?.soldierId));
  const baseWebIds = sortedIds((webManifest.records ?? []).map((record) => record?.soldierId));
  if (!exactJson(baseSourceIds, baseWebIds)) fail('base-source-web-id-parity');
  if (batchState.newIds.some((id) => baseSourceIds.includes(id))) fail('batch-id-already-admitted', batchState.newIds.filter((id) => baseSourceIds.includes(id)));

  const intake = resolvePath(intakeDir);
  const resolutionRecords = validateResolution(resolution, batchState.newIds, intake, mode);
  const gate = sourceManifest?.policy?.transparencyGate;
  if (!gate || gate.sourceMustBePng !== true) fail('transparency-gate-missing', gate ?? null);

  const newSourceRecords = [];
  for (const record of resolutionRecords) {
    const filePath = path.join(intake, `${record.soldierId}.png`);
    const inspection = inspectPng(filePath, gate);
    newSourceRecords.push({
      soldierId: record.soldierId,
      sourceKind: record.sourceKind,
      sourceFileName: record.sourceFileName,
      sourceUrl: record.sourceUrl ?? null,
      fileName: `${record.soldierId}.png`,
      resolutionMethod: record.resolutionMethod,
      size: record.size,
      sha256: record.sha256,
      width: inspection.width,
      height: inspection.height,
      sourceHasAlpha: inspection.sourceHasAlpha,
      transparentPixelRatio: inspection.transparentPixelRatio,
      borderTransparentPixelRatio: inspection.borderTransparentPixelRatio,
      transparentCornerCount: inspection.transparentCornerCount,
      fixtureOnly: mode === 'fixture',
    });
  }

  const output = resolvePath(outputDir);
  ensureEmptyOutput(output);
  const previousSourceDir = path.join(output, 'previous-source');
  const nextSourceDir = path.join(output, 'next-source');
  const nextWebDir = path.join(output, 'next-web');
  const metaDir = path.join(output, 'meta');
  fs.mkdirSync(metaDir, { recursive: true });

  const hydrator = resolvePath(HYDRATOR);
  run(process.execPath, [hydrator, '--contract', locator.currentSourcePackContract, '--hydrate-dir', previousSourceDir], { stdio: 'inherit' });
  const baseSourceNames = sourceManifest.records.map((record) => record.fileName);
  exactFileNames(previousSourceDir, baseSourceNames, '.png');
  copyExactFiles(previousSourceDir, nextSourceDir, baseSourceNames);
  copyExactFiles(intake, nextSourceDir, batchState.newIds.map((id) => `${id}.png`));

  const currentWebDir = path.join(ROOT, 'public', webManifest.publicRoot);
  const baseWebNames = webManifest.records.map((record) => record.fileName);
  exactFileNames(currentWebDir, baseWebNames, '.webp');
  copyExactFiles(currentWebDir, nextWebDir, baseWebNames);

  const newWebRecords = [];
  for (const sourceRecord of newSourceRecords) {
    const id = sourceRecord.soldierId;
    const pngPath = path.join(intake, `${id}.png`);
    const webpPath = path.join(nextWebDir, `${id}.webp`);
    run('cwebp', ['-quiet', '-lossless', '-m', '6', pngPath, '-o', webpPath]);
    const comparison = compareLossless(pngPath, webpPath);
    const bytes = fs.readFileSync(webpPath);
    newWebRecords.push({
      soldierId: id,
      fileName: `${id}.webp`,
      sourceKind: mode === 'fixture' ? 'B4_FIXTURE_LOSSLESS_WEBP' : 'DERIVED_WEBP_LOSSLESS_FROM_CURRENT_PNG',
      resolutionMethod: 'LOSSLESS_WEBP_PIXEL_EXACT_FROM_ADMITTED_PNG',
      sourcePngFileName: `${id}.png`,
      sourcePngSha256: sourceRecord.sha256,
      sha256: sha256(bytes),
      size: bytes.length,
      width: sourceRecord.width,
      height: sourceRecord.height,
      decodedPixelExact: comparison.decodedPixelExact,
      fixtureOnly: mode === 'fixture',
    });
  }

  const nextSourceNames = [...baseSourceNames, ...batchState.newIds.map((id) => `${id}.png`)];
  const nextWebNames = [...baseWebNames, ...batchState.newIds.map((id) => `${id}.webp`)];
  exactFileNames(nextSourceDir, nextSourceNames, '.png');
  exactFileNames(nextWebDir, nextWebNames, '.webp');

  const candidateSourceManifest = {
    version: 1,
    schemaId: 'soldier-portrait-b4-source-manifest-candidate/v1',
    status: mode === 'fixture' ? 'FIXTURE_CANDIDATE' : 'CANDIDATE',
    fixtureOnly: mode === 'fixture',
    predecessor: locator.currentSourceManifest,
    records: [...sourceManifest.records, ...newSourceRecords],
    coverage: {
      predecessorCount: sourceManifest.records.length,
      newCount: newSourceRecords.length,
      candidateCount: sourceManifest.records.length + newSourceRecords.length,
    },
    boundaries: {
      semanticAuthority: false,
      canonicalPopulationRecomputed: false,
      oldSourceBytesHydratedFromPinnedPack: true,
      oldSourceBytesRedownloaded: false,
    },
  };
  writeJson(path.join(metaDir, 'source-manifest-candidate.json'), candidateSourceManifest);

  const candidateWebManifest = {
    version: 1,
    schemaId: 'soldier-portrait-b4-web-manifest-candidate/v1',
    status: mode === 'fixture' ? 'FIXTURE_CANDIDATE' : 'CANDIDATE',
    fixtureOnly: mode === 'fixture',
    predecessor: locator.currentWebManifest,
    sourceManifestCandidate: 'source-manifest-candidate.json',
    publicRoot: webManifest.publicRoot,
    records: [...webManifest.records, ...newWebRecords],
    coverage: {
      reusedWebpCount: webManifest.records.length,
      newWebpCount: newWebRecords.length,
      candidateWebpCount: webManifest.records.length + newWebRecords.length,
    },
    policy: {
      oldWebpReencoded: false,
      newWebpOnlyConversion: true,
      webpMode: 'lossless',
      decodedPixelExact: true,
    },
  };
  writeJson(path.join(metaDir, 'web-manifest-candidate.json'), candidateWebManifest);

  const inventoryRecords = [];
  let candidateSourceBytes = 0;
  for (const record of candidateSourceManifest.records) {
    const filePath = path.join(nextSourceDir, record.fileName);
    const bytes = fs.readFileSync(filePath);
    const item = {
      soldierId: record.soldierId,
      fileName: record.fileName,
      size: bytes.length,
      sha256: sha256(bytes),
      fixtureOnly: record.fixtureOnly === true,
    };
    candidateSourceBytes += bytes.length;
    inventoryRecords.push(item);
  }
  const inventory = {
    version: 1,
    schemaId: 'soldier-portrait-b4-source-pack-inventory-candidate/v1',
    status: mode === 'fixture' ? 'FIXTURE_CANDIDATE' : 'CANDIDATE',
    fixtureOnly: mode === 'fixture',
    predecessorContract: locator.currentSourcePackContract,
    coverage: { fileCount: inventoryRecords.length, totalBytes: candidateSourceBytes },
    records: inventoryRecords,
    policy: { exactBytesOnly: true, noReencoding: true, noNameJoin: true, noIdArithmetic: true },
  };
  const inventoryPath = path.join(metaDir, 'source-pack-inventory-candidate.json');
  writeJson(inventoryPath, inventory);

  const archivePath = path.join(metaDir, 'source-pack-candidate.tar.gz');
  const archive = createCandidateArchive(nextSourceDir, archivePath, sorted(nextSourceNames));
  const inventoryBytes = fs.readFileSync(inventoryPath);
  const checksums = `${archive.sha256}  ${archive.fileName}\n${sha256(inventoryBytes)}  ${path.basename(inventoryPath)}\n`;
  fs.writeFileSync(path.join(metaDir, 'source-pack-candidate.sha256'), checksums, { flag: 'wx' });

  const candidateContract = {
    version: 1,
    schemaId: 'soldier-portrait-b4-source-pack-candidate/v1',
    status: mode === 'fixture' ? 'FIXTURE_CANDIDATE' : 'CANDIDATE',
    fixtureOnly: mode === 'fixture',
    owner: 'soldier-assets',
    predecessorContract: locator.currentSourcePackContract,
    coverage: { fileCount: inventoryRecords.length, totalSourceBytes: candidateSourceBytes },
    storageCandidate: {
      archive,
      inventory: { fileName: path.basename(inventoryPath), bytes: inventoryBytes.length, sha256: sha256(inventoryBytes) },
      checksums: { fileName: 'source-pack-candidate.sha256' },
    },
    promotionPolicy: {
      releaseAssetOverwriteAllowed: false,
      currentLocatorMutationAllowedInB4: false,
      productionAdmissionAllowedForFixture: false,
      newTagAndContractRequiredForChangedBytes: true,
    },
    semanticBoundary: {
      semanticAuthority: false,
      canonicalSoldierChanges: false,
      heroSoldierRelationChanges: false,
      nameJoinIntroduced: false,
      idArithmeticIntroduced: false,
      sourceMeaningReinterpreted: false,
    },
  };
  writeJson(path.join(metaDir, 'source-pack-candidate-contract.json'), candidateContract);

  const summary = {
    version: 1,
    schemaId: 'soldier-portrait-b4-batch-result/v1',
    status: 'PASS',
    mode: mode.toUpperCase(),
    fixtureOnly: mode === 'fixture',
    baseSourceCount: sourceManifest.records.length,
    hydratedPreviousSourceCount: baseSourceNames.length,
    newSourceCount: newSourceRecords.length,
    candidateSourceCount: nextSourceNames.length,
    reusedWebpCount: baseWebNames.length,
    generatedWebpIds: batchState.newIds,
    candidateWebpCount: nextWebNames.length,
    productionLocatorChanged: false,
    productionWebCurrentChanged: false,
    repositoryAssetBytesChanged: false,
    boundaries: {
      semanticAuthority: false,
      oldPngRedownloaded: false,
      oldWebpReencoded: false,
      newOnlyWebpConversion: true,
    },
  };
  writeJson(path.join(output, 'result.json'), summary);
  return summary;
}

async function main() {
  const mode = arg('--mode');
  const batchPath = arg('--batch');
  const resolutionPath = arg('--resolution');
  const intakeDir = arg('--intake-dir');
  const outputDir = arg('--output-dir');
  const locatorPath = arg('--locator', DEFAULT_LOCATOR);
  if (!mode || !batchPath || !resolutionPath || !intakeDir || !outputDir) {
    fail('usage', 'node scripts/process-soldier-portrait-batch-b4.mjs --mode <fixture|production> --batch <json> --resolution <json> --intake-dir <dir> --output-dir <empty-dir> [--locator <json>]');
  }
  const result = await processBatch({
    mode,
    batch: readJson(batchPath),
    resolution: readJson(resolutionPath),
    intakeDir,
    outputDir,
    locatorPath,
  });
  console.log('SOLDIER PORTRAIT B4 BATCH PROCESSOR: PASS');
  console.log(JSON.stringify(result, null, 2));
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error('SOLDIER PORTRAIT B4 BATCH PROCESSOR: BLOCKER');
    console.error(JSON.stringify({ code: error.code ?? error.message, detail: error.detail ?? null }, null, 2));
    process.exitCode = 1;
  });
}
