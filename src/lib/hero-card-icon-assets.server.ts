import heroCardIconJson from "../../data/generated/hero-card-icon-assets.v1.json";
import heroCardIconWebDeliveryJson from "../../data/generated/hero-card-icon-web-delivery.v1.json";
import heroCardIconSourcePackJson from "../../data/contracts/hero-card-icon-source-pack.v1.json";
import heroCardIconRuntimePolicyJson from "../../data/contracts/hero-card-icon-source-pack-h5-runtime-policy.v1.json";

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
  sourcePngFilePath: string;
  sourcePngSha256: string;
  sourcePngByteLength: number;
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
  sourceManifest: string;
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

type HeroCardIconSourcePackContract = {
  version: number;
  contract: string;
  status: string;
  owner: string;
  stage: string;
  authority: {
    semanticAndSourceIdentity: string;
    productionWebDelivery: string;
    externalByteTransport: string;
    externalInventoryMayCreateSemanticMappings: boolean;
  };
  authoritativePredecessor: {
    sourceCommitSha: string;
    sourceManifest: string;
    sourceFreezeState: string;
    webDeliveryManifest: string;
    webDeliveryFreezeState: string;
    sourcePublicPath: string;
  };
  storage: {
    kind: string;
    releaseTag: string;
    immutabilityPolicy: string;
  };
  coverage: {
    fileCount: number;
    totalSourceBytes: number;
    heroCount: number;
    missingCount: number;
    extraCount: number;
    duplicateCount: number;
  };
  productionPolicy: {
    sourcePackFetchedAtRuntime: boolean;
    productionWebDeliveryFormat: string;
    productionWebDeliveryCount: number;
    productionWebDeliveryBytes: number;
    runtimePathChange: boolean;
    webpReencodingInThisStage: boolean;
    detailCardArtworkChange: boolean;
  };
  semanticBoundary: {
    canonicalHeroChanges: boolean;
    heroRelationChanges: boolean;
    localizationChanges: boolean;
    nameJoinIntroduced: boolean;
    idArithmeticIntroduced: boolean;
    filenameSimilarityIntroduced: boolean;
    sourceMeaningReinterpreted: boolean;
  };
};

type HeroCardIconRuntimePolicy = {
  version: number;
  contract: string;
  status: string;
  owner: string;
  stage: string;
  completion: string;
  authority: {
    sourceIdentityManifest: string;
    sourceIdentityFreezeState: string;
    externalSourceTransportContract: string;
    productionWebDeliveryManifest: string;
    productionWebDeliveryFreezeState: string;
    currentRepositorySourceByteTransport: string;
    frozenManifestPathMetadataCreatesCurrentRetentionRequirement: boolean;
  };
  sourceTransportPolicy: {
    repositoryTrackedSourcePngRequired: boolean;
    sourcePackHydrationOnDemandAllowed: boolean;
    hydrator: string;
    sourcePackContract: string;
    sourcePackStorageKind: string;
    sourcePackIntegrityMode: string;
    expectedSourceFileCount: number;
    expectedSourceTotalBytes: number;
    sourcePngDeletionPerformedInThisStage: boolean;
    sourcePngDeletionDeferredToStage: string;
  };
  frozenManifestInterpretation: {
    sourceManifestExpectedFilePathRole: string;
    sourceManifestWebAssetPathRole: string;
    webManifestSourcePngFilePathRole: string;
    webManifestSourcePngPathRole: string;
    webManifestPngAuthoritativeSourceRetainedFieldRole: string;
    webManifestPngAuthoritativeSourceRetainedFieldIsCurrentRetentionAuthority: boolean;
    sourceRecordIdentityAndSha256RemainAuthoritative: boolean;
  };
  productionPolicy: {
    runtimeFetchesExternalSourcePack: boolean;
    runtimeUsesLosslessWebp: boolean;
    productionWebDeliveryFormat: string;
    productionWebDeliveryCount: number;
    productionWebDeliveryBytes: number;
    productionWebPathPattern: string;
    sourcePngRuntimeFallbackEnabled: boolean;
    remoteRuntimeHotlinkEnabled: boolean;
    runtimePathChange: boolean;
    webpReencodingInThisStage: boolean;
    detailCardArtworkChange: boolean;
  };
  semanticBoundary: {
    canonicalHeroChanges: boolean;
    heroRelationChanges: boolean;
    localizationChanges: boolean;
    nameJoinIntroduced: boolean;
    idArithmeticIntroduced: boolean;
    filenameSimilarityIntroduced: boolean;
    sourceMeaningReinterpreted: boolean;
    semanticRecomputationAllowed: boolean;
  };
  nextOwner: string;
  nextStage: string;
};

const source = heroCardIconJson as unknown as HeroCardIconAssetSource;
const delivery = heroCardIconWebDeliveryJson as unknown as HeroCardIconWebDeliverySource;
const sourcePack = heroCardIconSourcePackJson as unknown as HeroCardIconSourcePackContract;
const runtimePolicy = heroCardIconRuntimePolicyJson as unknown as HeroCardIconRuntimePolicy;
const deliveryByHeroId = new Map(delivery.records.map((row) => [row.heroId, row]));

function assertHeroCardIconContracts() {
  if (
    source.version !== 1 ||
    source.stage !== "hero-card-icon-assets" ||
    source.schemaId !== "hero-card-icon-assets/v1" ||
    source.status !== "PASS" ||
    source.completion !== "COMPLETE" ||
    source.freezeState !== "HERO_CARD_ICON_ASSETS_FROZEN"
  ) {
    throw new Error("Hero card icon frontend requires the frozen source identity manifest.");
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
    throw new Error("Hero card icon source identity population/integrity summary is not production-ready.");
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
    throw new Error("Hero card icon source identity boundary is invalid.");
  }

  if (
    sourcePack.version !== 1 ||
    sourcePack.contract !== "hero-card-icon-source-pack" ||
    sourcePack.status !== "PASS" ||
    sourcePack.stage !== "repository-size-reduction-H2" ||
    sourcePack.authority.semanticAndSourceIdentity !== "data/generated/hero-card-icon-assets.v1.json" ||
    sourcePack.authority.productionWebDelivery !== "data/generated/hero-card-icon-web-delivery.v1.json" ||
    sourcePack.authority.externalByteTransport !== "THIS_CONTRACT_PLUS_PINNED_SHA256" ||
    sourcePack.authority.externalInventoryMayCreateSemanticMappings !== false ||
    sourcePack.storage.kind !== "GITHUB_RELEASE_ASSET" ||
    sourcePack.storage.immutabilityPolicy !== "CONTENT_HASH_PINNED_FAIL_CLOSED" ||
    sourcePack.coverage.fileCount !== 267 ||
    sourcePack.coverage.heroCount !== 267 ||
    sourcePack.coverage.totalSourceBytes !== 8990485 ||
    sourcePack.coverage.missingCount !== 0 ||
    sourcePack.coverage.extraCount !== 0 ||
    sourcePack.coverage.duplicateCount !== 0 ||
    sourcePack.productionPolicy.sourcePackFetchedAtRuntime !== false ||
    sourcePack.productionPolicy.productionWebDeliveryFormat !== "LOSSLESS_WEBP" ||
    sourcePack.productionPolicy.productionWebDeliveryCount !== 267 ||
    sourcePack.productionPolicy.productionWebDeliveryBytes !== 5772910 ||
    sourcePack.productionPolicy.runtimePathChange !== false ||
    sourcePack.productionPolicy.webpReencodingInThisStage !== false ||
    sourcePack.productionPolicy.detailCardArtworkChange !== false ||
    sourcePack.semanticBoundary.canonicalHeroChanges !== false ||
    sourcePack.semanticBoundary.heroRelationChanges !== false ||
    sourcePack.semanticBoundary.localizationChanges !== false ||
    sourcePack.semanticBoundary.nameJoinIntroduced !== false ||
    sourcePack.semanticBoundary.idArithmeticIntroduced !== false ||
    sourcePack.semanticBoundary.filenameSimilarityIntroduced !== false ||
    sourcePack.semanticBoundary.sourceMeaningReinterpreted !== false
  ) {
    throw new Error("Hero card icon external exact-byte source-pack contract is invalid.");
  }

  if (
    runtimePolicy.version !== 1 ||
    runtimePolicy.contract !== "hero-card-icon-source-pack-runtime-policy" ||
    runtimePolicy.status !== "PASS" ||
    runtimePolicy.owner !== "hero-card-icon-source-pack-assets" ||
    runtimePolicy.stage !== "repository-size-reduction-H5" ||
    runtimePolicy.completion !== "H5_POLICY_COMPLETE" ||
    runtimePolicy.authority.sourceIdentityManifest !== sourcePack.authority.semanticAndSourceIdentity ||
    runtimePolicy.authority.sourceIdentityFreezeState !== source.freezeState ||
    runtimePolicy.authority.externalSourceTransportContract !== "data/contracts/hero-card-icon-source-pack.v1.json" ||
    runtimePolicy.authority.productionWebDeliveryManifest !== sourcePack.authority.productionWebDelivery ||
    runtimePolicy.authority.productionWebDeliveryFreezeState !== "HERO_CARD_ICON_WEB_DELIVERY_FROZEN" ||
    runtimePolicy.authority.currentRepositorySourceByteTransport !== "EXTERNAL_EXACT_BYTE_SOURCE_PACK" ||
    runtimePolicy.authority.frozenManifestPathMetadataCreatesCurrentRetentionRequirement !== false ||
    runtimePolicy.sourceTransportPolicy.repositoryTrackedSourcePngRequired !== false ||
    runtimePolicy.sourceTransportPolicy.sourcePackHydrationOnDemandAllowed !== true ||
    runtimePolicy.sourceTransportPolicy.hydrator !== "scripts/hydrate-hero-card-icon-source-pack-v1.mjs" ||
    runtimePolicy.sourceTransportPolicy.sourcePackContract !== "data/contracts/hero-card-icon-source-pack.v1.json" ||
    runtimePolicy.sourceTransportPolicy.sourcePackStorageKind !== sourcePack.storage.kind ||
    runtimePolicy.sourceTransportPolicy.sourcePackIntegrityMode !== sourcePack.storage.immutabilityPolicy ||
    runtimePolicy.sourceTransportPolicy.expectedSourceFileCount !== sourcePack.coverage.fileCount ||
    runtimePolicy.sourceTransportPolicy.expectedSourceTotalBytes !== sourcePack.coverage.totalSourceBytes ||
    runtimePolicy.sourceTransportPolicy.sourcePngDeletionPerformedInThisStage !== false ||
    runtimePolicy.sourceTransportPolicy.sourcePngDeletionDeferredToStage !== "H6" ||
    runtimePolicy.productionPolicy.runtimeFetchesExternalSourcePack !== false ||
    runtimePolicy.productionPolicy.runtimeUsesLosslessWebp !== true ||
    runtimePolicy.productionPolicy.productionWebDeliveryFormat !== sourcePack.productionPolicy.productionWebDeliveryFormat ||
    runtimePolicy.productionPolicy.productionWebDeliveryCount !== sourcePack.productionPolicy.productionWebDeliveryCount ||
    runtimePolicy.productionPolicy.productionWebDeliveryBytes !== sourcePack.productionPolicy.productionWebDeliveryBytes ||
    runtimePolicy.productionPolicy.productionWebPathPattern !== "/images/heroes/card-icons-webp/{id}.webp" ||
    runtimePolicy.productionPolicy.sourcePngRuntimeFallbackEnabled !== false ||
    runtimePolicy.productionPolicy.remoteRuntimeHotlinkEnabled !== false ||
    runtimePolicy.productionPolicy.runtimePathChange !== false ||
    runtimePolicy.productionPolicy.webpReencodingInThisStage !== false ||
    runtimePolicy.productionPolicy.detailCardArtworkChange !== false ||
    runtimePolicy.semanticBoundary.canonicalHeroChanges !== false ||
    runtimePolicy.semanticBoundary.heroRelationChanges !== false ||
    runtimePolicy.semanticBoundary.localizationChanges !== false ||
    runtimePolicy.semanticBoundary.nameJoinIntroduced !== false ||
    runtimePolicy.semanticBoundary.idArithmeticIntroduced !== false ||
    runtimePolicy.semanticBoundary.filenameSimilarityIntroduced !== false ||
    runtimePolicy.semanticBoundary.sourceMeaningReinterpreted !== false ||
    runtimePolicy.semanticBoundary.semanticRecomputationAllowed !== false ||
    runtimePolicy.nextStage !== "H6-delete-tracked-source-png"
  ) {
    throw new Error("Hero card icon H5 source transport/runtime policy is invalid.");
  }

  if (
    runtimePolicy.frozenManifestInterpretation.sourceManifestExpectedFilePathRole !== "FROZEN_SOURCE_IDENTITY_LOCATOR" ||
    runtimePolicy.frozenManifestInterpretation.sourceManifestWebAssetPathRole !== "FROZEN_SOURCE_PNG_LOCATOR_NOT_RUNTIME_DELIVERY" ||
    runtimePolicy.frozenManifestInterpretation.webManifestSourcePngFilePathRole !== "FROZEN_WEBP_CONVERSION_INPUT_LOCATOR" ||
    runtimePolicy.frozenManifestInterpretation.webManifestSourcePngPathRole !== "FROZEN_SOURCE_PNG_LOCATOR_NOT_RUNTIME_FALLBACK" ||
    runtimePolicy.frozenManifestInterpretation.webManifestPngAuthoritativeSourceRetainedFieldRole !== "PRE_H5_ADMISSION_RETENTION_STATE" ||
    runtimePolicy.frozenManifestInterpretation.webManifestPngAuthoritativeSourceRetainedFieldIsCurrentRetentionAuthority !== false ||
    runtimePolicy.frozenManifestInterpretation.sourceRecordIdentityAndSha256RemainAuthoritative !== true
  ) {
    throw new Error("Hero card icon H5 frozen-manifest interpretation is invalid.");
  }

  if (
    delivery.version !== 1 ||
    delivery.stage !== "hero-card-icon-web-delivery" ||
    delivery.schemaId !== "hero-card-icon-web-delivery/v1" ||
    delivery.status !== "PASS" ||
    delivery.completion !== "COMPLETE" ||
    delivery.freezeState !== runtimePolicy.authority.productionWebDeliveryFreezeState ||
    delivery.sourceManifest !== runtimePolicy.authority.sourceIdentityManifest ||
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
    delivery.summary.sourcePngTotalBytes !== 8990485 ||
    delivery.summary.webDeliveryTotalBytes !== 5772910 ||
    delivery.records.length !== 267 ||
    delivery.summary.webDeliveryTotalBytes >= delivery.summary.sourcePngTotalBytes
  ) {
    throw new Error("Hero card icon frozen lossless WebP delivery manifest is not production-ready.");
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
      deliveryRow.sourcePngFilePath !== row.expectedFilePath ||
      deliveryRow.sourcePngSha256 !== row.sha256 ||
      deliveryRow.sourcePngByteLength !== row.byteLength ||
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
      throw new Error(`Hero ${row.heroId} frozen card icon source identity row is invalid.`);
    }
  }
}

assertHeroCardIconContracts();

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
      sourceByteTransport: runtimePolicy.authority.currentRepositorySourceByteTransport,
      repositoryTrackedSourcePngRequired: runtimePolicy.sourceTransportPolicy.repositoryTrackedSourcePngRequired,
      sourcePackHydrationOnDemandAllowed: runtimePolicy.sourceTransportPolicy.sourcePackHydrationOnDemandAllowed,
      sourcePackReleaseTag: sourcePack.storage.releaseTag,
      remoteRuntimeHotlink: runtimePolicy.productionPolicy.remoteRuntimeHotlinkEnabled,
      webDeliveryFreezeState: delivery.freezeState,
      webDeliveryFormat: runtimePolicy.productionPolicy.productionWebDeliveryFormat,
      webDeliverySavingsPercent: delivery.summary.webDeliverySavingsPercent,
    },
  };
}
