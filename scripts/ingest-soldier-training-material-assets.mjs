import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildEvidence,
  resolveExpectedLocator,
  scanAssetRoot,
  stableInventoryJson,
} from '../tools/asset-intake/core/engine-v1.mjs';

const SOURCE_MANIFEST = 'data/source/soldier-training-material-drive-evidence.v1.json';
const DEFAULT_STAGING_ROOT = '.asset-intake/soldier-training-material-drive';
const SOURCE_PUBLIC_ROOT = 'public/images/soldier-training-materials-source';
const INVENTORY_OUT = 'data/generated/soldier-training-material-asset-inventory.v1.json';
const CONTRACT_OUT = 'data/generated/soldier-training-material-asset-intake.v1.json';
const VALIDATION_OUT = 'data/validation/soldier-training-material-asset-intake.v1.json';
const CHECKPOINT_OUT = 'docs/checkpoints/soldier-training-material-asset-intake.md';

const args = new Set(process.argv.slice(2));
const download = args.has('--download');
const publish = args.has('--publish');
const rootArgIndex = process.argv.indexOf('--root');
const stagingRoot = rootArgIndex >= 0 ? process.argv[rootArgIndex + 1] : DEFAULT_STAGING_ROOT;

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isPng = (bytes) => bytes.length >= 8 && bytes.subarray(0, 8).equals(pngSignature);

async function fetchDriveFile(record) {
  const urls = [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(record.driveFileId)}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(record.driveFileId)}`,
  ];
  const attempts = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const bytes = Buffer.from(await response.arrayBuffer());
      attempts.push({ url, status: response.status, contentType: response.headers.get('content-type'), byteSize: bytes.length, png: isPng(bytes) });
      if (response.ok && isPng(bytes)) return { bytes, attempts };
    } catch (error) {
      attempts.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new Error(`Drive download did not resolve PNG bytes for ${record.filename}: ${JSON.stringify(attempts)}`);
}

async function downloadCandidates(source) {
  await fs.rm(stagingRoot, { recursive: true, force: true });
  await fs.mkdir(stagingRoot, { recursive: true });
  const downloads = [];
  for (const record of source.records) {
    const { bytes, attempts } = await fetchDriveFile(record);
    if (bytes.length !== record.driveReportedSize) {
      throw new Error(`Drive size mismatch for ${record.filename}: expected ${record.driveReportedSize}, got ${bytes.length}`);
    }
    await fs.writeFile(path.join(stagingRoot, record.filename), bytes);
    downloads.push({ itemId: record.itemId, filename: record.filename, byteSize: bytes.length, attempts });
  }
  return downloads;
}

function validateSourceManifest(source) {
  const errors = [];
  if (source?.schemaId !== 'soldier-training-material-drive-evidence/v1') errors.push('unexpected source schemaId');
  if (!Array.isArray(source?.records) || source.records.length !== 24) errors.push(`expected 24 source records, got ${source?.records?.length ?? 'null'}`);
  const itemIds = new Set();
  const filenames = new Set();
  const driveFileIds = new Set();
  for (const record of source.records ?? []) {
    if (!Number.isInteger(record.itemId)) errors.push(`invalid itemId: ${record.itemId}`);
    if (itemIds.has(record.itemId)) errors.push(`duplicate itemId: ${record.itemId}`);
    itemIds.add(record.itemId);
    if (filenames.has(record.filename)) errors.push(`duplicate filename: ${record.filename}`);
    filenames.add(record.filename);
    if (driveFileIds.has(record.driveFileId)) errors.push(`duplicate Drive file ID: ${record.driveFileId}`);
    driveFileIds.add(record.driveFileId);
    const basename = path.posix.basename(record.iconPath);
    if (basename !== record.filename) errors.push(`icon basename mismatch for ${record.itemId}: ${basename} != ${record.filename}`);
    if (!record.filename.endsWith('.png')) errors.push(`non-PNG expected filename: ${record.filename}`);
  }
  return errors;
}

async function main() {
  const source = await readJson(SOURCE_MANIFEST);
  const sourceErrors = validateSourceManifest(source);
  if (sourceErrors.length) throw new Error(`source manifest validation failed: ${sourceErrors.join('; ')}`);

  let downloads = [];
  if (download) downloads = await downloadCandidates(source);

  const inventory = await scanAssetRoot(stagingRoot, {
    sourceArtifact: `gdrive-folder:${source.source.itemSubfolderId}`,
  });
  await fs.mkdir(path.dirname(INVENTORY_OUT), { recursive: true });
  await fs.writeFile(INVENTORY_OUT, stableInventoryJson(inventory));

  const inventoryByBasename = new Map(inventory.map((record) => [record.basename, record]));
  const resolutions = [];
  const contractRecords = [];
  const failures = [];

  for (const sourceRecord of source.records) {
    const locator = {
      assetRole: 'SOLDIER_TRAINING_MATERIAL_SOURCE_ICON',
      locatorKind: 'EXACT_FILENAME',
      value: sourceRecord.filename,
    };
    const resolution = resolveExpectedLocator(locator, inventory);
    const scanRecord = resolution.status === 'RESOLVED' ? resolution.matches[0] : null;
    const sizeMatch = scanRecord?.byteSize === sourceRecord.driveReportedSize;
    const signaturePass = scanRecord?.signature === 'PNG';
    const resolved = resolution.status === 'RESOLVED' && sizeMatch && signaturePass;

    if (!resolved) {
      failures.push({
        itemId: sourceRecord.itemId,
        filename: sourceRecord.filename,
        resolutionStatus: resolution.status,
        reason: resolution.reason,
        sizeMatch,
        signaturePass,
      });
    }

    const targetRepositoryPath = `${SOURCE_PUBLIC_ROOT}/${sourceRecord.filename}`;
    contractRecords.push({
      canonicalKey: { kind: 'ITEM_ID', value: sourceRecord.itemId },
      domainNativeStatus: resolved ? 'DRIVE_EXACT_FILENAME_ASSET_INTAKE_RESOLVED' : 'DRIVE_ASSET_INTAKE_PENDING',
      normalizedResolutionClass: resolved ? 'RESOLVED' : resolution.status === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'PENDING',
      expectedLocators: [locator],
      target: { repositoryPath: targetRepositoryPath },
      evidence: resolved ? [buildEvidence(scanRecord, 0)] : [],
    });

    resolutions.push({
      itemId: sourceRecord.itemId,
      name: sourceRecord.name,
      iconPath: sourceRecord.iconPath,
      filename: sourceRecord.filename,
      driveFileId: sourceRecord.driveFileId,
      driveReportedSize: sourceRecord.driveReportedSize,
      status: resolved ? 'RESOLVED' : resolution.status,
      reason: resolved ? 'EXACT_FILENAME_PNG_SIZE_VERIFIED' : resolution.reason,
      scannedByteSize: scanRecord?.byteSize ?? null,
      signature: scanRecord?.signature ?? null,
      width: scanRecord?.width ?? null,
      height: scanRecord?.height ?? null,
      sha256: scanRecord?.sha256 ?? null,
      targetRepositoryPath,
    });
  }

  const unexpectedFiles = inventory.filter((record) => !source.records.some((sourceRecord) => sourceRecord.filename === record.basename));
  const basenameCollisions = inventory.filter((record) => record.basenameCollisionGroup !== null);
  const nonPng = inventory.filter((record) => record.signature !== 'PNG');
  const exactResolved = resolutions.filter((record) => record.status === 'RESOLVED').length;
  const uniqueHashes = new Set(resolutions.map((record) => record.sha256).filter(Boolean));

  if (inventory.length !== 24) failures.push({ reason: 'INVENTORY_COUNT_MISMATCH', expected: 24, actual: inventory.length });
  if (unexpectedFiles.length) failures.push({ reason: 'UNEXPECTED_STAGING_FILES', files: unexpectedFiles.map((record) => record.relativePath) });
  if (basenameCollisions.length) failures.push({ reason: 'BASENAME_COLLISION', files: basenameCollisions.map((record) => record.relativePath) });
  if (nonPng.length) failures.push({ reason: 'NON_PNG_BYTES', files: nonPng.map((record) => record.relativePath) });
  if (exactResolved !== 24) failures.push({ reason: 'RESOLUTION_COVERAGE_MISMATCH', expected: 24, actual: exactResolved });

  const status = failures.length === 0 ? 'PASS_SOLDIER_TRAINING_MATERIAL_ASSET_INTAKE' : 'FAIL_SOLDIER_TRAINING_MATERIAL_ASSET_INTAKE';
  const contract = {
    contractVersion: 'asset-intake/v1',
    domain: 'soldier-training-material',
    sourceContext: {
      path: SOURCE_MANIFEST,
      stage: 'Soldier Training Material Asset Intake',
      substage: 'external-source-resolution',
      checkpoint: 'drive-exact-filename-24',
      status,
    },
    records: contractRecords,
  };

  const validation = {
    schemaId: 'soldier-training-material-asset-intake-validation/v1',
    status,
    completion: failures.length === 0 ? 'ASSET_INTAKE_RESOLVED_24_OF_24' : 'BLOCKED',
    scope: {
      expectedItemCount: 24,
      stagingInventoryCount: inventory.length,
      exactResolvedCount: exactResolved,
      uniqueSha256Count: uniqueHashes.size,
      unexpectedFileCount: unexpectedFiles.length,
      basenameCollisionCount: basenameCollisions.length,
      nonPngCount: nonPng.length,
      failureCount: failures.length,
    },
    source: source.source,
    predecessor: source.predecessor,
    matchingRule: source.matchingRule,
    downloads,
    records: resolutions,
    failures,
    next: failures.length === 0
      ? 'Publish validated PNG source assets, then create a separate web-served derivative manifest/resolver.'
      : 'Remain in asset intake; do not modify frontend or semantic data.',
    semanticReopenAllowed: false,
  };

  await writeJson(CONTRACT_OUT, contract);
  await writeJson(VALIDATION_OUT, validation);

  if (failures.length === 0 && publish) {
    await fs.rm(SOURCE_PUBLIC_ROOT, { recursive: true, force: true });
    await fs.mkdir(SOURCE_PUBLIC_ROOT, { recursive: true });
    for (const record of source.records) {
      await fs.copyFile(path.join(stagingRoot, record.filename), path.join(SOURCE_PUBLIC_ROOT, record.filename));
    }
  }

  const checkpoint = `# Soldier Training Material Asset Intake\n\n- status: ${status}\n- completion: ${validation.completion}\n- authoritative semantic predecessor: ${source.predecessor.branch}@${source.predecessor.commit} / ${source.predecessor.artifact}\n- source asset candidate: legacy Korean sheet Drive / ${source.source.itemSubfolderName} (${source.source.itemSubfolderId})\n- matching: ConfigDataItemInfo.Icon exact basename -> Drive exact child filename\n- expected/resolved: 24 / ${exactResolved}\n- staging files: ${inventory.length}\n- PNG signature failures: ${nonPng.length}\n- basename collisions: ${basenameCollisions.length}\n- unexpected files: ${unexpectedFiles.length}\n- unique SHA-256: ${uniqueHashes.size}\n- semantic reopen: forbidden\n- source publication root: ${SOURCE_PUBLIC_ROOT}\n- next: ${validation.next}\n- reopen condition: target ItemInfo ID/Icon population changes, predecessor freshness changes, or asset byte parity fails.\n`;
  await fs.mkdir(path.dirname(CHECKPOINT_OUT), { recursive: true });
  await fs.writeFile(CHECKPOINT_OUT, checkpoint);

  if (failures.length) {
    console.error(JSON.stringify(validation, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({
    status,
    resolved: exactResolved,
    inventory: inventory.length,
    uniqueSha256: uniqueHashes.size,
    published: publish ? source.records.length : 0,
  }));
}

await main();
