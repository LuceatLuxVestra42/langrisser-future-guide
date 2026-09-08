import { createServerFn } from "@tanstack/react-start";

import { readHeroFinalJobStatsPresentation } from "./hero-final-job-extrema.server";

function validateHeroId(input: { heroId: number }) {
  if (!Number.isSafeInteger(input.heroId) || input.heroId <= 0) {
    throw new Error("heroId must be a positive safe integer.");
  }
  return input;
}

export const getHeroFinalJobStatsPresentation = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => readHeroFinalJobStatsPresentation(data.heroId));
