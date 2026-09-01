import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  CircleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getBannerPageData } from "@/lib/banner-page.functions";

function getKoreanToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

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

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function BannerImage({
  image,
  alt,
}: {
  image: {
    canRenderImage: boolean;
    publicPath: string | null;
    placeholderKey: string | null;
  };
  alt: string;
}) {
  if (!image.canRenderImage || !image.publicPath) {
    return (
      <div className="flex aspect-[16/7] w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/60 px-3 text-center text-xs leading-5 text-muted-foreground">
        배너 이미지 준비 중
      </div>
    );
  }

  return (
    <img
      src={image.publicPath}
      alt={alt}
      loading="lazy"
      className="h-auto w-full rounded-xl border border-border"
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
  const [expandedWishOccurrence, setExpandedWishOccurrence] = useState<string | null>(null);
  const [displayStartDate, setDisplayStartDate] = useState<string | null>(null);

  useEffect(() => {
    setDisplayStartDate(getKoreanToday());
  }, []);

  const wishByDefinition = useMemo(
    () => new Map(data.wishCandidateSets.map((record) => [record.bannerDefinitionId, record])),
    [data.wishCandidateSets],
  );

  const cpByOccurrence = useMemo(
    () => new Map(data.cpRecords.map((record) => [record.bannerOccurrenceId, record])),
    [data.cpRecords],
  );

  const visibleDateGroups = useMemo(
    () =>
      displayStartDate
        ? data.dateGroups.filter((group) => group.date >= displayStartDate)
        : [],
    [data.dateGroups, displayStartDate],
  );

  const visibleRows = useMemo(
    () => visibleDateGroups.flatMap((group) => group.rows),
    [visibleDateGroups],
  );

  const visibleSummary = useMemo(
    () => ({
      bannerRows: visibleRows.length,
      dateGroups: visibleDateGroups.length,
      wishRows: visibleRows.filter((row) => row.mechanicFamily === "WISH").length,
      cpOccurrences: visibleRows.filter((row) => row.cpRelated).length,
    }),
    [visibleDateGroups.length, visibleRows],
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
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap sm:justify-end">
            <span className="rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">
              배너 <strong className="text-foreground">{visibleSummary.bannerRows}</strong>
            </span>
            <span className="rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">
              날짜 <strong className="text-foreground">{visibleSummary.dateGroups}</strong>
            </span>
            <span className="rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">
              소원 <strong className="text-foreground">{visibleSummary.wishRows}</strong>
            </span>
            <span className="rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">
              CP <strong className="text-foreground">{visibleSummary.cpOccurrences}</strong>
            </span>
          </div>
        </div>

        <section className="mt-8">
          {!displayStartDate && (
            <div className="mb-5 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
              한국시간 기준 일정을 확인하고 있어.
            </div>
          )}
          <div className="space-y-8">
            {visibleDateGroups.map((group) => (
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
                              {row.lifecycleLabelKr !== "현 데이터셋 최초 관측" && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {row.lifecycleLabelKr}
                                </p>
                              )}
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

        <footer className="mt-10 border-t border-border pt-6 text-xs leading-5 text-muted-foreground">
          <p>
            한국시간 오늘 이후의 canonical KR schedule dataset만 표시해. 최초 출시 여부, 고정 복각 주기, 미래 복각일은 이 페이지에서 추론하지 않아.
          </p>
        </footer>
      </div>
    </main>
  );
}
