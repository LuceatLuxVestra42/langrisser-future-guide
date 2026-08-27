import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, UserRound } from "lucide-react";

import { getHeroListStage2Data } from "@/lib/hero-list.functions";
import type { HeroListRecord } from "@/lib/hero-list.server";

export const Route = createFileRoute("/heroes")({
  loader: () => getHeroListStage2Data(),
  head: () => ({
    meta: [
      { title: "영웅 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "랑그릿사 모바일 영웅 267명을 한눈에 확인할 수 있는 기본 목록입니다.",
      },
    ],
  }),
  component: HeroGridPage,
});

function HeroGridPage() {
  const data = Route.useLoaderData();

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div>
          <Link
            to="/"
            className="text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            ← 메인으로
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            영웅
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            확정된 영웅 목록 데이터를 기준으로 기본 Grid를 구성했어. 실제 영웅 이미지, 출시순 정렬,
            필터와 상세 연결은 다음 단계에서 붙여.
          </p>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4 border-y border-border py-3">
          <p className="text-sm text-muted-foreground">
            전체 <span className="font-bold text-foreground">{data.summary.total}</span>명
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Stage 1 frozen consumer · {data.source.freezeState}
          </p>
        </div>

        <section
          aria-label="영웅 기본 목록"
          className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
        >
          {data.records.map((hero) => (
            <HeroGridCard key={hero.heroId} hero={hero} />
          ))}
        </section>
      </div>
    </main>
  );
}

function HeroGridCard({ hero }: { hero: HeroListRecord }) {
  const displayName = hero.identity.nameKr ?? hero.identity.nameCn;

  return (
    <article
      aria-label={`${displayName} ${hero.rarity.baseLabel}`}
      className="group relative aspect-[4/5] overflow-hidden rounded-md border border-border bg-card shadow-sm"
    >
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted pb-12 text-muted-foreground">
        <UserRound
          className="h-12 w-12 transition group-hover:text-foreground sm:h-14 sm:w-14"
          strokeWidth={1.25}
          aria-hidden="true"
        />
      </div>

      <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
        <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white sm:text-[11px]">
          {hero.rarity.baseLabel}
        </span>
        {hero.hasSp ? (
          <span
            className="inline-flex items-center gap-0.5 rounded border border-foreground/20 bg-background/90 px-1.5 py-0.5 text-[10px] font-bold text-foreground backdrop-blur-sm sm:text-[11px]"
            title="SP 해금 영웅"
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            SP
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-2 text-center backdrop-blur-[1px]">
        <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white sm:text-xs">
          {displayName}
        </span>
      </div>
    </article>
  );
}
