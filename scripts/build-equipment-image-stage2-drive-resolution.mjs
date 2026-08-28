import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PLAN_PATH = path.join(ROOT, 'data/generated/equipment-image-stage2-public-plan.v1.json');
const QUERY_PATH = path.join(ROOT, 'data/generated/equipment-image-stage2-drive-query-batches.v1.json');
const BATCH_DIR = path.join(ROOT, 'data/evidence/equipment-image-stage2-drive-resolution-batches');
const REGISTRY_PATH = path.join(ROOT, 'data/generated/equipment-image-stage2-drive-resolution.v1.json');
const MANIFEST_PATH = path.join(ROOT, 'data/generated/equipment-image-stage2-acquisition-manifest.v1.json');
const SUMMARY_PATH = path.join(ROOT, 'data/validation/equipment-image-stage2-drive-resolution-summary.v1.json');
const CHECKPOINT_PATH = path.join(ROOT, 'data/checkpoints/equipment-image-stage2-drive-resolution.v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const plan = readJson(PLAN_PATH);
const query = readJson(QUERY_PATH);
const hardErrors = [];
const reviews = [];

if (plan.status !== 'PASS_EQUIPMENT_IMAGE_STAGE2_PLAN') hardErrors.push(`plan status ${plan.status}`);
const expectedNames = query.queryBatches.flatMap((batch) => batch.fileNames);
if (expectedNames.length !== query.expectedUniqueBasenames) hardErrors.push('query expected count mismatch');
if (new Set(expectedNames).size !== expectedNames.length) hardErrors.push('duplicate query basename');

const exactByName = new Map();
const caseMismatchByExpected = new Map();
const missingNames = new Set();
const batchFiles = fs.readdirSync(BATCH_DIR).filter((name) => /^batch-\d+\.json$/.test(name)).sort();
if (batchFiles.length !== query.queryBatches.length) hardErrors.push(`batch file count ${batchFiles.length} != ${query.queryBatches.length}`);

for (const fileName of batchFiles) {
  const batch = readJson(path.join(BATCH_DIR, fileName));
  for (const record of batch.records ?? []) {
    if (exactByName.has(record.fileName)) hardErrors.push(`duplicate exact Drive resolution ${record.fileName}`);
    exactByName.set(record.fileName, record);
  }
  for (const record of batch.caseMismatch ?? []) {
    if (caseMismatchByExpected.has(record.expectedFileName)) hardErrors.push(`duplicate case mismatch ${record.expectedFileName}`);
    caseMismatchByExpected.set(record.expectedFileName, record);
  }
  for (const name of batch.missing ?? []) missingNames.add(name);
}

const expectedSet = new Set(expectedNames);
for (const name of exactByName.keys()) if (!expectedSet.has(name)) hardErrors.push(`unexpected exact Drive basename ${name}`);
for (const name of caseMismatchByExpected.keys()) if (!expectedSet.has(name)) hardErrors.push(`unexpected case mismatch basename ${name}`);
for (const name of missingNames) if (!expectedSet.has(name)) hardErrors.push(`unexpected missing basename ${name}`);

const classifications = [];
for (const name of expectedNames) {
  const exact = exactByName.get(name);
  const caseMismatch = caseMismatchByExpected.get(name);
  const missing = missingNames.has(name);
  const flags = Number(Boolean(exact)) + Number(Boolean(caseMismatch)) + Number(missing);
  if (flags !== 1) hardErrors.push(`Drive resolution classification count ${flags} for ${name}`);
  classifications.push({
    fileName: name,
    status: exact ? 'RESOLVED_EXACT_FILENAME' : caseMismatch ? 'REVIEW_CASE_MISMATCH' : 'MISSING_IN_LEGACY_DRIVE',
    driveFileId: exact?.driveFileId ?? caseMismatch?.driveFileId ?? null,
    actualFileName: caseMismatch?.actualFileName ?? exact?.fileName ?? null,
  });
}

const classByName = new Map(classifications.map((record) => [record.fileName, record]));
const acquisitionRecords = [];
const unresolved = [];

for (const group of plan.sourceGroups) {
  if (!Array.isArray(group.equipmentIds) || group.equipmentIds.length !== 1) {
    hardErrors.push(`public source path group is not 1:1: ${group.sourceIconPath}`);
    continue;
  }
  const equipmentId = group.equipmentIds[0];
  if (group.driveMetadataResolutionStatus === 'BLOCKED_BASENAME_COLLISION_REQUIRES_EXACT_PATH_EVIDENCE') {
    unresolved.push({
      equipmentId,
      sourceIconPath: group.sourceIconPath,
      sourceBasename: group.sourceBasename,
      status: 'BLOCKED_BASENAME_COLLISION_REQUIRES_EXACT_PATH_EVIDENCE',
      driveFileId: null,
      targetRepositoryPath: group.targetRepositoryPaths[0],
      targetUrlPath: group.targetUrlPaths[0],
    });
    continue;
  }
  const resolved = classByName.get(group.sourceBasename);
  if (!resolved) {
    hardErrors.push(`missing classification for ${group.sourceBasename}`);
    continue;
  }
  const base = {
    equipmentId,
    sourceIconPath: group.sourceIconPath,
    sourceBasename: group.sourceBasename,
    targetRepositoryPath: group.targetRepositoryPaths[0],
    targetUrlPath: group.targetUrlPaths[0],
  };
  if (resolved.status === 'RESOLVED_EXACT_FILENAME') {
    acquisitionRecords.push({ ...base, driveFileId: resolved.driveFileId, sourceEvidenceStatus: 'DRIVE_EXACT_FILENAME_RESOLVED' });
  } else {
    unresolved.push({ ...base, status: resolved.status, driveFileId: resolved.driveFileId, actualFileName: resolved.actualFileName });
  }
}

acquisitionRecords.sort((a, b) => a.equipmentId - b.equipmentId);
unresolved.sort((a, b) => a.equipmentId - b.equipmentId);

if (acquisitionRecords.length + unresolved.length !== plan.counts.publicEquipment) {
  hardErrors.push(`public classification total ${acquisitionRecords.length + unresolved.length} != ${plan.counts.publicEquipment}`);
}

const status = hardErrors.length === 0 ? 'PASS_EQUIPMENT_IMAGE_STAGE2_DRIVE_RESOLUTION' : 'FAIL_EQUIPMENT_IMAGE_STAGE2_DRIVE_RESOLUTION';
const registry = {
  stage: 'Equipment Image Stage 2',
  status,
  sourceFolderId: plan.sourceFolderId,
  counts: {
    queryExpectedBasenames: expectedNames.length,
    exactFilenameResolved: classifications.filter((r) => r.status === 'RESOLVED_EXACT_FILENAME').length,
    caseMismatchReview: classifications.filter((r) => r.status === 'REVIEW_CASE_MISMATCH').length,
    missingInLegacyDrive: classifications.filter((r) => r.status === 'MISSING_IN_LEGACY_DRIVE').length,
    collisionBlockedEquipment: unresolved.filter((r) => r.status === 'BLOCKED_BASENAME_COLLISION_REQUIRES_EXACT_PATH_EVIDENCE').length,
    acquisitionReadyEquipment: acquisitionRecords.length,
    unresolvedEquipment: unresolved.length,
  },
  classifications,
  unresolved,
  hardErrors,
};

const manifest = {
  manifest: 'equipment-image-stage2-acquisition-manifest-v1',
  stage: 'Equipment Image Stage 2',
  sourceFolderId: plan.sourceFolderId,
  sourceLocatorAuthority: 'ConfigDataEquipmentInfo.Icon full path',
  productionJoinKey: 'equipmentId',
  records: acquisitionRecords,
};

if (registry.counts.exactFilenameResolved !== 344) reviews.push(`exact filename resolution count is ${registry.counts.exactFilenameResolved}; expected observed checkpoint 344`);
if (registry.counts.unresolvedEquipment !== 29) reviews.push(`unresolved equipment count is ${registry.counts.unresolvedEquipment}; expected observed checkpoint 29`);

const summary = {
  stage: 'Equipment Image Stage 2 Drive Resolution',
  status,
  semanticStageReopened: false,
  canonicalIdentityChanged: false,
  productionJoinKey: 'equipmentId',
  counts: registry.counts,
  unresolved,
  hardErrors,
  reviews,
  nextStage: hardErrors.length === 0 ? 'STAGE2_ACQUIRE_344_EXACT_RESOLVED_ASSETS' : 'BLOCKED',
};

const checkpoint = {
  checkpoint: 'EQUIPMENT-IMAGE-STAGE2-DRIVE-RESOLUTION',
  status,
  publicEquipment: plan.counts.publicEquipment,
  exactFilenameResolved: registry.counts.exactFilenameResolved,
  acquisitionReadyEquipment: registry.counts.acquisitionReadyEquipment,
  unresolvedEquipment: registry.counts.unresolvedEquipment,
  unresolvedByReason: {
    missingInLegacyDrive: registry.counts.missingInLegacyDrive,
    caseMismatchReview: registry.counts.caseMismatchReview,
    basenameCollision: registry.counts.collisionBlockedEquipment,
  },
  nextStartPoint: hardErrors.length === 0
    ? 'Acquire the exact-resolved assets by Drive file ID, hash/copy them to equipmentId paths, then separately resolve the 29 held records.'
    : 'Repair Drive resolution classification errors before byte acquisition.',
  reopenStage0: false,
  reopenStage1: false,
};

writeJson(REGISTRY_PATH, registry);
writeJson(MANIFEST_PATH, manifest);
writeJson(SUMMARY_PATH, summary);
writeJson(CHECKPOINT_PATH, checkpoint);
console.log(JSON.stringify(summary, null, 2));
if (hardErrors.length > 0) process.exit(1);
