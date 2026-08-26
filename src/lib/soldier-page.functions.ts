import { createServerFn } from "@tanstack/react-start";

import { readSoldierPrototypePageData } from "./soldier-page.server";

export const getSoldierPrototypePageData = createServerFn({ method: "GET" }).handler(
  async () => readSoldierPrototypePageData(),
);
