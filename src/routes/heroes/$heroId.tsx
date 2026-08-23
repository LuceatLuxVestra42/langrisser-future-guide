import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Database, Sparkles } from "lucide-react";

import { getHeroDetail, type HeroDetailMode, type HeroSpMission } from "@/lib/hero-detail";

export const Route = createFileRoute("/heroes/$heroId")({
  component: HeroDetailPage,
});

type Mode = "normal" | "sp";

function EmptyValue({ children = "데이터 연결 대기" }: { children?: string }) {
  return <span className="text-sm text-muted-foreground">{children}</span>;
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SummaryGrid({ data }: { data: HeroDetailMode }) {
  const items = [
    ["고유기", data.talent?.name],
    ["유대", data.bonds.length ? `${data.bonds.length}건` : undefined],
    ["전용장비", data.exclusiveEquipment],
    ["중앙율정", data.covenant],
    ["용병", data.soldiers.length ? `${data.soldiers.length}종` : undefined],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs font-semibold text-muted-foreground">{label}</div>
          <div className="mt-2 font-semibold text-foreground">{value ?? <EmptyValue />}</div>
        </div>
      ))}
    </div>
  );
}

function MissionList({ missions }: { missions: HeroSpMission[] }) {
  return (
    <div className="space-y-5">
      {[1, 2].map((chapter) => {
        const chapterMissions = missions.filter((mission) => mission.chapter === chapter);
        return (
          <div key={chapter}>
            <h3 className="text-sm font-bold text-foreground">SP {chapter}부</h3>
            <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {chapterMissions.map((mission) => (
                <div key={mission.id} className="bg-background px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground">
                        Mission {mission.id}{mission.titleCn ? ` · ${mission.titleCn}` : ""}
                      </div>
                      <div className="mt-1 text-sm font-medium text-foreground">{mission.summary}</div>
                      {mission.materials?.length ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {mission.materials.map((material) => (
                            <div
                              key={`${mission.id}-${material.nameCn}`}
                              className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm"
                            >
                              <span>{material.nameCn}</span>
                              <span className="font-bold">×{material.quantity}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {mission.materialSource && (
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          재료값: 외부 교차검증 · 원시 ConfigData 레코드 직접 검증 대기
                        </div>
                      )}
                      {mission.sourceParam && <div className="mt-1 text-xs text-muted-foreground">{mission.sourceParam}</div>}
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      {mission.status === "verified" ? "확정" : mission.materials?.length ? "교차검증" : "부분 확인"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeroDetailPage() {
  const { heroId } = Route.useParams();
  const hero = getHeroDetail(Number(heroId));
  const [mode, setMode] = useState<Mode>("normal");

  if (!hero) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
          <ArrowLeft size={16} /> 홈으로
        </Link>
        <div className="mt-10 rounded-2xl border border-border bg-card p-8">
          <h1 className="text-2xl font-bold">아직 상세 데이터가 없는 영웅이야.</h1>
          <p className="mt-2 text-muted-foreground">영웅 ID {heroId}의 정규화 데이터가 추가되면 이 주소에서 바로 표시돼.</p>
        </div>
      </main>
    );
  }

  const hasSp = Boolean(hero.sp?.exists);
  const active = mode === "sp" && hero.sp ? hero.sp : hero.normal;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-6 py-8 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> 메인으로
        </Link>

        <section className="mt-5 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="grid min-h-72 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex min-h-72 items-center justify-center bg-muted/40 p-8">
              {hero.artwork.illustrations.length ? (
                <img src={hero.artwork.illustrations[0]} alt={hero.identity.nameKr} className="max-h-80 object-contain" />
              ) : (
                <div className="text-center text-muted-foreground">
                  <Database className="mx-auto" size={36} />
                  <p className="mt-3 text-sm">일러스트 에셋 연결 대기</p>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-center p-8 lg:p-10">
              <div className="text-sm font-semibold text-primary">Hero ID {hero.identity.heroId}</div>
              <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">{hero.identity.nameKr}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{hero.identity.nameCn} · {hero.identity.nameEn}</p>
              <dl className="mt-7 grid grid-cols-[6rem_1fr] gap-y-3 text-sm">
                <dt className="font-semibold text-muted-foreground">등급</dt><dd>{hero.identity.rarity ?? <EmptyValue />}</dd>
                <dt className="font-semibold text-muted-foreground">CV</dt><dd>{hero.identity.cv ?? <EmptyValue />}</dd>
                <dt className="font-semibold text-muted-foreground">진영</dt><dd>{hero.identity.factions.length ? hero.identity.factions.join(" · ") : <EmptyValue />}</dd>
                <dt className="font-semibold text-muted-foreground">출시작</dt><dd>{hero.identity.origin ?? <EmptyValue />}</dd>
              </dl>
            </div>
          </div>
        </section>

        {hasSp && (
          <div className="mt-6 flex w-fit rounded-xl border border-border bg-card p-1">
            <button type="button" onClick={() => setMode("normal")} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${mode === "normal" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              기본 전직 보기
            </button>
            <button type="button" onClick={() => setMode("sp")} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${mode === "sp" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <span className="inline-flex items-center gap-1.5"><Sparkles size={15} /> SP 전직 보기</span>
            </button>
          </div>
        )}

        <div className="mt-6 space-y-6">
          <InfoCard title={mode === "sp" ? "SP 핵심 정보" : "핵심 정보"}><SummaryGrid data={active} /></InfoCard>

          <InfoCard title="스탯 · 유대효과 · 용병수정치">
            {active.stats && Object.keys(active.stats).length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(active.stats).map(([key, value]) => (
                  <div key={key} className="rounded-xl bg-muted p-3 text-center"><div className="text-xs text-muted-foreground">{key}</div><div className="mt-1 text-lg font-bold">{value}</div></div>
                ))}
              </div>
            ) : <EmptyValue />}
          </InfoCard>

          {mode === "normal" ? (
            <>
              <InfoCard title="전직">{active.jobs.length ? <div>{active.jobs.join(" · ")}</div> : <EmptyValue />}</InfoCard>
              <InfoCard title="스킬">
                {active.skills.length ? (
                  <div className="space-y-2">{active.skills.map((skill) => <div key={skill.id} className="rounded-xl border border-border bg-background p-4"><div className="text-xs text-muted-foreground">Skill {skill.id} · {skill.unlockGroup}</div><div className="mt-1 font-semibold">{skill.name ?? "명칭 확인 중"}</div></div>)}</div>
                ) : <EmptyValue />}
              </InfoCard>
            </>
          ) : hero.sp ? (
            <>
              <InfoCard title="SP 추가 스킬">
                <div className="space-y-2">{hero.sp.skills.map((skill) => <div key={skill.id} className="rounded-xl border border-border bg-background p-4"><div className="text-xs text-muted-foreground">Skill {skill.id}</div><div className="mt-1 font-semibold">{skill.name}</div></div>)}</div>
              </InfoCard>
              <InfoCard title="모든 SP미션 보기"><MissionList missions={hero.sp.missions} /></InfoCard>
            </>
          ) : null}

          <InfoCard title="데이터 연결 상태">
            <p className="text-sm text-muted-foreground">확정된 ConfigData 관계와 외부 교차검증 값을 구분해서 표시하고, 확인되지 않은 값은 비워 둬.</p>
            <div className="mt-3 flex flex-wrap gap-2">{hero.sourceTables.map((table) => <span key={table} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{table}</span>)}</div>
          </InfoCard>
        </div>
      </main>
    </div>
  );
}
