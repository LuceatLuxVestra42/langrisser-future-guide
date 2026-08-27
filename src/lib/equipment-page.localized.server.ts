import equipmentNameKrJson from "../../data/generated/equipment-name-kr-user-approved.v1.json";
import {
  readEquipmentDetailPageData as readBaseEquipmentDetailPageData,
  readExclusiveEquipmentPageData as readBaseExclusiveEquipmentPageData,
  readGeneralEquipmentPageData as readBaseGeneralEquipmentPageData,
} from "./equipment-page.server";

type EquipmentNameKrProjection = {
  byEquipmentId: Record<
    string,
    {
      nameCn: string;
      nameKr: string | null;
      pageReady: boolean;
      status: string;
    }
  >;
};

const equipmentNameKr = equipmentNameKrJson as EquipmentNameKrProjection;

function resolveNameKr(equipmentId: number, nameCn: string, fallback: string | null) {
  const localized = equipmentNameKr.byEquipmentId[String(equipmentId)];
  if (!localized) {
    throw new Error(`Missing Korean equipment presentation record for ${equipmentId}.`);
  }
  if (localized.nameCn !== nameCn) {
    throw new Error(
      `Equipment ${equipmentId} Korean presentation identity mismatch: ${localized.nameCn} !== ${nameCn}.`,
    );
  }
  return localized.nameKr ?? fallback;
}

export function readGeneralEquipmentPageData() {
  const data = readBaseGeneralEquipmentPageData();
  return {
    ...data,
    records: data.records.map((record) => ({
      ...record,
      nameKr: resolveNameKr(record.equipmentId, record.nameCn, record.nameKr),
    })),
  };
}

export function readExclusiveEquipmentPageData() {
  const data = readBaseExclusiveEquipmentPageData();
  return {
    ...data,
    records: data.records.map((record) => ({
      ...record,
      nameKr: resolveNameKr(record.equipmentId, record.nameCn, record.nameKr),
    })),
  };
}

export function readEquipmentDetailPageData(equipmentId: number) {
  const data = readBaseEquipmentDetailPageData(equipmentId);
  if (!data) return null;

  const identity = data.detail.identity;
  const nameKr = resolveNameKr(equipmentId, identity.nameCn, identity.nameKr);

  return {
    ...data,
    displayName: nameKr ?? identity.nameCn,
    detail: {
      ...data.detail,
      identity: {
        ...identity,
        nameKr,
      },
    },
  };
}
