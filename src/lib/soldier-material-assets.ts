const SOLDIER_MATERIAL_ASSET_FILES = new Map<string, string>([
  ["6:6043", "Training_Sword04.webp"],
  ["6:6044", "Training_Spear04.webp"],
  ["6:6045", "Training_Ride04.webp"],
  ["6:6046", "Training_Fly04.webp"],
  ["6:6047", "Training_Bow04.webp"],
  ["6:6048", "Training_Monk04.webp"],
  ["6:6503", "Training_sp.webp"],
]);

export function getSoldierMaterialAssetUrl(goodsType: number, itemId: number) {
  const fileName = SOLDIER_MATERIAL_ASSET_FILES.get(`${goodsType}:${itemId}`);
  if (!fileName) return null;

  return `${import.meta.env.BASE_URL}images/soldier-materials/${fileName}`;
}
