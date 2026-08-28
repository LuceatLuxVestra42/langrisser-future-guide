import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DISPLAY_PATH = path.join(ROOT, 'data/generated/equipment_stage3_2_display_metadata.json');
const FILTER_PATH = path.join(ROOT, 'data/generated/equipment_stage2_3_filter_map.json');
const CONTRACT_PATH = path.join(ROOT, 'data/contracts/equipment-image-stage0-contract.v1.json');
const OUTPUT_PATH = path.join(ROOT, 'data/generated/equipment-image-stage0-locator-inventory.v1.json');
const SUMMARY_PATH = path.join(ROOT, 'data/validation/equipment-image-stage0-summary.v1.json');
const CHECKPOINT_PATH = path.join(ROOT, 'data/checkpoints/equipment-image-stage0.v1.json');
const WEB_DIR = path.join(ROOT, 'public/images/equipment');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isPng(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    return buf.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  } finally {
    fs.closeSync(fd);
  }
}

const display = readJson(DISPLAY_PATH);
const filterMap = readJson(FILTER_PATH);
const contract = readJson(CONTRACT_PATH);

const displayRecords = Array.isArray(display.records) ? display.records : [];
const filterRecords = Array.isArray(filterMap.records) ? filterMap.records : [];
const filterById = new Map(filterRecords.map((record) => [Number(record.id), record]));
const allowedRoots = contract.source.allowedIconRootPrefixes ?? [];

const hardErrors = [];
const reviews = [];

if (displayRecords.length !== contract.expected.canonical) {
  hardErrors.push(`display canonical count ${displayRecords.length} != ${contract.expected.canonical}`);
}
if (filterRecords.length !== contract.expected.canonical) {
  hardErrors.push(`filter canonical count ${filterRecords.length} != ${contract.expected.canonical}`);
}
if (allowedRoots.length === 0) {
  hardErrors.push('no allowed icon roots configured');
}

const seenIds = new Set();
const seenWebPaths = new Set();
const iconPathToIds = new Map();
const basenameToPaths = new Map();
const sourceRootCounts = new Map(allowedRoots.map((root) => [root, 0]));
const records = [];

for (const record of displayRecords) {
  const equipmentId = Number(record.equipmentId);
  if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) {
    hardErrors.push(`invalid equipmentId ${record.equipmentId}`);
    continue;
  }
  if (seenIds.has(equipmentId)) hardErrors.push(`duplicate equipmentId ${equipmentId}`);
  seenIds.add(equipmentId);

  const filter = filterById.get(equipmentId);
  if (!filter) {
    hardErrors.push(`missing filter record for equipmentId ${equipmentId}`);
    continue;
  }
  if (filter.name !== record.nameCn) {
    hardErrors.push(`name parity mismatch ${equipmentId}: ${record.nameCn} != ${filter.name}`);
  }

  const sourceIconPath = String(record.icon ?? '');
  if (record.iconStatus !== 'VERIFIED_DIRECT') {
    hardErrors.push(`icon not VERIFIED_DIRECT for ${equipmentId}: ${record.iconStatus}`);
  }
  const matchedRoot = allowedRoots.find((root) => sourceIconPath.startsWith(root)) ?? null;
  if (!matchedRoot) {
    hardErrors.push(`icon root outside allowlist for ${equipmentId}: ${sourceIconPath}`);
  } else {
    sourceRootCounts.set(matchedRoot, (sourceRootCounts.get(matchedRoot) ?? 0) + 1);
  }
  if (!sourceIconPath.toLowerCase().endsWith('.png')) {
    hardErrors.push(`icon is not PNG locator for ${equipmentId}: ${sourceIconPath}`);
  }

  const sourceBasename = path.posix.basename(sourceIconPath);
  const webAssetPath = `${contract.web.urlRoot}/${equipmentId}.png`;
  if (seenWebPaths.has(webAssetPath)) hardErrors.push(`duplicate web path ${webAssetPath}`);
  seenWebPaths.add(webAssetPath);

  const iconIds = iconPathToIds.get(sourceIconPath) ?? [];
  iconIds.push(equipmentId);
  iconPathToIds.set(sourceIconPath, iconIds);

  const basenamePaths = basenameToPaths.get(sourceBasename) ?? new Set();
  basenamePaths.add(sourceIconPath);
  basenameToPaths.set(sourceBasename, basenamePaths);

  const repositoryFile = path.join(WEB_DIR, `${equipmentId}.png`);
  const exists = fs.existsSync(repositoryFile);
  let repositoryAsset = {
    status: exists ? 'RESOLVED' : 'PENDING_ASSET_BYTES',
    repositoryPath: `public/images/equipment/${equipmentId}.png`,
    sha256: null,
    pngSignatureValid: null,
    bytes: null,
  };
  if (exists) {
    const stat = fs.statSync(repositoryFile);
    repositoryAsset = {
      ...repositoryAsset,
      sha256: sha256(repositoryFile),
      pngSignatureValid: isPng(repositoryFile),
      bytes: stat.size,
    };
    if (!repositoryAsset.pngSignatureValid) {
      hardErrors.push(`resolved repository asset is not PNG: ${equipmentId}`);
    }
  }

  records.push({
    equipmentId,
    nameCn: record.nameCn,
    pageReady: Boolean(record.pageReady),
    acquisitionClass: record.acquisitionClass,
    group: filter.group,
    groupKo: filter.groupKo,
    subtype: filter.subtype,
    subtypeKo: filter.subtypeKo,
    source: {
      authority: 'ConfigDataEquipmentInfo.Icon',
      iconPath: sourceIconPath,
      root: matchedRoot,
      basename: sourceBasename,
      status: record.iconStatus,
    },
    web: {
      urlPath: webAssetPath,
      ...repositoryAsset,
    },
  });
}

const publicRecords = records.filter((record) => record.pageReady);
const nonPublicRecords = records.filter((record) => !record.pageReady);
if (publicRecords.length !== contract.expected.public) {
  hardErrors.push(`public count ${publicRecords.length} != ${contract.expected.public}`);
}
if (nonPublicRecords.length !== contract.expected.nonPublic) {
  hardErrors.push(`non-public count ${nonPublicRecords.length} != ${contract.expected.nonPublic}`);
}

const duplicateIconPaths = [...iconPathToIds.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([iconPath, equipmentIds]) => ({ iconPath, equipmentIds }));
const duplicateBasenamesAcrossDifferentPaths = [...basenameToPaths.entries()]
  .filter(([, paths]) => paths.size > 1)
  .map(([basename, paths]) => ({ basename, sourcePaths: [...paths].sort() }));

if (duplicateIconPaths.length > 0) {
  reviews.push(`${duplicateIconPaths.length} source icon path(s) are shared by multiple equipment IDs; keep equipmentId-based web paths.`);
}
if (duplicateBasenamesAcrossDifferentPaths.length > 0) {
  reviews.push(`${duplicateBasenamesAcrossDifferentPaths.length} basename collision(s) exist across source paths; exact full Icon path is required.`);
}

const resolvedRepositoryAssets = records.filter((record) => record.web.status === 'RESOLVED');
const pendingRepositoryAssets = records.filter((record) => record.web.status === 'PENDING_ASSET_BYTES');

function chooseRepresentative(predicate, label) {
  const chosen = records.find((record) => record.pageReady && predicate(record));
  if (!chosen) {
    hardErrors.push(`missing representative fixture: ${label}`);
    return null;
  }
  return {
    label,
    equipmentId: chosen.equipmentId,
    nameCn: chosen.nameCn,
    acquisitionClass: chosen.acquisitionClass,
    group: chosen.group,
    subtype: chosen.subtype,
    sourceIconPath: chosen.source.iconPath,
    sourceRoot: chosen.source.root,
    sourceBasename: chosen.source.basename,
    targetRepositoryPath: chosen.web.repositoryPath,
    targetUrlPath: chosen.web.urlPath,
  };
}

const representativeFixtures = [
  chooseRepresentative((record) => record.group === 'weapon', 'weapon'),
  chooseRepresentative((record) => record.group === 'armor', 'armor'),
  chooseRepresentative((record) => record.group === 'headgear', 'headgear'),
  chooseRepresentative((record) => record.group === 'accessory', 'accessory'),
  chooseRepresentative((record) => record.acquisitionClass === 'exclusive-equipment', 'exclusive-equipment'),
].filter(Boolean);

const sourceRootCountObject = Object.fromEntries([...sourceRootCounts.entries()]);
const status = hardErrors.length === 0 ? 'PASS_EQUIPMENT_IMAGE_STAGE0' : 'FAIL_EQUIPMENT_IMAGE_STAGE0';
const inventory = {
  stage: 'Equipment Image Stage 0',
  status,
  purpose: 'Freeze canonical equipment full icon locators and equipmentId-based web asset contract without importing or inferring asset bytes.',
  sources: {
    displayMetadata: 'data/generated/equipment_stage3_2_display_metadata.json',
    filterMap: 'data/generated/equipment_stage2_3_filter_map.json',
    iconAuthority: 'ConfigDataEquipmentInfo.Icon',
  },
  policy: contract,
  counts: {
    canonical: records.length,
    public: publicRecords.length,
    nonPublic: nonPublicRecords.length,
    uniqueSourceIconPaths: iconPathToIds.size,
    duplicateSourceIconPaths: duplicateIconPaths.length,
    duplicateBasenamesAcrossDifferentPaths: duplicateBasenamesAcrossDifferentPaths.length,
    sourceRootCounts: sourceRootCountObject,
    uniqueWebPaths: seenWebPaths.size,
    repositoryResolved: resolvedRepositoryAssets.length,
    repositoryPending: pendingRepositoryAssets.length,
  },
  representativeFixtures,
  duplicateIconPaths,
  duplicateBasenamesAcrossDifferentPaths,
  records,
};

const summary = {
  stage: 'Equipment Image Stage 0',
  status,
  freezeState: hardErrors.length === 0 ? 'EQUIPMENT_IMAGE_STAGE0_FROZEN' : 'NOT_FROZEN',
  semanticStageReopened: false,
  canonicalIdentityChanged: false,
  runtimeNameJoinRequired: false,
  sourceLocator: 'ConfigDataEquipmentInfo.Icon full path',
  productionJoinKey: 'equipmentId',
  webPathTemplate: contract.web.urlPathTemplate,
  counts: inventory.counts,
  representativeFixtures,
  hardErrors,
  reviews,
  nextStage: hardErrors.length === 0 ? 'STAGE1_REPRESENTATIVE_ASSET_BYTES_PROOF' : 'BLOCKED',
};

const checkpoint = {
  checkpoint: 'EQUIPMENT-IMAGE-STAGE0-FINAL',
  status,
  completion: hardErrors.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
  freezeState: summary.freezeState,
  sourceCommitExpectation: process.env.GITHUB_SHA ?? null,
  canonicalEquipment: records.length,
  publicEquipment: publicRecords.length,
  nonPublicEquipment: nonPublicRecords.length,
  uniqueSourceIconPaths: iconPathToIds.size,
  sourceRootCounts: sourceRootCountObject,
  sharedSourceIconPathGroups: duplicateIconPaths.length,
  basenameCollisionGroups: duplicateBasenamesAcrossDifferentPaths.length,
  resolvedWebAssetsAtFreeze: resolvedRepositoryAssets.length,
  pendingWebAssetsAtFreeze: pendingRepositoryAssets.length,
  sourceLocatorAuthority: 'ConfigDataEquipmentInfo.Icon full path',
  productionJoinKey: 'equipmentId',
  webAssetRoot: contract.web.repositoryRoot,
  nextStartPoint: 'Resolve authoritative bytes for the five representative fixtures, verify exact full locator/PNG/hash/dimensions, then expand to public 373.',
  reopenConditions: [
    'canonical equipment ID population changes',
    'ConfigDataEquipmentInfo.Icon locator contract changes',
    'equipment public/non-public admission changes',
    'web asset naming contract changes',
  ],
  nonReopenConditions: [
    'Korean display-name correction',
    'frontend styling changes',
    'asset bytes are added under the frozen equipmentId web paths',
  ],
};

writeJson(OUTPUT_PATH, inventory);
writeJson(SUMMARY_PATH, summary);
writeJson(CHECKPOINT_PATH, checkpoint);

console.log(JSON.stringify(summary, null, 2));
if (hardErrors.length > 0) process.exit(1);
