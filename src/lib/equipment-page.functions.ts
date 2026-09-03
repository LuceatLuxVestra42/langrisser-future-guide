import {
  readEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} from "./equipment-page.localized.server";

// GitHub Pages is a static deployment. Keep the equipment page API async-compatible,
// but resolve from the current frozen/localized repository consumers in the client bundle
// instead of issuing a TanStack server-function RPC that has no runtime server on Pages.
export async function getGeneralEquipmentPageData() {
  return readGeneralEquipmentPageData();
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

  return readEquipmentDetailPageData(data.equipmentId);
}
