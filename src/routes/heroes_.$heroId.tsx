import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CircleHelp, Shield, Sparkles, Swords } from "lucide-react";

import { getHeroPrototypePageData } from "@/lib/hero-page.functions";

export const Route = createFileRoute("/heroes/$heroId")({
  loader: async ({ params }) => {
    if (!/^\d+$/.test(params.heroId)) throw notFound();

    const heroId = Number(params.heroId);
    if (!Number.isSafeInteger(heroId) || heroId <= 0) throw notFound();

    const data = await getHeroPrototypePageData({ data: { heroId } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.identity.nameKr} | 랑그릿사 모바일 영웅`
          : "영웅 | 랑그릿사 모바일 미래시 정보",
      },
    ],
  }),
  component: HeroDetailPage,
  notFoundComponent: HeroNotFound,
});

const STAT_LABELS = [
  ["hp", "HP"],
  ["at", "공격"],
  ["magic", "지력"],
  ["df", "방어"],
  ["magicDf", "마방"],
  ["dex", "기술"],
] as const;

function HeroDetailPage() {
  const hero = Route.useLoaderData();
  const { identity } = hero;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          메인으로
        </Link>

        <section className="mt-5 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="relative flex min-h-[360px] items-end overflow-hidden border-b border-border bg-muted/50 p-6 sm:min-h-[460px] sm:p-8 lg:border-b-0 lg:border-r">
              <div className="absolute inset-0 grid place-items-center px-6 text-center text-muted-foreground">
                <div>
                  <Sparkles className="mx-auto mb-3" size={34} aria-hidden="true" />
                  <p className="font-semibold">영웅 일러스트 web asset 연결 전</p>
                  <p className="mt-1 max-w-xl text-xs leading-5">source: {hero.artworkSourcePath}</p>
                </div>
              </div>

              <div className="relative z-10 w-full rounded-2xl border border-border/70 bg-background/90 p-4 backdrop-blur sm:max-w-md">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md bg-primary px-2.5 py-1 font-bold text-primary-foreground">
                    {hero.rarity.baseLabel}
                  </span>
                  <span className="rounded-md border border-border bg-card px-2.5 py-1 font-semibold text-foreground">
                    Hero ID {hero.heroId}
                  </span>
                  {hero.hasSpData ? (
                    <span className="rounded-md border border-border bg-card px-2.5 py-1 font-semibold text-foreground">SP 데이터 있음</span>
                  ) : null}
                </div>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{identity.nameKr}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{identity.nameCn} · {identity.nameEn}</p>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <dl className="space-y-5 text-sm">
                <div>
                  <dt className="font-semibold text-muted-foreground">CV</dt>
                  <dd className="mt-1 text-base font-medium text-foreground">{hero.cv.displayName}</dd>
                  {hero.cv.localizationPending ? <PendingKrLabel /> : null}
                </div>
                <div>
                  <dt className="font-semibold text-muted-foreground">진영</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {hero.factions.map((faction) => (
                      <span key={faction.factionId} className="rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-foreground">
                        {faction.displayName}
                      </span>
                    ))}
                  </dd>
                  {hero.factions.some((faction) => faction.localizationPending) ? <PendingKrLabel /> : null}
                </div>
                <div>
                  <dt className="font-semibold text-muted-foreground">출시작</dt>
                  <dd className="mt-1 text-base font-medium text-foreground">{hero.origin.displayName}</dd>
                  {hero.origin.localizationPending ? <PendingKrLabel /> : null}
                </div>
              </dl>

              <div className="mt-7 rounded-2xl border border-border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">
                이 페이지는 Hero final consumer를 실제 프론트에 연결하는 첫 프로토타입이야. 확인되지 않은 한국어 표시는 만들지 않고 현재 consumer 원문을 그대로 보여줘.
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">스킨</h2>
              <p className="mt-1 text-sm text-muted-foreground">consumer의 sourceOrder를 그대로 사용 · 실제 이미지 asset은 아직 연결하지 않음</p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{hero.skins.length}개</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hero.skins.map((skin) => (
              <article key={skin.skinId} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">{skin.order}/{hero.skins.length}</span>
                  <span className="text-xs text-muted-foreground">Skin {skin.skinId}</span>
                </div>
                <p className="mt-2 font-bold text-foreground">{skin.displayName}</p>
                {skin.localizationPending ? <PendingKrLabel /> : null}
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{skin.acquisitionLabel ?? "획득 방식 미확정"}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <Swords size={18} className="text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold text-foreground">전직 · Lv70 / 6성 최종 표시 스탯</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Stage 4에서 검증된 finalDisplayStats를 그대로 표시해. 프론트에서 스탯 공식을 다시 계산하지 않아.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {hero.normal.jobs.map((job) => (
              <article key={job.jobConnectionId} className="rounded-2xl border border-border bg-background p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Job {job.jobId} · rank {job.rank}</p>
                    <h3 className="mt-1 text-lg font-bold text-foreground">{job.nameCn}</h3>
                  </div>
                  <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    depth {job.depth}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {STAT_LABELS.map(([key, label]) => (
                    <div key={key} className="rounded-lg border border-border bg-card px-3 py-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 text-lg font-black tabular-nums text-foreground">
                        {job.finalDisplayStats.values[key].toLocaleString("ko-KR")}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <PrototypePending title="고유기 · 스킬" description="성급별 고유기와 획득 스킬 consumer를 다음 연결에서 배치할 영역" />
          <PrototypePending title="유대 · 전용장비 · 중앙율정" description="Stage 5/B-stage frozen consumer를 상세 카드로 연결할 영역" />
          <PrototypePending title="사용 가능 용병 · SP" description="C-FINAL Hero↔Soldier consumer와 SP 상세 consumer를 연결할 영역" />
        </div>
      </div>
    </main>
  );
}

function PendingKrLabel() {
  return <p className="mt-1 text-xs text-muted-foreground">한국어 표시명 REVIEW · 원문 표시 중</p>;
}

function PrototypePending({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <CircleHelp size={17} className="text-muted-foreground" aria-hidden="true" />
        <h2 className="font-bold text-foreground">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </section>
  );
}

function HeroNotFound() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <Shield size={34} className="text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold text-foreground">아직 프로토타입이 없는 영웅이야.</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">현재 프론트엔드 테스트 fixture는 레온(Hero ID 6)만 연결했어.</p>
        <Link to="/" className="mt-6 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
          메인으로
        </Link>
      </div>
    </main>
  );
}
