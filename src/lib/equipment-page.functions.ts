import {
  readEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} from "./equipment-page.server";

export function getGeneralEquipmentPageData() {
  return readGeneralEquipmentPageData();
}

export function getExclusiveEquipmentPageData() {
  return readExclusiveEquipmentPageData();
}

export function getEquipmentDetailPageData(input: { data: { equipmentId: number } }) {
  const equipmentId = input.data.equipmentId;

  if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) {
    throw new Error("equipmentId must be a positive safe integer.");
  }

  return readEquipmentDetailPageData(equipmentId);
}
