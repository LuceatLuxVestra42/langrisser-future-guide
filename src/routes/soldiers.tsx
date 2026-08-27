import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { getOfficialArmyIconUrl } from "@/lib/army-icon-assets";
import { getOfficialSoldierPortraitUrl } from "@/lib/soldier-portrait-assets";
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



  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header>
          <Link
            to="/"
            className="inline-flex items-center rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ← 메인으로
          </Link>
        </header>

        <section className="mt-7 overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-6">
            <div className="row-span-2 grid">
              <GroupButton selected={armyFilter === null} onClick={() => setArmyFilter(null)}>
                전체
              </GroupButton>
            </div>
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

          <div className="flex flex-col gap-[8.4px] p-[8.4px] sm:flex-row sm:items-center sm:justify-between sm:p-[11.2px]">
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
                className="h-7 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/50 focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
        </section>

        <div className="mt-5">
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{records.length}</span>개 표시
          </p>
        </div>

        <section
          aria-label="용병 목록"
          className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 xl:grid-cols-8"
        >
          {records.map((record) => (
            <SoldierCard key={record.soldierId} record={record} />
          ))}

          {records.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-border px-4 py-14 text-center text-sm text-muted-foreground">
              현재 조건에 맞는 용병이 없어.
            </div>
          ) : null}
        </section>
      </div>

      <Outlet />
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
      className={`min-h-[35.84px] border-b border-r border-border px-1 text-xs font-bold transition sm:min-h-[40.96px] sm:text-sm ${
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
      className={`h-7 rounded-md border px-3 py-0 text-sm font-semibold transition ${
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

function SoldierCard({ record }: { record: SoldierPrototypeRecord }) {
  const army = ARMY_BY_TYPE.get(record.armyType);
  const displayName = record.nameKr ?? record.nameCn;
  const portraitUrl = getOfficialSoldierPortraitUrl(record.soldierId);
  const [portraitFailed, setPortraitFailed] = useState(false);

  return (
    <Link
      to="/soldiers/$soldierId"
      params={{ soldierId: String(record.soldierId) }}
      preload="intent"
      aria-label={`${displayName} 상세 보기`}
      title={`${displayName} · Soldier ${record.soldierId}`}
      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted pb-8 text-muted-foreground transition group-hover:text-foreground">
        {portraitUrl && !portraitFailed ? (
          <img
            src={portraitUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-contain object-bottom px-1 pb-7 pt-2 transition-transform duration-200 group-hover:scale-[1.02]"
            onError={() => setPortraitFailed(true)}
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-current/20 bg-background/70 sm:h-16 sm:w-16">
            <span className="text-base font-black tracking-tight sm:text-lg">
              {army?.shortLabel ?? "?"}
            </span>
          </div>
        )}
      </div>

      <div className="absolute left-1.5 top-1.5 flex gap-1">
        <span className="rounded bg-black/65 px-1.5 py-0.5 text-[14px] font-bold leading-none text-white">
          {record.isSp ? "SP" : `T${record.tier}`}
        </span>
      </div>

      <div
        className="absolute right-1.5 top-1.5 flex items-center justify-center"
        title={army?.label ?? record.armyType}
      >
        <ArmyIcon
          armyType={record.armyType}
          className="h-[19.2px] w-[19.2px] sm:h-[21.6px] sm:w-[21.6px]"
        />
        <span className="sr-only">{army?.label ?? record.armyType}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1.5 text-center backdrop-blur-[1px]">
        <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white sm:text-xs">
          {displayName}
        </span>
      </div>
    </Link>
  );
}
