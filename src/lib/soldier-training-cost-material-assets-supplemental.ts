import supplementalManifestJson from "../../data/manifests/soldier-training-material-cost-assets-supplemental.v1.json";
import { getSoldierTrainingMaterialIconUrl } from "./soldier-training-material-assets";

type SupplementalCostMaterialAssetRecord = {
  itemId: number;
  configIconPath: string;
  driveFileId: string;
  driveFileName: string;
  repoPngPath: string;
  pngSha256: string;
  byteSize: number;
  width: number;
  height: number;
  mode: string;
  admissionStatus: string;
};

type SupplementalCostMaterialAssetManifest = {
  version: number;
  schemaId: string;
  status: string;
  completion: string;
  records: SupplementalCostMaterialAssetRecord[];
  summary: {
    target: number;
    deliveredPng: number;
    dimensions172x172: number;
    rgba: number;
    uniqueItemIds: number;
    uniqueDriveFileIds: number;
    uniqueRepoPngPaths: number;
    missing: number;
    errors: number;
  };
};

const manifest = supplementalManifestJson as SupplementalCostMaterialAssetManifest;
const supplementalByItemId = new Map(manifest.records.map((record) => [record.itemId, record]));

const supplementalAssetsReady =
  manifest.schemaId === "soldier-training-cost-material-assets-supplemental/v1" &&
  manifest.status === "PASS" &&
  manifest.completion === "COMPLETE" &&
  manifest.summary.target === 24 &&
  manifest.summary.deliveredPng === 24 &&
  manifest.summary.dimensions172x172 === 24 &&
  manifest.summary.rgba === 24 &&
  manifest.summary.uniqueItemIds === 24 &&
  manifest.summary.uniqueDriveFileIds === 24 &&
  manifest.summary.uniqueRepoPngPaths === 24 &&
  manifest.summary.missing === 0 &&
  manifest.summary.errors === 0 &&
  supplementalByItemId.size === 24;

if (!supplementalAssetsReady) {
  throw new Error("Soldier training cost-material supplemental PNG manifest is not production-ready.");
}

for (const record of supplementalByItemId.values()) {
  if (
    record.width !== 172 ||
    record.height !== 172 ||
    record.mode !== "RGBA" ||
    record.admissionStatus !== "DELIVERED_EXACT_PNG" ||
    !/^UI\/Icon\/Item_ABS\/Training_[A-Za-z0-9]+\.png$/.test(record.configIconPath) ||
    !/^public\/images\/soldier-training-materials\/\d+\.png$/.test(record.repoPngPath) ||
    record.repoPngPath !== `public/images/soldier-training-materials/${record.itemId}.png`
  ) {
    throw new Error(`Soldier training supplemental cost-material asset record is invalid: ${record.itemId}`);
  }
}

function toPublicUrl(publicPath: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const publicRelativePath = publicPath.replace(/^public\//, "");
  return `${normalizedBase}${publicRelativePath}`;
}

export function getSupplementalSoldierTrainingCostMaterialIconUrl(itemId: number): string | null {
  const record = supplementalByItemId.get(itemId);
  return record ? toPublicUrl(record.repoPngPath) : null;
}

export function getSoldierTrainingCostMaterialIconUrl(itemId: number): string | null {
  // Keep the frozen A6 resolver authoritative; the supplemental set only fills its exact missing IDs.
  return getSoldierTrainingMaterialIconUrl(itemId) ?? getSupplementalSoldierTrainingCostMaterialIconUrl(itemId);
}

export function areSupplementalSoldierTrainingCostMaterialAssetsReady(): boolean {
  return supplementalAssetsReady;
}

export function getSupplementalSoldierTrainingCostMaterialAssetCount(): number {
  return supplementalByItemId.size;
}
