import artifactRaw from "../../data/generated/hero-job-materials.v1.json";

type JobMaterialSnapshot = {
  jobMaterialId: number;
  nameCn: string;
  descriptionCn: string;
  rank: number | null;
  icon: string | null;
};

export type HeroJobMaterialEntry = {
  goodsType: number;
  id: number;
  count: number;
  jobMaterial: JobMaterialSnapshot;
};

export type HeroJobMaterialLevel = {
  jobLevelId: number;
  rankCode: number | null;
  heroLevelRequired: number | null;
  materials: HeroJobMaterialEntry[];
};

export type HeroJobMaterialConnection = {
  jobConnectionId: number;
  role: string | null;
  jobId: number | null;
  levels: HeroJobMaterialLevel[];
};

type HeroJobMaterialRecord = {
  heroId: number;
  nameKr: string | null;
  nameCn: string | null;
  nameEn: string | null;
  connections: HeroJobMaterialConnection[];
};

type HeroJobMaterialsArtifact = {
  version: 1;
  domain: "hero-job-materials";
  status: "PASS";
  recordCount: number;
  records: HeroJobMaterialRecord[];
};

const artifact = artifactRaw as unknown as HeroJobMaterialsArtifact;

if (artifact.version !== 1 || artifact.domain !== "hero-job-materials" || artifact.status !== "PASS") {
  throw new Error("Hero job materials frozen artifact is not production-ready.");
}
if (artifact.recordCount !== 267 || artifact.records.length !== 267) {
  throw new Error(`Hero job materials frozen coverage mismatch: ${artifact.records.length}/${artifact.recordCount}.`);
}

const byHeroId = new Map<number, HeroJobMaterialRecord>();
for (const record of artifact.records) {
  if (!Number.isSafeInteger(record.heroId) || record.heroId <= 0 || byHeroId.has(record.heroId)) {
    throw new Error(`Hero job materials frozen identity violation at heroId=${String(record.heroId)}.`);
  }
  byHeroId.set(record.heroId, record);
}

export function getStaticHeroJobMaterials(heroId: number) {
  return byHeroId.get(heroId) ?? null;
}
