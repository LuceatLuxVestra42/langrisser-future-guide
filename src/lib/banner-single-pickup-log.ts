export type SinglePickupLogEntry = {
  date: string;
  note: string | null;
};

export type SinglePickupLogRecord = {
  heroNameKr: string;
  entries: SinglePickupLogEntry[];
};

// Presentation/history source: existing Korean `배너표` spreadsheet,
// `픽업 log` sheet, left-side `픽업 배너(1인 SSR)` section (A:Q).
// Cutoff: 2026-09-03. The 2026-09-23 future row is intentionally excluded.
export const SINGLE_PICKUP_LOG: SinglePickupLogRecord[] = [
  {
    heroNameKr: "웨탐",
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
    entries: [
      { date: "2025-09-24", note: "출시" },
      { date: "2026-04-15", note: null },
      { date: "2026-06-10", note: "7주년" },
    ],
  },
  {
    heroNameKr: "흄바바",
    entries: [{ date: "2026-04-08", note: "출시" }],
  },
];
