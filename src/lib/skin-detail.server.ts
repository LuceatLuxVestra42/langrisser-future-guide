import skinRelationJson from "../../data/generated/skin-stage2-3-bidirectional-relation.v1.json";
import skinAssetMapJson from "../../data/generated/skin-stage3-5-static-web-asset-map.v1.json";
import skinAssetValidationJson from "../../data/validation/skin-stage3-5-static-web-asset-map.v1.json";

type SkinRelation = {
  stage: string;
  substage: string;
  status: string;
  cardinality: {
    skinToHero: string;
    heroToSkin: string;
  };
  counts: {
    bySkinId: number;
    byHeroId: number;
    edgeCount: number;
  };
  bySkinId: Record<string, { heroId: number; sourceOrder: number }>;
  byHeroId: Record<string, number[]>;
};

type SkinAssetRecord = {
  skinId: number;
  heroId: number;
  sourceOrder: number;
  publicPath: string;
  sizeBytes: number;
  sha256: string;
};

type SkinAssetMap = {
  stage: string;
  substage: string;
  status: string;
  counts: {
    mappedSkinCount: number;
    materializedFileCount: number;
    missingFileCount: number;
    hashMismatchCount: number;
    pathCollisionCount: number;
    unexpectedFileCount: number;
  };
  records: SkinAssetRecord[];
};

type SkinAssetValidation = {
  stage: string;
  substage: string;
  status: string;
  finalReady: boolean;
  counts: {
    expectedSkinCount: number;
    acceptedSkinCount: number;
    missingFileCount: number;
    hashMismatchCount: number;
    pathCollisionCount: number;
    unexpectedFileCount: number;
  };
  blockers: unknown[];
  boundaries: {
    actualPublicArtifactHashVerified: boolean;
    semanticOwnershipRecomputed: boolean;
    sourceOrderRecomputed: boolean;
    runtimePathInference: boolean;
    filenameSimilarity: boolean;
  };
};

export type HeroSkinPresentationItem = {
  skinId: number;
  sourceOrder: number;
  publicPath: string;
  sizeBytes: number;
  sha256: string;
};

const relation = skinRelationJson as unknown as SkinRelation;
const assetMap = skinAssetMapJson as unknown as SkinAssetMap;
const validation = skinAssetValidationJson as unknown as SkinAssetValidation;

function assertFrozenInputs() {
  if (
    relation.stage !== "skin-page-2" ||
    relation.substage !== "2-3" ||
    relation.status !== "ACCEPTED" ||
    relation.cardinality.skinToHero !== "EXACTLY_ONE" ||
    relation.cardinality.heroToSkin !== "ZERO_OR_MANY" ||
    relation.counts.bySkinId !== 540 ||
    relation.counts.byHeroId !== 267 ||
    relation.counts.edgeCount !== 540
  ) {
    throw new Error("Skin detail consumer requires the frozen Stage 2 relation.");
  }

  if (
    assetMap.stage !== "skin-page-3" ||
    assetMap.substage !== "3-5-0" ||
    assetMap.status !== "STAGE3_5_STATIC_WEB_ASSETS_MATERIALIZED" ||
    assetMap.counts.mappedSkinCount !== 540 ||
    assetMap.counts.materializedFileCount !== 540 ||
    assetMap.counts.missingFileCount !== 0 ||
    assetMap.counts.hashMismatchCount !== 0 ||
    assetMap.counts.pathCollisionCount !== 0 ||
    assetMap.counts.unexpectedFileCount !== 0 ||
    assetMap.records.length !== 540
  ) {
    throw new Error("Skin detail consumer requires the frozen Stage 3-5 static asset map.");
  }

  if (
    validation.stage !== "skin-page-3" ||
    validation.substage !== "3-5-0" ||
    validation.status !== "PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP" ||
    validation.finalReady !== true ||
    validation.counts.expectedSkinCount !== 540 ||
    validation.counts.acceptedSkinCount !== 540 ||
    validation.counts.missingFileCount !== 0 ||
    validation.counts.hashMismatchCount !== 0 ||
    validation.counts.pathCollisionCount !== 0 ||
    validation.counts.unexpectedFileCount !== 0 ||
    validation.blockers.length !== 0 ||
    validation.boundaries.actualPublicArtifactHashVerified !== true ||
    validation.boundaries.semanticOwnershipRecomputed !== false ||
    validation.boundaries.sourceOrderRecomputed !== false ||
    validation.boundaries.runtimePathInference !== false ||
    validation.boundaries.filenameSimilarity !== false
  ) {
    throw new Error("Skin detail consumer requires the final Stage 3-5 public-asset validation PASS.");
  }
}

assertFrozenInputs();

const assetBySkinId = new Map<number, SkinAssetRecord>();
for (const record of assetMap.records) {
  if (!Number.isSafeInteger(record.skinId) || record.skinId <= 0 || assetBySkinId.has(record.skinId)) {
    throw new Error(`Invalid or duplicate Skin asset record: ${record.skinId}`);
  }
  const relationRow = relation.bySkinId[String(record.skinId)];
  if (
    !relationRow ||
    relationRow.heroId !== record.heroId ||
    relationRow.sourceOrder !== record.sourceOrder ||
    record.publicPath !== `images/skins/${record.skinId}.png` ||
    !Number.isSafeInteger(record.sizeBytes) ||
    record.sizeBytes <= 0 ||
    !/^[0-9a-f]{64}$/i.test(record.sha256)
  ) {
    throw new Error(`Skin ${record.skinId} asset/relation parity failed.`);
  }
  assetBySkinId.set(record.skinId, record);
}

if (assetBySkinId.size !== relation.counts.edgeCount) {
  throw new Error("Skin detail consumer asset population does not match the frozen relation.");
}

const byHeroId = new Map<number, HeroSkinPresentationItem[]>();
let projectedEdgeCount = 0;
let zeroSkinHeroCount = 0;

for (const [heroKey, orderedSkinIds] of Object.entries(relation.byHeroId)) {
  const heroId = Number(heroKey);
  if (!Number.isSafeInteger(heroId) || heroId <= 0 || !Array.isArray(orderedSkinIds)) {
    throw new Error(`Invalid frozen Skin reverse-index Hero key: ${heroKey}`);
  }

  const items = orderedSkinIds.map((skinId, index) => {
    const record = assetBySkinId.get(Number(skinId));
    if (!record || record.heroId !== heroId || record.sourceOrder !== index + 1) {
      throw new Error(`Hero ${heroId} frozen Skin order parity failed at Skin ${skinId}.`);
    }
    return {
      skinId: record.skinId,
      sourceOrder: record.sourceOrder,
      publicPath: record.publicPath,
      sizeBytes: record.sizeBytes,
      sha256: record.sha256.toLowerCase(),
    };
  });

  if (items.length === 0) zeroSkinHeroCount += 1;
  projectedEdgeCount += items.length;
  byHeroId.set(heroId, items);
}

if (byHeroId.size !== 267 || projectedEdgeCount !== 540 || zeroSkinHeroCount !== 32) {
  throw new Error("Skin detail consumer reverse-index population changed.");
}

export function readHeroSkinPresentation(heroId: number) {
  const items = byHeroId.get(heroId);
  if (!items) return null;
  return {
    items,
    source: {
      relation: "SKIN_STAGE2_3_FROZEN",
      assets: "PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP",
      publicArtifactHashVerified: true,
      semanticOwnershipRecomputed: false,
      sourceOrderRecomputed: false,
    },
  };
}
