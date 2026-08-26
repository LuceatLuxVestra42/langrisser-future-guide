import { createServerFn } from "@tanstack/react-start";

import { readHeroPrototypePageData } from "./hero-page.server";

export const getHeroPrototypePageData = createServerFn({ method: "GET" })
  .validator((input: { heroId: number }) => {
    if (!Number.isSafeInteger(input.heroId) || input.heroId <= 0) {
      throw new Error("heroId must be a positive safe integer.");
    }
    return input;
  })
  .handler(async ({ data }) => readHeroPrototypePageData(data.heroId));
