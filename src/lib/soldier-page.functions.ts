import { readSoldierPrototypePageData } from "./soldier-page.server";

// GitHub Pages static build: consume the frozen Soldier page data directly.
// Do not recreate Soldier semantics or relationships in the frontend.
export function getSoldierPrototypePageData() {
  return readSoldierPrototypePageData();
}
