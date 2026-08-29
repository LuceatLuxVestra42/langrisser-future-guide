import { createServerFn } from "@tanstack/react-start";

import { readHeroExclusiveEquipmentPresentation } from "./hero-exclusive-equipment.server";

function validateHeroId(input: { heroId: number }) {
  if (!Number.isSafeInteger(input.heroId) || input.heroId <= 0) {
    throw new Error("heroId must be a positive safe integer.");
  }
  return input;
}

export const getHeroExclusiveEquipmentPresentation = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => readHeroExclusiveEquipmentPresentation(data.heroId));
