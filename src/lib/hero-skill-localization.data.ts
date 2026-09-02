import type { HeroSkillKrCatalog } from "./hero-skill-localization.schema";

// Stage 1 structure only. Records are admitted in later migration/batch steps.
// Keep this catalog empty until a Skill-ID + sourceNameCn pair has passed the
// localization admission rules in hero-skill-localization.ts.
export const HERO_SKILL_KR_CATALOG: HeroSkillKrCatalog = {
  schemaVersion: 1,
  sourceFamily: "hero-skill-korean-localization",
  records: [],
};
