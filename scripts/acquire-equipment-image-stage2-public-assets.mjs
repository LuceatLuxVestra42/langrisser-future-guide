import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'data/generated/equipment-image-stage2-acquisition-manifest.v1.json');
const RESOLUTION_SUMMARY_PATH = path.join(ROOT, 'data/validation/equipment-image-stage2-drive-resolution-summary.v1.json');
const STAGE1_SUMMARY_PATH = path.join(ROOT, 'data/validation/equipment-image-stage1-summary.v1.json');
const EVIDENCE_PATH = path.join(ROOT, 'data/evidence/equipment-image-stage2-source-evidence.v1.json');
const SUMMARY_PATH = path.join(ROOT, 'data/validation/equipment-image-stage2-acquisition-summary.v1.json');
const CHECKPOINT_PATH = path.join(ROOT, 'data/checkpoints/equipment-image-stage2-acquisition.v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function inspectPng(data) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngSignatureValid = data.length >= 24 && data.subarray(0, 8).equals(signature);
  const ihdrValid = pngSignatureValid && data.subarray(12, 16).toString('ascii') === 'IHDR';
  return {
    pngSignatureValid,
    ihdrValid,
    width: ihdrValid ? data.readUInt32BE(16) : null,
    height: ihdrValid ? data.readUInt32BE(20) : null,
  };
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadDriveFile(record) {
  const url = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(record.driveFileId)}&export=download&confirm=t`;
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'langrisser-future-guide-equipment-stage2/1.0' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      const png = inspectPng(data);
      if (!png.pngSignatureValid || !png.ihdrValid) throw new Error(`invalid PNG (${data.length} bytes)`);
      if (!(png.width > 0 && png.height > 0)) throw new Error(`invalid dimensions ${png.width}x${png.height}`);
      return { data, png };
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(500 * attempt);
    }
  }
  throw new Error(`${record.equipmentId} ${record.sourceBasename}: Drive download failed after retries: ${lastError?.message ?? lastError}`);
}

const manifest = readJson(MANIFEST_PATH);
const resolution = readJson(RESOLUTION_SUMMARY_PATH);
const stage1 = readJson(STAGE1_SUMMARY_PATH);
const hardErrors = [];
const reviews = [];

if (manifest.manifest !== 'equipment-image-stage2-acquisition-manifest-v1') hardErrors.push(`unexpected manifest ${manifest.manifest}`);
if (manifest.productionJoinKey !== 'equipmentId') hardErrors.push(`manifest join key ${manifest.productionJoinKey}`);
if (manifest.sourceLocatorAuthority !== 'ConfigDataEquipmentInfo.Icon full path') hardErrors.push('source locator authority drift');
if (resolution.status !== 'PASS_EQUIPMENT_IMAGE_STAGE2_DRIVE_RESOLUTION') hardErrors.push(`Drive resolution status ${resolution.status}`);
if (resolution.counts.acquisitionReadyEquipment !== 344) hardErrors.push(`acquisition-ready ${resolution.counts.acquisitionReadyEquipment} != 344`);
if (resolution.counts.unresolvedEquipment !== 29) hardErrors.push(`unresolved ${resolution.counts.unresolvedEquipment} != 29`);
if (stage1.status !== 'PASS_EQUIPMENT_IMAGE_STAGE1' || stage1.freezeState !== 'EQUIPMENT_IMAGE_STAGE1_FROZEN') hardErrors.push('Stage 1 frozen baseline unavailable');
if (!Array.isArray(manifest.records) || manifest.records.length !== 344) hardErrors.push(`manifest records ${manifest.records?.length ?? 'missing'} != 344`);

const ids = new Set();
const targets = new Set();
for (const record of manifest.records ?? []) {
  if (ids.has(record.equipmentId)) hardErrors.push(`duplicate equipmentId ${record.equipmentId}`);
  ids.add(record.equipmentId);
  if (targets.has(record.targetRepositoryPath)) hardErrors.push(`duplicate target ${record.targetRepositoryPath}`);
  targets.add(record.targetRepositoryPath);
  if (!record.sourceIconPath?.endsWith(record.sourceBasename)) hardErrors.push(`source basename mismatch ${record.equipmentId}`);
  if (record.targetRepositoryPath !== `public/images/equipment/${record.equipmentId}.png`) hardErrors.push(`target path mismatch ${record.equipmentId}`);
  if (record.targetUrlPath !== `/images/equipment/${record.equipmentId}.png`) hardErrors.push(`target URL mismatch ${record.equipmentId}`);
  if (!record.driveFileId) hardErrors.push(`missing Drive file ID ${record.equipmentId}`);
}

if (hardErrors.length > 0) {
  console.error(JSON.stringify({ hardErrors }, null, 2));
  process.exit(1);
}

const queue = [...manifest.records];
const evidenceRecords = [];
const failures = [];
let cursor = 0;
const workerCount = 6;

async function worker(workerId) {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= queue.length) return;
    const record = queue[index];
    try {
      const { data, png } = await downloadDriveFile(record);
      const digest = sha256(data);
      const target = path.join(ROOT, record.targetRepositoryPath);
      const existing = fs.existsSync(target) ? fs.readFileSync(target) : null;
      const existingSha256 = existing ? sha256(existing) : null;
      const existingAssetMatched = existing ? existingSha256 === digest : null;

      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      const stored = fs.readFileSync(target);
      const storedDigest = sha256(stored);
      if (storedDigest !== digest) throw new Error(`repository write SHA mismatch ${storedDigest} != ${digest}`);

      evidenceRecords[index] = {
        equipmentId: record.equipmentId,
        sourceLocator: record.sourceIconPath,
        sourceBasename: record.sourceBasename,
        sourceEvidenceStatus: 'VERIFIED_EXACT_SOURCE_EXPORT',
        sourceArtifact: `google-drive:file:${record.driveFileId};folder:${manifest.sourceFolderId};name:${record.sourceBasename}`,
        driveFileId: record.driveFileId,
        sourceBytes: data.length,
        sourceWidth: png.width,
        sourceHeight: png.height,
        sourceSha256: digest,
        targetRepositoryPath: record.targetRepositoryPath,
        targetUrlPath: record.targetUrlPath,
        repositorySha256: storedDigest,
        sourceRepositorySha256Parity: storedDigest === digest,
        existingAssetMatched,
      };
      if ((index + 1) % 25 === 0 || index + 1 === queue.length) {
        console.log(`worker ${workerId}: processed ${index + 1}/${queue.length}`);
      }
    } catch (error) {
      failures.push({ equipmentId: record.equipmentId, sourceBasename: record.sourceBasename, message: error?.message ?? String(error) });
    }
  }
}

await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index + 1)));

const records = evidenceRecords.filter(Boolean).sort((a, b) => a.equipmentId - b.equipmentId);
const invalidParity = records.filter((record) => record.sourceRepositorySha256Parity !== true);
if (failures.length > 0) hardErrors.push(`${failures.length} source download/write failure(s)`);
if (records.length !== 344) hardErrors.push(`verified evidence ${records.length} != 344`);
if (invalidParity.length > 0) hardErrors.push(`${invalidParity.length} source/repository SHA parity failure(s)`);

const unresolved = resolution.unresolved ?? [];
const status = hardErrors.length === 0
  ? 'PASS_EQUIPMENT_IMAGE_STAGE2_EXACT_SOURCE_ACQUISITION'
  : 'FAIL_EQUIPMENT_IMAGE_STAGE2_EXACT_SOURCE_ACQUISITION';
const completion = hardErrors.length === 0 ? 'PARTIAL_344_OF_373' : 'BLOCKED_BY_HARD_ERROR';
const freezeState = hardErrors.length === 0 ? 'EQUIPMENT_IMAGE_STAGE2_EXACT_SOURCE_SUBSET_FROZEN' : 'NOT_FROZEN';

const evidence = {
  evidence: 'equipment-image-stage2-source-evidence-v1',
  stage: 'Equipment Image Stage 2',
  status,
  sourceFolderId: manifest.sourceFolderId,
  sourceLocatorAuthority: manifest.sourceLocatorAuthority,
  productionJoinKey: 'equipmentId',
  records,
  unresolved,
};

const summary = {
  stage: 'Equipment Image Stage 2 Acquisition',
  status,
  completion,
  freezeState,
  semanticStageReopened: false,
  canonicalIdentityChanged: false,
  productionJoinKey: 'equipmentId',
  counts: {
    publicEquipment: 373,
    exactSourceAcquisitionTarget: 344,
    verifiedExactSourceAssets: records.length,
    sourceRepositoryShaParity: records.filter((r) => r.sourceRepositorySha256Parity === true).length,
    unresolvedEquipment: unresolved.length,
    missingInLegacyDrive: resolution.counts.missingInLegacyDrive,
    caseMismatchReview: resolution.counts.caseMismatchReview,
    basenameCollisionReview: resolution.counts.collisionBlockedEquipment,
    hardErrors: hardErrors.length,
    downloadFailures: failures.length,
  },
  unresolved,
  failures,
  hardErrors,
  reviews,
  finalStage2Complete: false,
  nextStage: hardErrors.length === 0 ? 'STAGE2_RESOLVE_HELD_29_SOURCE_EVIDENCE' : 'BLOCKED',
};

const checkpoint = {
  checkpoint: 'EQUIPMENT-IMAGE-STAGE2-EXACT-SOURCE-ACQUISITION',
  status,
  completion,
  freezeState,
  publicEquipment: 373,
  verifiedExactSourceAssets: records.length,
  unresolvedEquipment: unresolved.length,
  finalStage2Complete: false,
  productionJoinKey: 'equipmentId',
  sourceLocatorAuthority: 'ConfigDataEquipmentInfo.Icon full path',
  nextStartPoint: hardErrors.length === 0
    ? 'Resolve the 29 held public Equipment assets: 24 missing from legacy Drive, 3 case-mismatch filenames, and 2 basename-collision full paths. Do not infer replacements.'
    : 'Repair bulk acquisition failures and rerun exact-source acquisition.',
  reopenStage0: false,
  reopenStage1: false,
};

writeJson(EVIDENCE_PATH, evidence);
writeJson(SUMMARY_PATH, summary);
writeJson(CHECKPOINT_PATH, checkpoint);
console.log(JSON.stringify(summary, null, 2));
if (hardErrors.length > 0) process.exit(1);
