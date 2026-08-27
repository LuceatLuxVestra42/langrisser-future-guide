import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Database, ImageOff, Sparkles, UserRound } from "lucide-react";

import { getHeroDetailRouteStage4Data } from "@/lib/hero-list.functions";

export const Route = createFileRoute("/heroes/$heroId")({
  loader: async ({ params }) => {
    if (!/^\d+$/.test(params.heroId)) throw notFound();

    const heroId = Number(params.heroId);
    if (!Number.isSafeInteger(heroId) || heroId <= 0) throw notFound();

    const data = await getHeroDetailRouteStage4Data({ data: { heroId } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.hero.identity.nameKr ?? loaderData.hero.identity.nameCn} | 랑그릿사 모바일 영웅`
          : "영웅 | 랑그릿사 모바일 미래시 정보",
      },
    ],
  }),
  component: HeroDetailRouteShell,
  notFoundComponent: HeroNotFound,
});

function resolvePublicAssetUrl(webAssetPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}${webAssetPath}`;
}

function HeroDetailRouteShell() {
  const data = Route.useLoaderData();
  const { hero, stage6 } = data;
  const displayName = hero.identity.nameKr ?? hero.identity.nameCn;
  const imageUrl = hero.card.webAssetPath ? resolvePublicAssetUrl(hero.card.webAssetPath) : null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <Link
          to="/heroes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          영웅 목록
        </Link>

        <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="aspect-[4/5] bg-muted/40 md:aspect-auto md:min-h-[275px]">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-full w-full object-cover object-top"
                />
              ) : (
                <div className="flex h-full min-h-[250px] flex-col items-center justify-center gap-3 text-muted-foreground">
                  <UserRound className="h-16 w-16" strokeWidth={1.15} aria-hidden="true" />
                  <span className="inline-flex items-center gap-1 text-xs font-semibold">
                    <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
                    이미지 연결 대기
                  </span>
                </div>
              )}
            </div>

            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-foreground px-2 py-1 text-xs font-bold text-background">
                  {hero.rarity.baseLabel}
                </span>
                {hero.hasSp ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-bold text-foreground">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    SP
                  </span>
                ) : null}
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {displayName}
              </h1>
              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                <p>중문명 {hero.identity.nameCn}</p>
                {hero.identity.nameEn ? <p>영문명 {hero.identity.nameEn}</p> : null}
                <p>Hero ID {hero.heroId}</p>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <InfoBlock title="진영">
                  <div className="flex flex-wrap gap-1.5">
                    {hero.factions.map((faction) => (
                      <span
                        key={faction.factionId}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground"
                      >
                        {faction.nameKr ?? faction.nameCn}
                      </span>
                    ))}
                  </div>
                </InfoBlock>

                <InfoBlock title="출전작">
                  <p className="font-semibold text-foreground">
                    {hero.origin.nameKr ?? hero.origin.nameCn}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{hero.origin.category}</p>
                </InfoBlock>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-foreground" aria-hidden="true" />
            <h2 className="font-bold text-foreground">상세 데이터 연결 상태</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            이 영웅은 Stage 6 확정 consumer의 개별 shard에 연결돼 있어. 이번 단계에서는 목록에서 상세 주소로 이동하는 계약만 열고,
            대용량 shard 전체를 런타임에 읽거나 원본 ConfigData로 다시 계산하지 않아.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-muted px-2 py-1 font-semibold text-foreground">
              Stage 6 · {stage6.admissionStatus}
            </span>
            <span className="rounded-md bg-muted px-2 py-1 font-semibold text-foreground">
              상세 블록 연결 준비 완료
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="mb-2 text-xs font-bold text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function HeroNotFound() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-foreground">영웅을 찾을 수 없어.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Stage 6 확정 Hero 목록에 존재하지 않는 주소야.
        </p>
        <Link
          to="/heroes"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-4"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          영웅 목록으로
        </Link>
      </div>
    </main>
  );
}
