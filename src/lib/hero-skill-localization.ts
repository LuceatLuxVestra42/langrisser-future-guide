import { HERO_SKILL_KR_CATALOG } from "./hero-skill-localization.data";
import {
  HERO_SKILL_KR_STATUSES,
  type HeroSkillKrCatalog,
  type HeroSkillKrRecord,
  type HeroSkillKrResolved,
} from "./hero-skill-localization.schema";

const STATUS_SET = new Set<string>(HERO_SKILL_KR_STATUSES);

export function validateHeroSkillKrCatalog(catalog: HeroSkillKrCatalog) {
  if (catalog.schemaVersion !== 1) throw new Error("Unsupported Hero skill KR catalog schemaVersion.");
  if (catalog.sourceFamily !== "hero-skill-korean-localization") {
    throw new Error("Unexpected Hero skill KR catalog sourceFamily.");
  }

  const seen = new Set<number>();
  for (const record of catalog.records) validateHeroSkillKrRecord(record, seen);
  return true;
}

function validateHeroSkillKrRecord(record: HeroSkillKrRecord, seen: Set<number>) {
  if (!Number.isSafeInteger(record.skillId) || record.skillId <= 0) {
    throw new Error(`Invalid Hero skill KR skillId: ${record.skillId}`);
  }
  if (seen.has(record.skillId)) throw new Error(`Duplicate Hero skill KR skillId: ${record.skillId}`);
  seen.add(record.skillId);

  if (!record.sourceNameCn.trim()) throw new Error(`Hero skill KR ${record.skillId} is missing sourceNameCn.`);
  if (!STATUS_SET.has(record.status)) throw new Error(`Hero skill KR ${record.skillId} has an invalid status.`);

  const isDisplayable = record.status === "CONFIRMED_KR" || record.status === "LEGACY_SHEET_KR";
  if (isDisplayable && (!record.nameKr?.trim() || !record.descKr?.trim())) {
    throw new Error(`Hero skill KR ${record.skillId} is displayable but missing Korean text.`);
  }
}

validateHeroSkillKrCatalog(HERO_SKILL_KR_CATALOG);

const HERO_SKILL_KR_BY_ID = new Map(HERO_SKILL_KR_CATALOG.records.map((record) => [record.skillId, record]));

export function resolveHeroSkillKr(skill: { skillId: number; nameCn: string | null }): HeroSkillKrResolved | null {
  const record = HERO_SKILL_KR_BY_ID.get(skill.skillId);
  if (!record) return null;

  // Skill ID is the primary identity. sourceNameCn is an independent guard so
  // a changed/future snapshot cannot silently receive a stale Korean string.
  if (!skill.nameCn || record.sourceNameCn !== skill.nameCn) return null;
  if (record.status !== "CONFIRMED_KR" && record.status !== "LEGACY_SHEET_KR") return null;
  if (!record.nameKr || !record.descKr) return null;

  return {
    skillId: record.skillId,
    nameKr: record.nameKr,
    descKr: record.descKr,
    status: record.status,
  };
}
