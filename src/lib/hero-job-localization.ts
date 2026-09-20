import { HERO_JOB_LOCALIZATION_PART_1 } from "./hero-job-localization.part1";
import { HERO_JOB_LOCALIZATION_PART_2 } from "./hero-job-localization.part2";
import { HERO_JOB_LOCALIZATION_PART_3 } from "./hero-job-localization.part3";
import { HERO_JOB_LOCALIZATION_PART_4 } from "./hero-job-localization.part4";
import { HERO_JOB_LOCALIZATION_PART_5 } from "./hero-job-localization.part5";
import { HERO_JOB_LOCALIZATION_PART_6 } from "./hero-job-localization.part6";
import { HERO_JOB_LOCALIZATION_PART_7 } from "./hero-job-localization.part7";
import { HERO_JOB_LOCALIZATION_PART_8 } from "./hero-job-localization.part8";

type HeroJobLocalizationRecord = {
  nameCn: string;
  nameKr: string | null;
  status: "CONFIRMED_KR" | "UNRELEASED_KR";
};

// Presentation-only localization overlay derived from the reviewed 2026-09-20 job-name source.
// Job ID is the only lookup key. Chinese name is a stale-snapshot guard and never creates a JOIN.
const HERO_JOB_LOCALIZATION = new Map<number, HeroJobLocalizationRecord>([
  ...HERO_JOB_LOCALIZATION_PART_1,
  ...HERO_JOB_LOCALIZATION_PART_2,
  ...HERO_JOB_LOCALIZATION_PART_3,
  ...HERO_JOB_LOCALIZATION_PART_4,
  ...HERO_JOB_LOCALIZATION_PART_5,
  ...HERO_JOB_LOCALIZATION_PART_6,
  ...HERO_JOB_LOCALIZATION_PART_7,
  ...HERO_JOB_LOCALIZATION_PART_8,
]);

if (HERO_JOB_LOCALIZATION.size !== 804) {
  throw new Error("Hero job Korean localization coverage mismatch.");
}

export function resolveHeroJobNameKr(input: { jobId: number | null; nameCn: string | null }) {
  if (!Number.isSafeInteger(input.jobId) || input.jobId == null || input.jobId <= 0) return null;
  const record = HERO_JOB_LOCALIZATION.get(input.jobId);
  if (!record) return null;
  if (!input.nameCn || input.nameCn !== record.nameCn) return null;
  return record.nameKr;
}
