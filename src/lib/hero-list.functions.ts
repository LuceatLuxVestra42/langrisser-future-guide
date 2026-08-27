import { createServerFn } from "@tanstack/react-start";

import { readHeroListStage2Data, readHeroListStage3Data } from "./hero-list.server";

export const getHeroListStage2Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage2Data(),
);

export const getHeroListStage3Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage3Data(),
);
