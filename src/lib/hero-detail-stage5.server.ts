import { readHeroSkinPresentation } from "./skin-detail.server";
import { readHeroDetailRouteStage4Data } from "./hero-list.server";

type Stage6JobConnection = {
  jobConnectionId?: number;
  jobId?: number;
  role?: string | null;
  depth?: number | null;
  job?: {
    id?: number;
    nameCn?: string | null;
    nameEn?: string | null;
    rank?: number | null;
  } | null;
  finalDisplayStats?: {
    status?: string | null;
    heroLevel?: number | null;
    star?: number | null;
    values?: {
      hp?: number | null;
      at?: number | null;
      magic?: number | null;
      df?: number | null;
      magicDf?: number | null;
      dex?: number | null;
    } | null;
  } | null;
};

type Stage6JobTree = {
  branches?: number[][];
  connections?: Stage6JobConnection[];
};

type FeatureBlock = {
  status?: string | null;
} | null | undefined;

type Stage6HeroShard = {
  heroId: number;
  identity?: {
    nameCn?: string | null;
    nameEn?: string | null;
    nameKr?: string | null;
  } | null;
  presentation?: {
    cv?: {
      state?: string | null;
      sourceValue?: string | null;
      nameKr?: string | null;
    } | null;
    skins?: unknown[] | null;
  } | null;
  normal?: {
    heroMeta?: {
      initialStar?: number | null;
      rank?: number | null;
    } | null;
    jobTree?: Stage6JobTree | null;
  } | null;
  bonds?: unknown[] | null;
  exclusiveEquipment?: FeatureBlock;
  centralDiscipline?: FeatureBlock;
  soldiers?: { ids?: number[] } | null;
  sp?: FeatureBlock;
  validation?: {
    structuralStatus?: string | null;
    publicationStatus?: string | null;
    siteUsable?: boolean | null;
    reviewCodes?: string[] | null;
  } | null;
};

const stage6ShardModules = import.meta.glob<Stage6HeroShard>(
  "../../data/generated/hero-detail/by-id/*.json",
  { eager: false, import: "default" },
);

function isReleased(value: FeatureBlock): boolean {
  return value?.status === "RELEASED";
}

function projectJobBranches(jobTree: Stage6JobTree | null | undefined) {
  const branchIds = Array.isArray(jobTree?.branches) ? jobTree.branches : [];
  const connections = Array.isArray(jobTree?.connections) ? jobTree.connections : [];
  const byConnectionId = new Map<number, Stage6JobConnection>();
  for (const row of connections) {
    if (Number.isInteger(row.jobConnectionId)) byConnectionId.set(Number(row.jobConnectionId), row);
  }

  return branchIds.map((ids, branchIndex) => {
    const jobs: Stage6JobConnection[] = [];
    for (const id of ids) {
      const row = byConnectionId.get(Number(id));
      if (row) jobs.push(row);
    }
    const capstone = jobs.at(-1) ?? null;
    const values = capstone?.finalDisplayStats?.values;

    return {
      branchIndex: branchIndex + 1,
      connectionIds: ids.map(Number),
      jobs: jobs.map((job) => ({
        jobConnectionId: job.jobConnectionId ?? null,
        jobId: job.jobId ?? job.job?.id ?? null,
        nameCn: job.job?.nameCn ?? null,
        nameEn: job.job?.nameEn ?? null,
        rank: job.job?.rank ?? null,
        depth: job.depth ?? null,
      })),
      capstone: capstone
        ? {
            jobConnectionId: capstone.jobConnectionId ?? null,
            jobId: capstone.jobId ?? capstone.job?.id ?? null,
            nameCn: capstone.job?.nameCn ?? null,
            rank: capstone.job?.rank ?? null,
            heroLevel: capstone.finalDisplayStats?.heroLevel ?? null,
            star: capstone.finalDisplayStats?.star ?? null,
            statStatus: capstone.finalDisplayStats?.status ?? null,
            finalStats: {
              HP: values?.hp ?? null,
              ATK: values?.at ?? null,
              INT: values?.magic ?? null,
              DEF: values?.df ?? null,
              MDEF: values?.magicDf ?? null,
              DEX: values?.dex ?? null,
            },
          }
        : null,
    };
  });
}

function projectStage6Shard(shard: Stage6HeroShard) {
  const validation = shard.validation;
  if (!validation || validation.structuralStatus !== "PASS" || validation.siteUsable !== true) {
    throw new Error(`Hero ${shard.heroId} Stage 6 shard is not structurally usable.`);
  }

  const jobTree = shard.normal?.jobTree;
  const branches = projectJobBranches(jobTree);
  const connections = Array.isArray(jobTree?.connections) ? jobTree.connections : [];
  const soldierIds = Array.isArray(shard.soldiers?.ids) ? shard.soldiers.ids : [];
  const skins = Array.isArray(shard.presentation?.skins) ? shard.presentation.skins : [];
  const reviewCodes = Array.isArray(validation.reviewCodes) ? validation.reviewCodes : [];

  return {
    identity: {
      nameKr: shard.identity?.nameKr ?? null,
      nameCn: shard.identity?.nameCn ?? null,
      nameEn: shard.identity?.nameEn ?? null,
    },
    presentation: {
      cvState: shard.presentation?.cv?.state ?? null,
      cvSourceValue: shard.presentation?.cv?.sourceValue ?? null,
      cvNameKr: shard.presentation?.cv?.nameKr ?? null,
      skinCount: skins.length,
    },
    base: {
      initialStar: shard.normal?.heroMeta?.initialStar ?? null,
      rank: shard.normal?.heroMeta?.rank ?? null,
    },
    jobs: {
      branchCount: branches.length,
      connectionCount: connections.length,
      branches,
    },
    soldiers: { count: soldierIds.length, ids: soldierIds },
    systems: {
      bondRowCount: Array.isArray(shard.bonds) ? shard.bonds.length : 0,
      exclusiveEquipmentStatus: shard.exclusiveEquipment?.status ?? null,
      exclusiveEquipmentReleased: isReleased(shard.exclusiveEquipment),
      centralDisciplineStatus: shard.centralDiscipline?.status ?? null,
      centralDisciplineReleased: isReleased(shard.centralDiscipline),
      spStatus: shard.sp?.status ?? null,
      spReleased: isReleased(shard.sp),
    },
    validation: {
      structuralStatus: validation.structuralStatus,
      publicationStatus: validation.publicationStatus ?? null,
      reviewCodes,
      reviewCount: reviewCodes.length,
    },
  };
}

export async function readHeroDetailRouteStage5Data(heroId: number) {
  const shell = readHeroDetailRouteStage4Data(heroId);
  if (!shell) return null;
  const skinPresentation = readHeroSkinPresentation(heroId);
  if (!skinPresentation) return null;
  const moduleKey = `../../data/generated/hero-detail/by-id/${heroId}.json`;
  const loadShard = stage6ShardModules[moduleKey];
  if (!loadShard) return null;
  const shard = await loadShard();
  if (!shard || shard.heroId !== heroId) throw new Error(`Hero ${heroId} Stage 6 shard identity mismatch.`);
  const detail = projectStage6Shard(shard);
  if (detail.presentation.skinCount !== skinPresentation.items.length) {
    throw new Error(`Hero ${heroId} Stage 6/Skin frozen relation count mismatch.`);
  }
  return {
    ...shell,
    stage6: {
      ...shell.stage6,
      admissionStatus: "SINGLE_SHARD_LOADED",
      singleShardRuntimeRead: true,
      fullDatasetRuntimeRead: false,
    },
    detail: {
      ...detail,
      presentation: {
        ...detail.presentation,
        skins: skinPresentation.items,
        skinSource: skinPresentation.source,
      },
    },
  };
}
