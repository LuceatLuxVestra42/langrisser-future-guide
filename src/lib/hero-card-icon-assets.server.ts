import heroCardIconJson from "../../data/generated/hero-card-icon-assets.v1.json";
import heroCardIconWebDeliveryJson from "../../data/generated/hero-card-icon-web-delivery.v1.json";

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

type HeroCardIconWebDeliveryRecord = {
  heroId: number;
  sourcePngPath: string;
  sourcePngSha256: string;
  width: number;
  height: number;
  webDeliveryFormat: string;
  webDeliveryMode: string;
  webDeliveryPath: string;
  webDeliveryFilePath: string;
  webDeliverySha256: string;
  webDeliveryByteLength: number;
};

type HeroCardIconWebDeliverySource = {
  version: number;
  stage: string;
  schemaId: string;
  status: string;
  completion: string;
  freezeState: string;
  sourceFreezeState: string;
  sourcePolicy: {
    pngAuthoritativeSourceRetained: boolean;
    webDeliveryFormat: string;
    semanticRelationReopened: boolean;
    remoteRuntimeHotlink: boolean;
  };
  summary: {
    heroCount: number;
    sourcePngCount: number;
    webDeliveryCount: number;
    pendingCount: number;
    hardErrorCount: number;
    sourcePngTotalBytes: number;
    webDeliveryTotalBytes: number;
    webDeliverySavingsPercent: number;
  };
  records: HeroCardIconWebDeliveryRecord[];
};

const source = heroCardIconJson as unknown as HeroCardIconAssetSource;
const delivery = heroCardIconWebDeliveryJson as unknown as HeroCardIconWebDeliverySource;
const deliveryByHeroId = new Map(delivery.records.map((row) => [row.heroId, row]));

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

  if (
    delivery.version !== 1 ||
    delivery.stage !== "hero-card-icon-web-delivery" ||
    delivery.schemaId !== "hero-card-icon-web-delivery/v1" ||
    delivery.status !== "PASS" ||
    delivery.completion !== "COMPLETE" ||
    delivery.freezeState !== "HERO_CARD_ICON_WEB_DELIVERY_FROZEN" ||
    delivery.sourceFreezeState !== source.freezeState ||
    delivery.sourcePolicy.pngAuthoritativeSourceRetained !== true ||
    delivery.sourcePolicy.webDeliveryFormat !== "LOSSLESS_WEBP" ||
    delivery.sourcePolicy.semanticRelationReopened !== false ||
    delivery.sourcePolicy.remoteRuntimeHotlink !== false ||
    delivery.summary.heroCount !== 267 ||
    delivery.summary.sourcePngCount !== 267 ||
    delivery.summary.webDeliveryCount !== 267 ||
    delivery.summary.pendingCount !== 0 ||
    delivery.summary.hardErrorCount !== 0 ||
    delivery.records.length !== 267 ||
    delivery.summary.webDeliveryTotalBytes >= delivery.summary.sourcePngTotalBytes
  ) {
    throw new Error("Hero card icon lossless WebP delivery manifest is not production-ready.");
  }

  const ids = new Set<number>();
  for (const row of source.records) {
    if (!Number.isSafeInteger(row.heroId) || row.heroId <= 0 || ids.has(row.heroId)) {
      throw new Error(`Hero card icon manifest has an invalid/duplicate Hero ID: ${row.heroId}`);
    }
    ids.add(row.heroId);
    const deliveryRow = deliveryByHeroId.get(row.heroId);
    if (
      !deliveryRow ||
      deliveryRow.sourcePngPath !== row.webAssetPath ||
      deliveryRow.sourcePngSha256 !== row.sha256 ||
      deliveryRow.width !== row.width ||
      deliveryRow.height !== row.height ||
      deliveryRow.webDeliveryFormat !== "image/webp" ||
      deliveryRow.webDeliveryMode !== "LOSSLESS" ||
      deliveryRow.webDeliveryPath !== `/images/heroes/card-icons-webp/${row.heroId}.webp` ||
      deliveryRow.webDeliveryFilePath !== `public/images/heroes/card-icons-webp/${row.heroId}.webp` ||
      deliveryRow.webDeliveryByteLength <= 0
    ) {
      throw new Error(`Hero ${row.heroId} card icon WebP delivery row is invalid.`);
    }
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
  "heroId" | "nameKr" | "nameCn" | "webAssetPath" | "width" | "height" | "assetStatus"
>;

export function readHeroCardIconIndex() {
  return {
    records: source.records.map<HeroCardIconIndexRecord>((row) => ({
      heroId: row.heroId,
      nameKr: row.nameKr,
      nameCn: row.nameCn,
      webAssetPath: deliveryByHeroId.get(row.heroId)!.webDeliveryPath,
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
      webDeliveryFreezeState: delivery.freezeState,
      webDeliveryFormat: delivery.sourcePolicy.webDeliveryFormat,
      pngAuthoritativeSourceRetained: delivery.sourcePolicy.pngAuthoritativeSourceRetained,
      webDeliverySavingsPercent: delivery.summary.webDeliverySavingsPercent,
    },
  };
}
