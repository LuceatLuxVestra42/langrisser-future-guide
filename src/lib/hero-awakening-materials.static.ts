import artifactRaw from "../../data/generated/hero-awakening-materials.v1.json";

type AwakeningItemSnapshot = {
  itemId: number;
  nameCn: string;
  descriptionCn: string;
  rank: number | null;
  icon: string | null;
  getPathDescriptionCn: string | null;
};

export type HeroAwakeningMaterialEntry = {
  goodsType: number;
  id: number;
  count: number;
  item: AwakeningItemSnapshot;
};

export type HeroAwakeningMaterialRecord = {
  heroId: number;
  nameKr: string | null;
  nameCn: string | null;
  nameEn: string | null;
  sourceState: "LEVEL2_SKILL_DEFINED" | "LEVEL2_SKILL_NOT_DEFINED" | "AWAKEN_INFO_NOT_FOUND";
  awakening: null | {
    skillId: number;
    awaken2LevelId: number | null;
    awaken2Unlock: boolean | null;
    materials: HeroAwakeningMaterialEntry[];
  };
};

type HeroAwakeningMaterialsArtifact = {
  version: 1;
  domain: "hero-awakening-materials";
  status: "PASS";
  recordCount: number;
  records: HeroAwakeningMaterialRecord[];
};

const artifact = artifactRaw as unknown as HeroAwakeningMaterialsArtifact;

if (artifact.version !== 1 || artifact.domain !== "hero-awakening-materials" || artifact.status !== "PASS") {
  throw new Error("Hero awakening materials frozen artifact is not production-ready.");
}
if (artifact.recordCount !== 267 || artifact.records.length !== 267) {
  throw new Error(`Hero awakening materials frozen coverage mismatch: ${artifact.records.length}/${artifact.recordCount}.`);
}

const byHeroId = new Map<number, HeroAwakeningMaterialRecord>();
let definedCount = 0;
let undefinedCount = 0;
let materialEntryCount = 0;
for (const record of artifact.records) {
  if (!Number.isSafeInteger(record.heroId) || record.heroId <= 0 || byHeroId.has(record.heroId)) {
    throw new Error(`Hero awakening materials frozen identity violation at heroId=${String(record.heroId)}.`);
  }
  if (record.sourceState === "LEVEL2_SKILL_DEFINED") {
    if (!record.awakening || !Number.isSafeInteger(record.awakening.skillId) || record.awakening.skillId <= 0 || record.awakening.materials.length === 0) {
      throw new Error(`Hero ${record.heroId} has an invalid frozen awakening-material payload.`);
    }
    definedCount += 1;
    materialEntryCount += record.awakening.materials.length;
  } else {
    if (record.awakening !== null) {
      throw new Error(`Hero ${record.heroId} has an awakening payload despite sourceState=${record.sourceState}.`);
    }
    undefinedCount += 1;
  }
  byHeroId.set(record.heroId, record);
}
if (definedCount !== 257 || undefinedCount !== 10 || materialEntryCount !== 771) {
  throw new Error(`Hero awakening materials frozen summary mismatch: defined=${definedCount}, undefined=${undefinedCount}, materials=${materialEntryCount}.`);
}

export function getStaticHeroAwakeningMaterials(heroId: number) {
  return byHeroId.get(heroId) ?? null;
}
