import { createFileRoute, Link } from "@tanstack/react-router";
import { RotateCcw, Search, Sparkles, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { getHeroListStage4Data } from "@/lib/hero-list.functions";
import type { HeroListRecord, HeroListStage4Record } from "@/lib/hero-list.server";

export const Route = createFileRoute("/heroes")({
  loader: () => getHeroListStage4Data(),
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

// Presentation-only portrait sample set.
// Each file is a WebP derivative generated from a clean base-skin PNG source.
// The source PNGs remain outside the website repository; no rarity/SP/super-buff
// decoration is baked into these portrait assets.
const SAMPLE_HERO_CARD_PATHS: Readonly<Record<number, string>> = {
  5: "/images/heroes/portrait-samples/5.webp",
  6: "/images/heroes/portrait-samples/6.webp",
  8: "/images/heroes/portrait-samples/8.webp",
  12: "/images/heroes/portrait-samples/12.webp",
  15: "/images/heroes/portrait-samples/15.webp",
};

// Presentation-only sample projection from frozen Hero detail shards.
// Hero 6 and 12 each have a skill whose displayType is `超绝强化`.
const SAMPLE_SUPER_BUFF_HERO_IDS = new Set<number>([6, 12]);

const SAMPLE_HERO_CARD_COUNT = Object.keys(SAMPLE_HERO_CARD_PATHS).length;

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesHeroSearch(hero: HeroListRecord, normalizedQuery: string) {
  if (!normalizedQuery) return true;

  return [hero.identity.nameKr, hero.identity.nameCn, hero.identity.nameEn]
    .filter((name): name is string => Boolean(name))
    .some((name) => name.toLocaleLowerCase().includes(normalizedQuery));
}

function resolvePublicAssetUrl(webAssetPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}${webAssetPath}`;
}

function getRarityBorderClass(baseLabel: string) {
  switch (baseLabel) {
    case "SSR":
      return "border-amber-400/90";
    case "SR":
      return "border-violet-400/90";
    case "R":
      return "border-sky-400/90";
    default:
      return "border-border";
  }
}

function HeroGridPage() {
  const data = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState(ALL_RARITIES);
  const [spOnly, setSpOnly] = useState(false);

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
            공식 초상화 267명 연결 · 샘플 fallback {SAMPLE_HERO_CARD_COUNT}명 보유
          </p>
        </div>

        {filteredHeroes.length > 0 ? (
          <section
            aria-label="영웅 목록"
            className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
          >
            {filteredHeroes.map((hero) => (
              <HeroGridCard key={hero.heroId} hero={hero} />
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

function HeroGridCard({ hero }: { hero: HeroListStage4Record }) {
  const displayName = hero.identity.nameKr ?? hero.identity.nameCn;
  const sampleAssetPath = SAMPLE_HERO_CARD_PATHS[hero.heroId];
  const imageUrl = hero.card.webAssetPath
    ? resolvePublicAssetUrl(hero.card.webAssetPath)
    : sampleAssetPath
      ? resolvePublicAssetUrl(sampleAssetPath)
      : null;
  const rarityBorderClass = getRarityBorderClass(hero.rarity.baseLabel);
  const hasSampleSuperBuff = SAMPLE_SUPER_BUFF_HERO_IDS.has(hero.heroId);

  return (
    <Link
      reloadDocument
      to="/heroes/$heroId"
      params={{ heroId: String(hero.heroId) }}
      aria-label={`${displayName} ${hero.rarity.baseLabel} 상세 보기`}
      className="group block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2"
    >
      <article
        className={`relative aspect-square overflow-hidden rounded-md border-2 ${rarityBorderClass} bg-card shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover object-top"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted text-muted-foreground">
            <UserRound
              className="h-12 w-12 transition group-hover:text-foreground sm:h-14 sm:w-14"
              strokeWidth={1.25}
              aria-hidden="true"
            />
          </div>
        )}

        {hasSampleSuperBuff ? (
          <span
            className="absolute right-1 top-1 origin-top-right scale-[0.8] rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm"
            title="초절 강화 보유"
          >
            초절
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1.5 text-center backdrop-blur-[1px]">
          <span className="line-clamp-1 text-[11px] font-bold leading-tight text-white sm:text-xs">
            {displayName}
          </span>
        </div>
      </article>
    </Link>
  );
}
