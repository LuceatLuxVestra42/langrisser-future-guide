import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Shield, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { getOfficialArmyIconUrl } from "@/lib/army-icon-assets";
import { getSoldierPrototypePageData } from "@/lib/soldier-page.functions";
import type { SoldierPrototypeRecord } from "@/lib/soldier-page.server";

export const Route = createFileRoute("/soldiers")({
  loader: () => getSoldierPrototypePageData(),
  head: () => ({
    meta: [
      { title: "용병 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "확정된 224종 용병 데이터를 병종·티어·SP 기준으로 확인합니다.",
      },
    ],
  }),
  component: SoldierPage,
});

type ArmyFilter =
  | "INFANTRY"
  | "LANCER"
  | "CAVALRY"
  | "FLYING"
  | "WATER"
  | "ARCHER"
  | "ASSASSIN"
  | "MAGE"
  | "HOLY"
  | "DEMON";

type TierFilter = "ALL" | "T1_T2" | "T3" | "SP";

const ARMY_FILTERS: Array<{
  id: ArmyFilter;
  label: string;
  shortLabel: string;
}> = [
  { id: "INFANTRY", label: "보병", shortLabel: "보" },
  { id: "LANCER", label: "창병", shortLabel: "창" },
  { id: "CAVALRY", label: "기병", shortLabel: "기" },
  { id: "FLYING", label: "비병", shortLabel: "비" },
  { id: "WATER", label: "수병", shortLabel: "수" },
  { id: "ARCHER", label: "궁병", shortLabel: "궁" },
  { id: "ASSASSIN", label: "암살자", shortLabel: "암" },
  { id: "MAGE", label: "마법사", shortLabel: "법" },
  { id: "HOLY", label: "승병", shortLabel: "승" },
  { id: "DEMON", label: "마족", shortLabel: "마" },
];

const ARMY_BY_TYPE = new Map<string, (typeof ARMY_FILTERS)[number]>(
  ARMY_FILTERS.map((army) => [army.id, army]),
);

const ARMY_ORDER = new Map<string, number>(
  ARMY_FILTERS.map((army, index) => [army.id, index]),
);

const TIER_FILTERS: Array<{ id: TierFilter; label: string }> = [
  { id: "ALL", label: "전체" },
  { id: "T1_T2", label: "1·2티어" },
  { id: "T3", label: "3티어" },
  { id: "SP", label: "SP" },
];

function SoldierPage() {
  const data = Route.useLoaderData();
  const [armyFilter, setArmyFilter] = useState<ArmyFilter | null>(null);
  const [tierFilter, setTierFilter] = useState<TierFilter>("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const records = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return data.records
      .filter((record) => {
        if (armyFilter && record.armyType !== armyFilter) return false;
        if (tierFilter === "SP" && !record.isSp) return false;
        if (
          tierFilter === "T1_T2" &&
          (record.isSp || (record.tier !== 1 && record.tier !== 2))
        ) {
          return false;
        }
        if (tierFilter === "T3" && (record.isSp || record.tier !== 3)) return false;

        if (needle) {
          const values = [record.nameKr ?? "", record.nameCn, String(record.soldierId)];
          if (!values.some((value) => value.toLowerCase().includes(needle))) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const armyOrderDiff =
          (ARMY_ORDER.get(a.armyType) ?? Number.MAX_SAFE_INTEGER) -
          (ARMY_ORDER.get(b.armyType) ?? Number.MAX_SAFE_INTEGER);
        if (armyOrderDiff !== 0) return armyOrderDiff;

        return b.soldierId - a.soldierId;
      });
  }, [armyFilter, data.records, query, tierFilter]);

  const selectedRecord =
    selectedId === null
      ? null
      : data.records.find((record) => record.soldierId === selectedId) ?? null;

  useEffect(() => {
    if (!selectedRecord) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedRecord]);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header>
          <Link
            to="/"
            className="text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            ← 메인으로
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            용병
          </h1>
        </header>

        <section className="mt-7 overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-4 border-b border-border sm:grid-cols-6 lg:grid-cols-11">
            <GroupButton selected={armyFilter === null} onClick={() => setArmyFilter(null)}>
              전체
            </GroupButton>
            {ARMY_FILTERS.map((item) => (
              <GroupButton
                key={item.id}
                selected={armyFilter === item.id}
                onClick={() => setArmyFilter(item.id)}
              >
                <span className="inline-flex items-center justify-center gap-1 sm:gap-1.5">
                  <ArmyIcon armyType={item.id} className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                  <span>{item.label}</span>
                </span>
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
                placeholder="검색"
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
            실제 용병 이미지 asset은 아직 연결하지 않았어.
          </p>
        </div>

        <section
          aria-label="용병 목록"
          className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 xl:grid-cols-8"
        >
          {records.map((record) => (
            <SoldierCard
              key={record.soldierId}
              record={record}
              selected={selectedId === record.soldierId}
              onClick={() => setSelectedId(record.soldierId)}
            />
          ))}

          {records.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-border px-4 py-14 text-center text-sm text-muted-foreground">
              현재 조건에 맞는 용병이 없어.
            </div>
          ) : null}
        </section>
      </div>

      {selectedRecord ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelectedId(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="soldier-detail-title"
            className="relative max-h-[calc(100dvh-1rem)] w-full max-w-4xl overflow-y-auto sm:max-h-[90vh]"
          >
            <button
              type="button"
              aria-label="상세 창 닫기"
              onClick={() => setSelectedId(null)}
              className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <SoldierDetail record={selectedRecord} />
          </div>
        </div>
      ) : null}
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

function ArmyIcon({
  armyType,
  className = "h-5 w-5",
}: {
  armyType: string;
  className?: string;
}) {
  const officialUrl = getOfficialArmyIconUrl(armyType);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (officialUrl && failedUrl !== officialUrl) {
    return (
      <img
        src={officialUrl}
        alt=""
        className={`${className} object-contain`}
        aria-hidden="true"
        onError={() => setFailedUrl(officialUrl)}
      />
    );
  }

  return <FallbackArmyIcon armyType={armyType} className={className} />;
}

function FallbackArmyIcon({
  armyType,
  className = "h-5 w-5",
}: {
  armyType: string;
  className?: string;
}) {
  let content: ReactNode;

  switch (armyType) {
    case "INFANTRY":
      content = (
        <>
          <path d="M15 4 20 3l-1 5-9 9-3-3 9-9Z" />
          <path d="m7 14-3 3 3 3 3-3" />
        </>
      );
      break;
    case "LANCER":
      content = (
        <>
          <path d="M4 20 17 7" />
          <path d="m16 3 5 1-1 5-4-6Z" />
          <path d="m7 14 3 3" />
        </>
      );
      break;
    case "CAVALRY":
      content = (
        <>
          <path d="M6 5v7a6 6 0 0 0 12 0V5" />
          <path d="M6 5h4v7a2 2 0 0 0 4 0V5h4" />
        </>
      );
      break;
    case "FLYING":
      content = (
        <>
          <path d="M4 15c6 0 9-7 16-10-2 8-6 13-14 14" />
          <path d="M7 15c4-1 7-4 10-7" />
          <path d="M9 18c3-1 5-3 7-5" />
        </>
      );
      break;
    case "WATER":
      content = (
        <>
          <path d="M3 8c2.5 2 4.5 2 7 0s4.5-2 7 0 4.5 2 4 2" />
          <path d="M3 13c2.5 2 4.5 2 7 0s4.5-2 7 0 4.5 2 4 2" />
          <path d="M3 18c2.5 2 4.5 2 7 0s4.5-2 7 0 4.5 2 4 2" />
        </>
      );
      break;
    case "ARCHER":
      content = (
        <>
          <path d="M5 4c8 3 8 13 0 16" />
          <path d="M5 4v16" />
          <path d="M5 12h15" />
          <path d="m17 9 3 3-3 3" />
        </>
      );
      break;
    case "ASSASSIN":
      content = (
        <>
          <path d="m14 3 4 1-1 4-7 7-3-3 7-7Z" />
          <path d="m7 12-3 3 5 5 3-3" />
        </>
      );
      break;
    case "MAGE":
      content = (
        <>
          <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
          <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
        </>
      );
      break;
    case "HOLY":
      content = <path d="M10 3h4v6h5v4h-5v8h-4v-8H5V9h5V3Z" />;
      break;
    case "DEMON":
      content = (
        <>
          <path d="M5 4c0 4 2 7 7 8 5-1 7-4 7-8" />
          <path d="M8 8c-2 4-1 9 4 12 5-3 6-8 4-12" />
          <path d="M9 14h.01M15 14h.01" />
        </>
      );
      break;
    default:
      content = <circle cx="12" cy="12" r="7" />;
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {content}
    </svg>
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
  const army = ARMY_BY_TYPE.get(record.armyType);
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
            {army?.shortLabel ?? "?"}
          </span>
        </div>
      </div>

      <div className="absolute left-1.5 top-1.5 flex gap-1">
        <span className="rounded bg-black/65 px-1.5 py-0.5 text-[14px] font-bold leading-none text-white">
          {record.isSp ? "SP" : `T${record.tier}`}
        </span>
      </div>

      <div
        className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded bg-black/65 text-white shadow-sm sm:h-[26px] sm:w-[26px]"
        title={army?.label ?? record.armyType}
      >
        <ArmyIcon armyType={record.armyType} className="h-[14px] w-[14px] sm:h-4 sm:w-4" />
        <span className="sr-only">{army?.label ?? record.armyType}</span>
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
  const army = ARMY_BY_TYPE.get(record.armyType);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-start gap-4 border-b border-border p-4 pr-16 sm:p-5 sm:pr-16">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-foreground">
          <Shield className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded bg-foreground px-2 py-0.5 text-[11px] font-bold text-background">
              {record.isSp ? "SP" : `${record.tier}티어`}
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              <ArmyIcon armyType={record.armyType} className="h-3.5 w-3.5" />
              {army?.label ?? record.armyType}
            </span>
          </div>
          <h2 id="soldier-detail-title" className="mt-2 truncate text-xl font-bold text-foreground">
            {displayName}
          </h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{record.nameCn}</p>
          <p className="mt-1 text-xs text-muted-foreground">Soldier ID {record.soldierId}</p>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <h3 className="text-sm font-bold text-foreground">기초 스탯</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          <DetailRow
            label="한국명 상태"
            value={record.nameKrStatus === "confirmed" ? "확정" : "검수 중"}
          />
          <DetailRow label="출시 정보" value={record.release.releaseDate ?? "미확정"} />
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
          frozen 목록·전투 consumer를 그대로 표시해. 패시브, 훈련 비용, 사용 영웅, SP 미션과
          실제 용병 이미지는 후속 UI 연결 대상이야.
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
