import factionAssetJson from "../../data/generated/hero-fusion-faction-assets.v1.json";
import fusionPowerJson from "../../data/generated/hero-fusion-power-presentation.v1.json";

type FusionPowerRecord = {
  heroId: number;
  heroNameCn: string | null;
  heroNameKr: string | null;
  skillId: number;
  skillInfoRecordIndex: number;
  skillType: number;
  skillTypeParam1: number;
  skillTypeParam2: number;
  targetFactionId: number;
  factionNameCn: string | null;
  factionNameKr: string | null;
  iconSourcePath: string;
  webAssetPath: string;
  localAssetPath: string;
  relationStatus: string;
};

type FusionPowerSource = {
  version: number;
  stage: string;
  schemaId: string;
  status: string;
  completion: string;
  freezeState: string;
  policy: {
    displayTypeGate: string;
    requiredSkillType: number;
    requiredSkillTypeParam1: number;
    targetFactionField: string;
    descriptionParsing: boolean;
    skillNameInference: boolean;
    skillIconNameInference: boolean;
    heroNameJoin: boolean;
    idArithmetic: boolean;
    semanticStageReopened: boolean;
    productionRawConfigFallback: boolean;
  };
  summary: {
    canonicalHeroCount: number;
    fusionPowerHeroCount: number;
    uniqueHeroCount: number;
    uniqueSkillCount: number;
    uniqueTargetFactionCount: number;
    factionAssetCount: number;
    pendingCount: number;
    hardErrorCount: number;
  };
  records: FusionPowerRecord[];
};

type FactionAssetRecord = {
  factionId: number;
  nameCn: string | null;
  nameKr: string | null;
  iconSourcePath: string;
  sourcePackageNumber: number;
  sourceBundleName: string;
  containerPath: string;
  spritePathId: number;
  width: number;
  height: number;
  webAssetPath: string;
  localAssetPath: string;
  sha256: string;
  byteLength: number;
  assetStatus: string;
};

type FactionAssetSource = {
  version: number;
  stage: string;
  schemaId: string;
  status: string;
  completion: string;
  freezeState: string;
  sourceFreezeState: string;
  sourcePolicy: {
    exactConfigDataFactionIconPath: boolean;
    exactBundleContainerPath: boolean;
    remoteRuntimeHotlink: boolean;
    nameJoin: boolean;
    idArithmetic: boolean;
    semanticStageReopened: boolean;
  };
  summary: {
    targetFactionCount: number;
    resolvedCount: number;
    fileCount: number;
    pendingCount: number;
    hardErrorCount: number;
  };
  records: FactionAssetRecord[];
};

const fusion = fusionPowerJson as unknown as FusionPowerSource;
const assets = factionAssetJson as unknown as FactionAssetSource;
const assetByFactionId = new Map(assets.records.map((row) => [row.factionId, row]));

function assertFrozenFusionPowerPresentation() {
  if (
    fusion.version !== 1 ||
    fusion.stage !== "hero-fusion-power-presentation" ||
    fusion.schemaId !== "hero-fusion-power-presentation/v1" ||
    fusion.status !== "PASS" ||
    fusion.completion !== "COMPLETE" ||
    fusion.freezeState !== "HERO_FUSION_POWER_PRESENTATION_FROZEN" ||
    fusion.summary.canonicalHeroCount !== 267 ||
    fusion.summary.fusionPowerHeroCount !== 35 ||
    fusion.summary.uniqueHeroCount !== 35 ||
    fusion.summary.uniqueSkillCount !== 35 ||
    fusion.summary.uniqueTargetFactionCount !== 12 ||
    fusion.summary.factionAssetCount !== 12 ||
    fusion.summary.pendingCount !== 0 ||
    fusion.summary.hardErrorCount !== 0 ||
    fusion.records.length !== 35
  ) {
    throw new Error("Hero fusion-power presentation projection is not frozen/complete.");
  }

  if (
    fusion.policy.displayTypeGate !== "超绝强化" ||
    fusion.policy.requiredSkillType !== 14 ||
    fusion.policy.requiredSkillTypeParam1 !== 2 ||
    fusion.policy.targetFactionField !== "SkillTypeParam2" ||
    fusion.policy.descriptionParsing !== false ||
    fusion.policy.skillNameInference !== false ||
    fusion.policy.skillIconNameInference !== false ||
    fusion.policy.heroNameJoin !== false ||
    fusion.policy.idArithmetic !== false ||
    fusion.policy.semanticStageReopened !== false ||
    fusion.policy.productionRawConfigFallback !== false
  ) {
    throw new Error("Hero fusion-power production relation policy is invalid.");
  }

  if (
    assets.version !== 1 ||
    assets.stage !== "hero-fusion-faction-assets" ||
    assets.schemaId !== "hero-fusion-faction-assets/v1" ||
    assets.status !== "PASS" ||
    assets.completion !== "COMPLETE" ||
    assets.freezeState !== "HERO_FUSION_FACTION_ASSETS_FROZEN" ||
    assets.sourceFreezeState !== fusion.freezeState ||
    assets.summary.targetFactionCount !== 12 ||
    assets.summary.resolvedCount !== 12 ||
    assets.summary.fileCount !== 12 ||
    assets.summary.pendingCount !== 0 ||
    assets.summary.hardErrorCount !== 0 ||
    assets.records.length !== 12 ||
    assets.sourcePolicy.exactConfigDataFactionIconPath !== true ||
    assets.sourcePolicy.exactBundleContainerPath !== true ||
    assets.sourcePolicy.remoteRuntimeHotlink !== false ||
    assets.sourcePolicy.nameJoin !== false ||
    assets.sourcePolicy.idArithmetic !== false ||
    assets.sourcePolicy.semanticStageReopened !== false
  ) {
    throw new Error("Hero fusion faction-mark asset manifest is not production-ready.");
  }

  const factionIds = new Set<number>();
  for (const asset of assets.records) {
    if (!Number.isInteger(asset.factionId) || asset.factionId < 1 || asset.factionId > 12 || factionIds.has(asset.factionId)) {
      throw new Error(`Invalid/duplicate faction asset ID ${asset.factionId}.`);
    }
    factionIds.add(asset.factionId);
    if (
      asset.assetStatus !== "RESOLVED" ||
      asset.webAssetPath !== `/images/factions/${asset.factionId}.png` ||
      asset.localAssetPath !== `public/images/factions/${asset.factionId}.png` ||
      asset.width <= 0 ||
      asset.height <= 0 ||
      asset.byteLength <= 0 ||
      !asset.iconSourcePath.startsWith("UI/Icon/KeyWord_ABS/Icon_Group_")
    ) {
      throw new Error(`Faction ${asset.factionId} mark asset row is invalid.`);
    }
  }

  const heroIds = new Set<number>();
  for (const row of fusion.records) {
    if (!Number.isSafeInteger(row.heroId) || row.heroId <= 0 || heroIds.has(row.heroId)) {
      throw new Error(`Invalid/duplicate fusion-power Hero ID ${row.heroId}.`);
    }
    heroIds.add(row.heroId);
    const asset = assetByFactionId.get(row.targetFactionId);
    if (
      row.relationStatus !== "RESOLVED" ||
      row.skillType !== 14 ||
      row.skillTypeParam1 !== 2 ||
      row.skillTypeParam2 !== row.targetFactionId ||
      !asset ||
      asset.iconSourcePath !== row.iconSourcePath ||
      asset.webAssetPath !== row.webAssetPath
    ) {
      throw new Error(`Hero ${row.heroId} fusion-power row does not match its exact faction mark asset.`);
    }
  }
}

assertFrozenFusionPowerPresentation();

export type HeroFusionPowerIndexRecord = {
  heroId: number;
  targetFactionId: number;
  factionNameCn: string | null;
  factionNameKr: string | null;
  webAssetPath: string;
  width: number;
  height: number;
  assetStatus: "RESOLVED";
};

export function readHeroFusionPowerIndex() {
  return {
    records: fusion.records.map<HeroFusionPowerIndexRecord>((row) => {
      const asset = assetByFactionId.get(row.targetFactionId)!;
      return {
        heroId: row.heroId,
        targetFactionId: row.targetFactionId,
        factionNameCn: row.factionNameCn,
        factionNameKr: row.factionNameKr,
        webAssetPath: asset.webAssetPath,
        width: asset.width,
        height: asset.height,
        assetStatus: "RESOLVED",
      };
    }),
    summary: {
      total: fusion.summary.fusionPowerHeroCount,
      factionAssets: assets.summary.resolvedCount,
      pending: fusion.summary.pendingCount + assets.summary.pendingCount,
      hardErrors: fusion.summary.hardErrorCount + assets.summary.hardErrorCount,
    },
    source: {
      fusionFreezeState: fusion.freezeState,
      factionAssetFreezeState: assets.freezeState,
      targetFactionField: fusion.policy.targetFactionField,
      semanticStageReopened: fusion.policy.semanticStageReopened,
      remoteRuntimeHotlink: assets.sourcePolicy.remoteRuntimeHotlink,
    },
  };
}
