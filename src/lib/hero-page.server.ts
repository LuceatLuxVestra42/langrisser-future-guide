import leonDetailJson from "../../data/generated/hero-detail/by-id/6.json";

type StatValues = {
  hp: number;
  at: number;
  magic: number;
  df: number;
  magicDf: number;
  dex: number;
};

type HeroDetailSource = {
  heroId: number;
  identity: {
    nameKr: string;
    nameCn: string;
    nameEn: string;
  };
  presentation: {
    rarity: { rank: number; baseLabel: string };
    factions: Array<{ factionId: number; nameCn: string; nameKr: string | null }>;
    cv: { state: string; sourceValue: string; nameKr: string | null };
    origin: { productionId: number; nameCn: string; nameKr: string | null; category: string };
    artwork: { sourceAssetPath: string };
    skins: Array<{
      skinId: number;
      order: number;
      nameCn: string;
      nameKr: string | null;
      sourceImagePath: string;
      acquisition: {
        state: string;
        typeCode: number | null;
        labelCn: string | null;
        labelKr: string | null;
      };
    }>;
  };
  normal: {
    heroMeta: { initialStar: number; rank: number };
    jobTree: {
      orderedConnectionIds: number[];
      branches: number[][];
      connections: Array<{
        jobConnectionId: number;
        role: string;
        jobId: number;
        job: { id: number; nameCn: string; nameEn: string | null; rank: number };
        uiSort: number;
        depth: number;
        finalDisplayStats: {
          status: string;
          heroLevel: number;
          star: number;
          values: StatValues;
        };
      }>;
    };
  };
  sp?: unknown;
};

const leon = leonDetailJson as unknown as HeroDetailSource;

export type HeroPrototypePageData = ReturnType<typeof projectHero>;

function projectHero(source: HeroDetailSource) {
  return {
    heroId: source.heroId,
    identity: source.identity,
    rarity: source.presentation.rarity,
    factions: source.presentation.factions.map((faction) => ({
      factionId: faction.factionId,
      displayName: faction.nameKr ?? faction.nameCn,
      nameCn: faction.nameCn,
      localizationPending: faction.nameKr === null,
    })),
    cv: {
      displayName: source.presentation.cv.nameKr ?? source.presentation.cv.sourceValue,
      sourceValue: source.presentation.cv.sourceValue,
      localizationPending: source.presentation.cv.nameKr === null,
    },
    origin: {
      displayName: source.presentation.origin.nameKr ?? source.presentation.origin.nameCn,
      nameCn: source.presentation.origin.nameCn,
      category: source.presentation.origin.category,
      localizationPending: source.presentation.origin.nameKr === null,
    },
    artworkSourcePath: source.presentation.artwork.sourceAssetPath,
    skins: source.presentation.skins
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((skin) => ({
        skinId: skin.skinId,
        order: skin.order,
        displayName: skin.nameKr ?? skin.nameCn,
        nameCn: skin.nameCn,
        localizationPending: skin.nameKr === null,
        sourceImagePath: skin.sourceImagePath,
        acquisitionLabel: skin.acquisition.labelKr ?? skin.acquisition.labelCn,
      })),
    normal: {
      initialStar: source.normal.heroMeta.initialStar,
      branches: source.normal.jobTree.branches,
      jobs: source.normal.jobTree.connections
        .slice()
        .sort((a, b) => a.uiSort - b.uiSort)
        .map((connection) => ({
          jobConnectionId: connection.jobConnectionId,
          jobId: connection.jobId,
          nameCn: connection.job.nameCn,
          rank: connection.job.rank,
          depth: connection.depth,
          role: connection.role,
          finalDisplayStats: connection.finalDisplayStats,
        })),
    },
    hasSpData: source.sp != null,
  };
}

export function readHeroPrototypePageData(heroId: number): HeroPrototypePageData | null {
  if (heroId !== leon.heroId) return null;
  return projectHero(leon);
}
