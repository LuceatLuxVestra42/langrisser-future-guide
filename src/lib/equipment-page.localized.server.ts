import equipmentNameKrJson from "../../data/generated/equipment-name-kr-user-approved.v1.json";
import {
  readEquipmentDetailPageData as readBaseEquipmentDetailPageData,
  readExclusiveEquipmentPageData as readBaseExclusiveEquipmentPageData,
  readGeneralEquipmentPageData as readBaseGeneralEquipmentPageData,
} from "./equipment-page.server";
import type {
  ExclusiveEquipmentDetailPageData as BaseExclusiveEquipmentDetailPageData,
  GeneralEquipmentDetailPageData as BaseGeneralEquipmentDetailPageData,
} from "./equipment-page.server";

export type EquipmentNameKrPresentationStatus =
  | "confirmed"
  | "provisional-display"
  | "duplicate-non-display"
  | "unresolved-non-public";

type EquipmentNameKrProjectionRecord = {
  nameCn: string;
  nameKr: string | null;
  pageReady: boolean;
  status: "USER_APPROVED_DISPLAY" | "UNRESOLVED_NON_PUBLIC";
  nameKrStatus: EquipmentNameKrPresentationStatus;
};

type EquipmentNameKrProjection = {
  byEquipmentId: Record<string, EquipmentNameKrProjectionRecord>;
};

export type GeneralEquipmentDetailPageData = BaseGeneralEquipmentDetailPageData & {
  nameKrPresentationStatus: EquipmentNameKrPresentationStatus;
};

export type ExclusiveEquipmentDetailPageData = BaseExclusiveEquipmentDetailPageData & {
  nameKrPresentationStatus: EquipmentNameKrPresentationStatus;
};

export type EquipmentDetailPageData =
  | GeneralEquipmentDetailPageData
  | ExclusiveEquipmentDetailPageData;

const equipmentNameKr = equipmentNameKrJson as EquipmentNameKrProjection;

function resolveLocalization(equipmentId: number, nameCn: string) {
  const localized = equipmentNameKr.byEquipmentId[String(equipmentId)];
  if (!localized) {
    throw new Error(`Missing Korean equipment presentation record for ${equipmentId}.`);
  }
  if (localized.nameCn !== nameCn) {
    throw new Error(
      `Equipment ${equipmentId} Korean presentation identity mismatch: ${localized.nameCn} !== ${nameCn}.`,
    );
  }
  return localized;
}

function resolveNameKr(
  equipmentId: number,
  nameCn: string,
  fallback: string | null,
): { nameKr: string | null; status: EquipmentNameKrPresentationStatus } {
  const localized = resolveLocalization(equipmentId, nameCn);
  return {
    nameKr: localized.nameKr ?? fallback,
    status: localized.nameKrStatus,
  };
}

export function readGeneralEquipmentPageData() {
  const data = readBaseGeneralEquipmentPageData();
  return {
    ...data,
    records: data.records.map((record) => {
      const localized = resolveNameKr(record.equipmentId, record.nameCn, record.nameKr);
      return {
        ...record,
        nameKr: localized.nameKr,
        nameKrPresentationStatus: localized.status,
      };
    }),
  };
}

export function readExclusiveEquipmentPageData() {
  const data = readBaseExclusiveEquipmentPageData();
  return {
    ...data,
    records: data.records.map((record) => {
      const localized = resolveNameKr(record.equipmentId, record.nameCn, record.nameKr);
      return {
        ...record,
        nameKr: localized.nameKr,
        nameKrPresentationStatus: localized.status,
      };
    }),
  };
}

export function readEquipmentDetailPageData(
  equipmentId: number,
): EquipmentDetailPageData | null {
  const data = readBaseEquipmentDetailPageData(equipmentId);
  if (!data) return null;

  if (data.kind === "general") {
    const identity = data.detail.identity;
    const localized = resolveNameKr(equipmentId, identity.nameCn, identity.nameKr);
    return {
      ...data,
      nameKrPresentationStatus: localized.status,
      displayName: localized.nameKr ?? identity.nameCn,
      detail: {
        ...data.detail,
        identity: {
          ...identity,
          nameKr: localized.nameKr,
        },
      },
    };
  }

  const identity = data.detail.identity;
  const localized = resolveNameKr(equipmentId, identity.nameCn, identity.nameKr);
  return {
    ...data,
    nameKrPresentationStatus: localized.status,
    displayName: localized.nameKr ?? identity.nameCn,
    detail: {
      ...data.detail,
      identity: {
        ...identity,
        nameKr: localized.nameKr,
      },
    },
  };
}
