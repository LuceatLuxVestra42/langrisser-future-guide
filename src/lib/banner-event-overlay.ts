import { resolveEventBannerAssetUrl } from "@/components/banner-events/event-banner-assets";

export type BannerEventOverlayRow = {
  eventOccurrenceId: string;
  krDisplayDate: string;
  eventNameKr: string;
  image: {
    canRenderImage: true;
    publicPath: string;
    placeholderKey: null;
  };
  spCandidateNames: readonly string[];
  sourceSheetRow: number;
  sourceMedia: string;
};

const SP_RACHEL_CANDIDATES = [
  "레이첼",
  "유리아",
  "보젤",
  "루나",
  "티아리스",
  "란디우스",
  "란포드",
  "베른",
  "아멜다",
  "디하르트",
  "레딘",
  "레온",
  "알테뮬러",
  "라나",
  "매튜",
  "쉐리",
  "시그마",
  "엘윈",
] as const;

const SP_OMEGA_RACHEL_CANDIDATES = ["오메가", ...SP_RACHEL_CANDIDATES] as const;

const EVENT_IMAGE_PATHS = {
  equipmentWish: "/images/banners/events/equipment-wish.webp",
  sealedBattlefield: "/images/banners/events/sealed-battlefield.webp",
  timeSpacePrayer: "/images/banners/events/time-space-prayer.webp",
  spStoneRachel: "/images/banners/events/sp-stone-rachel.webp",
  goldenSea: "/images/banners/events/golden-sea.webp",
  tekksetterReunion: "/images/banners/events/tekksetter-reunion.webp",
  spStoneOmegaRachel: "/images/banners/events/sp-stone-omega-rachel.webp",
  endOfStarsea: "/images/banners/events/end-of-starsea.webp",
  bloodmoonLand: "/images/banners/events/bloodmoon-land.webp",
  chaosThrone: "/images/banners/events/chaos-throne.webp",
} as const;

function eventImage(sourcePath: string) {
  return {
    canRenderImage: true as const,
    publicPath: resolveEventBannerAssetUrl(sourcePath),
    placeholderKey: null,
  };
}

function eventRow(
  eventOccurrenceId: string,
  krDisplayDate: string,
  eventNameKr: string,
  sourcePath: string,
  sourceSheetRow: number,
  sourceMedia: string,
  spCandidateNames: readonly string[] = [],
): BannerEventOverlayRow {
  return {
    eventOccurrenceId,
    krDisplayDate,
    eventNameKr,
    image: eventImage(sourcePath),
    spCandidateNames,
    sourceSheetRow,
    sourceMedia,
  };
}

// Presentation-only overlay copied from the existing Korean `배너표` → `배너+이벤트`
// spreadsheet. It does not promote or alter frozen Banner definition/asset identities.
export const BANNER_EVENT_OVERLAY: readonly BannerEventOverlayRow[] = [
  eventRow(
    "bevent:kr-sheet:20260819:equipment-wish",
    "2026-08-19",
    "소원소환 장비뽑기",
    EVENT_IMAGE_PATHS.equipmentWish,
    17,
    "image52.jpg",
  ),
  eventRow(
    "bevent:kr-sheet:20260826:sealed-battlefield",
    "2026-08-26",
    "봉인된 전장",
    EVENT_IMAGE_PATHS.sealedBattlefield,
    21,
    "image76.png",
  ),
  eventRow(
    "bevent:kr-sheet:20260923:time-space-prayer",
    "2026-09-23",
    "시공간을 건너는 기원",
    EVENT_IMAGE_PATHS.timeSpacePrayer,
    35,
    "image146.png",
  ),
  eventRow(
    "bevent:kr-sheet:20260923:sp-stone-rachel",
    "2026-09-23",
    "SP 스톤 뽑기",
    EVENT_IMAGE_PATHS.spStoneRachel,
    34,
    "image90.png",
    SP_RACHEL_CANDIDATES,
  ),
  eventRow(
    "bevent:kr-sheet:20260930:golden-sea",
    "2026-09-30",
    "무한항로, 황금의 바다",
    EVENT_IMAGE_PATHS.goldenSea,
    42,
    "image103.png",
  ),
  eventRow(
    "bevent:kr-sheet:20261007:equipment-wish",
    "2026-10-07",
    "소원소환 장비뽑기",
    EVENT_IMAGE_PATHS.equipmentWish,
    53,
    "image52.jpg",
  ),
  eventRow(
    "bevent:kr-sheet:20261021:sp-stone-rachel",
    "2026-10-21",
    "SP 스톤 뽑기",
    EVENT_IMAGE_PATHS.spStoneRachel,
    58,
    "image90.png",
    SP_RACHEL_CANDIDATES,
  ),
  eventRow(
    "bevent:kr-sheet:20261021:sealed-battlefield",
    "2026-10-21",
    "봉인된 전장",
    EVENT_IMAGE_PATHS.sealedBattlefield,
    59,
    "image76.png",
  ),
  eventRow(
    "bevent:kr-sheet:20261111:tekksetter-reunion",
    "2026-11-11",
    "TekkSetter! 운명의 재회",
    EVENT_IMAGE_PATHS.tekksetterReunion,
    67,
    "image179.png",
  ),
  eventRow(
    "bevent:kr-sheet:20261118:sp-stone-rachel",
    "2026-11-18",
    "SP 스톤 뽑기",
    EVENT_IMAGE_PATHS.spStoneRachel,
    68,
    "image90.png",
    SP_RACHEL_CANDIDATES,
  ),
  eventRow(
    "bevent:kr-sheet:20261209:sp-stone-omega-rachel",
    "2026-12-09",
    "SP 스톤 뽑기",
    EVENT_IMAGE_PATHS.spStoneOmegaRachel,
    80,
    "image211.png",
    SP_OMEGA_RACHEL_CANDIDATES,
  ),
  eventRow(
    "bevent:kr-sheet:20261216:golden-sea",
    "2026-12-16",
    "무한항로, 황금의 바다",
    EVENT_IMAGE_PATHS.goldenSea,
    81,
    "image103.png",
  ),
  eventRow(
    "bevent:kr-sheet:20261216:equipment-wish",
    "2026-12-16",
    "소원소환 장비뽑기",
    EVENT_IMAGE_PATHS.equipmentWish,
    84,
    "image52.jpg",
  ),
  eventRow(
    "bevent:kr-sheet:20270106:sealed-battlefield",
    "2027-01-06",
    "봉인된 전장",
    EVENT_IMAGE_PATHS.sealedBattlefield,
    95,
    "image76.png",
  ),
  eventRow(
    "bevent:kr-sheet:20270113:end-of-starsea",
    "2027-01-13",
    "별바다의 끝",
    EVENT_IMAGE_PATHS.endOfStarsea,
    99,
    "image180.png",
  ),
  eventRow(
    "bevent:kr-sheet:20270113:sp-stone-omega-rachel",
    "2027-01-13",
    "SP 스톤 뽑기",
    EVENT_IMAGE_PATHS.spStoneOmegaRachel,
    100,
    "image211.png",
    SP_OMEGA_RACHEL_CANDIDATES,
  ),
  eventRow(
    "bevent:kr-sheet:20270203:bloodmoon-land",
    "2027-02-03",
    "블러드문 랜드",
    EVENT_IMAGE_PATHS.bloodmoonLand,
    108,
    "image184.png",
  ),
  eventRow(
    "bevent:kr-sheet:20270210:sp-stone-omega-rachel",
    "2027-02-10",
    "SP 스톤 뽑기",
    EVENT_IMAGE_PATHS.spStoneOmegaRachel,
    113,
    "image211.png",
    SP_OMEGA_RACHEL_CANDIDATES,
  ),
  eventRow(
    "bevent:kr-sheet:20270303:chaos-throne",
    "2027-03-03",
    "도착! 혼란에 빠진 왕좌",
    EVENT_IMAGE_PATHS.chaosThrone,
    122,
    "image276.png",
  ),
];
