import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpDown, ChevronRight, RotateCcw, Search, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";
import { getExclusiveEquipmentPageData } from "@/lib/equipment-page.functions";

export const Route = createFileRoute("/equipment_/exclusive")({
  loader: () => getExclusiveEquipmentPageData(),
  head: () => ({
    meta: [
      { title: "전용장비 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "랑그릿사 모바일 영웅 전용장비 167개와 소유 영웅 관계를 확인합니다.",
      },
    ],
  }),
  component: ExclusiveEquipmentPage,
});

type EquipmentSortMode = "default" | "name" | "id";

type ExclusiveEquipmentListUiState = {
  group: string | null;
  subtype: string | null;
  query: string;
  sort: EquipmentSortMode;
};

const EXCLUSIVE_EQUIPMENT_LIST_STORAGE_KEY = "equipment-exclusive-list-ui.v1";

const DEFAULT_EXCLUSIVE_UI_STATE: ExclusiveEquipmentListUiState = {
  group: null,
  subtype: null,
  query: "",
  sort: "default",
};

const SORT_LABELS: Record<EquipmentSortMode, string> = {
  default: "기본 표시순",
  name: "이름순",
  id: "장비 ID순",
};

function isEquipmentSortMode(value: unknown): value is EquipmentSortMode {
  return value === "default" || value === "name" || value === "id";
}

function ExclusiveEquipmentPage() {
  const data = Route.useLoaderData();
  const [uiState, setUiState] = useState<ExclusiveEquipmentListUiState>(DEFAULT_EXCLUSIVE_UI_STATE);
  const [persistenceReady, setPersistenceReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(EXCLUSIVE_EQUIPMENT_LIST_STORAGE_KEY);
      if (!stored) {
        setPersistenceReady(true);
        return;
      }

      const parsed = JSON.parse(stored) as Partial<ExclusiveEquipmentListUiState>;
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
      const sort = isEquipmentSortMode(parsed.sort) ? parsed.sort : DEFAULT_EXCLUSIVE_UI_STATE.sort;

      setUiState({ group, subtype, query, sort });
    } catch {
      setUiState(DEFAULT_EXCLUSIVE_UI_STATE);
    } finally {
      setPersistenceReady(true);
    }
  }, [data.filters]);

  useEffect(() => {
    if (!persistenceReady) return;

    try {
      window.localStorage.setItem(EXCLUSIVE_EQUIPMENT_LIST_STORAGE_KEY, JSON.stringify(uiState));
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
          record.ownerHero.nameKr,
          record.ownerHero.nameCn,
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
        return leftName.localeCompare(rightName, "ko", { numeric: true, sensitivity: "base" }) || left.equipmentId - right.equipmentId;
      });
    }

    if (uiState.sort === "id") {
      return records.sort((left, right) => left.equipmentId - right.equipmentId);
    }

    return records;
  }, [data.records, uiState]);

  const selectGroup = (nextGroup: string) => {
    setUiState((current) =>
      current.group === nextGroup
        ? { ...current, group: null, subtype: null }
        : { ...current, group: nextGroup, subtype: null },
    );
  };

  const selectSubtype = (nextSubtype: string) => {
    setUiState((current) => ({
      ...current,
      subtype: current.subtype === nextSubtype ? null : nextSubtype,
    }));
  };

  const resetFilters = () => {
    setUiState((current) => ({ ...current, group: null, subtype: null }));
  };

  const resetDiscovery = () => {
    setUiState(DEFAULT_EXCLUSIVE_UI_STATE);
  };

  const orderPolicy =
    uiState.sort === "default"
      ? "현재 순서는 표시용 deterministic order이며 전용장비 출시순으로 해석하지 않아."
      : `${SORT_LABELS[uiState.sort]}으로 표시 중이야. 이 정렬은 출시순 의미를 갖지 않아.`;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              reloadDocument
              to="/equipment"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              SSR 장비로
            </Link>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              전용장비
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              공개 consumer에 포함된 전용장비 {data.total}개와 각 장비의 전용 영웅을 확인할 수 있어.
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 border-b border-border pb-4 md:grid-cols-[minmax(0,1fr)_14rem]">
            <label className="relative block">
              <span className="sr-only">전용장비 검색</span>
              <Search
                size={17}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={uiState.query}
                maxLength={80}
                onChange={(event) => setUiState((current) => ({ ...current, query: event.target.value }))}
                placeholder="장비명·영웅명·효과·ID 검색"
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
              <ArrowUpDown size={16} aria-hidden="true" className="ml-3 shrink-0 text-muted-foreground" />
              <span className="sr-only">전용장비 정렬</span>
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
                <option value="default">기본 표시순</option>
                <option value="name">이름순</option>
                <option value="id">장비 ID순</option>
              </select>
              <ChevronRight
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute right-3 rotate-90 text-muted-foreground"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
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
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
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
              {activeFilter.subtypes.map((item) => {
                const selected = uiState.subtype === item.subtype;
                return (
                  <button
                    key={item.subtype}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectSubtype(item.subtype)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                      selected
                        ? "border-primary/50 bg-accent font-semibold text-accent-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {item.subtypeKo}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <p className="text-sm text-muted-foreground">
              전체 {data.total}개 중 <span className="font-semibold text-foreground">{filteredRecords.length}개</span> 표시
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{orderPolicy}</p>
          </div>
          <p className="text-xs text-muted-foreground sm:text-right">
            선택한 필터·검색·정렬은 다음 방문에도 유지돼.
          </p>
        </div>

        {filteredRecords.length > 0 ? (
          <section
            aria-label="전용장비 목록"
            className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {filteredRecords.map((record) => {
              const displayName = record.nameKr ?? record.nameCn;

              return (
                <Link
                  reloadDocument
                  key={record.equipmentId}
                  to="/equipment/$equipmentId"
                  params={{ equipmentId: String(record.equipmentId) }}
                  className="group flex min-h-[25rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold tracking-wide text-primary-foreground">
                        전용
                      </span>
                      <span className="truncate text-xs font-medium text-muted-foreground">
                        {record.groupKo} · {record.subtypeKo}
                      </span>
                    </div>
                    <ChevronRight
                      size={17}
                      aria-hidden="true"
                      className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    />
                  </div>

                  <div className="relative flex min-h-48 items-center justify-center border-b border-border bg-muted/20 px-4 pb-16 pt-4 sm:min-h-52">
                    <img
                      src={getOfficialEquipmentImageUrl(record.equipmentId)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-28 w-28 object-contain transition duration-200 group-hover:scale-[1.03] sm:h-32 sm:w-32"
                    />
                    <div className="absolute inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
                      <h2 className="line-clamp-2 text-base font-bold leading-snug text-foreground sm:text-lg">
                        {displayName}
                      </h2>
                      {record.nameKr === null && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          한국명 REVIEW · 중문명 임시 표시
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/35 p-3">
                      <UserRound size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground">전용 영웅</p>
                        <p className="mt-0.5 truncate text-sm font-bold text-foreground">{record.ownerHero.nameKr}</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-muted/55 p-3">
                      <p className="text-xs font-semibold text-foreground">{record.effectName}</p>
                      <p className="mt-1 line-clamp-4 text-xs leading-5 text-muted-foreground">
                        {record.effectText}
                      </p>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[11px] text-muted-foreground">
                      <span>{record.groupKo} · {record.subtypeKo}</span>
                      <span className="tabular-nums">ID {record.equipmentId}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="mt-4 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <p className="font-semibold text-foreground">조건에 맞는 전용장비가 없어.</p>
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
