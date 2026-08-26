import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Crown,
  Shield,
  Sparkles,
  Star,
  Swords,
  Users,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { getHeroPrototypePageData } from "@/lib/hero-page.functions";

export const Route = createFileRoute("/heroes_/$heroId")({
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

const TABS = [
  ["overview", "기본"],
  ["jobs", "전직"],
  ["skills", "스킬"],
  ["soldiers", "용병"],
  ["growth", "유대 · SP"],
] as const;

type TabId = (typeof TABS)[number][0];

type HeroData = ReturnType<typeof Route.useLoaderData>;
type JobData = HeroData["normal"]["jobs"][number];
type SkillData = HeroData["normal"]["directSkills"][number];

function HeroDetailPage() {
  const hero = Route.useLoaderData();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedStar, setSelectedStar] = useState(Math.max(hero.normal.initialStar, 6));
  const [selectedJobConnectionId, setSelectedJobConnectionId] = useState(
    hero.normal.jobs.at(-1)?.jobConnectionId ?? hero.normal.primaryJobConnectionId,
  );
  const [selectedSkinId, setSelectedSkinId] = useState(hero.skins[0]?.skinId ?? null);

  const selectedJob = useMemo(
    () =>
      hero.normal.jobs.find((job) => job.jobConnectionId === selectedJobConnectionId) ??
      hero.normal.jobs[0],
    [hero.normal.jobs, selectedJobConnectionId],
  );

  const selectedTalent = useMemo(
    () =>
      hero.normal.talent.starProgression.find((entry) => entry.star === selectedStar) ??
      hero.normal.talent.starProgression.at(-1),
    [hero.normal.talent.starProgression, selectedStar],
  );

  const selectedSkin =
    hero.skins.find((skin) => skin.skinId === selectedSkinId) ?? hero.skins[0] ?? null;

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

        <HeroHeader hero={hero} selectedSkin={selectedSkin} />

        <nav className="sticky top-0 z-20 mt-6 overflow-x-auto border-y border-border bg-background/95 py-2 backdrop-blur">
          <div className="flex min-w-max gap-2">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                  activeTab === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        {activeTab === "overview" ? (
          <OverviewTab
            hero={hero}
            selectedStar={selectedStar}
            onSelectStar={setSelectedStar}
            selectedJob={selectedJob}
            onSelectJob={setSelectedJobConnectionId}
            selectedSkinId={selectedSkinId}
            onSelectSkin={setSelectedSkinId}
          />
        ) : null}

        {activeTab === "jobs" ? (
          <JobsTab
            hero={hero}
            selectedJob={selectedJob}
            onSelectJob={setSelectedJobConnectionId}
          />
        ) : null}

        {activeTab === "skills" ? (
          <SkillsTab
            hero={hero}
            selectedStar={selectedStar}
            onSelectStar={setSelectedStar}
            selectedTalent={selectedTalent}
          />
        ) : null}

        {activeTab === "soldiers" ? <SoldiersTab hero={hero} /> : null}
        {activeTab === "growth" ? <GrowthTab hero={hero} /> : null}
      </div>
    </main>
  );
}

function HeroHeader({ hero, selectedSkin }: { hero: HeroData; selectedSkin: HeroData["skins"][number] | null }) {
  const { identity } = hero;

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="grid lg:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)]">
        <div className="relative flex min-h-[390px] items-end overflow-hidden border-b border-border bg-muted/45 p-6 sm:min-h-[480px] sm:p-8 lg:border-b-0 lg:border-r">
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-muted-foreground">
            <div>
              <Sparkles className="mx-auto mb-3" size={36} aria-hidden="true" />
              <p className="font-semibold">실제 web asset 연결 전</p>
              <p className="mt-2 max-w-xl break-all text-xs leading-5">
                {selectedSkin?.sourceImagePath ?? hero.artworkSourcePath}
              </p>
              {selectedSkin ? (
                <p className="mt-1 text-xs">선택 스킨: {selectedSkin.displayName}</p>
              ) : null}
            </div>
          </div>

          <div className="relative z-10 w-full rounded-2xl border border-border/70 bg-background/90 p-5 backdrop-blur sm:max-w-lg">
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusPill>{hero.rarity.baseLabel}</StatusPill>
              <StatusPill>Hero ID {hero.heroId}</StatusPill>
              {hero.sp ? <StatusPill>SP RELEASED</StatusPill> : null}
              <StatusPill>{hero.validation.structuralStatus}</StatusPill>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-foreground sm:text-5xl">
              {identity.nameKr}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {identity.nameCn} · {identity.nameEn}
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <dl className="space-y-5 text-sm">
            <InfoRow label="CV" value={hero.cv.displayName} pending={hero.cv.localizationPending} />
            <div>
              <dt className="font-semibold text-muted-foreground">진영</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {hero.factions.map((faction) => (
                  <span
                    key={faction.factionId}
                    className="rounded-full border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground"
                  >
                    {faction.displayName}
                  </span>
                ))}
              </dd>
              {hero.factions.some((faction) => faction.localizationPending) ? <PendingKrLabel /> : null}
            </div>
            <InfoRow
              label="출시작"
              value={hero.origin.displayName}
              pending={hero.origin.localizationPending}
            />
          </dl>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <SummaryNumber label="일반 전직" value={hero.normal.jobs.length} />
            <SummaryNumber label="사용 가능 용병" value={hero.soldiers.length} />
            <SummaryNumber
              label="일반 스킬"
              value={hero.normal.directSkills.length + hero.normal.skillAcquisitions.length}
            />
            <SummaryNumber label="유대" value={hero.bonds.length} />
          </div>

          <div className="mt-5 rounded-xl border border-border bg-muted/35 p-4 text-xs leading-5 text-muted-foreground">
            final consumer를 화면용으로 projection만 하며, 프론트에서 전직 관계·스탯·성급 규칙·용병 관계를 다시 추론하지 않아.
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewTab({
  hero,
  selectedStar,
  onSelectStar,
  selectedJob,
  onSelectJob,
  selectedSkinId,
  onSelectSkin,
}: {
  hero: HeroData;
  selectedStar: number;
  onSelectStar: (star: number) => void;
  selectedJob: JobData | undefined;
  onSelectJob: (jobConnectionId: number) => void;
  selectedSkinId: number | null;
  onSelectSkin: (skinId: number) => void;
}) {
  const talent =
    hero.normal.talent.starProgression.find((entry) => entry.star === selectedStar) ??
    hero.normal.talent.starProgression.at(-1);

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)]">
      <div className="space-y-6">
        <Section icon={<Sparkles size={18} />} title="고유기" subtitle={`consumer status: ${hero.normal.talent.status}`}>
          <StarSelector
            initialStar={hero.normal.initialStar}
            selectedStar={selectedStar}
            onSelect={onSelectStar}
          />
          {talent ? <SkillCard skill={talent.skill} compact={false} /> : null}
        </Section>

        <Section icon={<Swords size={18} />} title="전직 · 최종 표시 스탯" subtitle="Lv70 / 6성 · finalDisplayStats 직접 표시">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <JobTree hero={hero} selectedJobId={selectedJob?.jobConnectionId} onSelect={onSelectJob} />
            {selectedJob ? <JobStats job={selectedJob} /> : null}
          </div>
        </Section>

        <Section icon={<Crown size={18} />} title="전용장비 · 중앙율정">
          <div className="grid gap-4 md:grid-cols-2">
            <ReleaseCard
              eyebrow="전용장비"
              title={hero.exclusiveEquipment?.displayName ?? "미출시"}
              status={hero.exclusiveEquipment?.status ?? "UNRELEASED"}
              description={hero.exclusiveEquipment?.description}
              footer={hero.exclusiveEquipment ? `Equipment ID ${hero.exclusiveEquipment.equipmentId}` : null}
            />
            <ReleaseCard
              eyebrow="중앙율정"
              title={hero.centralDiscipline?.nameCn ?? "미출시"}
              status={hero.centralDiscipline?.status ?? "UNRELEASED"}
              description={hero.centralDiscipline?.description}
              footer={
                hero.centralDiscipline
                  ? `6성 · Casting Law Lv${hero.centralDiscipline.unlock.castingLawLevel}`
                  : null
              }
            />
          </div>
        </Section>
      </div>

      <aside className="space-y-6">
        <Section icon={<Sparkles size={18} />} title="스킨 선택" subtitle={`${hero.skins.length}종 · asset path 검증용`}>
          <div className="grid gap-2">
            {hero.skins.map((skin) => {
              const selected = skin.skinId === selectedSkinId;
              return (
                <button
                  key={skin.skinId}
                  type="button"
                  onClick={() => onSelectSkin(skin.skinId)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-foreground">{skin.displayName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {skin.acquisitionLabel ?? "획득 방식 미확정"}
                      </p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">#{skin.skinId}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section icon={<Users size={18} />} title="용병 보정" subtitle="소속 관계가 아닌 영웅 보유 병사 스탯 보정">
          <div className="grid grid-cols-2 gap-2">
            <Modifier label="HP" value={hero.normal.soldierModifiers.hp} />
            <Modifier label="공격" value={hero.normal.soldierModifiers.at} />
            <Modifier label="방어" value={hero.normal.soldierModifiers.df} />
            <Modifier label="마방" value={hero.normal.soldierModifiers.magicDf} />
          </div>
        </Section>

        {hero.sp ? (
          <Section icon={<Star size={18} />} title="SP 요약">
            <p className="text-lg font-black text-foreground">{hero.sp.job.nameCn}</p>
            <p className="mt-1 text-xs text-muted-foreground">Job ID {hero.sp.job.jobId}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <SummaryNumber label="1단계" value={hero.sp.missionCounts.firstStage} />
              <SummaryNumber label="2단계" value={hero.sp.missionCounts.secondStage} />
              <SummaryNumber label="전체" value={hero.sp.missionCounts.total} />
            </div>
          </Section>
        ) : null}
      </aside>
    </div>
  );
}

function JobsTab({
  hero,
  selectedJob,
  onSelectJob,
}: {
  hero: HeroData;
  selectedJob: JobData | undefined;
  onSelectJob: (jobConnectionId: number) => void;
}) {
  return (
    <div className="mt-6 space-y-6">
      <Section icon={<Swords size={18} />} title="전직 트리" subtitle="consumer branches와 predecessor 관계를 그대로 사용">
        <JobTree hero={hero} selectedJobId={selectedJob?.jobConnectionId} onSelect={onSelectJob} wide />
      </Section>

      {selectedJob ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <Section icon={<CheckCircle2 size={18} />} title={selectedJob.nameCn} subtitle={`Job ID ${selectedJob.jobId} · rank ${selectedJob.rank}`}>
            <JobStats job={selectedJob} />
          </Section>

          <Section icon={<Sparkles size={18} />} title="이 전직에서 획득하는 요소">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground">획득 스킬</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedJob.acquiredSkillIds.length > 0 ? (
                    selectedJob.acquiredSkillIds.map((skillId) => (
                      <span key={skillId} className="rounded-lg border border-border bg-muted/35 px-3 py-2 text-sm font-semibold text-foreground">
                        Skill {skillId}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">이 connection의 JobLevel 획득 스킬 없음</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground">획득 용병</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedJob.acquiredSoldierIds.length > 0 ? (
                    selectedJob.acquiredSoldierIds.map((soldierId) => {
                      const soldier = hero.soldiers.find((record) => record.soldierId === soldierId);
                      return (
                        <span key={soldierId} className="rounded-lg border border-border bg-muted/35 px-3 py-2 text-sm font-semibold text-foreground">
                          {soldier?.displayName ?? `Soldier ${soldierId}`}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-sm text-muted-foreground">이 connection의 JobLevel 획득 용병 없음</span>
                  )}
                </div>
              </div>
            </div>
          </Section>
        </div>
      ) : null}
    </div>
  );
}

function SkillsTab({
  hero,
  selectedStar,
  onSelectStar,
  selectedTalent,
}: {
  hero: HeroData;
  selectedStar: number;
  onSelectStar: (star: number) => void;
  selectedTalent: HeroData["normal"]["talent"]["starProgression"][number] | undefined;
}) {
  return (
    <div className="mt-6 space-y-6">
      <Section icon={<Sparkles size={18} />} title="고유기 성급 변화" subtitle={`${hero.normal.talent.status} · ${hero.normal.talent.selectionRule}`}>
        <StarSelector
          initialStar={hero.normal.initialStar}
          selectedStar={selectedStar}
          onSelect={onSelectStar}
        />
        {selectedTalent ? <SkillCard skill={selectedTalent.skill} compact={false} /> : null}
      </Section>

      <Section icon={<Swords size={18} />} title="초기 보유 스킬">
        <div className="grid gap-4 md:grid-cols-2">
          {hero.normal.directSkills.map((skill) => (
            <SkillCard key={skill.skillId} skill={skill} compact />
          ))}
        </div>
      </Section>

      <Section icon={<Swords size={18} />} title="전직 획득 스킬" subtitle={`${hero.normal.skillAcquisitions.length}개 · acquisitionOrder 순서`}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hero.normal.skillAcquisitions.map((entry) => (
            <article key={`${entry.acquisitionOrder}-${entry.skill.skillId}`} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>#{entry.acquisitionOrder} · {entry.jobNameCn}</span>
                <span>Lv {entry.jobLevelUpHeroLevel}</span>
              </div>
              <div className="mt-3">
                <SkillCard skill={entry.skill} compact borderless />
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section icon={<Crown size={18} />} title="각성기">
        {hero.normal.awakening.skill ? (
          <SkillCard skill={hero.normal.awakening.skill} compact={false} />
        ) : (
          <EmptyState title="현재 normal consumer에서 각성기 없음" detail={`status: ${hero.normal.awakening.status}`} />
        )}
      </Section>

      {hero.sp ? (
        <Section icon={<Star size={18} />} title="SP 2단계 보상 스킬" subtitle="SP final consumer 직접 표시">
          <div className="grid gap-4 md:grid-cols-2">
            {hero.sp.rewardSkills.map((skill) => (
              <SkillCard key={skill.skillId} skill={skill} compact />
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-border bg-muted/35 p-4">
            <p className="font-bold text-foreground">{hero.sp.rewardBuff.nameCn}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{hero.sp.rewardBuff.description}</p>
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function SoldiersTab({ hero }: { hero: HeroData }) {
  const reviewCount = hero.soldiers.filter((soldier) => soldier.validationStatus !== "PASS").length;

  return (
    <div className="mt-6 space-y-6">
      <Section
        icon={<Users size={18} />}
        title="사용 가능 용병"
        subtitle={`C-FINAL Hero↔Soldier relation · ${hero.soldiers.length}종 · REVIEW ${reviewCount}종`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {hero.soldiers.map((soldier) => (
            <article key={soldier.soldierId} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Soldier {soldier.soldierId}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${soldier.validationStatus === "PASS" ? "bg-muted text-foreground" : "border border-border text-muted-foreground"}`}>
                  {soldier.validationStatus}
                </span>
              </div>
              <p className="mt-2 font-bold text-foreground">{soldier.displayName}</p>
              {soldier.localizationPending ? <PendingKrLabel /> : null}
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                {soldier.tier !== null ? <span>Tier {soldier.tier}</span> : null}
                {soldier.armyType ? <span>· {soldier.armyType}</span> : null}
                {soldier.isSp ? <span>· SP</span> : null}
              </div>
            </article>
          ))}
        </div>
      </Section>

      {hero.sp?.rewardSoldiers.length ? (
        <Section icon={<Star size={18} />} title="SP 추가 용병">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hero.sp.rewardSoldiers.map((soldier) => (
              <article key={soldier.soldierId} className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <span className="text-xs font-semibold text-muted-foreground">SP 보상</span>
                <p className="mt-2 font-bold text-foreground">{soldier.displayName}</p>
                <p className="mt-1 text-xs text-muted-foreground">Soldier {soldier.soldierId} · Tier {soldier.tier} · {soldier.armyType}</p>
              </article>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function GrowthTab({ hero }: { hero: HeroData }) {
  return (
    <div className="mt-6 space-y-6">
      <Section icon={<Crown size={18} />} title="유대" subtitle={`${hero.bonds.length}개 · Stage 5 final consumer`}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hero.bonds.map((bond) => (
            <article key={bond.fetterId} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Fetter {bond.fetterId}</p>
                  <h3 className="mt-1 font-bold text-foreground">{bond.nameCn}</h3>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">Lv {bond.maxLevel}</span>
              </div>

              {bond.favorabilityLevels.length > 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  호감도 요구: {bond.favorabilityLevels.map((level) => `Lv${level}`).join(", ")}
                </p>
              ) : null}

              {bond.requiredHeroes.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {bond.requiredHeroes.map((requiredHero) => (
                    <span key={requiredHero.heroId} className="rounded-lg border border-border bg-muted/35 px-2.5 py-1.5 text-xs font-semibold text-foreground">
                      필요 영웅: {requiredHero.nameKr}
                    </span>
                  ))}
                </div>
              ) : null}

              {bond.missionDescriptions.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
                  {bond.missionDescriptions.map((description, index) => (
                    <p key={`${bond.fetterId}-${index}`}>{description}</p>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </Section>

      <Section icon={<Crown size={18} />} title="전용장비 · 중앙율정">
        <div className="grid gap-4 md:grid-cols-2">
          <ReleaseCard
            eyebrow="전용장비"
            title={hero.exclusiveEquipment?.displayName ?? "미출시"}
            status={hero.exclusiveEquipment?.status ?? "UNRELEASED"}
            description={hero.exclusiveEquipment?.description}
            footer={hero.exclusiveEquipment ? `Equipment ID ${hero.exclusiveEquipment.equipmentId}` : null}
          />
          <ReleaseCard
            eyebrow="중앙율정"
            title={hero.centralDiscipline?.nameCn ?? "미출시"}
            status={hero.centralDiscipline?.status ?? "UNRELEASED"}
            description={hero.centralDiscipline?.description}
            footer={hero.centralDiscipline ? `Skill ID ${hero.centralDiscipline.skillId}` : null}
          />
        </div>
      </Section>

      {hero.sp ? (
        <Section icon={<Star size={18} />} title="SP 전직" subtitle={`${hero.sp.status} · ${hero.sp.missionCounts.total} missions`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div className="rounded-2xl border border-border bg-background p-5">
              <p className="text-xs font-semibold text-muted-foreground">SP Job</p>
              <h3 className="mt-2 text-2xl font-black text-foreground">{hero.sp.job.nameCn}</h3>
              <p className="mt-1 text-sm text-muted-foreground">Job ID {hero.sp.job.jobId}</p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <SummaryNumber label="1단계" value={hero.sp.missionCounts.firstStage} />
                <SummaryNumber label="2단계" value={hero.sp.missionCounts.secondStage} />
                <SummaryNumber label="전체" value={hero.sp.missionCounts.total} />
              </div>
            </div>

            <div className="space-y-3">
              {hero.sp.rewardSkills.map((skill) => (
                <SkillCard key={skill.skillId} skill={skill} compact />
              ))}
              <div className="rounded-xl border border-border bg-muted/35 p-4">
                <p className="font-bold text-foreground">{hero.sp.rewardBuff.nameCn}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{hero.sp.rewardBuff.description}</p>
              </div>
            </div>
          </div>
        </Section>
      ) : (
        <EmptyState title="SP 미출시" detail="현재 final consumer에 SP 데이터가 없어." />
      )}
    </div>
  );
}

function JobTree({
  hero,
  selectedJobId,
  onSelect,
  wide = false,
}: {
  hero: HeroData;
  selectedJobId?: number;
  onSelect: (jobConnectionId: number) => void;
  wide?: boolean;
}) {
  const jobByConnectionId = useMemo(
    () => new Map(hero.normal.jobs.map((job) => [job.jobConnectionId, job])),
    [hero.normal.jobs],
  );

  return (
    <div className={`space-y-3 ${wide ? "max-w-none" : ""}`}>
      {hero.normal.branches.map((branch, branchIndex) => (
        <div key={`${branchIndex}-${branch.join("-")}`} className="overflow-x-auto rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex min-w-max items-center gap-2">
            {branch.map((connectionId, index) => {
              const job = jobByConnectionId.get(connectionId);
              if (!job) return null;
              const selected = selectedJobId === connectionId;
              return (
                <div key={connectionId} className="flex items-center gap-2">
                  {index > 0 ? <ChevronRight size={16} className="text-muted-foreground" aria-hidden="true" /> : null}
                  <button
                    type="button"
                    onClick={() => onSelect(connectionId)}
                    className={`min-w-[132px] rounded-xl border px-3 py-3 text-left transition ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    <p className={`text-[10px] font-bold ${selected ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                      RANK {job.rank} · J{job.jobId}
                    </p>
                    <p className="mt-1 font-bold">{job.nameCn}</p>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function JobStats({ job }: { job: JobData }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">선택 전직</p>
          <h3 className="mt-1 text-xl font-black text-foreground">{job.nameCn}</h3>
        </div>
        <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
          Lv{job.finalDisplayStats.heroLevel} · ★{job.finalDisplayStats.star}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STAT_LABELS.map(([key, label]) => (
          <div key={key} className="rounded-lg border border-border bg-card px-3 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-black tabular-nums text-foreground">
              {job.finalDisplayStats.values[key].toLocaleString("ko-KR")}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">status: {job.finalDisplayStats.status}</p>
    </div>
  );
}

function StarSelector({
  initialStar,
  selectedStar,
  onSelect,
}: {
  initialStar: number;
  selectedStar: number;
  onSelect: (star: number) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {[3, 4, 5, 6].map((star) => (
        <button
          key={star}
          type="button"
          disabled={star < initialStar}
          onClick={() => onSelect(star)}
          className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
            selectedStar === star
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-foreground hover:bg-muted"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          ★ {star}
        </button>
      ))}
    </div>
  );
}

function SkillCard({
  skill,
  compact,
  borderless = false,
}: {
  skill: SkillData;
  compact: boolean;
  borderless?: boolean;
}) {
  return (
    <div className={`${borderless ? "" : "rounded-xl border border-border bg-background p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Skill {skill.skillId}</p>
          <h3 className={`${compact ? "mt-1 text-base" : "mt-1 text-xl"} font-black text-foreground`}>{skill.nameCn}</h3>
        </div>
        {skill.displayType ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{skill.displayType}</span>
        ) : null}
      </div>
      {skill.description ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{skill.description}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {skill.cooldown ? <span>쿨 {skill.cooldown}</span> : null}
        {skill.range ? <span>범위 {skill.range}</span> : null}
        {skill.areaOrTarget ? <span>대상 {skill.areaOrTarget}</span> : null}
      </div>
    </div>
  );
}

function ReleaseCard({
  eyebrow,
  title,
  status,
  description,
  footer,
}: {
  eyebrow: string;
  title: string;
  status: string;
  description?: string | null;
  footer?: string | null;
}) {
  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">{eyebrow}</p>
        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{status}</span>
      </div>
      <h3 className="mt-2 text-lg font-black text-foreground">{title}</h3>
      {description ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      {footer ? <p className="mt-3 text-xs text-muted-foreground">{footer}</p> : null}
    </article>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-border bg-muted p-2 text-muted-foreground">{icon}</div>
        <div>
          <h2 className="text-lg font-black text-foreground">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function InfoRow({ label, value, pending }: { label: string; value: string; pending: boolean }) {
  return (
    <div>
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-medium text-foreground">{value}</dd>
      {pending ? <PendingKrLabel /> : null}
    </div>
  );
}

function SummaryNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-center">
      <p className="text-xl font-black tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function Modifier({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-black text-foreground">+{value}%</p>
    </div>
  );
}

function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-card px-2.5 py-1 font-bold text-foreground first:border-primary first:bg-primary first:text-primary-foreground">
      {children}
    </span>
  );
}

function PendingKrLabel() {
  return <p className="mt-1 text-xs text-muted-foreground">한국어 표시명 REVIEW · 원문 표시 중</p>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/25 p-5 text-center">
      <CircleHelp className="mx-auto text-muted-foreground" size={20} aria-hidden="true" />
      <p className="mt-2 font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
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
