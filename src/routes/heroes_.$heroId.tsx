import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Shield, Sparkles, Swords, Users } from "lucide-react";

const HEROES = {
  6: {
    heroId: 6,
    nameKr: "레온",
    nameCn: "利昂",
    nameEn: "Leon",
    rarity: "SSR",
    cv: "오키아유 료타로",
    origin: "랑그릿사 II",
    factions: ["제국의 빛", "전략의 대가"],
    role: "물리 딜러 · 기병",
    summary:
      "프론트엔드 구조 검증용 레온 프로토타입이야. 현재 단계에서는 실제 Hero consumer를 UI에 연결하기 전, 상세 페이지 레이아웃과 반응형 구조를 먼저 확인하는 용도로 사용해.",
    talent: {
      name: "전설의 기사",
      description:
        "고유기 영역 프로토타입. 성급별 변화는 최종 Hero consumer를 연결할 때 실제 frozen 데이터를 그대로 표시하도록 교체할 예정이야.",
    },
    covenant: {
      name: "기사의 모범",
      description:
        "중앙율정 영역 프로토타입. 현재는 배치와 정보 밀도를 확인하기 위한 표시용 데이터야.",
    },
    exclusiveEquipment: {
      name: "전용장비",
      description:
        "Hero → Exclusive Equipment frozen relation을 연결할 위치야.",
    },
    jobs: [
      { name: "나이트", tier: "1차" },
      { name: "하이랜더", tier: "2차" },
      { name: "로열 나이트", tier: "3차" },
      { name: "스트라이크 마스터", tier: "3차" },
    ],
    stats: [
      ["HP", "—"],
      ["공격", "—"],
      ["지력", "—"],
      ["방어", "—"],
      ["마방", "—"],
      ["기술", "—"],
    ],
    skills: [
      { name: "돌격", type: "물리 피해", source: "일반 스킬" },
      { name: "기사도", type: "지원", source: "일반 스킬" },
      { name: "청룡의 진혼", type: "SP", source: "SP 스킬" },
    ],
    soldiers: ["늑대인간", "천사", "뱀파이어 배트", "황가기병"],
  },
} as const;

export const Route = createFileRoute("/heroes/$heroId")({
  component: HeroDetailPage,
  loader: ({ params }) => {
    const heroId = Number(params.heroId);
    const hero = HEROES[heroId as keyof typeof HEROES];
    if (!hero) throw notFound();
    return hero;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.nameKr ?? "영웅"} | 랑그릿사 모바일 미래시 정보` },
      {
        name: "description",
        content: `${loaderData?.nameKr ?? "영웅"} 상세 정보 프론트엔드 프로토타입`,
      },
    ],
  }),
});

function SectionTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-lg border border-border bg-muted p-2 text-muted-foreground">{icon}</div>
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

function HeroDetailPage() {
  const hero = Route.useLoaderData();

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
              <div className="absolute inset-0 grid place-items-center text-center text-muted-foreground">
                <div>
                  <Sparkles className="mx-auto mb-3" size={34} aria-hidden="true" />
                  <p className="font-semibold">레온 일러스트 영역</p>
                  <p className="mt-1 text-xs">실제 web asset 연결 전 placeholder</p>
                </div>
              </div>
              <div className="relative z-10 w-full rounded-2xl border border-border/70 bg-background/90 p-4 backdrop-blur sm:max-w-md">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md bg-primary px-2.5 py-1 font-bold text-primary-foreground">{hero.rarity}</span>
                  <span className="rounded-md border border-border bg-card px-2.5 py-1 font-semibold">{hero.role}</span>
                </div>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{hero.nameKr}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{hero.nameCn} · {hero.nameEn}</p>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <dl className="space-y-5 text-sm">
                <div>
                  <dt className="font-semibold text-muted-foreground">CV</dt>
                  <dd className="mt-1 text-base font-medium text-foreground">{hero.cv}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-muted-foreground">진영</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {hero.factions.map((faction) => (
                      <span key={faction} className="rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-foreground">
                        {faction}
                      </span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-muted-foreground">출시작</dt>
                  <dd className="mt-1 text-base font-medium text-foreground">{hero.origin}</dd>
                </div>
              </dl>

              <div className="mt-7 rounded-2xl border border-dashed border-border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">
                {hero.summary}
              </div>

              <button
                type="button"
                className="mt-5 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold text-foreground transition hover:bg-muted"
              >
                SP 전직 보기 · UI 동작 준비
              </button>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <SectionTitle icon={<Sparkles size={18} />} title="고유기" description="성급별 변화 표시 영역" />
              <div className="mt-5 rounded-xl border border-border bg-background p-4">
                <h3 className="font-bold text-foreground">{hero.talent.name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{hero.talent.description}</p>
                <div className="mt-4 flex gap-2">
                  {[3, 4, 5, 6].map((star) => (
                    <button key={star} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted" type="button">
                      ★ {star}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <SectionTitle icon={<Shield size={18} />} title="전직 및 스탯" description="전직 트리와 직업별 표시 스탯을 배치할 영역" />
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">전직 트리</p>
                  <div className="mt-3 grid gap-2">
                    {hero.jobs.map((job) => (
                      <div key={`${job.tier}-${job.name}`} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
                        <span className="font-semibold text-foreground">{job.name}</span>
                        <span className="text-xs text-muted-foreground">{job.tier}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">최종 표시 스탯</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
                    {hero.stats.map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-border bg-card px-3 py-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 text-lg font-black text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <SectionTitle icon={<Swords size={18} />} title="스킬" description="획득 전직 순서대로 표시할 영역" />
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {hero.skills.map((skill) => (
                  <article key={skill.name} className="rounded-xl border border-border bg-background p-4">
                    <span className="text-xs font-semibold text-muted-foreground">{skill.source}</span>
                    <h3 className="mt-2 font-bold text-foreground">{skill.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{skill.type}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <SectionTitle icon={<Shield size={18} />} title="전용장비 · 중앙율정" />
              <div className="mt-5 space-y-3">
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs font-semibold text-muted-foreground">전용장비</p>
                  <p className="mt-1 font-bold text-foreground">{hero.exclusiveEquipment.name}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{hero.exclusiveEquipment.description}</p>
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs font-semibold text-muted-foreground">중앙율정</p>
                  <p className="mt-1 font-bold text-foreground">{hero.covenant.name}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{hero.covenant.description}</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <SectionTitle icon={<Users size={18} />} title="사용 가능 용병" description="Hero↔Soldier frozen consumer 연결 위치" />
              <div className="mt-5 grid grid-cols-2 gap-2">
                {hero.soldiers.map((soldier) => (
                  <div key={soldier} className="rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground">
                    {soldier}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
