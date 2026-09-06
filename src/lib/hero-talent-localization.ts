import finalLocalization from "../../data/presentation/hero-talent-localization-final.v1.json";

type FinalTalentStar = {
  descriptionKrText: string;
  currentCnSkillId: number;
  currentCnTalentName: string;
};

type FinalTalentRecord = {
  heroId: number;
  talentNameKr: string;
  localizationStatus: string;
  reviewRequired: boolean;
  descriptions: Record<"star3" | "star4" | "star5" | "star6", FinalTalentStar>;
};

type FinalTalentProjection = {
  status: string;
  summary: {
    heroCount: number;
    postCutoffHeroCount: number;
  };
  records: FinalTalentRecord[];
};

const projection = finalLocalization as unknown as FinalTalentProjection;
if (projection.status !== "PASS_WITH_REVIEW") {
  throw new Error(`Hero talent final localization is not usable: ${projection.status}`);
}
if (projection.summary.heroCount !== 251 || projection.summary.postCutoffHeroCount !== 16) {
  throw new Error("Hero talent final localization coverage mismatch.");
}

function keyOf(heroId: number, star: number, skillId: number) {
  return `${heroId}:${star}:${skillId}`;
}

const HERO_TALENT_KR_BY_KEY = new Map<
  string,
  {
    heroId: number;
    star: number;
    skillId: number;
    sourceNameCn: string;
    nameKr: string;
    descKr: string;
    localizationStatus: string;
    reviewRequired: boolean;
  }
>();
const HERO_TALENT_KR_HERO_IDS = new Set<number>();

for (const record of projection.records) {
  if (!Number.isSafeInteger(record.heroId) || record.heroId <= 0) {
    throw new Error("Invalid final Hero talent localization heroId.");
  }
  if (!record.talentNameKr.trim()) {
    throw new Error(`Hero ${record.heroId} final talent localization is missing its Korean talent name.`);
  }
  HERO_TALENT_KR_HERO_IDS.add(record.heroId);

  for (const star of [3, 4, 5, 6] as const) {
    const localized = record.descriptions[`star${star}`];
    if (!localized || !localized.descriptionKrText.trim()) {
      throw new Error(`Hero ${record.heroId} ${star}-star final talent localization is missing text.`);
    }
    const key = keyOf(record.heroId, star, localized.currentCnSkillId);
    if (HERO_TALENT_KR_BY_KEY.has(key)) {
      throw new Error(`Duplicate final Hero talent localization key: ${key}`);
    }
    HERO_TALENT_KR_BY_KEY.set(key, {
      heroId: record.heroId,
      star,
      skillId: localized.currentCnSkillId,
      sourceNameCn: localized.currentCnTalentName,
      nameKr: record.talentNameKr,
      descKr: localized.descriptionKrText,
      localizationStatus: record.localizationStatus,
      reviewRequired: record.reviewRequired,
    });
  }
}

if (HERO_TALENT_KR_HERO_IDS.size !== 251 || HERO_TALENT_KR_BY_KEY.size !== 1004) {
  throw new Error("Hero talent final localization materialized key count mismatch.");
}

export function hasHeroTalentKr(heroId: number) {
  return HERO_TALENT_KR_HERO_IDS.has(heroId);
}

export function resolveHeroTalentKr(input: {
  heroId: number;
  star: number;
  skillId: number;
  nameCn: string | null;
}) {
  const record = HERO_TALENT_KR_BY_KEY.get(keyOf(input.heroId, input.star, input.skillId));
  if (!record) return null;

  // HeroID + frozen SkillID + star are the lookup identity. The Chinese talent
  // name is only a stale-snapshot guard and never creates a semantic JOIN.
  if (!input.nameCn || input.nameCn !== record.sourceNameCn) return null;

  return {
    nameKr: record.nameKr,
    descKr: record.descKr,
    localizationStatus: record.localizationStatus,
    reviewRequired: record.reviewRequired,
    source: "data/presentation/hero-talent-localization-final.v1.json" as const,
  };
}
