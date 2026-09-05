import { createFileRoute, Link } from "@tanstack/react-router";
import { RotateCcw, Search, UserRound } from "lucide-react";
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
        content: "랑그릿사 모바일 영웅 267명을 이름, 희귀도, 진영, 출전작, SP 여부로 검색하고 필터링할 수 있습니다.",
      },
    ],
  }),
  component: HeroGridPage,
});

const ALL_RARITIES = "ALL";
const LOW_RARITY = "N,R";
const RARITY_ICON_PATHS = new Map<string, string>([
  ["N", "/images/heroes/rarity/N.png"],
  ["R", "/images/heroes/rarity/R.png"],
  ["SR", "/images/heroes/rarity/SR.png"],
  ["SSR", "/images/heroes/rarity/SSR.png"],
  ["LLR", "/images/heroes/rarity/LLR.png"],
]);
const SP_ICON_PATH = "/images/heroes/rarity/SP.png";
const FACTION_FILTER_SHORT_LABELS = new Map<number, string>([
  [1, "주역"],
  [2, "빛"],
  [3, "기원"],
  [4, "제국"],
  [5, "어둠"],
  [6, "공주"],
  [7, "전략"],
  [8, "유성"],
  [9, "전설"],
  [10, "시공"],
  [11, "초월"],
  [12, "전생"],
]);
const ORIGIN_FILTER_DISPLAY_ORDER = [
  3,
  12,
  18,
  22,
  4,
  5,
  6,
  7,
  8,
  9,
  25,
  30,
  1,
  2,
  10,
  11,
  13,
  14,
  15,
  16,
  19,
  17,
  20,
  21,
  23,
  24,
  26,
  27,
  28,
  29,
  31,
  32,
] as const;
const ORIGIN_FILTER_DISPLAY_RANK = new Map<number, number>(
  ORIGIN_FILTER_DISPLAY_ORDER.map((productionId, index) => [productionId, index]),
);
type FilterSection = "rarity" | "faction" | "origin";

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

function matchesRarity(hero: HeroListStage4Record, selectedRarity: string) {
  if (selectedRarity === ALL_RARITIES) return true;
  if (selectedRarity === LOW_RARITY) {
    return hero.rarity.baseLabel === "N" || hero.rarity.baseLabel === "R";
  }
  return hero.rarity.baseLabel === selectedRarity;
}

function resolvePublicAssetUrl(webAssetPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}${webAssetPath}`;
}

function getRarityIconUrl(label: string) {
  const path = RARITY_ICON_PATHS.get(label);
  return path ? resolvePublicAssetUrl(path) : null;
}

function HeroGridPage() {
  const data = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [openFilterSections, setOpenFilterSections] = useState<Record<FilterSection, boolean>>({
    rarity: true,
    faction: false,
    origin: false,
  });
  const [rarity, setRarity] = useState(ALL_RARITIES);
  const [factionIds, setFactionIds] = useState<number[]>([]);
  const [originId, setOriginId] = useState<number | null>(null);
  const [spOnly, setSpOnly] = useState(false);

  const rarityOptions = useMemo(() => {
    const regularOptions = data.filters.rarities.filter(
      (option) => option.label !== "N" && option.label !== "R",
    );
    const lowRarityCount = data.filters.rarities
      .filter((option) => option.label === "N" || option.label === "R")
      .reduce((sum, option) => sum + option.count, 0);

    return lowRarityCount > 0
      ? [...regularOptions, { label: LOW_RARITY, count: lowRarityCount }]
      : regularOptions;
  }, [data.filters.rarities]);

  const factionMarkById = useMemo(() => {
    const marks = new Map<number, string>();

    for (const record of data.fusionPowers.records) {
      if (record.targetType !== "FACTION" || record.targetIds.length !== 1) continue;
      const targetId = record.targetIds[0];
      const markAsset = record.markAssets[0];
      if (targetId === undefined || !markAsset) continue;

      const existing = marks.get(targetId);
      if (existing && existing !== markAsset.webAssetPath) {
        throw new Error(`Faction ${targetId} has conflicting frozen mark assets.`);
      }
      marks.set(targetId, markAsset.webAssetPath);
    }

    if (marks.size !== data.fusionPowers.summary.factionAssets) {
      throw new Error("Faction filter mark index is incomplete.");
    }
    return marks;
  }, [data.fusionPowers.records, data.fusionPowers.summary.factionAssets]);

  const factionOptions = useMemo(() => {
    const options = new Map<number, { id: number; label: string; markPath: string }>();

    for (const hero of data.records) {
      for (const faction of hero.factions) {
        if (options.has(faction.factionId)) continue;

        const label = FACTION_FILTER_SHORT_LABELS.get(faction.factionId);
        const markPath = factionMarkById.get(faction.factionId);
        if (!label || !markPath) {
          throw new Error(`Faction ${faction.factionId} filter presentation mapping is incomplete.`);
        }

        options.set(faction.factionId, {
          id: faction.factionId,
          label,
          markPath,
        });
      }
    }

    return [...options.values()].sort((a, b) => a.id - b.id);
  }, [data.records, factionMarkById]);

  const originOptions = useMemo(() => {
    const options = new Map<number, { id: number; label: string; count: number }>();

    for (const hero of data.records) {
      if (hero.rarity.baseLabel === "LLR") continue;

      const current = options.get(hero.origin.productionId);
      if (current) {
        current.count += 1;
        continue;
      }
      options.set(hero.origin.productionId, {
        id: hero.origin.productionId,
        label: hero.origin.nameKr ?? hero.origin.nameCn,
        count: 1,
      });
    }

    return [...options.values()].sort((a, b) => {
      const aRank = ORIGIN_FILTER_DISPLAY_RANK.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRank = ORIGIN_FILTER_DISPLAY_RANK.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank || a.id - b.id;
    });
  }, [data.records]);

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
        if (!matchesRarity(hero, rarity)) return false;
        if (
          factionIds.length > 0 &&
          !factionIds.every((selectedFactionId) =>
            hero.factions.some((faction) => faction.factionId === selectedFactionId),
          )
        ) {
          return false;
        }
        if (
          originId !== null &&
          (hero.rarity.baseLabel === "LLR" || hero.origin.productionId !== originId)
        ) {
          return false;
        }
        if (spOnly && !hero.hasSp) return false;
        return true;
      })
      .reverse();
  }, [data.records, query, rarity, factionIds, originId, spOnly]);

  const hasActiveFilters =
    Boolean(query.trim()) ||
    rarity !== ALL_RARITIES ||
    factionIds.length > 0 ||
    originId !== null ||
    spOnly;

  const toggleFilterSection = (section: FilterSection) => {
    setOpenFilterSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const toggleFaction = (factionId: number) => {
    setFactionIds((current) =>
      current.includes(factionId)
        ? current.filter((selectedFactionId) => selectedFactionId !== factionId)
        : [...current, factionId],
    );
  };

  const resetFilters = () => {
    setQuery("");
    setOpenFilterSections({ rarity: true, faction: false, origin: false });
    setRarity(ALL_RARITIES);
    setFactionIds([]);
    setOriginId(null);
    setSpOnly(false);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <Link
          to="/"
          className="inline-flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:border-foreground/30 hover:bg-muted/40"
        >
          ← 메인으로
        </Link>

        <section aria-label="영웅 목록 필터" className="mt-4 rounded-lg border border-border bg-card p-3 sm:p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="mb-1.5 block text-xs font-bold text-foreground">통합 필터</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="통합 필터 분류">
                <FilterSectionButton
                  active={openFilterSections.rarity}
                  onClick={() => toggleFilterSection("rarity")}
                >
                  희귀도
                </FilterSectionButton>
                <FilterSectionButton
                  active={openFilterSections.faction}
                  onClick={() => toggleFilterSection("faction")}
                >
                  진영
                </FilterSectionButton>
                <FilterSectionButton
                  active={openFilterSections.origin}
                  onClick={() => toggleFilterSection("origin")}
                >
                  출전작
                </FilterSectionButton>
              </div>
            </div>

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

          <div className="mt-3 space-y-3 border-t border-border pt-3">
            {openFilterSections.rarity ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="희귀도 필터">
                <FilterButton
                  active={rarity === ALL_RARITIES}
                  onClick={() => setRarity(ALL_RARITIES)}
                >
                  전체
                </FilterButton>
                {rarityOptions.map((option) => (
                  <FilterButton
                    key={option.label}
                    active={rarity === option.label}
                    onClick={() => setRarity(option.label)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {option.label === LOW_RARITY ? (
                        <span className="inline-flex items-center gap-0.5" aria-label="N, R">
                          <img
                            src={getRarityIconUrl("N") ?? undefined}
                            alt="N"
                            className="h-5 w-auto object-contain"
                          />
                          <img
                            src={getRarityIconUrl("R") ?? undefined}
                            alt="R"
                            className="h-5 w-auto object-contain"
                          />
                        </span>
                      ) : getRarityIconUrl(option.label) ? (
                        <img
                          src={getRarityIconUrl(option.label) ?? undefined}
                          alt={option.label}
                          className="h-6 w-auto object-contain"
                        />
                      ) : (
                        <span>{option.label}</span>
                      )}
                      <span className="opacity-60">{option.count}</span>
                    </span>
                  </FilterButton>
                ))}
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
                  <img
                    src={resolvePublicAssetUrl(SP_ICON_PATH)}
                    alt="SP"
                    className="h-6 w-auto object-contain"
                  />
                  <span className="opacity-60">{data.filters.spCount}</span>
                </button>
              </div>
            ) : null}

            {openFilterSections.faction ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="진영 필터">
                <FilterButton active={factionIds.length === 0} onClick={() => setFactionIds([])}>
                  전체
                </FilterButton>
                {factionOptions.map((option) => (
                  <FilterButton
                    key={option.id}
                    active={factionIds.includes(option.id)}
                    onClick={() => toggleFaction(option.id)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <img
                        src={resolvePublicAssetUrl(option.markPath)}
                        alt=""
                        aria-hidden="true"
                        className="h-6 w-6 shrink-0 object-contain"
                      />
                      <span>{option.label}</span>
                    </span>
                  </FilterButton>
                ))}
              </div>
            ) : null}

            {openFilterSections.origin ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="출전작 필터">
                <FilterButton active={originId === null} onClick={() => setOriginId(null)}>
                  전체
                </FilterButton>
                {originOptions.map((option) => (
                  <FilterButton
                    key={option.id}
                    active={originId === option.id}
                    onClick={() => setOriginId(option.id)}
                  >
                    {option.label} <span className="opacity-60">{option.count}</span>
                  </FilterButton>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 border-t border-border pt-4">
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
                placeholder="검색"
                autoComplete="off"
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10"
              />
            </div>
          </div>
        </section>

        <div className="mt-4 border-y border-border py-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            검색 결과 <span className="font-bold text-foreground">{filteredHeroes.length}</span>
            <span className="text-muted-foreground"> / {data.summary.total}명</span>
          </p>
        </div>

        {filteredHeroes.length > 0 ? (
          <section
            aria-label="영웅 목록"
            data-hero-card-icons="true"
            data-hero-fusion-power-marks="true"
            data-hero-rarity-icons="true"
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

function FilterSectionButton({
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
      className={`h-10 whitespace-nowrap rounded-md border px-4 text-xs font-bold transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:border-foreground/30"
      }`}
    >
      {children}
    </button>
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
      className={`h-10 whitespace-nowrap rounded-md border px-3 text-xs font-bold transition ${
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
  const primaryMarkAsset = markAssets[0];
  const secondaryMarkAsset = markAssets[1];
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
        data-hero-rarity={hero.rarity.baseLabel}
        data-hero-sp={hero.hasSp ? "true" : "false"}
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
              decoding="async"
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

          {fusionPower && primaryMarkAsset ? (
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
              {fusionPower.markKind === "COMPOSITE" && secondaryMarkAsset ? (
                <span className="relative block h-full w-full overflow-hidden rounded-full">
                  <img
                    src={primaryMarkAsset.url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
                    loading="lazy"
                    decoding="async"
                  />
                  <img
                    src={secondaryMarkAsset.url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
                    loading="lazy"
                    decoding="async"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[135%] w-px -translate-x-1/2 -translate-y-1/2 rotate-45 bg-white/90 shadow-[0_0_1px_rgba(0,0,0,0.8)]"
                  />
                </span>
              ) : (
                <img
                  src={primaryMarkAsset.url}
                  alt=""
                  width={primaryMarkAsset.width}
                  height={primaryMarkAsset.height}
                  className="h-full w-full object-contain"
                  loading="lazy"
                  decoding="async"
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
