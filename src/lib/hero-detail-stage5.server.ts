import { readHeroDetailRouteStage4Data } from "./hero-list.server";

type UnknownRecord = Record<string, unknown>;

type Stage6JobStats = {
  HP?: number | null;
  ATK?: number | null;
  INT?: number | null;
  DEF?: number | null;
  MDEF?: number | null;
};

type Stage6JobConnection = {
  jobId?: number;
  jobIndex?: number;
  nameZh?: string | null;
  tier?: number | null;
  routeRow?: number | null;
  isCapstone?: boolean;
  levelCap?: number | null;
  moveType?: number | null;
  movePoint?: number | null;
  finalDisplayStats?: Stage6JobStats | null;
};

type Stage6JobBranch = {
  routeRow?: number | null;
  jobIds?: number[];
  capstoneJobId?: number | null;
  connections?: Stage6JobConnection[];
};

type Stage6HeroShard = {
  heroId: number;
  identity?: {
    grade?: number | null;
    nameZh?: string | null;
    nameEn?: string | null;
    nameKr?: string | null;
  };
  presentation?: {
    sourceArtworkPath?: string | null;
    cvZh?: string | null;
    cvJp?: string | null;
    skins?: unknown[] | null;
  };
  normal?: {
    heroMeta?: {
      initialStar?: number | null;
      sex?: number | string | null;
      voiceId?: number | null;
      talentId?: number | null;
    } | null;
    jobTree?: {
      nodes?: unknown[];
      branch?: Stage6JobBranch[];
    } | null;
  };
  bonds?: unknown;
  exclusiveEquipment?: unknown;
  centralDiscipline?: unknown;
  soldiers?: {
    ids?: number[];
    source?: string | null;
    consumerHint?: string | null;
  } | null;
  sp?: unknown;
  validation?: {
    hardErrors?: unknown[];
    warnings?: unknown[];
  } | null;
};

const stage6ShardModules = import.meta.glob<Stage6HeroShard>(
  "../../data/generated/hero-detail/by-id/*.json",
  { eager: false, import: "default" },
);

function isMeaningful(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as UnknownRecord).length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function projectJobBranch(branch: Stage6JobBranch) {
  const connections = Array.isArray(branch.connections) ? branch.connections : [];
  const capstone =
    connections.find((job) => job.isCapstone === true) ??
    connections.find((job) => job.jobId === branch.capstoneJobId) ??
    connections.at(-1) ??
    null;

  return {
    routeRow: branch.routeRow ?? null,
    capstoneJobId: branch.capstoneJobId ?? capstone?.jobId ?? null,
    jobs: connections.map((job) => ({
      jobId: job.jobId ?? null,
      jobIndex: job.jobIndex ?? null,
      nameZh: job.nameZh ?? null,
      tier: job.tier ?? null,
      isCapstone: job === capstone,
    })),
    capstone: capstone
      ? {
          jobId: capstone.jobId ?? null,
          nameZh: capstone.nameZh ?? null,
          levelCap: capstone.levelCap ?? null,
          moveType: capstone.moveType ?? null,
          movePoint: capstone.movePoint ?? null,
          finalStats: {
            HP: capstone.finalDisplayStats?.HP ?? null,
            ATK: capstone.finalDisplayStats?.ATK ?? null,
            INT: capstone.finalDisplayStats?.INT ?? null,
            DEF: capstone.finalDisplayStats?.DEF ?? null,
            MDEF: capstone.finalDisplayStats?.MDEF ?? null,
          },
        }
      : null,
  };
}

function projectStage6Shard(shard: Stage6HeroShard) {
  const hardErrors = shard.validation?.hardErrors ?? [];
  if (!Array.isArray(hardErrors) || hardErrors.length !== 0) {
    throw new Error(`Hero ${shard.heroId} Stage 6 shard contains hard errors.`);
  }

  const branches = Array.isArray(shard.normal?.jobTree?.branch)
    ? shard.normal.jobTree.branch
    : [];
  const soldierIds = Array.isArray(shard.soldiers?.ids) ? shard.soldiers.ids : [];
  const skins = Array.isArray(shard.presentation?.skins) ? shard.presentation.skins : [];

  return {
    identity: {
      grade: shard.identity?.grade ?? null,
      nameKr: shard.identity?.nameKr ?? null,
      nameZh: shard.identity?.nameZh ?? null,
      nameEn: shard.identity?.nameEn ?? null,
    },
    presentation: {
      cvJp: shard.presentation?.cvJp ?? null,
      cvZh: shard.presentation?.cvZh ?? null,
      skinCount: skins.length,
    },
    base: {
      initialStar: shard.normal?.heroMeta?.initialStar ?? null,
      sex: shard.normal?.heroMeta?.sex ?? null,
      voiceId: shard.normal?.heroMeta?.voiceId ?? null,
      talentId: shard.normal?.heroMeta?.talentId ?? null,
    },
    jobs: {
      branchCount: branches.length,
      nodeCount: Array.isArray(shard.normal?.jobTree?.nodes)
        ? shard.normal.jobTree.nodes.length
        : 0,
      branches: branches.map(projectJobBranch),
    },
    soldiers: {
      count: soldierIds.length,
      ids: soldierIds,
      source: shard.soldiers?.source ?? null,
    },
    systems: {
      bonds: isMeaningful(shard.bonds),
      exclusiveEquipment: isMeaningful(shard.exclusiveEquipment),
      centralDiscipline: isMeaningful(shard.centralDiscipline),
      sp: isMeaningful(shard.sp),
    },
    validation: {
      hardErrorCount: hardErrors.length,
      warningCount: Array.isArray(shard.validation?.warnings)
        ? shard.validation.warnings.length
        : 0,
    },
  };
}

export async function readHeroDetailRouteStage5Data(heroId: number) {
  const shell = readHeroDetailRouteStage4Data(heroId);
  if (!shell) return null;

  const moduleKey = `../../data/generated/hero-detail/by-id/${heroId}.json`;
  const loadShard = stage6ShardModules[moduleKey];
  if (!loadShard) return null;

  const shard = await loadShard();
  if (!shard || shard.heroId !== heroId) {
    throw new Error(`Hero ${heroId} Stage 6 shard identity mismatch.`);
  }

  return {
    ...shell,
    stage6: {
      ...shell.stage6,
      admissionStatus: "SINGLE_SHARD_LOADED",
      singleShardRuntimeRead: true,
      fullDatasetRuntimeRead: false,
    },
    detail: projectStage6Shard(shard),
  };
}
