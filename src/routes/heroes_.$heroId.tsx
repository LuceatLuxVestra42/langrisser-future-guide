import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SoldierDetailDialog } from "@/components/soldier-detail-dialog";
import { getOfficialArmyIconUrl } from "@/lib/army-icon-assets";
import { getStaticHeroCardIconIndex } from "@/lib/hero-card-icon-assets.static";
import { getHeroDetailRouteStage5Data } from "@/lib/hero-list.functions";
import { getHeroExclusiveEquipmentPresentation } from "@/lib/hero-exclusive-equipment.functions";
import { getHeroFusionPowerIndex } from "@/lib/hero-fusion-power.functions";
import { getHeroSkinAcquisitionDisplayLabel } from "@/lib/hero-skin-acquisition-display";
import { getHeroSkillIconUrl } from "@/lib/hero-skill-icon-assets";
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
    return { ...data, exclusiveEquipment, factionMarks, soldierCards };
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

function HeroDetailPage() {
  const { hero, detail, exclusiveEquipment, factionMarks, soldierCards } = Route.useLoaderData();
  const displayName = hero.localization.displayName || (hero.identity.nameKr ?? hero.identity.nameCn);
  const rarityIconPath = HERO_RARITY_ICON_PATH_BY_LABEL[hero.rarity.baseLabel] ?? null;
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
  const visuals: HeroVisual[] = [];
  if (imageUrl) {
    visuals.push({ kind: "hero", src: imageUrl, label: "대표 일러스트", skinId: null, sourceOrder: null });
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
  useEffect(() => setVisualIndex(0), [hero.heroId]);
  const activeVisual = visuals[visualIndex] ?? null;
  const moveVisual = (delta: number) => {
    if (visuals.length <= 1) return;
    setVisualIndex((current) => (current + delta + visuals.length) % visuals.length);
  };

  const visibleTalentProgression = detail.talent.starProgression
    .filter((row) => detail.talent.initialStar == null || row.star >= detail.talent.initialStar)
    .sort((a, b) => a.star - b.star);
  const sixStarTalentIndex = visibleTalentProgression.findIndex((row) => row.star === 6);
  const defaultTalentIndex = sixStarTalentIndex >= 0 ? sixStarTalentIndex : Math.max(visibleTalentProgression.length - 1, 0);
  const [talentIndex, setTalentIndex] = useState(defaultTalentIndex);
  useEffect(() => setTalentIndex(defaultTalentIndex), [hero.heroId, defaultTalentIndex]);
  const activeTalentRow = visibleTalentProgression[talentIndex] ?? null;
  const moveTalent = (delta: number) => {
    if (visibleTalentProgression.length <= 1) return;
    setTalentIndex((current) => Math.min(Math.max(current + delta, 0), visibleTalentProgression.length - 1));
  };
  const finalJobBranches = detail.jobs.branches.filter((branch) => branch.capstone?.rank === 4);
  const hasBondUnlockConditions = detail.bonds.rows.some((bond) => bond.completionConditions.some((condition) => !condition.favorability));
  const equipableSkillById = new Map<number, SkillView>();
  for (const skill of detail.skills.heroDirectSkills) equipableSkillById.set(skill.skillId, skill);
  for (const row of detail.skills.jobLevelAcquisitions) {
    if (!equipableSkillById.has(row.skillId)) equipableSkillById.set(row.skillId, row.skill);
  }
  const equipableSkills = [...equipableSkillById.values()];

  return (
    <main
      data-name-kr-status={hero.localization.nameKrStatus}
      data-name-source-authority={hero.localization.sourceAuthority}
      className="min-h-screen bg-background"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <Link reloadDocument to="/heroes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 영웅 목록
        </Link>

        <section className="mt-5 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)]">
            <div className="relative min-h-[357px] overflow-hidden bg-muted/25 sm:min-h-[442px] lg:min-h-[527px]">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background/70 to-transparent" />
              {activeVisual ? (
                <img src={activeVisual.src} alt={`${displayName} ${activeVisual.label}`} className="absolute inset-0 h-full w-full object-contain object-bottom px-3 pt-4 sm:px-6 sm:pt-6" />
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
                  <div>{activeVisual.kind === "hero" ? "대표 일러스트" : getHeroSkinAcquisitionDisplayLabel(hero.heroId, activeVisual.skinId, activeVisual.sourceOrder)}</div>
                  <div className="mt-0.5 text-muted-foreground">{visualIndex + 1} / {visuals.length}</div>
                </div>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col justify-center p-5 sm:p-8 lg:p-10">
              {rarityIconPath ? (
                <img
                  src={resolvePublicAssetUrl(rarityIconPath)}
                  alt={`${hero.rarity.baseLabel} 등급`}
                  title={hero.rarity.baseLabel}
                  className="mb-2 h-8 w-auto self-start object-contain sm:h-9"
                />
              ) : (
                <p className="mb-2 text-sm font-black tracking-[0.16em] text-muted-foreground">{hero.rarity.baseLabel}</p>
              )}
              <h1 className="text-4xl font-bold tracking-tight text-foreground [word-break:keep-all] [overflow-wrap:break-word] sm:text-5xl">{displayName}</h1>
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
                      className="h-10 w-10 object-contain"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-talent-carousel="true">
          <SectionTitle title="재능" />
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
                  aria-label="낮은 성급 재능 보기"
                  onClick={() => moveTalent(-1)}
                  disabled={talentIndex === 0}
                  className="flex w-10 items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30 sm:w-12"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <article key={`${activeTalentRow.star}-${activeTalentRow.skillId}`} className="min-w-0 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <HeroSkillIcon heroId={hero.heroId} skill={activeTalentRow.skill} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-foreground">{activeTalentRow.star}성 · {activeTalentRow.skill.nameCn ?? `Skill ${activeTalentRow.skillId}`}</h3>
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(activeTalentRow.skill.desc)}</p>
                    </div>
                  </div>
                </article>
                <button
                  type="button"
                  aria-label="높은 성급 재능 보기"
                  onClick={() => moveTalent(1)}
                  disabled={talentIndex === visibleTalentProgression.length - 1}
                  className="flex w-10 items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30 sm:w-12"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:justify-center" aria-label="재능 성급 선택">
                {visibleTalentProgression.map((row, index) => (
                  <button
                    key={`${row.star}-${row.skillId}-selector`}
                    type="button"
                    onClick={() => setTalentIndex(index)}
                    aria-pressed={index === talentIndex}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${index === talentIndex ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
                  >
                    {row.star}성
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 재능 progression이 없어.</p>
          )}
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle title="스킬" />

          <div className="mt-5" data-hero-equipable-skills="true" data-equipable-skill-count={equipableSkills.length}>
            <h3 className="mb-3 text-sm font-bold text-foreground">장착 가능 스킬</h3>
            {equipableSkills.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {equipableSkills.map((skill) => <SkillCard key={`equipable-${skill.skillId}`} heroId={hero.heroId} skill={skill} />)}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">장착 가능 스킬 없음</p>
            )}
          </div>

          <div className="mt-7 border-t border-border pt-5" data-hero-awakening-skill="true">
            <h3 className="mb-3 text-sm font-bold text-foreground">각성기</h3>
            {detail.skills.awakening.status === "VERIFIED" && detail.skills.awakening.skill ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <SkillCard heroId={hero.heroId} skill={detail.skills.awakening.skill} />
              </div>
            ) : detail.skills.awakening.status === "NONE" ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">각성기 없음</p>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">각성기 데이터 확인 필요</p>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle title="최종 직업 스탯" />
          {finalJobBranches.length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-xl border border-border" data-hero-final-job-stats="true">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">직업</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">생명</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">공격</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">지력</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">방어</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">마방</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">기술</th>
                  </tr>
                </thead>
                <tbody>
                  {finalJobBranches.map((branch) => {
                    const capstone = branch.capstone;
                    if (!capstone) return null;
                    return (
                      <tr key={branch.branchIndex} className="border-b border-border last:border-b-0">
                        <th scope="row" className="px-4 py-3 text-left">
                          <div className="font-bold text-foreground">{capstone.nameCn ?? `Job ${capstone.jobId ?? "?"}`}</div>
                        </th>
                        <JobStatCell value={capstone.finalStats.HP} />
                        <JobStatCell value={capstone.finalStats.ATK} />
                        <JobStatCell value={capstone.finalStats.INT} />
                        <JobStatCell value={capstone.finalStats.DEF} />
                        <JobStatCell value={capstone.finalStats.MDEF} />
                        <JobStatCell value={capstone.finalStats.DEX} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 3단계 최종 직업 스탯이 없어.</p>
          )}
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle title="유대" />
          {hasBondUnlockConditions ? (
            <div className="mt-5 grid gap-2 lg:grid-cols-2">
              {detail.bonds.rows.flatMap((bond) => {
                const favorabilityLevel = bond.completionConditions.find((condition) => condition.favorability)?.favorability?.requiredLevel ?? null;
                const fetterIconNumber = favorabilityLevel == null ? null : (FETTER_ICON_BY_FAVORABILITY_LEVEL[favorabilityLevel] ?? null);
                const fetterIconUrl = fetterIconNumber == null ? null : resolvePublicAssetUrl(`/images/fetter/Fetter${fetterIconNumber}.png`);
                return bond.completionConditions
                  .filter((condition) => !condition.favorability)
                  .map((condition, conditionIndex) => (
                    <div key={`${bond.fetterId ?? bond.order}-${conditionIndex}`} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-3">
                      {fetterIconUrl ? <img src={fetterIconUrl} alt="" aria-hidden="true" className="h-9 w-9 shrink-0 object-contain" /> : null}
                      <p className="text-xs font-semibold leading-5 text-foreground">{formatBondCondition(condition)}</p>
                    </div>
                  ));
              })}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 유대 해금 조건 없음</p>
          )}
        </section>
        <HeroExclusiveEquipmentSection exclusiveEquipment={exclusiveEquipment} />
        <HeroCentralDisciplineSection centralDiscipline={detail.centralDiscipline} />

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-soldier-cards="true">
          <SectionTitle title="사용 가능 용병" />
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
            {soldierCards.map((record) => (
              <HeroSoldierCard
                key={record.soldierId}
                record={record}
                onOpen={setSelectedSoldierId}
              />
            ))}
          </div>
        </section>
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
      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        {armyIconUrl ? <img src={armyIconUrl} alt="" aria-hidden="true" className="h-5 w-5 object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="text-[10px] font-bold text-foreground">{armyLabel.slice(0, 1)}</span>}
        <span className="sr-only">{armyLabel}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1.5 text-center backdrop-blur-[1px]">
        <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white sm:text-xs">{displayName}</span>
      </div>
    </Link>
  );
}

function HeroSkillIcon({ heroId, skill }: { heroId: number; skill: SkillView }) {
  const iconUrl = getHeroSkillIconUrl(heroId, skill.iconPath);
  if (!iconUrl) return null;
  return <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-1.5 shadow-sm"><img src={iconUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-full w-full object-contain" /></div>;
}

function SkillCard({ heroId, skill }: { heroId: number; skill: SkillView }) {
  return (
    <article className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <HeroSkillIcon heroId={heroId} skill={skill} />
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-foreground">{skill.nameCn ?? `Skill ${skill.skillId}`}</h4>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-300" data-hero-skill-metadata="true">
            <span className="rounded bg-zinc-800 px-2 py-1">유형 {skill.displayType}</span>
            <span className="rounded bg-zinc-800 px-2 py-1">쿨 {skill.cooldown}</span>
            <span className="rounded bg-zinc-800 px-2 py-1">사거리 {skill.range}</span>
            <span className="rounded bg-zinc-800 px-2 py-1">범위 {skill.areaOrTarget}</span>
            {Number.isInteger(skill.cost) ? <span className="rounded bg-zinc-800 px-2 py-1">{skill.cost}코스트</span> : null}
          </div>
          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(skill.desc)}</p>
        </div>
      </div>
    </article>
  );
}

function formatBondCondition(condition: { requiredHero: { heroId: number | null; nameKr: string | null; nameCn: string | null; nameEn: string | null } | null; mission: { missionId: number | null; title: string | null; desc: string | null; missionType: number | null } | null; stage: { stageId: number | null; nameCn: string | null } | null; favorability: { targetHeroId: number | null; targetHeroNameKr: string | null; targetHeroNameCn: string | null; targetHeroNameEn: string | null; requiredLevel: number | null } | null }) {
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
  if (condition.stage?.nameCn) return condition.stage.nameCn;
  if (condition.mission?.desc) return condition.mission.desc;
  if (condition.mission?.title) return condition.mission.title;
  return "해금 조건 확인됨";
}

function SectionTitle({ title }: { title: string }) { return <h2 className="font-bold text-foreground">{title}</h2>; }
function JobStatCell({ value }: { value: number | null }) { return <td className="px-4 py-3 text-right font-bold tabular-nums text-foreground">{value ?? "-"}</td>; }
function HeroNotFound() { return <main className="min-h-screen bg-background"><div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center"><Swords className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" /><h1 className="text-2xl font-bold text-foreground">영웅을 찾을 수 없어.</h1><p className="mt-2 text-sm text-muted-foreground">Stage 6 확정 Hero 목록에 존재하지 않는 주소야.</p><Link reloadDocument to="/heroes" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-4"><ArrowLeft className="h-4 w-4" aria-hidden="true" />영웅 목록으로</Link></div></main>; }
