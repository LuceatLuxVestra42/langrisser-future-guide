import { readSoldierTrainingPageData } from "./soldier-training-page.server";

// GitHub Pages static build: consume only frozen TrainingTech extraction artifacts
// plus the validated Soldier training-material presentation source.
export function getSoldierTrainingPageData() {
  return readSoldierTrainingPageData();
}
