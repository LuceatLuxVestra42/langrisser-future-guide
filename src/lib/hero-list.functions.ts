import { createServerFn } from "@tanstack/react-start";

import { applyHeroDungeonBondPresentation } from "./hero-dungeon-presentation.server";
import { readHeroDetailRouteStage5Data } from "./hero-detail-stage5.server";
import {
  readHeroDetailRouteStage4Data,
  readHeroListStage2Data,
  readHeroListStage3Data,
  readHeroListStage4Data,
} from "./hero-list.server";
import { resolveHeroSkillKr } from "./hero-skill-localization";
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

const LEGACY_SKILL_IDS_BY_HERO = new Map<number, ReadonlySet<number>>([
  [6, new Set([
    10301,
    5020,
    10324,
    5003,
    5007,
    10314,
    10328,
    11807,
    10302,
  ])],
  [8, new Set([
    10705,
    10703,
    10706,
    20001,
    10841,
    10813,
    10109,
    10717,
    10716,
  ])],
  [9, new Set([
    10701,
    10712,
    10716,
    20001,
    10719,
    10717,
    11813,
    10709,
    10711,
  ])],
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

function localizeLegacyHeroSkill<T extends { skillId: number; nameCn: string | null; desc: string | null }>(
  heroId: number,
  skill: T,
): T {
  const admittedSkillIds = LEGACY_SKILL_IDS_BY_HERO.get(heroId);
  if (!admittedSkillIds?.has(skill.skillId)) return skill;

  const localization = resolveHeroSkillKr(skill);
  if (!localization) {
    throw new Error(
      `Hero ${heroId} legacy skill ${skill.skillId} no longer matches the admitted Korean localization catalog.`,
    );
  }

  return {
    ...skill,
    // Stage 5 remains presentation-only. Skill identity and relations stay frozen;
    // only the visible Korean name/description come from the shared Skill-ID catalog.
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

    const legacySkillIds = LEGACY_SKILL_IDS_BY_HERO.get(data.heroId);
    const skills = legacySkillIds
      ? {
          ...routeData.detail.skills,
          heroDirectSkills: routeData.detail.skills.heroDirectSkills.map((skill) =>
            localizeLegacyHeroSkill(data.heroId, skill),
          ),
          jobLevelAcquisitions: routeData.detail.skills.jobLevelAcquisitions.map((row) => ({
            ...row,
            skill: localizeLegacyHeroSkill(data.heroId, row.skill),
          })),
        }
      : routeData.detail.skills;

    return {
      ...routeData,
      detail: applyHeroDungeonBondPresentation(data.heroId, {
        ...routeData.detail,
        skills,
        soldiers: {
          ...routeData.detail.soldiers,
          ids: sortHeroSoldierIdsForPresentation(routeData.detail.soldiers.ids),
        },
      }),
    };
  });
