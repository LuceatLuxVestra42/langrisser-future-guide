import { createServerFn } from "@tanstack/react-start";

import {
  readEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} from "./equipment-page.server";

export const getGeneralEquipmentPageData = createServerFn({ method: "GET" }).handler(
  async () => readGeneralEquipmentPageData(),
);

export const getExclusiveEquipmentPageData = createServerFn({ method: "GET" }).handler(
  async () => readExclusiveEquipmentPageData(),
);

export const getEquipmentDetailPageData = createServerFn({ method: "GET" })
  .validator((input: { equipmentId: number }) => {
    if (!Number.isSafeInteger(input.equipmentId) || input.equipmentId <= 0) {
      throw new Error("equipmentId must be a positive safe integer.");
    }
    return input;
  })
  .handler(async ({ data }) => readEquipmentDetailPageData(data.equipmentId));
