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
  goodsType: number;
  goodsId?: number;
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
      {
        id: 31183,
        chapter: 1,
        kind: "material",
        summary: "SP 1부 재료 제출",
        status: "verified",
        sourceTable: "ConfigDataMissionInfo",
        sourceParam: "MissionType 73 / Param1 80 → ConfigDataMissionSumitItemInfo.ID 80",
        materialSource: "ConfigDataMissionSumitItemInfo.ID 80 원시 Goods[] 직접 검증",
        materials: [
          { nameCn: "형귀 컨트롤러", quantity: 40, goodsType: 24, verification: "configdata" },
          { nameCn: "荣耀之印", quantity: 30, goodsType: 5, goodsId: 38, verification: "configdata" },
          { nameCn: "统帅之证", quantity: 40, goodsType: 5, goodsId: 31, verification: "configdata" },
          { nameCn: "公正纹章", quantity: 50, goodsType: 5, goodsId: 22, verification: "configdata" },
        ],
      },
      { id: 31184, chapter: 1, kind: "battle", summary: "레온 포함 안톤 Lv60+", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      {
        id: 31185,
        chapter: 1,
        kind: "material",
        summary: "SP 1부 재료 제출",
        status: "verified",
        sourceTable: "ConfigDataMissionInfo",
        sourceParam: "MissionType 73 / Param1 81 → ConfigDataMissionSumitItemInfo.ID 81",
        materialSource: "ConfigDataMissionSumitItemInfo.ID 81 원시 Goods[] 직접 검증",
        materials: [
          { nameCn: "형귀 컨트롤러", quantity: 40, goodsType: 24, verification: "configdata" },
          { nameCn: "华彩心灵之钥", quantity: 30, goodsType: 6, goodsId: 3331, verification: "configdata" },
          { nameCn: "闪耀心灵之钥", quantity: 40, goodsType: 6, goodsId: 3330, verification: "configdata" },
          { nameCn: "纯净心灵之钥", quantity: 50, goodsType: 6, goodsId: 3329, verification: "configdata" },
        ],
      },
      { id: 31186, chapter: 1, kind: "equipment", summary: "레온 전용장비 Lv50", status: "verified", sourceTable: "ConfigDataMissionInfo", sourceParam: "MissionType 77 / Param1 416 / Param2 50" },
      {
        id: 31187,
        chapter: 1,
        kind: "runestone",
        summary: "룬스톤 제출",
        status: "verified",
        sourceTable: "ConfigDataMissionInfo",
        sourceParam: "MissionType 73 / Param1 82 → ConfigDataMissionSumitItemInfo.ID 82",
        materialSource: "ConfigDataMissionSumitItemInfo.ID 82 원시 Goods[] 직접 검증",
        materials: [
          { nameCn: "형귀 컨트롤러", quantity: 40, goodsType: 24, verification: "configdata" },
          { nameCn: "魔导石", quantity: 2, goodsType: 6, goodsId: 3137, verification: "configdata" },
        ],
      },
      { id: 31188, chapter: 1, kind: "battle", summary: "레온 포함 화룡 Lv60+", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      { id: 31189, chapter: 1, kind: "completion", summary: "1부 완료", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      {
        id: 31190,
        chapter: 2,
        kind: "material",
        titleCn: "女神之启",
        summary: "SP 2부 재료 제출",
        status: "verified",
        sourceTable: "ConfigDataMissionInfo",
        sourceParam: "MissionType 73 / Param1 83 → ConfigDataMissionSumitItemInfo.ID 83",
        materialSource: "ConfigDataMissionSumitItemInfo.ID 83 원시 Goods[] 직접 검증",
        materials: [
          { nameCn: "형귀 컨트롤러", quantity: 40, goodsType: 24, verification: "configdata" },
          { nameCn: "超然之心", quantity: 12, goodsType: 6, goodsId: 3374, verification: "configdata" },
          { nameCn: "灵魂之砂", quantity: 30, goodsType: 6, goodsId: 3369, verification: "configdata" },
          { nameCn: "源铸之砂", quantity: 60, goodsType: 6, goodsId: 3365, verification: "configdata" },
        ],
      },
      { id: 31191, chapter: 2, kind: "battle", titleCn: "挥汗的同途", summary: "레온 포함 바란 Lv65 이상 클리어", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      {
        id: 31192,
        chapter: 2,
        kind: "material",
        titleCn: "碎裂的甲胄",
        summary: "SP 2부 재료 제출",
        status: "verified",
        sourceTable: "ConfigDataMissionInfo",
        sourceParam: "MissionType 73 / Param1 84 → ConfigDataMissionSumitItemInfo.ID 84",
        materialSource: "ConfigDataMissionSumitItemInfo.ID 84 원시 Goods[] 직접 검증",
        materials: [
          { nameCn: "형귀 컨트롤러", quantity: 40, goodsType: 24, verification: "configdata" },
          { nameCn: "永耀月华", quantity: 5, goodsType: 6, goodsId: 3388, verification: "configdata" },
          { nameCn: "璀璨星尘", quantity: 5, goodsType: 6, goodsId: 3381, verification: "configdata" },
        ],
      },
      { id: 31193, chapter: 2, kind: "battle", titleCn: "光暗之争", summary: "레온 포함 암룡 티아마트 Lv65 이상 클리어", status: "verified", sourceTable: "ConfigDataMissionInfo" },
      {
        id: 31194,
        chapter: 2,
        kind: "material",
        titleCn: "斩断的回忆",
        summary: "SP 2부 재료 제출",
        status: "verified",
        sourceTable: "ConfigDataMissionInfo",
        sourceParam: "MissionType 73 / Param1 85 → ConfigDataMissionSumitItemInfo.ID 85",
        materialSource: "ConfigDataMissionSumitItemInfo.ID 85 원시 Goods[] 직접 검증",
        materials: [
          { nameCn: "记忆精华", quantity: 600, goodsType: 20, verification: "configdata" },
          { nameCn: "骑手：特级攻击", quantity: 5, goodsType: 27, goodsId: 312, verification: "configdata" },
          { nameCn: "骑手：特级生命", quantity: 5, goodsType: 27, goodsId: 311, verification: "configdata" },
          { nameCn: "骑手：特级技巧", quantity: 5, goodsType: 27, goodsId: 316, verification: "configdata" },
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
    "복구된 ConfigDataMissionSumitItemInfo의 원시 m_bytes에서 레온 전용 ID 80~85의 GoodsType / GoodsId / quantity를 직접 검증했다.",
    "직접 검증 결과 기존 교차검증 표시를 정정했다: 31190의 ×40 재료는 闪耀心灵之钥가 아니라 GoodsType 24(형귀 컨트롤러), 31192의 ×40 재료는 统帅之证가 아니라 GoodsType 24(형귀 컨트롤러)다.",
    "ID 85의 GoodsType 27 raw ID 312 / 311 / 316과 수량 ×5는 ConfigData에서 직접 확인했고, 표시명은 기존 화면 검수 매핑을 유지한다.",
    "표시용 한국어 스킬명·직업명·스탯 필드 의미가 확정되지 않은 값은 후속 작업에서 채운다.",
  ],
};

const heroDetails = new Map<number, HeroDetail>([[leon.identity.heroId, leon]]);

export function getHeroDetail(heroId: number): HeroDetail | undefined {
  return heroDetails.get(heroId);
}
