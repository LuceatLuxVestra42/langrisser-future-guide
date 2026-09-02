import trainingTechStage1Json from "../../data/generated/soldier-training-tech-classification-stage1-census.v1.json";
import commonStatJson from "../../data/generated/soldier-training-tech-common-stat-effect-extraction.v1.json";
import commonPassiveJson from "../../data/generated/soldier-training-tech-common-passive-effect-extraction.v1.json";
import trainingMaterialItemInfoJson from "../../data/generated/soldier-training-material-iteminfo.v1.json";

export type TrainingStatEffect = {
  statKey: "HP" | "ATK" | "DEF" | "MDEF";
  unit: "FLAT" | "PERCENT";
  value: number;
};

export type TrainingTechLevel = {
  level: number;
  statEffects: TrainingStatEffect[] | null;
  passiveDescription: string | null;
};

export type SoldierTrainingTech = {
  techId: number;
  nameCn: string;
  resource: string | null;
  armyIds: number[];
  kind: "COMMON_STAT" | "COMMON_PASSIVE";
  maxLevel: number;
  levels: TrainingTechLevel[];
};

export type SoldierTrainingMaterial = {
  itemId: number;
  nameCn: string;
  imageUrl: string;
};

export type SoldierTrainingPageData = {
  status: "PASS";
  coverage: {
    commonStat: number;
    commonPassive: number;
    total: number;
  };
  materials: SoldierTrainingMaterial[];
  techs: SoldierTrainingTech[];
};

type Stage1Source = {
  status: string;
  records: Array<{
    id: number;
    explicitLevelReferences: number[];
    raw: {
      ID: number;
      Name: string;
      Resource?: string;
      ArmyIDRelated?: number[];
      TechLevelupInfoList: number[];
    };
  }>;
};

type CommonStatSource = {
  status: string;
  completion: string;
  freezeState: string;
  coverage: { targetTechCount: number };
  effectSemantics: {
    effectShapeCatalog: Array<{
      effects: Array<{
        statKey: "HP" | "ATK" | "DEF" | "MDEF";
        unit: "FLAT" | "PERCENT";
      }>;
      techIds: number[];
    }>;
  };
  valueSequenceCatalog: Array<{
    techIds: number[];
    levelCount: number;
    values: number[][];
  }>;
};

type CommonPassiveSource = {
  status: string;
  completion: string;
  freezeState: string;
  coverage: { targetTechCount: number };
  parameterSequenceCatalog: Array<{
    sequenceId: string;
    techIds: number[];
    parameterCount: number;
    tokenFormats: string[];
    levelValueRows: number[][];
  }>;
  records: Array<{
    techId: number;
    templateRichTextRaw: string;
    parameterSequenceId: string;
  }>;
};

type TrainingMaterialSource = {
  status: string;
  summary: { targetItemIdCount: number };
  items: Array<{
    itemId: number;
    name: string;
  }>;
};

const stage1 = trainingTechStage1Json as unknown as Stage1Source;
const commonStat = commonStatJson as unknown as CommonStatSource;
const commonPassive = commonPassiveJson as unknown as CommonPassiveSource;
const trainingMaterials = trainingMaterialItemInfoJson as unknown as TrainingMaterialSource;

function requireFrozenSources() {
  if (stage1.status !== "PASS") throw new Error("TrainingTech Stage 1 source is not PASS.");
  if (
    commonStat.status !== "PASS" ||
    commonStat.completion !== "COMPLETE" ||
    commonStat.freezeState !== "TRAINING_TECH_COMMON_STAT_EFFECT_EXTRACTION_FROZEN" ||
    commonStat.coverage.targetTechCount !== 84
  ) {
    throw new Error("COMMON_STAT TrainingTech extraction is not frozen as expected.");
  }
  if (
    commonPassive.status !== "PASS" ||
    commonPassive.completion !== "COMPLETE" ||
    commonPassive.freezeState !== "TRAINING_TECH_COMMON_PASSIVE_EFFECT_EXTRACTION_FROZEN" ||
    commonPassive.coverage.targetTechCount !== 46
  ) {
    throw new Error("COMMON_PASSIVE TrainingTech extraction is not frozen as expected.");
  }
  if (trainingMaterials.status !== "PASS" || trainingMaterials.summary.targetItemIdCount !== 24) {
    throw new Error("Soldier training material presentation source is not complete.");
  }
}

function formatPassiveParameter(format: string, value: number) {
  switch (format) {
    case "PERCENT":
      return `${value}%`;
    case "PLUS_PERCENT":
      return `+${value}%`;
    case "MINUS_PERCENT":
      return `-${value}%`;
    case "PLUS_NUMBER":
      return `+${value}`;
    case "MINUS_NUMBER":
      return `-${value}`;
    case "NUMBER":
      return String(value);
    default:
      throw new Error(`Unsupported COMMON_PASSIVE token format: ${format}`);
  }
}

function reconstructPassiveDescription(template: string, formats: string[], values: number[]) {
  if (formats.length !== values.length) {
    throw new Error("COMMON_PASSIVE parameter shape mismatch.");
  }
  return values.reduce(
    (text, value, index) => text.replace(`{P${index}}`, formatPassiveParameter(formats[index], value)),
    template,
  );
}

export function readSoldierTrainingPageData(): SoldierTrainingPageData {
  requireFrozenSources();

  const stage1ById = new Map(stage1.records.map((record) => [record.id, record]));
  const techs: SoldierTrainingTech[] = [];

  for (const sequence of commonStat.valueSequenceCatalog) {
    for (const techId of sequence.techIds) {
      const record = stage1ById.get(techId);
      const shape = commonStat.effectSemantics.effectShapeCatalog.find((entry) =>
        entry.techIds.includes(techId),
      );
      if (!record || !shape) throw new Error(`Missing frozen COMMON_STAT locator for Tech ${techId}.`);
      if (record.explicitLevelReferences.length !== sequence.levelCount) {
        throw new Error(`COMMON_STAT level-count mismatch for Tech ${techId}.`);
      }
      techs.push({
        techId,
        nameCn: record.raw.Name,
        resource: record.raw.Resource ?? null,
        armyIds: [...(record.raw.ArmyIDRelated ?? [])],
        kind: "COMMON_STAT",
        maxLevel: sequence.levelCount,
        levels: sequence.values.map((values, index) => ({
          level: index + 1,
          statEffects: shape.effects.map((effect, effectIndex) => ({
            statKey: effect.statKey,
            unit: effect.unit,
            value: values[effectIndex],
          })),
          passiveDescription: null,
        })),
      });
    }
  }

  for (const passiveRecord of commonPassive.records) {
    const record = stage1ById.get(passiveRecord.techId);
    const sequence = commonPassive.parameterSequenceCatalog.find(
      (entry) => entry.sequenceId === passiveRecord.parameterSequenceId,
    );
    if (!record || !sequence || !sequence.techIds.includes(passiveRecord.techId)) {
      throw new Error(`Missing frozen COMMON_PASSIVE locator for Tech ${passiveRecord.techId}.`);
    }
    if (record.explicitLevelReferences.length !== sequence.levelValueRows.length) {
      throw new Error(`COMMON_PASSIVE level-count mismatch for Tech ${passiveRecord.techId}.`);
    }
    techs.push({
      techId: passiveRecord.techId,
      nameCn: record.raw.Name,
      resource: record.raw.Resource ?? null,
      armyIds: [...(record.raw.ArmyIDRelated ?? [])],
      kind: "COMMON_PASSIVE",
      maxLevel: sequence.levelValueRows.length,
      levels: sequence.levelValueRows.map((values, index) => ({
        level: index + 1,
        statEffects: null,
        passiveDescription: reconstructPassiveDescription(
          passiveRecord.templateRichTextRaw,
          sequence.tokenFormats,
          values,
        ),
      })),
    });
  }

  const uniqueTechIds = new Set(techs.map((tech) => tech.techId));
  if (techs.length !== 130 || uniqueTechIds.size !== 130) {
    throw new Error("Training simulator must contain exactly 130 frozen common-effect Techs.");
  }

  techs.sort((a, b) => a.techId - b.techId);

  return {
    status: "PASS",
    coverage: { commonStat: 84, commonPassive: 46, total: 130 },
    materials: trainingMaterials.items.map((item) => ({
      itemId: item.itemId,
      nameCn: item.name,
      imageUrl: `/images/soldier-training-materials/${item.itemId}.png`,
    })),
    techs,
  };
}
