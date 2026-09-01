import manifest from "../../data/generated/skin-fullart-reference.v1.json";

export type SkinFullartVisual = {
  skinId: number;
  sourceOrder: number;
  publicPath: string;
};

export function getSkinFullartVisuals(heroId: number): SkinFullartVisual[] {
  return manifest.records
    .filter((record) => record.heroId === heroId)
    .sort((a, b) => a.sourceOrder - b.sourceOrder)
    .map((record) => ({
      skinId: record.skinId,
      sourceOrder: record.sourceOrder,
      publicPath: record.publicPath,
    }));
}
