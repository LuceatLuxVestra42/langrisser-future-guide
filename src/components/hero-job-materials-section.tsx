import { useLoaderData } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { getHeroJobMaterialIconUrl } from "@/lib/hero-job-material-icon-assets";
import { getStaticHeroJobMaterials } from "@/lib/hero-job-materials.static";
import { getStaticHeroJobMovement } from "@/lib/hero-job-movement.static";

function HeroJobMaterialIcon({ sourcePath }: { sourcePath: string | null }) {
  const iconUrl = getHeroJobMaterialIconUrl(sourcePath);
  if (!iconUrl) return null;

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-1 shadow-sm">
      <img src={iconUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-full w-full object-contain" />
    </div>
  );
}

type HeroJobMovementRowView = {
  jobConnectionId: number;
  jobId: number;
  nameCn: string | null;
  moveType: number;
  moveTypeNameKr: string;
  movePoint: number;
  attackRange: number | null;
};

type HeroSpFinalJobView = {
  jobConnectionId: number | null;
  jobId: number | null;
  nameCn: string | null;
};

function HeroSpJobMovementSection({
  heroId,
  finalJob,
}: {
  heroId: number;
  finalJob: HeroSpFinalJobView;
}) {
  const [row, setRow] = useState<HeroJobMovementRowView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRow(null);
    setLoadError(null);

    const jobConnectionId = finalJob.jobConnectionId;
    const jobId = finalJob.jobId;
    if (
      typeof jobConnectionId !== "number" ||
      !Number.isInteger(jobConnectionId) ||
      typeof jobId !== "number" ||
      !Number.isInteger(jobId)
    ) {
      setLoadError(`Hero ${heroId} released SP final job has no exact frozen identity.`);
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([
      import("@/lib/hero-sp-job-movement.static"),
      import("@/lib/hero-final-job-attack-range.static"),
    ])
      .then(([{ getStaticHeroSpJobMovement }, { getStaticHeroFinalJobAttackRange }]) => {
        const movement = getStaticHeroSpJobMovement(heroId, jobConnectionId, jobId);
        if (!movement) {
          throw new Error(`Hero ${heroId} SP Job ${jobId} has no frozen movement record.`);
        }
        const attackRange = getStaticHeroFinalJobAttackRange(jobId);
        if (attackRange == null) {
          throw new Error(`Hero ${heroId} SP Job ${jobId} has no frozen attack-range record.`);
        }
        if (!cancelled) {
          setRow({
            jobConnectionId: movement.jobConnectionId,
            jobId: movement.jobId,
            nameCn: finalJob.nameCn ?? movement.nameCn,
            moveType: movement.moveType,
            moveTypeNameKr: movement.moveTypeNameKr,
            movePoint: movement.movePoint,
            attackRange,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(String(error instanceof Error ? error.message : error));
      });

    return () => {
      cancelled = true;
    };
  }, [heroId, finalJob.jobConnectionId, finalJob.jobId, finalJob.nameCn]);

  if (loadError) {
    throw new Error(loadError);
  }

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-sp-job-movement="true"
      data-hero-sp-job-movement-status={row ? "ready" : "loading"}
      data-job-connection-id={row?.jobConnectionId ?? ""}
      data-job-id={row?.jobId ?? ""}
      data-move-type={row?.moveType ?? ""}
      data-move-point={row?.movePoint ?? ""}
      data-basic-attack-range={row?.attackRange ?? ""}
    >
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-foreground">SP 전직 이동 정보</h2>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          검증된 SP 전직 이동력 · 이동타입 · 공격 사거리
        </p>
      </div>

      {row ? (
        <article className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-muted-foreground">SP 전직</p>
              <h3 className="mt-1 truncate text-sm font-extrabold text-foreground">
                {row.nameCn ?? `Job ${row.jobId}`}
              </h3>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground">
                공격 사거리 {row.attackRange}
              </span>
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                Job {row.jobId}
              </span>
            </div>
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
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          SP 전직 이동 정보를 불러오는 중이야.
        </p>
      )}
    </section>
  );
}

function HeroJobMovementSection({ heroId }: { heroId: number }) {
  const [movementRows, setMovementRows] = useState<HeroJobMovementRowView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMovementRows(null);
    setLoadError(null);

    void Promise.all([
      import("@/lib/hero-job-movement.static"),
      import("@/lib/hero-final-job-attack-range.static"),
    ])
      .then(([{ getStaticHeroJobMovement }, { getStaticHeroFinalJobAttackRange }]) => {
        const rows = getStaticHeroJobMovement(heroId);
        if (!rows) {
          throw new Error(`Hero ${heroId} has no frozen job-movement record.`);
        }
        const projectedRows = rows.map((row) => ({
          ...row,
          attackRange: getStaticHeroFinalJobAttackRange(row.jobId),
        }));
        if (!cancelled) setMovementRows(projectedRows);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(String(error instanceof Error ? error.message : error));
      });

    return () => {
      cancelled = true;
    };
  }, [heroId]);

  if (loadError) {
    throw new Error(loadError);
  }

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-job-movement="true"
      data-hero-job-movement-count={movementRows?.length ?? 0}
      data-hero-job-movement-status={movementRows ? "ready" : "loading"}
    >
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-foreground">전직 이동 정보</h2>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          검증된 전직별 이동력 · 이동타입
        </p>
      </div>

      {movementRows ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {movementRows.map((row, index) => (
            <article
              key={row.jobConnectionId}
              className="rounded-xl border border-border bg-muted/20 p-4"
              data-job-connection-id={row.jobConnectionId}
              data-job-id={row.jobId}
              data-move-type={row.moveType}
              data-move-point={row.movePoint}
              data-basic-attack-range={row.attackRange ?? ""}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-muted-foreground">전직 경로 {index + 1}</p>
                  <h3 className="mt-1 truncate text-sm font-extrabold text-foreground">
                    {row.nameCn ?? `Job ${row.jobId}`}
                  </h3>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {row.attackRange != null ? (
                    <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground">
                      공격 사거리 {row.attackRange}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                    Job {row.jobId}
                  </span>
                </div>
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
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          전직 이동 정보를 불러오는 중이야.
        </p>
      )}
    </section>
  );
}

export function HeroJobMaterialsSection({
  heroId,
  mode,
}: {
  heroId: number;
  mode: "normal" | "sp";
}) {
  const { detail } = useLoaderData({ from: "/heroes_/$heroId" });
  const hero = getStaticHeroJobMaterials(heroId);
  if (!hero) {
    throw new Error(`Hero ${heroId} has no frozen job-material record.`);
  }

  const jobMovementRows = getStaticHeroJobMovement(heroId);
  if (!jobMovementRows) {
    throw new Error(`Hero ${heroId} has no frozen job-name source.`);
  }
  const jobMovementByConnectionId = new Map(jobMovementRows.map((row) => [row.jobConnectionId, row]));

  const connections = hero.connections
    .map((connection) => ({
      ...connection,
      jobNameCn: jobMovementByConnectionId.get(connection.jobConnectionId)?.nameCn ?? null,
      levels: connection.levels.filter((level) => level.materials.length > 0),
    }))
    .filter((connection) => connection.levels.length > 0);

  for (const connection of connections) {
    if (!connection.jobNameCn) {
      throw new Error(
        `Hero ${heroId} JobConnection ${connection.jobConnectionId} has no verified Chinese job name.`,
      );
    }
  }

  const materialEntryCount = connections.reduce(
    (sum, connection) => sum + connection.levels.reduce((levelSum, level) => levelSum + level.materials.length, 0),
    0,
  );

  if (mode === "sp") {
    if (!detail.sp.released || !detail.sp.finalJob) {
      throw new Error(`Hero ${heroId} requested SP form without a released frozen SP final job.`);
    }
    return <HeroSpJobMovementSection heroId={heroId} finalJob={detail.sp.finalJob} />;
  }

  return (
    <>
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
                <h3 className="text-sm font-extrabold text-foreground">{connection.jobNameCn}</h3>

                <div className="mt-3 divide-y divide-border/70">
                  {connection.levels.map((level) => (
                    <div
                      key={level.jobLevelId}
                      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
                      data-job-level-id={level.jobLevelId}
                    >
                      {level.heroLevelRequired != null ? (
                        <span className="shrink-0 text-xs font-bold text-muted-foreground">
                          영웅 Lv.{level.heroLevelRequired}
                        </span>
                      ) : null}

                      <ul className="flex flex-wrap items-center gap-3">
                        {level.materials.map((material, materialIndex) => (
                          <li
                            key={`${material.id}-${materialIndex}`}
                            className="flex items-center gap-1.5"
                            data-job-material-id={material.id}
                          >
                            <HeroJobMaterialIcon sourcePath={material.jobMaterial.icon} />
                            <span className="text-sm font-extrabold tabular-nums text-foreground">
                              ×{material.count}
                            </span>
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
