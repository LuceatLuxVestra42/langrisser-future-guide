import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  History,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { getBannerPageData } from "@/lib/banner-page.functions";

export const Route = createFileRoute("/banners")({
  loader: () => getBannerPageData(),
  head: () => ({
    meta: [
      { title: "가챠 배너 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content:
          "랑그릿사 모바일 한국 서버 미래 가챠 배너와 연결된 이벤트 정보, 소원소환 후보, CP 배너와 관측된 픽업 재등장 로그를 확인합니다.",
      },
    ],
  }),
  component: BannerPage,
});

type ViewId = "schedule" | "cp" | "logs";

const VIEW_DEFINITIONS: ReadonlyArray<{
  id: ViewId;
  label: string;
  description: string;
}> = [
  { id: "schedule", label: "배너+이벤트", description: "전체 배너 일정과 연결된 이벤트 정보" },
  { id: "cp", label: "CP배너", description: "CP 관련 픽업 4건" },
  { id: "logs", label: "픽업 log", description: "현재 데이터셋 재등장 이력" },
];

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function BannerImage({
  image,
  alt,
  compact = false,
}: {
  image: {
    canRenderImage: boolean;
    publicPath: string | null;
    placeholderKey: string | null;
  };
  alt: string;
  compact?: boolean;
}) {
  if (!image.canRenderImage || !image.publicPath) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/60 px-3 text-center text-xs leading-5 text-muted-foreground ${
          compact ? "h-20 w-32" : "aspect-[16/7] w-full"
        }`}
      >
        배너 이미지 준비 중
      </div>
    );
  }

  return (
    <img
      src={image.publicPath}
      alt={alt}
      loading="lazy"
      className={`rounded-xl border border-border bg-muted object-contain ${
        compact ? "h-20 w-32" : "aspect-[16/7] w-full"
      }`}
    />
  );
}

function HeroChips({ heroes }: { heroes: Array<{ heroId: number; heroNameKr: string }> }) {
  if (heroes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {heroes.map((hero) => (
        <span
          key={`${hero.heroId}-${hero.heroNameKr}`}
          className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
        >
          {hero.heroNameKr}
        </span>
      ))}
    </div>
  );
}

function BannerPage() {
  const data = Route.useLoaderData();
  const [activeView, setActiveView] = useState<ViewId>("schedule");
  const [expandedWishOccurrence, setExpandedWishOccurrence] = useState<string | null>(null);

  const wishByDefinition = useMemo(
    () => new Map(data.wishCandidateSets.map((record) => [record.bannerDefinitionId, record])),
    [data.wishCandidateSets],
  );

  const cpByOccurrence = useMemo(
    () => new Map(data.cpRecords.map((record) => [record.bannerOccurrenceId, record])),
    [data.cpRecords],
  );

  const allRows = useMemo(() => data.dateGroups.flatMap((group) => group.rows), [data.dateGroups]);
  const rowByOccurrence = useMemo(
    () => new Map(allRows.map((row) => [row.bannerOccurrenceId, row])),
    [allRows],
  );

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              메인으로
            </Link>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              가챠 배너
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              현재 확정된 KR 미래시 데이터셋의 배너 일정과 연결된 이벤트 정보, 소원소환 후보, CP 관계, 재등장 관측 이력을 확인할 수 있어.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap sm:justify-end">
            <span className="rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">
              배너 <strong className="text-foreground">{data.summary.bannerRows}</strong>
            </span>
            <span className="rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">
              날짜 <strong className="text-foreground">{data.summary.dateGroups}</strong>
            </span>
            <span className="rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">
              소원 <strong className="text-foreground">{data.summary.wishRows}</strong>
            </span>
            <span className="rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">
              CP <strong className="text-foreground">{data.summary.cpOccurrences}</strong>
            </span>
          </div>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            {VIEW_DEFINITIONS.map((view) => {
              const selected = activeView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveView(view.id)}
                  className={`border-b border-border px-4 py-4 text-left transition last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${
                    selected
                      ? "bg-accent text-accent-foreground"
                      : "bg-card text-foreground hover:bg-muted/60"
                  }`}
                >
                  <span className="block font-semibold">{view.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {view.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {activeView === "schedule" && (
          <section className="mt-6">
            <p className="mb-5 text-xs leading-5 text-muted-foreground">
              픽업·소원소환을 구분해서 거르지 않고 전체 일정을 한 번에 표시해. 소원소환은 배너를 누르면 선택 가능 후보를 펼쳐볼 수 있어.
            </p>

            <div className="space-y-8">
              {data.dateGroups.map((group) => (
                <section key={group.date} aria-labelledby={`date-${group.date}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarDays size={17} className="text-muted-foreground" aria-hidden="true" />
                    <h2 id={`date-${group.date}`} className="text-lg font-bold text-foreground">
                      {formatDisplayDate(group.date)}
                    </h2>
                    <span className="text-xs text-muted-foreground">{group.rows.length}개</span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.rows.map((row) => {
                      const wish = wishByDefinition.get(row.bannerDefinitionId);
                      const cpRecord = cpByOccurrence.get(row.bannerOccurrenceId);
                      const isWish = row.mechanicFamily === "WISH";
                      const expanded = expandedWishOccurrence === row.bannerOccurrenceId;

                      return (
                        <article
                          key={row.bannerOccurrenceId}
                          className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                        >
                          <button
                            type="button"
                            disabled={!isWish}
                            onClick={() =>
                              setExpandedWishOccurrence((current) =>
                                current === row.bannerOccurrenceId ? null : row.bannerOccurrenceId,
                              )
                            }
                            className={`w-full p-3 text-left ${
                              isWish ? "cursor-pointer hover:bg-muted/30" : "cursor-default"
                            }`}
                            aria-expanded={isWish ? expanded : undefined}
                          >
                            <BannerImage
                              image={row.image}
                              alt={`${formatDisplayDate(row.krDisplayDate)} ${row.typeLabelKr} 배너`}
                            />
                            <div className="mt-3 flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground">
                                    {row.typeLabelKr}
                                  </span>
                                  {row.cpRelated && (
                                    <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-semibold text-foreground">
                                      CP 관련
                                    </span>
                                  )}
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {row.lifecycleLabelKr}
                                </p>
                              </div>
                              {isWish && (
                                <ChevronDown
                                  size={18}
                                  aria-hidden="true"
                                  className={`mt-1 shrink-0 text-muted-foreground transition-transform ${
                                    expanded ? "rotate-180" : ""
                                  }`}
                                />
                              )}
                            </div>
                          </button>

                          {row.pickupHeroes.length > 0 && (
                            <div className="border-t border-border px-4 py-3">
                              <HeroChips heroes={row.pickupHeroes} />
                            </div>
                          )}

                          {cpRecord && (
                            <div className="border-t border-border bg-muted/35 px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Event text reference
                              </p>
                              <p className="mt-1 text-sm font-bold text-foreground">
                                {cpRecord.eventReferenceLabelCn}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                canonical Event ID 미확정 · 상세 이동 비활성
                              </p>
                            </div>
                          )}

                          {isWish && expanded && (
                            <div className="border-t border-border bg-muted/25 p-4">
                              {wish?.candidateState === "VERIFIED_EXPLICIT_CANDIDATES" ? (
                                <>
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-foreground">선택 가능 후보</p>
                                    <span className="text-xs text-muted-foreground">
                                      {wish.candidateCount}명
                                    </span>
                                  </div>
                                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {wish.candidates.map((hero) => (
                                      <div
                                        key={hero.heroId}
                                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                                      >
                                        {hero.heroNameKr}
                                      </div>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <div className="flex gap-2 rounded-xl border border-dashed border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
                                  <CircleAlert size={17} className="mt-1 shrink-0" aria-hidden="true" />
                                  <p>
                                    이 수동 소원소환은 확정된 Hero ID 후보 소스가 없어. 후보를 추정하거나 다른 배너에서 가져오지 않고 REVIEW 상태로 유지하고 있어.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>
        )}

        {activeView === "cp" && (
          <section className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {data.cpRecords.map((record) => {
              const row = rowByOccurrence.get(record.bannerOccurrenceId);
              return (
                <article key={record.bannerOccurrenceId} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    {row && (
                      <div className="shrink-0">
                        <BannerImage image={row.image} alt="CP 관련 배너" compact />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground">
                          CP 배너
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDisplayDate(record.krDisplayDate)}
                        </span>
                      </div>
                      <div className="mt-3">
                        <HeroChips heroes={record.pickupHeroes} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-muted/45 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Event text reference
                    </p>
                    <p className="mt-1 text-lg font-bold text-foreground">{record.eventReferenceLabelCn}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      canonicalEventId: null · TEXT_REFERENCE_ONLY_REVIEW · Event 페이지 이동 없음
                    </p>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {activeView === "logs" && (
          <section className="mt-6 space-y-5">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <History size={20} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <h2 className="font-bold text-foreground">현재 KR 데이터셋에서 재관측된 픽업만 표시해.</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    날짜 간격은 관측된 gapDays일 뿐 고정 복각 주기나 다음 등장일 예측으로 해석하지 않아.
                  </p>
                </div>
              </div>
            </div>

            {data.pickupLogs.map((log) => (
              <article key={log.bannerDefinitionId} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex flex-col gap-2 border-b border-border bg-muted/35 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={17} className="text-muted-foreground" aria-hidden="true" />
                    <h2 className="font-bold text-foreground">{log.typeLabelKr}</h2>
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                      {log.historyLabelKr}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDisplayDate(log.firstObservedKrDisplayDate)} → {formatDisplayDate(log.latestObservedKrDisplayDate)}
                  </p>
                </div>

                <div className="p-4 sm:p-5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {log.appearances.map((appearance, index) => (
                      <div key={appearance.bannerOccurrenceId} className="rounded-xl border border-border bg-background p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-foreground">
                            {index + 1}회 관측 · {formatDisplayDate(appearance.krDisplayDate)}
                          </span>
                          {appearance.gapDaysFromPrevious !== null && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              이전 관측 +{appearance.gapDaysFromPrevious}일
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex gap-3">
                          <BannerImage image={appearance.image} alt="픽업 재등장 배너" compact />
                          <div className="min-w-0 flex-1">
                            <HeroChips heroes={appearance.pickupHeroes} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        <footer className="mt-10 border-t border-border pt-6 text-xs leading-5 text-muted-foreground">
          <p>
            표시 범위는 현재 canonical KR schedule dataset이야. 최초 출시 여부, 고정 복각 주기, 미래 복각일은 이 페이지에서 추론하지 않아.
          </p>
        </footer>
      </div>
    </main>
  );
}
