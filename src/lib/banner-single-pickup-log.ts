export type SinglePickupLogEntry = {
  date: string;
  note: string | null;
};

export type SinglePickupLogRecord = {
  heroNameKr: string;
  artworkPublicPath: string;
  entries: SinglePickupLogEntry[];
};

export type LlrPickupLogRecord = {
  bannerNameKr: string;
  artworkPublicPath: string;
  entries: SinglePickupLogEntry[];
};

// Presentation/history source: existing Korean `배너표` spreadsheet,
// `픽업 log` sheet, left-side `픽업 배너(1인 SSR)` section (A:Q).
// Cutoff: 2026-09-03. The 2026-09-23 future row is intentionally excluded.
// Artwork paths reuse the repository's verified Picture_Notice presentation assets.
export const SINGLE_PICKUP_LOG: SinglePickupLogRecord[] = [
  {
    heroNameKr: "웨탐",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_3902.webp",
    entries: [
      { date: "2022-05-11", note: "출시" },
      { date: "2022-11-02", note: null },
      { date: "2023-05-10", note: "4주년" },
      { date: "2023-09-20", note: "추석" },
      { date: "2024-01-31", note: "설" },
      { date: "2024-04-10", note: null },
      { date: "2024-10-09", note: "추석" },
      { date: "2025-01-28", note: "설" },
      { date: "2025-04-16", note: null },
      { date: "2025-06-11", note: "6주년" },
      { date: "2025-10-08", note: "추석" },
      { date: "2026-02-25", note: "설" },
      { date: "2026-04-29", note: null },
      { date: "2026-06-24", note: "7주년" },
    ],
  },
  {
    heroNameKr: "각성자",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_5701.webp",
    entries: [
      { date: "2023-09-27", note: "출시" },
      { date: "2024-02-09", note: "설" },
      { date: "2024-04-10", note: null },
      { date: "2024-06-05", note: "5주년" },
      { date: "2024-10-02", note: "추석" },
      { date: "2025-01-28", note: "설" },
      { date: "2025-04-16", note: null },
      { date: "2025-06-11", note: "6주년" },
      { date: "2025-09-24", note: "추석" },
      { date: "2026-02-11", note: "설" },
      { date: "2026-04-29", note: null },
      { date: "2026-06-24", note: "7주년" },
    ],
  },
  {
    heroNameKr: "강신자",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_6401.webp",
    entries: [
      { date: "2024-04-10", note: "출시" },
      { date: "2024-10-02", note: "추석" },
      { date: "2025-01-28", note: "설" },
      { date: "2025-04-16", note: null },
      { date: "2025-06-11", note: "6주년" },
      { date: "2025-10-08", note: "추석" },
      { date: "2026-02-25", note: "설" },
      { date: "2026-04-29", note: null },
      { date: "2026-06-24", note: "7주년" },
    ],
  },
  {
    heroNameKr: "엔야",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_7701.webp",
    entries: [
      { date: "2025-04-16", note: "출시" },
      { date: "2025-09-24", note: "추석" },
      { date: "2026-02-11", note: "설" },
      { date: "2026-04-22", note: null },
      { date: "2026-06-17", note: "7주년" },
    ],
  },
  {
    heroNameKr: "시엘나",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_8301.webp",
    entries: [
      { date: "2025-09-24", note: "출시" },
      { date: "2026-04-15", note: null },
      { date: "2026-06-10", note: "7주년" },
    ],
  },
  {
    heroNameKr: "흄바바",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_9001.webp",
    entries: [{ date: "2026-04-08", note: "출시" }],
  },
];

// Presentation/history source: the same `픽업 log` sheet,
// right-side `픽업 배너(소원소환 + LLR)` section (R:AL).
// Only rows whose source banner image is explicitly marked LLR are included.
// The recurring wish-summon block and the future 2027-01-13 LLR row are excluded.
export const LLR_PICKUP_LOG: LlrPickupLogRecord[] = [
  {
    bannerNameKr: "빙설 심연의 지배자",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_7001.webp",
    entries: [
      { date: "2024-09-24", note: "출시" },
      { date: "2025-06-04", note: "6주년" },
      { date: "2026-04-15", note: null },
      { date: "2026-06-10", note: "7주년" },
    ],
  },
  {
    bannerNameKr: "빛의 소환사",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_7401.webp",
    entries: [
      { date: "2025-01-15", note: "출시" },
      { date: "2025-10-01", note: "추석" },
      { date: "2026-02-18", note: "설" },
      { date: "2026-04-29", note: null },
      { date: "2026-06-17", note: "7주년" },
    ],
  },
  {
    bannerNameKr: "염룡 파멸자",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_8001.webp",
    entries: [
      { date: "2025-07-02", note: "출시" },
      { date: "2025-12-17", note: null },
      { date: "2026-05-27", note: "7주년" },
    ],
  },
  {
    bannerNameKr: "마안의 서큐버스",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_8501.webp",
    entries: [
      { date: "2025-11-19", note: "출시" },
      { date: "2026-04-29", note: null },
      { date: "2026-06-24", note: "7주년" },
    ],
  },
  {
    bannerNameKr: "빛과 어둠의 반역자",
    artworkPublicPath: "/images/banners/Picture_Notice/Picture_Notice_9201.webp",
    entries: [{ date: "2026-06-03", note: "출시" }],
  },
];
