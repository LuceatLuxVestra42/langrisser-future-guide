import soldierTrainingMaterialManifestJson from "../../data/generated/soldier-training-material-web-manifest.v1.json";

type SoldierTrainingMaterialAssetRecord = {
  itemId: number;
  name: string;
  iconPath: string;
  sourceFileName: string;
  sourceRepositoryPath: string;
  sourceSha256: string;
  sourceSize: number;
  fileName: string;
  webRepositoryPath: string;
  webPath: string;
  webSha256: string;
  webSize: number;
  width: number;
  height: number;
  pixelParity: string;
};

type SoldierTrainingMaterialManifest = {
  schemaId: string;
  status: string;
  assetsReady: boolean;
  sourceRoot: string;
  publicRoot: string;
  coverage: {
    expectedCount: number;
    resolvedCount: number;
    unresolvedCount: number;
  };
  records: SoldierTrainingMaterialAssetRecord[];
};

const manifest = soldierTrainingMaterialManifestJson as SoldierTrainingMaterialManifest;
const assetByItemId = new Map(manifest.records.map((record) => [record.itemId, record]));

export function getSoldierTrainingMaterialAsset(itemId: number) {
  return assetByItemId.get(itemId) ?? null;
}

export function getSoldierTrainingMaterialUrl(itemId: number): string | null {
  if (!manifest.assetsReady) return null;
  const record = assetByItemId.get(itemId);
  if (!record) return null;
  return `${import.meta.env.BASE_URL}${manifest.publicRoot}/${record.fileName}`;
}

export function areSoldierTrainingMaterialAssetsReady(): boolean {
  return (
    manifest.status === "PASS_SOLDIER_TRAINING_MATERIAL_WEBP" &&
    manifest.assetsReady &&
    manifest.coverage.expectedCount === 24 &&
    manifest.coverage.resolvedCount === 24 &&
    manifest.coverage.unresolvedCount === 0 &&
    assetByItemId.size === 24
  );
}
