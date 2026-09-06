import {
  readExclusiveEquipmentPresentationData,
  type ExclusiveEquipmentPresentationRecord,
} from "./equipment-exclusive-presentation.server";
import {
  readEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} from "./equipment-page.localized.server";
import type {
  EquipmentFilterGroup,
  EquipmentStatProperty,
  ExclusiveEquipmentDetailPageData,
} from "./equipment-page.server";

const ACCESSORY_GROUP = "accessory";
const ATTACK_INTELLECT_SUBTYPE = "attack-intellect";
const ATTACK_INTELLECT_SUBTYPE_KO = "공격+지력";
const ATTACK_INTELLECT_SUBTYPE_ORDER = 1;
const HEALING_SUBTYPE = "healing";
const INTELLECT_SUBTYPE = "intellect";
const INTELLECT_SUBTYPE_KO = "지력";
const INTELLECT_SUBTYPE_ORDER = 2;
const DEFENSE_SUBTYPE = "defense";
const DEFENSE_SUBTYPE_ORDER = 3;
const ATTACK_PROPERTY_ID = 2;
const INTELLECT_PROPERTY_ID = 4;
const EQUIPMENT_581_ID = 581;

type AccessoryClassifiable = {
  group: string;
  subtype: string;
  subtypeKo: string;
  subtypeOrder: number;
};

type EffectPresentable = {
  effectText: string;
  effectSegments: Array<{ text: string }>;
};

export type ExclusiveEquipmentDetailRouteData = ExclusiveEquipmentDetailPageData & {
  presentation: ExclusiveEquipmentPresentationRecord;
};

const exclusivePresentationData = readExclusiveEquipmentPresentationData();
const exclusivePresentationByEquipmentId = new Map(
  exclusivePresentationData.records.map((record) => [record.equipmentId, record]),
);

function hasAttackAndIntellectBaseStats(properties: EquipmentStatProperty[]) {
  let hasAttack = false;
  let hasIntellect = false;

  for (const property of properties) {
    if (property.base <= 0) continue;
    if (property.propertyId === ATTACK_PROPERTY_ID) hasAttack = true;
    if (property.propertyId === INTELLECT_PROPERTY_ID) hasIntellect = true;
  }

  return hasAttack && hasIntellect;
}

function compactEquipment581EffectTrailer(value: string) {
  return value.replace(
    /\n지속 4행동,\s*\n해제 불가/g,
    ", 지속 4행동, 해제 불가",
  );
}

function applyEquipmentEffectPresentation<T extends EffectPresentable>(
  equipmentId: number,
  effect: T,
): T {
  if (equipmentId !== EQUIPMENT_581_ID) {
    return effect;
  }

  return {
    ...effect,
    effectText: compactEquipment581EffectTrailer(effect.effectText),
    effectSegments: effect.effectSegments.map((segment) => ({
      ...segment,
      text: compactEquipment581EffectTrailer(segment.text),
    })),
  } as T;
}

function applyAccessoryPresentationClassification<T extends AccessoryClassifiable>(
  record: T,
  attackIntellectBaseStats: boolean,
): T {
  if (record.group !== ACCESSORY_GROUP) {
    return record;
  }

  if (attackIntellectBaseStats) {
    return {
      ...record,
      subtype: ATTACK_INTELLECT_SUBTYPE,
      subtypeKo: ATTACK_INTELLECT_SUBTYPE_KO,
      subtypeOrder: ATTACK_INTELLECT_SUBTYPE_ORDER,
    } as T;
  }

  if (record.subtype === HEALING_SUBTYPE || record.subtype === INTELLECT_SUBTYPE) {
    return {
      ...record,
      subtype: INTELLECT_SUBTYPE,
      subtypeKo: INTELLECT_SUBTYPE_KO,
      subtypeOrder: INTELLECT_SUBTYPE_ORDER,
    } as T;
  }

  if (record.subtype === DEFENSE_SUBTYPE) {
    return {
      ...record,
      subtypeOrder: DEFENSE_SUBTYPE_ORDER,
    } as T;
  }

  return record;
}

function buildAccessoryFilterSubtypes(
  subtypes: EquipmentFilterGroup["subtypes"],
): EquipmentFilterGroup["subtypes"] {
  const normalized = subtypes
    .filter(
      (subtype) =>
        subtype.subtype !== HEALING_SUBTYPE &&
        subtype.subtype !== ATTACK_INTELLECT_SUBTYPE,
    )
    .map((subtype) => {
      if (subtype.subtype === INTELLECT_SUBTYPE) {
        return {
          ...subtype,
          subtypeOrder: INTELLECT_SUBTYPE_ORDER,
        };
      }

      if (subtype.subtype === DEFENSE_SUBTYPE) {
        return {
          ...subtype,
          subtypeOrder: DEFENSE_SUBTYPE_ORDER,
        };
      }

      return subtype;
    });

  normalized.push({
    subtype: ATTACK_INTELLECT_SUBTYPE,
    subtypeKo: ATTACK_INTELLECT_SUBTYPE_KO,
    subtypeOrder: ATTACK_INTELLECT_SUBTYPE_ORDER,
  });

  return normalized.sort((left, right) => left.subtypeOrder - right.subtypeOrder);
}

// GitHub Pages is a static deployment. Keep the equipment page API async-compatible,
// but resolve from the current frozen/localized repository consumers in the client bundle
// instead of issuing a TanStack server-function RPC that has no runtime server on Pages.
export async function getGeneralEquipmentPageData() {
  const data = readGeneralEquipmentPageData();

  return {
    ...data,
    records: data.records.map((record) => {
      if (record.group !== ACCESSORY_GROUP) {
        return record;
      }

      const detailPageData = readEquipmentDetailPageData(record.equipmentId);
      if (!detailPageData || detailPageData.kind !== "general") {
        throw new Error(
          `Public general accessory ${record.equipmentId} is missing its frozen detail consumer.`,
        );
      }

      return applyAccessoryPresentationClassification(
        record,
        hasAttackAndIntellectBaseStats(detailPageData.detail.stats.properties),
      );
    }),
    filters: data.filters.map((filter) =>
      filter.group === ACCESSORY_GROUP
        ? {
            ...filter,
            subtypes: buildAccessoryFilterSubtypes(filter.subtypes),
          }
        : filter,
    ),
  };
}

export async function getExclusiveEquipmentPageData() {
  return readExclusiveEquipmentPageData();
}

export async function getEquipmentDetailPageData({
  data,
}: {
  data: { equipmentId: number };
}) {
  if (!Number.isSafeInteger(data.equipmentId) || data.equipmentId <= 0) {
    throw new Error("equipmentId must be a positive safe integer.");
  }

  const pageData = readEquipmentDetailPageData(data.equipmentId);
  if (!pageData) {
    return null;
  }

  const detail = {
    ...pageData.detail,
    effect: applyEquipmentEffectPresentation(data.equipmentId, pageData.detail.effect),
  };

  if (pageData.kind === "exclusive") {
    const presentation = exclusivePresentationByEquipmentId.get(data.equipmentId);
    if (!presentation) {
      throw new Error(
        `Exclusive equipment ${data.equipmentId} is missing its frozen presentation record.`,
      );
    }

    if (pageData.ownerHero.heroId !== presentation.sections.exclusiveHero.heroId) {
      throw new Error(
        `Exclusive equipment ${data.equipmentId} owner mismatch between detail and presentation consumers.`,
      );
    }

    return {
      ...pageData,
      detail,
      presentation: {
        ...presentation,
        sections: {
          ...presentation.sections,
          effect: {
            ...presentation.sections.effect,
            effectName: detail.effect.effectName,
            effectText: detail.effect.effectText,
            effectSegments: detail.effect.effectSegments,
          },
        },
      },
    } satisfies ExclusiveEquipmentDetailRouteData;
  }

  return {
    ...pageData,
    detail: {
      ...detail,
      classification: applyAccessoryPresentationClassification(
        detail.classification,
        hasAttackAndIntellectBaseStats(detail.stats.properties),
      ),
    },
  };
}
