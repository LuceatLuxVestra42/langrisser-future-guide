import { readSoldierTrainingPageData } from "./soldier-training-page.server";

// GitHub Pages static build: consume frozen TrainingTech/material semantic artifacts
// plus only the Stage E-admitted Soldier Training Korean presentation components.
export function getSoldierTrainingPageData() {
  return readSoldierTrainingPageData();
}
