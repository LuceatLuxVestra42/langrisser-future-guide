import {
  readEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} from "./equipment-page.localized.server";
import type {
  EquipmentFilterGroup,
  EquipmentStatProperty,
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

type AccessoryClassifiable = {
  group: string;
  subtype: string;
  subtypeKo: string;
  subtypeOrder: number;
};

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
  if (!pageData || pageData.kind !== "general") {
    return pageData;
  }

  return {
    ...pageData,
    detail: {
      ...pageData.detail,
      classification: applyAccessoryPresentationClassification(
        pageData.detail.classification,
        hasAttackAndIntellectBaseStats(pageData.detail.stats.properties),
      ),
    },
  };
}
