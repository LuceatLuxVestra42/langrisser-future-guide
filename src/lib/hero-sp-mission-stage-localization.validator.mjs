import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

const localizationPath = "src/lib/hero-sp-mission-stage-localization.v1.json";
const semanticPath = "data/generated/hero-page-stage5-4-sp.v1.json";
const localization = readJson(localizationPath);
const semantic = readJson(semanticPath);

const errors = [];
if (localization.schemaId !== "hero-sp-mission-stage-localization/v1") {
  errors.push("localization schemaId mismatch");
}
if (localization.version !== 1) errors.push("localization version mismatch");
if (localization.semanticSource !== semanticPath) errors.push("semantic source path mismatch");
if (semantic.status !== "COMPLETE") errors.push(`semantic source status is ${semantic.status}`);

function keyFromCondition(condition) {
  if (condition?.kind === "CLEAR_ACTIVITY_STAGE_WITH_HEROES") {
    return `${condition.kind}|${condition.activityType ?? "?"}|${(condition.stageIds ?? []).join(",")}`;
  }
  if (condition?.kind === "CLEAR_ACTIVITY_STAGE_SOLO_OR_SPECIFIED") {
    return `${condition.kind}|${condition.activityType ?? "?"}|${condition.stageId ?? "?"}`;
  }
  if (condition?.kind === "CLEAR_STORY_STAGE_WITH_HEROES") {
    return `${condition.kind}|${condition.routeType ?? "?"}|${condition.stageId ?? "?"}`;
  }
  return null;
}

const labels = new Map();
for (const record of localization.records ?? []) {
  const key = keyFromCondition(record);
  if (!key) errors.push(`invalid localization record ${JSON.stringify(record)}`);
  else if (labels.has(key)) errors.push(`duplicate localization key ${key}`);
  else labels.set(key, record.labelKr);
  if (!/[가-힣]/.test(record.labelKr ?? "")) errors.push(`non-Korean label for ${key}`);
}
if (localization.recordCount !== labels.size) {
  errors.push(`record count mismatch: ${localization.recordCount} != ${labels.size}`);
}

let clearStageMissionCount = 0;
const usedKeys = new Set();
for (const record of semantic.records ?? []) {
  if (record.sp?.status !== "RELEASED") continue;
  const missions = [
    ...(record.sp.missions?.firstStage ?? []),
    ...(record.sp.missions?.secondStage ?? []),
  ];
  for (const mission of missions) {
    if (![5, 74, 81].includes(mission.missionType)) continue;
    clearStageMissionCount += 1;
    const key = keyFromCondition(mission.condition);
    if (!key || !labels.has(key)) {
      errors.push(`Mission ${mission.id} has no Korean Stage label: ${String(key)}`);
      continue;
    }
    usedKeys.add(key);
  }
}

if (clearStageMissionCount !== 125) {
  errors.push(`clear-stage mission count changed: ${clearStageMissionCount} != 125`);
}
if (labels.size !== 30) errors.push(`localization tuple count changed: ${labels.size} != 30`);
for (const key of labels.keys()) {
  if (!usedKeys.has(key)) errors.push(`unused localization key ${key}`);
}

const summary = {
  status: errors.length === 0 ? "PASS" : "FAIL",
  semanticStatus: semantic.status,
  clearStageMissionCount,
  localizationTupleCount: labels.size,
  usedLocalizationTupleCount: usedKeys.size,
  hardErrorCount: errors.length,
  hardErrors: errors,
};
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
