export const HERO_FINAL_JOB_STAT_KEYS = ["HP", "ATK", "INT", "DEF", "MDEF", "DEX"] as const;

export type HeroFinalJobStatKey = (typeof HERO_FINAL_JOB_STAT_KEYS)[number];

export const HERO_FINAL_JOB_STAT_LABELS: Record<HeroFinalJobStatKey, string> = {
  HP: "생명",
  ATK: "공격",
  INT: "지력",
  DEF: "방어",
  MDEF: "마방",
  DEX: "기술",
};

export const HERO_FINAL_JOB_STAT_DOMAINS: Record<HeroFinalJobStatKey, { min: number; max: number }> = {
  HP: { min: 2409, max: 5976 },
  ATK: { min: 201, max: 655 },
  INT: { min: 161, max: 609 },
  DEF: { min: 177, max: 418 },
  MDEF: { min: 135, max: 426 },
  DEX: { min: 45, max: 341 },
};

export const HERO_FINAL_JOB_STAT_BAR_MIN_PERCENT = 25;
export const HERO_FINAL_JOB_STAT_BAR_MAX_PERCENT = 100;

export function getHeroFinalJobStatBarPercent(stat: HeroFinalJobStatKey, value: number) {
  const domain = HERO_FINAL_JOB_STAT_DOMAINS[stat];
  if (!Number.isFinite(value) || domain.max <= domain.min) {
    throw new Error(`Hero ${stat} stat bar received an invalid value or domain.`);
  }
  if (value < domain.min || value > domain.max) {
    throw new Error(`Hero ${stat} stat ${value} is outside the current presentation domain ${domain.min}-${domain.max}.`);
  }

  const ratio = (value - domain.min) / (domain.max - domain.min);
  return Math.min(
    HERO_FINAL_JOB_STAT_BAR_MAX_PERCENT,
    Math.max(
      HERO_FINAL_JOB_STAT_BAR_MIN_PERCENT,
      HERO_FINAL_JOB_STAT_BAR_MIN_PERCENT
        + ratio * (HERO_FINAL_JOB_STAT_BAR_MAX_PERCENT - HERO_FINAL_JOB_STAT_BAR_MIN_PERCENT),
    ),
  );
}

export function getHeroFinalJobStatExtreme(stat: HeroFinalJobStatKey, value: number) {
  const domain = HERO_FINAL_JOB_STAT_DOMAINS[stat];
  if (value === domain.min) return "MIN" as const;
  if (value === domain.max) return "MAX" as const;
  return null;
}
