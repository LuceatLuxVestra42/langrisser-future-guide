import soldierSpMissionKrJson from "../../data/presentation/soldier-sp-mission-desc-kr.v1.json";

type MissionParamTupleCounts = Record<string, number>;

type SoldierSpMissionPresentationSource = {
  version: number;
  schemaId: string;
  status: string;
  scope: string;
  source: {
    kind: string;
    spreadsheetId: string;
    tabs: string[];
    mappingMethod: string;
    canonicalMutation: boolean;
    missionTitleMutation: boolean;
    missionType73Mutation: boolean;
  };
  coverage: {
    localizedDescriptionCount: number;
    missionType123Count: number;
    missionType124Count: number;
    missionType73LocalizedCount: number;
    missionTitleLocalizedCount: number;
    paramTuples: Record<string, MissionParamTupleCounts>;
  };
  templates: Record<string, string>;
};

export type SoldierSpMissionPresentationInput = {
  missionId: number;
  title: string;
  desc: string;
  missionType: number;
  param1: number;
  param2: number;
};

const source = soldierSpMissionKrJson as unknown as SoldierSpMissionPresentationSource;
const CJK_IDEOGRAPH_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff]/u;

function fail(message: string): never {
  throw new Error(`Soldier SP mission Korean presentation: ${message}`);
}

function assertTupleCounts(actual: MissionParamTupleCounts | undefined, expected: MissionParamTupleCounts) {
  if (!actual) fail("missing mission parameter tuple coverage.");

  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.join("|") !== expectedKeys.join("|")) {
    fail(`parameter tuple keys mismatch: ${actualKeys.join(",")}.`);
  }

  for (const [key, count] of Object.entries(expected)) {
    if (actual[key] !== count) {
      fail(`parameter tuple ${key} must have count ${count}; got ${actual[key] ?? "missing"}.`);
    }
  }
}

function assertPresentationSourceContract() {
  if (
    source.version !== 1 ||
    source.schemaId !== "soldier-sp-mission-desc-kr-presentation/v1" ||
    source.status !== "PASS" ||
    source.scope !== "frontend-presentation-only"
  ) {
    fail("source contract mismatch.");
  }

  if (
    source.source.kind !== "google-spreadsheet-localization-evidence" ||
    source.source.spreadsheetId !== "1Oa7afFUhP21SRLSJ0uzP9oUc5C1_Cij0JqRExzUJGFo" ||
    source.source.canonicalMutation !== false ||
    source.source.missionTitleMutation !== false ||
    source.source.missionType73Mutation !== false
  ) {
    fail("source provenance or non-mutation policy mismatch.");
  }

  const expectedMappingMethod =
    "Apply the spreadsheet-confirmed Korean wording by canonical missionType + param1 + param2. No sheet-row binding, name JOIN, ID arithmetic, screen order, or semantic recomputation.";
  if (source.source.mappingMethod !== expectedMappingMethod) {
    fail("mapping policy mismatch.");
  }

  if (
    source.source.tabs.length !== 2 ||
    source.source.tabs[0] !== "출시 SP용병" ||
    source.source.tabs[1] !== "SP용병"
  ) {
    fail("spreadsheet tab provenance mismatch.");
  }

  if (
    source.coverage.localizedDescriptionCount !== 101 ||
    source.coverage.missionType123Count !== 56 ||
    source.coverage.missionType124Count !== 45 ||
    source.coverage.missionType73LocalizedCount !== 0 ||
    source.coverage.missionTitleLocalizedCount !== 0
  ) {
    fail("coverage contract mismatch.");
  }

  assertTupleCounts(source.coverage.paramTuples["123"], {
    "2:70": 4,
    "3:70": 4,
    "5:70": 48,
  });
  assertTupleCounts(source.coverage.paramTuples["124"], {
    "2:10": 41,
    "3:10": 4,
  });

  if (
    source.templates["123"] !== "기존에 이 용병을 쓰는 영웅 중 {param1}명 {param2}레벨" ||
    source.templates["124"] !== "추가 사용 가능 영웅 중에서 {param1}명의 중앙유대 {param2}레벨"
  ) {
    fail("Korean template mismatch.");
  }
}

function resolveTemplate(mission: SoldierSpMissionPresentationInput) {
  const template = source.templates[String(mission.missionType)];
  if (!template) return mission.desc;

  const tupleKey = `${mission.param1}:${mission.param2}`;
  if (!source.coverage.paramTuples[String(mission.missionType)]?.[tupleKey]) {
    fail(
      `mission ${mission.missionId} has unsupported missionType/param tuple ` +
        `${mission.missionType}/${tupleKey}.`,
    );
  }

  const localized = template
    .replace("{param1}", String(mission.param1))
    .replace("{param2}", String(mission.param2));

  if (!localized.trim() || CJK_IDEOGRAPH_PATTERN.test(localized)) {
    fail(`mission ${mission.missionId} produced an invalid Korean description.`);
  }

  return localized;
}

assertPresentationSourceContract();

export function resolveSoldierSpMissionDescKo(mission: SoldierSpMissionPresentationInput) {
  if (mission.missionType !== 123 && mission.missionType !== 124) {
    return mission.desc;
  }
  return resolveTemplate(mission);
}
