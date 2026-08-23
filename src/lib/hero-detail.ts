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
};

export type HeroSpMission = {
  id: number;
  chapter: 1 | 2;
  kind: "material" | "battle" | "equipment" | "runestone" | "completion" | "unknown";
  summary?: string;
  status: HeroDetailSourceStatus;
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
  notes: string[];
};

/**
 * First integration fixture for the hero-detail pipeline.
 *
 * Only values already verified in the project sources are populated here.
 * Unknown presentation data is intentionally left empty instead of guessed.
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
    skills: [],
  },
  sp: {
    exists: true,
    bonds: [],
    soldiers: [],
    jobs: [],
    skills: [
      { id: 12527, name: "冥火碎踏", nameSource: "cn", unlockGroup: "sp", status: "verified" },
      { id: 12528, name: "青龙的真魂", nameSource: "cn", unlockGroup: "sp", status: "verified" },
    ],
    missions: [
      { id: 31183, chapter: 1, kind: "material", status: "partial" },
      { id: 31184, chapter: 1, kind: "battle", summary: "레온 포함 안톤 Lv60+", status: "verified" },
      { id: 31185, chapter: 1, kind: "material", status: "partial" },
      { id: 31186, chapter: 1, kind: "equipment", summary: "레온 전용장비 Lv50", status: "verified" },
      { id: 31187, chapter: 1, kind: "runestone", summary: "룬스톤 제출", status: "verified" },
      { id: 31188, chapter: 1, kind: "battle", summary: "레온 포함 화룡 Lv60+", status: "verified" },
      { id: 31189, chapter: 1, kind: "completion", summary: "1부 완료", status: "verified" },
      { id: 31190, chapter: 2, kind: "unknown", status: "partial" },
      { id: 31191, chapter: 2, kind: "unknown", status: "partial" },
      { id: 31192, chapter: 2, kind: "unknown", status: "partial" },
      { id: 31193, chapter: 2, kind: "unknown", status: "partial" },
      { id: 31194, chapter: 2, kind: "unknown", status: "partial" },
      { id: 31195, chapter: 2, kind: "unknown", status: "partial" },
      { id: 31196, chapter: 2, kind: "completion", status: "partial" },
    ],
    sourceItemIds: [2023, 2029, 7402],
  },
  dataStatus: "partial",
  notes: [
    "레온은 캐릭터 상세페이지 데이터 모델 검증용 첫 샘플이다.",
    "표시값이 확인되지 않은 항목은 추정하지 않고 비워 둔다.",
    "SP 재료 제출 MissionType 73의 실제 재료 묶음은 후속 데이터 연결에서 채운다.",
  ],
};

const heroDetails = new Map<number, HeroDetail>([[leon.identity.heroId, leon]]);

export function getHeroDetail(heroId: number): HeroDetail | undefined {
  return heroDetails.get(heroId);
}
