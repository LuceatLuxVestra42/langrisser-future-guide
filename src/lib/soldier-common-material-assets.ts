export type SoldierCommonMaterialKey =
  | "gold"
  | "aniki-controller"
  | "fantasy-booster";

const COMMON_MATERIAL_PATHS: Record<SoldierCommonMaterialKey, string> = {
  gold: "images/soldiers/common-materials/gold.webp",
  "aniki-controller": "images/soldiers/common-materials/aniki-controller.webp",
  "fantasy-booster": "images/soldiers/common-materials/fantasy-booster.webp",
};

export function getSoldierCommonMaterialIconUrl(key: SoldierCommonMaterialKey): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${COMMON_MATERIAL_PATHS[key]}`;
}
