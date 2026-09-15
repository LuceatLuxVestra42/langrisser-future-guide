import artifactRaw from "../../data/generated/hero-job-materials.v1.json";
import presentationPolicyRaw from "../../data/generated/hero-job-material-presentation-policy.v1.json";

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

type HeroJobMaterialPresentationPolicy = {
  version: 1;
  domain: "hero-job-material-presentation-policy";
  status: "PASS";
  terminalSentinel: {
    goodsType: number;
    jobMaterialId: number;
    count: number;
    terminalRelation: "FINAL_PRESERVED_SOURCE_LEVEL";
    requireSoleMaterialInTerminalLevel: true;
    presentationEligible: false;
  };
  validatedPopulation: {
    heroCount: number;
    connectionCount: number;
    materialEntryCount: number;
    terminalSentinelCount: number;
    presentationEligibleMaterialEntryCount: number;
  };
};

const artifact = artifactRaw as unknown as HeroJobMaterialsArtifact;
const presentationPolicy = presentationPolicyRaw as unknown as HeroJobMaterialPresentationPolicy;

if (artifact.version !== 1 || artifact.domain !== "hero-job-materials" || artifact.status !== "PASS") {
  throw new Error("Hero job materials frozen artifact is not production-ready.");
}
if (artifact.recordCount !== 267 || artifact.records.length !== 267) {
  throw new Error(`Hero job materials frozen coverage mismatch: ${artifact.records.length}/${artifact.recordCount}.`);
}
if (
  presentationPolicy.version !== 1 ||
  presentationPolicy.domain !== "hero-job-material-presentation-policy" ||
  presentationPolicy.status !== "PASS"
) {
  throw new Error("Hero job material presentation policy is not production-ready.");
}

const sentinel = presentationPolicy.terminalSentinel;
if (
  sentinel.goodsType !== 5 ||
  sentinel.jobMaterialId !== 40 ||
  sentinel.count !== 999 ||
  sentinel.terminalRelation !== "FINAL_PRESERVED_SOURCE_LEVEL" ||
  sentinel.requireSoleMaterialInTerminalLevel !== true ||
  sentinel.presentationEligible !== false
) {
  throw new Error("Hero job material terminal sentinel policy identity mismatch.");
}

let observedConnectionCount = 0;
let observedMaterialEntryCount = 0;
let observedSentinelCount = 0;
let observedEligibleMaterialEntryCount = 0;
const byHeroId = new Map<number, HeroJobMaterialRecord>();

for (const record of artifact.records) {
  if (!Number.isSafeInteger(record.heroId) || record.heroId <= 0 || byHeroId.has(record.heroId)) {
    throw new Error(`Hero job materials frozen identity violation at heroId=${String(record.heroId)}.`);
  }

  const projectedConnections = record.connections.map((connection) => {
    observedConnectionCount += 1;
    if (connection.levels.length === 0) {
      throw new Error(`Hero job materials connection ${connection.jobConnectionId} has no levels.`);
    }

    const terminalLevelIndex = connection.levels.length - 1;
    const matchingEntries: Array<{ levelIndex: number; materialIndex: number }> = [];

    connection.levels.forEach((level, levelIndex) => {
      level.materials.forEach((material, materialIndex) => {
        observedMaterialEntryCount += 1;
        if (
          material.goodsType === sentinel.goodsType &&
          material.id === sentinel.jobMaterialId &&
          material.count === sentinel.count
        ) {
          matchingEntries.push({ levelIndex, materialIndex });
        }
      });
    });

    if (matchingEntries.length !== 1) {
      throw new Error(
        `Hero job materials connection ${connection.jobConnectionId} terminal sentinel count=${matchingEntries.length}.`,
      );
    }

    const match = matchingEntries[0];
    const terminalLevel = connection.levels[terminalLevelIndex];
    if (
      !match ||
      !terminalLevel ||
      match.levelIndex !== terminalLevelIndex ||
      match.materialIndex !== 0 ||
      terminalLevel.materials.length !== 1
    ) {
      throw new Error(`Hero job materials connection ${connection.jobConnectionId} terminal sentinel invariant mismatch.`);
    }

    observedSentinelCount += 1;

    return {
      ...connection,
      levels: connection.levels.map((level, levelIndex) => ({
        ...level,
        materials:
          levelIndex === terminalLevelIndex
            ? level.materials.filter(
                (material) =>
                  !(
                    material.goodsType === sentinel.goodsType &&
                    material.id === sentinel.jobMaterialId &&
                    material.count === sentinel.count
                  ),
              )
            : level.materials,
      })),
    };
  });

  const projectedRecord = {
    ...record,
    connections: projectedConnections,
  };
  byHeroId.set(record.heroId, projectedRecord);
}

observedEligibleMaterialEntryCount = observedMaterialEntryCount - observedSentinelCount;
const expected = presentationPolicy.validatedPopulation;
if (
  expected.heroCount !== artifact.records.length ||
  expected.connectionCount !== observedConnectionCount ||
  expected.materialEntryCount !== observedMaterialEntryCount ||
  expected.terminalSentinelCount !== observedSentinelCount ||
  expected.presentationEligibleMaterialEntryCount !== observedEligibleMaterialEntryCount
) {
  throw new Error(
    `Hero job material presentation policy coverage mismatch: heroes=${artifact.records.length}, connections=${observedConnectionCount}, entries=${observedMaterialEntryCount}, sentinels=${observedSentinelCount}, eligible=${observedEligibleMaterialEntryCount}.`,
  );
}

export function getStaticHeroJobMaterials(heroId: number) {
  return byHeroId.get(heroId) ?? null;
}
