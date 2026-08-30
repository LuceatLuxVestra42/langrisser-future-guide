import { createFileRoute, Link } from "@tanstack/react-router";
import { RotateCcw, Search, Sparkles, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { getHeroCardIconIndex } from "@/lib/hero-card-icon-assets.functions";
import { getHeroFusionPowerIndex } from "@/lib/hero-fusion-power.functions";
import { getHeroListStage4Data } from "@/lib/hero-list.functions";
import type { HeroListStage4Record } from "@/lib/hero-list.server";

export const Route = createFileRoute("/heroes")({
  loader: async () => {
    const [data, cardIcons, fusionPowers] = await Promise.all([
      getHeroListStage4Data(),
      getHeroCardIconIndex(),
      getHeroFusionPowerIndex(),
    ]);
    if (
      cardIcons.summary.total !== 267 ||
      cardIcons.summary.resolved !== 267 ||
      cardIcons.summary.pending !== 0 ||
      cardIcons.summary.hardErrors !== 0 ||
      cardIcons.records.length !== 267
    ) {
      throw new Error("Hero card icon frozen index is not production-ready.");
    }
    if (
      fusionPowers.summary.total !== 43 ||
      fusionPowers.summary.factionTargets !== 41 ||
      fusionPowers.summary.classTargets !== 2 ||
      fusionPowers.summary.factionAssets !== 12 ||
      fusionPowers.summary.classAssets !== 3 ||
      fusionPowers.summary.pending !== 0 ||
      fusionPowers.summary.hardErrors !== 0 ||
      fusionPowers.records.length !== 43
    ) {
      throw new Error("Hero expanded fusion-power mark index is not production-ready.");
    }
    return { ...data, cardIcons, fusionPowers };
  },
  head: () => ({
    meta: [
      { title: "영웅 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "랑그릿사 모바일 영웅 267명을 이름, 희귀도, SP 여부로 검색하고 필터링할 수 있습니다.",
      },
    ],
  }),
  component: HeroGridPage,
});

const ALL_RARITIES = "ALL";

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesHeroSearch(hero: HeroListStage4Record, normalizedQuery: string) {
  if (!normalizedQuery) return true;

  return [
    hero.localization.displayName,
    hero.localization.displayNameKr,
    hero.localization.officialNameKr,
    hero.identity.nameKr,
    hero.identity.nameCn,
    hero.identity.nameEn,
  ]
    .filter((name): name is string => Boolean(name))
    .some((name) => name.toLocaleLowerCase().includes(normalizedQuery));
}

function resolvePublicAssetUrl(webAssetPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}${webAssetPath}`;
}

function HeroGridPage() {
  const data = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState(ALL_RARITIES);
  const [spOnly, setSpOnly] = useState(false);
  const cardIconByHeroId = useMemo(
    () => new Map(data.cardIcons.records.map((record) => [record.heroId, record])),
    [data.cardIcons.records],
  );
  const fusionPowerByHeroId = useMemo(
    () => new Map(data.fusionPowers.records.map((record) => [record.heroId, record])),
    [data.fusionPowers.records],
  );

  const filteredHeroes = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return data.records
      .filter((hero) => {
        if (!matchesHeroSearch(hero, normalizedQuery)) return false;
        if (rarity !== ALL_RARITIES && hero.rarity.baseLabel !== rarity) return false;
        if (spOnly && !hero.hasSp) return false;
        return true;
      })
      .reverse();
  }, [data.records, query, rarity, spOnly]);

  const hasActiveFilters = Boolean(query.trim()) || rarity !== ALL_RARITIES || spOnly;
  const resetFilters = () => {
    setQuery("");
    setRarity(ALL_RARITIES);
    setSpOnly(false);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div>
          <Link
            to="/"
            className="text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            ← 메인으로
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            영웅
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            확정된 267명 영웅 목록에서 이름, 희귀도, SP 여부로 원하는 영웅을 빠르게 찾을 수 있어.
          </p>
        </div>

        <section aria-label="영웅 목록 필터" className="mt-6 rounded-lg border border-border bg-card p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="hero-search" className="mb-1.5 block text-xs font-bold text-foreground">
                이름 검색
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="hero-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="한국명 · 중국명 · 영문명"
                  autoComplete="off"
                  className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10"
                />
              </div>
            </div>

            <div className="min-w-0 flex-[1.4]">
              <span className="mb-1.5 block text-xs font-bold text-foreground">희귀도</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="희귀도 필터">
                <FilterButton
                  active={rarity === ALL_RARITIES}
                  onClick={() => setRarity(ALL_RARITIES)}
                >
                  전체
                </FilterButton>
                {data.filters.rarities.map((option) => (
                  <FilterButton
                    key={option.label}
                    active={rarity === option.label}
                    onClick={() => setRarity(option.label)}
                  >
                    {option.label} <span className="opacity-60">{option.count}</span>
                  </FilterButton>
                ))}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                aria-pressed={spOnly}
                onClick={() => setSpOnly((current) => !current)}
                className={`inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition ${
                  spOnly
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground hover:border-foreground/30"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                SP만 <span className="opacity-60">{data.filters.spCount}</span>
              </button>

              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-bold text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                초기화
              </button>
            </div>
          </div>
        </section>

        <div className="mt-4 flex items-end justify-between gap-4 border-y border-border py-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            검색 결과 <span className="font-bold text-foreground">{filteredHeroes.length}</span>
            <span className="text-muted-foreground"> / {data.summary.total}명</span>
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            공식 카드 아이콘 267명 연결
          </p>
        </div>

        {filteredHeroes.length > 0 ? (
          <section
            aria-label="영웅 목록"
            data-hero-card-icons="true"
            data-hero-fusion-power-marks="true"
            className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
          >
            {filteredHeroes.map((hero) => (
              <HeroGridCard
                key={hero.heroId}
                hero={hero}
                cardIcon={cardIconByHeroId.get(hero.heroId)}
                fusionPower={fusionPowerByHeroId.get(hero.heroId)}
              />
            ))}
          </section>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center">
            <p className="text-sm font-bold text-foreground">조건에 맞는 영웅이 없어.</p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              필터 초기화
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 rounded-md border px-3 text-xs font-bold transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:border-foreground/30"
      }`}
    >
      {children}
    </button>
  );
}

function HeroGridCard({
  hero,
  cardIcon,
  fusionPower,
}: {
  hero: HeroListStage4Record;
  cardIcon:
    | {
        heroId: number;
        webAssetPath: string;
        width: number;
        height: number;
        assetStatus: string;
      }
    | undefined;
  fusionPower:
    | {
        heroId: number;
        targetType: "FACTION" | "CLASS";
        targetIds: number[];
        targetLabel: string;
        markKind: "SINGLE" | "COMPOSITE";
        markAssets: Array<{
          webAssetPath: string;
          width?: number;
          height?: number;
        }>;
        assetStatus: string;
      }
    | undefined;
}) {
  const displayName = hero.localization.displayName || (hero.identity.nameKr ?? hero.identity.nameCn);
  const imageUrl = cardIcon?.assetStatus === "RESOLVED"
    ? resolvePublicAssetUrl(cardIcon.webAssetPath)
    : null;
  const markAssets = fusionPower?.assetStatus === "RESOLVED"
    ? fusionPower.markAssets.map((asset) => ({ ...asset, url: resolvePublicAssetUrl(asset.webAssetPath) }))
    : [];
  const fusionLabel = fusionPower?.targetType === "CLASS"
    ? `직업 초절강화: ${fusionPower.targetLabel}`
    : `초절강화 진영: ${fusionPower?.targetLabel ?? "진영"}`;

  return (
    <Link
      reloadDocument
      to="/heroes/$heroId"
      params={{ heroId: String(hero.heroId) }}
      aria-label={displayName + " 상세 보기"}
      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2"
    >
      <article
        data-hero-card="true"
        data-hero-id={hero.heroId}
        data-name-kr-status={hero.localization.nameKrStatus}
        data-name-source-authority={hero.localization.sourceAuthority}
        className="overflow-hidden rounded-lg border border-border/70 bg-card p-1 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:border-foreground/25 group-hover:shadow-md"
      >
        <div className="relative aspect-square overflow-hidden rounded-md bg-muted/20">
          {imageUrl ? (
            <img
              data-hero-card-icon="true"
              data-hero-id={hero.heroId}
              src={imageUrl}
              alt=""
              width={cardIcon?.width}
              height={cardIcon?.height}
              className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.015]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground">
              <UserRound
                className="h-12 w-12 transition group-hover:text-foreground sm:h-14 sm:w-14"
                strokeWidth={1.25}
                aria-hidden="true"
              />
            </div>
          )}

          {fusionPower && markAssets.length > 0 ? (
            <span
              data-hero-fusion-power-mark="true"
              data-hero-id={hero.heroId}
              data-target-type={fusionPower.targetType}
              data-target-faction-id={fusionPower.targetType === "FACTION" ? fusionPower.targetIds[0] : undefined}
              data-target-class-ids={fusionPower.targetType === "CLASS" ? fusionPower.targetIds.join(",") : undefined}
              data-mark-kind={fusionPower.markKind}
              className="absolute right-1.5 top-1.5 block h-[28px] w-[28px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:h-[32px] sm:w-[32px]"
              title={fusionLabel}
              aria-label={fusionLabel}
            >
              {fusionPower.markKind === "COMPOSITE" && markAssets.length === 2 ? (
                <span className="relative block h-full w-full overflow-hidden rounded-full">
                  <img
                    src={markAssets[0].url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
                    loading="lazy"
                  />
                  <img
                    src={markAssets[1].url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
                    loading="lazy"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[135%] w-px -translate-x-1/2 -translate-y-1/2 rotate-45 bg-white/90 shadow-[0_0_1px_rgba(0,0,0,0.8)]"
                  />
                </span>
              ) : (
                <img
                  src={markAssets[0].url}
                  alt=""
                  width={markAssets[0].width}
                  height={markAssets[0].height}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              )}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 px-1 pb-1 pt-1.5 text-center">
          <span className="block truncate text-[11px] font-bold leading-tight text-foreground sm:text-xs">
            {displayName}
          </span>
        </div>
      </article>
    </Link>
  );
}
