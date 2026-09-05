import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpDown, ChevronRight, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";
import { getGeneralEquipmentPageData } from "@/lib/equipment-page.functions";

export const Route = createFileRoute("/equipment")({
  loader: () => getGeneralEquipmentPageData(),
  head: () => ({
    meta: [
      { title: "SSR 장비 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "랑그릿사 모바일 SSR 일반 장비 목록을 확인합니다.",
      },
    ],
  }),
  component: EquipmentGeneralListPage,
});

type EquipmentSortMode = "release" | "name";

type EquipmentListUiState = {
  group: string | null;
  subtype: string | null;
  query: string;
  sort: EquipmentSortMode;
};

const EQUIPMENT_LIST_STORAGE_KEY = "equipment-general-list-ui.v2";

const DEFAULT_UI_STATE: EquipmentListUiState = {
  group: null,
  subtype: null,
  query: "",
  sort: "release",
};

const SORT_LABELS: Record<EquipmentSortMode, string> = {
  release: "출시순",
  name: "이름순",
};

function isEquipmentSortMode(value: unknown): value is EquipmentSortMode {
  return value === "release" || value === "name";
}

function EquipmentGeneralListPage() {
  const data = Route.useLoaderData();
  const [uiState, setUiState] = useState<EquipmentListUiState>(DEFAULT_UI_STATE);
  const [persistenceReady, setPersistenceReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(EQUIPMENT_LIST_STORAGE_KEY);
      if (!stored) {
        setPersistenceReady(true);
        return;
      }

      const parsed = JSON.parse(stored) as Partial<EquipmentListUiState>;
      const selectedGroup =
        typeof parsed.group === "string"
          ? data.filters.find((filter) => filter.group === parsed.group)
          : undefined;
      const group = selectedGroup?.group ?? null;
      const subtype =
        group && typeof parsed.subtype === "string"
          ? selectedGroup?.subtypes.some((item) => item.subtype === parsed.subtype)
            ? parsed.subtype
            : null
          : null;
      const query = typeof parsed.query === "string" ? parsed.query.slice(0, 80) : "";
      const sort = isEquipmentSortMode(parsed.sort) ? parsed.sort : DEFAULT_UI_STATE.sort;

      setUiState({ group, subtype, query, sort });
    } catch {
      setUiState(DEFAULT_UI_STATE);
    } finally {
      setPersistenceReady(true);
    }
  }, [data.filters]);

  useEffect(() => {
    if (!persistenceReady) return;

    try {
      window.localStorage.setItem(EQUIPMENT_LIST_STORAGE_KEY, JSON.stringify(uiState));
    } catch {
      // Storage can be unavailable in privacy-restricted environments.
    }
  }, [persistenceReady, uiState]);

  const activeFilter = data.filters.find((filter) => filter.group === uiState.group) ?? null;

  const filteredRecords = useMemo(() => {
    const normalizedQuery = uiState.query.trim().toLocaleLowerCase();
    const records = data.records.filter((record) => {
      if (uiState.group && record.group !== uiState.group) return false;
      if (uiState.subtype && record.subtype !== uiState.subtype) return false;

      if (normalizedQuery) {
        const searchableText = [
          record.nameKr,
          record.nameCn,
          record.effectName,
          record.effectText,
          String(record.equipmentId),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        if (!searchableText.includes(normalizedQuery)) return false;
      }

      return true;
    });
    if (uiState.sort === "name") {
      return records.sort((left, right) => {
        const leftName = left.nameKr ?? left.nameCn;
        const rightName = right.nameKr ?? right.nameCn;
        return (
          leftName.localeCompare(rightName, "ko", { numeric: true, sensitivity: "base" }) ||
          right.equipmentId - left.equipmentId
        );
      });
    }

    return records.sort((left, right) => right.equipmentId - left.equipmentId);
  }, [data.records, uiState]);

  const selectGroup = (group: string) => {
    setUiState((current) =>
      current.group === group
        ? { ...current, group: null, subtype: null }
        : { ...current, group, subtype: null },
    );
  };

  const selectSubtype = (subtype: string) => {
    setUiState((current) => ({
      ...current,
      subtype: current.subtype === subtype ? null : subtype,
    }));
  };

  const resetFilters = () => {
    setUiState((current) => ({ ...current, group: null, subtype: null }));
  };

  const resetDiscovery = () => {
    setUiState((current) => ({
      ...current,
      group: null,
      subtype: null,
      query: "",
      sort: "release",
    }));
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              메인으로
            </Link>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              SSR 장비
            </h1>
          </div>

          <Link
            reloadDocument
            to="/equipment/exclusive"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/45 hover:bg-accent"
          >
            전용장비 보러가기
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 border-b border-border pb-4 md:grid-cols-[minmax(0,1fr)_14rem]">
              <label className="relative block">
                <span className="sr-only">장비 검색</span>
                <Search
                  size={17}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="search"
                  value={uiState.query}
                  maxLength={80}
                  onChange={(event) =>
                    setUiState((current) => ({ ...current, query: event.target.value }))
                  }
                  placeholder="검색"
                  className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
                />
                {uiState.query && (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => setUiState((current) => ({ ...current, query: "" }))}
                    className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </label>
              <label className="relative flex h-11 items-center rounded-xl border border-border bg-background">
                <ArrowUpDown
                  size={16}
                  aria-hidden="true"
                  className="ml-3 shrink-0 text-muted-foreground"
                />
                <span className="sr-only">장비 정렬</span>
                <select
                  value={uiState.sort}
                  onChange={(event) =>
                    setUiState((current) => ({
                      ...current,
                      sort: event.target.value as EquipmentSortMode,
                    }))
                  }
                  className="h-full min-w-0 flex-1 appearance-none bg-transparent px-2 pr-8 text-sm font-medium text-foreground outline-none"
                >
                  <option value="release">{SORT_LABELS.release}</option>
                  <option value="name">{SORT_LABELS.name}</option>
                </select>
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 rotate-90 text-muted-foreground"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                장비 종류
              </span>
              <button
                type="button"
                aria-pressed={uiState.group === null}
                onClick={resetFilters}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  uiState.group === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-accent"
                }`}
              >
                전체
              </button>
              {data.filters.map((filter) => {
                const selected = uiState.group === filter.group;
                return (
                  <button
                    key={filter.group}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectGroup(filter.group)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-accent"
                    }`}
                  >
                    {filter.groupKo}
                  </button>
                );
              })}

              {uiState.group && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  필터 초기화
                </button>
              )}
            </div>

            {activeFilter && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {activeFilter.groupKo} 세부
                </span>
                <button
                  type="button"
                  aria-pressed={uiState.subtype === null}
                  onClick={() => setUiState((current) => ({ ...current, subtype: null }))}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    uiState.subtype === null
                      ? "border-primary/50 bg-accent font-semibold text-accent-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  전체
                </button>
                {activeFilter.subtypes.map((subtype) => {
                  const selected = uiState.subtype === subtype.subtype;
                  return (
                    <button
                      key={subtype.subtype}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectSubtype(subtype.subtype)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                        selected
                          ? "border-primary/50 bg-accent font-semibold text-accent-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {subtype.subtypeKo}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <div className="mt-6">
          <p className="text-sm text-muted-foreground">
            전체 {data.records.length}개 중{" "}
            <span className="font-semibold text-foreground">{filteredRecords.length}개</span> 표시
          </p>
        </div>

        {filteredRecords.length > 0 ? (
          <section
            aria-label="SSR 장비 이미지 목록"
            className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
          >
            {filteredRecords.map((record) => {
              const displayName = record.nameKr ?? record.nameCn;
              const imageUrl = getOfficialEquipmentImageUrl(record.equipmentId);

              return (
                <Link
                  reloadDocument
                  key={record.equipmentId}
                  to="/equipment/$equipmentId"
                  params={{ equipmentId: String(record.equipmentId) }}
                  className="group flex flex-col items-center rounded-xl border border-border bg-card p-2 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-3"
                >
                  <div className="flex h-24 w-full items-center justify-center sm:h-28">
                    <img
                      src={imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-20 w-20 object-contain transition duration-200 group-hover:scale-[1.03] sm:h-24 sm:w-24"
                    />
                  </div>
                  <h2 className="mt-2 line-clamp-2 w-full text-center text-xs font-bold leading-snug text-foreground sm:text-sm">
                    {displayName}
                  </h2>
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="mt-4 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <p className="font-semibold text-foreground">조건에 맞는 장비가 없어.</p>
            <button
              type="button"
              onClick={resetDiscovery}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              검색·필터 초기화
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
