import {
  readExclusiveEquipmentSheetData,
  type EquipmentEffectSegment,
  type EquipmentStatProperty,
  type ExclusiveEquipmentDetailRecord,
  type ExclusiveEquipmentSheetRecord,
} from "./equipment-page.server";

export const EXCLUSIVE_EQUIPMENT_PRESENTATION_SECTION_ORDER = [
  "exclusiveHero",
  "stats",
  "effect",
  "restriction",
  "acquisition",
] as const;

export type ExclusiveEquipmentPresentationSectionId =
  (typeof EXCLUSIVE_EQUIPMENT_PRESENTATION_SECTION_ORDER)[number];

export type ExclusiveEquipmentPresentationRecord = {
  equipmentId: number;
  classification: {
    group: string;
    groupKo: string;
    subtype: string;
    subtypeKo: string;
    groupOrder: number;
    subtypeOrder: number;
    equipmentType: number;
    label: number;
    acquisitionClass: string;
    sortIndex: number;
  };
  sections: {
    exclusiveHero: {
      titleKo: "전용 영웅";
      heroId: number;
    };
    stats: {
      titleKo: "Lv50 능력치";
      maxLevel: number;
      rows: EquipmentStatProperty[];
    };
    effect: {
      titleKo: "최대 효과";
      maxEffectSkillId: number;
      effectName: string;
      effectText: string;
      effectSegments: EquipmentEffectSegment[];
    };
    restriction: {
      titleKo: "착용 제한";
      mode: string;
      generalArmyIds: number[];
      specialJobIds: number[];
      generalArmies: ExclusiveEquipmentSheetRecord["restriction"]["generalArmies"];
      specialJobs: ExclusiveEquipmentSheetRecord["restriction"]["specialJobs"];
      semanticStatus: string;
      semanticConfidence: number;
    };
    acquisition: {
      titleKo: "획득/출시 정보";
      releaseGroupDate: string | null;
      confidencePercent: number;
      classificationBasis: string;
    };
  };
};

export type ExclusiveEquipmentPresentationData = {
  total: 167;
  sectionOrder: typeof EXCLUSIVE_EQUIPMENT_PRESENTATION_SECTION_ORDER;
  records: ExclusiveEquipmentPresentationRecord[];
};

function mapClassification(
  classification: ExclusiveEquipmentDetailRecord["classification"],
): ExclusiveEquipmentPresentationRecord["classification"] {
  return {
    group: classification.group,
    groupKo: classification.groupKo,
    subtype: classification.subtype,
    subtypeKo: classification.subtypeKo,
    groupOrder: classification.groupOrder,
    subtypeOrder: classification.subtypeOrder,
    equipmentType: classification.equipmentType,
    label: classification.label,
    acquisitionClass: classification.acquisitionClass,
    sortIndex: classification.sortIndex,
  };
}

function mapPresentationRecord(
  record: ExclusiveEquipmentSheetRecord,
): ExclusiveEquipmentPresentationRecord {
  return {
    equipmentId: record.equipmentId,
    classification: mapClassification(record.classification),
    sections: {
      exclusiveHero: {
        titleKo: "전용 영웅",
        heroId: record.exclusiveHeroId,
      },
      stats: {
        titleKo: "Lv50 능력치",
        maxLevel: record.stats.maxLevel,
        rows: record.stats.properties,
      },
      effect: {
        titleKo: "최대 효과",
        maxEffectSkillId: record.effect.maxEffectSkillId,
        effectName: record.effect.effectName,
        effectText: record.effect.effectText,
        effectSegments: record.effect.effectSegments,
      },
      restriction: {
        titleKo: "착용 제한",
        mode: record.restriction.mode,
        generalArmyIds: record.restriction.generalArmyIds,
        specialJobIds: record.restriction.specialJobIds,
        generalArmies: record.restriction.generalArmies,
        specialJobs: record.restriction.specialJobs,
        semanticStatus: record.restriction.semanticStatus,
        semanticConfidence: record.restriction.semanticConfidence,
      },
      acquisition: {
        titleKo: "획득/출시 정보",
        releaseGroupDate: record.acquisition.releaseGroupDate,
        confidencePercent: record.acquisition.confidencePercent,
        classificationBasis: record.acquisition.classificationBasis,
      },
    },
  };
}

export function readExclusiveEquipmentPresentationData(): ExclusiveEquipmentPresentationData {
  const records = readExclusiveEquipmentSheetData().map(mapPresentationRecord);

  if (records.length !== 167) {
    throw new Error(
      `Exclusive equipment presentation contract requires 167 records; got ${records.length}.`,
    );
  }

  return {
    total: 167,
    sectionOrder: EXCLUSIVE_EQUIPMENT_PRESENTATION_SECTION_ORDER,
    records,
  };
}
