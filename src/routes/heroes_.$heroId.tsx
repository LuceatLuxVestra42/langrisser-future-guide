import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Database,
  ImageOff,
  ShieldCheck,
  Sparkles,
  Swords,
  UserRound,
  UsersRound,
} from "lucide-react";

import { getHeroDetailRouteStage5Data } from "@/lib/hero-list.functions";

export const Route = createFileRoute("/heroes/$heroId")({
  loader: async ({ params }) => {
    if (!/^\d+$/.test(params.heroId)) throw notFound();

    const heroId = Number(params.heroId);
    if (!Number.isSafeInteger(heroId) || heroId <= 0) throw notFound();

    const data = await getHeroDetailRouteStage5Data({ data: { heroId } });
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
  component: HeroDetailPage,
  notFoundComponent: HeroNotFound,
});

function resolvePublicAssetUrl(webAssetPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}${webAssetPath}`;
}

function HeroDetailPage() {
  const data = Route.useLoaderData();
  const { hero, stage6, detail } = data;
  const displayName = hero.identity.nameKr ?? hero.identity.nameCn;
  const imageUrl = hero.card.webAssetPath ? resolvePublicAssetUrl(hero.card.webAssetPath) : null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
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
                <img src={imageUrl} alt="" className="h-full w-full object-cover object-top" />
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

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <InfoBlock title="진영">
                  <div className="flex flex-wrap gap-1.5">
                    {hero.factions.map((faction) => (
                      <span key={faction.factionId} className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground">
                        {faction.nameKr ?? faction.nameCn}
                      </span>
                    ))}
                  </div>
                </InfoBlock>
                <InfoBlock title="출전작">
                  <p className="font-semibold text-foreground">{hero.origin.nameKr ?? hero.origin.nameCn}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{hero.origin.category}</p>
                </InfoBlock>
                <InfoBlock title="기본 정보">
                  <p className="font-semibold text-foreground">초기 별 {detail.base.initialStar ?? "-"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Talent ID {detail.base.talentId ?? "-"}</p>
                </InfoBlock>
                <InfoBlock title="성우">
                  <p className="font-semibold text-foreground">JP {detail.presentation.cvJp ?? "-"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">ZH {detail.presentation.cvZh ?? "-"}</p>
                </InfoBlock>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle icon={<BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />} title="직업 트리 · 최종 스탯" />
          <p className="mt-2 text-sm text-muted-foreground">
            Stage 6 확정 직업 분기 {detail.jobs.branchCount}개 · 직업 노드 {detail.jobs.nodeCount}개
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {detail.jobs.branches.map((branch, index) => (
              <div key={`${branch.routeRow ?? "row"}-${index}`} className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  <span>분기 {branch.routeRow ?? index + 1}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{branch.jobs.map((job) => job.nameZh ?? `Job ${job.jobId ?? "?"}`).join(" → ") || "직업 정보 없음"}</span>
                </div>
                {branch.capstone ? (
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>최종 직업 {branch.capstone.nameZh ?? branch.capstone.jobId ?? "-"}</span>
                      {branch.capstone.levelCap != null ? <span>Lv.{branch.capstone.levelCap}</span> : null}
                      {branch.capstone.movePoint != null ? <span>이동 {branch.capstone.movePoint}</span> : null}
                    </div>
                    <StatGrid stats={branch.capstone.finalStats} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <SectionTitle icon={<UsersRound className="h-4 w-4" aria-hidden="true" />} title="사용 가능 병종" />
            <p className="mt-2 text-sm text-muted-foreground">A단계 확정 관계 기준 {detail.soldiers.count}종</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.soldiers.ids.map((soldierId) => (
                <span key={soldierId} className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-xs font-semibold text-foreground">
                  Soldier {soldierId}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <SectionTitle icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} title="확정 시스템 연결" />
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <StatusChip label="유대" active={detail.systems.bonds} />
              <StatusChip label="전용장비" active={detail.systems.exclusiveEquipment} />
              <StatusChip label="중앙율정" active={detail.systems.centralDiscipline} />
              <StatusChip label="SP" active={detail.systems.sp} />
              <StatusChip label="스킨" active={detail.presentation.skinCount > 0} suffix={`${detail.presentation.skinCount}`} />
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle icon={<Database className="h-4 w-4" aria-hidden="true" />} title="상세 데이터 상태" />
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            이 페이지는 FINAL_FROZEN Stage 6 전체 묶음을 읽지 않고, 현재 Hero의 개별 shard 하나만 읽어 표시용 데이터로 투영해.
            원본 ConfigData 관계 재계산이나 이름·ID 추론은 하지 않아.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-muted px-2 py-1 font-semibold text-foreground">Stage 6 · {stage6.admissionStatus}</span>
            <span className="rounded-md bg-muted px-2 py-1 font-semibold text-foreground">hard error {detail.validation.hardErrorCount}</span>
            <span className="rounded-md bg-muted px-2 py-1 font-semibold text-foreground">warning {detail.validation.warningCount}</span>
          </div>
        </section>
      </div>
    </main>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="font-bold text-foreground">{title}</h2>
    </div>
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

function StatGrid({ stats }: { stats: { HP: number | null; ATK: number | null; INT: number | null; DEF: number | null; MDEF: number | null } }) {
  const entries = [
    ["HP", stats.HP],
    ["ATK", stats.ATK],
    ["INT", stats.INT],
    ["DEF", stats.DEF],
    ["MDEF", stats.MDEF],
  ] as const;

  return (
    <div className="mt-3 grid grid-cols-5 gap-1.5">
      {entries.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-background px-2 py-2 text-center">
          <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-sm font-bold text-foreground">{value ?? "-"}</div>
        </div>
      ))}
    </div>
  );
}

function StatusChip({ label, active, suffix }: { label: string; active: boolean; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <span className="font-semibold text-foreground">{label}</span>
      <span className="text-muted-foreground">{active ? suffix ?? "연결" : "없음"}</span>
    </div>
  );
}

function HeroNotFound() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <Swords className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-foreground">영웅을 찾을 수 없어.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Stage 6 확정 Hero 목록에 존재하지 않는 주소야.</p>
        <Link to="/heroes" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-4">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          영웅 목록으로
        </Link>
      </div>
    </main>
  );
}
