export type HeroDetailSourceStatus = "verified" | "partial" | "pending";

export type HeroIdentity = {
  heroId: number;
  nameKr: string;
  nameCn: string;
  nameEn: string;
  rarity?: string;
  cv?: string;
  factions: string[];
  origin?: string;
};

export type HeroSkill = {
  id: number;
  name?: string;
  nameSource?: "kr" | "cn";
  unlockGroup: "tier1" | "tier2" | "sp" | "awakening";
  description?: string;
  status: HeroDetailSourceStatus;
  sourceTable: string;
};

export type HeroMissionMaterial = {
  nameCn: string;
  quantity: number;
  verification: "configdata" | "external-crosscheck";
  confidence?: number;
};

export type HeroSpMission = {
  id: number;
  chapter: 1 | 2;
  kind: "material" | "battle" | "equipment" | "runestone" | "completion" | "unknown";
  titleCn?: string;
  summary: string;
  status: HeroDetailSourceStatus;
  sourceTable: "ConfigDataMissionInfo";
  sourceParam?: string;
  materials?: HeroMissionMaterial[];
  materialSource?: string;
};

export type HeroDetailMode = {
  talent?: {
    name?: string;
    description?: string;
    status: HeroDetailSourceStatus;
  };
  stats?: Record<string, number>;
  bonds: string[];
  exclusiveEquipment?: string;
  covenant?: string;
  soldiers: number[];
  jobs: string[];
  skills: HeroSkill[];
};

export type HeroSpDetail = HeroDetailMode & {
  exists: true;
  missions: HeroSpMission[];
  sourceItemIds: number[];
};

export type HeroDetail = {
  identity: HeroIdentity;
  artwork: {
    illustrations: string[];
    status: HeroDetailSourceStatus;
  };
  normal: HeroDetailMode;
  sp?: HeroSpDetail;
  dataStatus: HeroDetailSourceStatus;
  sourceTables: string[];
  notes: string[];
};

/**
 * Hero-detail normalized data.
 *
 * The repository's ConfigData*.json files are Unity TextAsset byte wrappers,
 * so the browser does not parse those protobuf bytes directly. This module is
 * the typed boundary for values extracted from the ConfigData tables. Values
 * that have not been verified are deliberately left empty instead of guessed.
 */
const leon: HeroDetail = {
  identity: {
    heroId: 6,
    nameKr: "레온",
    nameCn: "利昂",
    nameEn: "Leon",
    factions: [],
  },
  artwork: {
    illustrations: [],
    status: "pending",
  },
  normal: {
    bonds: [],
    soldiers: [],
    jobs: [],
    skills: [
      {
        id: 10301,
        name: "突击",
        nameSource: "cn",
        unlockGroup: "tier1",
        status: "verified",
        sourceTable: "ConfigDataHeroInfo → ConfigDataSkillInfo",
      },
    ],
    covenant: "骑士楷模",
  },
  sp: {
    exists: true,
    bonds: [],
    soldiers: [],
    jobs: [],
    skills: [
      {
        id: 12527,
        name: "冥火碎踏",
        nameSource: "cn",
        unlockGroup: "sp",
        status: "verified",
        sourceTable: "ConfigDataSPHeroInfo → ConfigDataSkillInfo",
      },
      {
        id: 12528,
        name: "青龙的真魂",
        nameSource: "cn",
        unlockGroup: "sp",
        status: "verified",
        sourceTable: "ConfigDataSPHeroInfo → ConfigDataSkillInfo",
      },
    ],
    missions: [
      { id: 31183, chapter: 1, kind: "material", summary: "재료 제출", status: "partial", sourceTable: "ConfigDataMissionInfo", sourceParam: "MissionType 73 / Param1 80" },
      { id: 31184, chapter: 1, kind: "battle", summary: "레온 포함 안톤 Lv60+", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      { id: 31185, chapter: 1, kind: "material", summary: "재료 제출", status: "partial", sourceTable: "ConfigDataMissionInfo", sourceParam: "MissionType 73 / Param1 81" },
      { id: 31186, chapter: 1, kind: "equipment", summary: "레온 전용장비 Lv50", status: "verified", sourceTable: "ConfigDataMissionInfo", sourceParam: "MissionType 77 / Param1 416 / Param2 50" },
      { id: 31187, chapter: 1, kind: "runestone", summary: "룬스톤 제출", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      { id: 31188, chapter: 1, kind: "battle", summary: "레온 포함 화룡 Lv60+", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      { id: 31189, chapter: 1, kind: "completion", summary: "1부 완료", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      {
        id: 31190,
        chapter: 2,
        kind: "material",
        titleCn: "女神之启",
        summary: "SP 2부 재료 제출",
        status: "partial",
        sourceTable: "ConfigDataMissionInfo",
        sourceParam: "MissionType 73 / Param1 83 → ConfigDataMissionSumitItemInfo.ID 83",
        materialSource: "Bilibili 현행 영웅 페이지 + 레온 SP 전체 패키지(StaticBox 316) 교차검증",
        materials: [
          { nameCn: "闪耀心灵之钥", quantity: 40, verification: "external-crosscheck", confidence: 99 },
          { nameCn: "超然之心", quantity: 12, verification: "external-crosscheck", confidence: 99 },
          { nameCn: "灵魂之砂", quantity: 30, verification: "external-crosscheck", confidence: 99 },
          { nameCn: "源铸之砂", quantity: 60, verification: "external-crosscheck", confidence: 99 },
        ],
      },
      { id: 31191, chapter: 2, kind: "battle", titleCn: "挥汗的同途", summary: "레온 포함 바란 Lv65 이상 클리어", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      {
        id: 31192,
        chapter: 2,
        kind: "material",
        titleCn: "碎裂的甲胄",
        summary: "SP 2부 재료 제출",
        status: "partial",
        sourceTable: "ConfigDataMissionInfo",
        sourceParam: "MissionType 73 / Param1 84 → ConfigDataMissionSumitItemInfo.ID 84",
        materialSource: "Bilibili 현행 영웅 페이지 + 레온 SP 전체 패키지(StaticBox 316) 교차검증",
        materials: [
          { nameCn: "统帅之证", quantity: 40, verification: "external-crosscheck", confidence: 99 },
          { nameCn: "永耀月华", quantity: 5, verification: "external-crosscheck", confidence: 99 },
          { nameCn: "璀璨星尘", quantity: 5, verification: "external-crosscheck", confidence: 99 },
        ],
      },
      { id: 31193, chapter: 2, kind: "battle", titleCn: "光暗之争", summary: "레온 포함 암룡 티아마트 Lv65 이상 클리어", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      {
        id: 31194,
        chapter: 2,
        kind: "material",
        titleCn: "斩断的回忆",
        summary: "SP 2부 재료 제출",
        status: "partial",
        sourceTable: "ConfigDataMissionInfo",
        sourceParam: "MissionType 73 / Param1 85 → ConfigDataMissionSumitItemInfo.ID 85",
        materialSource: "Bilibili 현행 영웅 페이지 + 레온 SP 전체 패키지(StaticBox 316) 교차검증",
        materials: [
          { nameCn: "记忆精华", quantity: 600, verification: "external-crosscheck", confidence: 99 },
          { nameCn: "骑手：特级攻击", quantity: 5, verification: "external-crosscheck", confidence: 99 },
          { nameCn: "骑手：特级生命", quantity: 5, verification: "external-crosscheck", confidence: 99 },
          { nameCn: "骑手：特级技巧", quantity: 5, verification: "external-crosscheck", confidence: 99 },
        ],
      },
      { id: 31195, chapter: 2, kind: "battle", titleCn: "极武的双刃", summary: "레온 포함 발키리 Lv65 이상 클리어", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      { id: 31196, chapter: 2, kind: "completion", titleCn: "湮黯的青龙", summary: "SP 2부 완료", status: "verified", sourceTable: "ConfigDataMissionInfo" },
    ],
    sourceItemIds: [2023, 2029, 7402],
  },
  dataStatus: "partial",
  sourceTables: [
    "ConfigDataHeroInfo",
    "ConfigDataSkillInfo",
    "ConfigDataSPHeroInfo",
    "ConfigDataMissionExtSPHeroInfo",
    "ConfigDataMissionInfo",
    "ConfigDataMissionSumitItemInfo",
    "ConfigDataItemInfo",
    "ConfigDataStaticBoxInfo",
  ],
  notes: [
    "Hero ID 6 / 利昂 / Leon은 ConfigData에서 직접 확인된 식별값이다.",
    "SP 미션 31183~31196은 실제 MissionInfo 조건을 기준으로 정규화했다.",
    "MissionType 73의 Param1은 ConfigDataMissionSumitItemInfo.ID로 이어지고 Items에 제출 재료가 저장되는 구조다.",
    "2부 MissionType 73(83~85)의 재료명·수량은 Bilibili 현행 화면과 StaticBox 316 전체 비용을 교차검증해 표시한다. 저장소의 MissionSumitItemInfo TextAsset에는 m_bytes가 없어 원시 레코드 직접 검증 전까지 mission.status는 partial로 유지한다.",
    "표시용 한국어 스킬명·직업명·스탯 필드 의미가 확정되지 않은 값은 채우지 않는다.",
  ],
};

const heroDetails = new Map<number, HeroDetail>([[leon.identity.heroId, leon]]);

export function getHeroDetail(heroId: number): HeroDetail | undefined {
  return heroDetails.get(heroId);
}
