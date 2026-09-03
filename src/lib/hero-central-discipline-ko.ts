import manifest from "../../data/presentation/hero-central-discipline-ko/manifest.v1.json";
import part01 from "../../data/presentation/hero-central-discipline-ko/part-01.v1.json";
import part02 from "../../data/presentation/hero-central-discipline-ko/part-02.v1.json";
import part03 from "../../data/presentation/hero-central-discipline-ko/part-03.v1.json";
import part04 from "../../data/presentation/hero-central-discipline-ko/part-04.v1.json";
import part05 from "../../data/presentation/hero-central-discipline-ko/part-05.v1.json";
import part06 from "../../data/presentation/hero-central-discipline-ko/part-06.v1.json";

type HeroCentralDisciplineKoRecord = {
  heroId: number;
  castingLawSkillId: number;
  effectTextKo: string;
  source: {
    sheet: string;
    effectRow: number;
    heroRow: number;
    releaseDateRaw: string | null;
    heroNameKoRaw: string;
  };
};

const shards = [part01, part02, part03, part04, part05, part06] as const;
const records = shards.flatMap((shard) => shard.records as HeroCentralDisciplineKoRecord[]);

if (
  manifest.artifact !== "hero-central-discipline-ko-presentation-overlay" ||
  manifest.summary.recordCount !== 164 ||
  manifest.summary.uniqueHeroCount !== 164 ||
  manifest.summary.duplicateHeroIdCount !== 0 ||
  manifest.summary.blankEffectCount !== 0 ||
  records.length !== manifest.summary.recordCount
) {
  throw new Error("Hero central-discipline Korean presentation overlay is not production-ready.");
}

const bySkillId = new Map<number, HeroCentralDisciplineKoRecord>();
const heroIds = new Set<number>();
for (const record of records) {
  if (
    !Number.isSafeInteger(record.heroId) ||
    record.heroId <= 0 ||
    !Number.isSafeInteger(record.castingLawSkillId) ||
    record.castingLawSkillId <= 0 ||
    !record.effectTextKo.trim() ||
    heroIds.has(record.heroId) ||
    bySkillId.has(record.castingLawSkillId)
  ) {
    throw new Error("Hero central-discipline Korean presentation overlay contains an invalid or duplicate record.");
  }
  heroIds.add(record.heroId);
  bySkillId.set(record.castingLawSkillId, record);
}

if (heroIds.size !== 164 || bySkillId.size !== 164) {
  throw new Error("Hero central-discipline Korean presentation overlay index count mismatch.");
}

export function getHeroCentralDisciplineKoBySkillId(skillId: number) {
  if (!Number.isSafeInteger(skillId) || skillId <= 0) {
    throw new Error(`Invalid central-discipline Skill ID: ${skillId}`);
  }
  return bySkillId.get(skillId) ?? null;
}
