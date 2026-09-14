import { createServerFn } from "@tanstack/react-start";

import { getHeroFinalJobStatBarPresentation } from "./hero-final-job-stat-bars.server";

export const getHeroFinalJobStatBarPresentationData = createServerFn({ method: "GET" })
  .handler(async () => getHeroFinalJobStatBarPresentation());
