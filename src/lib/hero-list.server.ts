import heroArtworkJson from "../../data/generated/hero-card-artwork-stage4.v1.json";
import heroStage6ManifestJson from "../../data/generated/hero-detail.v1.json";
import heroListJson from "../../data/generated/hero-list-stage1.v1.json";

export type HeroListFaction = {
  factionId: number;
  nameCn: string;
  nameKr: string | null;
  iconSourcePath: string | null;
};

export type HeroListOrigin = {
  productionId: number;
  nameCn: string;
  nameKr: string | null;
  category: string;
};

export type HeroListRecord = {
  heroId: number;
  detailRoute: string;
  identity: {
    nameKr: string | null;
    nameCn: string;
    nameEn: string | null;
  };
  rarity: {
    rank: number;
    baseLabel: string;
  };
  hasSp: boolean;
  spStatus: string;
  factions: HeroListFaction[];
  origin: HeroListOrigin;
  card: {
    sourceArtworkPath: string | null;
    webAssetPath: string | null;
    assetStatus: string;
  };
};

export type HeroListStage4Record = Omit<HeroListRecord, "card"> & {
  card: HeroListRecord["card"] & {
    expectedFilePath: string;
  };
};

type HeroListStage1Source = {
  version: number;
  stage: string;
  schemaId: string;
  status: string;
  completion: string;
  freezeState: string;
  sourcePolicy: {
    heroStage6FinalFrozenOnly: boolean;
    rawConfigDataRead: boolean;
    stage4ProducerRead: boolean;
    stage5ProducerRead: boolean;
    relationshipRederivation: boolean;
    nameOrIdHeuristics: boolean;
  };
  summary: {
    canonicalHeroCount: number;
    generatedRecordCount: number;
    uniqueHeroCount: number;
    hardErrorCount: number;
  };
  records: HeroListRecord[];
};

type HeroArtworkStage4Source = {
  version: number;
  stage: string;
  schemaId: string;
  status: string;
  completion: string;
  sourcePolicy: {
    heroListStage1FrozenOnly: boolean;
    heroStage6ManifestAdmissionOnly: boolean;
    rawConfigDataRead: boolean;
    inferWebPathFromUnityLocator: boolean;
    resolveOnlyWhenFileExists: boolean;
  };
  summary: {
    heroCount: number;
    uniqueHeroCount: number;
    resolvedCount: number;
    pendingCount: number;
    stage6MissingCount: number;
    routeMismatchCount: number;
    sourceLocatorMissingCount: number;
    hardErrorCount: number;
  };
  records: Array<{
    heroId: number;
    detailRoute: string;
    sourceArtworkPath: string | null;
    expectedFilePath: string;
    webAssetPath: string | null;
    assetStatus: string;
    stage6ShardPath: string | null;
  }>;
};

type HeroStage6ManifestSource = {
  status: string;
  completion: string;
  summary: {
    siteUsableCount: number;
    hardErrorCount: number;
  };
  storage: {
    mode: string;
    recordCount: number;
    byHeroId: Record<
      string,
      {
        path: string;
        sha256: string;
        byteLength: number;
      }
    >;
  };
};

const heroList = heroListJson as unknown as HeroListStage1Source;
const heroArtwork = heroArtworkJson as unknown as HeroArtworkStage4Source;
const heroStage6Manifest = heroStage6ManifestJson as unknown as HeroStage6ManifestSource;

function assertFrozenStage1Source(source: HeroListStage1Source) {
  if (
    source.version !== 1 ||
    source.stage !== "hero-list-stage1" ||
    source.schemaId !== "hero-list/v1" ||
    source.status !== "PASS" ||
    source.completion !== "COMPLETE" ||
    source.freezeState !== "HERO_LIST_STAGE1_FROZEN"
  ) {
    throw new Error("Hero list frontend requires the frozen Stage 1 consumer.");
  }

  if (
    source.summary.canonicalHeroCount !== 267 ||
    source.summary.generatedRecordCount !== 267 ||
    source.summary.uniqueHeroCount !== 267 ||
    source.summary.hardErrorCount !== 0 ||
    source.records.length !== 267
  ) {
    throw new Error("Hero list Stage 1 population/integrity summary is not production-ready.");
  }

  if (
    source.sourcePolicy.heroStage6FinalFrozenOnly !== true ||
    source.sourcePolicy.rawConfigDataRead !== false ||
    source.sourcePolicy.stage4ProducerRead !== false ||
    source.sourcePolicy.stage5ProducerRead !== false ||
    source.sourcePolicy.relationshipRederivation !== false ||
    source.sourcePolicy.nameOrIdHeuristics !== false
  ) {
    throw new Error("Hero list Stage 1 production boundary does not match the frozen contract.");
  }
}

function assertStage4Sources() {
  if (
    heroArtwork.version !== 1 ||
    heroArtwork.stage !== "hero-list-stage4-artwork" ||
    heroArtwork.schemaId !== "hero-card-artwork-stage4/v1" ||
    heroArtwork.status !== "PASS" ||
    heroArtwork.completion !== "RESOLVER_READY" ||
    heroArtwork.summary.heroCount !== 267 ||
    heroArtwork.summary.uniqueHeroCount !== 267 ||
    heroArtwork.summary.stage6MissingCount !== 0 ||
    heroArtwork.summary.routeMismatchCount !== 0 ||
    heroArtwork.summary.sourceLocatorMissingCount !== 0 ||
    heroArtwork.summary.hardErrorCount !== 0
  ) {
    throw new Error("Hero list Stage 4 artwork resolver is not production-ready.");
  }

  if (
    heroArtwork.sourcePolicy.heroListStage1FrozenOnly !== true ||
    heroArtwork.sourcePolicy.heroStage6ManifestAdmissionOnly !== true ||
    heroArtwork.sourcePolicy.rawConfigDataRead !== false ||
    heroArtwork.sourcePolicy.inferWebPathFromUnityLocator !== false ||
    heroArtwork.sourcePolicy.resolveOnlyWhenFileExists !== true
  ) {
    throw new Error("Hero list Stage 4 artwork source policy is invalid.");
  }

  if (
    heroStage6Manifest.status !== "PASS_WITH_REVIEW" ||
    heroStage6Manifest.completion !== "COMPLETE" ||
    heroStage6Manifest.summary.siteUsableCount !== 267 ||
    heroStage6Manifest.summary.hardErrorCount !== 0 ||
    heroStage6Manifest.storage.mode !== "SHARDED_BY_HERO" ||
    heroStage6Manifest.storage.recordCount !== 267
  ) {
    throw new Error("Hero Stage 6 manifest is not ready for detail-route admission.");
  }
}

assertFrozenStage1Source(heroList);
assertStage4Sources();

const artworkByHeroId = new Map(heroArtwork.records.map((record) => [record.heroId, record]));

function buildRarityOptions(records: HeroListRecord[]) {
  const rarityMap = new Map<string, { label: string; rank: number; count: number }>();

  for (const hero of records) {
    const current = rarityMap.get(hero.rarity.baseLabel);
    if (current) {
      current.count += 1;
      continue;
    }

    rarityMap.set(hero.rarity.baseLabel, {
      label: hero.rarity.baseLabel,
      rank: hero.rarity.rank,
      count: 1,
    });
  }

  return [...rarityMap.values()].sort((a, b) => b.rank - a.rank || a.label.localeCompare(b.label));
}

function projectStage4Record(hero: HeroListRecord): HeroListStage4Record {
  const artwork = artworkByHeroId.get(hero.heroId);
  if (!artwork) {
    throw new Error(`Hero ${hero.heroId} is missing from the Stage 4 artwork manifest.`);
  }

  if (
    artwork.detailRoute !== hero.detailRoute ||
    artwork.sourceArtworkPath !== hero.card.sourceArtworkPath ||
    !heroStage6Manifest.storage.byHeroId[String(hero.heroId)]
  ) {
    throw new Error(`Hero ${hero.heroId} Stage 4 parity/admission check failed.`);
  }

  return {
    ...hero,
    card: {
      ...hero.card,
      webAssetPath: artwork.webAssetPath,
      assetStatus: artwork.assetStatus,
      expectedFilePath: artwork.expectedFilePath,
    },
  };
}

export function readHeroListStage2Data() {
  return {
    records: heroList.records,
    summary: {
      total: heroList.summary.generatedRecordCount,
      unique: heroList.summary.uniqueHeroCount,
    },
    source: {
      stage: heroList.stage,
      schemaId: heroList.schemaId,
      freezeState: heroList.freezeState,
    },
  };
}

export function readHeroListStage3Data() {
  return {
    ...readHeroListStage2Data(),
    filters: {
      rarities: buildRarityOptions(heroList.records),
      spCount: heroList.records.filter((hero) => hero.hasSp).length,
    },
    presentation: {
      displayOrdering: "FROZEN_RECORD_ORDER",
      releaseChronologyAvailable: false,
      factionKoreanLabelsComplete: false,
      originKoreanLabelsComplete: false,
    },
  };
}

export function readHeroListStage4Data() {
  return {
    ...readHeroListStage3Data(),
    records: heroList.records.map(projectStage4Record),
    artwork: {
      resolved: heroArtwork.summary.resolvedCount,
      pending: heroArtwork.summary.pendingCount,
      total: heroArtwork.summary.heroCount,
      policy: "FILE_EXISTS_ONLY",
    },
  };
}

export function readHeroDetailRouteStage4Data(heroId: number) {
  const hero = heroList.records.find((record) => record.heroId === heroId);
  if (!hero) return null;

  const stage6Shard = heroStage6Manifest.storage.byHeroId[String(heroId)];
  if (!stage6Shard) return null;

  return {
    hero: projectStage4Record(hero),
    stage6: {
      admissionStatus: "SHARD_AVAILABLE",
      shardPath: stage6Shard.path,
      sha256: stage6Shard.sha256,
      byteLength: stage6Shard.byteLength,
      fullShardRuntimeRead: false,
    },
  };
}
