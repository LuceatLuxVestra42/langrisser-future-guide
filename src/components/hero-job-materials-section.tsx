import { useLoaderData } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { getOfficialArmyIconUrlById } from "@/lib/army-icon-assets";
import { getHeroJobMaterialIconUrl } from "@/lib/hero-job-material-icon-assets";
import { resolveHeroJobNameKr } from "@/lib/hero-job-localization";
import { resolveHeroSpJobNameKr } from "@/lib/hero-sp-job-localization";
import { getStaticHeroJobMaterials, type HeroJobMaterialConnection } from "@/lib/hero-job-materials.static";
import { getStaticHeroJobMovement, type HeroJobMovementRow } from "@/lib/hero-job-movement.static";
import { getStaticHeroFinalJobArmy } from "@/lib/hero-final-job-army.static";
import { getStaticHeroFinalJobAttackRange } from "@/lib/hero-final-job-attack-range.static";

function HeroJobMaterialIcon({ sourcePath }: { sourcePath: string | null }) {
  const iconUrl = getHeroJobMaterialIconUrl(sourcePath);
  if (!iconUrl) return null;

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-1 shadow-sm">
      <img src={iconUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-full w-full object-contain" />
    </div>
  );
}

const MOVEMENT_ICON_FILE_BY_TYPE: Record<number, string> = {
  1: "Move_Ride.png",
  2: "Move_Walk.png",
  3: "Move_Water.png",
  4: "Move_Fly.png",
  5: "Move_FieldArmy.png",
};

function getMovementTypeIconUrl(moveType: number) {
  const fileName = MOVEMENT_ICON_FILE_BY_TYPE[moveType];
  if (!fileName) {
    throw new Error(`Unsupported frozen movement type ${moveType}.`);
  }
  return `${import.meta.env.BASE_URL}images/shared/movement/${fileName}`;
}

function getAttackRangeIconUrl() {
  return `${import.meta.env.BASE_URL}images/shared/stats/Icon_Range.png`;
}

function HeroFinalJobArmyIcon({
  armyId,
  armyNameCn,
}: {
  armyId: number;
  armyNameCn: string | null;
}) {
  const officialUrl = getOfficialArmyIconUrlById(armyId);
  const label = armyNameCn ?? `Army ${armyId}`;

  if (officialUrl) {
    return (
      <img
        src={officialUrl}
        alt=""
        aria-hidden="true"
        title={label}
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        className="h-8 w-8 object-contain"
        data-hero-final-job-army-icon="official"
      />
    );
  }

  throw new Error(`Hero final-job army ${armyId} has no validated icon consumer.`);
}

type HeroJobMovementRowView = {
  jobConnectionId: number;
  jobId: number;
  nameCn: string | null;
  rank: number | null;
  moveType: number;
  moveTypeNameKr: string;
  movePoint: number;
  attackRange: number | null;
  armyId: number | null;
  armyNameCn: string | null;
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
      import("@/lib/hero-final-job-army.static"),
    ])
      .then(([
        { getStaticHeroSpJobMovement },
        { getStaticHeroFinalJobAttackRange },
        { getStaticHeroFinalJobArmy },
      ]) => {
        const movement = getStaticHeroSpJobMovement(heroId, jobConnectionId, jobId);
        if (!movement) {
          throw new Error(`Hero ${heroId} SP Job ${jobId} has no frozen movement record.`);
        }
        const attackRange = getStaticHeroFinalJobAttackRange(jobId);
        if (attackRange == null) {
          throw new Error(`Hero ${heroId} SP Job ${jobId} has no frozen attack-range record.`);
        }
        const army = getStaticHeroFinalJobArmy(jobId);
        if (!army) {
          throw new Error(`Hero ${heroId} SP Job ${jobId} has no frozen army record.`);
        }
        if (!cancelled) {
          setRow({
            jobConnectionId: movement.jobConnectionId,
            jobId: movement.jobId,
            nameCn: finalJob.nameCn ?? movement.nameCn,
            rank: null,
            moveType: movement.moveType,
            moveTypeNameKr: movement.moveTypeNameKr,
            movePoint: movement.movePoint,
            attackRange,
            armyId: army.armyId,
            armyNameCn: army.armyNameCn,
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
      data-army-id={row?.armyId ?? ""}
    >
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-foreground">SP 전직 이동 정보</h2>
      </div>

      {row ? (
        <article className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-muted-foreground">SP 전직</p>
              <h3 className="mt-1 truncate text-sm font-extrabold text-foreground">
                {resolveHeroSpJobNameKr({ jobId: row.jobId, nameCn: row.nameCn }) ?? row.nameCn ?? "SP 전직"}
              </h3>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground"
                title={`공격 사거리 ${row.attackRange}`}
                aria-label={`공격 사거리 ${row.attackRange}`}
              >
                <img
                  src={getAttackRangeIconUrl()}
                  alt=""
                  aria-hidden="true"
                  width={20}
                  height={20}
                  loading="lazy"
                  decoding="async"
                  className="h-5 w-5 object-contain"
                />
                <span className="tabular-nums">{row.attackRange}</span>
              </span>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
              <dt className="text-[11px] font-bold text-muted-foreground">이동력</dt>
              <dd className="mt-1 text-base font-extrabold tabular-nums text-foreground">{row.movePoint}</dd>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
              <dt className="text-[11px] font-bold text-muted-foreground">이동타입</dt>
              <dd className="mt-1">
                <img
                  src={getMovementTypeIconUrl(row.moveType)}
                  alt={row.moveTypeNameKr}
                  title={row.moveTypeNameKr}
                  width={32}
                  height={32}
                  loading="lazy"
                  decoding="async"
                  className="h-8 w-8 object-contain"
                />
              </dd>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
              <dt className="text-[11px] font-bold text-muted-foreground">병종</dt>
              <dd className="mt-1">
                <HeroFinalJobArmyIcon armyId={row.armyId!} armyNameCn={row.armyNameCn} />
              </dd>
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

type HeroJobTreeNodeView = {
  jobConnectionId: number;
  jobId: number;
  nameCn: string | null;
  rank: number | null;
};

function HeroJobMaterialsDisclosure({
  connection,
}: {
  connection: HeroJobMaterialConnection | null;
}) {
  const levels = connection?.levels.filter((level) => level.materials.length > 0) ?? [];

  if (levels.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs font-semibold text-muted-foreground">
        표시 가능한 전직 재료 없음
      </div>
    );
  }

  return (
    <details
      className="group mt-3 overflow-hidden rounded-lg border border-border bg-background/80"
      data-hero-job-material-toggle="true"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-extrabold text-foreground marker:content-none">
        <span>전직 재료</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-border px-3 py-3">
        <div className="divide-y divide-border/70">
          {levels.map((level) => (
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
      </div>
    </details>
  );
}

function HeroJobTreeCard({
  row,
  materialConnection,
}: {
  row: HeroJobMovementRow;
  materialConnection: HeroJobMaterialConnection | null;
}) {
  const isFinalJob = row.rank === 4;
  const jobName =
    resolveHeroJobNameKr({ jobId: row.jobId, nameCn: row.nameCn }) ??
    row.nameCn ??
    "전직";
  const army = isFinalJob ? getStaticHeroFinalJobArmy(row.jobId) : null;
  const attackRange = isFinalJob ? getStaticHeroFinalJobAttackRange(row.jobId) : null;

  if (isFinalJob && (!army || attackRange == null)) {
    throw new Error(`Final Job ${row.jobId} is missing frozen army or attack-range metadata.`);
  }

  return (
    <article
      className="rounded-xl border border-border bg-muted/20 p-4 shadow-sm"
      data-job-connection-id={row.jobConnectionId}
      data-job-id={row.jobId}
      data-job-rank={row.rank ?? ""}
      data-move-type={row.moveType}
      data-move-point={row.movePoint}
      data-basic-attack-range={attackRange ?? ""}
      data-army-id={army?.armyId ?? ""}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-sm font-extrabold text-foreground">
          {row.rank == null ? jobName : `T${row.rank} ${jobName}`}
        </h3>
        {isFinalJob && army ? (
          <div
            className="flex shrink-0 items-center"
            title={army.armyNameCn ?? `Army ${army.armyId}`}
            data-hero-final-job-army-mark="true"
          >
            <HeroFinalJobArmyIcon armyId={army.armyId} armyNameCn={army.armyNameCn} />
          </div>
        ) : null}
      </div>

      <HeroJobMaterialsDisclosure connection={materialConnection} />

      {isFinalJob ? (
        <dl className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/70 bg-background/70 px-2.5 py-2">
            <dt className="text-[10px] font-bold text-muted-foreground">사거리</dt>
            <dd className="mt-1 flex items-center gap-1 text-sm font-extrabold text-foreground">
              <img
                src={getAttackRangeIconUrl()}
                alt=""
                aria-hidden="true"
                width={18}
                height={18}
                loading="lazy"
                decoding="async"
                className="h-[18px] w-[18px] object-contain"
              />
              <span className="tabular-nums">{attackRange}</span>
            </dd>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/70 px-2.5 py-2">
            <dt className="text-[10px] font-bold text-muted-foreground">이동타입</dt>
            <dd className="mt-1">
              <img
                src={getMovementTypeIconUrl(row.moveType)}
                alt={row.moveTypeNameKr}
                title={row.moveTypeNameKr}
                width={24}
                height={24}
                loading="lazy"
                decoding="async"
                className="h-6 w-6 object-contain"
              />
            </dd>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/70 px-2.5 py-2">
            <dt className="text-[10px] font-bold text-muted-foreground">이동력</dt>
            <dd className="mt-1 text-sm font-extrabold tabular-nums text-foreground">{row.movePoint}</dd>
          </div>
        </dl>
      ) : null}
    </article>
  );
}

function HeroNormalJobTree({
  heroId,
  allowedJobConnectionIds,
  materialConnections,
}: {
  heroId: number;
  allowedJobConnectionIds?: readonly number[] | undefined;
  materialConnections: HeroJobMaterialConnection[];
}) {
  const { detail } = useLoaderData({ from: "/heroes_/$heroId" });
  const movementRows = getStaticHeroJobMovement(heroId);
  if (!movementRows) {
    throw new Error(`Hero ${heroId} has no frozen job-movement record.`);
  }

  const allowedSet = allowedJobConnectionIds ? new Set(allowedJobConnectionIds) : null;
  const rowByConnectionId = new Map(
    movementRows
      .filter((row) => !allowedSet || allowedSet.has(row.jobConnectionId))
      .map((row) => [row.jobConnectionId, row]),
  );
  const materialByConnectionId = new Map(
    materialConnections.map((connection) => [connection.jobConnectionId, connection]),
  );

  const uniqueJobs = new Map<number, HeroJobTreeNodeView>();
  const t4ParentByConnectionId = new Map<number, number>();

  for (const branch of detail.jobs.branches) {
    const branchJobs = branch.jobs
      .filter((job) =>
        job.jobConnectionId != null &&
        job.jobId != null &&
        job.rank != null &&
        job.rank >= 2 &&
        job.rank <= 4 &&
        (!allowedSet || allowedSet.has(job.jobConnectionId)),
      )
      .map((job) => ({
        jobConnectionId: job.jobConnectionId!,
        jobId: job.jobId!,
        nameCn: job.nameCn,
        rank: job.rank,
      }));

    for (const job of branchJobs) uniqueJobs.set(job.jobConnectionId, job);

    for (let index = 0; index < branchJobs.length - 1; index += 1) {
      const current = branchJobs[index];
      const next = branchJobs[index + 1];
      if (current?.rank === 3 && next?.rank === 4) {
        const existing = t4ParentByConnectionId.get(next.jobConnectionId);
        if (existing != null && existing !== current.jobConnectionId) {
          throw new Error(
            `Hero ${heroId} T4 JobConnection ${next.jobConnectionId} has conflicting T3 parents ${existing}/${current.jobConnectionId}.`,
          );
        }
        t4ParentByConnectionId.set(next.jobConnectionId, current.jobConnectionId);
      }
    }
  }

  const rowsForRank = (rank: number) =>
    [...uniqueJobs.values()]
      .filter((job) => job.rank === rank)
      .map((job) => {
        const row = rowByConnectionId.get(job.jobConnectionId);
        if (!row) {
          throw new Error(`Hero ${heroId} JobConnection ${job.jobConnectionId} is missing frozen movement metadata.`);
        }
        return row;
      })
      .sort((a, b) => a.jobConnectionId - b.jobConnectionId);

  const t2Rows = rowsForRank(2);
  const t3Rows = rowsForRank(3);
  const t4Rows = rowsForRank(4);

  for (const t4 of t4Rows) {
    if (!t4ParentByConnectionId.has(t4.jobConnectionId)) {
      throw new Error(`Hero ${heroId} T4 JobConnection ${t4.jobConnectionId} has no explicit T3 predecessor in the verified job tree.`);
    }
  }

  return (
    <div
      className="mt-5"
      data-hero-job-tree="true"
      data-t2-count={t2Rows.length}
      data-t3-count={t3Rows.length}
      data-t4-count={t4Rows.length}
    >
      {t2Rows.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-3">
          {t2Rows.map((row) => (
            <div key={row.jobConnectionId} className="w-full max-w-[280px]">
              <HeroJobTreeCard
                row={row}
                materialConnection={materialByConnectionId.get(row.jobConnectionId) ?? null}
              />
            </div>
          ))}
        </div>
      ) : null}

      {t2Rows.length > 0 && t3Rows.length > 0 ? (
        <div className="mx-auto h-7 w-px bg-border" aria-hidden="true" />
      ) : null}

      {t3Rows.length > 0 ? (
        <div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3" data-hero-job-tier-branches="true">
          {t3Rows.map((t3) => {
            const children = t4Rows.filter(
              (t4) => t4ParentByConnectionId.get(t4.jobConnectionId) === t3.jobConnectionId,
            );
            return (
              <div key={t3.jobConnectionId} className="min-w-0">
                <HeroJobTreeCard
                  row={t3}
                  materialConnection={materialByConnectionId.get(t3.jobConnectionId) ?? null}
                />
                {children.length > 0 ? (
                  <>
                    <div className="mx-auto h-7 w-px bg-border" aria-hidden="true" />
                    <div className="grid gap-3">
                      {children.map((t4) => (
                        <HeroJobTreeCard
                          key={t4.jobConnectionId}
                          row={t4}
                          materialConnection={materialByConnectionId.get(t4.jobConnectionId) ?? null}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function HeroJobMaterialsSection({
  heroId,
  mode,
  allowedJobConnectionIds,
}: {
  heroId: number;
  mode: "normal" | "sp";
  allowedJobConnectionIds?: readonly number[] | undefined;
}) {
  const { detail } = useLoaderData({ from: "/heroes_/$heroId" });
  const hero = getStaticHeroJobMaterials(heroId);
  if (!hero) {
    throw new Error(`Hero ${heroId} has no frozen job-material record.`);
  }

  const allowedJobConnectionIdSet = allowedJobConnectionIds
    ? new Set(allowedJobConnectionIds)
    : null;
  const materialConnections = hero.connections
    .filter((connection) =>
      allowedJobConnectionIdSet
        ? allowedJobConnectionIdSet.has(connection.jobConnectionId)
        : true,
    )
    .map((connection) => ({
      ...connection,
      levels: connection.levels.filter((level) => level.materials.length > 0),
    }));

  const materialEntryCount = materialConnections.reduce(
    (sum, connection) =>
      sum + connection.levels.reduce((levelSum, level) => levelSum + level.materials.length, 0),
    0,
  );

  if (mode === "sp") {
    if (!detail.sp.released || !detail.sp.finalJob) {
      throw new Error(`Hero ${heroId} requested SP form without a released frozen SP final job.`);
    }
    return <HeroSpJobMovementSection heroId={heroId} finalJob={detail.sp.finalJob} />;
  }

  return (
    <div
      data-hero-job-materials="true"
      data-job-material-entry-count={materialEntryCount}
    >
      <HeroNormalJobTree
        heroId={heroId}
        allowedJobConnectionIds={allowedJobConnectionIds}
        materialConnections={materialConnections}
      />
    </div>
  );
}
