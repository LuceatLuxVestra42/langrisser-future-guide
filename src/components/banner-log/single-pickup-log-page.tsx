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
  entryCount,
}: {
  label: string;
  artworkPublicPath: string;
  entryCount: number;
}) {
  const artworkUrl = getPublicAssetUrl(artworkPublicPath);

  return (
    <div className="relative flex min-h-full min-w-0 overflow-hidden bg-muted/20">
      <img
        src={artworkUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-15 blur-2xl"
      />
      <div className="absolute inset-0 bg-background/75" aria-hidden="true" />

      <div className="relative z-10 flex min-h-full w-full flex-col justify-center gap-3 p-3 sm:gap-4 sm:p-5">
        <img
          src={artworkUrl}
          alt={`${label} 배너`}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full rounded-lg object-contain shadow-sm ring-1 ring-black/5 sm:rounded-xl"
        />

        <div className="rounded-xl border border-border/80 bg-card/90 px-3 py-2.5 shadow-sm backdrop-blur-sm sm:px-4 sm:py-3">
          <h2 className="truncate text-sm font-bold text-foreground sm:text-lg">{label}</h2>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs sm:text-sm">
            <span className="font-semibold text-foreground">픽업 기록</span>
            <span className="shrink-0 text-muted-foreground">총 {entryCount}회</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PickupLogGrid({ records }: { records: PickupLogCardRecord[] }) {
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
            entryCount={record.entries.length}
          />

          <div className="min-w-0 border-l border-border">
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
      <PickupLogGrid records={singleRecords} />

      <div className="mt-8 pt-8">
        <PickupLogGrid records={llrRecords} />
      </div>
    </section>
  );
}
