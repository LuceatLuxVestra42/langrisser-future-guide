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
  combinations: HeroSpDungeonScheduleEvent[][];
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
  skipMissionKeys: readonly string[] = [],
) {
  let dayOffset = 0;
  const events: HeroSpDungeonScheduleEvent[] = [];
  const skipMissionKeySet = new Set(skipMissionKeys);

  for (const row of flattenScheduledMissions(missions)) {
    if (skipMissionKeySet.has(row.missionKey)) continue;
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
  hourglassCount: 0 | 1 | 2,
): HeroSpHourglassRecommendation {
  const baseline = simulateHeroSpDungeonSchedule(missions, scenario);
  if (hourglassCount === 0 || baseline.events.length === 0) {
    return { savedDays: 0, combinations: [] };
  }

  const candidateCombinations: HeroSpDungeonScheduleEvent[][] = [];
  const events = baseline.events;
  if (hourglassCount === 1) {
    for (const event of events) candidateCombinations.push([event]);
  } else {
    for (let first = 0; first < events.length; first += 1) {
      for (let second = first + 1; second < events.length; second += 1) {
        const firstEvent = events[first];
        const secondEvent = events[second];
        if (firstEvent && secondEvent) candidateCombinations.push([firstEvent, secondEvent]);
      }
    }
  }

  let savedDays = 0;
  const combinations: HeroSpDungeonScheduleEvent[][] = [];

  for (const combination of candidateCombinations) {
    const skipped = simulateHeroSpDungeonSchedule(
      missions,
      scenario,
      combination.map((event) => event.missionKey),
    );
    const candidateSavedDays = baseline.finalDayOffset - skipped.finalDayOffset;
    if (candidateSavedDays > savedDays) {
      savedDays = candidateSavedDays;
      combinations.length = 0;
      combinations.push(combination);
    } else if (candidateSavedDays === savedDays && candidateSavedDays > 0) {
      combinations.push(combination);
    }
  }

  return {
    savedDays,
    combinations,
  };
}
