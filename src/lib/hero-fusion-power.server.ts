import armyIconJson from "../../data/generated/army-icon-manifest.v1.json";
import factionAssetJson from "../../data/generated/hero-fusion-faction-assets.v1.json";
import fusionPowerJson from "../../data/generated/hero-fusion-power-presentation.v1.json";
import fusionExceptionJson from "../../data/generated/hero-fusion-power-exceptions.v1.json";

type BaselineFusionPowerRecord = {
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

type BaselineFusionPowerSource = {
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
  records: BaselineFusionPowerRecord[];
};

type FusionPowerExceptionRecord = {
  heroId: number;
  heroNameKr: string;
  heroNameCn: string;
  targetType: "FACTION" | "CLASS";
  targetIds: number[];
  targetNamesCn: string[];
  targetLabelsKr: string[];
  triggerKinds: string[];
  sourceMechanicCn: string;
  evidenceStatus: "VERIFIED";
};

type FusionPowerExceptionSource = {
  version: number;
  stage: string;
  schemaId: string;
  status: string;
  completion: string;
  freezeState: string;
  predecessorFreezeState: string;
  policy: {
    baselinePreserved: boolean;
    triggerAgnostic: boolean;
    allowedTargetTypes: string[];
    groupWideEffectRequired: boolean;
    manualVerifiedExceptionOnly: boolean;
    heroNameJoin: boolean;
    idArithmetic: boolean;
    productionRawConfigFallback: boolean;
  };
  summary: {
    canonicalHeroCount: number;
    baselineHeroCount: number;
    exceptionHeroCount: number;
    expandedHeroCount: number;
    factionTargetExceptionCount: number;
    classTargetExceptionCount: number;
    expandedFactionTargetHeroCount: number;
    expandedClassTargetHeroCount: number;
    pendingCount: number;
    hardErrorCount: number;
  };
  records: FusionPowerExceptionRecord[];
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

type ArmyIconRecord = {
  armyType: string;
  armyId: number;
  label: string;
  iconNoBackLocator: string;
  fileName: string;
};

type ArmyIconSource = {
  version: number;
  source: string;
  sourceField: string;
  assetRoot: string;
  publicRoot: string;
  assetsReady: boolean;
  records: ArmyIconRecord[];
  importedAssetCount: number;
};

const baseline = fusionPowerJson as unknown as BaselineFusionPowerSource;
const exceptions = fusionExceptionJson as unknown as FusionPowerExceptionSource;
const factionAssets = factionAssetJson as unknown as FactionAssetSource;
const armyIcons = armyIconJson as unknown as ArmyIconSource;

const factionAssetById = new Map(factionAssets.records.map((row) => [row.factionId, row]));
const armyIconById = new Map(armyIcons.records.map((row) => [row.armyId, row]));

function assertFrozenFusionPowerPresentation() {
  if (
    baseline.version !== 1 ||
    baseline.stage !== "hero-fusion-power-presentation" ||
    baseline.schemaId !== "hero-fusion-power-presentation/v1" ||
    baseline.status !== "PASS" ||
    baseline.completion !== "COMPLETE" ||
    baseline.freezeState !== "HERO_FUSION_POWER_PRESENTATION_FROZEN" ||
    baseline.summary.canonicalHeroCount !== 267 ||
    baseline.summary.fusionPowerHeroCount !== 35 ||
    baseline.summary.uniqueHeroCount !== 35 ||
    baseline.summary.uniqueSkillCount !== 35 ||
    baseline.summary.uniqueTargetFactionCount !== 12 ||
    baseline.summary.factionAssetCount !== 12 ||
    baseline.summary.pendingCount !== 0 ||
    baseline.summary.hardErrorCount !== 0 ||
    baseline.records.length !== 35
  ) {
    throw new Error("Hero fusion-power baseline projection is not frozen/complete.");
  }

  if (
    baseline.policy.displayTypeGate !== "超绝强化" ||
    baseline.policy.requiredSkillType !== 14 ||
    baseline.policy.requiredSkillTypeParam1 !== 2 ||
    baseline.policy.targetFactionField !== "SkillTypeParam2" ||
    baseline.policy.descriptionParsing !== false ||
    baseline.policy.skillNameInference !== false ||
    baseline.policy.skillIconNameInference !== false ||
    baseline.policy.heroNameJoin !== false ||
    baseline.policy.idArithmetic !== false ||
    baseline.policy.semanticStageReopened !== false ||
    baseline.policy.productionRawConfigFallback !== false
  ) {
    throw new Error("Hero fusion-power baseline relation policy is invalid.");
  }

  if (
    factionAssets.version !== 1 ||
    factionAssets.stage !== "hero-fusion-faction-assets" ||
    factionAssets.schemaId !== "hero-fusion-faction-assets/v1" ||
    factionAssets.status !== "PASS" ||
    factionAssets.completion !== "COMPLETE" ||
    factionAssets.freezeState !== "HERO_FUSION_FACTION_ASSETS_FROZEN" ||
    factionAssets.sourceFreezeState !== baseline.freezeState ||
    factionAssets.summary.targetFactionCount !== 12 ||
    factionAssets.summary.resolvedCount !== 12 ||
    factionAssets.summary.fileCount !== 12 ||
    factionAssets.summary.pendingCount !== 0 ||
    factionAssets.summary.hardErrorCount !== 0 ||
    factionAssets.records.length !== 12 ||
    factionAssets.sourcePolicy.exactConfigDataFactionIconPath !== true ||
    factionAssets.sourcePolicy.exactBundleContainerPath !== true ||
    factionAssets.sourcePolicy.remoteRuntimeHotlink !== false ||
    factionAssets.sourcePolicy.nameJoin !== false ||
    factionAssets.sourcePolicy.idArithmetic !== false ||
    factionAssets.sourcePolicy.semanticStageReopened !== false
  ) {
    throw new Error("Hero fusion faction-mark asset manifest is not production-ready.");
  }

  if (
    armyIcons.version !== 1 ||
    armyIcons.source !== "data/configdata/ConfigDataArmyInfo.json" ||
    armyIcons.sourceField !== "Icon_NoBack" ||
    armyIcons.publicRoot !== "images/army" ||
    armyIcons.assetsReady !== true ||
    armyIcons.importedAssetCount !== 10 ||
    armyIcons.records.length !== 10
  ) {
    throw new Error("Official class icon manifest is not production-ready.");
  }

  const factionIds = new Set<number>();
  for (const asset of factionAssets.records) {
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

  const baselineHeroIds = new Set<number>();
  for (const row of baseline.records) {
    if (!Number.isSafeInteger(row.heroId) || row.heroId <= 0 || baselineHeroIds.has(row.heroId)) {
      throw new Error(`Invalid/duplicate baseline fusion-power Hero ID ${row.heroId}.`);
    }
    baselineHeroIds.add(row.heroId);
    const asset = factionAssetById.get(row.targetFactionId);
    if (
      row.relationStatus !== "RESOLVED" ||
      row.skillType !== 14 ||
      row.skillTypeParam1 !== 2 ||
      row.skillTypeParam2 !== row.targetFactionId ||
      !asset ||
      asset.iconSourcePath !== row.iconSourcePath ||
      asset.webAssetPath !== row.webAssetPath
    ) {
      throw new Error(`Hero ${row.heroId} baseline fusion-power row does not match its exact faction mark asset.`);
    }
  }

  if (
    exceptions.version !== 1 ||
    exceptions.stage !== "hero-fusion-power-exceptions" ||
    exceptions.schemaId !== "hero-fusion-power-exceptions/v1" ||
    exceptions.status !== "PASS" ||
    exceptions.completion !== "COMPLETE" ||
    exceptions.freezeState !== "HERO_FUSION_POWER_EXCEPTION_EXPANSION_FROZEN" ||
    exceptions.predecessorFreezeState !== baseline.freezeState ||
    exceptions.policy.baselinePreserved !== true ||
    exceptions.policy.triggerAgnostic !== true ||
    exceptions.policy.groupWideEffectRequired !== true ||
    exceptions.policy.manualVerifiedExceptionOnly !== true ||
    exceptions.policy.heroNameJoin !== false ||
    exceptions.policy.idArithmetic !== false ||
    exceptions.policy.productionRawConfigFallback !== false ||
    exceptions.summary.canonicalHeroCount !== 267 ||
    exceptions.summary.baselineHeroCount !== 35 ||
    exceptions.summary.exceptionHeroCount !== 8 ||
    exceptions.summary.expandedHeroCount !== 43 ||
    exceptions.summary.factionTargetExceptionCount !== 6 ||
    exceptions.summary.classTargetExceptionCount !== 2 ||
    exceptions.summary.expandedFactionTargetHeroCount !== 41 ||
    exceptions.summary.expandedClassTargetHeroCount !== 2 ||
    exceptions.summary.pendingCount !== 0 ||
    exceptions.summary.hardErrorCount !== 0 ||
    exceptions.records.length !== 8
  ) {
    throw new Error("Hero fusion-power exception expansion is not frozen/complete.");
  }

  const exceptionHeroIds = new Set<number>();
  for (const row of exceptions.records) {
    if (!Number.isSafeInteger(row.heroId) || row.heroId <= 0 || exceptionHeroIds.has(row.heroId) || baselineHeroIds.has(row.heroId)) {
      throw new Error(`Invalid/duplicate expanded fusion-power Hero ID ${row.heroId}.`);
    }
    exceptionHeroIds.add(row.heroId);
    if (row.evidenceStatus !== "VERIFIED" || row.targetIds.length < 1 || row.targetIds.length !== row.targetLabelsKr.length) {
      throw new Error(`Hero ${row.heroId} fusion-power exception evidence/target shape is invalid.`);
    }
    if (row.targetType === "FACTION") {
      if (row.targetIds.length !== 1 || !factionAssetById.has(row.targetIds[0])) {
        throw new Error(`Hero ${row.heroId} faction fusion-power exception target is invalid.`);
      }
    } else if (row.targetType === "CLASS") {
      for (const classId of row.targetIds) {
        if (!armyIconById.has(classId)) {
          throw new Error(`Hero ${row.heroId} class fusion-power target ${classId} has no official class icon.`);
        }
      }
    } else {
      throw new Error(`Hero ${row.heroId} has unsupported fusion target type.`);
    }
  }

  const heavenDefier = exceptions.records.find((row) => row.heroId === 99264);
  if (heavenDefier?.targetType !== "CLASS" || heavenDefier.targetIds.join(",") !== "9") {
    throw new Error("HeavenDefier must target the Monster class icon contract.");
  }
  const lightbringer = exceptions.records.find((row) => row.heroId === 99184);
  if (lightbringer?.targetType !== "CLASS" || lightbringer.targetIds.join(",") !== "2,8") {
    throw new Error("Lightbringer must target the Infantry+Holy composite class icon contract.");
  }
}

assertFrozenFusionPowerPresentation();

export type HeroFusionPowerIndexRecord = {
  heroId: number;
  targetType: "FACTION" | "CLASS";
  targetIds: number[];
  targetLabel: string;
  markKind: "SINGLE" | "COMPOSITE";
  markAssets: Array<{
    webAssetPath: string;
    width?: number;
    height?: number;
  }>;
  assetStatus: "RESOLVED";
};

const baselineRecords: HeroFusionPowerIndexRecord[] = baseline.records.map((row) => {
  const asset = factionAssetById.get(row.targetFactionId)!;
  return {
    heroId: row.heroId,
    targetType: "FACTION",
    targetIds: [row.targetFactionId],
    targetLabel: row.factionNameKr ?? row.factionNameCn ?? `진영 ${row.targetFactionId}`,
    markKind: "SINGLE",
    markAssets: [{ webAssetPath: asset.webAssetPath, width: asset.width, height: asset.height }],
    assetStatus: "RESOLVED",
  };
});

const exceptionRecords: HeroFusionPowerIndexRecord[] = exceptions.records.map((row) => {
  if (row.targetType === "FACTION") {
    const factionId = row.targetIds[0];
    const asset = factionAssetById.get(factionId)!;
    return {
      heroId: row.heroId,
      targetType: "FACTION",
      targetIds: [factionId],
      targetLabel: row.targetLabelsKr[0] ?? row.targetNamesCn[0] ?? `진영 ${factionId}`,
      markKind: "SINGLE",
      markAssets: [{ webAssetPath: asset.webAssetPath, width: asset.width, height: asset.height }],
      assetStatus: "RESOLVED",
    };
  }

  const classAssets = row.targetIds.map((classId) => {
    const asset = armyIconById.get(classId)!;
    return { webAssetPath: `/${armyIcons.publicRoot}/${asset.fileName}` };
  });
  return {
    heroId: row.heroId,
    targetType: "CLASS",
    targetIds: [...row.targetIds],
    targetLabel: row.targetLabelsKr.join(" · "),
    markKind: classAssets.length === 1 ? "SINGLE" : "COMPOSITE",
    markAssets: classAssets,
    assetStatus: "RESOLVED",
  };
});

const expandedRecords = [...baselineRecords, ...exceptionRecords];

export function readHeroFusionPowerIndex() {
  return {
    records: expandedRecords,
    summary: {
      total: 43,
      factionTargets: 41,
      classTargets: 2,
      factionAssets: factionAssets.summary.resolvedCount,
      classAssets: 3,
      pending: baseline.summary.pendingCount + exceptions.summary.pendingCount + factionAssets.summary.pendingCount,
      hardErrors: baseline.summary.hardErrorCount + exceptions.summary.hardErrorCount + factionAssets.summary.hardErrorCount,
    },
    source: {
      baselineFreezeState: baseline.freezeState,
      exceptionFreezeState: exceptions.freezeState,
      combinedFreezeState: "HERO_FUSION_POWER_EXPANDED_FROZEN",
      targetFactionField: baseline.policy.targetFactionField,
      heroFoundationSemanticStageReopened: false,
      fusionSemanticExpanded: true,
      remoteRuntimeHotlink: factionAssets.sourcePolicy.remoteRuntimeHotlink,
    },
  };
}
