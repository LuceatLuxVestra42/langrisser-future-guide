import { createServerFn } from "@tanstack/react-start";

import { readHeroCastingLawPresentation } from "./hero-casting-law.server";

function validateHeroId(input: { heroId: number }) {
  if (!Number.isSafeInteger(input.heroId) || input.heroId <= 0) {
    throw new Error("heroId must be a positive safe integer.");
  }
  return input;
}

export const getHeroCastingLawPresentation = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => readHeroCastingLawPresentation(data.heroId));
