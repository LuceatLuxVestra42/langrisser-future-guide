import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTRACT_PATH = path.join(ROOT, 'data/contracts/equipment-image-stage2-public-assets.v1.json');
const INVENTORY_PATH = path.join(ROOT, 'data/generated/equipment-image-stage0-locator-inventory.v1.json');
const STAGE1_PATH = path.join(ROOT, 'data/validation/equipment-image-stage1-summary.v1.json');
const PLAN_PATH = path.join(ROOT, 'data/generated/equipment-image-stage2-public-plan.v1.json');
const QUERY_PATH = path.join(ROOT, 'data/generated/equipment-image-stage2-drive-query-batches.v1.json');
const SUMMARY_PATH = path.join(ROOT, 'data/validation/equipment-image-stage2-plan-summary.v1.json');
const CHECKPOINT_PATH = path.join(ROOT, 'data/checkpoints/equipment-image-stage2-plan.v1.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const contract = readJson(CONTRACT_PATH);
const inventory = readJson(INVENTORY_PATH);
const stage1 = readJson(STAGE1_PATH);
const hardErrors = [];
const reviews = [];

if (stage1.status !== contract.inputs.requiredStage1Status) {
  hardErrors.push(`Stage 1 status ${stage1.status} != ${contract.inputs.requiredStage1Status}`);
}
if (stage1.freezeState !== contract.inputs.requiredStage1FreezeState) {
  hardErrors.push(`Stage 1 freeze ${stage1.freezeState} != ${contract.inputs.requiredStage1FreezeState}`);
}
if (inventory.status !== 'PASS_EQUIPMENT_IMAGE_STAGE0') {
  hardErrors.push(`Stage 0 inventory status ${inventory.status} is not PASS`);
}

const records = Array.isArray(inventory.records) ? inventory.records : [];
const publicRecords = records.filter((record) => record.pageReady === true);
const nonPublicRecords = records.filter((record) => record.pageReady !== true);
if (records.length !== contract.scope.canonical) hardErrors.push(`canonical count ${records.length} != ${contract.scope.canonical}`);
if (publicRecords.length !== contract.scope.public) hardErrors.push(`public count ${publicRecords.length} != ${contract.scope.public}`);
if (nonPublicRecords.length !== contract.scope.nonPublic) hardErrors.push(`non-public count ${nonPublicRecords.length} != ${contract.scope.nonPublic}`);

const sourcePathGroups = new Map();
const basenameToSourcePaths = new Map();
for (const record of publicRecords) {
  const equipmentId = Number(record.equipmentId);
  const sourceIconPath = String(record.source?.iconPath ?? '');
  const sourceBasename = String(record.source?.basename ?? path.posix.basename(sourceIconPath));
  const sourceRoot = String(record.source?.root ?? '');
  const targetRepositoryPath = String(record.web?.repositoryPath ?? `public/images/equipment/${equipmentId}.png`);
  const targetUrlPath = String(record.web?.urlPath ?? `/images/equipment/${equipmentId}.png`);

  if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) hardErrors.push(`invalid public equipmentId ${record.equipmentId}`);
  if (!contract.source.allowedIconRootPrefixes.includes(sourceRoot)) hardErrors.push(`unapproved source root for ${equipmentId}: ${sourceRoot}`);
  if (!sourceIconPath.startsWith(sourceRoot) || !sourceIconPath.toLowerCase().endsWith('.png')) hardErrors.push(`invalid source locator for ${equipmentId}: ${sourceIconPath}`);

  const sourceGroup = sourcePathGroups.get(sourceIconPath) ?? {
    sourceIconPath,
    sourceRoot,
    sourceBasename,
    equipmentIds: [],
    targetRepositoryPaths: [],
    targetUrlPaths: [],
  };
  sourceGroup.equipmentIds.push(equipmentId);
  sourceGroup.targetRepositoryPaths.push(targetRepositoryPath);
  sourceGroup.targetUrlPaths.push(targetUrlPath);
  sourcePathGroups.set(sourceIconPath, sourceGroup);

  const paths = basenameToSourcePaths.get(sourceBasename) ?? new Set();
  paths.add(sourceIconPath);
  basenameToSourcePaths.set(sourceBasename, paths);
}

const publicBasenameCollisions = [...basenameToSourcePaths.entries()]
  .filter(([, sourcePaths]) => sourcePaths.size > 1)
  .map(([basename, sourcePaths]) => ({
    basename,
    sourcePaths: [...sourcePaths].sort(),
    equipmentIdsBySourcePath: [...sourcePaths].sort().map((sourceIconPath) => ({
      sourceIconPath,
      equipmentIds: [...(sourcePathGroups.get(sourceIconPath)?.equipmentIds ?? [])].sort((a, b) => a - b),
    })),
  }))
  .sort((a, b) => a.basename.localeCompare(b.basename));

const collisionBasenames = new Set(publicBasenameCollisions.map((item) => item.basename));
const sourceGroups = [...sourcePathGroups.values()]
  .map((group) => ({
    ...group,
    equipmentIds: [...group.equipmentIds].sort((a, b) => a - b),
    targetRepositoryPaths: [...group.targetRepositoryPaths].sort(),
    targetUrlPaths: [...group.targetUrlPaths].sort(),
    driveMetadataResolutionStatus: collisionBasenames.has(group.sourceBasename)
      ? 'BLOCKED_BASENAME_COLLISION_REQUIRES_EXACT_PATH_EVIDENCE'
      : 'READY_FOR_PARENT_SCOPED_EXACT_FILENAME_LOOKUP',
  }))
  .sort((a, b) => a.sourceIconPath.localeCompare(b.sourceIconPath));

const queryableGroups = sourceGroups.filter((group) => !collisionBasenames.has(group.sourceBasename));
const blockedGroups = sourceGroups.filter((group) => collisionBasenames.has(group.sourceBasename));
const uniqueQueryableBasenames = [...new Set(queryableGroups.map((group) => group.sourceBasename))].sort();
const queryBatches = chunks(uniqueQueryableBasenames, 40).map((fileNames, index) => ({
  batch: index + 1,
  fileNames,
}));

if (publicBasenameCollisions.length > 0) {
  reviews.push(`${publicBasenameCollisions.length} public basename collision group(s) require exact full-path evidence before admission.`);
}

const status = hardErrors.length === 0 ? 'PASS_EQUIPMENT_IMAGE_STAGE2_PLAN' : 'FAIL_EQUIPMENT_IMAGE_STAGE2_PLAN';
const plan = {
  stage: 'Equipment Image Stage 2',
  status,
  scope: 'public 373 asset expansion',
  sourceFolderId: contract.source.legacyEquipmentFolderId,
  productionJoinKey: 'equipmentId',
  sourceLocatorAuthority: contract.identity.sourceLocatorAuthority,
  counts: {
    canonical: records.length,
    publicEquipment: publicRecords.length,
    nonPublicExcluded: nonPublicRecords.length,
    uniquePublicSourcePaths: sourceGroups.length,
    uniqueQueryableBasenames: uniqueQueryableBasenames.length,
    queryBatches: queryBatches.length,
    publicBasenameCollisionGroups: publicBasenameCollisions.length,
    collisionBlockedSourcePaths: blockedGroups.length,
    collisionBlockedEquipment: blockedGroups.reduce((sum, group) => sum + group.equipmentIds.length, 0),
  },
  publicBasenameCollisions,
  sourceGroups,
  hardErrors,
  reviews,
};

const queryPlan = {
  stage: 'Equipment Image Stage 2',
  sourceFolderId: contract.source.legacyEquipmentFolderId,
  resolutionRule: 'parent-scoped exact filename metadata lookup; one result required; basename collisions excluded',
  batchSize: 40,
  expectedUniqueBasenames: uniqueQueryableBasenames.length,
  queryBatches,
};

const summary = {
  stage: 'Equipment Image Stage 2 Plan',
  status,
  semanticStageReopened: false,
  canonicalIdentityChanged: false,
  productionJoinKey: 'equipmentId',
  counts: plan.counts,
  publicBasenameCollisions,
  hardErrors,
  reviews,
  nextStage: hardErrors.length === 0 ? 'STAGE2_DRIVE_METADATA_EXACT_RESOLUTION' : 'BLOCKED',
};

const checkpoint = {
  checkpoint: 'EQUIPMENT-IMAGE-STAGE2-PLAN',
  status,
  stage1Status: stage1.status,
  stage1FreezeState: stage1.freezeState,
  publicEquipment: publicRecords.length,
  uniquePublicSourcePaths: sourceGroups.length,
  queryableBasenames: uniqueQueryableBasenames.length,
  publicBasenameCollisionGroups: publicBasenameCollisions.length,
  collisionBlockedEquipment: blockedGroups.reduce((sum, group) => sum + group.equipmentIds.length, 0),
  nextStartPoint: hardErrors.length === 0
    ? 'Resolve Drive file IDs for query batches, isolate basename-collision paths, then acquire and hash source bytes.'
    : 'Repair Stage 2 plan hard errors before any bulk acquisition.',
  reopenStage0: false,
  reopenStage1: false,
};

writeJson(PLAN_PATH, plan);
writeJson(QUERY_PATH, queryPlan);
writeJson(SUMMARY_PATH, summary);
writeJson(CHECKPOINT_PATH, checkpoint);
console.log(JSON.stringify(summary, null, 2));
if (hardErrors.length > 0) process.exit(1);
