import heroListJson from "../../data/generated/hero-list-stage1.v1.json";
import heroNameCorrectionsJson from "../../data/hero-name-corrections.v1.json";
import heroProvisionalNamesJson from "../../data/presentation/hero-provisional-name-kr.v1.json";

type FrozenHero = {
  heroId: number;
  identity: {
    nameKr: string | null;
    nameCn: string;
  };
};

type HeroListSource = {
  version: number;
  stage: string;
  schemaId: string;
  status: string;
  completion: string;
  freezeState: string;
  summary: {
    canonicalHeroCount: number;
    generatedRecordCount: number;
    uniqueHeroCount: number;
    hardErrorCount: number;
  };
  records: FrozenHero[];
};

type HeroNameCorrectionSource = {
  version: number;
  status: string;
  source: string;
  corrections: Array<{
    heroId: number;
    nameCn: string;
    nameKr: string;
    previousNameKr: string;
    reason: string;
  }>;
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

export type HeroNameKrStatus = "official-confirmed" | "provisional-display" | "cn-fallback";
export type HeroNameSourceAuthority = "KR" | "CN";

export type HeroNameLocalization = {
  officialNameKr: string | null;
  displayNameKr: string | null;
  displayName: string;
  nameKrStatus: HeroNameKrStatus;
  sourceAuthority: HeroNameSourceAuthority;
};

const heroList = heroListJson as unknown as HeroListSource;
const heroNameCorrections = heroNameCorrectionsJson as unknown as HeroNameCorrectionSource;
const provisionalNames = heroProvisionalNamesJson as unknown as HeroProvisionalNameSource;

if (
  heroList.version !== 1 ||
  heroList.stage !== "hero-list-stage1" ||
  heroList.schemaId !== "hero-list/v1" ||
  heroList.status !== "PASS" ||
  heroList.completion !== "COMPLETE" ||
  heroList.freezeState !== "HERO_LIST_STAGE1_FROZEN" ||
  heroList.summary.canonicalHeroCount !== heroList.records.length ||
  heroList.summary.generatedRecordCount !== heroList.records.length ||
  heroList.summary.uniqueHeroCount !== heroList.records.length ||
  heroList.summary.hardErrorCount !== 0
) {
  throw new Error("Hero display-name resolver requires the frozen Hero list consumer.");
}

if (
  heroNameCorrections.version !== 1 ||
  heroNameCorrections.status !== "canonical-source-confirmed" ||
  !heroNameCorrections.source.trim()
) {
  throw new Error("Hero display-name resolver requires the reviewed Hero name correction source.");
}

if (
  provisionalNames.version !== 1 ||
  provisionalNames.schemaId !== "hero-provisional-name-kr-presentation/v1" ||
  provisionalNames.status !== "PASS" ||
  provisionalNames.scope !== "frontend-presentation-only" ||
  provisionalNames.source.officialKoreanNameConfirmed !== false ||
  provisionalNames.source.identityMutation !== false ||
  provisionalNames.coverage.recordCount !== provisionalNames.records.length ||
  provisionalNames.coverage.provisionalCount !== provisionalNames.records.length ||
  provisionalNames.coverage.officialNameUnresolvedCount !== provisionalNames.records.length
) {
  throw new Error("Hero display-name resolver requires the reviewed provisional presentation source.");
}

const heroById = new Map(heroList.records.map((hero) => [hero.heroId, hero]));
const correctionByHeroId = new Map(heroNameCorrections.corrections.map((record) => [record.heroId, record]));
const provisionalByHeroId = new Map(provisionalNames.records.map((record) => [record.heroId, record]));

if (
  heroById.size !== heroList.records.length ||
  correctionByHeroId.size !== heroNameCorrections.corrections.length ||
  provisionalByHeroId.size !== provisionalNames.records.length
) {
  throw new Error("Hero display-name resolver found duplicate Hero IDs.");
}

for (const correction of heroNameCorrections.corrections) {
  const hero = heroById.get(correction.heroId);
  if (
    !hero ||
    hero.identity.nameCn !== correction.nameCn ||
    hero.identity.nameKr !== correction.previousNameKr ||
    !correction.nameKr.trim() ||
    correction.nameKr === correction.previousNameKr
  ) {
    throw new Error(`Hero confirmed display-name correction mismatch for Hero ${correction.heroId}.`);
  }
}

for (const provisional of provisionalNames.records) {
  const hero = heroById.get(provisional.heroId);
  if (
    !hero ||
    hero.identity.nameCn !== provisional.nameCn ||
    provisional.sourceAuthority !== "CN" ||
    provisional.status !== "provisional-display" ||
    !provisional.displayNameKr.trim()
  ) {
    throw new Error(`Hero provisional display-name mapping mismatch for Hero ${provisional.heroId}.`);
  }
}

function resolveFrozenHero(heroId: number, consumerNameCn?: string) {
  const hero = heroById.get(heroId);
  if (!hero) {
    throw new Error(`Hero display-name consumer references unknown Hero ${heroId}.`);
  }
  if (consumerNameCn !== undefined && consumerNameCn !== hero.identity.nameCn) {
    throw new Error(`Hero display-name consumer CN parity mismatch for Hero ${heroId}.`);
  }
  return hero;
}

export function resolveHeroNameLocalization(
  heroId: number,
  fallbackNameKr: string | null,
  consumerNameCn?: string,
): HeroNameLocalization {
  const hero = resolveFrozenHero(heroId, consumerNameCn);
  const provisional = provisionalByHeroId.get(heroId);

  if (provisional) {
    return {
      officialNameKr: null,
      displayNameKr: provisional.displayNameKr,
      displayName: provisional.displayNameKr,
      nameKrStatus: "provisional-display",
      sourceAuthority: "CN",
    };
  }

  const correction = correctionByHeroId.get(heroId);
  if (correction) {
    return {
      officialNameKr: correction.nameKr,
      displayNameKr: correction.nameKr,
      displayName: correction.nameKr,
      nameKrStatus: "official-confirmed",
      sourceAuthority: "KR",
    };
  }

  if (fallbackNameKr) {
    return {
      officialNameKr: fallbackNameKr,
      displayNameKr: fallbackNameKr,
      displayName: fallbackNameKr,
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

export function resolveHeroDisplayNameKr(
  heroId: number,
  fallbackNameKr: string | null,
  consumerNameCn?: string,
) {
  return resolveHeroNameLocalization(heroId, fallbackNameKr, consumerNameCn).displayNameKr;
}
