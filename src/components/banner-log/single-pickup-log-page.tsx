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
    if (current) current.push(entry);
    else groups.set(year, [entry]);
  }
  return Array.from(groups.entries());
}

function getPublicAssetUrl(publicPath: string) {
  return `${import.meta.env.BASE_URL}${publicPath.replace(/^\/+/, "")}`;
}

type PickupLogCardRecord = {
  key: string;
  label: string;
  artworkPublicPath: string;
  entries: SinglePickupLogEntry[];
};

function BannerLogArtwork({
  label,
  artworkPublicPath,
  badge,
}: {
  label: string;
  artworkPublicPath: string;
  badge: string;
}) {
  return (
    <div className="flex min-h-full min-w-0 flex-col justify-center gap-2.5 bg-muted/20 p-2.5 sm:gap-3 sm:p-4">
      <div className="flex min-h-0 w-full items-center justify-center">
        <img
          src={getPublicAssetUrl(artworkPublicPath)}
          alt={`${label} 배너`}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full rounded-lg object-contain shadow-sm ring-1 ring-black/5 sm:rounded-xl"
        />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 px-0.5 sm:gap-2 sm:px-1">
        <span className="shrink-0 rounded-lg bg-primary/10 px-1.5 py-1 text-[10px] font-black text-primary sm:px-2 sm:text-xs">
          {badge}
        </span>
        <h2 className="min-w-0 truncate text-xs font-bold text-foreground sm:text-lg">
          {label}
        </h2>
      </div>
    </div>
  );
}

function PickupLogGrid({ records, badge }: { records: PickupLogCardRecord[]; badge: string }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {records.map((record) => (
        <article
          key={record.key}
          className="grid grid-cols-[minmax(0,42%)_minmax(0,58%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:grid-cols-[minmax(18rem,40%)_minmax(0,1fr)]"
        >
          <BannerLogArtwork
            label={record.label}
            artworkPublicPath={record.artworkPublicPath}
            badge={badge}
          />

          <div className="min-w-0 border-l border-border">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-5 sm:py-3.5">
              <div>
                <p className="text-sm font-bold text-foreground">픽업 기록</p>
                <p className="text-xs text-muted-foreground">총 {record.entries.length}회</p>
              </div>
              <CalendarDays size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>

            <div className="divide-y divide-border">
              {groupEntriesByYear(record.entries).map(([year, entries]) => (
                <div
                  key={year}
                  className="grid grid-cols-[3.4rem_minmax(0,1fr)] gap-2 px-3 py-3 sm:grid-cols-[4.25rem_minmax(0,1fr)] sm:gap-3 sm:px-5 sm:py-3.5"
                >
                  <div className="pt-1 text-xs font-bold tabular-nums text-foreground sm:text-sm">
                    {year}
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {entries.map((entry) => (
                      <div
                        key={entry.date}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 text-xs shadow-sm sm:px-2.5"
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

function LogSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function SinglePickupLogPage() {
  const singleRecords: PickupLogCardRecord[] = SINGLE_PICKUP_LOG.map((record) => ({
    key: record.heroNameKr,
    label: record.heroNameKr,
    artworkPublicPath: record.artworkPublicPath,
    entries: record.entries,
  }));
  const llrRecords: PickupLogCardRecord[] = LLR_PICKUP_LOG.map((record) => ({
    key: record.bannerNameKr,
    label: record.bannerNameKr,
    artworkPublicPath: record.artworkPublicPath,
    entries: record.entries,
  }));

  return (
    <section>
      <LogSectionHeader title="1인 log" description="한섭 1인 SSR 픽업 기록" />
      <PickupLogGrid records={singleRecords} badge="1인" />

      <div className="mt-10 border-t border-border pt-8">
        <LogSectionHeader title="LLR log" description="한섭 LLR 한정 소환 기록" />
        <PickupLogGrid records={llrRecords} badge="LLR" />
      </div>
    </section>
  );
}
