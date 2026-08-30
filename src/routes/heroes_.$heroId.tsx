import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Database,
  HeartHandshake,
  ImageOff,
  ShieldCheck,
  Sparkles,
  Swords,
  UserRound,
  UsersRound,
} from "lucide-react";

import { HeroCentralDisciplineSection } from "@/components/hero-central-discipline-section";
import { HeroExclusiveEquipmentSection } from "@/components/hero-exclusive-equipment-section";
import { getOfficialArmyIconUrl } from "@/lib/army-icon-assets";
import { getHeroExclusiveEquipmentPresentation } from "@/lib/hero-exclusive-equipment.functions";
import { getHeroDetailRouteStage5Data } from "@/lib/hero-list.functions";
import { getOfficialSoldierPortraitUrl } from "@/lib/soldier-portrait-assets";
import { getSoldierPrototypePageData } from "@/lib/soldier-page.functions";

export const Route = createFileRoute("/heroes/$heroId")({
  loader: async ({ params }) => {
    if (!/^\d+$/.test(params.heroId)) throw notFound();
    const heroId = Number(params.heroId);
    if (!Number.isSafeInteger(heroId) || heroId <= 0) throw notFound();
    const data = await getHeroDetailRouteStage5Data({ data: { heroId } });
    if (!data) throw notFound();
    const exclusiveEquipment = await getHeroExclusiveEquipmentPresentation({ data: { heroId } });
    const soldierPage = getSoldierPrototypePageData();
    const soldierById = new Map(soldierPage.records.map((record) => [record.soldierId, record]));
    const soldierCards = data.detail.soldiers.ids.map((soldierId) => {
      const record = soldierById.get(soldierId);
      if (!record) {
        throw new Error(`Hero ${heroId} references Soldier ${soldierId}, but the frozen Soldier frontend consumer does not contain it.`);
      }
      return {
        soldierId: record.soldierId,
        nameKr: record.nameKr,
        nameCn: record.nameCn,
        nameKrStatus: record.nameKrStatus,
        tier: record.tier,
        armyType: record.armyType,
        isSp: record.isSp,
      };
    });
    if (soldierCards.length !== data.detail.soldiers.count) {
      throw new Error(`Hero ${heroId} Soldier card count mismatch: ${soldierCards.length} != ${data.detail.soldiers.count}.`);
    }
    return { ...data, exclusiveEquipment, soldierCards };
  },
  head: ({ loaderData }) => ({
    meta: [{
      title: loaderData
        ? `${loaderData.hero.localization.displayName || (loaderData.hero.identity.nameKr ?? loaderData.hero.identity.nameCn)} | 랑그릿사 모바일 영웅`
        : "영웅 | 랑그릿사 모바일 미래시 정보",
    }],
  }),
  component: HeroDetailPage,
  notFoundComponent: HeroNotFound,
});

function resolvePublicAssetUrl(webAssetPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}${webAssetPath}`;
}

function stripConfigMarkup(value: string | null) {
  if (!value) return "-";
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}

function HeroDetailPage() {
  const { hero, stage6, detail, exclusiveEquipment, soldierCards } = Route.useLoaderData();
  const displayName = hero.localization.displayName || (hero.identity.nameKr ?? hero.identity.nameCn);
  const imageUrl = hero.card.webAssetPath ? resolvePublicAssetUrl(hero.card.webAssetPath) : null;

  return (
    <main
      data-name-kr-status={hero.localization.nameKrStatus}
      data-name-source-authority={hero.localization.sourceAuthority}
      className="min-h-screen bg-background"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <Link reloadDocument to="/heroes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 영웅 목록
        </Link>

        <section className="mt-5 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="grid lg:grid-cols-[minmax(300px,0.82fr)_minmax(0,1.18fr)]">
            <div className="relative min-h-[420px] overflow-hidden border-b border-border bg-muted/25 sm:min-h-[520px] lg:min-h-[620px] lg:border-b-0 lg:border-r">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background/70 to-transparent" />
              {imageUrl ? (
                <img src={imageUrl} alt={`${displayName} 대표 일러스트`} className="absolute inset-0 h-full w-full object-contain object-bottom px-3 pt-4 sm:px-6 sm:pt-6" />
              ) : (
                <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 text-muted-foreground">
                  <UserRound className="h-20 w-20" strokeWidth={1.05} aria-hidden="true" />
                  <span className="inline-flex items-center gap-1 text-xs font-semibold"><ImageOff className="h-3.5 w-3.5" aria-hidden="true" />이미지 연결 대기</span>
                </div>
              )}
              <div className="absolute bottom-4 left-4 z-20 flex flex-wrap gap-2 sm:bottom-5 sm:left-5">
                <span className="rounded-full border border-border/80 bg-background/90 px-3 py-1 text-xs font-bold text-foreground backdrop-blur">{hero.rarity.baseLabel}</span>
                {detail.systems.spReleased ? <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/90 px-3 py-1 text-xs font-bold text-foreground backdrop-blur"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />SP</span> : null}
              </div>
            </div>

            <div className="flex min-w-0 flex-col justify-center p-5 sm:p-8 lg:p-10">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Hero #{hero.heroId}</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{displayName}</h1>
              <div className="mt-3 space-y-0.5 text-sm text-muted-foreground">
                <p>{hero.identity.nameCn}</p>
                {hero.identity.nameEn ? <p>{hero.identity.nameEn}</p> : null}
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <InfoBlock title="진영"><div className="flex flex-wrap gap-1.5">{hero.factions.map((faction) => <span key={faction.factionId} className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground">{faction.nameKr ?? faction.nameCn}</span>)}</div></InfoBlock>
                <InfoBlock title="출전작"><p className="font-semibold text-foreground">{hero.origin.nameKr ?? hero.origin.nameCn}</p><p className="mt-1 text-xs text-muted-foreground">{hero.origin.category}</p></InfoBlock>
                <InfoBlock title="기본 정보"><p className="font-semibold text-foreground">초기 별 {detail.base.initialStar ?? "-"}</p><p className="mt-1 text-xs text-muted-foreground">등급 코드 {detail.base.rank ?? "-"}</p></InfoBlock>
                <InfoBlock title="성우"><p className="font-semibold text-foreground">{detail.presentation.cvNameKr ?? detail.presentation.cvSourceValue ?? "-"}</p><p className="mt-1 text-xs text-muted-foreground">{detail.presentation.cvState ?? "-"}</p></InfoBlock>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-muted px-3 py-1.5 font-semibold text-foreground">직업 분기 {detail.jobs.branchCount}</span>
                <span className="rounded-full bg-muted px-3 py-1.5 font-semibold text-foreground">용병 {detail.soldiers.count}</span>
                <span className="rounded-full bg-muted px-3 py-1.5 font-semibold text-foreground">스킨 {detail.presentation.skinCount}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SectionTitle icon={<Sparkles className="h-4 w-4" aria-hidden="true" />} title="재능" />
              <p className="mt-2 text-sm text-muted-foreground">별 단계별 확정 재능 효과를 그대로 표시해.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {detail.talent.status ? <span className="rounded-full bg-muted px-3 py-1.5 font-semibold text-foreground">{detail.talent.status}</span> : null}
              {detail.talent.initialStar != null ? <span className="rounded-full bg-muted px-3 py-1.5 font-semibold text-foreground">초기 {detail.talent.initialStar}성</span> : null}
            </div>
          </div>
          {detail.talent.starProgression.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {detail.talent.starProgression.map((row) => (
                <article key={`${row.star}-${row.skillId}`} className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-foreground">{row.star}성 · {row.skill.nameCn ?? `Skill ${row.skillId}`}</h3>
                    <span className="shrink-0 rounded-md bg-background px-2 py-1 text-[11px] font-bold text-muted-foreground">#{row.skillId}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(row.skill.desc)}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 재능 progression이 없어.</p>
          )}
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle icon={<Swords className="h-4 w-4" aria-hidden="true" />} title="스킬" />
          <p className="mt-2 text-sm text-muted-foreground">Stage 6의 기본 보유 스킬과 전직 습득 스킬을 합치지 않고 source group 그대로 표시해.</p>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground">기본 보유 스킬</h3>
              <span className="text-xs font-semibold text-muted-foreground">{detail.skills.heroDirectSkills.length}개</span>
            </div>
            {detail.skills.heroDirectSkills.length > 0 ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {detail.skills.heroDirectSkills.map((skill) => <SkillCard key={`direct-${skill.skillId}`} skill={skill} sourceLabel="Hero 직접 보유" />)}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">기본 보유 스킬 없음</p>
            )}
          </div>

          <div className="mt-7 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground">전직 습득 스킬</h3>
              <span className="text-xs font-semibold text-muted-foreground">{detail.skills.jobLevelAcquisitions.length}개</span>
            </div>
            {detail.skills.jobLevelAcquisitions.length > 0 ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {detail.skills.jobLevelAcquisitions.map((row) => (
                  <SkillCard key={`job-${row.acquisitionOrder ?? "x"}-${row.skillId}`} skill={row.skill} sourceLabel={`${row.jobNameCn ?? `Job ${row.jobId ?? "?"}`} · Hero Lv.${row.jobLevelUpHeroLevel ?? "-"}`} />
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">전직 습득 스킬 없음</p>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SectionTitle icon={<BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />} title="직업 트리 · 최종 스탯" />
              <p className="mt-2 text-sm text-muted-foreground">Stage 6 확정 분기 구조를 순서 그대로 시각화해. 관계를 다시 계산하지 않아.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-muted px-3 py-1.5 font-semibold text-foreground">분기 {detail.jobs.branchCount}</span>
              <span className="rounded-full bg-muted px-3 py-1.5 font-semibold text-foreground">연결 {detail.jobs.connectionCount}</span>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {detail.jobs.branches.map((branch) => (
              <article key={branch.branchIndex} className="overflow-hidden rounded-2xl border border-border bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/70 px-4 py-3 sm:px-5">
                  <h3 className="text-sm font-bold text-foreground">전직 분기 {branch.branchIndex}</h3>
                  <span className="text-xs font-semibold text-muted-foreground">직업 {branch.jobs.length}개</span>
                </div>
                <div className="overflow-x-auto px-4 py-5 sm:px-5">
                  <div className="flex min-w-max items-stretch">
                    {branch.jobs.map((job, jobIndex) => (
                      <div key={`${branch.branchIndex}-${job.jobId ?? jobIndex}`} className="flex items-center">
                        {jobIndex > 0 ? <div className="mx-2 flex w-8 items-center sm:mx-3 sm:w-12" aria-hidden="true"><div className="h-px flex-1 bg-border" /><span className="ml-1 text-sm font-bold text-muted-foreground">→</span></div> : null}
                        <div className="flex min-h-24 w-36 flex-col justify-between rounded-xl border border-border bg-background p-3 shadow-sm sm:w-40">
                          <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">단계 {jobIndex + 1}</p><p className="mt-2 text-sm font-bold text-foreground">{job.nameCn ?? `Job ${job.jobId ?? "?"}`}</p></div>
                          <p className="mt-3 text-[11px] font-semibold text-muted-foreground">Job #{job.jobId ?? "-"}</p>
                        </div>
                      </div>
                    ))}
                    {branch.jobs.length === 0 ? <p className="text-sm text-muted-foreground">직업 정보 없음</p> : null}
                  </div>
                </div>
                {branch.capstone ? (
                  <div className="border-t border-border px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><p className="text-[11px] font-bold text-muted-foreground">최종 직업 검증 스탯</p><p className="mt-1 text-sm font-bold text-foreground">{branch.capstone.nameCn ?? `Job ${branch.capstone.jobId ?? "?"}`}</p></div>
                      <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                        {branch.capstone.heroLevel != null ? <span className="rounded-md bg-background px-2 py-1 font-semibold">Lv.{branch.capstone.heroLevel}</span> : null}
                        {branch.capstone.star != null ? <span className="rounded-md bg-background px-2 py-1 font-semibold">{branch.capstone.star}성</span> : null}
                        {branch.capstone.statStatus ? <span className="rounded-md bg-background px-2 py-1 font-semibold">{branch.capstone.statStatus}</span> : null}
                      </div>
                    </div>
                    <StatGrid stats={branch.capstone.finalStats} />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SectionTitle icon={<HeartHandshake className="h-4 w-4" aria-hidden="true" />} title="유대" />
              <p className="mt-2 text-sm text-muted-foreground">Stage 6 frozen 유대 행과 이미 해석된 해금 조건만 표시해.</p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">{detail.bonds.count}개</span>
          </div>
          {detail.bonds.rows.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {detail.bonds.rows.map((bond) => (
                <article key={`${bond.order}-${bond.fetterId ?? "x"}`} className="rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-[11px] font-bold text-muted-foreground">유대 {bond.order + 1}</p><h3 className="mt-1 font-bold text-foreground">{bond.nameCn ?? `Fetter ${bond.fetterId ?? "?"}`}</h3></div>
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      {bond.maxLevel != null ? <span className="rounded-md bg-background px-2 py-1 font-semibold">최대 Lv.{bond.maxLevel}</span> : null}
                      {bond.fetterId != null ? <span className="rounded-md bg-background px-2 py-1 font-semibold">#{bond.fetterId}</span> : null}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {bond.completionConditions.map((condition, conditionIndex) => (
                      <div key={`${bond.fetterId ?? bond.order}-${conditionIndex}`} className="rounded-lg border border-border bg-background px-3 py-3">
                        <p className="text-xs font-semibold leading-5 text-foreground">{formatBondCondition(condition)}</p>
                        {condition.semanticStatus ? <p className="mt-1 text-[10px] font-semibold text-muted-foreground">{condition.semanticStatus}</p> : null}
                      </div>
                    ))}
                    {bond.completionConditions.length === 0 ? <p className="text-sm text-muted-foreground">표시 가능한 해금 조건 없음</p> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">표시 가능한 유대 정보가 없어.</p>}
        </section>
        <HeroExclusiveEquipmentSection exclusiveEquipment={exclusiveEquipment} />
        <HeroCentralDisciplineSection centralDiscipline={detail.centralDiscipline} />

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-soldier-cards="true">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <SectionTitle icon={<UsersRound className="h-4 w-4" aria-hidden="true" />} title="사용 가능 용병" />
                <p className="mt-2 text-sm text-muted-foreground">A단계 확정 관계의 Soldier ID를 기존 224종 frontend consumer와 ID lookup으로 연결해. 관계를 다시 계산하지 않아.</p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">{soldierCards.length}종</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 xl:grid-cols-5">
              {soldierCards.map((record) => <HeroSoldierCard key={record.soldierId} record={record} />)}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <SectionTitle icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} title="확정 시스템 연결" />
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <StatusChip label="유대" value={`${detail.systems.bondRowCount}개`} active={detail.systems.bondRowCount > 0} />
              <StatusChip label="전용장비" value={exclusiveEquipment.status} active={exclusiveEquipment.released} />
              <StatusChip label="중앙율정" value={detail.systems.centralDisciplineStatus ?? "-"} active={detail.systems.centralDisciplineReleased} />
              <StatusChip label="SP" value={detail.systems.spStatus ?? "-"} active={detail.systems.spReleased} />
              <StatusChip label="스킨" value={`${detail.presentation.skinCount}개`} active={detail.presentation.skinCount > 0} />
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle icon={<Database className="h-4 w-4" aria-hidden="true" />} title="상세 데이터 상태" />
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Hero 본문은 FINAL_FROZEN Stage 6 개별 shard 하나만 읽고, 전용장비는 별도 frozen B-5 byHero 소유권과 Equipment Stage 3-5 메타데이터를 조합해. 용병 카드는 Stage 6의 확정 Soldier ID를 기존 frozen Soldier frontend consumer에 ID lookup만 하고, 원본 ConfigData 관계 재계산이나 이름·ID 추론은 하지 않아.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-muted px-2 py-1 font-semibold text-foreground">Stage 6 · {stage6.admissionStatus}</span><span className="rounded-md bg-muted px-2 py-1 font-semibold text-foreground">구조 {detail.validation.structuralStatus}</span><span className="rounded-md bg-muted px-2 py-1 font-semibold text-foreground">게시 {detail.validation.publicationStatus ?? "-"}</span><span className="rounded-md bg-muted px-2 py-1 font-semibold text-foreground">review {detail.validation.reviewCount}</span>
          </div>
        </section>
      </div>
    </main>
  );
}

type SkillView = { skillId: number; nameCn: string | null; desc: string | null; iconPath: string | null; displayType: string | null; cooldown: string | null; range: string | null; areaOrTarget: string | null };
type HeroSoldierCardView = { soldierId: number; nameKr: string | null; nameCn: string; nameKrStatus: string; tier: number; armyType: string; isSp: boolean };

const SOLDIER_ARMY_LABELS: Record<string, string> = {
  INFANTRY: "보병",
  LANCER: "창병",
  CAVALRY: "기병",
  FLYING: "비병",
  WATER: "수병",
  ARCHER: "궁병",
  ASSASSIN: "암살자",
  MAGE: "마법사",
  HOLY: "승병",
  DEMON: "마족",
};

function HeroSoldierCard({ record }: { record: HeroSoldierCardView }) {
  const displayName = record.nameKr ?? record.nameCn;
  const portraitUrl = getOfficialSoldierPortraitUrl(record.soldierId);
  const armyIconUrl = getOfficialArmyIconUrl(record.armyType);
  const armyLabel = SOLDIER_ARMY_LABELS[record.armyType] ?? record.armyType;
  const [portraitFailed, setPortraitFailed] = useState(false);

  return (
    <Link
      reloadDocument
      to="/soldiers/$soldierId"
      params={{ soldierId: String(record.soldierId) }}
      aria-label={`${displayName} 용병 상세 보기`}
      title={`${displayName} · Soldier ${record.soldierId}`}
      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted pb-8 text-muted-foreground transition group-hover:text-foreground">
        {portraitUrl && !portraitFailed ? (
          <img
            src={portraitUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-contain object-bottom px-1 pb-7 pt-2 transition-transform duration-200 group-hover:scale-[1.02]"
            onError={() => setPortraitFailed(true)}
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-current/20 bg-background/70 sm:h-16 sm:w-16">
            <span className="text-base font-black tracking-tight sm:text-lg">{armyLabel.slice(0, 1)}</span>
          </div>
        )}
      </div>

      <div className="absolute left-1.5 top-1.5 flex gap-1">
        <span className="rounded bg-black/65 px-1.5 py-0.5 text-[12px] font-bold leading-none text-white sm:text-[13px]">
          {record.isSp ? "SP" : `T${record.tier}`}
        </span>
        {record.nameKrStatus === "provisional-display" ? <span className="rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">임시</span> : null}
      </div>

      <div className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded bg-background/80 px-1 shadow-sm backdrop-blur" title={armyLabel}>
        {armyIconUrl ? <img src={armyIconUrl} alt="" aria-hidden="true" className="h-5 w-5 object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="text-[10px] font-bold text-foreground">{armyLabel.slice(0, 1)}</span>}
        <span className="sr-only">{armyLabel}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1.5 text-center backdrop-blur-[1px]">
        <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white sm:text-xs">{displayName}</span>
      </div>
    </Link>
  );
}

function SkillCard({ skill, sourceLabel }: { skill: SkillView; sourceLabel: string }) {
  return <article className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold text-muted-foreground">{sourceLabel}</p><h4 className="mt-1 font-bold text-foreground">{skill.nameCn ?? `Skill ${skill.skillId}`}</h4></div><span className="rounded-md bg-background px-2 py-1 text-[11px] font-bold text-muted-foreground">#{skill.skillId}</span></div><div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">{skill.displayType ? <span className="rounded-md border border-border bg-background px-2 py-1 font-semibold text-foreground">{skill.displayType}</span> : null}{skill.cooldown ? <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">쿨 {skill.cooldown}</span> : null}{skill.range ? <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">사거리 {skill.range}</span> : null}{skill.areaOrTarget ? <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">대상 {skill.areaOrTarget}</span> : null}</div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(skill.desc)}</p></article>;
}

function formatBondCondition(condition: { requiredHero: { heroId: number | null; nameKr: string | null; nameCn: string | null; nameEn: string | null } | null; mission: { missionId: number | null; title: string | null; desc: string | null; missionType: number | null } | null; stage: { stageId: number | null; nameCn: string | null } | null; favorability: { targetHeroId: number | null; targetHeroNameKr: string | null; targetHeroNameCn: string | null; targetHeroNameEn: string | null; requiredLevel: number | null } | null }) {
  if (condition.favorability) {
    const targetName = condition.favorability.targetHeroNameKr ?? condition.favorability.targetHeroNameCn ?? condition.favorability.targetHeroNameEn ?? "영웅";
    return `${targetName} 호감도 Lv.${condition.favorability.requiredLevel ?? "?"}`;
  }
  if (condition.requiredHero) {
    const heroName = condition.requiredHero.nameKr ?? condition.requiredHero.nameCn ?? condition.requiredHero.nameEn ?? `Hero ${condition.requiredHero.heroId ?? "?"}`;
    const stageName = condition.stage?.nameCn ?? condition.mission?.desc ?? condition.mission?.title;
    return stageName ? `${heroName}와 함께 · ${stageName}` : `${heroName} 필요`;
  }
  if (condition.stage?.nameCn) return condition.stage.nameCn;
  if (condition.mission?.desc) return condition.mission.desc;
  if (condition.mission?.title) return condition.mission.title;
  return "해금 조건 확인됨";
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) { return <div className="flex items-center gap-2">{icon}<h2 className="font-bold text-foreground">{title}</h2></div>; }
function InfoBlock({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-xl border border-border bg-muted/30 p-4"><p className="mb-2 text-xs font-bold text-muted-foreground">{title}</p>{children}</div>; }
function StatGrid({ stats }: { stats: { HP: number | null; ATK: number | null; INT: number | null; DEF: number | null; MDEF: number | null; DEX: number | null } }) { const entries = [["HP", stats.HP], ["ATK", stats.ATK], ["INT", stats.INT], ["DEF", stats.DEF], ["MDEF", stats.MDEF], ["DEX", stats.DEX]] as const; return <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">{entries.map(([label, value]) => <div key={label} className="rounded-lg bg-background px-2 py-2 text-center"><div className="text-[10px] font-bold text-muted-foreground">{label}</div><div className="mt-0.5 text-sm font-bold text-foreground">{value ?? "-"}</div></div>)}</div>; }
function StatusChip({ label, value, active }: { label: string; value: string; active: boolean }) { return <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"><span className="font-semibold text-foreground">{label}</span><span className="text-muted-foreground">{active ? value : value}</span></div>; }
function HeroNotFound() { return <main className="min-h-screen bg-background"><div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center"><Swords className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" /><h1 className="text-2xl font-bold text-foreground">영웅을 찾을 수 없어.</h1><p className="mt-2 text-sm text-muted-foreground">Stage 6 확정 Hero 목록에 존재하지 않는 주소야.</p><Link reloadDocument to="/heroes" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-4"><ArrowLeft className="h-4 w-4" aria-hidden="true" />영웅 목록으로</Link></div></main>; }
