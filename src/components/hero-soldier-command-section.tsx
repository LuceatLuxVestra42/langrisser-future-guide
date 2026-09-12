type CommandVector = {
  hp: number;
  at: number;
  df: number;
  magicDf: number;
};

type CommandVariant = {
  baseSource: string;
  base: CommandVector;
  hero3Contribution: CommandVector;
  final: CommandVector;
};

export type HeroSoldierCommandView = {
  heroId: number;
  spEligible: boolean;
  normal: CommandVariant;
  sp: CommandVariant | null;
};

const STAT_ROWS: Array<{ key: keyof CommandVector; label: string }> = [
  { key: "hp", label: "생명" },
  { key: "at", label: "공격" },
  { key: "df", label: "방어" },
  { key: "magicDf", label: "마방" },
];

function PercentValue({ value, emphasized = false }: { value: number; emphasized?: boolean }) {
  return (
    <span className={emphasized ? "font-black tabular-nums text-foreground" : "font-semibold tabular-nums text-muted-foreground"}>
      +{value}%
    </span>
  );
}

function CommandVariantTable({ title, variant, mode }: { title: string; variant: CommandVariant; mode: "NORMAL" | "SP" }) {
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-background" data-command-mode={mode}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/35 px-4 py-3">
        <h3 className="font-bold text-foreground">{title}</h3>
        <span className="text-[11px] font-bold text-muted-foreground">최종 지휘 보정</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 text-left font-bold">능력치</th>
              <th scope="col" className="px-4 py-2.5 text-right font-bold">기본 지휘</th>
              <th scope="col" className="px-4 py-2.5 text-right font-bold">중앙 유대</th>
              <th scope="col" className="px-4 py-2.5 text-right font-bold">최종</th>
            </tr>
          </thead>
          <tbody>
            {STAT_ROWS.map(({ key, label }) => (
              <tr key={key} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-4 py-3 text-left font-bold text-foreground">{label}</th>
                <td className="px-4 py-3 text-right"><PercentValue value={variant.base[key]} /></td>
                <td className="px-4 py-3 text-right"><PercentValue value={variant.hero3Contribution[key]} /></td>
                <td className="px-4 py-3 text-right"><PercentValue value={variant.final[key]} emphasized /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function HeroSoldierCommandSection({ soldierCommand }: { soldierCommand: HeroSoldierCommandView }) {
  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-soldier-command="true">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">병사 지휘 보정</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          영웅 기본 지휘 보정과 중앙 유대의 병사 보정을 분리해서 표시해. 최종 수치는 두 값을 합산한 결과야.
        </p>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <CommandVariantTable title="일반 클래스" mode="NORMAL" variant={soldierCommand.normal} />
        {soldierCommand.spEligible && soldierCommand.sp ? (
          <CommandVariantTable title="SP 클래스" mode="SP" variant={soldierCommand.sp} />
        ) : null}
      </div>
    </section>
  );
}
