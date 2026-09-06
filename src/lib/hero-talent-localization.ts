export type HeroTalentKrRecord = {
  heroId: number;
  star: number;
  skillId: number;
  sourceNameCn: string;
  nameKr: string;
  descKr: string;
  source: {
    type: "legacy-korean-sheet";
    path: string;
    ref: string;
  };
};

const LEGACY_SHEET_REF = "a85bba49dcf073563e7366dc18e96b7ba67c2ae3";

export const HERO_TALENT_KR_RECORDS: readonly HeroTalentKrRecord[] = [
  {
    heroId: 6,
    star: 3,
    skillId: 3067,
    sourceNameCn: "传说的骑士",
    nameKr: "전설의 기사",
    descKr: "1칸 이동할 때마다 피해 +1%, 방어 +5%. 공격 후 3칸 재이동 가능.",
    source: { type: "legacy-korean-sheet", path: "hero/data/레온.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 6,
    star: 4,
    skillId: 3072,
    sourceNameCn: "传说的骑士",
    nameKr: "전설의 기사",
    descKr: "1칸 이동할 때마다 피해 +2%, 방어 +10%. 공격 후 3칸 재이동 가능.",
    source: { type: "legacy-korean-sheet", path: "hero/data/레온.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 6,
    star: 5,
    skillId: 3077,
    sourceNameCn: "传说的骑士",
    nameKr: "전설의 기사",
    descKr: "1칸 이동할 때마다 피해 +3%, 방어 +15%. 공격 후 3칸 재이동 가능.",
    source: { type: "legacy-korean-sheet", path: "hero/data/레온.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 6,
    star: 6,
    skillId: 3082,
    sourceNameCn: "传说的骑士",
    nameKr: "전설의 기사",
    descKr: "1칸 이동할 때마다 피해 +4%, 방어 +20%. 공격 후 3칸 재이동 가능.",
    source: { type: "legacy-korean-sheet", path: "hero/data/레온.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 8,
    star: 3,
    skillId: 3196,
    sourceNameCn: "秘法延伸",
    nameKr: "마력 강화",
    descKr: "전투 진입 시 마법 피해 +10%, 스킬 사거리 +1.",
    source: { type: "legacy-korean-sheet", path: "hero/data/라나.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 8,
    star: 4,
    skillId: 3197,
    sourceNameCn: "秘法延伸",
    nameKr: "마력 강화",
    descKr: "전투 진입 시 마법 피해 +15%, 스킬 사거리 +1.",
    source: { type: "legacy-korean-sheet", path: "hero/data/라나.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 8,
    star: 5,
    skillId: 3198,
    sourceNameCn: "秘法延伸",
    nameKr: "마력 강화",
    descKr: "전투 진입 시 마법 피해 +20%, 스킬 사거리 +1.",
    source: { type: "legacy-korean-sheet", path: "hero/data/라나.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 8,
    star: 6,
    skillId: 3199,
    sourceNameCn: "秘法延伸",
    nameKr: "마력 강화",
    descKr: "전투 진입 시 마법 피해 +30%, 스킬 사거리 +1.",
    source: { type: "legacy-korean-sheet", path: "hero/data/라나.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 9,
    star: 3,
    skillId: 3200,
    sourceNameCn: "千年的邪念",
    nameKr: "천년의 사념",
    descKr: "자신 마방의 1.5배로 지력을 대체. 적 부대에게 피해를 준 후 50% 확률로 무작위 디버프 1개 부여.",
    source: { type: "legacy-korean-sheet", path: "hero/data/보젤.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 9,
    star: 4,
    skillId: 3201,
    sourceNameCn: "千年的邪念",
    nameKr: "천년의 사념",
    descKr: "자신 마방의 1.5배로 지력을 대체. 적 부대에게 피해를 준 후 60% 확률로 무작위 디버프 1개 부여.",
    source: { type: "legacy-korean-sheet", path: "hero/data/보젤.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 9,
    star: 5,
    skillId: 3202,
    sourceNameCn: "千年的邪念",
    nameKr: "천년의 사념",
    descKr: "자신 마방의 1.5배로 지력을 대체. 적 부대에게 피해를 준 후 80% 확률로 무작위 디버프 1개 부여.",
    source: { type: "legacy-korean-sheet", path: "hero/data/보젤.js", ref: LEGACY_SHEET_REF },
  },
  {
    heroId: 9,
    star: 6,
    skillId: 3203,
    sourceNameCn: "千年的邪念",
    nameKr: "천년의 사념",
    descKr: "자신 마방의 1.5배로 지력을 대체. 적 부대에게 피해를 준 후 100% 확률로 무작위 디버프 1개 부여.",
    source: { type: "legacy-korean-sheet", path: "hero/data/보젤.js", ref: LEGACY_SHEET_REF },
  },
] as const;

function keyOf(heroId: number, star: number, skillId: number) {
  return `${heroId}:${star}:${skillId}`;
}

const HERO_TALENT_KR_BY_KEY = new Map<string, HeroTalentKrRecord>();
for (const record of HERO_TALENT_KR_RECORDS) {
  if (!Number.isSafeInteger(record.heroId) || record.heroId <= 0) throw new Error("Invalid Hero talent KR heroId.");
  if (!Number.isSafeInteger(record.star) || record.star < 1 || record.star > 6) throw new Error("Invalid Hero talent KR star.");
  if (!Number.isSafeInteger(record.skillId) || record.skillId <= 0) throw new Error("Invalid Hero talent KR skillId.");
  if (!record.sourceNameCn.trim() || !record.nameKr.trim() || !record.descKr.trim()) {
    throw new Error(`Hero talent KR ${keyOf(record.heroId, record.star, record.skillId)} is missing text.`);
  }
  const key = keyOf(record.heroId, record.star, record.skillId);
  if (HERO_TALENT_KR_BY_KEY.has(key)) throw new Error(`Duplicate Hero talent KR key: ${key}`);
  HERO_TALENT_KR_BY_KEY.set(key, record);
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
  // name is an independent stale-snapshot guard and never creates a JOIN.
  if (!input.nameCn || input.nameCn !== record.sourceNameCn) return null;

  return {
    nameKr: record.nameKr,
    descKr: record.descKr,
    source: record.source,
  };
}
