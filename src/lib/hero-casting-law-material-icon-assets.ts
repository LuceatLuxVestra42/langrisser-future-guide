import manifestRaw from "../../data/manifests/hero-casting-law-material-icons.v1.json";

type CastingLawMaterialIconRecord = {
  itemId: number;
  nameCn: string;
  rank: number;
  sourceIconPath: string;
  sourceIconFileName: string;
  driveFileId: string;
  driveFileSize: number;
  driveFolderId: string;
  deliveryUrl: string;
  deliveryMode: "GOOGLE_DRIVE_PUBLIC_IMAGE";
};

type CastingLawMaterialIconManifest = {
  version: 1;
  schemaId: "hero-casting-law-material-icons/v1";
  status: "PASS";
  completion: "MAPPED_EXTERNAL";
  contract: {
    requiredItemCount: number;
    exactSourceBasenameMatch: boolean;
    uniqueItemId: boolean;
    uniqueDriveFileId: boolean;
    unresolvedAllowed: boolean;
  };
  records: CastingLawMaterialIconRecord[];
  summary: {
    required: number;
    matched: number;
    unresolved: number;
    uniqueItemIds: number;
    uniqueDriveFileIds: number;
  };
};

const manifest = manifestRaw as CastingLawMaterialIconManifest;

if (
  manifest.version !== 1 ||
  manifest.schemaId !== "hero-casting-law-material-icons/v1" ||
  manifest.status !== "PASS" ||
  manifest.completion !== "MAPPED_EXTERNAL" ||
  manifest.contract.requiredItemCount !== 45 ||
  manifest.contract.exactSourceBasenameMatch !== true ||
  manifest.contract.uniqueItemId !== true ||
  manifest.contract.uniqueDriveFileId !== true ||
  manifest.contract.unresolvedAllowed !== false ||
  manifest.summary.required !== 45 ||
  manifest.summary.matched !== 45 ||
  manifest.summary.unresolved !== 0 ||
  manifest.summary.uniqueItemIds !== 45 ||
  manifest.summary.uniqueDriveFileIds !== 45 ||
  manifest.records.length !== 45
) {
  throw new Error("Hero Casting Law material icon manifest is not production-ready.");
}

const byItemId = new Map<number, CastingLawMaterialIconRecord>();
const driveFileIds = new Set<string>();

for (const record of manifest.records) {
  const sourceFileName = record.sourceIconPath.split("/").pop() ?? "";
  if (
    !Number.isSafeInteger(record.itemId) ||
    record.itemId <= 0 ||
    byItemId.has(record.itemId) ||
    sourceFileName !== record.sourceIconFileName ||
    !/^Icon_CastFigure_[A-Za-z0-9_]+\.png$/.test(record.sourceIconFileName) ||
    record.driveFolderId !== "1YtHeEsA4RUB8dMNyQHypGVXWJCL3Ur1j" ||
    !record.driveFileId ||
    driveFileIds.has(record.driveFileId) ||
    !Number.isSafeInteger(record.driveFileSize) ||
    record.driveFileSize <= 0 ||
    record.deliveryMode !== "GOOGLE_DRIVE_PUBLIC_IMAGE" ||
    record.deliveryUrl !== `https://drive.google.com/uc?export=view&id=${record.driveFileId}`
  ) {
    throw new Error(`Hero Casting Law material icon manifest record is invalid for itemId=${record.itemId}.`);
  }
  byItemId.set(record.itemId, record);
  driveFileIds.add(record.driveFileId);
}

export function getHeroCastingLawMaterialIconAsset(
  itemId: number,
  sourceIconPath: string | null | undefined,
) {
  if (!sourceIconPath) return null;
  const record = byItemId.get(itemId);
  if (!record || record.sourceIconPath !== sourceIconPath) return null;
  return record;
}

export function getHeroCastingLawMaterialIconUrl(
  itemId: number,
  sourceIconPath: string | null | undefined,
) {
  return getHeroCastingLawMaterialIconAsset(itemId, sourceIconPath)?.deliveryUrl ?? null;
}

export function getHeroCastingLawMaterialIconAssetCount() {
  return byItemId.size;
}
