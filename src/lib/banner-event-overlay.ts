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

const SP_OMEGA_RACHEL_CANDIDATES = [
  "오메가",
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

function eventImage(publicPath: string) {
  return {
    canRenderImage: true as const,
    publicPath,
    placeholderKey: null,
  };
}

// Presentation-only overlay copied from the existing Korean `배너표` → `배너+이벤트`
// spreadsheet. It does not promote or alter frozen Banner definition/asset identities.
export const BANNER_EVENT_OVERLAY: readonly BannerEventOverlayRow[] = [
  {
    eventOccurrenceId: "bevent:kr-sheet:20260819:equipment-wish",
    krDisplayDate: "2026-08-19",
    eventNameKr: "소원소환 장비뽑기",
    image: eventImage("/images/banners/events/equipment-wish.webp"),
    spCandidateNames: [],
    sourceSheetRow: 17,
    sourceMedia: "image52.jpg",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20260826:sealed-battlefield",
    krDisplayDate: "2026-08-26",
    eventNameKr: "봉인된 전장",
    image: eventImage("/images/banners/events/sealed-battlefield.webp"),
    spCandidateNames: [],
    sourceSheetRow: 21,
    sourceMedia: "image76.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20260923:time-space-prayer",
    krDisplayDate: "2026-09-23",
    eventNameKr: "시공간을 건너는 기원",
    image: eventImage("/images/banners/events/time-space-prayer.webp"),
    spCandidateNames: [],
    sourceSheetRow: 35,
    sourceMedia: "image146.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20260923:sp-stone-rachel",
    krDisplayDate: "2026-09-23",
    eventNameKr: "SP 스톤 뽑기(택 1)",
    image: eventImage("/images/banners/events/sp-stone-rachel.webp"),
    spCandidateNames: SP_RACHEL_CANDIDATES,
    sourceSheetRow: 34,
    sourceMedia: "image90.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20260930:golden-sea",
    krDisplayDate: "2026-09-30",
    eventNameKr: "무한항로, 황금의 바다",
    image: eventImage("/images/banners/events/golden-sea.webp"),
    spCandidateNames: [],
    sourceSheetRow: 42,
    sourceMedia: "image103.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20261007:equipment-wish",
    krDisplayDate: "2026-10-07",
    eventNameKr: "소원소환 장비뽑기",
    image: eventImage("/images/banners/events/equipment-wish.webp"),
    spCandidateNames: [],
    sourceSheetRow: 53,
    sourceMedia: "image52.jpg",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20261021:sp-stone-rachel",
    krDisplayDate: "2026-10-21",
    eventNameKr: "SP 스톤 뽑기(택 1)",
    image: eventImage("/images/banners/events/sp-stone-rachel.webp"),
    spCandidateNames: SP_RACHEL_CANDIDATES,
    sourceSheetRow: 58,
    sourceMedia: "image90.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20261021:sealed-battlefield",
    krDisplayDate: "2026-10-21",
    eventNameKr: "봉인된 전장",
    image: eventImage("/images/banners/events/sealed-battlefield.webp"),
    spCandidateNames: [],
    sourceSheetRow: 59,
    sourceMedia: "image76.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20261111:tekksetter-reunion",
    krDisplayDate: "2026-11-11",
    eventNameKr: "TekkSetter! 운명의 재회",
    image: eventImage("/images/banners/events/tekksetter-reunion.webp"),
    spCandidateNames: [],
    sourceSheetRow: 67,
    sourceMedia: "image179.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20261118:sp-stone-rachel",
    krDisplayDate: "2026-11-18",
    eventNameKr: "SP 스톤 뽑기(택 1)",
    image: eventImage("/images/banners/events/sp-stone-rachel.webp"),
    spCandidateNames: SP_RACHEL_CANDIDATES,
    sourceSheetRow: 68,
    sourceMedia: "image90.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20261209:sp-stone-omega-rachel",
    krDisplayDate: "2026-12-09",
    eventNameKr: "SP 스톤 뽑기(택 1)",
    image: eventImage("/images/banners/events/sp-stone-omega-rachel.webp"),
    spCandidateNames: SP_OMEGA_RACHEL_CANDIDATES,
    sourceSheetRow: 80,
    sourceMedia: "image211.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20261216:golden-sea",
    krDisplayDate: "2026-12-16",
    eventNameKr: "무한항로, 황금의 바다",
    image: eventImage("/images/banners/events/golden-sea.webp"),
    spCandidateNames: [],
    sourceSheetRow: 81,
    sourceMedia: "image103.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20261216:equipment-wish",
    krDisplayDate: "2026-12-16",
    eventNameKr: "소원소환 장비뽑기",
    image: eventImage("/images/banners/events/equipment-wish.webp"),
    spCandidateNames: [],
    sourceSheetRow: 84,
    sourceMedia: "image52.jpg",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20270106:sealed-battlefield",
    krDisplayDate: "2027-01-06",
    eventNameKr: "봉인된 전장",
    image: eventImage("/images/banners/events/sealed-battlefield.webp"),
    spCandidateNames: [],
    sourceSheetRow: 95,
    sourceMedia: "image76.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20270113:end-of-starsea",
    krDisplayDate: "2027-01-13",
    eventNameKr: "별바다의 끝",
    image: eventImage("/images/banners/events/end-of-starsea.webp"),
    spCandidateNames: [],
    sourceSheetRow: 99,
    sourceMedia: "image180.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20270113:sp-stone-omega-rachel",
    krDisplayDate: "2027-01-13",
    eventNameKr: "SP 스톤 뽑기(택 1)",
    image: eventImage("/images/banners/events/sp-stone-omega-rachel.webp"),
    spCandidateNames: SP_OMEGA_RACHEL_CANDIDATES,
    sourceSheetRow: 100,
    sourceMedia: "image211.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20270203:bloodmoon-land",
    krDisplayDate: "2027-02-03",
    eventNameKr: "블러드문 랜드",
    image: eventImage("/images/banners/events/bloodmoon-land.webp"),
    spCandidateNames: [],
    sourceSheetRow: 108,
    sourceMedia: "image184.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20270210:sp-stone-omega-rachel",
    krDisplayDate: "2027-02-10",
    eventNameKr: "SP 스톤 뽑기(택 1)",
    image: eventImage("/images/banners/events/sp-stone-omega-rachel.webp"),
    spCandidateNames: SP_OMEGA_RACHEL_CANDIDATES,
    sourceSheetRow: 113,
    sourceMedia: "image211.png",
  },
  {
    eventOccurrenceId: "bevent:kr-sheet:20270303:chaos-throne",
    krDisplayDate: "2027-03-03",
    eventNameKr: "도착! 혼란에 빠진 왕좌",
    image: eventImage("/images/banners/events/chaos-throne.webp"),
    spCandidateNames: [],
    sourceSheetRow: 122,
    sourceMedia: "image276.png",
  },
];
