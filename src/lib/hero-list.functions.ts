import { createServerFn } from "@tanstack/react-start";

import { applyHeroDungeonBondPresentation } from "./hero-dungeon-presentation.server";
import { readHeroDetailRouteStage5Data } from "./hero-detail-stage5.server";
import { readHeroHeartFetterPresentation } from "./hero-heart-fetter.server";
import { readHeroSoldierCommand } from "./hero-soldier-command.server";
import { resolveHeroNameLocalization } from "./hero-display-name";
import {
  readHeroDetailRouteStage4Data,
  readHeroListStage2Data,
  readHeroListStage3Data,
  readHeroListStage4Data,
} from "./hero-list.server";
import { resolveHeroSkillKr } from "./hero-skill-localization";
import { hasHeroTalentKr, resolveHeroTalentKr } from "./hero-talent-localization";
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
  [51, new Set([
    10841,
    5005,
    10710,
    5024,
    6007,
    11728,
    11820,
    10813,
    5022,
  ])],
  [32, new Set([
    10321,
    10311,
    10303,
    10326,
    5004,
    10209,
    10224,
    10105,
  ])],
  [89, new Set([
    10842,
    5005,
    10116,
    10829,
    12014,
    10838,
    5014,
  ])],
  [115, new Set([
    10314,
    10328,
    5014,
    10302,
    12147,
    12148,
    12149,
    5008,
  ])],
  [66, new Set([
    5025,
    12010,
    5007,
    12011,
    12001,
    12009,
    10314,
  ])],
  [55, new Set([
    10326,
    10102,
    11749,
    11720,
    11748,
    11824,
    11747,
  ])],
  [110, new Set([
    12104,
    10401,
    5024,
    12103,
    12105,
  ])],
  [64, new Set([
    10321,
    5003,
    5022,
    10103,
    12080,
    11706,
  ])],
  [146, new Set([
    10604,
    11706,
    10203,
  ])],
  [99174, new Set([
    10838,
    10842,
    10311,
    12059,
    10809,
  ])],
  [123, new Set([
    10311,
    5015,
    10321,
    10301,
    10203,
  ])],
  [65, new Set([
    10504,
    10501,
    5003,
    12048,
    10104,
    5016,
    5015,
    12068,
  ])],
  [52, new Set([
    10401,
    11730,
    10504,
    11725,
    10304,
    10311,
    10404,
    6008,
  ])],
  [101, new Set([
    10321,
    12166,
    10311,
    10314,
    12167,
    10326,
    5003,
    10328,
  ])],
  [25, new Set([
    10415,
  ])],
  [62, new Set([
    12095,
    12052,
  ])],
  [77, new Set([
    12095,
  ])],
  [91, new Set([
    12062,
  ])],
  [97, new Set([
    12052,
  ])],
  [93, new Set([
    11746,
  ])],
  [14, new Set([
    10401,
  ])],
  [15, new Set([
    10707,
  ])],
  [31, new Set([
    10811,
    10817,
    10825,
    10704,
    5021,
    10819,
  ])],
  [53, new Set([
    11739,
    10314,
    5098,
    11740,
    5014,
    11823,
    10328,
    5004,
  ])],
  [1, new Set([
    10601,
    11701,
    10205,
    5012,
    11706,
  ])],
  [34, new Set([
    10201,
    11711,
    10604,
    5100,
    5013,
    5012,
  ])],
  [42, new Set([
    10604,
    10501,
    10326,
    5008,
    5003,
    5005,
    10603,
  ])],
  [48, new Set([
    10113,
    10101,
    10206,
    10116,
    5024,
    10203,
  ])],
  [60, new Set([
    11778,
    11779,
  ])],
  [78, new Set([
    11711,
    11704,
  ])],
  [88, new Set([
    11778,
    10321,
  ])],
  [95, new Set([
    11704,
    11711,
    12018,
  ])],
  [112, new Set([
    11779,
    10415,
    12095,
  ])],
  [122, new Set([
    10326,
    10311,
    12062,
  ])],
  [5, new Set([
    10842,
    10808,
    10838,
    10815,
    5023,
    6006,
    10803,
    10804,
  ])],
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
  [12, new Set([
    10208,
    10223,
    10218,
    10103,
  ])],
  [26, new Set([
    10601,
    10415,
  ])],
  [40, new Set([
    10223,
    10208,
    10203,
    10210,
    10104,
    10314,
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
  [10, new Set([
    10208,
    10809,
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
  [3, new Set([
    10113,
    11817,
    10207,
    5015,
    12047,
    11749,
  ])],
  [43, new Set([
    10825,
    10804,
    6006,
    10819,
  ])],
  [45, new Set([
    10410,
    10418,
    10401,
    5014,
    10501,
    10303,
  ])],
  [22, new Set([
    10707,
    5023,
    10702,
  ])],
  [24, new Set([
    10311,
    10303,
    10803,
    10314,
  ])],
  [23, new Set([
    11704,
    11708,
    5013,
    11705,
    10210,
    5012,
  ])],
  [44, new Set([
    10314,
    5004,
    5015,
    10302,
    5007,
  ])],
  [41, new Set([
    10503,
    5012,
    10504,
    10501,
    5022,
    11704,
  ])],
  [47, new Set([
    10321,
    10303,
    10418,
    5021,
  ])],
  [19, new Set([
    10501,
    10503,
    5009,
    10504,
    5025,
  ])],
  [39, new Set([
    11704,
    5024,
    11708,
    10304,
    11703,
    5008,
    10604,
    10109,
  ])],
  [33, new Set([
    10106,
    11818,
    10209,
    10116,
    10829,
    10804,
  ])],
  [21, new Set([
    10113,
    5021,
    10209,
    5016,
    10304,
    10210,
  ])],
  [49, new Set([
    10605,
    10803,
    10603,
    6008,
    10604,
    10410,
    5014,
    5024,
  ])],
  [11, new Set([
    10603,
    5013,
    10602,
    10406,
    5016,
    5021,
  ])],
  [36, new Set([
    11705,
    11711,
    5003,
    11713,
    11703,
    10604,
    5025,
    10203,
  ])],
  [20, new Set([
    10314,
    5009,
    10326,
    10804,
    5003,
    6007,
  ])],
  [18, new Set([
    10705,
    10803,
    10706,
    10704,
    10818,
    10825,
    6006,
    10203,
  ])],
  [30, new Set([
    10707,
    5023,
    6007,
    10713,
    10703,
    10603,
  ])],
  [17, new Set([
    10713,
    10701,
    10710,
    10714,
    10716,
    10715,
    10703,
    5024,
  ])],
  [13, new Set([
    10701,
    10703,
    10704,
    10702,
    10841,
    10714,
  ])],
  [16, new Set([
    10401,
    10418,
    11819,
    10105,
    10311,
    10303,
    5025,
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

function projectSharedHeroNameLocalization<
  T extends {
    heroId: number;
    identity: { nameKr: string | null; nameCn: string };
    localization: unknown;
  },
>(hero: T): T {
  return {
    ...hero,
    localization: resolveHeroNameLocalization(
      hero.heroId,
      hero.identity.nameKr,
      hero.identity.nameCn,
    ),
  };
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

function localizeHeroTalentRow<
  T extends {
    star: number;
    skillId: number;
    skill: { skillId: number; nameCn: string | null; desc: string | null } | null;
  },
>(heroId: number, row: T): T {
  if (row.star < 3 || row.star > 6 || !hasHeroTalentKr(heroId)) return row;
  if (!row.skill) {
    throw new Error(`Hero ${heroId} talent ${row.star}-star row is missing its frozen skill payload.`);
  }
  if (row.skill.skillId !== row.skillId) {
    throw new Error(`Hero ${heroId} talent ${row.star}-star row has a Skill-ID parity mismatch.`);
  }

  const localization = resolveHeroTalentKr({
    heroId,
    star: row.star,
    skillId: row.skillId,
    nameCn: row.skill.nameCn,
  });
  if (!localization) {
    throw new Error(
      `Hero ${heroId} talent ${row.star}-star Skill ${row.skillId} no longer matches the final Korean talent localization consumer.`,
    );
  }

  return {
    ...row,
    skill: {
      ...row.skill,
      // Frontend integration is presentation-only. HeroID, SkillID, star progression and
      // selection semantics remain frozen; only visible Korean text is replaced.
      nameCn: localization.nameKr,
      desc: localization.descKr,
    },
  };
}

export const getHeroListStage2Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage2Data(),
);

export const getHeroListStage3Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage3Data(),
);

export const getHeroListStage4Data = createServerFn({ method: "GET" }).handler(
  async () => {
    const data = readHeroListStage4Data();
    return {
      ...data,
      records: data.records.map(projectSharedHeroNameLocalization),
    };
  },
);

function validateHeroId(input: { heroId: number }) {
  if (!Number.isSafeInteger(input.heroId) || input.heroId <= 0) {
    throw new Error("heroId must be a positive safe integer.");
  }
  return input;
}

export const getHeroDetailRouteStage4Data = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => {
    const routeData = readHeroDetailRouteStage4Data(data.heroId);
    if (!routeData) return routeData;
    return {
      ...routeData,
      hero: projectSharedHeroNameLocalization(routeData.hero),
    };
  });

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

    const talent = hasHeroTalentKr(data.heroId)
      ? {
          ...routeData.detail.talent,
          starProgression: routeData.detail.talent.starProgression.map((row) =>
            localizeHeroTalentRow(data.heroId, row),
          ),
        }
      : routeData.detail.talent;

    return {
      ...routeData,
      hero: projectSharedHeroNameLocalization(routeData.hero),
      soldierCommand: readHeroSoldierCommand(data.heroId),
      heartFetter: readHeroHeartFetterPresentation(data.heroId),
      detail: applyHeroDungeonBondPresentation(data.heroId, {
        ...routeData.detail,
        skills,
        talent,
        soldiers: {
          ...routeData.detail.soldiers,
          ids: sortHeroSoldierIdsForPresentation(routeData.detail.soldiers.ids),
        },
      }),
    };
  });
