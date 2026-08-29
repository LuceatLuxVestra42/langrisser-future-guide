import { createServerFn } from "@tanstack/react-start";

import { readHeroFusionPowerIndex } from "./hero-fusion-power.server";

export const getHeroFusionPowerIndex = createServerFn({ method: "GET" }).handler(
  async () => readHeroFusionPowerIndex(),
);
