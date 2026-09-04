import {
  readEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} from "./equipment-page.localized.server";

const ACCESSORY_GROUP = "accessory";
const HEALING_SUBTYPE = "healing";
const INTELLECT_SUBTYPE = "intellect";
const INTELLECT_SUBTYPE_KO = "지력";
const INTELLECT_SUBTYPE_ORDER = 1;

function mergeAccessoryHealingIntoIntellect<T extends {
  group: string;
  subtype: string;
  subtypeKo: string;
  subtypeOrder: number;
}>(record: T): T {
  if (record.group !== ACCESSORY_GROUP || record.subtype !== HEALING_SUBTYPE) {
    return record;
  }

  return {
    ...record,
    subtype: INTELLECT_SUBTYPE,
    subtypeKo: INTELLECT_SUBTYPE_KO,
    subtypeOrder: INTELLECT_SUBTYPE_ORDER,
  } as T;
}

// GitHub Pages is a static deployment. Keep the equipment page API async-compatible,
// but resolve from the current frozen/localized repository consumers in the client bundle
// instead of issuing a TanStack server-function RPC that has no runtime server on Pages.
export async function getGeneralEquipmentPageData() {
  const data = readGeneralEquipmentPageData();

  return {
    ...data,
    records: data.records.map(mergeAccessoryHealingIntoIntellect),
    filters: data.filters.map((filter) =>
      filter.group === ACCESSORY_GROUP
        ? {
            ...filter,
            subtypes: filter.subtypes.filter((subtype) => subtype.subtype !== HEALING_SUBTYPE),
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
      classification: mergeAccessoryHealingIntoIntellect(pageData.detail.classification),
    },
  };
}
