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

type HeroDungeonBondDetail = {
  bonds: {
    rows: Array<{
      completionConditions: Array<{
        requiredHero: {
          heroId: number | null;
          nameKr: string | null;
          nameCn: string | null;
          nameEn: string | null;
        } | null;
        stage: { stageId: number | null; nameCn: string | null } | null;
      }>;
    }>;
  };
};

export function applyHeroDungeonBondPresentation<T extends HeroDungeonBondDetail>(heroId: number, detail: T): T {
  const gateByDungeonLevelId = HERO_DUNGEON_GATE_BY_HERO_ID.get(heroId);
  if (!gateByDungeonLevelId) {
    throw new Error(`Hero ${heroId} is missing from the Hero Dungeon B5 frozen consumer.`);
  }
  if (gateByDungeonLevelId.size === 0) return detail;

  return {
    ...detail,
    bonds: {
      ...detail.bonds,
      rows: detail.bonds.rows.map((bond) => ({
        ...bond,
        completionConditions: bond.completionConditions.map((condition) => {
          if (!condition.requiredHero || condition.stage?.stageId == null) return condition;
          const gateOrdinal = gateByDungeonLevelId.get(condition.stage.stageId);
          if (gateOrdinal == null) return condition;

          const requiredHeroName =
            condition.requiredHero.nameKr ??
            condition.requiredHero.nameCn ??
            condition.requiredHero.nameEn ??
            `Hero ${condition.requiredHero.heroId ?? "?"}`;

          // Presentation-only: B5 supplies the exact dungeonLevelId -> gateOrdinal mapping.
          // Stage 5/6 relations remain unchanged and unmatched conditions keep their existing presentation.
          return {
            ...condition,
            requiredHero: null,
            stage: {
              ...condition.stage,
              nameCn: `${requiredHeroName}와 함께 운명의문 ${gateOrdinal} 클리어`,
            },
          };
        }),
      })),
    },
  };
}
