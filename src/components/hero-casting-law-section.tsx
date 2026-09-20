import { ChevronDown } from "lucide-react";

export type HeroCastingLawPresentation = {
  heroId: number;
  slots: Array<{
    sourceIndex: number;
    templateId: number;
    slotType: string;
    costProfile: "A" | "B" | "C";
    templateNameCn: string | null;
    equipmentType: number | null;
    summaryIcon: { labelKr: string; iconUrl: string } | null;
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

function summaryToneClass(slotType: string) {
  if (slotType.startsWith("WEAPON_")) {
    return "border-red-500/60 bg-red-500/25";
  }
  if (slotType === "ARMOR") {
    return "border-green-500/60 bg-green-500/25";
  }
  if (slotType === "HEAD") {
    return "border-blue-500/60 bg-blue-500/25";
  }
  return "border-border bg-background";
}

function MaterialBadges({ materials }: { materials: CastingLawMaterial[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {materials.map((material) => (
        <span
          key={material.itemId}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground"
          data-casting-law-material-id={material.itemId}
        >
          <img
            src={material.iconUrl}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            decoding="async"
            className="h-7 w-7 shrink-0 object-contain"
            data-casting-law-material-icon={material.itemId}
          />
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
}: {
  levels: HeroCastingLawPresentation["slots"][number]["levels"];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col className="w-14 sm:w-16" />
          <col />
          <col className="w-[5.25rem] sm:w-24" />
        </colgroup>
        <thead className="bg-muted/50">
          <tr className="border-b border-border">
            <th className="px-2 py-2 text-left font-bold text-muted-foreground sm:px-3">단계</th>
            <th className="px-2 py-2 text-left font-bold text-muted-foreground sm:px-3">필요 재료</th>
            <th className="px-2 py-2 text-right font-bold text-muted-foreground sm:px-3">골드</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((level) => (
            <tr key={level.levelInfoId} className="border-b border-border/60 last:border-b-0">
              <th scope="row" className="whitespace-nowrap px-2 py-2.5 text-left font-extrabold text-foreground sm:px-3">
                Lv.{level.level}
              </th>
              <td className="px-2 py-2.5 sm:px-3">
                <div className="flex flex-wrap gap-1">
                  {level.materials.map((material, index) => (
                    <span
                      key={`${material.itemId}-${index}`}
                      className="inline-flex min-w-0 items-center gap-1 rounded bg-muted/40 px-1.5 py-1 text-[11px] font-semibold text-foreground sm:px-2"
                      data-casting-law-level-material-id={material.itemId}
                    >
                      <img
                        src={material.iconUrl}
                        alt=""
                        width={24}
                        height={24}
                        loading="lazy"
                        decoding="async"
                        className="h-6 w-6 shrink-0 object-contain"
                        data-casting-law-level-material-icon={material.itemId}
                      />
                      <span className="font-extrabold tabular-nums">×{formatNumber(material.count)}</span>
                    </span>
                  ))}
                </div>
              </td>
              <td className="whitespace-nowrap px-2 py-2.5 text-right text-[11px] font-bold tabular-nums text-foreground sm:px-3 sm:text-xs">
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
            <h3 className="font-extrabold text-foreground">{slotLabel(slot.slotType)}</h3>
          </div>
          <span className="text-xs font-bold text-muted-foreground group-open:hidden">단계별 보기</span>
          <span className="hidden text-xs font-bold text-muted-foreground group-open:inline">접기</span>
        </div>

        <div className="mt-3">
          <RangeSummary title="Lv.1~10" totals={slot.level1to10} />
        </div>
      </summary>

      <div className="border-t border-border px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
        <h4 className="mb-2 text-xs font-extrabold text-foreground">Lv.1~10 단계별</h4>
        <LevelTable levels={slot.levels} />
      </div>
    </details>
  );
}

export function HeroCastingLawMaterials({
  castingLaw,
}: {
  castingLaw: HeroCastingLawPresentation;
}) {
  return (
    <div
      className="mt-5 border-t border-border pt-5"
      data-hero-casting-law="true"
      data-casting-law-slot-count={castingLaw.slots.length}
    >
      <div data-casting-law-summary="true">
        <h3 className="text-sm font-extrabold text-foreground">1~5레벨 요구 문양 재료</h3>
        <div className="mt-3 flex flex-wrap items-start gap-3">
          {castingLaw.slots
            .filter((slot) => slot.summaryIcon !== null)
            .map((slot) => (
              <div
                key={`summary-${slot.sourceIndex}-${slot.templateId}`}
                className="flex w-20 flex-col items-center gap-1.5"
                data-casting-law-summary-template-id={slot.templateId}
              >
                <span
                  className={`inline-flex h-14 w-14 items-center justify-center rounded-xl border sm:h-16 sm:w-16 ${summaryToneClass(slot.slotType)}`}
                  title={slot.summaryIcon?.labelKr}
                >
                  <img
                    src={slot.summaryIcon?.iconUrl}
                    alt={slot.summaryIcon?.labelKr ?? ""}
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-12 object-contain sm:h-14 sm:w-14"
                  />
                </span>
                <span className="w-full text-center text-xs font-bold leading-tight text-foreground">
                  {slot.summaryIcon?.labelKr}
                </span>
              </div>
            ))}
        </div>
      </div>

      <details className="group mt-4 border-t border-border pt-4" data-casting-law-details="true">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="text-sm font-extrabold text-foreground">율정 재료</span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4" data-casting-law-hero-total="true">
          <h3 className="text-sm font-extrabold text-foreground">율정 합계비용</h3>
          <div className="mt-3">
            <RangeSummary title="Lv.1~10" totals={castingLaw.totals.level1to10} />
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {castingLaw.slots.map((slot) => (
            <SlotCard key={`${slot.sourceIndex}-${slot.templateId}-${slot.slotType}`} slot={slot} />
          ))}
        </div>
      </details>
    </div>
  );
}
