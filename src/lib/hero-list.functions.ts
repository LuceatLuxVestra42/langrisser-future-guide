import { createServerFn } from "@tanstack/react-start";

import { readHeroDetailRouteStage5Data } from "./hero-detail-stage5.server";
import {
  readHeroDetailRouteStage4Data,
  readHeroListStage2Data,
  readHeroListStage3Data,
  readHeroListStage4Data,
} from "./hero-list.server";

export const getHeroListStage2Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage2Data(),
);

export const getHeroListStage3Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage3Data(),
);

export const getHeroListStage4Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage4Data(),
);

function validateHeroId(input: { heroId: number }) {
  if (!Number.isSafeInteger(input.heroId) || input.heroId <= 0) {
    throw new Error("heroId must be a positive safe integer.");
  }
  return input;
}

export const getHeroDetailRouteStage4Data = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => readHeroDetailRouteStage4Data(data.heroId));

export const getHeroDetailRouteStage5Data = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => readHeroDetailRouteStage5Data(data.heroId));
