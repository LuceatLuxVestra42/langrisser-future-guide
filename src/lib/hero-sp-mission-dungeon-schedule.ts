import scheduleData from "@/data/hero-sp-mission-dungeon-schedule.json";

export type HeroSpDungeonScenario =
  | "ANIKI_ALL"
  | "GODDESS_ALL"
  | "BOTH_ALL"
  | "NORMAL";

export type HeroSpDungeonWeekday =
  | "WED"
  | "THU"
  | "FRI"
  | "SAT"
  | "SUN"
  | "MON"
  | "TUE";

export const HERO_SP_DUNGEON_WEEKDAY_LABEL: Record<HeroSpDungeonWeekday, string> = {
  WED: "수요일",
  THU: "목요일",
  FRI: "금요일",
  SAT: "토요일",
  SUN: "일요일",
  MON: "월요일",
  TUE: "화요일",
};

type HeroSpDungeonGroup = "ANIKI" | "GODDESS" | "TEMPLE";

type HeroSpScheduleCondition = {
  kind: string | null;
  activityType: number | null;
  stageId: number | null;
  stageIds: number[];
};

type HeroSpScheduleMission = {
  missionId: number | null;
  condition: HeroSpScheduleCondition;
};

type HeroSpSchedulePhases = {
  firstStage: HeroSpScheduleMission[];
  secondStage: HeroSpScheduleMission[];
};

type RawScheduleRecord = {
  kind: string;
  activityType: number;
  stageId?: number;
  stageIds?: number[];
  dungeonGroup: HeroSpDungeonGroup;
  dungeonKey: string;
  labelKr: string;
  openWeekdays: HeroSpDungeonWeekday[];
};

export type HeroSpDungeonScheduleEntry = {
  dungeonGroup: HeroSpDungeonGroup;
  dungeonKey: string;
  labelKr: string;
  openWeekdays: HeroSpDungeonWeekday[];
};

export type HeroSpDungeonScheduleEvent = HeroSpDungeonScheduleEntry & {
  missionKey: string;
  missionId: number | null;
  phase: "1차 전직" | "2차 전직";
  step: number;
  dayOffset: number;
  weekday: HeroSpDungeonWeekday;
  waitDays: number;
};

export type HeroSpHourglassRecommendation = {
  savedDays: number;
  candidates: HeroSpDungeonScheduleEvent[];
};

const WEEKDAY_ORDER = scheduleData.weekdayOrder as HeroSpDungeonWeekday[];

function makeScheduleKey(condition: HeroSpScheduleCondition) {
  if (condition.kind === "CLEAR_ACTIVITY_STAGE_WITH_HEROES") {
    return `${condition.kind}|${condition.activityType ?? "?"}|${condition.stageIds.join(",")}`;
  }
  if (condition.kind === "CLEAR_ACTIVITY_STAGE_SOLO_OR_SPECIFIED") {
    return `${condition.kind}|${condition.activityType ?? "?"}|${condition.stageId ?? "?"}`;
  }
  return null;
}

const SCHEDULE_BY_KEY = (() => {
  const result = new Map<string, HeroSpDungeonScheduleEntry>();
  for (const rawRecord of scheduleData.records as RawScheduleRecord[]) {
    const key = rawRecord.stageIds
      ? `${rawRecord.kind}|${rawRecord.activityType}|${rawRecord.stageIds.join(",")}`
      : `${rawRecord.kind}|${rawRecord.activityType}|${rawRecord.stageId ?? "?"}`;
    if (result.has(key)) {
      throw new Error(`Hero SP dungeon schedule duplicate key: ${key}`);
    }
    result.set(key, {
      dungeonGroup: rawRecord.dungeonGroup,
      dungeonKey: rawRecord.dungeonKey,
      labelKr: rawRecord.labelKr,
      openWeekdays: [...rawRecord.openWeekdays],
    });
  }
  if (result.size !== 25) {
    throw new Error(`Hero SP dungeon schedule tuple count mismatch: ${result.size}`);
  }
  return result;
})();

export function resolveHeroSpDungeonSchedule(
  condition: HeroSpScheduleCondition,
): HeroSpDungeonScheduleEntry | null {
  const key = makeScheduleKey(condition);
  return key ? (SCHEDULE_BY_KEY.get(key) ?? null) : null;
}

function isAlwaysOpenForScenario(
  group: HeroSpDungeonGroup,
  scenario: HeroSpDungeonScenario,
) {
  if (group === "ANIKI") {
    return scenario === "ANIKI_ALL" || scenario === "BOTH_ALL";
  }
  if (group === "GODDESS") {
    return scenario === "GODDESS_ALL" || scenario === "BOTH_ALL";
  }
  return false;
}

function weekdayAt(dayOffset: number) {
  return WEEKDAY_ORDER[dayOffset % WEEKDAY_ORDER.length] ?? "WED";
}

function waitUntilOpen(
  dayOffset: number,
  entry: HeroSpDungeonScheduleEntry,
  scenario: HeroSpDungeonScenario,
) {
  if (isAlwaysOpenForScenario(entry.dungeonGroup, scenario)) return 0;
  for (let waitDays = 0; waitDays < WEEKDAY_ORDER.length; waitDays += 1) {
    if (entry.openWeekdays.includes(weekdayAt(dayOffset + waitDays))) return waitDays;
  }
  throw new Error(`Hero SP dungeon schedule has no opening weekday: ${entry.dungeonKey}`);
}

function flattenScheduledMissions(missions: HeroSpSchedulePhases) {
  return [
    ...missions.firstStage.map((mission, index) => ({
      mission,
      phase: "1차 전직" as const,
      step: index + 1,
      missionKey: `first:${index}:${mission.missionId ?? "unknown"}`,
    })),
    ...missions.secondStage.map((mission, index) => ({
      mission,
      phase: "2차 전직" as const,
      step: index + 1,
      missionKey: `second:${index}:${mission.missionId ?? "unknown"}`,
    })),
  ].flatMap((row) => {
    const schedule = resolveHeroSpDungeonSchedule(row.mission.condition);
    return schedule ? [{ ...row, schedule }] : [];
  });
}

export function simulateHeroSpDungeonSchedule(
  missions: HeroSpSchedulePhases,
  scenario: HeroSpDungeonScenario,
  skipMissionKey: string | null = null,
) {
  let dayOffset = 0;
  const events: HeroSpDungeonScheduleEvent[] = [];

  for (const row of flattenScheduledMissions(missions)) {
    if (row.missionKey === skipMissionKey) continue;
    const waitDays = waitUntilOpen(dayOffset, row.schedule, scenario);
    dayOffset += waitDays;
    events.push({
      ...row.schedule,
      missionKey: row.missionKey,
      missionId: row.mission.missionId,
      phase: row.phase,
      step: row.step,
      dayOffset,
      weekday: weekdayAt(dayOffset),
      waitDays,
    });
  }

  return {
    finalDayOffset: dayOffset,
    events,
  };
}

export function recommendHeroSpHourglass(
  missions: HeroSpSchedulePhases,
  scenario: HeroSpDungeonScenario,
): HeroSpHourglassRecommendation {
  const baseline = simulateHeroSpDungeonSchedule(missions, scenario);
  let savedDays = 0;
  const candidateKeys: string[] = [];

  for (const event of baseline.events) {
    const skipped = simulateHeroSpDungeonSchedule(missions, scenario, event.missionKey);
    const candidateSavedDays = baseline.finalDayOffset - skipped.finalDayOffset;
    if (candidateSavedDays > savedDays) {
      savedDays = candidateSavedDays;
      candidateKeys.length = 0;
      candidateKeys.push(event.missionKey);
    } else if (candidateSavedDays === savedDays && candidateSavedDays > 0) {
      candidateKeys.push(event.missionKey);
    }
  }

  const candidateKeySet = new Set(candidateKeys);
  return {
    savedDays,
    candidates: baseline.events.filter((event) => candidateKeySet.has(event.missionKey)),
  };
}
