import armyIconJson from "../../data/generated/army-icon-manifest.v1.json";
import factionAssetJson from "../../data/generated/hero-fusion-faction-assets.v1.json";
import fusionExceptionJson from "../../data/generated/hero-fusion-power-exceptions.v1.json";
import fusionPowerJson from "../../data/generated/hero-fusion-power-presentation.v1.json";

export type StaticHeroFusionPowerIndexRecord = {
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

type BaselineSource = {
  freezeState: string;
  summary: {
    pendingCount: number;
    hardErrorCount: number;
  };
  records: Array<{
    heroId: number;
    targetFactionId: number;
    factionNameKr: string | null;
    factionNameCn: string | null;
  }>;
};

type ExceptionSource = {
  freezeState: string;
  summary: {
    pendingCount: number;
    hardErrorCount: number;
  };
  records: Array<{
    heroId: number;
    targetType: "FACTION" | "CLASS";
    targetIds: number[];
    targetNamesCn: string[];
    targetLabelsKr: string[];
  }>;
};

type FactionAssetSource = {
  summary: {
    resolvedCount: number;
    pendingCount: number;
    hardErrorCount: number;
  };
  records: Array<{
    factionId: number;
    webAssetPath: string;
    width: number;
    height: number;
    assetStatus: string;
  }>;
};

type ArmyIconSource = {
  publicRoot: string;
  records: Array<{
    armyId: number;
    fileName: string;
  }>;
};

const baseline = fusionPowerJson as BaselineSource;
const exceptions = fusionExceptionJson as ExceptionSource;
const factionAssets = factionAssetJson as FactionAssetSource;
const armyIcons = armyIconJson as ArmyIconSource;

const factionAssetById = new Map(factionAssets.records.map((row) => [row.factionId, row]));
const armyIconById = new Map(armyIcons.records.map((row) => [row.armyId, row]));

const baselineRecords: StaticHeroFusionPowerIndexRecord[] = baseline.records.map((row) => {
  const asset = factionAssetById.get(row.targetFactionId);
  if (!asset || asset.assetStatus !== "RESOLVED") {
    throw new Error(`Hero ${row.heroId} has no resolved faction mark asset.`);
  }

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

const exceptionRecords: StaticHeroFusionPowerIndexRecord[] = exceptions.records.map((row) => {
  if (row.targetType === "FACTION") {
    const factionId = row.targetIds[0];
    const asset = factionId === undefined ? undefined : factionAssetById.get(factionId);
    if (factionId === undefined || !asset || asset.assetStatus !== "RESOLVED") {
      throw new Error(`Hero ${row.heroId} has no resolved faction exception mark asset.`);
    }

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
    const asset = armyIconById.get(classId);
    if (!asset) {
      throw new Error(`Hero ${row.heroId} has no resolved class mark asset for ${classId}.`);
    }
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

const records = [...baselineRecords, ...exceptionRecords];

export function getStaticHeroFusionPowerIndex() {
  return {
    records,
    summary: {
      total: records.length,
      factionTargets: records.filter((row) => row.targetType === "FACTION").length,
      classTargets: records.filter((row) => row.targetType === "CLASS").length,
      factionAssets: factionAssets.summary.resolvedCount,
      classAssets: 3,
      pending: baseline.summary.pendingCount + exceptions.summary.pendingCount + factionAssets.summary.pendingCount,
      hardErrors: baseline.summary.hardErrorCount + exceptions.summary.hardErrorCount + factionAssets.summary.hardErrorCount,
    },
    source: {
      baselineFreezeState: baseline.freezeState,
      exceptionFreezeState: exceptions.freezeState,
      combinedFreezeState: "HERO_FUSION_POWER_EXPANDED_FROZEN",
    },
  };
}
