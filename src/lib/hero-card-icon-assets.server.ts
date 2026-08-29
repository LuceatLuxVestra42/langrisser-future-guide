import heroCardIconJson from "../../data/generated/hero-card-icon-assets.v1.json";

type HeroCardIconAssetRecord = {
  heroId: number;
  nameKr: string | null;
  nameCn: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceSha1: string;
  width: number;
  height: number;
  expectedFilePath: string;
  webAssetPath: string;
  assetStatus: string;
  sha256: string;
  byteLength: number;
};

type HeroCardIconAssetSource = {
  version: number;
  stage: string;
  schemaId: string;
  status: string;
  completion: string;
  freezeState: string;
  sourcePolicy: {
    heroListStage1FrozenOnly: boolean;
    bwikiExactCnFileOnly: boolean;
    mappingMode: string;
    rawConfigDataRead: boolean;
    fuzzyMatching: boolean;
    nameSimilarityJoin: boolean;
    idArithmetic: boolean;
    semanticRelationReopened: boolean;
    remoteRuntimeHotlink: boolean;
  };
  summary: {
    heroCount: number;
    resolvedCount: number;
    fileCount: number;
    uniqueHeroIdCount: number;
    uniqueSourceUrlCount: number;
    pendingCount: number;
    hardErrorCount: number;
  };
  records: HeroCardIconAssetRecord[];
};

const source = heroCardIconJson as unknown as HeroCardIconAssetSource;

function assertFrozenHeroCardIconSource() {
  if (
    source.version !== 1 ||
    source.stage !== "hero-card-icon-assets" ||
    source.schemaId !== "hero-card-icon-assets/v1" ||
    source.status !== "PASS" ||
    source.completion !== "COMPLETE" ||
    source.freezeState !== "HERO_CARD_ICON_ASSETS_FROZEN"
  ) {
    throw new Error("Hero card icon frontend requires the frozen local asset manifest.");
  }

  if (
    source.summary.heroCount !== 267 ||
    source.summary.resolvedCount !== 267 ||
    source.summary.fileCount !== 267 ||
    source.summary.uniqueHeroIdCount !== 267 ||
    source.summary.uniqueSourceUrlCount !== 267 ||
    source.summary.pendingCount !== 0 ||
    source.summary.hardErrorCount !== 0 ||
    source.records.length !== 267
  ) {
    throw new Error("Hero card icon asset population/integrity summary is not production-ready.");
  }

  if (
    source.sourcePolicy.heroListStage1FrozenOnly !== true ||
    source.sourcePolicy.bwikiExactCnFileOnly !== true ||
    source.sourcePolicy.mappingMode !== "EXACT_CN_FILENAME_ONLY" ||
    source.sourcePolicy.rawConfigDataRead !== false ||
    source.sourcePolicy.fuzzyMatching !== false ||
    source.sourcePolicy.nameSimilarityJoin !== false ||
    source.sourcePolicy.idArithmetic !== false ||
    source.sourcePolicy.semanticRelationReopened !== false ||
    source.sourcePolicy.remoteRuntimeHotlink !== false
  ) {
    throw new Error("Hero card icon asset production boundary is invalid.");
  }

  const ids = new Set<number>();
  for (const row of source.records) {
    if (!Number.isSafeInteger(row.heroId) || row.heroId <= 0 || ids.has(row.heroId)) {
      throw new Error(`Hero card icon manifest has an invalid/duplicate Hero ID: ${row.heroId}`);
    }
    ids.add(row.heroId);
    if (
      row.assetStatus !== "RESOLVED" ||
      row.webAssetPath !== `/images/heroes/card-icons/${row.heroId}.png` ||
      row.expectedFilePath !== `public/images/heroes/card-icons/${row.heroId}.png` ||
      row.width <= 0 ||
      row.height <= 0 ||
      Math.abs(row.width - row.height) > 8
    ) {
      throw new Error(`Hero ${row.heroId} card icon manifest row is invalid.`);
    }
  }
}

assertFrozenHeroCardIconSource();

export type HeroCardIconIndexRecord = Pick<
  HeroCardIconAssetRecord,
  "heroId" | "webAssetPath" | "width" | "height" | "assetStatus"
>;

export function readHeroCardIconIndex() {
  return {
    records: source.records.map<HeroCardIconIndexRecord>((row) => ({
      heroId: row.heroId,
      webAssetPath: row.webAssetPath,
      width: row.width,
      height: row.height,
      assetStatus: row.assetStatus,
    })),
    summary: {
      total: source.summary.heroCount,
      resolved: source.summary.resolvedCount,
      pending: source.summary.pendingCount,
      hardErrors: source.summary.hardErrorCount,
    },
    source: {
      stage: source.stage,
      schemaId: source.schemaId,
      freezeState: source.freezeState,
      mappingMode: source.sourcePolicy.mappingMode,
      remoteRuntimeHotlink: source.sourcePolicy.remoteRuntimeHotlink,
    },
  };
}
