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

const heroList = heroListJson as unknown as HeroListStage1Source;

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

assertFrozenStage1Source(heroList);

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
