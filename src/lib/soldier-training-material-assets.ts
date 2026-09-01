import soldierTrainingMaterialManifestJson from "../../data/manifests/soldier-training-material-assets-a6-webp.v1.json";

type SoldierTrainingMaterialRecord = {
  itemId: number;
  sourcePngPath: string;
  sourcePngSha256: string;
  webpPath: string;
  webpSha256: string;
  width: number;
  height: number;
  sourceMode: string;
  decodedWebpMode: string;
  lossless: boolean;
  exactTransparentRgb: boolean;
  pixelParity: boolean;
  alphaParity: boolean;
  deliveryStatus: string;
};

type SoldierTrainingMaterialManifest = {
  version: number;
  schemaId: string;
  stage: string;
  status: string;
  completion: string;
  delivery: {
    webpRoot: string;
    webpNamingRule: string;
    lossless: boolean;
    decodedPixelParityRequired: boolean;
  };
  records: SoldierTrainingMaterialRecord[];
  summary: {
    target: number;
    sourcePng: number;
    webpGenerated: number;
    webpVerified: number;
    dimensions172x172: number;
    losslessPixelParity: number;
    alphaParity: number;
    uniqueItemIds: number;
    uniqueWebpPaths: number;
    missing: number;
    extras: number;
    errors: number;
  };
};

const manifest = soldierTrainingMaterialManifestJson as SoldierTrainingMaterialManifest;
const materialByItemId = new Map(manifest.records.map((record) => [record.itemId, record]));

const assetsReady =
  manifest.schemaId === "soldier-training-material-assets-a6-webp-delivery/v1" &&
  manifest.status === "PASS" &&
  manifest.completion === "COMPLETE" &&
  manifest.delivery.lossless === true &&
  manifest.delivery.decodedPixelParityRequired === true &&
  manifest.summary.target === 24 &&
  manifest.summary.sourcePng === 24 &&
  manifest.summary.webpGenerated === 24 &&
  manifest.summary.webpVerified === 24 &&
  manifest.summary.dimensions172x172 === 24 &&
  manifest.summary.losslessPixelParity === 24 &&
  manifest.summary.alphaParity === 24 &&
  manifest.summary.uniqueItemIds === 24 &&
  manifest.summary.uniqueWebpPaths === 24 &&
  manifest.summary.missing === 0 &&
  manifest.summary.extras === 0 &&
  manifest.summary.errors === 0 &&
  materialByItemId.size === 24;

if (!assetsReady) {
  throw new Error("Soldier training material A6 WebP manifest is not production-ready.");
}

for (const record of materialByItemId.values()) {
  if (
    record.width !== 172 ||
    record.height !== 172 ||
    record.sourceMode !== "RGBA" ||
    record.decodedWebpMode !== "RGBA" ||
    record.lossless !== true ||
    record.exactTransparentRgb !== true ||
    record.pixelParity !== true ||
    record.alphaParity !== true ||
    record.deliveryStatus !== "DELIVERED_LOSSLESS" ||
    !/^public\/images\/soldier-training-materials-webp\/\d+\.webp$/.test(record.webpPath)
  ) {
    throw new Error(`Soldier training material asset record is invalid: ${record.itemId}`);
  }
}

export function getSoldierTrainingMaterialIconUrl(itemId: number): string | null {
  const record = materialByItemId.get(itemId);
  if (!record) return null;

  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const publicRelativePath = record.webpPath.replace(/^public\//, "");
  return `${normalizedBase}${publicRelativePath}`;
}

export function getSoldierTrainingMaterialAsset(itemId: number) {
  return materialByItemId.get(itemId) ?? null;
}

export function areSoldierTrainingMaterialAssetsReady(): boolean {
  return assetsReady;
}

export function getSoldierTrainingMaterialAssetCount(): number {
  return materialByItemId.size;
}
