export const HERO_SKILL_KR_STATUSES = [
  "CONFIRMED_KR",
  "LEGACY_SHEET_KR",
  "REVIEW",
  "UNTRANSLATED",
] as const;

export type HeroSkillKrStatus = (typeof HERO_SKILL_KR_STATUSES)[number];

export type HeroSkillKrRecord = {
  skillId: number;
  sourceNameCn: string;
  nameKr: string | null;
  descKr: string | null;
  status: HeroSkillKrStatus;
  source: {
    type: "legacy-korean-sheet" | "official-korean" | "manual-review";
    heroIds: readonly number[];
    note?: string;
  };
};

export type HeroSkillKrCatalog = {
  schemaVersion: 1;
  sourceFamily: "hero-skill-korean-localization";
  records: readonly HeroSkillKrRecord[];
};

export type HeroSkillKrResolved = {
  skillId: number;
  nameKr: string;
  descKr: string;
  status: Exclude<HeroSkillKrStatus, "REVIEW" | "UNTRANSLATED">;
};
