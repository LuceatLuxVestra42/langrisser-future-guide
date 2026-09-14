const STAT_KEYS = ["HP", "ATK", "INT", "DEF", "MDEF", "DEX"] as const;

type StatKey = (typeof STAT_KEYS)[number];
type SourceStatKey = "hp" | "at" | "magic" | "df" | "magicDf" | "dex";
type Variant = "NORMAL" | "SP";

type Stage6FinalDisplayStats = {
  status?: string | null;
  values?: Partial<Record<SourceStatKey, number | null>> | null;
} | null | undefined;

type Stage6JobConnection = {
  jobConnectionId?: number | null;
  jobId?: number | null;
  job?: {
    id?: number | null;
    rank?: number | null;
  } | null;
  finalDisplayStats?: Stage6FinalDisplayStats;
};

type Stage6HeroShard = {
  heroId: number;
  normal?: {
    jobTree?: {
      connections?: Stage6JobConnection[] | null;
    } | null;
  } | null;
  sp?: {
    status?: string | null;
    job?: {
      jobConnectionId?: number | null;
      jobId?: number | null;
    } | null;
    finalDisplayStats?: Stage6FinalDisplayStats;
  } | null;
};

type Winner = {
  heroId: number;
  variant: Variant;
  jobConnectionId: number | null;
  jobId: number | null;
  value: number;
};

type Domain = {
  min: number;
  max: number;
  minWinners: Winner[];
  maxWinners: Winner[];
};

type Candidate = {
  heroId: number;
  variant: Variant;
  jobConnectionId: number | null;
  jobId: number | null;
  values: Record<StatKey, number>;
};

const SOURCE_KEY_BY_STAT: Record<StatKey, SourceStatKey> = {
  HP: "hp",
  ATK: "at",
  INT: "magic",
  DEF: "df",
  MDEF: "magicDf",
  DEX: "dex",
};

const stage6ShardModules = import.meta.glob<Stage6HeroShard>(
  "../../data/generated/hero-detail/by-id/*.json",
  { eager: false, import: "default" },
);

function projectValues(stats: Stage6FinalDisplayStats, context: string): Record<StatKey, number> {
  if (stats?.status !== "VERIFIED" || !stats.values) {
    throw new Error(`${context} finalDisplayStats is not VERIFIED.`);
  }

  return Object.fromEntries(STAT_KEYS.map((stat) => {
    const sourceKey = SOURCE_KEY_BY_STAT[stat];
    const value = stats.values?.[sourceKey];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${context} ${stat} is not a finite finalDisplayStats value.`);
    }
    return [stat, value];
  })) as Record<StatKey, number>;
}

async function readCurrentCandidates(): Promise<Candidate[]> {
  const moduleEntries = Object.entries(stage6ShardModules);
  if (moduleEntries.length !== 267) {
    throw new Error(`Hero final-job stat domain source shard count drift: ${moduleEntries.length} != 267.`);
  }

  const shards = await Promise.all(moduleEntries.map(async ([sourcePath, load]) => {
    const shard = await load();
    if (!Number.isSafeInteger(shard.heroId) || shard.heroId <= 0) {
      throw new Error(`Invalid Hero ID in ${sourcePath}.`);
    }
    return shard;
  }));

  const heroIds = new Set(shards.map((shard) => shard.heroId));
  if (heroIds.size !== 267) {
    throw new Error(`Hero final-job stat domain source Hero ID count drift: ${heroIds.size} != 267.`);
  }

  const candidates: Candidate[] = [];
  for (const shard of shards) {
    const connections = Array.isArray(shard.normal?.jobTree?.connections)
      ? shard.normal.jobTree.connections
      : [];

    for (const connection of connections) {
      if (connection.job?.rank !== 4) continue;
      candidates.push({
        heroId: shard.heroId,
        variant: "NORMAL",
        jobConnectionId: Number.isInteger(connection.jobConnectionId) ? Number(connection.jobConnectionId) : null,
        jobId: Number.isInteger(connection.jobId ?? connection.job?.id) ? Number(connection.jobId ?? connection.job?.id) : null,
        values: projectValues(connection.finalDisplayStats, `Hero ${shard.heroId} normal final job ${connection.jobConnectionId ?? "?"}`),
      });
    }

    if (shard.sp?.status === "RELEASED") {
      candidates.push({
        heroId: shard.heroId,
        variant: "SP",
        jobConnectionId: Number.isInteger(shard.sp.job?.jobConnectionId) ? Number(shard.sp.job?.jobConnectionId) : null,
        jobId: Number.isInteger(shard.sp.job?.jobId) ? Number(shard.sp.job?.jobId) : null,
        values: projectValues(shard.sp.finalDisplayStats, `Hero ${shard.heroId} SP final job`),
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error("Hero final-job stat domain candidate set is empty.");
  }

  return candidates;
}

async function buildPresentation() {
  const candidates = await readCurrentCandidates();
  const domains = Object.fromEntries(STAT_KEYS.map((stat) => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const value = candidate.values[stat];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      throw new Error(`Hero final-job ${stat} stat domain is invalid: ${min}..${max}.`);
    }

    const toWinner = (candidate: Candidate): Winner => ({
      heroId: candidate.heroId,
      variant: candidate.variant,
      jobConnectionId: candidate.jobConnectionId,
      jobId: candidate.jobId,
      value: candidate.values[stat],
    });

    return [stat, {
      min,
      max,
      minWinners: candidates.filter((candidate) => candidate.values[stat] === min).map(toWinner),
      maxWinners: candidates.filter((candidate) => candidate.values[stat] === max).map(toWinner),
    } satisfies Domain];
  })) as Record<StatKey, Domain>;

  return {
    source: "data/generated/hero-detail/by-id/*.json",
    sourceStage: "hero-page-6-3",
    canonicalHeroCount: 267,
    candidateCount: candidates.length,
    minimumFillPercent: 25,
    maximumFillPercent: 100,
    domains,
  };
}

let presentationPromise: ReturnType<typeof buildPresentation> | null = null;

export function getHeroFinalJobStatBarPresentation() {
  presentationPromise ??= buildPresentation();
  return presentationPromise;
}
