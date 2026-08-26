import { createServerFn } from "@tanstack/react-start";

import { readBannerPageData } from "./banner-page.server";

export const getBannerPageData = createServerFn({ method: "GET" }).handler(async () =>
  readBannerPageData(),
);
