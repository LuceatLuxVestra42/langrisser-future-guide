import { readSoldierPrototypePageDataWithAbilityPresentation } from "./soldier-ability-presentation.server";

// GitHub Pages static build: consume the frozen Soldier page data plus validated
// frontend-only presentation overlays. Do not recreate Soldier semantics or relationships.
export function getSoldierPrototypePageData() {
  return readSoldierPrototypePageDataWithAbilityPresentation();
}
