import { createFileRoute } from "@tanstack/react-router";
import { Search, Shield } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { getSoldierPrototypePageData } from "@/lib/soldier-page.functions";
import type {
  SoldierPrototypeRecord,
  SoldierUiGroup,
} from "@/lib/soldier-page.server";

export const Route = createFileRoute("/soldiers-prototype")({
  loader: () => getSoldierPrototypePageData(),
  head: () => ({
    meta: [
      { title: "용병 갤러리 프로토타입 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "병종·티어·SP 필터와 기초 전투값을 확인하는 용병 페이지 프로토타입입니다.",
      },
    ],
  }),
  component: SoldierPrototypePage,
});

type TierFilter = "ALL" | "T1" | "T2" | "T3" | "SP";

const GROUPS: Array<{
  id: SoldierUiGroup;
  label: string;
  shortLabel: string;
}> = [
  { id: "INFANTRY", label: "보병", shortLabel: "보" },
  { id: "LANCER", label: "창병", shortLabel: "창" },
  { id: "CAVALRY", label: "기병", shortLabel: "기" },
  { id: "FLYING_WATER", label: "비병+수병", shortLabel: "비·수" },
  { id: "ARCHER_ASSASSIN", label: "궁병+암살", shortLabel: "궁·암" },
  { id: "MAGE_HOLY_DEMON", label: "마법사+승병+마족", shortLabel: "법·승·마" },
];

const GROUP_BY_ID = new Map(GROUPS.map((group) => [group.id, group]));

const TIER_FILTERS: Array<{ id: TierFilter; label: string }> = [
  { id: "ALL", label: "전체" },
  { id: "T1", label: "1티어" },
  { id: "T2", label: "2티어" },
  { id: "T3", label: "3티어" },
  { id: "SP", label: "SP" },
];

function SoldierPrototypePage() {
  const data = Route.useLoaderData();
  const [group, setGroup] = useState<SoldierUiGroup | null>(null);
  const [tierFilter, setTierFilter] = useState<TierFilter>("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const records = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return data.records.filter((record) => {
      if (group && record.uiGroup !== group) return false;

      if (tierFilter === "SP" && !record.isSp) return false;
      if (tierFilter === "T1" && (record.isSp || record.tier !== 1)) return false;
      if (tierFilter === "T2" && (record.isSp || record.tier !== 2)) return false;
      if (tierFilter === "T3" && (record.isSp || record.tier !== 3)) return false;

      if (needle) {
        const haystacks = [record.nameKr ?? "", record.nameCn, String(record.soldierId)];
        if (!haystacks.some((value) => value.toLowerCase().includes(needle))) return false;
      }

      return true;
    });
  }, [data.records, group, query, tierFilter]);

  const selectedRecord =
    records.find((record) => record.soldierId === selectedId) ?? records[0] ?? null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            TEST PROTOTYPE
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                용병
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                확정된 224종 Soldier consumer를 이용한 목록·기초정보 UI
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>일반 {data.summary.normalCount} · SP {data.summary.spCount}</p>
              <p>3티어 일반 {data.summary.normalTier3Count}</p>
            </div>
          </div>
        </header>

        <section className="mt-7 overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-4 border-b border-border sm:grid-cols-7">
            <GroupButton selected={group === null} onClick={() => setGroup(null)}>
              전체
            </GroupButton>
            {GROUPS.map((item) => (
              <GroupButton
                key={item.id}
                selected={group === item.id}
                onClick={() => setGroup(item.id)}
              >
                {item.label}
              </GroupButton>
            ))}
          </div>

          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex flex-wrap gap-2">
              {TIER_FILTERS.map((filter) => (
                <PillButton
                  key={filter.id}
                  selected={tierFilter === filter.id}
                  onClick={() => setTierFilter(filter.id)}
                >
                  {filter.label}
                </PillButton>
              ))}
            </div>

            <label className="relative block w-full sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="sr-only">용병 검색</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="한국명 · 중국명 · ID 검색"
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/50 focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{records.length}</span>개 표시
          </p>
          <p className="text-xs text-muted-foreground">
            실제 용병 이미지 asset은 아직 연결하지 않은 프로토타입
          </p>
        </div>

        <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section
            aria-label="용병 목록"
            className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 xl:grid-cols-8"
          >
            {records.map((record) => (
              <SoldierCard
                key={record.soldierId}
                record={record}
                selected={selectedRecord?.soldierId === record.soldierId}
                onClick={() => setSelectedId(record.soldierId)}
              />
            ))}

            {records.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-border px-4 py-14 text-center text-sm text-muted-foreground">
                현재 조건에 맞는 용병이 없어.
              </div>
            ) : null}
          </section>

          <aside className="order-first lg:order-last">
            <div className="lg:sticky lg:top-6">
              {selectedRecord ? (
                <SoldierDetail record={selectedRecord} />
              ) : (
                <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                  표시할 용병이 없어.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function GroupButton({
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
      className={`min-h-14 border-r border-border px-1 text-xs font-bold transition last:border-r-0 sm:min-h-16 sm:text-sm ${
        selected
          ? "bg-foreground text-background"
          : "bg-card text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function PillButton({
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

function SoldierCard({
  record,
  selected,
  onClick,
}: {
  record: SoldierPrototypeRecord;
  selected: boolean;
  onClick: () => void;
}) {
  const group = GROUP_BY_ID.get(record.uiGroup);
  const displayName = record.nameKr ?? record.nameCn;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      title={`${displayName} · Soldier ${record.soldierId}`}
      className={`group relative aspect-square overflow-hidden rounded-lg border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected ? "border-foreground ring-1 ring-foreground" : "border-border"
      }`}
    >
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted pb-8 text-muted-foreground transition group-hover:text-foreground">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-current/20 bg-background/70 sm:h-16 sm:w-16">
          <span className="text-base font-black tracking-tight sm:text-lg">
            {group?.shortLabel ?? "?"}
          </span>
        </div>
      </div>

      <div className="absolute left-1.5 top-1.5 flex gap-1">
        <span className="rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {record.isSp ? "SP" : `T${record.tier}`}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1.5 text-center backdrop-blur-[1px]">
        <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white sm:text-xs">
          {displayName}
        </span>
      </div>
    </button>
  );
}

function SoldierDetail({ record }: { record: SoldierPrototypeRecord }) {
  const displayName = record.nameKr ?? record.nameCn;
  const group = GROUP_BY_ID.get(record.uiGroup);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-4 border-b border-border p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-foreground">
          <Shield className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded bg-foreground px-2 py-0.5 text-[11px] font-bold text-background">
              {record.isSp ? "SP" : `${record.tier}티어`}
            </span>
            <span className="rounded border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {group?.label ?? record.uiGroup}
            </span>
          </div>
          <h2 className="mt-2 truncate text-xl font-bold text-foreground">{displayName}</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{record.nameCn}</p>
          <p className="mt-1 text-xs text-muted-foreground">Soldier ID {record.soldierId}</p>
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-sm font-bold text-foreground">기초 스탯</h3>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <Stat label="HP" value={record.combat.hp} />
          <Stat label="ATK" value={record.combat.atk} />
          <Stat label="DEF" value={record.combat.def} />
          <Stat label="MDEF" value={record.combat.mdef} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="이동" value={record.combat.move} />
          <Stat label="사거리" value={record.combat.range} />
        </div>

        <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          <DetailRow label="한국명 상태" value={record.nameKrStatus === "confirmed" ? "확정" : "검수 중"} />
          <DetailRow
            label="출시 정보"
            value={record.release.releaseDate ?? "미확정"}
          />
          <DetailRow
            label="SP 관계"
            value={
              record.isSp
                ? record.normalSoldierId
                  ? `일반형 ID ${record.normalSoldierId}`
                  : "관계 없음"
                : record.spSoldierId
                  ? `SP ID ${record.spSoldierId}`
                  : "없음"
            }
          />
        </div>

        <div className="mt-4 rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          이 프로토타입은 frozen 목록·전투 consumer만 사용해. 패시브, 훈련 비용, 사용 영웅,
          SP 미션과 실제 용병 이미지는 다음 UI 단계에서 붙일 수 있어.
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-2 text-center">
      <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-black tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}
