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

function CommandVariantTable({ variant, mode }: { variant: CommandVariant; mode: "NORMAL" | "SP" }) {
  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-border bg-background" data-command-mode={mode}>
      <div className="min-w-0" data-command-table-fit="true">
        <table className="w-full table-fixed border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="w-1/4 px-2 py-2.5 text-left font-bold sm:px-3">능력치</th>
              <th scope="col" className="w-1/4 px-2 py-2.5 text-right font-bold leading-tight sm:px-3">기본 지휘</th>
              <th scope="col" className="w-1/4 px-2 py-2.5 text-right font-bold leading-tight sm:px-3">중앙 유대</th>
              <th scope="col" className="w-1/4 px-2 py-2.5 text-right font-bold sm:px-3">최종</th>
            </tr>
          </thead>
          <tbody>
            {STAT_ROWS.map(({ key, label }) => (
              <tr key={key} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-2 py-3 text-left font-bold text-foreground sm:px-3">{label}</th>
                <td className="px-2 py-3 text-right sm:px-3"><PercentValue value={variant.base[key]} /></td>
                <td className="px-2 py-3 text-right sm:px-3"><PercentValue value={variant.hero3Contribution[key]} /></td>
                <td className="px-2 py-3 text-right sm:px-3"><PercentValue value={variant.final[key]} emphasized /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function HeroSoldierCommandSection({
  soldierCommand,
  mode,
}: {
  soldierCommand: HeroSoldierCommandView;
  mode: "normal" | "sp";
}) {
  const variant = mode === "sp" ? soldierCommand.sp : soldierCommand.normal;
  if (!variant) {
    throw new Error(`Hero ${soldierCommand.heroId} requested SP Soldier command without a frozen SP variant.`);
  }

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-soldier-command="true"
      data-hero-form-mode={mode}
    >
      <h2 className="font-bold text-foreground">병사 지휘 보정</h2>

      <div className="mt-4">
        <CommandVariantTable
          mode={mode === "sp" ? "SP" : "NORMAL"}
          variant={variant}
        />
      </div>
    </section>
  );
}
