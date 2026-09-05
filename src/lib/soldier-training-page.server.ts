import trainingTechStage1Json from "../../data/generated/soldier-training-tech-classification-stage1-census.v1.json";
import commonStatJson from "../../data/generated/soldier-training-tech-common-stat-effect-extraction.v1.json";
import commonPassiveJson from "../../data/generated/soldier-training-tech-common-passive-effect-extraction.v1.json";
import trainingTechLevelCostsJson from "../../data/generated/soldier-training-tech-level-costs.v1.json";
import trainingMaterialItemInfoJson from "../../data/generated/soldier-training-material-iteminfo.v1.json";
import trainingLocalizationJson from "../../data/presentation/soldier-training-localization-frozen.v1.json";
import trainingMaterialNameKrJson from "../../data/presentation/soldier-training-material-name-kr.v1.json";
import trainingTechNameKrJson from "../../data/presentation/soldier-training-tech-name-kr.v1.json";
import trainingPassiveTemplateKrJson from "../../data/presentation/soldier-training-tech-common-passive-template-kr.v1.json";

export type TrainingStatEffect = {
  statKey: "HP" | "ATK" | "DEF" | "MDEF";
  unit: "FLAT" | "PERCENT";
  value: number;
};

export type TrainingTechLevelMaterialCost = {
  goodsType: number;
  id: number;
  count: number;
};

export type TrainingTechNameStatus = "project-display-confirmed" | "provisional-display";

export type TrainingTechLevel = {
  level: number;
  statEffects: TrainingStatEffect[] | null;
  passiveDescriptionKr: string | null;
  goldCost: number;
  materialCosts: TrainingTechLevelMaterialCost[];
};

export type SoldierTrainingTech = {
  techId: number;
  nameCn: string;
  nameKr: string;
  nameStatus: TrainingTechNameStatus;
  resource: string | null;
  armyIds: number[];
  kind: "COMMON_STAT" | "COMMON_PASSIVE";
  maxLevel: number;
  levels: TrainingTechLevel[];
};

export type SoldierTrainingMaterial = {
  itemId: number;
  nameCn: string;
  nameKr: string;
  imageUrl: string;
};

export type SoldierTrainingPageData = {
  status: "PASS";
  localizationFreezeState: "SOLDIER_TRAINING_LOCALIZATION_PRESENTATION_FROZEN";
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

type TrainingTechLevelCostSource = {
  status: string;
  completion: string;
  freezeState: string;
  coverage: {
    targetTechCount: number;
    commonStatTechCount: number;
    commonPassiveTechCount: number;
    referencedLevelRowCount: number;
    uniqueReferencedLevelRowCount: number;
    unresolvedLevelReferenceCount: number;
  };
  records: Array<{
    techId: number;
    kind: "COMMON_STAT" | "COMMON_PASSIVE";
    levels: Array<{
      level: number;
      trainingTechLevelInfoId: number;
      goldCost: number;
      materials: TrainingTechLevelMaterialCost[];
    }>;
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

type TrainingLocalizationAdmission = {
  status: string;
  completion: string;
  freezeState: string;
  coverage: {
    materialRecordCount: number;
    techRecordCount: number;
    commonStatTechCount: number;
    commonPassiveTechCount: number;
    passiveTemplateRecordCount: number;
  };
  frontendContract: {
    materialDisplaySource: string;
    techDisplaySource: string;
    passiveTemplateSource: string;
    materialLookup: string;
    techLookup: string;
    passiveTemplateLookup: string;
    semanticValuesRemainIn: string[];
    fallbackPolicy: string;
  };
};

type TrainingMaterialNameKrSource = {
  status: string;
  completion: string;
  coverage: {
    targetItemCount: number;
    recordCount: number;
    localizedDisplayNameCount: number;
    duplicateItemIdCount: number;
  };
  records: Array<{
    itemId: number;
    nameCn: string;
    displayNameKr: string;
    status: "project-display-confirmed";
  }>;
};

type TrainingTechNameKrSource = {
  status: string;
  completion: string;
  coverage: {
    targetTechCount: number;
    recordCount: number;
    commonStatCount: number;
    commonPassiveCount: number;
    blankDisplayNameCount: number;
    duplicateTechIdCount: number;
  };
  records: Array<{
    techId: number;
    nameCn: string;
    displayNameKr: string;
    kind: "COMMON_STAT" | "COMMON_PASSIVE";
    status: TrainingTechNameStatus;
  }>;
};

type TrainingPassiveTemplateKrSource = {
  status: string;
  completion: string;
  coverage: {
    targetTechCount: number;
    recordCount: number;
    duplicateTechIdCount: number;
    placeholderParityFailureCount: number;
    richTextWrapperParityFailureCount: number;
  };
  records: Array<{
    techId: number;
    displayNameKr: string;
    stageCNameStatus: TrainingTechNameStatus;
    parameterSequenceId: string;
    placeholderOrder: string[];
    templateRichTextKr: string;
    status: "frozen-source-presentation-translation";
  }>;
};

const MATERIAL_DISPLAY_PATH = "data/presentation/soldier-training-material-name-kr.v1.json";
const TECH_DISPLAY_PATH = "data/presentation/soldier-training-tech-name-kr.v1.json";
const PASSIVE_TEMPLATE_PATH = "data/presentation/soldier-training-tech-common-passive-template-kr.v1.json";
const SEMANTIC_VALUE_PATHS = [
  "data/generated/soldier-training-material-iteminfo.v1.json",
  "data/generated/soldier-training-tech-common-stat-effect-extraction.v1.json",
  "data/generated/soldier-training-tech-common-passive-effect-extraction.v1.json",
];

const stage1 = trainingTechStage1Json as unknown as Stage1Source;
const commonStat = commonStatJson as unknown as CommonStatSource;
const commonPassive = commonPassiveJson as unknown as CommonPassiveSource;
const trainingTechLevelCosts = trainingTechLevelCostsJson as unknown as TrainingTechLevelCostSource;
const trainingMaterials = trainingMaterialItemInfoJson as unknown as TrainingMaterialSource;
const trainingLocalization = trainingLocalizationJson as unknown as TrainingLocalizationAdmission;
const materialNamesKr = trainingMaterialNameKrJson as unknown as TrainingMaterialNameKrSource;
const techNamesKr = trainingTechNameKrJson as unknown as TrainingTechNameKrSource;
const passiveTemplatesKr = trainingPassiveTemplateKrJson as unknown as TrainingPassiveTemplateKrSource;

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
  if (
    trainingTechLevelCosts.status !== "PASS" ||
    trainingTechLevelCosts.completion !== "COMPLETE" ||
    trainingTechLevelCosts.freezeState !== "SOLDIER_TRAINING_TECH_LEVEL_COSTS_FROZEN" ||
    trainingTechLevelCosts.coverage.targetTechCount !== 130 ||
    trainingTechLevelCosts.coverage.commonStatTechCount !== 84 ||
    trainingTechLevelCosts.coverage.commonPassiveTechCount !== 46 ||
    trainingTechLevelCosts.coverage.referencedLevelRowCount !== 1510 ||
    trainingTechLevelCosts.coverage.uniqueReferencedLevelRowCount !== 1510 ||
    trainingTechLevelCosts.coverage.unresolvedLevelReferenceCount !== 0
  ) {
    throw new Error("TrainingTech level-cost projection is not frozen as expected.");
  }
  if (trainingMaterials.status !== "PASS" || trainingMaterials.summary.targetItemIdCount !== 24) {
    throw new Error("Soldier training material source is not complete.");
  }

  if (
    trainingLocalization.status !== "PASS" ||
    trainingLocalization.completion !== "COMPLETE" ||
    trainingLocalization.freezeState !== "SOLDIER_TRAINING_LOCALIZATION_PRESENTATION_FROZEN" ||
    trainingLocalization.coverage.materialRecordCount !== 24 ||
    trainingLocalization.coverage.techRecordCount !== 130 ||
    trainingLocalization.coverage.commonStatTechCount !== 84 ||
    trainingLocalization.coverage.commonPassiveTechCount !== 46 ||
    trainingLocalization.coverage.passiveTemplateRecordCount !== 46
  ) {
    throw new Error("Soldier Training localization admission is not frozen as expected.");
  }

  const frontendContract = trainingLocalization.frontendContract;
  if (
    frontendContract.materialDisplaySource !== MATERIAL_DISPLAY_PATH ||
    frontendContract.techDisplaySource !== TECH_DISPLAY_PATH ||
    frontendContract.passiveTemplateSource !== PASSIVE_TEMPLATE_PATH ||
    frontendContract.materialLookup !== "exact itemId" ||
    frontendContract.techLookup !== "exact techId" ||
    !frontendContract.passiveTemplateLookup.startsWith("exact techId") ||
    JSON.stringify(frontendContract.semanticValuesRemainIn) !== JSON.stringify(SEMANTIC_VALUE_PATHS) ||
    !frontendContract.fallbackPolicy.startsWith("FAIL_CLOSED")
  ) {
    throw new Error("Soldier Training localization frontend contract drifted.");
  }

  if (
    materialNamesKr.status !== "PASS" ||
    materialNamesKr.completion !== "COMPLETE" ||
    materialNamesKr.coverage.targetItemCount !== 24 ||
    materialNamesKr.coverage.recordCount !== 24 ||
    materialNamesKr.coverage.localizedDisplayNameCount !== 24 ||
    materialNamesKr.coverage.duplicateItemIdCount !== 0
  ) {
    throw new Error("Soldier Training material Korean presentation source is not complete.");
  }

  if (
    techNamesKr.status !== "PASS" ||
    techNamesKr.completion !== "COMPLETE" ||
    techNamesKr.coverage.targetTechCount !== 130 ||
    techNamesKr.coverage.recordCount !== 130 ||
    techNamesKr.coverage.commonStatCount !== 84 ||
    techNamesKr.coverage.commonPassiveCount !== 46 ||
    techNamesKr.coverage.blankDisplayNameCount !== 0 ||
    techNamesKr.coverage.duplicateTechIdCount !== 0
  ) {
    throw new Error("Soldier Training Tech Korean presentation source is not complete.");
  }

  if (
    passiveTemplatesKr.status !== "PASS" ||
    passiveTemplatesKr.completion !== "COMPLETE" ||
    passiveTemplatesKr.coverage.targetTechCount !== 46 ||
    passiveTemplatesKr.coverage.recordCount !== 46 ||
    passiveTemplatesKr.coverage.duplicateTechIdCount !== 0 ||
    passiveTemplatesKr.coverage.placeholderParityFailureCount !== 0 ||
    passiveTemplatesKr.coverage.richTextWrapperParityFailureCount !== 0
  ) {
    throw new Error("Soldier Training passive Korean presentation source is not complete.");
  }
}

function uniqueIndex<T extends Record<K, number>, K extends string>(rows: T[], key: K, label: string) {
  const index = new Map<number, T>();
  for (const row of rows) {
    const id = row[key];
    if (index.has(id)) throw new Error(`Duplicate ${label} ID ${id}.`);
    index.set(id, row);
  }
  return index;
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
  return values.reduce((text, value, index) => {
    const format = formats[index];
    if (!format) throw new Error(`Missing COMMON_PASSIVE token format P${index}.`);
    return text.replace(`{P${index}}`, formatPassiveParameter(format, value));
  }, template);
}

function readLevelCost(
  costRecord: TrainingTechLevelCostSource["records"][number],
  explicitLevelReferences: number[],
  index: number,
) {
  const costLevel = costRecord.levels[index];
  const expectedLevelInfoId = explicitLevelReferences[index];
  if (
    !costLevel ||
    expectedLevelInfoId === undefined ||
    costLevel.level !== index + 1 ||
    costLevel.trainingTechLevelInfoId !== expectedLevelInfoId
  ) {
    throw new Error(`TrainingTech level-cost parity mismatch for Tech ${costRecord.techId} Lv.${index + 1}.`);
  }
  return {
    goldCost: costLevel.goldCost,
    materialCosts: costLevel.materials.map((material) => ({ ...material })),
  };
}

export function readSoldierTrainingPageData(): SoldierTrainingPageData {
  requireFrozenSources();

  const stage1ById = new Map(stage1.records.map((record) => [record.id, record]));
  const levelCostByTechId = uniqueIndex(trainingTechLevelCosts.records, "techId", "Tech level cost");
  const materialNameById = uniqueIndex(materialNamesKr.records, "itemId", "material presentation");
  const techNameById = uniqueIndex(techNamesKr.records, "techId", "Tech presentation");
  const passiveTemplateById = uniqueIndex(passiveTemplatesKr.records, "techId", "passive presentation");
  const techs: SoldierTrainingTech[] = [];

  if (levelCostByTechId.size !== 130) {
    throw new Error("TrainingTech level-cost projection must contain exactly 130 Tech IDs.");
  }

  for (const sequence of commonStat.valueSequenceCatalog) {
    for (const techId of sequence.techIds) {
      const record = stage1ById.get(techId);
      const costRecord = levelCostByTechId.get(techId);
      const display = techNameById.get(techId);
      const shape = commonStat.effectSemantics.effectShapeCatalog.find((entry) =>
        entry.techIds.includes(techId),
      );
      if (!record || !costRecord || !display || !shape) {
        throw new Error(`Missing frozen COMMON_STAT locator/cost/presentation for Tech ${techId}.`);
      }
      if (costRecord.kind !== "COMMON_STAT" || costRecord.levels.length !== sequence.levelCount) {
        throw new Error(`COMMON_STAT level-cost shape mismatch for Tech ${techId}.`);
      }
      if (display.kind !== "COMMON_STAT" || display.nameCn !== record.raw.Name) {
        throw new Error(`COMMON_STAT Korean presentation parity mismatch for Tech ${techId}.`);
      }
      if (record.explicitLevelReferences.length !== sequence.levelCount) {
        throw new Error(`COMMON_STAT level-count mismatch for Tech ${techId}.`);
      }
      techs.push({
        techId,
        nameCn: record.raw.Name,
        nameKr: display.displayNameKr,
        nameStatus: display.status,
        resource: record.raw.Resource ?? null,
        armyIds: [...(record.raw.ArmyIDRelated ?? [])],
        kind: "COMMON_STAT",
        maxLevel: sequence.levelCount,
        levels: sequence.values.map((values, index) => ({
          level: index + 1,
          statEffects: shape.effects.map((effect, effectIndex) => {
            const value = values[effectIndex];
            if (value === undefined) {
              throw new Error(`COMMON_STAT effect-value mismatch for Tech ${techId} Lv.${index + 1}.`);
            }
            return {
              statKey: effect.statKey,
              unit: effect.unit,
              value,
            };
          }),
          passiveDescriptionKr: null,
          ...readLevelCost(costRecord, record.explicitLevelReferences, index),
        })),
      });
    }
  }

  for (const passiveRecord of commonPassive.records) {
    const record = stage1ById.get(passiveRecord.techId);
    const costRecord = levelCostByTechId.get(passiveRecord.techId);
    const display = techNameById.get(passiveRecord.techId);
    const passiveDisplay = passiveTemplateById.get(passiveRecord.techId);
    const sequence = commonPassive.parameterSequenceCatalog.find(
      (entry) => entry.sequenceId === passiveRecord.parameterSequenceId,
    );
    if (
      !record ||
      !costRecord ||
      !display ||
      !passiveDisplay ||
      !sequence ||
      !sequence.techIds.includes(passiveRecord.techId)
    ) {
      throw new Error(`Missing frozen COMMON_PASSIVE locator/cost/presentation for Tech ${passiveRecord.techId}.`);
    }
    if (
      costRecord.kind !== "COMMON_PASSIVE" ||
      costRecord.levels.length !== sequence.levelValueRows.length
    ) {
      throw new Error(`COMMON_PASSIVE level-cost shape mismatch for Tech ${passiveRecord.techId}.`);
    }
    if (
      display.kind !== "COMMON_PASSIVE" ||
      display.nameCn !== record.raw.Name ||
      passiveDisplay.displayNameKr !== display.displayNameKr ||
      passiveDisplay.stageCNameStatus !== display.status ||
      passiveDisplay.parameterSequenceId !== passiveRecord.parameterSequenceId
    ) {
      throw new Error(`COMMON_PASSIVE Korean presentation parity mismatch for Tech ${passiveRecord.techId}.`);
    }
    if (record.explicitLevelReferences.length !== sequence.levelValueRows.length) {
      throw new Error(`COMMON_PASSIVE level-count mismatch for Tech ${passiveRecord.techId}.`);
    }
    techs.push({
      techId: passiveRecord.techId,
      nameCn: record.raw.Name,
      nameKr: display.displayNameKr,
      nameStatus: display.status,
      resource: record.raw.Resource ?? null,
      armyIds: [...(record.raw.ArmyIDRelated ?? [])],
      kind: "COMMON_PASSIVE",
      maxLevel: sequence.levelValueRows.length,
      levels: sequence.levelValueRows.map((values, index) => ({
        level: index + 1,
        statEffects: null,
        passiveDescriptionKr: reconstructPassiveDescription(
          passiveDisplay.templateRichTextKr,
          sequence.tokenFormats,
          values,
        ),
        ...readLevelCost(costRecord, record.explicitLevelReferences, index),
      })),
    });
  }

  const uniqueTechIds = new Set(techs.map((tech) => tech.techId));
  if (techs.length !== 130 || uniqueTechIds.size !== 130) {
    throw new Error("Training simulator must contain exactly 130 frozen common-effect Techs.");
  }

  techs.sort((a, b) => a.techId - b.techId);

  const materials = trainingMaterials.items.map((item) => {
    const display = materialNameById.get(item.itemId);
    if (
      !display ||
      display.nameCn !== item.name ||
      display.status !== "project-display-confirmed" ||
      !display.displayNameKr.trim()
    ) {
      throw new Error(`Training material Korean presentation parity mismatch for item ${item.itemId}.`);
    }
    return {
      itemId: item.itemId,
      nameCn: item.name,
      nameKr: display.displayNameKr,
      imageUrl: `../../images/soldier-training-materials/${item.itemId}.png`,
    };
  });

  if (materials.length !== 24 || new Set(materials.map((item) => item.itemId)).size !== 24) {
    throw new Error("Training material presentation must contain exactly 24 frozen item IDs.");
  }

  return {
    status: "PASS",
    localizationFreezeState: "SOLDIER_TRAINING_LOCALIZATION_PRESENTATION_FROZEN",
    coverage: { commonStat: 84, commonPassive: 46, total: 130 },
    materials,
    techs,
  };
}