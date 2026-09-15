import { useLoaderData } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { getStaticHeroJobMaterials } from "@/lib/hero-job-materials.static";
import { getStaticHeroJobMovement } from "@/lib/hero-job-movement.static";
import { getHeroSkillIconUrl } from "@/lib/hero-skill-icon-assets";

function stripConfigMarkup(value: string | null) {
  if (!value) return "-";
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}

type SpTalentSkill = {
  skillId: number;
  nameCn: string | null;
  desc: string | null;
  iconPath: string | null;
};

type SpTalentView = {
  status: string | null;
  selectionRule: string | null;
  starProgression: Array<{
    star: number;
    skillId: number;
    skill: SpTalentSkill;
  }>;
};

function HeroSpTalentSection({
  heroId,
  jobNameCn,
  talent,
}: {
  heroId: number;
  jobNameCn: string | null;
  talent: SpTalentView;
}) {
  const progression = [...talent.starProgression].sort((a, b) => a.star - b.star);
  const sixStarIndex = progression.findIndex((row) => row.star === 6);
  const defaultIndex = sixStarIndex >= 0 ? sixStarIndex : Math.max(progression.length - 1, 0);
  const [talentIndex, setTalentIndex] = useState(defaultIndex);
  useEffect(() => setTalentIndex(defaultIndex), [heroId, defaultIndex]);

  if (talent.status !== "VERIFIED" || progression.length === 0) return null;

  const activeRow = progression[talentIndex] ?? progression.at(-1) ?? null;
  if (!activeRow) return null;
  const iconUrl = getHeroSkillIconUrl(heroId, activeRow.skill.iconPath);
  const moveTalent = (delta: number) => {
    setTalentIndex((current) => Math.min(Math.max(current + delta, 0), progression.length - 1));
  };

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-sp-talent="true"
      data-sp-talent-count={progression.length}
      data-sp-talent-selection-rule={talent.selectionRule ?? ""}
    >
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-foreground">SP 전직 고유기</h2>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          {jobNameCn ? `${jobNameCn} · ` : ""}검증된 중국 서버 SP 전직 고유기
        </p>
      </div>

      <div className="mt-4" data-hero-sp-talent-active-star={activeRow.star}>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-stretch gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="낮은 성급 SP 고유기 보기"
            onClick={() => moveTalent(-1)}
            disabled={talentIndex === 0}
            className="flex w-10 items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30 sm:w-12"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <article className="min-w-0 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              {iconUrl ? (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-1.5 shadow-sm">
                  <img src={iconUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-full w-full object-contain" />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-foreground">
                  {activeRow.star}성 · {activeRow.skill.nameCn ?? `Skill ${activeRow.skillId}`}
                </h3>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {stripConfigMarkup(activeRow.skill.desc)}
                </p>
              </div>
            </div>
          </article>

          <button
            type="button"
            aria-label="높은 성급 SP 고유기 보기"
            onClick={() => moveTalent(1)}
            disabled={talentIndex === progression.length - 1}
            className="flex w-10 items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30 sm:w-12"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:justify-center" aria-label="SP 고유기 성급 선택">
          {progression.map((row, index) => (
            <button
              key={`${row.star}-${row.skillId}-sp-selector`}
              type="button"
              onClick={() => setTalentIndex(index)}
              aria-pressed={index === talentIndex}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${index === talentIndex ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
            >
              {row.star}성
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroJobMovementSection({ heroId }: { heroId: number }) {
  const movementRows = getStaticHeroJobMovement(heroId);
  if (!movementRows) {
    throw new Error(`Hero ${heroId} has no frozen job-movement record.`);
  }

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-job-movement="true"
      data-hero-job-movement-count={movementRows.length}
    >
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-foreground">전직 이동 정보</h2>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          검증된 전직별 이동력 · 이동타입
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {movementRows.map((row, index) => (
          <article
            key={row.jobConnectionId}
            className="rounded-xl border border-border bg-muted/20 p-4"
            data-job-connection-id={row.jobConnectionId}
            data-job-id={row.jobId}
            data-move-type={row.moveType}
            data-move-point={row.movePoint}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground">전직 경로 {index + 1}</p>
                <h3 className="mt-1 truncate text-sm font-extrabold text-foreground">
                  {row.nameCn ?? `Job ${row.jobId}`}
                </h3>
              </div>
              <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                Job {row.jobId}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
                <dt className="text-[11px] font-bold text-muted-foreground">이동력</dt>
                <dd className="mt-1 text-base font-extrabold tabular-nums text-foreground">{row.movePoint}</dd>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
                <dt className="text-[11px] font-bold text-muted-foreground">이동타입</dt>
                <dd className="mt-1 text-sm font-extrabold text-foreground">{row.moveTypeNameKr}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HeroJobMaterialsSection({ heroId }: { heroId: number }) {
  const { detail } = useLoaderData({ from: "/heroes_/$heroId" });
  const hero = getStaticHeroJobMaterials(heroId);
  if (!hero) {
    throw new Error(`Hero ${heroId} has no frozen job-material record.`);
  }

  const connections = hero.connections
    .map((connection, connectionIndex) => ({
      ...connection,
      connectionIndex,
      levels: connection.levels.filter((level) => level.materials.length > 0),
    }))
    .filter((connection) => connection.levels.length > 0);
  const materialEntryCount = connections.reduce(
    (sum, connection) => sum + connection.levels.reduce((levelSum, level) => levelSum + level.materials.length, 0),
    0,
  );

  return (
    <>
      {detail.sp.released ? (
        <HeroSpTalentSection
          heroId={heroId}
          jobNameCn={detail.sp.finalJob?.nameCn ?? null}
          talent={detail.sp.talent}
        />
      ) : null}

      <HeroJobMovementSection heroId={heroId} />

      <section
        className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
        data-hero-job-materials="true"
        data-job-material-entry-count={materialEntryCount}
      >
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-foreground">전직 재료</h2>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            검증된 중국 서버 ConfigData 기준 · 재료명은 중국 서버 원문
          </p>
        </div>

        {connections.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {connections.map((connection) => (
              <article
                key={connection.jobConnectionId}
                className="rounded-xl border border-border bg-muted/20 p-4"
                data-job-connection-id={connection.jobConnectionId}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-extrabold text-foreground">
                    전직 경로 {connection.connectionIndex + 1}
                    {connection.jobId != null ? ` · Job ${connection.jobId}` : ""}
                  </h3>
                  <span className="text-[11px] font-bold text-muted-foreground">Connection {connection.jobConnectionId}</span>
                </div>

                <div className="mt-3 space-y-3">
                  {connection.levels.map((level) => (
                    <div key={level.jobLevelId} className="rounded-lg border border-border/70 bg-background/70 p-3" data-job-level-id={level.jobLevelId}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground">
                        <span>JobLevel {level.jobLevelId}</span>
                        {level.heroLevelRequired != null ? <span>영웅 Lv.{level.heroLevelRequired}</span> : null}
                      </div>
                      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                        {level.materials.map((material, materialIndex) => (
                          <li
                            key={`${material.id}-${materialIndex}`}
                            className="rounded-md border border-border/70 bg-card px-3 py-2"
                            data-job-material-id={material.id}
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-sm font-bold text-foreground">{material.jobMaterial.nameCn}</span>
                              <span className="shrink-0 text-sm font-extrabold tabular-nums text-foreground">×{material.count}</span>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                              {stripConfigMarkup(material.jobMaterial.descriptionCn)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            이 영웅의 일반 전직 경로에는 표시할 승급 재료가 없어.
          </p>
        )}
      </section>
    </>
  );
}
