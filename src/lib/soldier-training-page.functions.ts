import { readSoldierTrainingPageData } from "./soldier-training-page.server";

// Diagnostic-only branch: surface the exact Soldier Training prerender exception.
// Do not merge this logging wrapper; the owning fix will be prepared separately.
export function getSoldierTrainingPageData() {
  try {
    return readSoldierTrainingPageData();
  } catch (error) {
    console.error("[soldier-training-prerender-diagnostic]", error);
    throw error;
  }
}
