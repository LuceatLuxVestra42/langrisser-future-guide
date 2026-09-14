import {
  HERO_FINAL_JOB_STAT_BAR_MIN_PERCENT,
  HERO_FINAL_JOB_STAT_KEYS,
  HERO_FINAL_JOB_STAT_LABELS,
  getHeroFinalJobStatBarPercent,
  getHeroFinalJobStatExtreme,
  type HeroFinalJobStatKey,
} from "./hero-final-job-stat-bars";

type JobStats = Record<HeroFinalJobStatKey, number | null>;

export type HeroFinalJobStatRow = {
  key: string;
  capstone: {
    jobConnectionId: number | null;
    jobId: number | null;
    nameCn: string | null;
    rank: number | null;
    heroLevel: number | null;
    star: number | null;
    statStatus: string | null;
    finalStats: JobStats;
    centralBondStats: JobStats | null;
  } | null;
};

function readVerifiedStat(row: NonNullable<HeroFinalJobStatRow["capstone"]>, stat: HeroFinalJobStatKey) {
  if (row.statStatus !== "VERIFIED") {
    throw new Error(`Hero final-job stat row ${row.jobConnectionId ?? row.jobId ?? "?"} is not VERIFIED.`);
  }
  const value = row.finalStats[stat];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Hero final-job stat row ${row.jobConnectionId ?? row.jobId ?? "?"} is missing ${stat}.`);
  }
  return value;
}

function ExtremeBadge({ kind }: { kind: "MIN" | "MAX" | null }) {
  if (!kind) return null;
  return (
    <span className="inline-flex rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold leading-none text-muted-foreground">
      {kind === "MIN" ? "전체 최저" : "전체 최고"}
    </span>
  );
}

function CentralBondSummary({ stats }: { stats: JobStats | null }) {
  if (!stats) return null;
  const entries = HERO_FINAL_JOB_STAT_KEYS.flatMap((stat) => {
    const value = stats[stat];
    return typeof value === "number" && Number.isFinite(value) && value !== 0
      ? [`${HERO_FINAL_JOB_STAT_LABELS[stat]} +${value}`]
      : [];
  });
  if (entries.length === 0) return null;
  return (
    <p className="mt-4 border-t border-border pt-3 text-[11px] font-semibold leading-5 text-muted-foreground" data-central-bond-summary="true">
      중앙유대 보정 · {entries.join(" · ")}
    </p>
  );
}

export function HeroFinalJobStatsSection({ rows }: { rows: HeroFinalJobStatRow[] }) {
  const visibleRows = rows.filter((row): row is HeroFinalJobStatRow & { capstone: NonNullable<HeroFinalJobStatRow["capstone"]> } => Boolean(row.capstone));

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-final-job-stats="true"
      data-stat-bar-min-fill={HERO_FINAL_JOB_STAT_BAR_MIN_PERCENT}
      data-final-job-stat-source="stage6-final-display-stats"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">최종 직업 스탯</h2>
        <p className="text-xs font-semibold text-muted-foreground">검증된 최종 표시값</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        각 막대는 같은 능력치의 현재 전체 최종 직업 범위에서 상대적인 위치를 보여줘. 숫자는 검증된 원래 값을 그대로 표시해.
      </p>

      {visibleRows.length > 0 ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2" data-final-job-card-grid="true">
          {visibleRows.map(({ key, capstone }) => {
            const variant = key === "sp" ? "SP" : "NORMAL";
            return (
              <article
                key={key}
                className="min-w-0 rounded-xl border border-border bg-background/40 p-4"
                data-final-job-card="true"
                data-final-job-variant={variant}
                data-job-connection-id={capstone.jobConnectionId ?? undefined}
                data-job-id={capstone.jobId ?? undefined}
              >
                <header className="flex min-w-0 items-start justify-between gap-3 border-b border-border pb-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-foreground">{capstone.nameCn ?? `Job ${capstone.jobId ?? "?"}`}</h3>
                    {capstone.heroLevel != null || capstone.star != null ? (
                      <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                        {[capstone.heroLevel != null ? `Lv.${capstone.heroLevel}` : null, capstone.star != null ? `${capstone.star}성` : null].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  {variant === "SP" ? (
                    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-black tracking-wide text-foreground">SP</span>
                  ) : null}
                </header>

                <div className="mt-4 space-y-3">
                  {HERO_FINAL_JOB_STAT_KEYS.map((stat) => {
                    const value = readVerifiedStat(capstone, stat);
                    const barPercent = getHeroFinalJobStatBarPercent(stat, value);
                    const extreme = getHeroFinalJobStatExtreme(stat, value);
                    return (
                      <div
                        key={stat}
                        className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_4.25rem] items-center gap-3"
                        data-stat-bar-row={stat}
                        data-extreme={extreme ?? undefined}
                      >
                        <span className="text-xs font-bold text-muted-foreground">{HERO_FINAL_JOB_STAT_LABELS[stat]}</span>
                        <div className="h-3 min-w-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <div
                            className="h-full rounded-full bg-foreground/75 transition-[width] duration-300"
                            style={{ width: `${barPercent}%` }}
                            data-stat-bar={stat}
                            data-bar-percent={barPercent.toFixed(4)}
                          />
                        </div>
                        <div className="flex min-w-0 flex-col items-end gap-1">
                          <span className="tabular-nums text-sm font-bold text-foreground" data-stat-value={stat}>{value}</span>
                          <ExtremeBadge kind={extreme} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <CentralBondSummary stats={capstone.centralBondStats} />
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 최종 직업 스탯이 없어.</p>
      )}
    </section>
  );
}
