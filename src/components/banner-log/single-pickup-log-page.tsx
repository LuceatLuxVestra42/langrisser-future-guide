import { CalendarDays } from "lucide-react";

import {
  LLR_PICKUP_LOG,
  SINGLE_PICKUP_LOG,
  type SinglePickupLogEntry,
} from "@/lib/banner-single-pickup-log";

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
};

function PickupLogGrid({
  records,
  badge,
}: {
  records: PickupLogCardRecord[];
  badge: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {records.map((record) => (
        <article
          key={record.key}
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        >
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
        </article>
      ))}
    </div>
  );
}

function LogSectionHeader({
  title,
  description,
  recordCount,
  totalEntries,
}: {
  title: string;
  description: string;
  recordCount: number;
  totalEntries: number;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
        {recordCount}개 배너 · {totalEntries}회
      </span>
    </div>
  );
}

export function SinglePickupLogPage() {
  const singleRecords: PickupLogCardRecord[] = SINGLE_PICKUP_LOG.map((record) => ({
    key: record.heroNameKr,
    label: record.heroNameKr,
    entries: record.entries,
  }));
  const llrRecords: PickupLogCardRecord[] = LLR_PICKUP_LOG.map((record) => ({
    key: record.bannerNameKr,
    label: record.bannerNameKr,
    entries: record.entries,
  }));
  const singleTotalEntries = SINGLE_PICKUP_LOG.reduce(
    (sum, record) => sum + record.entries.length,
    0,
  );
  const llrTotalEntries = LLR_PICKUP_LOG.reduce(
    (sum, record) => sum + record.entries.length,
    0,
  );

  return (
    <section>
      <LogSectionHeader
        title="1인 log"
        description="한섭 1인 SSR 픽업 기록"
        recordCount={SINGLE_PICKUP_LOG.length}
        totalEntries={singleTotalEntries}
      />
      <PickupLogGrid records={singleRecords} badge="1인" />

      <div className="mt-10 border-t border-border pt-8">
        <LogSectionHeader
          title="LLR log"
          description="한섭 LLR 한정 소환 기록"
          recordCount={LLR_PICKUP_LOG.length}
          totalEntries={llrTotalEntries}
        />
        <PickupLogGrid records={llrRecords} badge="LLR" />
      </div>
    </section>
  );
}
