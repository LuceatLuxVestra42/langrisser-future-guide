type ExtremeKind = "MIN" | "MAX" | "BOTH" | null;

type FinalJobStatsData = {
  heroId: number;
  sourceStage: string;
  eligibility: {
    authoritativeField: string;
    requiredRank: number;
    topologyUsed: boolean;
  };
  rows: Array<{
    variant: "NORMAL" | "SP";
    jobConnectionId: number;
    jobId: number;
    jobNameCn: string | null;
    values: {
      hp: number;
      at: number;
      magic: number;
      df: number;
      magicDf: number;
      dex: number;
    };
    extremes: {
      hp: ExtremeKind;
      at: ExtremeKind;
      magic: ExtremeKind;
      df: ExtremeKind;
      magicDf: ExtremeKind;
      dex: ExtremeKind;
    };
  }>;
};

const COLUMNS = [
  ["hp", "생명"],
  ["at", "공격"],
  ["magic", "지력"],
  ["df", "방어"],
  ["magicDf", "마방"],
  ["dex", "기술"],
] as const;

function ExtremeBadge({ kind }: { kind: ExtremeKind }) {
  if (!kind) return null;
  const label = kind === "MIN" ? "전체 최저" : kind === "MAX" ? "전체 최고" : "전체 최저·최고";
  return (
    <span className="ml-1 inline-flex rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold leading-none text-muted-foreground">
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
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">최종 직업 스탯</h2>
        <p className="text-xs font-semibold text-muted-foreground">Lv.70 · 6성 · MAX 유대</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        검증된 최종직업(Tier 4) bonded consumer 기준이야. SP가 출시된 영웅은 SP 직업도 함께 표시해.
      </p>

      {data.rows.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">직업</th>
                {COLUMNS.map(([, label]) => (
                  <th key={label} scope="col" className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={`${row.variant}-${row.jobConnectionId}-${row.jobId}`} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-4 py-3 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">{row.jobNameCn ?? `Job ${row.jobId}`}</span>
                      {row.variant === "SP" ? (
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-black tracking-wide text-foreground">SP</span>
                      ) : null}
                    </div>
                  </th>
                  {COLUMNS.map(([key]) => (
                    <td key={key} className="px-4 py-3 text-right tabular-nums text-foreground" data-extreme={row.extremes[key] ?? undefined}>
                      <span className="font-semibold">{row.values[key]}</span>
                      <ExtremeBadge kind={row.extremes[key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 Tier 4 최종 직업이 없어.</p>
      )}
    </section>
  );
}
