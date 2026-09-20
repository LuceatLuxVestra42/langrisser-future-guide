import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

const schedulePath = "src/data/hero-sp-mission-dungeon-schedule.json";
const semanticPath = "data/generated/hero-page-stage5-4-sp.v1.json";
const schedule = readJson(schedulePath);
const semantic = readJson(semanticPath);
const errors = [];

function keyFromCondition(condition) {
  if (condition?.kind === "CLEAR_ACTIVITY_STAGE_WITH_HEROES") {
    return `${condition.kind}|${condition.activityType ?? "?"}|${(condition.stageIds ?? []).join(",")}`;
  }
  if (condition?.kind === "CLEAR_ACTIVITY_STAGE_SOLO_OR_SPECIFIED") {
    return `${condition.kind}|${condition.activityType ?? "?"}|${condition.stageId ?? "?"}`;
  }
  return null;
}

if (schedule.schemaId !== "hero-sp-mission-dungeon-schedule/v1") {
  errors.push("schedule schemaId mismatch");
}
if (schedule.version !== 1) errors.push("schedule version mismatch");
if (schedule.semanticMissionSource !== semanticPath) {
  errors.push("schedule semantic source path mismatch");
}
if (schedule.startWeekday !== "WED") {
  errors.push("schedule start weekday must remain WED");
}
if (semantic.status !== "COMPLETE") {
  errors.push(`semantic source status is ${semantic.status}`);
}

const validWeekdays = new Set(["WED", "THU", "FRI", "SAT", "SUN", "MON", "TUE"]);
const validGroups = new Set(["ANIKI", "GODDESS", "TEMPLE"]);
const scheduleKeys = new Set();

for (const record of schedule.records ?? []) {
  const key = keyFromCondition(record);
  if (!key) {
    errors.push(`invalid schedule record ${JSON.stringify(record)}`);
    continue;
  }
  if (scheduleKeys.has(key)) errors.push(`duplicate schedule key ${key}`);
  scheduleKeys.add(key);

  if (!validGroups.has(record.dungeonGroup)) {
    errors.push(`invalid dungeon group for ${key}: ${record.dungeonGroup}`);
  }
  if (!record.dungeonKey) errors.push(`missing dungeonKey for ${key}`);
  if (!/[가-힣]/.test(record.labelKr ?? "")) {
    errors.push(`missing Korean display label for ${key}`);
  }
  if (!Array.isArray(record.openWeekdays) || record.openWeekdays.length === 0) {
    errors.push(`missing open weekdays for ${key}`);
  } else {
    const seen = new Set();
    for (const weekday of record.openWeekdays) {
      if (!validWeekdays.has(weekday)) errors.push(`invalid weekday ${weekday} for ${key}`);
      if (seen.has(weekday)) errors.push(`duplicate weekday ${weekday} for ${key}`);
      seen.add(weekday);
    }
  }
}

if (scheduleKeys.size !== 25) {
  errors.push(`schedule tuple count changed: ${scheduleKeys.size} != 25`);
}

const requiredKeys = new Set();
let scheduledMissionCount = 0;
for (const record of semantic.records ?? []) {
  if (record.sp?.status !== "RELEASED") continue;
  const missions = [
    ...(record.sp.missions?.firstStage ?? []),
    ...(record.sp.missions?.secondStage ?? []),
  ];
  for (const mission of missions) {
    if (![3, 4, 22].includes(mission.condition?.activityType)) continue;
    scheduledMissionCount += 1;
    const key = keyFromCondition(mission.condition);
    if (!key) {
      errors.push(`Mission ${mission.id} has an invalid weekly-schedule tuple`);
      continue;
    }
    requiredKeys.add(key);
    if (!scheduleKeys.has(key)) {
      errors.push(`Mission ${mission.id} has no weekly schedule: ${key}`);
    }
  }
}

for (const key of scheduleKeys) {
  if (!requiredKeys.has(key)) errors.push(`unused weekly schedule key ${key}`);
}

const summary = {
  status: errors.length === 0 ? "PASS" : "FAIL",
  semanticStatus: semantic.status,
  scheduleTupleCount: scheduleKeys.size,
  requiredScheduleTupleCount: requiredKeys.size,
  scheduledMissionCount,
  hardErrorCount: errors.length,
  hardErrors: errors,
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
