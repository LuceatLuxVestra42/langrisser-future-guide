import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, RotateCcw, UserRound } from "lucide-react";
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

type ExclusiveEquipmentListUiState = {
  group: string | null;
  subtype: string | null;
};

const EXCLUSIVE_EQUIPMENT_LIST_STORAGE_KEY = "equipment-exclusive-list-ui.v1";

const DEFAULT_EXCLUSIVE_UI_STATE: ExclusiveEquipmentListUiState = {
  group: null,
  subtype: null,
};

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

      setUiState({ group, subtype });
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
  const filteredRecords = useMemo(
    () =>
      data.records.filter((record) => {
        if (uiState.group && record.group !== uiState.group) return false;
        if (uiState.subtype && record.subtype !== uiState.subtype) return false;
        return true;
      }),
    [data.records, uiState],
  );

  const selectGroup = (nextGroup: string) => {
    setUiState((current) =>
      current.group === nextGroup
        ? { group: null, subtype: null }
        : { group: nextGroup, subtype: null },
    );
  };

  const selectSubtype = (nextSubtype: string) => {
    setUiState((current) => ({
      ...current,
      subtype: current.subtype === nextSubtype ? null : nextSubtype,
    }));
  };

  const resetFilters = () => {
    setUiState(DEFAULT_EXCLUSIVE_UI_STATE);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
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
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              현재 순서는 표시용 deterministic order이며 전용장비 출시순으로 해석하지 않아.
            </p>
          </div>
          <p className="text-xs text-muted-foreground sm:text-right">
            선택한 장비 종류 필터는 다음 방문에도 유지돼.
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
                  key={record.equipmentId}
                  to="/equipment/$equipmentId"
                  params={{ equipmentId: String(record.equipmentId) }}
                  className="group flex min-h-72 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold tracking-wide text-primary-foreground">
                        전용
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {record.groupKo} · {record.subtypeKo}
                      </span>
                    </div>
                    <ChevronRight
                      size={17}
                      aria-hidden="true"
                      className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    />
                  </div>

                  <div className="flex items-center justify-center border-b border-border bg-muted/20 px-4 py-4">
                    <img
                      src={getOfficialEquipmentImageUrl(record.equipmentId)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-28 w-28 object-contain transition duration-200 group-hover:scale-[1.03]"
                    />
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <h2 className="text-lg font-bold leading-snug text-foreground">{displayName}</h2>
                    {record.nameKr === null && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        한국명 REVIEW · 중문명 임시 표시
                      </p>
                    )}

                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/35 p-3">
                      <UserRound size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground">전용 영웅</p>
                        <p className="mt-0.5 text-sm font-bold text-foreground">{record.ownerHero.nameKr}</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-muted/55 p-3">
                      <p className="text-xs font-semibold text-foreground">{record.effectName}</p>
                      <p className="mt-1 line-clamp-4 text-xs leading-5 text-muted-foreground">
                        {record.effectText}
                      </p>
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
              onClick={resetFilters}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              장비 종류 필터 초기화
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
