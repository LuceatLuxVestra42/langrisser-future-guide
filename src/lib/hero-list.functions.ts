import { createServerFn } from "@tanstack/react-start";

import { readHeroListStage2Data } from "./hero-list.server";

export const getHeroListStage2Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage2Data(),
);
