export type HeroCastingLawPresentation = {
  heroId: number;
  slots: Array<{
    sourceIndex: number;
    templateId: number;
    slotType: string;
    costProfile: "A" | "B" | "C";
    templateNameCn: string | null;
    equipmentType: number | null;
    level1to5: CastingLawRangeTotals;
    level6to10: CastingLawRangeTotals;
    level1to10: CastingLawRangeTotals;
    levels: Array<{
      level: number;
      levelInfoId: number;
      goldCost: number;
      materials: CastingLawMaterial[];
    }>;
  }>;
  totals: {
    level1to5: CastingLawRangeTotals;
    level6to10: CastingLawRangeTotals;
    level1to10: CastingLawRangeTotals;
  };
};

type CastingLawMaterial = {
  itemId: number;
  count: number;
  nameCn: string;
  sourceIconPath: string | null;
  iconUrl: string;
};

type CastingLawRangeTotals = {
  gold: number;
  materials: CastingLawMaterial[];
};

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function slotLabel(slotType: string) {
  if (slotType === "ARMOR") return "갑옷";
  if (slotType === "HEAD") return "투구";
  if (slotType === "ACCESSORY") return "악세사리";
  if (slotType.startsWith("WEAPON_")) {
    const ordinal = Number(slotType.slice("WEAPON_".length));
    return Number.isSafeInteger(ordinal) && ordinal > 0 ? `무기 ${ordinal}` : "무기";
  }
  return slotType;
}

function MaterialBadges({ materials }: { materials: CastingLawMaterial[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {materials.map((material) => (
        <span
          key={material.itemId}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground"
          data-casting-law-material-id={material.itemId}
          data-casting-law-material-source-icon={material.sourceIconPath ?? ""}
        >
          <img
            src={material.iconUrl}
            alt={material.nameCn}
            title={material.nameCn}
            width={32}
            height={32}
            loading="lazy"
            decoding="async"
            className="h-8 w-8 shrink-0 object-contain"
          />
          <span className="max-w-[15rem] truncate">{material.nameCn}</span>
          <span className="font-extrabold tabular-nums">×{formatNumber(material.count)}</span>
        </span>
      ))}
    </div>
  );
}

function RangeSummary({
  title,
  totals,
}: {
  title: string;
  totals: CastingLawRangeTotals;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-extrabold text-foreground">{title}</h4>
        <span className="text-xs font-bold tabular-nums text-muted-foreground">
          골드 {formatNumber(totals.gold)}
        </span>
      </div>
      <div className="mt-2">
        <MaterialBadges materials={totals.materials} />
      </div>
    </div>
  );
}

function LevelTable({
  levels,
  from,
  to,
}: {
  levels: HeroCastingLawPresentation["slots"][number]["levels"];
  from: number;
  to: number;
}) {
  const rows = levels.filter((level) => level.level >= from && level.level <= to);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <thead className="bg-muted/50">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-bold text-muted-foreground">단계</th>
            <th className="px-3 py-2 text-left font-bold text-muted-foreground">필요 재료</th>
            <th className="px-3 py-2 text-right font-bold text-muted-foreground">골드</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((level) => (
            <tr key={level.levelInfoId} className="border-b border-border/60 last:border-b-0">
              <th scope="row" className="whitespace-nowrap px-3 py-2.5 text-left font-extrabold text-foreground">
                Lv.{level.level}
              </th>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {level.materials.map((material, index) => (
                    <span
                      key={`${material.itemId}-${index}`}
                      className="inline-flex items-center gap-1 rounded bg-muted/40 px-2 py-1 text-[11px] font-semibold text-foreground"
                      data-casting-law-level-material-id={material.itemId}
                      data-casting-law-level-material-source-icon={material.sourceIconPath ?? ""}
                    >
                      <img
                        src={material.iconUrl}
                        alt={material.nameCn}
                        title={material.nameCn}
                        width={36}
                        height={36}
                        loading="lazy"
                        decoding="async"
                        className="h-9 w-9 shrink-0 object-contain"
                      />
                      <span>{material.nameCn}</span>
                      <span className="font-extrabold tabular-nums">×{formatNumber(material.count)}</span>
                    </span>
                  ))}
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-foreground">
                {formatNumber(level.goldCost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlotCard({ slot }: { slot: HeroCastingLawPresentation["slots"][number] }) {
  return (
    <details
      className="group rounded-xl border border-border bg-muted/10"
      data-casting-law-slot={slot.slotType}
      data-casting-law-template-id={slot.templateId}
      data-casting-law-cost-profile={slot.costProfile}
    >
      <summary className="cursor-pointer list-none p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold text-foreground">{slotLabel(slot.slotType)}</h3>
              <span className="rounded bg-muted px-2 py-1 text-[10px] font-black text-muted-foreground">
                비용형 {slot.costProfile}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {slot.templateNameCn ?? `Template ${slot.templateId}`}
            </p>
          </div>
          <span className="text-xs font-bold text-muted-foreground group-open:hidden">단계별 보기</span>
          <span className="hidden text-xs font-bold text-muted-foreground group-open:inline">접기</span>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <RangeSummary title="Lv.1~5 합계" totals={slot.level1to5} />
          <RangeSummary title="Lv.6~10 합계" totals={slot.level6to10} />
        </div>
      </summary>

      <div className="border-t border-border px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-extrabold text-foreground">Lv.1~5 단계별</h4>
            <LevelTable levels={slot.levels} from={1} to={5} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-extrabold text-foreground">Lv.6~10 단계별</h4>
            <LevelTable levels={slot.levels} from={6} to={10} />
          </div>
        </div>
      </div>
    </details>
  );
}

export function HeroCastingLawSection({
  castingLaw,
}: {
  castingLaw: HeroCastingLawPresentation;
}) {
  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-casting-law="true"
      data-casting-law-slot-count={castingLaw.slots.length}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-foreground">율정</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            부위별 Lv.1~10 강화 재료와 요구 골드
          </p>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">총 {castingLaw.slots.length}개 슬롯</span>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4" data-casting-law-hero-total="true">
        <h3 className="text-sm font-extrabold text-foreground">전체 슬롯 합계</h3>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <RangeSummary title="Lv.1~5" totals={castingLaw.totals.level1to5} />
          <RangeSummary title="Lv.6~10" totals={castingLaw.totals.level6to10} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {castingLaw.slots.map((slot) => (
          <SlotCard key={`${slot.sourceIndex}-${slot.templateId}-${slot.slotType}`} slot={slot} />
        ))}
      </div>
    </section>
  );
}
