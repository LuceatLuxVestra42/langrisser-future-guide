import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Swords,
  UserRound,
} from "lucide-react";

import { HeroCentralDisciplineSection } from "@/components/hero-central-discipline-section";
import { HeroExclusiveEquipmentSection } from "@/components/hero-exclusive-equipment-section";
import { HeroAwakeningMaterialsSection } from "@/components/hero-awakening-materials-section";
import { HeroBondMaterialsPanel } from "@/components/hero-bond-materials-panel";
import { HeroJobMaterialsSection } from "@/components/hero-job-materials-section";
import { HeroSoldierCommandSection } from "@/components/hero-soldier-command-section";
import { SoldierDetailDialog } from "@/components/soldier-detail-dialog";
import { getOfficialArmyIconUrl } from "@/lib/army-icon-assets";
import { getStaticHeroCardIconIndex } from "@/lib/hero-card-icon-assets.static";
import { getHeroBondMaterialsPresentation } from "@/lib/hero-bond-materials.functions";
import { getHeroCastingLawPresentation } from "@/lib/hero-casting-law.functions";
import { getHeroFinalJobStatBarPresentationData } from "@/lib/hero-final-job-stat-bars.functions";
import { resolveHeroFinalJobNameKr } from "@/lib/hero-final-job-localization";
import { resolveHeroJobNameKr } from "@/lib/hero-job-localization";
import { resolveHeroSpJobNameKr } from "@/lib/hero-sp-job-localization";
import { getHeroDetailRouteStage5Data } from "@/lib/hero-list.functions";
import { getHeroExclusiveEquipmentPresentation } from "@/lib/hero-exclusive-equipment.functions";
import { getHeroFusionPowerIndex } from "@/lib/hero-fusion-power.functions";
import { getHeroSkinAcquisitionDisplayLabel } from "@/lib/hero-skin-acquisition-display";
import { getHeroSpArtworkSource } from "@/lib/hero-sp-artwork-assets";
import { getHeroSkillIconUrl } from "@/lib/hero-skill-icon-assets";
import { getHeroSkillDisplayTypeLabelKr } from "@/lib/hero-skill-display-type-presentation";
import { getHeroSpMaterialPresentation } from "@/lib/hero-sp-material-icon-assets";
import { resolveHeroSpMissionStageLabelKr } from "@/lib/hero-sp-mission-stage-localization";
import {
  HERO_SP_DUNGEON_WEEKDAY_LABEL,
  recommendHeroSpHourglass,
  simulateHeroSpDungeonSchedule,
  type HeroSpDungeonScenario,
} from "@/lib/hero-sp-mission-dungeon-schedule";
import { getOfficialSoldierPortraitUrl } from "@/lib/soldier-portrait-assets";
import { getSkinFullartVisuals } from "@/lib/skin-fullart-assets";
import { getSoldierPrototypePageData } from "@/lib/soldier-page.functions";

export const Route = createFileRoute("/heroes_/$heroId")({
  loader: async ({ params }) => {
    if (!/^\d+$/.test(params.heroId)) throw notFound();
    const heroId = Number(params.heroId);
    if (!Number.isSafeInteger(heroId) || heroId <= 0) throw notFound();
    const data = await getHeroDetailRouteStage5Data({ data: { heroId } });
    if (!data) throw notFound();
    const bondMaterials = await getHeroBondMaterialsPresentation({ data: { heroId } });
    if (!bondMaterials) throw new Error(`Hero ${heroId} has no frozen bond-material presentation.`);
    const castingLaw = await getHeroCastingLawPresentation({ data: { heroId } });
    if (!castingLaw) throw new Error(`Hero ${heroId} has no frozen Casting Law presentation.`);
    const finalJobStatBars = await getHeroFinalJobStatBarPresentationData();
    const exclusiveEquipment = await getHeroExclusiveEquipmentPresentation({ data: { heroId } });
    const fusionPowers = await getHeroFusionPowerIndex();
    if (
      fusionPowers.summary.factionAssets !== 12 ||
      fusionPowers.summary.pending !== 0 ||
      fusionPowers.summary.hardErrors !== 0
    ) {
      throw new Error("Hero faction mark index is not production-ready.");
    }
    const factionMarkById = new Map<number, string>();
    for (const record of fusionPowers.records) {
      if (record.targetType !== "FACTION" || record.targetIds.length !== 1) continue;
      const factionId = record.targetIds[0];
      const markAsset = record.markAssets[0];
      if (factionId === undefined || !markAsset) continue;
      const existing = factionMarkById.get(factionId);
      if (existing && existing !== markAsset.webAssetPath) {
        throw new Error(`Faction ${factionId} has conflicting frozen mark assets.`);
      }
      factionMarkById.set(factionId, markAsset.webAssetPath);
    }
    if (factionMarkById.size !== fusionPowers.summary.factionAssets) {
      throw new Error("Hero faction mark index is incomplete.");
    }
    const factionMarks = data.hero.factions.map((faction) => {
      const webAssetPath = factionMarkById.get(faction.factionId);
      if (!webAssetPath) {
        throw new Error(`Hero ${heroId} faction ${faction.factionId} has no frozen mark asset.`);
      }
      return {
        factionId: faction.factionId,
        label: faction.nameKr ?? faction.nameCn,
        webAssetPath,
      };
    });
    const soldierPage = getSoldierPrototypePageData();
    const soldierById = new Map(soldierPage.records.map((record) => [record.soldierId, record]));
    const soldierCards = data.detail.soldiers.ids.map((soldierId) => {
      const record = soldierById.get(soldierId);
      if (!record) {
        throw new Error(`Hero ${heroId} references Soldier ${soldierId}, but the frozen Soldier frontend consumer does not contain it.`);
      }
      return {
        soldierId: record.soldierId,
        nameKr: record.nameKr,
        nameCn: record.nameCn,
        nameKrStatus: record.nameKrStatus,
        tier: record.tier,
        armyType: record.armyType,
        isSp: record.isSp,
      };
    });
    if (soldierCards.length !== data.detail.soldiers.count) {
      throw new Error(`Hero ${heroId} Soldier card count mismatch: ${soldierCards.length} != ${data.detail.soldiers.count}.`);
    }
    return { ...data, bondMaterials, castingLaw, finalJobStatBars, exclusiveEquipment, factionMarks, soldierCards };
  },
  head: ({ loaderData }) => ({
    meta: [{
      title: loaderData
        ? `${loaderData.hero.localization.displayName || (loaderData.hero.identity.nameKr ?? loaderData.hero.identity.nameCn)} | 랑그릿사 모바일 영웅`
        : "영웅 | 랑그릿사 모바일 미래시 정보",
    }],
  }),
  component: HeroDetailPage,
  notFoundComponent: HeroNotFound,
});

function resolvePublicAssetUrl(webAssetPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  const basePrefix = base === "/" ? "" : base.replace(/\/$/, "");
  const normalizedPath = webAssetPath.startsWith("/") ? webAssetPath : `/${webAssetPath}`;
  return `${basePrefix}${normalizedPath}`;
}

type HeroVisual = {
  kind: "hero" | "skin";
  src: string;
  label: string;
  skinId: number | null;
  sourceOrder: number | null;
};

type HeroFormMode = "normal" | "sp";
type MatthewVariant = "cavalry" | "flying" | "archer" | "assassin";

const MATTHEW_HERO_ID = 1;
const MATTHEW_FIXED_FINAL_JOB_ID = 206;
const MATTHEW_COMMON_JOB_CONNECTION_IDS = [10, 11] as const;
const MATTHEW_FIXED_JOB_CONNECTION_IDS = [13, 18] as const;
const MATTHEW_VARIANTS: ReadonlyArray<{
  id: MatthewVariant;
  label: string;
  finalJobId: number;
  jobConnectionIds: readonly number[];
}> = [
  { id: "cavalry", label: "기병매튜", finalJobId: 307, jobConnectionIds: [12, 17] },
  { id: "flying", label: "비병매튜", finalJobId: 405, jobConnectionIds: [14, 19] },
  { id: "archer", label: "궁병매튜", finalJobId: 604, jobConnectionIds: [16, 21] },
  { id: "assassin", label: "암살매튜", finalJobId: 1104, jobConnectionIds: [15, 20] },
];

const HERO_RARITY_ICON_PATH_BY_LABEL: Record<string, string> = {
  LLR: "/images/heroes/rarity/LLR.png",
  SSR: "/images/heroes/rarity/SSR.png",
  SR: "/images/heroes/rarity/SR.png",
  R: "/images/heroes/rarity/R.png",
  N: "/images/heroes/rarity/N.png",
  SP: "/images/heroes/rarity/SP.png",
};

const FETTER_ICON_BY_FAVORABILITY_LEVEL: Record<number, number> = {
  5: 1,
  10: 2,
  15: 3,
  23: 4,
  25: 5,
};

type KoreanParticlePair = "은/는" | "이/가" | "을/를" | "와/과" | "으로/로";

function withKoreanParticle(value: string, pair: KoreanParticlePair) {
  const trimmed = value.trimEnd();
  const lastCharacter = Array.from(trimmed).at(-1);
  if (!lastCharacter) return value;

  const codePoint = lastCharacter.charCodeAt(0);
  if (codePoint < 0xac00 || codePoint > 0xd7a3) {
    const fallbackParticle: Record<KoreanParticlePair, string> = {
      "은/는": "는",
      "이/가": "가",
      "을/를": "를",
      "와/과": "와",
      "으로/로": "로",
    };
    return `${value}${fallbackParticle[pair]}`;
  }

  const finalConsonantIndex = (codePoint - 0xac00) % 28;
  const hasFinalConsonant = finalConsonantIndex !== 0;
  const hasRieulFinalConsonant = finalConsonantIndex === 8;
  const particle: Record<KoreanParticlePair, string> = {
    "은/는": hasFinalConsonant ? "은" : "는",
    "이/가": hasFinalConsonant ? "이" : "가",
    "을/를": hasFinalConsonant ? "을" : "를",
    "와/과": hasFinalConsonant ? "과" : "와",
    "으로/로": hasFinalConsonant && !hasRieulFinalConsonant ? "으로" : "로",
  };
  return `${value}${particle[pair]}`;
}

function stripConfigMarkup(value: string | null) {
  if (!value) return "-";
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}

function formatHeroSkillMetadataValue(value: string) {
  return value
    .replace(/回合/g, "턴")
    .replace(/(\d+)圈/g, "주위 $1칸")
    .replace(/格/g, "칸")
    .replace(/自身/g, "자신")
    .replace(/单体/g, "단일")
    .replace(/全场/g, "전체")
    .replace(/直线/g, "직선");
}

function getVisibleHeroSkillMetadataValue(value: string | null) {
  if (!value) return null;
  const formatted = formatHeroSkillMetadataValue(value).trim();
  if (!formatted || formatted === "-" || formatted === "—" || formatted === "无") return null;
  return formatted;
}

function HeroDetailPage() {
  const { hero, detail, soldierCommand, heartFetter, bondMaterials, castingLaw, finalJobStatBars, exclusiveEquipment, factionMarks, soldierCards } = Route.useLoaderData();
  const hasSpForm = detail.sp.released;
  const [formMode, setFormMode] = useState<HeroFormMode>("normal");
  const [matthewVariant, setMatthewVariant] = useState<MatthewVariant>("cavalry");
  useEffect(() => {
    setFormMode("normal");
    setMatthewVariant("cavalry");
  }, [hero.heroId]);
  const isSpForm = hasSpForm && formMode === "sp";
  const isMatthew = hero.heroId === MATTHEW_HERO_ID;
  const selectedMatthewVariant = MATTHEW_VARIANTS.find(
    (variant) => variant.id === matthewVariant,
  );
  const selectedMatthewVariantFinalJobId = selectedMatthewVariant?.finalJobId ?? 307;
  const selectedMatthewVariantJobConnectionIds =
    selectedMatthewVariant?.jobConnectionIds ?? [12, 17];
  const selectedMatthewSkillConnectionIds = isMatthew
    ? [
        ...MATTHEW_COMMON_JOB_CONNECTION_IDS,
        ...MATTHEW_FIXED_JOB_CONNECTION_IDS,
        ...selectedMatthewVariantJobConnectionIds,
      ]
    : undefined;
  const selectedMatthewSkillConnectionIdSet = selectedMatthewSkillConnectionIds
    ? new Set(selectedMatthewSkillConnectionIds)
    : null;
  const selectedMatthewJobConnectionIds = isMatthew && !isSpForm
    ? selectedMatthewSkillConnectionIds
    : undefined;
  const displayName = hero.localization.displayName || (hero.identity.nameKr ?? hero.identity.nameCn);
  const displayRarityLabel = isSpForm ? "SP" : hero.rarity.baseLabel;
  const rarityIconPath = HERO_RARITY_ICON_PATH_BY_LABEL[displayRarityLabel] ?? null;
  const soldierDetailById = useMemo(
    () => new Map(getSoldierPrototypePageData().records.map((record) => [record.soldierId, record])),
    [],
  );
  const heroCardIconIndex = useMemo(() => getStaticHeroCardIconIndex(), []);
  if (
    heroCardIconIndex.summary.total !== 267 ||
    heroCardIconIndex.summary.resolved !== 267 ||
    heroCardIconIndex.summary.pending !== 0 ||
    heroCardIconIndex.summary.hardErrors !== 0 ||
    heroCardIconIndex.records.length !== 267
  ) {
    throw new Error("Hero card icon frozen index is not production-ready.");
  }
  const [selectedSoldierId, setSelectedSoldierId] = useState<number | null>(null);
  useEffect(() => setSelectedSoldierId(null), [hero.heroId]);
  const selectedSoldierRecord = selectedSoldierId == null
    ? null
    : (soldierDetailById.get(selectedSoldierId) ?? null);
  if (selectedSoldierId != null && !selectedSoldierRecord) {
    throw new Error(`Hero ${hero.heroId} requested Soldier ${selectedSoldierId}, but the frozen Soldier frontend consumer does not contain it.`);
  }
  const closeSoldierDetail = useCallback(() => setSelectedSoldierId(null), []);
  const imageUrl = hero.card.webAssetPath ? resolvePublicAssetUrl(hero.card.webAssetPath) : null;
  const spArtworkPath = isSpForm ? getHeroSpArtworkSource(hero.heroId) : null;
  const spArtworkSource = spArtworkPath ? resolvePublicAssetUrl(spArtworkPath) : null;
  const primaryImageUrl = spArtworkSource ?? imageUrl;
  const visuals: HeroVisual[] = [];
  if (primaryImageUrl) {
    visuals.push({
      kind: "hero",
      src: primaryImageUrl,
      label: spArtworkSource ? "SP 일러스트" : "대표 일러스트",
      skinId: null,
      sourceOrder: null,
    });
  }
  for (const skin of getSkinFullartVisuals(hero.heroId)) {
    visuals.push({
      kind: "skin",
      src: resolvePublicAssetUrl(skin.publicPath),
      label: `스킨 ${skin.sourceOrder}`,
      skinId: skin.skinId,
      sourceOrder: skin.sourceOrder,
    });
  }

  const [visualIndex, setVisualIndex] = useState(0);
  useEffect(() => setVisualIndex(0), [hero.heroId, formMode]);
  const activeVisual = visuals[visualIndex] ?? null;
  const activeVisualSrc = activeVisual?.src ?? null;
  const [failedVisualSrc, setFailedVisualSrc] = useState<string | null>(null);
  const [loadedVisualSrc, setLoadedVisualSrc] = useState<string | null>(null);
  const nextVisualSrc = visuals.length > 1
    ? (visuals[(visualIndex + 1) % visuals.length]?.src ?? null)
    : null;
  const inactiveSpArtworkPath = hasSpForm && !isSpForm
    ? getHeroSpArtworkSource(hero.heroId)
    : null;
  const inactiveSpArtworkSource = inactiveSpArtworkPath
    ? resolvePublicAssetUrl(inactiveSpArtworkPath)
    : null;

  useEffect(() => {
    if (!activeVisualSrc || loadedVisualSrc !== activeVisualSrc) return;

    const candidates = new Set(
      [nextVisualSrc, inactiveSpArtworkSource]
        .filter((src): src is string => Boolean(src && src !== activeVisualSrc)),
    );
    for (const src of candidates) {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
    }
  }, [activeVisualSrc, inactiveSpArtworkSource, loadedVisualSrc, nextVisualSrc]);

  const moveVisual = (delta: number) => {
    if (visuals.length <= 1) return;
    setVisualIndex((current) => (current + delta + visuals.length) % visuals.length);
  };

  const spTalentMinimumStar =
    hero.rarity.baseLabel === "SSR"
      ? 3
      : hero.rarity.baseLabel === "SR"
        ? 2
        : hero.rarity.baseLabel === "R" || hero.rarity.baseLabel === "N"
          ? 1
          : null;
  const visibleTalentProgression = (
    isSpForm
      ? detail.sp.talent.starProgression.filter(
          (row) => spTalentMinimumStar == null || row.star >= spTalentMinimumStar,
        )
      : detail.talent.starProgression.filter(
          (row) => detail.talent.initialStar == null || row.star >= detail.talent.initialStar,
        )
  ).sort((a, b) => a.star - b.star);
  const sixStarTalentIndex = visibleTalentProgression.findIndex((row) => row.star === 6);
  const defaultTalentIndex = sixStarTalentIndex >= 0 ? sixStarTalentIndex : Math.max(visibleTalentProgression.length - 1, 0);
  const [talentIndex, setTalentIndex] = useState(defaultTalentIndex);
  useEffect(() => setTalentIndex(defaultTalentIndex), [hero.heroId, isSpForm, defaultTalentIndex]);
  const activeTalentRow = visibleTalentProgression[talentIndex] ?? null;
  const previousTalentRow = talentIndex > 0 ? (visibleTalentProgression[talentIndex - 1] ?? null) : null;
  const nextTalentRow = talentIndex < visibleTalentProgression.length - 1
    ? (visibleTalentProgression[talentIndex + 1] ?? null)
    : null;
  const moveTalent = (delta: number) => {
    if (visibleTalentProgression.length <= 1) return;
    setTalentIndex((current) => Math.min(Math.max(current + delta, 0), visibleTalentProgression.length - 1));
  };
  const allNormalFinalJobRows = detail.jobs.branches
    .filter((branch) => branch.capstone?.rank === 4)
    .map((branch) => ({ key: `normal-${branch.branchIndex}`, capstone: branch.capstone }));
  const normalFinalJobRows = isMatthew
    ? allNormalFinalJobRows.filter(({ capstone }) =>
        capstone?.jobId === MATTHEW_FIXED_FINAL_JOB_ID ||
        capstone?.jobId === selectedMatthewVariantFinalJobId,
      )
    : allNormalFinalJobRows;
  const spFinalJobRows = detail.sp.released && detail.sp.finalJob
    ? [{ key: "sp", capstone: detail.sp.finalJob }]
    : [];
  const finalJobRows = isSpForm ? spFinalJobRows : normalFinalJobRows;
  const finalJobNameById = new Map<number, string>();
  for (const { capstone } of finalJobRows) {
    if (capstone?.jobId != null) {
      finalJobNameById.set(
        capstone.jobId,
        (isSpForm
          ? resolveHeroSpJobNameKr({
              jobId: capstone.jobId,
              nameCn: capstone.nameCn ?? null,
            })
          : resolveHeroFinalJobNameKr({
              jobId: capstone.jobId,
              nameCn: capstone.nameCn ?? null,
            })) ?? capstone.nameCn ?? "전직",
      );
    }
  }
  const heartFetterRows = [...finalJobNameById.entries()].map(([jobId, jobName]) => ({
    jobId,
    jobName,
    effects: heartFetter.effects
      .filter((effect) => effect.jobId === jobId)
      .sort((a, b) => a.level - b.level || a.skillId - b.skillId),
  }));
  const jobNameByConnectionId = new Map<number, string>();
  for (const branch of detail.jobs.branches) {
    for (const job of branch.jobs) {
      if (job.jobConnectionId == null || job.jobId == null) continue;
      const jobName = resolveHeroJobNameKr({
        jobId: job.jobId,
        nameCn: job.nameCn ?? null,
      }) ?? job.nameCn ?? null;
      if (jobName) jobNameByConnectionId.set(job.jobConnectionId, jobName);
    }
  }
  const hasBondUnlockConditions = detail.bonds.rows.some((bond) => bond.completionConditions.some((condition) => !condition.favorability));
  const equipableSkillById = new Map<number, SkillView>();
  for (const skill of detail.skills.heroDirectSkills) equipableSkillById.set(skill.skillId, skill);
  for (const row of detail.skills.jobLevelAcquisitions) {
    if (
      selectedMatthewSkillConnectionIdSet &&
      (row.jobConnectionId == null ||
        !selectedMatthewSkillConnectionIdSet.has(row.jobConnectionId))
    ) {
      continue;
    }
    if (!equipableSkillById.has(row.skillId)) equipableSkillById.set(row.skillId, row.skill);
  }
  const equipableSkills = [...equipableSkillById.values()];

  return (
    <main
      data-name-kr-status={hero.localization.nameKrStatus}
      data-name-source-authority={hero.localization.sourceAuthority}
      data-hero-form-mode={isSpForm ? "sp" : "normal"}
      data-matthew-variant={isMatthew ? matthewVariant : undefined}
      className="min-h-screen bg-background"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <Link reloadDocument to="/heroes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 영웅 목록
        </Link>

        <section className="mt-5 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-1 min-[600px]:grid-cols-[minmax(0,4fr)_minmax(230px,1fr)] lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
            <div className="relative min-h-[357px] overflow-hidden bg-muted/25 sm:min-h-[442px] lg:min-h-[527px]">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background/70 to-transparent" />
              {activeVisual && failedVisualSrc !== activeVisual.src ? (
                <img
                  src={activeVisual.src}
                  alt={`${displayName} ${activeVisual.label}`}
                  data-hero-active-artwork="true"
                  data-hero-artwork-form={isSpForm && spArtworkSource && activeVisual.kind === "hero" ? "sp" : "normal"}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  onLoad={() => setLoadedVisualSrc(activeVisual.src)}
                  onError={() => setFailedVisualSrc(activeVisual.src)}
                  className="absolute inset-0 h-full w-full object-contain object-bottom px-3 pt-4 sm:px-6 sm:pt-6"
                />
              ) : (
                <div className="flex h-full min-h-[357px] flex-col items-center justify-center gap-3 text-muted-foreground">
                  <UserRound className="h-20 w-20" strokeWidth={1.05} aria-hidden="true" />
                  <span className="inline-flex items-center gap-1 text-xs font-semibold"><ImageOff className="h-3.5 w-3.5" aria-hidden="true" />이미지 연결 대기</span>
                </div>
              )}

              {visuals.length > 1 ? (
                <>
                  <button type="button" onClick={() => moveVisual(-1)} aria-label="이전 일러스트" className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 bg-background/90 text-foreground shadow-sm backdrop-blur transition hover:bg-background sm:left-4">
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => moveVisual(1)} aria-label="다음 일러스트" className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 bg-background/90 text-foreground shadow-sm backdrop-blur transition hover:bg-background sm:right-4">
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </>
              ) : null}

              {activeVisual ? (
                <div className="absolute bottom-4 right-4 z-20 rounded-full border border-border/80 bg-background/90 px-3 py-1.5 text-right text-[11px] font-semibold text-foreground shadow-sm backdrop-blur sm:bottom-5 sm:right-5">
                  <div>{activeVisual.kind === "hero" ? activeVisual.label : getHeroSkinAcquisitionDisplayLabel(hero.heroId, activeVisual.skinId, activeVisual.sourceOrder)}</div>
                  <div className="mt-0.5 text-muted-foreground">{visualIndex + 1} / {visuals.length}</div>
                </div>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col justify-center p-4 sm:p-5 lg:p-6">
              {rarityIconPath ? (
                <img
                  src={resolvePublicAssetUrl(rarityIconPath)}
                  alt={`${displayRarityLabel} 등급`}
                  title={displayRarityLabel}
                  loading="eager"
                  decoding="async"
                  className="mb-2 h-8 w-auto self-start object-contain sm:h-9"
                />
              ) : (
                <p className="mb-2 text-sm font-black tracking-[0.16em] text-muted-foreground">{displayRarityLabel}</p>
              )}
              <h1 className="text-3xl font-bold tracking-tight text-foreground [word-break:keep-all] [overflow-wrap:break-word] sm:text-4xl lg:text-5xl">{displayName}</h1>
              <div className="mt-3 space-y-0.5 text-sm text-muted-foreground">
                <p>{hero.identity.nameCn}</p>
                {hero.identity.nameEn ? <p>{hero.identity.nameEn}</p> : null}
              </div>

              <div className="mt-7">
                <p className="font-semibold text-foreground">CV. {detail.presentation.cvState === "NONE" ? "-" : (detail.presentation.cvNameKr ?? detail.presentation.cvSourceValue ?? "-")}</p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {factionMarks.map((faction) => (
                    <img
                      key={faction.factionId}
                      src={resolvePublicAssetUrl(faction.webAssetPath)}
                      alt={faction.label}
                      title={faction.label}
                      loading="eager"
                      decoding="async"
                      className="h-10 w-10 object-contain"
                    />
                  ))}
                </div>

              </div>
            </div>
          </div>

          {hasSpForm || isMatthew ? (
            <div
              className="border-t border-border bg-muted/15 p-3 sm:p-4"
              data-hero-form-switch="true"
              data-active-hero-form={isSpForm ? "sp" : "normal"}
              data-active-matthew-variant={isMatthew ? matthewVariant : undefined}
            >
              {isMatthew ? (
                <div className="space-y-2" data-matthew-form-controls="true">
                  <div
                    className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/35 p-1.5 sm:grid-cols-4"
                    role="group"
                    aria-label="매튜 기본 전직 분기 선택"
                  >
                    {MATTHEW_VARIANTS.map((variant) => {
                      const active = matthewVariant === variant.id;
                      const shortLabel =
                        variant.id === "cavalry" ? "기병" :
                        variant.id === "flying" ? "비병" :
                        variant.id === "archer" ? "궁병" :
                        "암살";
                      return (
                        <button
                          key={variant.id}
                          type="button"
                          aria-label={variant.label}
                          aria-pressed={active}
                          data-matthew-variant-option={variant.id}
                          onClick={() => setMatthewVariant(variant.id)}
                          className={`rounded-xl px-3 py-3 text-sm font-extrabold transition sm:text-base ${active ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}
                        >
                          {shortLabel}
                        </button>
                      );
                    })}
                  </div>
                  {hasSpForm ? (
                    <div
                      className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/35 p-1.5"
                      role="group"
                      aria-label="매튜 전직 형태 선택"
                    >
                      <button
                        type="button"
                        aria-label="기본 전직"
                        aria-pressed={!isSpForm}
                        onClick={() => setFormMode("normal")}
                        className={`rounded-xl px-3 py-3 text-sm font-extrabold transition sm:text-base ${!isSpForm ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}
                      >
                        기본전직
                      </button>
                      <button
                        type="button"
                        aria-label="SP 전직"
                        aria-pressed={isSpForm}
                        data-matthew-sp-form-option="true"
                        onClick={() => setFormMode("sp")}
                        className={`rounded-xl px-3 py-3 text-sm font-extrabold transition sm:text-base ${isSpForm ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}
                      >
                        SP전직
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/35 p-1.5" role="group" aria-label="전직 형태 선택">
                  <button
                    type="button"
                    aria-label="기본 전직"
                    aria-pressed={!isSpForm}
                    onClick={() => setFormMode("normal")}
                    className={`rounded-xl px-4 py-3 text-sm font-extrabold transition sm:text-base ${!isSpForm ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}
                  >
                    기본전직 보기
                  </button>
                  <button
                    type="button"
                    aria-label="SP 전직"
                    aria-pressed={isSpForm}
                    onClick={() => setFormMode("sp")}
                    className={`rounded-xl px-4 py-3 text-sm font-extrabold transition sm:text-base ${isSpForm ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}
                  >
                    SP전직 보기
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </section>

        <section
          className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
          data-hero-talent-carousel="true"
          data-hero-form-mode={isSpForm ? "sp" : "normal"}
        >
          <SectionTitle title="고유기" />
          {activeTalentRow ? (
            <div
              className="mt-4"
              data-hero-talent-active-star={activeTalentRow.star}
              data-hero-talent-min-star={visibleTalentProgression[0]?.star ?? ""}
              data-hero-talent-max-star={visibleTalentProgression[visibleTalentProgression.length - 1]?.star ?? ""}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-stretch gap-2 sm:gap-3">
                <button
                  type="button"
                  aria-label="낮은 성급 고유기 보기"
                  onClick={() => moveTalent(-1)}
                  disabled={!previousTalentRow}
                  data-hero-talent-nav-direction="lower"
                  className="group flex h-full w-[34px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-primary/35 bg-primary/5 px-0 text-primary shadow-sm transition hover:border-primary/60 hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:bg-background disabled:text-muted-foreground disabled:opacity-30 sm:w-[38px]"
                >
                  <ChevronLeft className="h-6 w-6 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                  {previousTalentRow ? (
                    <span className="text-xs font-extrabold leading-none">{previousTalentRow.star}성</span>
                  ) : null}
                </button>
                <article key={`${activeTalentRow.star}-${activeTalentRow.skillId}`} className="min-w-0 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <HeroSkillIcon heroId={hero.heroId} skill={activeTalentRow.skill} variant="talent" />
                    <h3 className="min-w-0 flex-1 font-bold text-foreground" data-hero-talent-name="true">
                      {activeTalentRow.skill.nameCn ?? "스킬"}
                    </h3>
                  </div>
                  <div
                    className="mt-2 tracking-[0.08em] text-amber-500"
                    data-hero-talent-star-display={activeTalentRow.star}
                    aria-label={`${activeTalentRow.star}성`}
                  >
                    <span aria-hidden="true">{"★".repeat(activeTalentRow.star)}</span>
                  </div>
                  <p
                    className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground"
                    data-hero-talent-description="true"
                  >
                    {stripConfigMarkup(activeTalentRow.skill.desc)}
                  </p>
                </article>
                <button
                  type="button"
                  aria-label="높은 성급 고유기 보기"
                  onClick={() => moveTalent(1)}
                  disabled={!nextTalentRow}
                  data-hero-talent-nav-direction="higher"
                  className="group flex h-full w-[34px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-primary/35 bg-primary/5 px-0 text-primary shadow-sm transition hover:border-primary/60 hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:bg-background disabled:text-muted-foreground disabled:opacity-30 sm:w-[38px]"
                >
                  <ChevronRight className="h-6 w-6 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  {nextTalentRow ? (
                    <span className="text-xs font-extrabold leading-none">{nextTalentRow.star}성</span>
                  ) : null}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 고유기 progression이 없어.</p>
          )}
        </section>

        <div
          className="mt-5 grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&_[data-hero-exclusive-equipment]]:order-1 [&_[data-hero-central-discipline]]:order-2 [&_[data-hero-bond-section]]:order-3 [&_[data-hero-soldier-command]]:order-4 lg:[&_[data-hero-exclusive-equipment]]:order-1 lg:[&_[data-hero-bond-section]]:order-2 lg:[&_[data-hero-soldier-command]]:order-1 lg:[&_[data-hero-central-discipline]]:order-2"
          data-hero-upper-support-grid="independent-columns"
        >
          <div className="contents content-start gap-5 [&>section]:mt-0 lg:grid lg:min-w-0" data-hero-upper-support-column="left">
            <HeroExclusiveEquipmentSection exclusiveEquipment={exclusiveEquipment} />

            <section className="mt-5 min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-bond-section="true">
          <SectionTitle title="유대" />
          {hasBondUnlockConditions ? (
            <div className="mt-5 grid grid-cols-1 gap-2" data-hero-bond-unlock-grid="true">
              {detail.bonds.rows.flatMap((bond) => {
                const favorabilityLevel = bond.completionConditions.find((condition) => condition.favorability)?.favorability?.requiredLevel ?? null;
                const fetterIconNumber = favorabilityLevel == null ? null : (FETTER_ICON_BY_FAVORABILITY_LEVEL[favorabilityLevel] ?? null);
                const fetterIconUrl = fetterIconNumber == null ? null : resolvePublicAssetUrl(`/images/fetter/Fetter${fetterIconNumber}.png`);
                return bond.completionConditions
                  .filter((condition) => !condition.favorability)
                  .map((condition, conditionIndex) => (
                    <div key={`${bond.fetterId ?? bond.order}-${conditionIndex}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-3">
                      {fetterIconUrl && fetterIconNumber != null ? (
                        <div className="flex shrink-0 items-center gap-2" data-hero-bond-unlock-number={fetterIconNumber}>
                          <img src={fetterIconUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-8 w-8 shrink-0 object-contain" />
                          <span className="whitespace-nowrap text-xs font-extrabold text-foreground">유대 {fetterIconNumber}</span>
                        </div>
                      ) : null}
                      <p className="min-w-0 text-xs font-semibold leading-5 text-foreground">{formatBondCondition(condition, jobNameByConnectionId)}</p>
                    </div>
                  ));
              })}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 유대 해금 조건 없음</p>
          )}
          <HeroBondMaterialsPanel materials={bondMaterials} resolveAssetUrl={resolvePublicAssetUrl} />
            </section>
          </div>

          <div className="contents content-start gap-5 [&>section]:mt-0 lg:grid lg:min-w-0" data-hero-upper-support-column="right">
            <HeroSoldierCommandSection soldierCommand={soldierCommand} mode={isSpForm ? "sp" : "normal"} />
            <HeroCentralDisciplineSection centralDiscipline={detail.centralDiscipline} castingLaw={castingLaw} />
          </div>
        </div>

        <section
          className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
          data-hero-soldier-cards="true"
        >
          <SectionTitle title="사용 가능 용병" />
          <div className="mt-4 grid grid-cols-6 gap-1.5 lg:grid-cols-8 lg:gap-2" data-hero-soldier-card-grid="true">
            {soldierCards.map((record) => (
              <div
                key={record.soldierId}
                data-hero-soldier-card-slot="true"
                className="min-w-0"
              >
                <HeroSoldierCard
                  record={record}
                  onOpen={setSelectedSoldierId}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle title="스킬" />

          <div className="mt-5" data-hero-equipable-skills="true" data-equipable-skill-count={equipableSkills.length}>
            {equipableSkills.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {equipableSkills.map((skill) => <SkillCard key={`equipable-${skill.skillId}`} heroId={hero.heroId} skill={skill} />)}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 스킬 없음</p>
            )}
          </div>

          <div className="mt-7 border-t border-border pt-5" data-hero-awakening-skill="true">
            <h3 className="mb-3 text-sm font-bold text-foreground">각성기</h3>
            {detail.skills.awakening.status === "VERIFIED" && detail.skills.awakening.skill ? (
              <div className="grid gap-3">
                <SkillCard heroId={hero.heroId} skill={detail.skills.awakening.skill} />
              </div>
            ) : detail.skills.awakening.status === "NONE" ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">각성기 없음</p>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">각성기 없음</p>
            )}
            <HeroAwakeningMaterialsSection heroId={hero.heroId} />
          </div>

          {isSpForm ? (
            <div
              className="mt-7 border-t border-border pt-5"
              data-hero-sp-reward-skills="true"
              data-sp-reward-skill-count={detail.sp.secondStageRewards.skills.length}
            >
              <h3 className="mb-3 text-sm font-bold text-foreground">SP 2차 보상 스킬</h3>
              {detail.sp.secondStageRewards.skills.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {detail.sp.secondStageRewards.skills.map((skill) => (
                    <SkillCard key={`sp-reward-${skill.skillId}`} heroId={hero.heroId} skill={skill} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">SP 2차 보상 스킬 확인 필요</p>
              )}
            </div>
          ) : null}
        </section>

        <HeroJobMaterialsSection
          heroId={hero.heroId}
          mode={isSpForm ? "sp" : "normal"}
          allowedJobConnectionIds={selectedMatthewJobConnectionIds}
        />

        <section
          className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
          data-hero-final-job-stats-section="true"
          data-hero-form-mode={isSpForm ? "sp" : "normal"}
        >
          <SectionTitle title="최종 직업 스탯" />
          {finalJobRows.length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-xl border border-border" data-hero-final-job-stats="true" data-final-job-stat-candidate-count={finalJobStatBars.candidateCount}>
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">직업</th>
                    <HeroStatHeader stat="HP" />
                    <HeroStatHeader stat="ATK" />
                    <HeroStatHeader stat="INT" />
                    <HeroStatHeader stat="DEF" />
                    <HeroStatHeader stat="MDEF" />
                    <HeroStatHeader stat="DEX" />
                  </tr>
                </thead>
                <tbody>
                  {finalJobRows.map(({ key, capstone }) => {
                    if (!capstone) return null;
                    return (
                      <Fragment key={key}>
                        <tr className="border-b border-border/60" data-final-job-id={capstone.jobId ?? ""}>
                          <th scope="row" className="px-4 pb-2 pt-3 text-left">
                            <div className="font-bold text-foreground">
                              {(isSpForm
                                ? resolveHeroSpJobNameKr({
                                    jobId: capstone.jobId ?? null,
                                    nameCn: capstone.nameCn ?? null,
                                  })
                                : resolveHeroFinalJobNameKr({
                                    jobId: capstone.jobId ?? null,
                                    nameCn: capstone.nameCn ?? null,
                                  })) ?? capstone.nameCn ?? "전직"}
                            </div>
                          </th>
                          <JobStatCell stat="HP" value={capstone.finalStats.HP} domain={finalJobStatBars.domains.HP} />
                          <JobStatCell stat="ATK" value={capstone.finalStats.ATK} domain={finalJobStatBars.domains.ATK} />
                          <JobStatCell stat="INT" value={capstone.finalStats.INT} domain={finalJobStatBars.domains.INT} />
                          <JobStatCell stat="DEF" value={capstone.finalStats.DEF} domain={finalJobStatBars.domains.DEF} />
                          <JobStatCell stat="MDEF" value={capstone.finalStats.MDEF} domain={finalJobStatBars.domains.MDEF} />
                          <JobStatCell stat="DEX" value={capstone.finalStats.DEX} domain={finalJobStatBars.domains.DEX} />
                        </tr>
                        {capstone.centralBondStats ? (
                          <tr className="border-b border-border last:border-b-0 bg-muted/20" data-hero-central-bond-stat-row="true">
                            <th scope="row" className="px-4 pb-3 pt-2 text-left text-xs font-semibold text-muted-foreground">└ 중앙유대</th>
                            <JobStatBonusCell value={capstone.centralBondStats.HP} />
                            <JobStatBonusCell value={capstone.centralBondStats.ATK} />
                            <JobStatBonusCell value={capstone.centralBondStats.INT} />
                            <JobStatBonusCell value={capstone.centralBondStats.DEF} />
                            <JobStatBonusCell value={capstone.centralBondStats.MDEF} />
                            <JobStatBonusCell value={capstone.centralBondStats.DEX} />
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 3단계 최종 직업 스탯이 없어.</p>
          )}
        </section>

        <section
          className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
          data-hero-heart-fetter="true"
          data-hero-form-mode={isSpForm ? "sp" : "normal"}
          data-heart-fetter-effect-count={heartFetterRows.reduce((sum, row) => sum + row.effects.length, 0)}
        >
          <SectionTitle title="유대 Lv4 / Lv7 효과" />
          {heartFetterRows.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {heartFetterRows.map((row) => (
                <article key={row.jobId} className="rounded-xl border border-border bg-muted/20 p-4" data-heart-fetter-job-id={row.jobId}>
                  <h3 className="font-bold text-foreground">{row.jobName}</h3>
                  <div className="mt-3 space-y-2">
                    {row.effects.map((effect) => (
                      <div
                        key={`${effect.level}-${effect.skillId}`}
                        className="rounded-lg border border-border bg-background px-3 py-3"
                        data-heart-fetter-level={effect.level}
                        data-heart-fetter-skill-id={effect.skillId}
                        data-heart-fetter-mapping-mode={effect.mappingMode}
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-muted px-2 py-1 text-[11px] font-black text-foreground">Lv.{effect.level}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{stripConfigMarkup(effect.text)}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 유대 Lv4/Lv7 효과 없음</p>
          )}
        </section>

        {isSpForm ? (
          <HeroSpMissionSection
            missions={detail.sp.missions}
            secondStageRewardSoldierNames={detail.sp.secondStageRewards.soldiers.map(
              (soldier) => soldier.displayName,
            )}
          />
        ) : null}



      </div>

      {selectedSoldierRecord ? (
        <SoldierDetailDialog
          record={selectedSoldierRecord}
          heroCardIcons={heroCardIconIndex.records}
          onClose={closeSoldierDetail}
        />
      ) : null}
    </main>
  );
}

type SkillView = { skillId: number; nameCn: string | null; desc: string | null; iconPath: string | null; displayType: string | null; cooldown: string | null; range: string | null; areaOrTarget: string | null; cost?: number | null };
type HeroSoldierCardView = { soldierId: number; nameKr: string | null; nameCn: string; nameKrStatus: string; tier: number; armyType: string; isSp: boolean };

const SOLDIER_ARMY_LABELS: Record<string, string> = {
  INFANTRY: "보병",
  LANCER: "창병",
  CAVALRY: "기병",
  FLYING: "비병",
  WATER: "수병",
  ARCHER: "궁병",
  ASSASSIN: "암살자",
  MAGE: "마법사",
  HOLY: "승병",
  DEMON: "마족",
};

function HeroSoldierCard({
  record,
  onOpen,
}: {
  record: HeroSoldierCardView;
  onOpen: (soldierId: number) => void;
}) {
  const displayName = record.nameKr ?? record.nameCn;
  const portraitUrl = getOfficialSoldierPortraitUrl(record.soldierId);
  const armyIconUrl = getOfficialArmyIconUrl(record.armyType);
  const armyLabel = SOLDIER_ARMY_LABELS[record.armyType] ?? record.armyType;
  const [portraitFailed, setPortraitFailed] = useState(false);

  return (
    <Link
      reloadDocument
      to="/soldiers/$soldierId"
      params={{ soldierId: String(record.soldierId) }}
      aria-label={`${displayName} 용병 상세 보기`}
      title={`${displayName} · Soldier ${record.soldierId}`}
      data-hero-soldier-card="true"
      data-soldier-id={record.soldierId}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        onOpen(record.soldierId);
      }}
      className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted pb-8 text-muted-foreground transition group-hover:text-foreground">
        {portraitUrl && !portraitFailed ? (
          <img
            src={portraitUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain object-bottom px-1 pb-7 pt-2 transition-transform duration-200 group-hover:scale-[1.02]"
            onError={() => setPortraitFailed(true)}
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-current/20 bg-background/70 sm:h-16 sm:w-16">
            <span className="text-base font-black tracking-tight sm:text-lg">{armyLabel.slice(0, 1)}</span>
          </div>
        )}
      </div>

      <div className="absolute left-1.5 top-1.5 flex gap-1">
        <span className="rounded bg-black/65 px-1.5 py-0.5 text-[12px] font-bold leading-none text-white sm:text-[13px]">
          {record.isSp ? "SP" : `T${record.tier}`}
        </span>
      </div>

      <div className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded bg-background/80 px-1 shadow-sm backdrop-blur" title={armyLabel}>
        {armyIconUrl ? <img src={armyIconUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-5 w-5 object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="text-[10px] font-bold text-foreground">{armyLabel.slice(0, 1)}</span>}
        <span className="sr-only">{armyLabel}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1.5 text-center backdrop-blur-[1px]">
        <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white sm:text-xs">{displayName}</span>
      </div>
    </Link>
  );
}

function HeroSkillIcon({
  heroId,
  skill,
  variant = "default",
}: {
  heroId: number;
  skill: SkillView;
  variant?: "default" | "talent";
}) {
  const iconUrl = getHeroSkillIconUrl(heroId, skill.iconPath);
  if (!iconUrl) return null;
  const isTalent = variant === "talent";
  return (
    <div
      data-hero-skill-icon-variant={variant}
      className={isTalent
        ? "flex h-16 w-16 shrink-0 items-center justify-center"
        : "flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-1.5 shadow-sm"}
    >
      <img
        src={iconUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className={isTalent ? "h-auto max-h-16 w-16 object-contain" : "h-full w-full object-contain"}
        style={isTalent
          ? { clipPath: "polygon(26% 6%, 74% 6%, 94% 50%, 74% 90%, 27% 90%, 6% 50%)" }
          : undefined}
      />
    </div>
  );
}

function SkillCard({ heroId, skill }: { heroId: number; skill: SkillView }) {
  const cooldown = getVisibleHeroSkillMetadataValue(skill.cooldown);
  const range = getVisibleHeroSkillMetadataValue(skill.range);
  const areaOrTarget = getVisibleHeroSkillMetadataValue(skill.areaOrTarget);
  const hasMetadata = Boolean(
    skill.displayType ||
    cooldown ||
    range ||
    areaOrTarget ||
    Number.isInteger(skill.cost),
  );
  return (
    <article className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <HeroSkillIcon heroId={heroId} skill={skill} />
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-foreground">{skill.nameCn ?? "스킬"}</h4>
          {hasMetadata ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-300" data-hero-skill-metadata="true">
              {skill.displayType ? <span className="rounded bg-zinc-800 px-2 py-1">{getHeroSkillDisplayTypeLabelKr(skill.displayType)}</span> : null}
              {cooldown ? <span className="rounded bg-zinc-800 px-2 py-1">쿨 {cooldown}</span> : null}
              {range ? <span className="rounded bg-zinc-800 px-2 py-1">사거리 {range}</span> : null}
              {areaOrTarget ? <span className="rounded bg-zinc-800 px-2 py-1">범위 {areaOrTarget}</span> : null}
              {Number.isInteger(skill.cost) ? <span className="rounded bg-zinc-800 px-2 py-1">{skill.cost}코스트</span> : null}
            </div>
          ) : null}
          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(skill.desc)}</p>
        </div>
      </div>
    </article>
  );
}

type SpMaterialView = {
  goodsType: number | null;
  sourceId: number | null;
  count: number | null;
};

type SpMissionView = {
  missionId: number | null;
  phase: string | null;
  titleCn: string | null;
  descCn: string | null;
  missionType: number | null;
  condition: {
    kind: string | null;
    items: SpMaterialView[];
    equipmentId: number | null;
    requiredLevel: number | null;
    requiredHeroIds: number[];
    requiredHeroNames: string[];
    activityType: number | null;
    routeType: number | null;
    stageId: number | null;
    stageIds: number[];
    clearCount: number | null;
  };
};

function SpMaterialIcon({
  material,
  context,
}: {
  material: SpMaterialView;
  context: string;
}) {
  const presentation = getHeroSpMaterialPresentation(material.goodsType, material.sourceId);
  if (!presentation) {
    throw new Error(
      `${context} has no admitted SP material icon for GoodsType=${String(material.goodsType)} Id=${String(material.sourceId)}.`,
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] font-semibold text-foreground"
      title={presentation.displayName}
      data-sp-material-goods-type={material.goodsType ?? undefined}
      data-sp-material-source-id={material.sourceId ?? undefined}
    >
      <img
        src={presentation.iconUrl}
        alt={presentation.displayName}
        loading="lazy"
        decoding="async"
        className="h-8 w-8 shrink-0 object-contain"
      />
      <span className="tabular-nums">×{material.count ?? "?"}</span>
    </span>
  );
}

const HERO_SP_DUNGEON_WEEKDAY_SHORT_LABEL = {
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
  MON: "월",
  TUE: "화",
} as const;

function getHeroSpDungeonOpenDayText(event: {
  dungeonGroup: "ANIKI" | "GODDESS" | "TEMPLE";
  openWeekdays: readonly (keyof typeof HERO_SP_DUNGEON_WEEKDAY_SHORT_LABEL)[];
}) {
  const weekdays =
    event.dungeonGroup === "ANIKI"
      ? event.openWeekdays.filter((weekday) => weekday !== "SUN")
      : event.openWeekdays;
  return `${weekdays.map((weekday) => HERO_SP_DUNGEON_WEEKDAY_SHORT_LABEL[weekday]).join(", ")} 오픈`;
}

const HERO_SP_DUNGEON_SCENARIO_OPTIONS: ReadonlyArray<{
  id: HeroSpDungeonScenario;
  label: string;
}> = [
  { id: "ANIKI_ALL", label: "1. 형귀 전부 오픈" },
  { id: "GODDESS_ALL", label: "2. 여신의 시련 전부 오픈" },
  { id: "BOTH_ALL", label: "3. 형귀 + 여신의 시련 전부 오픈" },
  { id: "NORMAL", label: "4. 일반 일정" },
];

function HeroSpMissionSection({
  missions,
  secondStageRewardSoldierNames,
}: {
  missions: { firstStage: SpMissionView[]; secondStage: SpMissionView[] };
  secondStageRewardSoldierNames: string[];
}) {
  const [activeView, setActiveView] = useState<"missions" | "schedule">("schedule");
  const [dungeonScenario, setDungeonScenario] = useState<HeroSpDungeonScenario>("NORMAL");
  const [hourglassCount, setHourglassCount] = useState<0 | 1 | 2>(1);
  const dungeonSchedule = useMemo(
    () => simulateHeroSpDungeonSchedule(missions, dungeonScenario),
    [missions, dungeonScenario],
  );
  const hourglassRecommendation = useMemo(
    () => recommendHeroSpHourglass(missions, dungeonScenario, hourglassCount),
    [missions, dungeonScenario, hourglassCount],
  );
  const singleHourglassRecommendation = useMemo(
    () => recommendHeroSpHourglass(missions, dungeonScenario, 1),
    [missions, dungeonScenario],
  );
  const singleHourglassCompletionSchedule = useMemo(() => {
    if (singleHourglassRecommendation.combinations.length === 0) {
      return simulateHeroSpDungeonSchedule(missions, dungeonScenario);
    }
    return simulateHeroSpDungeonSchedule(
      missions,
      dungeonScenario,
      singleHourglassRecommendation.combinations[0]?.map((candidate) => candidate.missionKey) ?? [],
    );
  }, [missions, dungeonScenario, singleHourglassRecommendation.combinations]);
  const requestedHourglassCompletionSchedule = useMemo(() => {
    if (hourglassRecommendation.combinations.length === 0) {
      return simulateHeroSpDungeonSchedule(missions, dungeonScenario);
    }
    return simulateHeroSpDungeonSchedule(
      missions,
      dungeonScenario,
      hourglassRecommendation.combinations[0]?.map((candidate) => candidate.missionKey) ?? [],
    );
  }, [missions, dungeonScenario, hourglassRecommendation.combinations]);
  const twoHourglassesAddNoCompletionBenefit =
    hourglassCount === 2 &&
    requestedHourglassCompletionSchedule.finalDayOffset >= singleHourglassCompletionSchedule.finalDayOffset;
  const hourglassCompletionSchedule = twoHourglassesAddNoCompletionBenefit
    ? singleHourglassCompletionSchedule
    : requestedHourglassCompletionSchedule;
  const hourglassTargetKeys = useMemo(() => {
    if (hourglassCount === 0) {
      return new Set<string>();
    }
    if (hourglassCount === 1 || twoHourglassesAddNoCompletionBenefit) {
      return new Set(
        singleHourglassRecommendation.combinations.flatMap((combination) =>
          combination.map((candidate) => candidate.missionKey),
        ),
      );
    }
    return new Set(
      hourglassRecommendation.combinations[0]?.map((candidate) => candidate.missionKey) ?? [],
    );
  }, [
    hourglassCount,
    hourglassRecommendation.combinations,
    singleHourglassRecommendation.combinations,
    twoHourglassesAddNoCompletionBenefit,
  ]);

  if (missions.firstStage.length === 0 && missions.secondStage.length === 0) return null;
  if (missions.secondStage.length > 0 && secondStageRewardSoldierNames.length === 0) {
    throw new Error("Released SP second-stage missions have no frozen reward Soldier display name.");
  }

  const secondStageCompletionText =
    secondStageRewardSoldierNames.join(", ") + " 사용가능, 스탯보너스, SP 스킬 2개 획득";

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-sp-missions="true"
      data-sp-first-stage-count={missions.firstStage.length}
      data-sp-second-stage-count={missions.secondStage.length}
      data-sp-mission-view={activeView}
    >
      <SectionTitle title="SP 전직 미션" />

      <div
        className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/30 p-1.5"
        role="tablist"
        aria-label="SP 전직 미션 보기"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "missions"}
          onClick={() => setActiveView("missions")}
          className={`rounded-lg px-3 py-2.5 text-sm font-extrabold transition ${
            activeView === "missions"
              ? "bg-background text-foreground shadow-sm ring-1 ring-border"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
          }`}
          data-sp-mission-tab="missions"
        >
          모든 미션
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "schedule"}
          onClick={() => setActiveView("schedule")}
          className={`rounded-lg px-3 py-2.5 text-sm font-extrabold transition ${
            activeView === "schedule"
              ? "bg-background text-foreground shadow-sm ring-1 ring-border"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
          }`}
          data-sp-mission-tab="schedule"
        >
          SP 완료 계산기
        </button>
      </div>

      {activeView === "missions" ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2" role="tabpanel">
          <SpMissionPhase title="1차 전직" missions={missions.firstStage} completionText="SP전직 및 고유기 획득" />
          <SpMissionPhase title="2차 전직" missions={missions.secondStage} completionText={secondStageCompletionText} />
        </div>
      ) : (
        <div className="mt-5 space-y-4" role="tabpanel" data-sp-dungeon-calculator="true">
          <div className="rounded-xl border border-border bg-muted/10 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground">오픈 조건</h3>
              <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-bold text-muted-foreground">
                수요일 시작
              </span>
            </div>
            <div
              className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
              role="group"
              aria-label="던전 오픈 조건"
            >
              {HERO_SP_DUNGEON_SCENARIO_OPTIONS.map((option) => {
                const active = dungeonScenario === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDungeonScenario(option.id)}
                    className={`min-h-11 rounded-lg border px-3 py-2.5 text-left text-sm font-bold transition ${
                      active
                        ? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/20"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-sp-dungeon-scenario={option.id}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="rounded-xl border border-border bg-muted/10 p-3 sm:p-4"
            data-sp-hourglass-recommendation="true"
            data-sp-hourglass-count={hourglassCount}
            data-sp-hourglass-saved-days={hourglassRecommendation.savedDays}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground">시간의 모래시계 사용</h3>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="시간의 모래시계 개수">
              {([0, 1, 2] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={hourglassCount === count}
                  onClick={() => setHourglassCount(count)}
                  className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-extrabold transition ${
                    hourglassCount === count
                      ? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/20"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                  data-sp-hourglass-count-option={count}
                >
                  {count}개
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/10 p-3 sm:p-4">
            <h3 className="text-sm font-bold text-foreground">던전 진행 순서</h3>
            {dungeonSchedule.events.length > 0 ? (
              <ol className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {dungeonSchedule.events.map((event) => {
                  const hourglassTarget = hourglassTargetKeys.has(event.missionKey);
                  return (
                    <li
                      key={event.missionKey}
                      className={`min-w-[6.5rem] flex-1 rounded-lg border px-3 py-2 text-center transition ${
                        hourglassTarget
                          ? "border-primary/70 bg-primary/15 shadow-sm ring-2 ring-primary/30"
                          : "border-border bg-background"
                      }`}
                      data-sp-dungeon-mission-key={event.missionKey}
                      data-sp-dungeon-day-offset={event.dayOffset}
                      data-sp-dungeon-weekday={event.weekday}
                      data-sp-hourglass-target={hourglassTarget ? "true" : "false"}
                    >
                      <div className="text-sm font-extrabold text-foreground">{event.labelKr}</div>
                      <div className={`mt-1 text-xs font-bold ${
                        hourglassTarget ? "text-foreground" : "text-muted-foreground"
                      }`}>
                        {getHeroSpDungeonOpenDayText(event)}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
            <div className="mt-3 text-center text-sm font-black text-foreground">
              수요일 시작 → {HERO_SP_DUNGEON_WEEKDAY_LABEL[
                (["WED", "THU", "FRI", "SAT", "SUN", "MON", "TUE"] as const)[
                  hourglassCompletionSchedule.finalDayOffset % 7
                ] ?? "WED"
              ]} 완료
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SpMissionPhase({
  title,
  missions,
  completionText,
}: {
  title: string;
  missions: SpMissionView[];
  completionText: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-3 sm:p-4">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <ol className="mt-3 space-y-2">
        {missions.map((mission, index) => (
          <li key={mission.missionId ?? index} className="rounded-lg border border-border bg-background px-3 py-3" data-sp-mission-id={mission.missionId ?? undefined}>
            <div className="text-sm font-bold text-foreground">{index + 1}단계</div>
            {mission.condition.items.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="필요 재료">
                {mission.condition.items.map((item, itemIndex) => (
                  <SpMaterialIcon
                    key={String(mission.missionId ?? index) + "-material-" + itemIndex}
                    material={item}
                    context={`SP mission ${String(mission.missionId ?? index)}`}
                  />
                ))}
              </div>
            ) : null}
            {formatSpMissionCondition(mission) ? <p className="mt-2 text-xs font-semibold leading-5 text-foreground">{formatSpMissionCondition(mission)}</p> : null}
            {index === missions.length - 1 ? (
              <p className="mt-2 text-xs font-extrabold leading-5 text-foreground" data-sp-mission-completion-reward="true">
                {completionText}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatSpMissionCondition(mission: SpMissionView) {
  const condition = mission.condition;
  if (condition.kind === "EXCLUSIVE_EQUIPMENT_LEVEL") {
    return "전용장비 · Lv." + (condition.requiredLevel ?? "?") + " 달성";
  }

  const stageLabelKr = resolveHeroSpMissionStageLabelKr(condition);
  const requiredHeroNames = condition.requiredHeroNames.join(", ");
  if (condition.kind === "CLEAR_STORY_STAGE_WITH_HEROES") {
    return requiredHeroNames + " 포함 · " + (stageLabelKr ?? ("Stage " + (condition.stageId ?? "?"))) + " · " + (condition.clearCount ?? 1) + "회 클리어";
  }
  if (condition.kind === "CLEAR_ACTIVITY_STAGE_WITH_HEROES") {
    return requiredHeroNames + " 포함 · " + (stageLabelKr ?? ("Stage " + condition.stageIds.join(", "))) + " · " + (condition.clearCount ?? 1) + "회 클리어";
  }
  if (condition.kind === "CLEAR_ACTIVITY_STAGE_SOLO_OR_SPECIFIED") {
    return requiredHeroNames + " 단독 · " + (stageLabelKr ?? ("Stage " + (condition.stageId ?? "?"))) + " · " + (condition.clearCount ?? 1) + "회 클리어";
  }
  return null;
}

function formatBondCondition(
  condition: { requiredHero: { heroId: number | null; nameKr: string | null; nameCn: string | null; nameEn: string | null } | null; mission: { missionId: number | null; title: string | null; desc: string | null; missionType: number | null; param2: number | null } | null; stage: { stageId: number | null; nameCn: string | null } | null; favorability: { targetHeroId: number | null; targetHeroNameKr: string | null; targetHeroNameCn: string | null; targetHeroNameEn: string | null; requiredLevel: number | null } | null },
  jobNameByConnectionId: ReadonlyMap<number, string>,
) {
  if (condition.favorability) {
    const targetName = condition.favorability.targetHeroNameKr ?? condition.favorability.targetHeroNameCn ?? condition.favorability.targetHeroNameEn ?? "영웅";
    return `${targetName} 호감도 Lv.${condition.favorability.requiredLevel ?? "?"}`;
  }
  if (condition.requiredHero) {
    const heroName = condition.requiredHero.nameKr ?? condition.requiredHero.nameCn ?? condition.requiredHero.nameEn ?? `Hero ${condition.requiredHero.heroId ?? "?"}`;
    const stageName = condition.stage?.nameCn ?? condition.mission?.desc ?? condition.mission?.title;
    const heroNameWithParticle = withKoreanParticle(heroName, "와/과");
    return stageName ? `${heroNameWithParticle} 함께 · ${stageName}` : `${heroName} 필요`;
  }
  if (condition.mission?.missionType === 29 && condition.mission.param2 != null) {
    const jobName = jobNameByConnectionId.get(condition.mission.param2);
    if (jobName) return `전직 · ${jobName}`;
  }
  if (condition.stage?.nameCn) return condition.stage.nameCn;
  if (condition.mission?.desc) return condition.mission.desc;
  if (condition.mission?.title) return condition.mission.title;
  return "해금 조건 확인됨";
}

function SectionTitle({ title }: { title: string }) { return <h2 className="font-bold text-foreground">{title}</h2>; }

type HeroFinalJobStatKey = "HP" | "ATK" | "INT" | "DEF" | "MDEF" | "DEX";

const HERO_FINAL_JOB_STAT_ICON_BY_KEY: Record<HeroFinalJobStatKey, string> = {
  HP: "Icon_HP.png",
  ATK: "Icon_Attack.png",
  INT: "Icon_Intelligence.png",
  DEF: "Icon_Defense.png",
  MDEF: "Icon_MagicDefense.png",
  DEX: "Icon_Skill.png",
};

const HERO_FINAL_JOB_STAT_LABEL_BY_KEY: Record<HeroFinalJobStatKey, string> = {
  HP: "생명",
  ATK: "공격",
  INT: "지력",
  DEF: "방어",
  MDEF: "마방",
  DEX: "기술",
};

function HeroStatLabel({
  stat,
  className,
}: {
  stat: HeroFinalJobStatKey;
  className: string;
}) {
  const iconUrl = `${import.meta.env.BASE_URL}images/shared/stats/${HERO_FINAL_JOB_STAT_ICON_BY_KEY[stat]}`;

  return (
    <span className={className} data-hero-final-job-stat-label={stat}>
      <img
        src={iconUrl}
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        className="h-4 w-4 shrink-0 object-contain"
      />
      <span>{HERO_FINAL_JOB_STAT_LABEL_BY_KEY[stat]}</span>
    </span>
  );
}

function HeroStatHeader({ stat }: { stat: HeroFinalJobStatKey }) {
  return (
    <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-muted-foreground" data-hero-final-job-stat-header={stat}>
      <HeroStatLabel stat={stat} className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap" />
    </th>
  );
}

type JobStatBarDomain = { min: number; max: number };
function getJobStatBarPercent(value: number, domain: JobStatBarDomain) {
  const normalized = (value - domain.min) / (domain.max - domain.min);
  return Math.min(100, Math.max(25, 25 + (75 * normalized)));
}
function JobStatCell({ stat, value, domain }: { stat: HeroFinalJobStatKey; value: number | null; domain: JobStatBarDomain }) {
  const barPercent = value == null ? 0 : getJobStatBarPercent(value, domain);
  return (
    <td
      className="px-4 pb-2 pt-3 text-right font-bold tabular-nums text-foreground"
      data-hero-final-job-stat={stat}
      data-stat-domain-min={domain.min}
      data-stat-domain-max={domain.max}
      data-stat-bar-percent={value == null ? undefined : barPercent.toFixed(3)}
    >
      <HeroStatLabel stat={stat} className="inline-flex items-center gap-1.5 whitespace-nowrap" />
      <div className="relative min-w-[4.5rem] overflow-hidden rounded-md bg-muted/30 px-2 py-1.5">
        {value == null ? null : (
          <div className="absolute inset-y-0 left-0 bg-foreground/10" style={{ width: `${barPercent}%` }} aria-hidden="true" />
        )}
        <span className="relative z-10">{value ?? "-"}</span>
      </div>
    </td>
  );
}
function JobStatBonusCell({ value }: { value: number | null }) { return <td className="px-4 pb-3 pt-2 text-right text-xs font-semibold tabular-nums text-muted-foreground">{value == null ? "-" : `+${value}`}</td>; }
function HeroNotFound() { return <main className="min-h-screen bg-background"><div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center"><Swords className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" /><h1 className="text-2xl font-bold text-foreground">영웅을 찾을 수 없어.</h1><p className="mt-2 text-sm text-muted-foreground">Stage 6 확정 Hero 목록에 존재하지 않는 주소야.</p><Link reloadDocument to="/heroes" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-4"><ArrowLeft className="h-4 w-4" aria-hidden="true" />영웅 목록으로</Link></div></main>; }
