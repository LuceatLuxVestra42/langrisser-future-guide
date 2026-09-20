import { HERO_FINAL_JOB_LOCALIZATION_PART_1 } from "./hero-final-job-localization.part1";
import { HERO_FINAL_JOB_LOCALIZATION_PART_2 } from "./hero-final-job-localization.part2";
import { HERO_FINAL_JOB_LOCALIZATION_PART_3 } from "./hero-final-job-localization.part3";
import { HERO_FINAL_JOB_LOCALIZATION_PART_4 } from "./hero-final-job-localization.part4";

type HeroJobLocalizationRecord = {
  nameCn: string;
  nameKr: string | null;
  status: "CONFIRMED_KR" | "UNRELEASED_KR";
};

// Presentation-only localization overlay derived from the reviewed 2026-09-20 job-name source.
// Job ID is the only lookup key. Chinese name is a stale-snapshot guard and never creates a JOIN.
const HERO_FINAL_JOB_LOCALIZATION = new Map<number, HeroJobLocalizationRecord>([
  ...HERO_FINAL_JOB_LOCALIZATION_PART_1,
  ...HERO_FINAL_JOB_LOCALIZATION_PART_2,
  ...HERO_FINAL_JOB_LOCALIZATION_PART_3,
  ...HERO_FINAL_JOB_LOCALIZATION_PART_4,
]);

if (HERO_FINAL_JOB_LOCALIZATION.size !== 344) {
  throw new Error("Hero final-job Korean localization coverage mismatch.");
}

export function resolveHeroFinalJobNameKr(input: { jobId: number | null; nameCn: string | null }) {
  if (!Number.isSafeInteger(input.jobId) || input.jobId == null || input.jobId <= 0) return null;
  const record = HERO_FINAL_JOB_LOCALIZATION.get(input.jobId);
  if (!record) return null;
  if (!input.nameCn || input.nameCn !== record.nameCn) return null;
  return record.nameKr;
}
