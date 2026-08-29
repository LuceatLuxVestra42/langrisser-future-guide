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
        content: "랑그릿사 모바일 SSR 일반 장비 목록과 분류 정보를 확인합니다.",
      },
    ],
  }),
  component: EquipmentGeneralListPage,
});

type TabId = 1 | 2 | 3;
type EquipmentSortMode = "default" | "name" | "id";

type EquipmentListUiState = {
  tab: TabId;
  group: string | null;
  subtype: string | null;
  query: string;
  sort: EquipmentSortMode;
};

const EQUIPMENT_LIST_STORAGE_KEY = "equipment-general-list-ui.v1";

const DEFAULT_UI_STATE: EquipmentListUiState = {
  tab: 1,
  group: null,
  subtype: null,
  query: "",
  sort: "default",
};

const TAB_DEFINITIONS: ReadonlyArray<{
  id: TabId;
  label: string;
  description: string;
}> = [
  {
    id: 1,
    label: "초기 장비",
    description: "게임 출시부터 존재하던 장비",
  },
  {
    id: 2,
    label: "이전 추가 장비",
    description: "과거 장비뽑기 계열에서 추가된 장비",
  },
  {
    id: 3,
    label: "장비패스",
    description: "현재 장비패스 계열 장비",
  },
];

const TAB_ORDER_POLICIES: Record<TabId, string> = {
  1: "표시 순서는 확정된 역사적 출시순이 아니라 Stage 3의 deterministic presentation order야.",
  2: "검증된 출시 그룹 단위만 반영하며 같은 그룹 안의 개별 출시순은 확정하지 않았어.",
  3: "장비 종류·세부 타입 순서를 유지하고, 같은 세부 타입 안에서는 확인된 출시 그룹 기준 최신순이야. 같은 출시 그룹 안의 개별 순서는 별도 출시순 의미가 없어.",
};

const SORT_LABELS: Record<EquipmentSortMode, string> = {
  default: "기본 표시순",
  name: "이름순",
  id: "장비 ID순",
};

function isTabId(value: unknown): value is TabId {
  return value === 1 || value === 2 || value === 3;
}

function isEquipmentSortMode(value: unknown): value is EquipmentSortMode {
  return value === "default" || value === "name" || value === "id";
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
      const tab = isTabId(parsed.tab) ? parsed.tab : DEFAULT_UI_STATE.tab;
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

      setUiState({ tab, group, subtype, query, sort });
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
      if (record.siteTab !== uiState.tab) return false;
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
        return leftName.localeCompare(rightName, "ko", { numeric: true, sensitivity: "base" }) || left.equipmentId - right.equipmentId;
      });
    }

    if (uiState.sort === "id") {
      return records.sort((left, right) => left.equipmentId - right.equipmentId);
    }

    return records;
  }, [data.records, uiState]);

  const currentTabCount = data.tabs[String(uiState.tab)] ?? 0;

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
      sort: "default",
    }));
  };

  const orderPolicy =
    uiState.sort === "default"
      ? TAB_ORDER_POLICIES[uiState.tab]
      : `${SORT_LABELS[uiState.sort]}으로 표시 중이야. 이 정렬은 출시순 의미를 갖지 않아.`;

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
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              일반 SSR 장비 206개를 획득 계열과 장비 종류로 나눠 확인할 수 있어.
            </p>
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
          <div className="grid grid-cols-1 border-b border-border sm:grid-cols-3">
            {TAB_DEFINITIONS.map((tab) => {
              const selected = uiState.tab === tab.id;
              const count = data.tabs[String(tab.id)] ?? 0;

              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setUiState((current) => ({ ...current, tab: tab.id }))}
                  className={`border-b px-5 py-4 text-left transition last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${
                    selected
                      ? "bg-accent text-accent-foreground"
                      : "bg-card text-foreground hover:bg-muted/60"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{tab.label}</span>
                    <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {count}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {tab.description}
                  </span>
                </button>
              );
            })}
          </div>

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
                  onChange={(event) => setUiState((current) => ({ ...current, query: event.target.value }))}
                  placeholder="장비명·효과·ID 검색"
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

        <div className="mt-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <p className="text-sm text-muted-foreground">
              현재 탭 {currentTabCount}개 중 <span className="font-semibold text-foreground">{filteredRecords.length}개</span> 표시
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{orderPolicy}</p>
          </div>
          <p className="text-xs text-muted-foreground sm:text-right">
            선택한 탭·필터·검색·정렬은 다음 방문에도 유지돼.
          </p>
        </div>

        {filteredRecords.length > 0 ? (
          <section
            aria-label="SSR 장비 이미지 목록"
            className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
                  className="group flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold tracking-wide text-primary-foreground">
                        SSR
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

                  <div className="relative flex min-h-52 items-center justify-center border-b border-border bg-muted/20 px-4 pb-16 pt-4 sm:min-h-56">
                    <img
                      src={imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-32 w-32 object-contain transition duration-200 group-hover:scale-[1.03] sm:h-36 sm:w-36"
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
                    <div className="rounded-xl bg-muted/55 p-3">
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
