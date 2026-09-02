import { createServerFn } from "@tanstack/react-start";

import { readHeroDetailRouteStage5Data } from "./hero-detail-stage5.server";
import {
  readHeroDetailRouteStage4Data,
  readHeroListStage2Data,
  readHeroListStage3Data,
  readHeroListStage4Data,
} from "./hero-list.server";
import { getSoldierPrototypePageData } from "./soldier-page.functions";

const HERO_SOLDIER_ARMY_ORDER = new Map<string, number>(
  [
    "INFANTRY",
    "LANCER",
    "CAVALRY",
    "FLYING",
    "WATER",
    "ARCHER",
    "ASSASSIN",
    "MAGE",
    "HOLY",
    "DEMON",
  ].map((armyType, index) => [armyType, index]),
);

const LEON_LEGACY_SKILL_KR_BY_ID = new Map<number, { nameKr: string; descKr: string }>([
  [
    10301,
    {
      nameKr: "돌격",
      descKr: "단일 적에게 1배 피해. 치료 방해를 1턴 부여하고, 공격 전 이동 1칸마다 피해 +20%(최대 +60%).",
    },
  ],
  [
    5020,
    {
      nameKr: "군단 정비",
      descKr: "부대 생명이 90% 이상이면 공격과 방어 +10%.",
    },
  ],
  [
    10324,
    {
      nameKr: "맹렬한 돌격",
      descKr: "단일 적에게 1.4배 피해. 대상을 2칸 밀치고 방어 -20%, 호위 불가를 2턴 부여.",
    },
  ],
  [
    5003,
    {
      nameKr: "무기 파괴",
      descKr: "전투 진입 전 50% 확률로 적의 공격과 지력 -20%. 1턴 지속.",
    },
  ],
  [
    5007,
    {
      nameKr: "제압",
      descKr: "자신의 남은 생명 비율이 상대보다 높으면 전투 중 공격 +12%.",
    },
  ],
  [
    10314,
    {
      nameKr: "폭풍",
      descKr: "공격하여 전투 진입 시 부대 생명이 80% 이상이면 전투 중 받는 피해 -30%.",
    },
  ],
  [
    10328,
    {
      nameKr: "기사도",
      descKr: "자신 부대 공격 +30%, 면역과 폭풍을 2턴 부여. 사용 후 3칸 추가 이동하고 공격 가능.",
    },
  ],
  [
    11807,
    {
      nameKr: "제국의 돌격",
      descKr: "제국의 빛 아군의 공격·방어를 크게 올리고, 공격 전 이동 1칸마다 전투 피해 +5%(최대 +15%). 4턴 지속.",
    },
  ],
  [
    10302,
    {
      nameKr: "일기당천",
      descKr: "단일 적에게 1.7배 피해. 전투 후 이동력 -2와 호위 불가를 2턴 부여하며 제거되지 않음.",
    },
  ],
]);

function getHeroSoldierTierOrder(record: { isSp: boolean; tier: number }) {
  if (record.isSp) return 0;
  if (record.tier === 3) return 1;
  if (record.tier === 2) return 2;
  if (record.tier === 1) return 3;
  return Number.MAX_SAFE_INTEGER;
}

function sortHeroSoldierIdsForPresentation(ids: readonly number[]) {
  const soldierById = new Map(
    getSoldierPrototypePageData().records.map((record) => [record.soldierId, record]),
  );

  return [...ids].sort((aId, bId) => {
    const a = soldierById.get(aId);
    const b = soldierById.get(bId);

    // The Hero route owns the existing fail-closed missing-Soldier validation.
    // Keep unresolved IDs stable here instead of changing that validation boundary.
    if (!a || !b) return 0;

    // Presentation priority: SP > T3 > T2 > T1, then army type, then Soldier ID.
    // This keeps every SP Soldier above normal tiers and every T1 Soldier at the bottom.
    const tierOrderDiff = getHeroSoldierTierOrder(a) - getHeroSoldierTierOrder(b);
    if (tierOrderDiff !== 0) return tierOrderDiff;

    const armyOrderDiff =
      (HERO_SOLDIER_ARMY_ORDER.get(a.armyType) ?? Number.MAX_SAFE_INTEGER) -
      (HERO_SOLDIER_ARMY_ORDER.get(b.armyType) ?? Number.MAX_SAFE_INTEGER);
    if (armyOrderDiff !== 0) return armyOrderDiff;

    return bId - aId;
  });
}

function localizeLeonLegacySkill<T extends { skillId: number; nameCn: string | null; desc: string | null }>(skill: T): T {
  const localization = LEON_LEGACY_SKILL_KR_BY_ID.get(skill.skillId);
  if (!localization) return skill;
  return {
    ...skill,
    // Stage 5 route data is a presentation consumer. Preserve Skill ID identity and only replace
    // the visible strings for the explicitly verified Leon mappings above.
    nameCn: localization.nameKr,
    desc: localization.descKr,
  };
}

export const getHeroListStage2Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage2Data(),
);

export const getHeroListStage3Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage3Data(),
);

export const getHeroListStage4Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage4Data(),
);

function validateHeroId(input: { heroId: number }) {
  if (!Number.isSafeInteger(input.heroId) || input.heroId <= 0) {
    throw new Error("heroId must be a positive safe integer.");
  }
  return input;
}

export const getHeroDetailRouteStage4Data = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => readHeroDetailRouteStage4Data(data.heroId));

export const getHeroDetailRouteStage5Data = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => {
    const routeData = await readHeroDetailRouteStage5Data(data.heroId);
    if (!routeData) return routeData;

    const skills = data.heroId === 6
      ? {
          ...routeData.detail.skills,
          heroDirectSkills: routeData.detail.skills.heroDirectSkills.map(localizeLeonLegacySkill),
          jobLevelAcquisitions: routeData.detail.skills.jobLevelAcquisitions.map((row) => ({
            ...row,
            skill: localizeLeonLegacySkill(row.skill),
          })),
        }
      : routeData.detail.skills;

    return {
      ...routeData,
      detail: {
        ...routeData.detail,
        skills,
        soldiers: {
          ...routeData.detail.soldiers,
          ids: sortHeroSoldierIdsForPresentation(routeData.detail.soldiers.ids),
        },
      },
    };
  });
