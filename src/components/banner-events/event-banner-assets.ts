import bloodmoonLand from "./assets/bloodmoon-land.webp";
import chaosThrone from "./assets/chaos-throne.webp";
import endOfStarsea from "./assets/end-of-starsea.webp";
import equipmentWish from "./assets/equipment-wish.webp";
import goldenSea from "./assets/golden-sea.webp";
import sealedBattlefield from "./assets/sealed-battlefield.webp";
import spStoneOmegaRachel from "./assets/sp-stone-omega-rachel.webp";
import spStoneRachel from "./assets/sp-stone-rachel.webp";
import tekksetterReunion from "./assets/tekksetter-reunion.webp";
import timeSpacePrayer from "./assets/time-space-prayer.webp";

const EVENT_BANNER_ASSET_BY_LEGACY_PATH = new Map<string, string>([
  ["/images/banners/events/bloodmoon-land.webp", bloodmoonLand],
  ["/images/banners/events/chaos-throne.webp", chaosThrone],
  ["/images/banners/events/end-of-starsea.webp", endOfStarsea],
  ["/images/banners/events/equipment-wish.webp", equipmentWish],
  ["/images/banners/events/golden-sea.webp", goldenSea],
  ["/images/banners/events/sealed-battlefield.webp", sealedBattlefield],
  ["/images/banners/events/sp-stone-omega-rachel.webp", spStoneOmegaRachel],
  ["/images/banners/events/sp-stone-rachel.webp", spStoneRachel],
  ["/images/banners/events/tekksetter-reunion.webp", tekksetterReunion],
  ["/images/banners/events/time-space-prayer.webp", timeSpacePrayer],
]);

function removeRepositoryBase(assetUrl: string) {
  const baseUrl = import.meta.env.BASE_URL;
  if (baseUrl !== "/" && assetUrl.startsWith(baseUrl)) {
    return `/${assetUrl.slice(baseUrl.length)}`;
  }
  return assetUrl;
}

export function resolveEventBannerAssetUrl(legacyPath: string) {
  const assetUrl = EVENT_BANNER_ASSET_BY_LEGACY_PATH.get(legacyPath);
  if (!assetUrl) throw new Error(`Unknown event banner presentation asset: ${legacyPath}`);
  return removeRepositoryBase(assetUrl);
}
