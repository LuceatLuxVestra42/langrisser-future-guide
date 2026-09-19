import { createServerFn } from "@tanstack/react-start";

import { readHeroBondMaterialsPresentation } from "./hero-bond-materials.server";

function validateHeroId(input: { heroId: number }) {
  if (!Number.isSafeInteger(input.heroId) || input.heroId <= 0) {
    throw new Error("heroId must be a positive safe integer.");
  }
  return input;
}

export const getHeroBondMaterialsPresentation = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => readHeroBondMaterialsPresentation(data.heroId));
