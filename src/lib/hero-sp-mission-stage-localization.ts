import localization from "../data/hero-sp-mission-stage-localization.json";

type SpStageCondition = {
  kind: string | null;
  activityType?: number | null;
  routeType?: number | null;
  stageId: number | null;
  stageIds: number[];
};

function makeSpMissionStageLocalizationKey(condition: SpStageCondition) {
  if (condition.kind === "CLEAR_ACTIVITY_STAGE_WITH_HEROES") {
    return `${condition.kind}|${condition.activityType ?? "?"}|${condition.stageIds.join(",")}`;
  }
  if (condition.kind === "CLEAR_ACTIVITY_STAGE_SOLO_OR_SPECIFIED") {
    return `${condition.kind}|${condition.activityType ?? "?"}|${condition.stageId ?? "?"}`;
  }
  if (condition.kind === "CLEAR_STORY_STAGE_WITH_HEROES") {
    return `${condition.kind}|${condition.routeType ?? "?"}|${condition.stageId ?? "?"}`;
  }
  return null;
}

const SP_MISSION_STAGE_LABEL_BY_KEY = (() => {
  if (
    localization.schemaId !== "hero-sp-mission-stage-localization/v1" ||
    localization.version !== 1 ||
    localization.recordCount !== localization.records.length
  ) {
    throw new Error("Hero SP mission Stage localization source is not production-ready.");
  }

  const result = new Map<string, string>();
  for (const record of localization.records) {
    const key = makeSpMissionStageLocalizationKey({
      kind: record.kind,
      activityType: "activityType" in record ? record.activityType : null,
      routeType: "routeType" in record ? record.routeType : null,
      stageId: "stageId" in record ? record.stageId : null,
      stageIds: "stageIds" in record ? [...record.stageIds] : [],
    });
    if (!key || result.has(key)) {
      throw new Error(`Hero SP mission Stage localization contains duplicate/invalid key: ${String(key)}`);
    }
    result.set(key, record.labelKr);
  }
  return result;
})();

export function resolveHeroSpMissionStageLabelKr(condition: SpStageCondition) {
  const key = makeSpMissionStageLocalizationKey(condition);
  return key ? (SP_MISSION_STAGE_LABEL_BY_KEY.get(key) ?? null) : null;
}
