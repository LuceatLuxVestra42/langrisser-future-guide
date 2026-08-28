import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";

import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";
import { getGeneralEquipmentPageData } from "@/lib/equipment-page.functions";
import type { EquipmentListRecord } from "@/lib/equipment-page.server";

export const Route = createFileRoute("/equipment")({
  loader: () => getGeneralEquipmentPageData(),
  head: () => ({
    meta: [
      { title: "SSR 장비 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "이미지 중심으로 SSR 일반 장비를 빠르게 찾아볼 수 있습니다.",
      },
    ],
  }),
  component: EquipmentGalleryPage,
});

const GROUP_ORDER = ["weapon", "armor", "headgear", "accessory"] as const;

const GROUP_LABELS: Record<string, string> = {
  weapon: "무기",
  armor: "갑옷",
  headgear: "투구",
  accessory: "악세",
};

const TAB_LABELS: Record<number, string> = {
  1: "기존장비",
  2: "장비뽑기장비",
  3: "패스장비",
};

function EquipmentGalleryPage() {
  const data = Route.useLoaderData();
  const [group, setGroup] = useState<string | null>(null);
  const [subtype, setSubtype] = useState<string | null>(null);

  const activeFilter = data.filters.find((filter) => filter.group === group) ?? null;

  const records = useMemo(
    () =>
      data.records.filter((record) => {
        if (group && record.group !== group) return false;
        if (subtype && record.subtype !== subtype) return false;
        return true;
      }),
    [data.records, group, subtype],
  );

  const selectGroup = (nextGroup: string | null) => {
    setGroup(nextGroup);
    setSubtype(null);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link
              to="/"
              className="text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              ← 메인으로
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              SSR 장비
            </h1>
          </div>

          <Link
            to="/equipment/exclusive"
            className="shrink-0 rounded-lg border-2 border-foreground bg-background px-4 py-2 text-sm font-bold text-foreground transition hover:bg-foreground hover:text-background sm:text-base"
          >
            전용장비 보기
          </Link>
        </div>

        <section className="mt-7 border-y border-border">
          <div className="grid grid-cols-5">
            <FilterButton selected={group === null} onClick={() => selectGroup(null)}>
              전체
            </FilterButton>
            {GROUP_ORDER.map((groupId) => (
              <FilterButton
                key={groupId}
                selected={group === groupId}
                onClick={() => selectGroup(groupId)}
              >
                {GROUP_LABELS[groupId]}
              </FilterButton>
            ))}
          </div>

          <div className="min-h-20 border-t border-border px-2 py-3 sm:px-4">
            <div className="flex min-h-12 flex-wrap items-center gap-2">
              <span className="mr-2 text-sm font-bold text-muted-foreground">세부</span>

              {activeFilter ? (
                <>
                  <SubFilterButton selected={subtype === null} onClick={() => setSubtype(null)}>
                    전체
                  </SubFilterButton>
                  {activeFilter.subtypes.map((item) => (
                    <SubFilterButton
                      key={item.subtype}
                      selected={subtype === item.subtype}
                      onClick={() => setSubtype(item.subtype)}
                    >
                      {item.subtypeKo}
                    </SubFilterButton>
                  ))}
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  위에서 장비 종류를 고르면 세부 분류가 표시돼.
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{records.length}</span>개 장비
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            이미지를 누르면 해당 장비 정보로 이동
          </p>
        </div>

        <section
          aria-label="SSR 장비 이미지 목록"
          className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
        >
          {records.map((record) => (
            <EquipmentImageCard key={record.equipmentId} record={record} />
          ))}
        </section>
      </div>
    </main>
  );
}

function FilterButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-16 border-r border-border px-1 text-sm font-bold transition last:border-r-0 sm:min-h-20 sm:text-lg ${
        selected
          ? "bg-foreground text-background"
          : "bg-background text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function SubFilterButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:border-foreground/50 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function EquipmentImageCard({ record }: { record: EquipmentListRecord }) {
  const displayName = record.nameKr ?? record.nameCn;
  const tabLabel = record.siteTab ? TAB_LABELS[record.siteTab] : "장비";

  return (
    <Link
      to="/equipment/$equipmentId"
      params={{ equipmentId: String(record.equipmentId) }}
      title={`${displayName} · ${tabLabel}`}
      className="group relative aspect-square overflow-hidden rounded-md border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <EquipmentPlaceholder record={record} />

      <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1.5 text-center backdrop-blur-[1px]">
        <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white sm:text-xs">
          {displayName}
        </span>
      </div>
    </Link>
  );
}

function EquipmentPlaceholder({ record }: { record: EquipmentListRecord }) {
  const imageUrl = getOfficialEquipmentImageUrl(record.equipmentId);

  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/35 pb-6">
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain p-1 pb-2 transition duration-200 group-hover:scale-[1.03]"
      />
    </div>
  );
}
