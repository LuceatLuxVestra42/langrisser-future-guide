import heroDungeonSupplementalFinal from "../../data/generated/hero-dungeon-supplemental-final.v1.json";
import heroDungeonSupplementalPart0001 from "../../data/generated/hero-dungeon-supplemental-part-0001.v1.json";
import heroDungeonSupplementalPart0002 from "../../data/generated/hero-dungeon-supplemental-part-0002.v1.json";
import heroDungeonSupplementalPart0003 from "../../data/generated/hero-dungeon-supplemental-part-0003.v1.json";
import heroDungeonSupplementalPart0004 from "../../data/generated/hero-dungeon-supplemental-part-0004.v1.json";
import heroDungeonSupplementalPart0005 from "../../data/generated/hero-dungeon-supplemental-part-0005.v1.json";
import heroDungeonSupplementalPart0006 from "../../data/generated/hero-dungeon-supplemental-part-0006.v1.json";

const HERO_DUNGEON_SUPPLEMENTAL_SHARDS = [
  heroDungeonSupplementalPart0001,
  heroDungeonSupplementalPart0002,
  heroDungeonSupplementalPart0003,
  heroDungeonSupplementalPart0004,
  heroDungeonSupplementalPart0005,
  heroDungeonSupplementalPart0006,
] as const;

const HERO_DUNGEON_GATE_BY_HERO_ID = (() => {
  if (
    heroDungeonSupplementalFinal.schemaId !== "hero-dungeon-supplemental-final/v1" ||
    heroDungeonSupplementalFinal.status !== "FINAL_FROZEN" ||
    heroDungeonSupplementalFinal.completion !== "B5_SUPPLEMENTAL_FINAL_FREEZE_COMPLETE" ||
    heroDungeonSupplementalFinal.storage.format !== "SHARDED_HERO_RECORDS"
  ) {
    throw new Error("Hero Dungeon B5 frozen manifest is not production-ready.");
  }

  const gateByHeroId = new Map<number, ReadonlyMap<number, number>>();
  let noHeroDungeonCount = 0;
  let hasHeroDungeonCount = 0;

  for (const shard of HERO_DUNGEON_SUPPLEMENTAL_SHARDS) {
    if (shard.version !== 1 || shard.schemaId !== "hero-dungeon-supplemental-shard/v1") {
      throw new Error("Hero Dungeon B5 frozen shard schema mismatch.");
    }

    for (const record of shard.records) {
      if (!Number.isInteger(record.heroId) || record.heroId <= 0 || gateByHeroId.has(record.heroId)) {
        throw new Error(`Hero Dungeon B5 frozen consumer contains invalid Hero ID ${record.heroId}.`);
      }

      const gateByDungeonLevelId = new Map<number, number>();

      if (record.state === "NO_HERO_DUNGEON") {
        if (record.accepted !== null || record.gateCount !== 0 || record.stages.length !== 0) {
          throw new Error(`Hero ${record.heroId} has an invalid NO_HERO_DUNGEON frozen record.`);
        }
        gateByHeroId.set(record.heroId, gateByDungeonLevelId);
        noHeroDungeonCount += 1;
        continue;
      }

      if (
        record.state !== "HAS_HERO_DUNGEON" ||
        record.accepted !== true ||
        (record.gateCount !== 5 && record.gateCount !== 7) ||
        record.stages.length !== record.gateCount
      ) {
        throw new Error(`Hero ${record.heroId} has an invalid HAS_HERO_DUNGEON frozen record.`);
      }

      const ordinals = new Set<number>();
      for (const stage of record.stages) {
        if (stage.length !== 2) {
          throw new Error(`Hero ${record.heroId} has an invalid Hero Dungeon gate tuple.`);
        }
        const gateOrdinal = stage[0];
        const dungeonLevelId = stage[1];
        if (
          typeof gateOrdinal !== "number" ||
          typeof dungeonLevelId !== "number" ||
          !Number.isInteger(gateOrdinal) ||
          !Number.isInteger(dungeonLevelId) ||
          gateOrdinal < 1 ||
          gateOrdinal > record.gateCount ||
          dungeonLevelId <= 0 ||
          ordinals.has(gateOrdinal) ||
          gateByDungeonLevelId.has(dungeonLevelId)
        ) {
          throw new Error(`Hero ${record.heroId} has an invalid Hero Dungeon gate assignment.`);
        }
        ordinals.add(gateOrdinal);
        gateByDungeonLevelId.set(dungeonLevelId, gateOrdinal);
      }

      for (let gateOrdinal = 1; gateOrdinal <= record.gateCount; gateOrdinal += 1) {
        if (!ordinals.has(gateOrdinal)) {
          throw new Error(`Hero ${record.heroId} is missing Hero Dungeon gate ${gateOrdinal}.`);
        }
      }

      gateByHeroId.set(record.heroId, gateByDungeonLevelId);
      hasHeroDungeonCount += 1;
    }
  }

  if (
    gateByHeroId.size !== heroDungeonSupplementalFinal.storage.heroCount ||
    gateByHeroId.size !== heroDungeonSupplementalFinal.summary.canonicalHeroCount ||
    noHeroDungeonCount !== heroDungeonSupplementalFinal.summary.noHeroDungeonCount ||
    hasHeroDungeonCount !== heroDungeonSupplementalFinal.summary.hasHeroDungeonCount
  ) {
    throw new Error("Hero Dungeon B5 frozen consumer population parity failed.");
  }

  return gateByHeroId;
})();

type HeroDungeonBondCondition = {
  favorability: {
    targetHeroId: number | null;
    targetHeroNameKr: string | null;
    targetHeroNameCn: string | null;
    targetHeroNameEn: string | null;
    requiredLevel: number | null;
  } | null;
  requiredHero: {
    heroId: number | null;
    nameKr: string | null;
    nameCn: string | null;
    nameEn: string | null;
  } | null;
  mission: {
    missionId: number | null;
    title: string | null;
    desc: string | null;
    missionType: number | null;
  } | null;
  stage: { stageId: number | null; nameCn: string | null } | null;
};

type HeroDungeonBondDetail = {
  bonds: {
    rows: Array<{
      completionConditions: HeroDungeonBondCondition[];
    }>;
  };
};

function getHeroName(condition: HeroDungeonBondCondition) {
  return (
    condition.favorability?.targetHeroNameKr ??
    condition.favorability?.targetHeroNameCn ??
    condition.favorability?.targetHeroNameEn ??
    null
  );
}

function getRequiredHeroName(condition: HeroDungeonBondCondition) {
  if (!condition.requiredHero) return null;
  return (
    condition.requiredHero.nameKr ??
    condition.requiredHero.nameCn ??
    condition.requiredHero.nameEn ??
    `Hero ${condition.requiredHero.heroId ?? "?"}`
  );
}

type KoreanParticlePair = "을/를" | "과/와";

function withKoreanParticle(text: string, pair: KoreanParticlePair) {
  const lastChar = text.at(-1);
  const codePoint = lastChar?.codePointAt(0) ?? null;
  const hasFinalConsonant =
    codePoint != null && codePoint >= 0xac00 && codePoint <= 0xd7a3
      ? (codePoint - 0xac00) % 28 !== 0
      : null;

  if (pair === "을/를") {
    // Keep the previous "을" fallback for CN/EN/non-Hangul names.
    return `${text}${hasFinalConsonant === false ? "를" : "을"}`;
  }

  // Keep the previous "와" fallback for CN/EN/non-Hangul names.
  return `${text}${hasFinalConsonant === true ? "과" : "와"}`;
}

function formatBondMissionDesc(desc: string | null, currentHeroName: string | null) {
  if (!desc) return desc;

  const levelMatch = desc.match(/^.+(?:到达|达到)(\d+)级$/);
  if (levelMatch) return `레벨 ${levelMatch[1]} 달성`;

  const classMatch = desc.match(/^.+转职(?:成为|为)(.+)$/);
  if (classMatch) return `${classMatch[1]}로 전직`;

  const eliteRiftMatch = desc.match(/^使用.+完成时空裂缝精英(\d+-\d+)$/);
  if (eliteRiftMatch && currentHeroName) {
    return `${withKoreanParticle(currentHeroName, "을/를")} 출전시켜 시공의 균열 ${eliteRiftMatch[1]}[정예] 클리어`;
  }

  const riftMatch = desc.match(/^使用.+完成时空裂缝(\d+-\d+)$/);
  if (riftMatch && currentHeroName) {
    return `${withKoreanParticle(currentHeroName, "을/를")} 출전시켜 시공의 균열 ${riftMatch[1]} 클리어`;
  }

  const arenaMatch = desc.match(/^使用.+在竞技场中获得(\d+)次胜利$/);
  if (arenaMatch && currentHeroName) {
    const winCount = Number(arenaMatch[1]);
    if (winCount === 1 || winCount === 5) {
      return `${withKoreanParticle(currentHeroName, "을/를")} 사용해 아레나에서 1회 승리`;
    }
  }

  return desc;
}

export function applyHeroDungeonBondPresentation<T extends HeroDungeonBondDetail>(heroId: number, detail: T): T {
  const gateByDungeonLevelId = HERO_DUNGEON_GATE_BY_HERO_ID.get(heroId);
  if (!gateByDungeonLevelId) {
    throw new Error(`Hero ${heroId} is missing from the Hero Dungeon B5 frozen consumer.`);
  }

  return {
    ...detail,
    bonds: {
      ...detail.bonds,
      rows: detail.bonds.rows.map((bond) => {
        const currentHeroName = bond.completionConditions.map(getHeroName).find((name) => name !== null) ?? null;

        return {
          ...bond,
          // Favorability thresholds stay frozen in the semantic consumer, but their
          // text rows are intentionally hidden until the bond-icon presentation is added.
          completionConditions: bond.completionConditions
            .filter((condition) => !condition.favorability)
            .map((condition) => {
              const mission = condition.mission
                ? {
                    ...condition.mission,
                    desc: formatBondMissionDesc(condition.mission.desc, currentHeroName),
                  }
                : condition.mission;

              if (!condition.requiredHero || condition.stage?.stageId == null) {
                return {
                  ...condition,
                  mission,
                };
              }

              const stageId = condition.stage.stageId;
              const requiredHeroName = getRequiredHeroName(condition);
              if (!requiredHeroName) {
                return {
                  ...condition,
                  mission,
                };
              }

              const ownGateOrdinal = gateByDungeonLevelId.get(stageId);
              if (ownGateOrdinal != null) {
                // A's own Gate of Fate requires B to accompany A.
                return {
                  ...condition,
                  requiredHero: null,
                  mission,
                  stage: {
                    ...condition.stage,
                    nameCn: `${withKoreanParticle(requiredHeroName, "과/와")} 함께 운명의문 ${ownGateOrdinal} 클리어`,
                  },
                };
              }

              const requiredHeroId = condition.requiredHero.heroId;
              const otherHeroGateOrdinal =
                requiredHeroId == null
                  ? null
                  : HERO_DUNGEON_GATE_BY_HERO_ID.get(requiredHeroId)?.get(stageId) ?? null;

              if (otherHeroGateOrdinal != null) {
                // A must participate in D's Gate of Fate. Keep the ownership direction explicit.
                return {
                  ...condition,
                  requiredHero: null,
                  mission,
                  stage: {
                    ...condition.stage,
                    nameCn: `${requiredHeroName}의 운명의문 ${otherHeroGateOrdinal}에 함께 출전하여 클리어`,
                  },
                };
              }

              // Unmatched frozen relations fail closed to the existing route presentation.
              return {
                ...condition,
                mission,
              };
            }),
        };
      }),
    },
  };
}
