import { createServerFn } from "@tanstack/react-start";

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

export const getHeroDetailRouteStage4Data = createServerFn({ method: "GET" })
  .validator((input: { heroId: number }) => {
    if (!Number.isSafeInteger(input.heroId) || input.heroId <= 0) {
      throw new Error("heroId must be a positive safe integer.");
    }
    return input;
  })
  .handler(async ({ data }) => readHeroDetailRouteStage4Data(data.heroId));
