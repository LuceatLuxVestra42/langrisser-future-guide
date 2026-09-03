import { CalendarDays } from "lucide-react";

import spritePart01 from "@/components/banner-log/assets/banner-log-sprite-01.b64?raw";
import spritePart02 from "@/components/banner-log/assets/banner-log-sprite-02.b64?raw";
import spritePart03 from "@/components/banner-log/assets/banner-log-sprite-03.b64?raw";
import spritePart04 from "@/components/banner-log/assets/banner-log-sprite-04.b64?raw";
import spritePart05 from "@/components/banner-log/assets/banner-log-sprite-05.b64?raw";
import spritePart06 from "@/components/banner-log/assets/banner-log-sprite-06.b64?raw";
import spritePart07 from "@/components/banner-log/assets/banner-log-sprite-07.b64?raw";
import spritePart08 from "@/components/banner-log/assets/banner-log-sprite-08.b64?raw";
import {
  LLR_PICKUP_LOG,
  SINGLE_PICKUP_LOG,
  type SinglePickupLogEntry,
} from "@/lib/banner-single-pickup-log";

const bannerLogSprite = `data:image/webp;base64,${[
  spritePart01,
  spritePart02,
  spritePart03,
  spritePart04,
  spritePart05,
  spritePart06,
  spritePart07,
  spritePart08,
].join("")}`;

function formatMonthDay(date: string) {
  const [, month, day] = date.split("-");
  return `${month}.${day}`;
}

function groupEntriesByYear(entries: SinglePickupLogEntry[]) {
  const groups = new Map<string, SinglePickupLogEntry[]>();

  for (const entry of entries) {
    const year = entry.date.slice(0, 4);
    const current = groups.get(year);
    if (current) {
      current.push(entry);
    } else {
      groups.set(year, [entry]);
    }
  }

  return Array.from(groups.entries());
}

type PickupLogCardRecord = {
  key: string;
  label: string;
  entries: SinglePickupLogEntry[];
  spriteIndex: number;
};

function BannerLogArtwork({ label, spriteIndex }: { label: string; spriteIndex: number }) {
  return (
    <div className="flex items-center justify-center bg-muted/30 p-3 sm:p-4 lg:min-h-full">
      <div
        role="img"
        aria-label={`${label} 배너`}
        className="aspect-[956/232] w-full overflow-hidden rounded-xl bg-cover bg-no-repeat shadow-sm"
        style={{
          backgroundImage: `url(${bannerLogSprite})`,
          backgroundSize: "100% 1100%",
          backgroundPosition: `center ${spriteIndex * 10}%`,
        }}
      />
    </div>
  );
}

function PickupLogGrid({
  records,
  badge,
}: {
  records: PickupLogCardRecord[];
  badge: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {records.map((record) => (
        <article
          key={record.key}
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid lg:grid-cols-2"
        >
          <BannerLogArtwork label={record.label} spriteIndex={record.spriteIndex} />

          <div className="min-w-0 border-t border-border lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 px-2 text-sm font-black text-primary">
                  {badge}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-foreground">
                    {record.label}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    총 {record.entries.length}회
                  </p>
                </div>
              </div>
              <CalendarDays size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>

            <div className="divide-y divide-border">
              {groupEntriesByYear(record.entries).map(([year, entries]) => (
                <div
                  key={year}
                  className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3 px-4 py-3.5 sm:grid-cols-[4.25rem_minmax(0,1fr)] sm:px-5"
                >
                  <div className="pt-1 text-sm font-bold tabular-nums text-foreground">
                    {year}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {entries.map((entry) => (
                      <div
                        key={entry.date}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm"
                      >
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatMonthDay(entry.date)}
                        </span>
                        {entry.note && (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                            {entry.note}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function LogSectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function SinglePickupLogPage() {
  const singleRecords: PickupLogCardRecord[] = SINGLE_PICKUP_LOG.map((record, index) => ({
    key: record.heroNameKr,
    label: record.heroNameKr,
    entries: record.entries,
    spriteIndex: index,
  }));
  const llrRecords: PickupLogCardRecord[] = LLR_PICKUP_LOG.map((record, index) => ({
    key: record.bannerNameKr,
    label: record.bannerNameKr,
    entries: record.entries,
    spriteIndex: SINGLE_PICKUP_LOG.length + index,
  }));

  return (
    <section>
      <LogSectionHeader
        title="1인 log"
        description="한섭 1인 SSR 픽업 기록"
      />
      <PickupLogGrid records={singleRecords} badge="1인" />

      <div className="mt-10 border-t border-border pt-8">
        <LogSectionHeader
          title="LLR log"
          description="한섭 LLR 한정 소환 기록"
        />
        <PickupLogGrid records={llrRecords} badge="LLR" />
      </div>
    </section>
  );
}
