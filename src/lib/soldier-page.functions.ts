import { readSoldierPrototypePageDataWithAbilityPresentation } from "./soldier-ability-presentation.server";
import { readSoldierPrototypePageData } from "./soldier-page.server";

// GitHub Pages static build: consume the frozen Soldier page data first, then apply
// validated frontend-only presentation overlays. Do not recreate Soldier semantics or relationships.
export function getSoldierPrototypePageData() {
  const frozenPageData = readSoldierPrototypePageData();
  return readSoldierPrototypePageDataWithAbilityPresentation(frozenPageData);
}
