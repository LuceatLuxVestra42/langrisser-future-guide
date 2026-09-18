const wikiFileNameBySourcePath = new Map<string, string>([
  ["UI/Icon/Item_ABS/Awaken_Heart1.png", "季风纯心.png"],
  ["UI/Icon/Item_ABS/Awaken_Heart2.png", "净涛纯心.png"],
  ["UI/Icon/Item_ABS/Awaken_Heart3.png", "大陆纯心.png"],
  ["UI/Icon/Item_ABS/Awaken_Heart4.png", "熔火纯心.png"],
  ["UI/Icon/Item_ABS/Awaken_Heart5.png", "光灿纯心.png"],
  ["UI/Icon/Item_ABS/Awaken_Heart6.png", "暗月纯心.png"],
  ["UI/Icon/Item_ABS/Awaken_MoonBrillance.png", "永耀月华.png"],
]);

export function getHeroAwakeningMaterialIconUrl(sourcePath: string | null | undefined) {
  if (!sourcePath) return null;
  const fileName = wikiFileNameBySourcePath.get(sourcePath);
  if (!fileName) return null;
  return `https://wiki.biligame.com/langrisser/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}
