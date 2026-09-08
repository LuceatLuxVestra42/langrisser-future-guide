type ExtremeKind = "MIN" | "MAX" | "BOTH" | null;
type StatKey = "hp" | "at" | "magic" | "df" | "magicDf" | "dex";

type FinalJobStatsData = {
  heroId: number;
  sourceStage: string;
  eligibility: {
    authoritativeField: string;
    requiredRank: number;
    topologyUsed: boolean;
  };
  scaleDomains: Record<StatKey, { min: number; max: number }>;
  rows: Array<{
    variant: "NORMAL" | "SP";
    jobConnectionId: number;
    jobId: number;
    jobNameCn: string | null;
    values: Record<StatKey, number>;
    extremes: Record<StatKey, ExtremeKind>;
  }>;
};

const STATS = [
  ["hp", "생명"],
  ["at", "공격"],
  ["magic", "지력"],
  ["df", "방어"],
  ["magicDf", "마방"],
  ["dex", "기술"],
] as const satisfies ReadonlyArray<readonly [StatKey, string]>;

const MINIMUM_FILL_PERCENT = 25;
const MAXIMUM_FILL_PERCENT = 100;

function getBarPercent(value: number, domain: { min: number; max: number }) {
  if (!Number.isFinite(value) || !Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) {
    throw new Error("Hero stat bar received an invalid S2 scale domain.");
  }
  if (value < domain.min || value > domain.max) {
    throw new Error(`Hero stat value ${value} is outside its B3 presentation domain ${domain.min}-${domain.max}.`);
  }

  const ratio = (value - domain.min) / (domain.max - domain.min);
  const barPercent = MINIMUM_FILL_PERCENT + ratio * (MAXIMUM_FILL_PERCENT - MINIMUM_FILL_PERCENT);
  return Math.min(MAXIMUM_FILL_PERCENT, Math.max(MINIMUM_FILL_PERCENT, barPercent));
}

function ExtremeBadge({ kind }: { kind: ExtremeKind }) {
  if (!kind) return null;
  const label = kind === "MIN" ? "전체 최저" : kind === "MAX" ? "전체 최고" : "전체 최저·최고";
  return (
    <span className="inline-flex rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold leading-none text-muted-foreground">
      {label}
    </span>
  );
}

export function HeroFinalJobStatsSection({ data }: { data: FinalJobStatsData }) {
  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-final-job-stats="true"
      data-final-job-source={data.sourceStage}
      data-final-job-rank={data.eligibility.requiredRank}
      data-stat-bar-min-fill={MINIMUM_FILL_PERCENT}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">최종 직업 스탯</h2>
        <p className="text-xs font-semibold text-muted-foreground">Lv.70 · 6성 · MAX 유대</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        검증된 최종직업(Tier 4) bonded consumer 기준이야. SP가 출시된 영웅은 SP 직업도 함께 표시해.
      </p>

      {data.rows.length > 0 ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2" data-final-job-card-grid="true">
          {data.rows.map((row) => (
            <article
              key={`${row.variant}-${row.jobConnectionId}-${row.jobId}`}
              className="min-w-0 rounded-xl border border-border bg-background/40 p-4"
              data-final-job-card="true"
              data-final-job-variant={row.variant}
              data-job-connection-id={row.jobConnectionId}
              data-job-id={row.jobId}
            >
              <header className="flex min-w-0 items-center gap-2 border-b border-border pb-3">
                <h3 className="min-w-0 truncate text-base font-bold text-foreground">{row.jobNameCn ?? `Job ${row.jobId}`}</h3>
                {row.variant === "SP" ? (
                  <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-black tracking-wide text-foreground">SP</span>
                ) : null}
              </header>

              <div className="mt-4 space-y-3">
                {STATS.map(([key, label]) => {
                  const value = row.values[key];
                  const barPercent = getBarPercent(value, data.scaleDomains[key]);
                  return (
                    <div
                      key={key}
                      className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_3.75rem] items-center gap-3"
                      data-stat-bar-row={key}
                      data-extreme={row.extremes[key] ?? undefined}
                    >
                      <span className="text-xs font-bold text-muted-foreground">{label}</span>
                      <div className="h-3 min-w-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          className="h-full rounded-full bg-foreground/75 transition-[width] duration-300"
                          style={{ width: `${barPercent}%` }}
                          data-stat-bar={key}
                          data-bar-percent={barPercent.toFixed(4)}
                          data-domain-min={data.scaleDomains[key].min}
                          data-domain-max={data.scaleDomains[key].max}
                        />
                      </div>
                      <div className="flex min-w-0 flex-col items-end gap-1">
                        <span className="tabular-nums text-sm font-bold text-foreground" data-stat-value={key}>{value}</span>
                        <ExtremeBadge kind={row.extremes[key]} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 Tier 4 최종 직업이 없어.</p>
      )}
    </section>
  );
}
