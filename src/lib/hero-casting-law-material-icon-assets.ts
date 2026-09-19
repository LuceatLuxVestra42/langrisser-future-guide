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
  sourceDeliveryUrl: string;
  spritePath: string;
  spriteSymbolId: string;
  deliveryMode: "LOCAL_SVG_SPRITE";
};

type CastingLawMaterialIconManifest = {
  version: 1;
  schemaId: "hero-casting-law-material-icons/v1";
  status: "PASS";
  completion: "LOCAL_MIRRORED";
  delivery: {
    spritePath: string;
    publicPath: string;
    symbolRule: string;
    sourcePixelFormat: string;
    wrapperFormat: string;
    sourceDimensions: string;
    externallyHostedAtRuntime: boolean;
  };
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
    localSpriteSymbols: number;
    runtimeExternalDependencies: number;
  };
};

const manifest = manifestRaw as CastingLawMaterialIconManifest;

if (
  manifest.version !== 1 ||
  manifest.schemaId !== "hero-casting-law-material-icons/v1" ||
  manifest.status !== "PASS" ||
  manifest.completion !== "LOCAL_MIRRORED" ||
  manifest.delivery.spritePath !== "public/images/heroes/casting-law-material-icons.svg" ||
  manifest.delivery.publicPath !== "images/heroes/casting-law-material-icons.svg" ||
  manifest.delivery.symbolRule !== "casting-law-item-{itemId}" ||
  manifest.delivery.sourcePixelFormat !== "PNG" ||
  manifest.delivery.wrapperFormat !== "SVG symbol sprite" ||
  manifest.delivery.sourceDimensions !== "172x172 RGBA" ||
  manifest.delivery.externallyHostedAtRuntime !== false ||
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
  manifest.summary.localSpriteSymbols !== 45 ||
  manifest.summary.runtimeExternalDependencies !== 0 ||
  manifest.records.length !== 45
) {
  throw new Error("Hero Casting Law material icon manifest is not production-ready.");
}

const byItemId = new Map<number, CastingLawMaterialIconRecord>();
const driveFileIds = new Set<string>();
const symbolIds = new Set<string>();

for (const record of manifest.records) {
  const sourceFileName = record.sourceIconPath.split("/").pop() ?? "";
  const expectedSymbolId = `casting-law-item-${record.itemId}`;
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
    record.sourceDeliveryUrl !== `https://drive.google.com/uc?export=view&id=${record.driveFileId}` ||
    record.spritePath !== manifest.delivery.spritePath ||
    record.spriteSymbolId !== expectedSymbolId ||
    symbolIds.has(record.spriteSymbolId) ||
    record.deliveryMode !== "LOCAL_SVG_SPRITE"
  ) {
    throw new Error(`Hero Casting Law material icon manifest record is invalid for itemId=${record.itemId}.`);
  }
  byItemId.set(record.itemId, record);
  driveFileIds.add(record.driveFileId);
  symbolIds.add(record.spriteSymbolId);
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

export function getHeroCastingLawMaterialIconSymbolId(
  itemId: number,
  sourceIconPath: string | null | undefined,
) {
  return getHeroCastingLawMaterialIconAsset(itemId, sourceIconPath)?.spriteSymbolId ?? null;
}

export function getHeroCastingLawMaterialIconPublicPath() {
  return manifest.delivery.publicPath;
}

export function getHeroCastingLawMaterialIconAssetCount() {
  return byItemId.size;
}
