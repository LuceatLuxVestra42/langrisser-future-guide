import { createServerFn } from "@tanstack/react-start";

import { readHeroCardIconIndex } from "./hero-card-icon-assets.server";

export const getHeroCardIconIndex = createServerFn({ method: "GET" }).handler(
  async () => readHeroCardIconIndex(),
);
