import heroArtworkJson from "../../data/generated/hero-card-artwork-stage4.v1.json";
import heroStage6ManifestJson from "../../data/generated/hero-detail.v1.json";
import heroListJson from "../../data/generated/hero-list-stage1.v1.json";
import heroProvisionalNamesJson from "../../data/presentation/hero-provisional-name-kr.v1.json";

export type HeroListFaction = {
  factionId: number;
  nameCn: string;
  nameKr: string | null;
  iconSourcePath: string | null;
};

export type HeroListOrigin = {
  productionId: number;
  nameCn: string;
  nameKr: string | null;
  category: string;
};

export type HeroListRecord = {
  heroId: number;
  detailRoute: string;
  identity: {
    nameKr: string | null;
    nameCn: string;
    nameEn: string | null;
  };
  rarity: {
    rank: number;
    baseLabel: string;
  };
  hasSp: boolean;
  spStatus: string;
  factions: HeroListFaction[];
  origin: HeroListOrigin;
  card: {
    sourceArtworkPath: string | null;
    webAssetPath: string | null;
    assetStatus: string;
  };
};

export type HeroNameKrStatus = "official-confirmed" | "provisional-display" | "cn-fallback";
export type HeroNameSourceAuthority = "KR" | "CN";

export type HeroNameLocalization = {
  officialNameKr: string | null;
  displayNameKr: string | null;
  displayName: string;
  nameKrStatus: HeroNameKrStatus;
  sourceAuthority: HeroNameSourceAuthority;
};

export type HeroListStage4Record = Omit<HeroListRecord, "card"> & {
  card: HeroListRecord["card"] & {
    expectedFilePath: string;
  };
  localization: HeroNameLocalization;
};

type HeroListStage1Source = {
  version: number;
  stage: string;
  schemaId: string;
  status: string;
  completion: string;
  freezeState: string;
  sourcePolicy: {
    heroStage6FinalFrozenOnly: boolean;
    rawConfigDataRead: boolean;
    stage4ProducerRead: boolean;
    stage5ProducerRead: boolean;
    relationshipRederivation: boolean;
    nameOrIdHeuristics: boolean;
  };
  summary: {
    canonicalHeroCount: number;
    generatedRecordCount: number;
    uniqueHeroCount: number;
    hardErrorCount: number;
  };
  records: HeroListRecord[];
};

type HeroArtworkStage4Source = {
  version: number;
  stage: string;
  schemaId: string;
  status: string;
  completion: string;
  sourcePolicy: {
    heroListStage1FrozenOnly: boolean;
    heroStage6ManifestAdmissionOnly: boolean;
    rawConfigDataRead: boolean;
    inferWebPathFromUnityLocator: boolean;
    resolveOnlyWhenFileExists: boolean;
  };
  summary: {
    heroCount: number;
    uniqueHeroCount: number;
    resolvedCount: number;
    pendingCount: number;
    stage6MissingCount: number;
    routeMismatchCount: number;
    sourceLocatorMissingCount: number;
    hardErrorCount: number;
  };
  records: Array<{
    heroId: number;
    detailRoute: string;
    sourceArtworkPath: string | null;
    expectedFilePath: string;
    webAssetPath: string | null;
    assetStatus: string;
    stage6ShardPath: string | null;
  }>;
};

type HeroStage6ManifestSource = {
  status: string;
  completion: string;
  summary: {
    siteUsableCount: number;
    hardErrorCount: number;
  };
  storage: {
    mode: string;
    recordCount: number;
    byHeroId: Record<
      string,
      {
        path: string;
        sha256: string;
        byteLength: number;
      }
    >;
  };
};

type HeroProvisionalNameSource = {
  version: number;
  schemaId: string;
  status: string;
  scope: string;
  source: {
    officialKoreanNameConfirmed: boolean;
    identityMutation: boolean;
  };
  coverage: {
    recordCount: number;
    provisionalCount: number;
    officialNameUnresolvedCount: number;
  };
  records: Array<{
    heroId: number;
    nameCn: string;
    displayNameKr: string;
    sourceAuthority: "CN";
    status: "provisional-display";
  }>;
};

type HeroTaxonomyLocalization = {
  nameCn: string;
  nameKr: string;
};

const heroList = heroListJson as unknown as HeroListStage1Source;
const heroArtwork = heroArtworkJson as unknown as HeroArtworkStage4Source;
const heroStage6Manifest = heroStage6ManifestJson as unknown as HeroStage6ManifestSource;
const heroProvisionalNames = heroProvisionalNamesJson as unknown as HeroProvisionalNameSource;

const factionLocalizationById = new Map<number, HeroTaxonomyLocalization>([
  [1, { nameCn: "主角光环", nameKr: "시대의 주역" }],
  [2, { nameCn: "光辉军团", nameKr: "빛의 군단" }],
  [3, { nameCn: "光之起源", nameKr: "빛의 기원" }],
  [4, { nameCn: "帝国之辉", nameKr: "제국의 빛" }],
  [5, { nameCn: "黑暗轮回", nameKr: "어둠의 윤회" }],
  [6, { nameCn: "公主联盟", nameKr: "공주 연맹" }],
  [7, { nameCn: "战略大师", nameKr: "전략의 대가" }],
  [8, { nameCn: "流星直击", nameKr: "메테오 스트라이크" }],
  [9, { nameCn: "传说彼端", nameKr: "전설의 저편" }],
  [10, { nameCn: "时空枢纽", nameKr: "시공의 중심" }],
  [11, { nameCn: "超凡领域", nameKr: "초월 영역" }],
  [12, { nameCn: "梦幻转生", nameKr: "리인카네이션 전생" }],
]);

const originLocalizationById = new Map<number, HeroTaxonomyLocalization>([
  [1, { nameCn: "空之轨迹", nameKr: "영웅전설 하늘의 궤적" }],
  [2, { nameCn: "樱花大战", nameKr: "사쿠라 대전" }],
  [3, { nameCn: "梦幻模拟战手游I", nameKr: "랑그릿사 모바일 Ch.1" }],
  [4, { nameCn: "梦幻模拟战I", nameKr: "랑그릿사I" }],
  [5, { nameCn: "梦幻模拟战II", nameKr: "랑그릿사II" }],
  [6, { nameCn: "梦幻模拟战III", nameKr: "랑그릿사III" }],
  [7, { nameCn: "梦幻模拟战IV", nameKr: "랑그릿사IV" }],
  [8, { nameCn: "梦幻模拟战V", nameKr: "랑그릿사V" }],
  [9, { nameCn: "梦幻模拟战·转生", nameKr: "랑그릿사 RE:인카네이션 -전생-" }],
  [10, { nameCn: "幽☆游☆白书", nameKr: "유유백서" }],
  [11, { nameCn: "罗德斯岛", nameKr: "로도스도 전기" }],
  [12, { nameCn: "梦幻模拟战手游II", nameKr: "랑그릿사 모바일 Ch.2" }],
  [13, { nameCn: "闪之轨迹", nameKr: "영웅전설 섬의 궤적" }],
  [14, { nameCn: "OVERLORD", nameKr: "오버로드" }],
  [15, { nameCn: "魔神英雄传", nameKr: "마신영웅전 와타루" }],
  [16, { nameCn: "魔神坛斗士", nameKr: "사무라이 트루퍼" }],
  [17, { nameCn: "银魂", nameKr: "은혼" }],
  [18, { nameCn: "梦幻模拟战手游III", nameKr: "랑그릿사 모바일 Ch.3" }],
  [19, { nameCn: "战场女武神", nameKr: "전장의 발큐리아" }],
  [20, { nameCn: "黎之轨迹", nameKr: "영웅전설 여의 궤적" }],
  [21, { nameCn: "光明之响", nameKr: "샤이닝 레조넌스" }],
  [22, { nameCn: "梦幻模拟战手游IV", nameKr: "랑그릿사 모바일 Ch.4(토이바르)" }],
  [23, { nameCn: "秀逗魔导士", nameKr: "슬레이어즈" }],
  [24, { nameCn: "强殖装甲凯普", nameKr: "강식장갑 가이버" }],
  [25, { nameCn: "梦幻模拟战·千年纪WS", nameKr: "랑그릿사 밀레니엄 WS the Last Century" }],
  [26, { nameCn: "名将战队", nameKr: "캡틴 코만도" }],
  [27, { nameCn: "死或生", nameKr: "데드 오어 어라이브 6" }],
  [28, { nameCn: "妖精的尾巴", nameKr: "페어리테일" }],
  [29, { nameCn: "莱莎的炼金工房3 ～终结之炼金术士与秘密钥匙～", nameKr: "라이자의 아틀리에3 ~종극의 연금술사와 비밀의 열쇠~" }],
  [30, { nameCn: "梦幻模拟战·千年纪DC", nameKr: "랑그릿사 밀레니엄 DC" }],
  [31, { nameCn: "宇宙骑士", nameKr: "우주의 기사 테카맨 블레이드" }],
  [32, { nameCn: "天空战记", nameKr: "천공전기 슈라토" }],
]);

function assertFrozenStage1Source(source: HeroListStage1Source) {
  if (
    source.version !== 1 ||
    source.stage !== "hero-list-stage1" ||
    source.schemaId !== "hero-list/v1" ||
    source.status !== "PASS" ||
    source.completion !== "COMPLETE" ||
    source.freezeState !== "HERO_LIST_STAGE1_FROZEN"
  ) {
    throw new Error("Hero list frontend requires the frozen Stage 1 consumer.");
  }

  if (
    source.summary.canonicalHeroCount !== 267 ||
    source.summary.generatedRecordCount !== 267 ||
    source.summary.uniqueHeroCount !== 267 ||
    source.summary.hardErrorCount !== 0 ||
    source.records.length !== 267
  ) {
    throw new Error("Hero list Stage 1 population/integrity summary is not production-ready.");
  }

  if (
    source.sourcePolicy.heroStage6FinalFrozenOnly !== true ||
    source.sourcePolicy.rawConfigDataRead !== false ||
    source.sourcePolicy.stage4ProducerRead !== false ||
    source.sourcePolicy.stage5ProducerRead !== false ||
    source.sourcePolicy.relationshipRederivation !== false ||
    source.sourcePolicy.nameOrIdHeuristics !== false
  ) {
    throw new Error("Hero list Stage 1 production boundary does not match the frozen contract.");
  }
}

function assertStage4Sources() {
  if (
    heroArtwork.version !== 1 ||
    heroArtwork.stage !== "hero-list-stage4-artwork" ||
    heroArtwork.schemaId !== "hero-card-artwork-stage4/v1" ||
    heroArtwork.status !== "PASS" ||
    heroArtwork.completion !== "RESOLVER_READY" ||
    heroArtwork.summary.heroCount !== 267 ||
    heroArtwork.summary.uniqueHeroCount !== 267 ||
    heroArtwork.summary.stage6MissingCount !== 0 ||
    heroArtwork.summary.routeMismatchCount !== 0 ||
    heroArtwork.summary.sourceLocatorMissingCount !== 0 ||
    heroArtwork.summary.hardErrorCount !== 0
  ) {
    throw new Error("Hero list Stage 4 artwork resolver is not production-ready.");
  }

  if (
    heroArtwork.sourcePolicy.heroListStage1FrozenOnly !== true ||
    heroArtwork.sourcePolicy.heroStage6ManifestAdmissionOnly !== true ||
    heroArtwork.sourcePolicy.rawConfigDataRead !== false ||
    heroArtwork.sourcePolicy.inferWebPathFromUnityLocator !== false ||
    heroArtwork.sourcePolicy.resolveOnlyWhenFileExists !== true
  ) {
    throw new Error("Hero list Stage 4 artwork source policy is invalid.");
  }

  if (
    heroStage6Manifest.status !== "PASS_WITH_REVIEW" ||
    heroStage6Manifest.completion !== "COMPLETE" ||
    heroStage6Manifest.summary.siteUsableCount !== 267 ||
    heroStage6Manifest.summary.hardErrorCount !== 0 ||
    heroStage6Manifest.storage.mode !== "SHARDED_BY_HERO" ||
    heroStage6Manifest.storage.recordCount !== 267
  ) {
    throw new Error("Hero Stage 6 manifest is not ready for detail-route admission.");
  }
}

function assertProvisionalNameSource() {
  if (
    heroProvisionalNames.version !== 1 ||
    heroProvisionalNames.schemaId !== "hero-provisional-name-kr-presentation/v1" ||
    heroProvisionalNames.status !== "PASS" ||
    heroProvisionalNames.scope !== "frontend-presentation-only" ||
    heroProvisionalNames.source.officialKoreanNameConfirmed !== false ||
    heroProvisionalNames.source.identityMutation !== false ||
    heroProvisionalNames.coverage.recordCount !== 5 ||
    heroProvisionalNames.coverage.provisionalCount !== 5 ||
    heroProvisionalNames.coverage.officialNameUnresolvedCount !== 5 ||
    heroProvisionalNames.records.length !== 5
  ) {
    throw new Error("Hero provisional Korean-name presentation source is invalid.");
  }

  const frozenByHeroId = new Map(heroList.records.map((record) => [record.heroId, record]));
  const seen = new Set<number>();
  for (const record of heroProvisionalNames.records) {
    if (
      !Number.isSafeInteger(record.heroId) ||
      seen.has(record.heroId) ||
      record.status !== "provisional-display" ||
      record.sourceAuthority !== "CN" ||
      !record.nameCn ||
      !record.displayNameKr
    ) {
      throw new Error(`Hero provisional Korean-name record ${record.heroId} is invalid.`);
    }
    seen.add(record.heroId);

    const frozen = frozenByHeroId.get(record.heroId);
    if (!frozen || frozen.identity.nameCn !== record.nameCn) {
      throw new Error(`Hero ${record.heroId} provisional Korean-name ID/Chinese-name parity failed.`);
    }
  }
}

function assertTaxonomyLocalizationSource() {
  if (factionLocalizationById.size !== 12 || originLocalizationById.size !== 32) {
    throw new Error("Hero taxonomy Korean-name mapping coverage is invalid.");
  }

  for (const hero of heroList.records) {
    for (const faction of hero.factions) {
      const localized = factionLocalizationById.get(faction.factionId);
      if (!localized || localized.nameCn !== faction.nameCn) {
        throw new Error(`Hero ${hero.heroId} faction ${faction.factionId} Korean-name mapping parity failed.`);
      }
    }

    const localizedOrigin = originLocalizationById.get(hero.origin.productionId);
    if (!localizedOrigin || localizedOrigin.nameCn !== hero.origin.nameCn) {
      throw new Error(`Hero ${hero.heroId} origin ${hero.origin.productionId} Korean-name mapping parity failed.`);
    }
  }
}

assertFrozenStage1Source(heroList);
assertStage4Sources();
assertProvisionalNameSource();
assertTaxonomyLocalizationSource();

const artworkByHeroId = new Map(heroArtwork.records.map((record) => [record.heroId, record]));
const provisionalNameByHeroId = new Map(
  heroProvisionalNames.records.map((record) => [record.heroId, record]),
);

function projectHeroNameLocalization(hero: HeroListRecord): HeroNameLocalization {
  const provisional = provisionalNameByHeroId.get(hero.heroId);
  if (provisional) {
    return {
      officialNameKr: null,
      displayNameKr: provisional.displayNameKr,
      displayName: provisional.displayNameKr,
      nameKrStatus: "provisional-display",
      sourceAuthority: "CN",
    };
  }

  if (hero.identity.nameKr) {
    return {
      officialNameKr: hero.identity.nameKr,
      displayNameKr: hero.identity.nameKr,
      displayName: hero.identity.nameKr,
      nameKrStatus: "official-confirmed",
      sourceAuthority: "KR",
    };
  }

  return {
    officialNameKr: null,
    displayNameKr: null,
    displayName: hero.identity.nameCn,
    nameKrStatus: "cn-fallback",
    sourceAuthority: "CN",
  };
}

function projectFactionLocalization(faction: HeroListFaction): HeroListFaction {
  const localized = factionLocalizationById.get(faction.factionId);
  if (!localized || localized.nameCn !== faction.nameCn) {
    throw new Error(`Faction ${faction.factionId} Korean-name mapping parity failed.`);
  }
  return { ...faction, nameKr: localized.nameKr };
}

function projectOriginLocalization(origin: HeroListOrigin): HeroListOrigin {
  const localized = originLocalizationById.get(origin.productionId);
  if (!localized || localized.nameCn !== origin.nameCn) {
    throw new Error(`Origin ${origin.productionId} Korean-name mapping parity failed.`);
  }
  return { ...origin, nameKr: localized.nameKr };
}

function buildRarityOptions(records: HeroListRecord[]) {
  const rarityMap = new Map<string, { label: string; rank: number; count: number }>();

  for (const hero of records) {
    const current = rarityMap.get(hero.rarity.baseLabel);
    if (current) {
      current.count += 1;
      continue;
    }

    rarityMap.set(hero.rarity.baseLabel, {
      label: hero.rarity.baseLabel,
      rank: hero.rarity.rank,
      count: 1,
    });
  }

  return [...rarityMap.values()].sort((a, b) => b.rank - a.rank || a.label.localeCompare(b.label));
}

function projectStage4Record(hero: HeroListRecord): HeroListStage4Record {
  const artwork = artworkByHeroId.get(hero.heroId);
  if (!artwork) {
    throw new Error(`Hero ${hero.heroId} is missing from the Stage 4 artwork manifest.`);
  }

  if (
    artwork.detailRoute !== hero.detailRoute ||
    artwork.sourceArtworkPath !== hero.card.sourceArtworkPath ||
    !heroStage6Manifest.storage.byHeroId[String(hero.heroId)]
  ) {
    throw new Error(`Hero ${hero.heroId} Stage 4 parity/admission check failed.`);
  }

  return {
    ...hero,
    factions: hero.factions.map(projectFactionLocalization),
    origin: projectOriginLocalization(hero.origin),
    card: {
      ...hero.card,
      webAssetPath: artwork.webAssetPath,
      assetStatus: artwork.assetStatus,
      expectedFilePath: artwork.expectedFilePath,
    },
    localization: projectHeroNameLocalization(hero),
  };
}

export function readHeroListStage2Data() {
  return {
    records: heroList.records,
    summary: {
      total: heroList.summary.generatedRecordCount,
      unique: heroList.summary.uniqueHeroCount,
    },
    source: {
      stage: heroList.stage,
      schemaId: heroList.schemaId,
      freezeState: heroList.freezeState,
    },
  };
}

export function readHeroListStage3Data() {
  return {
    ...readHeroListStage2Data(),
    filters: {
      rarities: buildRarityOptions(heroList.records),
      spCount: heroList.records.filter((hero) => hero.hasSp).length,
    },
    presentation: {
      displayOrdering: "FROZEN_RECORD_ORDER",
      releaseChronologyAvailable: false,
      factionKoreanLabelsComplete: false,
      originKoreanLabelsComplete: false,
    },
  };
}

export function readHeroListStage4Data() {
  return {
    ...readHeroListStage3Data(),
    records: heroList.records.map(projectStage4Record),
    presentation: {
      ...readHeroListStage3Data().presentation,
      factionKoreanLabelsComplete: true,
      originKoreanLabelsComplete: true,
    },
    artwork: {
      resolved: heroArtwork.summary.resolvedCount,
      pending: heroArtwork.summary.pendingCount,
      total: heroArtwork.summary.heroCount,
      policy: "FILE_EXISTS_ONLY",
    },
  };
}

export function readHeroDetailRouteStage4Data(heroId: number) {
  const hero = heroList.records.find((record) => record.heroId === heroId);
  if (!hero) return null;

  const stage6Shard = heroStage6Manifest.storage.byHeroId[String(heroId)];
  if (!stage6Shard) return null;

  return {
    hero: projectStage4Record(hero),
    stage6: {
      admissionStatus: "SHARD_AVAILABLE",
      shardPath: stage6Shard.path,
      sha256: stage6Shard.sha256,
      byteLength: stage6Shard.byteLength,
      fullShardRuntimeRead: false,
    },
  };
}
