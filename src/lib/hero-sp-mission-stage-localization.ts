type SpStageCondition = {
  kind: string | null;
  activityType?: number | null;
  routeType?: number | null;
  stageId: number | null;
  stageIds: number[];
};

type SpMissionStageLocalizationRecord = {
  kind: string;
  activityType?: number;
  routeType?: number;
  stageId?: number;
  stageIds?: number[];
  labelKr: string;
};

// Presentation-only lookup. Every key is an exact tuple already frozen in
// data/generated/hero-page-stage5-4-sp.v1.json; this does not create Stage identity or relations.
const SP_MISSION_STAGE_LOCALIZATION: readonly SpMissionStageLocalizationRecord[] = [
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[50,51,52,53],"labelKr":"형귀 헬스장 - 바란 Lv60 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[51,52,53],"labelKr":"형귀 헬스장 - 바란 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[30,31,32,33],"labelKr":"형귀 헬스장 - 존스 Lv60 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[31,32,33],"labelKr":"형귀 헬스장 - 존스 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[110,111,112,113],"labelKr":"형귀 헬스장 - 나임 Lv60 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[111,112,113],"labelKr":"형귀 헬스장 - 나임 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[10,11,12,13],"labelKr":"형귀 헬스장 - 아돈 Lv60 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[11,12,13],"labelKr":"형귀 헬스장 - 아돈 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[70,71,72,73],"labelKr":"형귀 헬스장 - 로키 Lv60 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[71,72,73],"labelKr":"형귀 헬스장 - 로키 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[90,91,92,93],"labelKr":"형귀 헬스장 - 샘슨 Lv60 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":4,"stageIds":[91,92,93],"labelKr":"형귀 헬스장 - 샘슨 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_SOLO_OR_SPECIFIED","activityType":4,"stageId":92,"labelKr":"형귀 헬스장 - 샘슨 Lv70"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":3,"stageIds":[9,10,100,101],"labelKr":"여신의 시련 - 화룡 파프니르 Lv60 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":3,"stageIds":[10,100,101],"labelKr":"여신의 시련 - 화룡 파프니르 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":3,"stageIds":[19,20,200,201],"labelKr":"여신의 시련 - 빙룡 아산테 Lv60 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":3,"stageIds":[20,200,201],"labelKr":"여신의 시련 - 빙룡 아산테 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":3,"stageIds":[29,30,300,301],"labelKr":"여신의 시련 - 뇌룡 카르코사 Lv60 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":3,"stageIds":[30,300,301],"labelKr":"여신의 시련 - 뇌룡 카르코사 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":3,"stageIds":[39,40,400,401],"labelKr":"여신의 시련 - 암룡 티아메트 Lv60 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":3,"stageIds":[40,400,401],"labelKr":"여신의 시련 - 암룡 티아메트 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":22,"stageIds":[3,4],"labelKr":"영겁의 신전 - 발키리 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":22,"stageIds":[13,14],"labelKr":"영겁의 신전 - 리바이엘 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":22,"stageIds":[23,24],"labelKr":"영겁의 신전 - 스킬라 Lv65 이상"},
  {"kind":"CLEAR_ACTIVITY_STAGE_WITH_HEROES","activityType":22,"stageIds":[33,34],"labelKr":"영겁의 신전 - 피닉스 Lv65 이상"},
  {"kind":"CLEAR_STORY_STAGE_WITH_HEROES","routeType":28,"stageId":3,"labelKr":"IF 스테이지 - 대륙 최강의 기사"},
  {"kind":"CLEAR_STORY_STAGE_WITH_HEROES","routeType":2,"stageId":6203,"labelKr":"시공의 균열 정예 12-2"},
  {"kind":"CLEAR_STORY_STAGE_WITH_HEROES","routeType":2,"stageId":1211,"labelKr":"시공의 균열 12-5"},
  {"kind":"CLEAR_STORY_STAGE_WITH_HEROES","routeType":2,"stageId":6216,"labelKr":"시공의 균열 정예 12-7"},
  {"kind":"CLEAR_STORY_STAGE_WITH_HEROES","routeType":7,"stageId":73,"labelKr":"메인 스토리 2부 11장"}
];

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
  const result = new Map<string, string>();
  for (const record of SP_MISSION_STAGE_LOCALIZATION) {
    const key = makeSpMissionStageLocalizationKey({
      kind: record.kind,
      activityType: record.activityType ?? null,
      routeType: record.routeType ?? null,
      stageId: record.stageId ?? null,
      stageIds: record.stageIds ? [...record.stageIds] : [],
    });
    if (!key || result.has(key)) {
      throw new Error(`Hero SP mission Stage localization contains duplicate/invalid key: ${String(key)}`);
    }
    result.set(key, record.labelKr);
  }
  if (result.size !== 30) {
    throw new Error(`Hero SP mission Stage localization tuple count mismatch: ${result.size}`);
  }
  return result;
})();

export function resolveHeroSpMissionStageLabelKr(condition: SpStageCondition) {
  const key = makeSpMissionStageLocalizationKey(condition);
  return key ? (SP_MISSION_STAGE_LABEL_BY_KEY.get(key) ?? null) : null;
}
