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
  finalJobDetail,
  statDomains,
  heartFetterEffects,
}: {
  heroId: number;
  finalJob: HeroSpFinalJobView;
  finalJobDetail: HeroFinalJobCardDetail;
  statDomains: Record<HeroFinalJobStatKey, HeroFinalJobStatDomain>;
  heartFetterEffects: HeroHeartFetterEffectView[];
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

  if (finalJob.jobId !== finalJobDetail.jobId) {
    throw new Error(
      `Hero ${heroId} SP final-job detail mismatch: ${String(finalJob.jobId)} != ${finalJobDetail.jobId}.`,
    );
  }

  return (
    <div
      className="mt-5 flex justify-center"
      data-hero-sp-job-movement="true"
      data-hero-sp-job-movement-status={row ? "ready" : "loading"}
    >
      {row ? (
        <article
          className="w-full max-w-[340px] rounded-xl border border-border bg-muted/20 p-4 shadow-sm"
          data-job-connection-id={row.jobConnectionId}
          data-job-id={row.jobId}
          data-job-rank="SP"
          data-move-type={row.moveType}
          data-move-point={row.movePoint}
          data-basic-attack-range={row.attackRange ?? ""}
          data-army-id={row.armyId ?? ""}
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-extrabold text-foreground">
              SP {resolveHeroSpJobNameKr({ jobId: row.jobId, nameCn: row.nameCn }) ?? row.nameCn ?? "전직"}
            </h3>
            {row.armyId != null ? (
              <div
                className="flex shrink-0 items-center"
                title={row.armyNameCn ?? `Army ${row.armyId}`}
                data-hero-final-job-army-mark="true"
              >
                <HeroFinalJobArmyIcon armyId={row.armyId} armyNameCn={row.armyNameCn} />
              </div>
            ) : null}
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2" data-hero-final-job-mobility="true">
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
              <dt className="text-[10px] font-bold text-muted-foreground">사거리</dt>
              <dd className="mt-1 flex items-center gap-2 text-base font-extrabold text-foreground">
                <img
                  src={getAttackRangeIconUrl()}
                  alt=""
                  aria-hidden="true"
                  width={24}
                  height={24}
                  loading="lazy"
                  decoding="async"
                  className="h-6 w-6 object-contain"
                />
                <span className="tabular-nums">{row.attackRange}</span>
              </dd>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
              <dt className="text-[10px] font-bold text-muted-foreground">이동방식</dt>
              <dd className="mt-1 flex items-center gap-2 text-base font-extrabold text-foreground">
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
                <span className="tabular-nums">{row.movePoint}</span>
              </dd>
            </div>
          </dl>

          <HeroFinalJobStatGraph
            stats={finalJobDetail.finalStats}
            domains={statDomains}
          />

          <HeroFinalJobHeartFetter
            effects={heartFetterEffects
              .filter((effect) => effect.jobId === row.jobId)
              .sort((a, b) => a.level - b.level || a.skillId - b.skillId)}
          />
        </article>
      ) : (
        <div className="w-full max-w-[340px] rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          SP 전직 정보를 불러오는 중이야.
        </div>
      )}
    </div>
  );
}

type HeroJobTreeNodeView = {
  jobConnectionId: number;
  jobId: number;
  nameCn: string | null;
  rank: number | null;
};

type HeroFinalJobStatKey = "HP" | "ATK" | "INT" | "DEF" | "MDEF" | "DEX";
type HeroFinalJobStatsView = Record<HeroFinalJobStatKey, number | null>;
type HeroFinalJobStatDomain = { min: number; max: number };
type HeroFinalJobCentralBondStatsView = Record<HeroFinalJobStatKey, number | null> | null;
type HeroHeartFetterEffectView = {
  jobId: number;
  level: number;
  skillId: number;
  text: string | null;
  mappingMode: string | null;
};
type HeroFinalJobCardDetail = {
  jobId: number;
  finalStats: HeroFinalJobStatsView;
  centralBondStats: HeroFinalJobCentralBondStatsView;
};

const HERO_FINAL_JOB_STAT_KEYS: HeroFinalJobStatKey[] = ["HP", "ATK", "INT", "DEF", "MDEF", "DEX"];
const HERO_FINAL_JOB_STAT_ICON_BY_KEY: Record<HeroFinalJobStatKey, string> = {
  HP: "Icon_HP.png",
  ATK: "Icon_Attack.png",
  INT: "Icon_Intelligence.png",
  DEF: "Icon_Defense.png",
  MDEF: "Icon_MagicDefense.png",
  DEX: "Icon_Skill.png",
};
const HERO_FINAL_JOB_STAT_LABEL_BY_KEY: Record<HeroFinalJobStatKey, string> = {
  HP: "생명",
  ATK: "공격",
  INT: "지력",
  DEF: "방어",
  MDEF: "마방",
  DEX: "기술",
};

function stripConfigMarkup(value: string | null) {
  if (!value) return "-";
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}

function getJobStatBarPercent(value: number, domain: HeroFinalJobStatDomain) {
  const normalized = (value - domain.min) / (domain.max - domain.min);
  return Math.min(100, Math.max(25, 25 + (75 * normalized)));
}

function HeroJobMaterialsDisclosure({
  connection,
}: {
  connection: HeroJobMaterialConnection | null;
}) {
  const levels = connection?.levels.filter((level) => level.materials.length > 0) ?? [];

  if (levels.length === 0) {
    return (
      <div
        className="mt-3 flex min-h-11 items-center justify-between rounded-lg border border-dashed border-border bg-background/60 px-3 py-2.5 text-xs font-extrabold text-muted-foreground"
        data-hero-job-material-toggle="empty"
      >
        <span>전직 재료</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-35" aria-hidden="true" />
      </div>
    );
  }

  return (
    <details
      className="group mt-3 overflow-hidden rounded-lg border border-border bg-background/80"
      data-hero-job-material-toggle="true"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-extrabold text-foreground marker:content-none">
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

function HeroFinalJobStatGraph({
  stats,
  domains,
}: {
  stats: HeroFinalJobStatsView;
  domains: Record<HeroFinalJobStatKey, HeroFinalJobStatDomain>;
}) {
  return (
    <div
      className="mt-2"
      data-hero-final-job-stat-graph="true"
      data-hero-final-job-stats="true"
    >
      <table className="w-full border-collapse text-sm">
        <tbody>
          <tr>
            {HERO_FINAL_JOB_STAT_KEYS.map((stat) => {
              const value = stats[stat];
              const domain = domains[stat];
              const barPercent = value == null ? 0 : getJobStatBarPercent(value, domain);
              const iconUrl = `${import.meta.env.BASE_URL}images/shared/stats/${HERO_FINAL_JOB_STAT_ICON_BY_KEY[stat]}`;

              return (
                <td
                  key={stat}
                  className="font-bold tabular-nums text-foreground"
                  data-hero-final-job-stat={stat}
                  data-stat-domain-min={domain.min}
                  data-stat-domain-max={domain.max}
                  data-stat-bar-percent={value == null ? undefined : barPercent.toFixed(3)}
                >
                  <span
                    className="inline-flex items-center gap-1.5 whitespace-nowrap"
                    data-hero-final-job-stat-label={stat}
                  >
                    <img
                      src={iconUrl}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className="h-4 w-4 shrink-0 object-contain"
                    />
                    <span>{HERO_FINAL_JOB_STAT_LABEL_BY_KEY[stat]}</span>
                  </span>

                  <div className="relative overflow-hidden">
                    {value == null ? null : (
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{ width: `${barPercent}%` }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10">{value ?? "-"}</span>
                  </div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function HeroFinalJobHeartFetter({
  effects,
}: {
  effects: HeroHeartFetterEffectView[];
}) {
  if (effects.length === 0) {
    return (
      <div
        className="mt-2 rounded-lg border border-dashed border-border bg-background/50 px-3 py-3 text-xs text-muted-foreground"
        data-hero-final-job-heart-fetter="empty"
      >
        표시 가능한 유대 Lv4/Lv7 효과 없음
      </div>
    );
  }

  return (
    <div
      className="mt-2 rounded-lg border border-border/70 bg-background/70 p-3"
      data-hero-final-job-heart-fetter="true"
      data-heart-fetter-effect-count={effects.length}
    >
      <h4 className="text-xs font-extrabold text-foreground">유대 Lv4 / Lv7 효과</h4>
      <div className="mt-2 space-y-2">
        {effects.map((effect) => (
          <div
            key={`${effect.level}-${effect.skillId}`}
            className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2.5"
            data-heart-fetter-level={effect.level}
            data-heart-fetter-skill-id={effect.skillId}
            data-heart-fetter-mapping-mode={effect.mappingMode ?? ""}
          >
            <span className="rounded bg-muted px-2 py-1 text-[10px] font-black text-foreground">
              Lv.{effect.level}
            </span>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{stripConfigMarkup(effect.text)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroJobTreeCard({
  row,
  materialConnection,
  finalJobDetail,
  statDomains,
  heartFetterEffects,
}: {
  row: HeroJobMovementRow;
  materialConnection: HeroJobMaterialConnection | null;
  finalJobDetail: HeroFinalJobCardDetail | null;
  statDomains: Record<HeroFinalJobStatKey, HeroFinalJobStatDomain>;
  heartFetterEffects: HeroHeartFetterEffectView[];
}) {
  const isFinalJob = row.rank === 4;
  const jobName =
    resolveHeroJobNameKr({ jobId: row.jobId, nameCn: row.nameCn }) ??
    row.nameCn ??
    "전직";
  const army = isFinalJob ? getStaticHeroFinalJobArmy(row.jobId) : null;
  const attackRange = isFinalJob ? getStaticHeroFinalJobAttackRange(row.jobId) : null;

  if (isFinalJob && (!army || attackRange == null || !finalJobDetail)) {
    throw new Error(`Final Job ${row.jobId} is missing frozen army, attack-range, or stat metadata.`);
  }

  return (
    <article
      className="w-full rounded-xl border border-border bg-muted/20 p-4 shadow-sm"
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

      {isFinalJob && finalJobDetail ? (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-2" data-hero-final-job-mobility="true">
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
              <dt className="text-[10px] font-bold text-muted-foreground">사거리</dt>
              <dd className="mt-1 flex items-center gap-2 text-base font-extrabold text-foreground">
                <img
                  src={getAttackRangeIconUrl()}
                  alt=""
                  aria-hidden="true"
                  width={24}
                  height={24}
                  loading="lazy"
                  decoding="async"
                  className="h-6 w-6 object-contain"
                />
                <span className="tabular-nums">{attackRange}</span>
              </dd>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
              <dt className="text-[10px] font-bold text-muted-foreground">이동방식</dt>
              <dd className="mt-1 flex items-center gap-2 text-base font-extrabold text-foreground">
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
                <span className="tabular-nums">{row.movePoint}</span>
              </dd>
            </div>
          </dl>

          <HeroFinalJobStatGraph
            stats={finalJobDetail.finalStats}
            domains={statDomains}
          />

          <HeroFinalJobHeartFetter
            effects={heartFetterEffects
              .filter((effect) => effect.jobId === row.jobId)
              .sort((a, b) => a.level - b.level || a.skillId - b.skillId)}
          />
        </>
      ) : null}
    </article>
  );
}

function HeroNormalJobTree({
  heroId,
  allowedJobConnectionIds,
  materialConnections,
  finalJobDetails,
  statDomains,
  heartFetterEffects,
}: {
  heroId: number;
  allowedJobConnectionIds?: readonly number[] | undefined;
  materialConnections: HeroJobMaterialConnection[];
  finalJobDetails: HeroFinalJobCardDetail[];
  statDomains: Record<HeroFinalJobStatKey, HeroFinalJobStatDomain>;
  heartFetterEffects: HeroHeartFetterEffectView[];
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
  const finalJobDetailByJobId = new Map(finalJobDetails.map((detailRow) => [detailRow.jobId, detailRow]));

  const uniqueJobs = new Map<number, HeroJobTreeNodeView>();
  const t4ParentByConnectionId = new Map<number, number>();

  for (const branch of detail.jobs.branches) {
    const branchJobs = branch.jobs
      .filter((job) =>
        job.jobConnectionId != null &&
        job.jobId != null &&
        job.rank != null &&
        job.rank >= 1 &&
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

  const t1Rows = rowsForRank(1);
  const t2Rows = rowsForRank(2);
  const t3Rows = rowsForRank(3);
  const t4Rows = rowsForRank(4);

  for (const t4 of t4Rows) {
    if (!t4ParentByConnectionId.has(t4.jobConnectionId)) {
      throw new Error(`Hero ${heroId} T4 JobConnection ${t4.jobConnectionId} has no explicit T3 predecessor in the verified job tree.`);
    }
    if (!finalJobDetailByJobId.has(t4.jobId)) {
      throw new Error(`Hero ${heroId} T4 Job ${t4.jobId} has no projected final stat detail.`);
    }
  }

  const t3Branches = t3Rows.map((t3) => ({
    t3,
    children: t4Rows.filter(
      (t4) => t4ParentByConnectionId.get(t4.jobConnectionId) === t3.jobConnectionId,
    ),
  }));
  const t3BranchesWithoutT4 = t3Branches.filter((branch) => branch.children.length === 0);
  const t3BranchesWithT4 = t3Branches.filter((branch) => branch.children.length > 0);
  const compactT3Branches = [...t3BranchesWithoutT4, ...t3BranchesWithT4];

  const renderT3Branch = ({
    t3,
    children,
  }: {
    t3: HeroJobMovementRow;
    children: HeroJobMovementRow[];
  }) => (
    <div key={t3.jobConnectionId} className="w-full min-w-0 max-w-[340px] justify-self-center">
      <HeroJobTreeCard
        row={t3}
        materialConnection={materialByConnectionId.get(t3.jobConnectionId) ?? null}
        finalJobDetail={null}
        statDomains={statDomains}
        heartFetterEffects={heartFetterEffects}
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
                finalJobDetail={finalJobDetailByJobId.get(t4.jobId) ?? null}
                statDomains={statDomains}
                heartFetterEffects={heartFetterEffects}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );

  const renderTierRow = (rows: HeroJobMovementRow[], tier: number) =>
    rows.length > 0 ? (
      <div
        className="flex flex-wrap items-start justify-center gap-5"
        data-hero-job-tier={tier}
      >
        {rows.map((row) => (
          <div key={row.jobConnectionId} className="w-full max-w-[340px]">
            <HeroJobTreeCard
              row={row}
              materialConnection={materialByConnectionId.get(row.jobConnectionId) ?? null}
              finalJobDetail={finalJobDetailByJobId.get(row.jobId) ?? null}
              statDomains={statDomains}
              heartFetterEffects={heartFetterEffects}
            />
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div
      className="mt-5"
      data-hero-job-tree="true"
      data-t1-count={t1Rows.length}
      data-t2-count={t2Rows.length}
      data-t3-count={t3Rows.length}
      data-t4-count={t4Rows.length}
    >
      {renderTierRow(t1Rows, 1)}
      {t1Rows.length > 0 && t2Rows.length > 0 ? (
        <div className="mx-auto h-7 w-px bg-border" aria-hidden="true" />
      ) : null}

      {renderTierRow(t2Rows, 2)}
      {t2Rows.length > 0 && t3Rows.length > 0 ? (
        <div className="mx-auto h-7 w-px bg-border" aria-hidden="true" />
      ) : null}

      {t3Rows.length > 0 ? (
        <div data-hero-job-tier-branches="true">
          <div
            className="hidden items-start justify-center gap-5 lg:grid"
            style={{
              gridTemplateColumns: `repeat(${t3Branches.length}, minmax(0, 340px))`,
            }}
            data-hero-job-tree-layout="wide"
          >
            {t3Branches.map(renderT3Branch)}
          </div>

          <div className="hidden md:block lg:hidden" data-hero-job-tree-layout="medium">
            {t3BranchesWithoutT4.length > 0 ? (
              <div className="flex flex-wrap items-start justify-center gap-5">
                {t3BranchesWithoutT4.map(renderT3Branch)}
              </div>
            ) : null}
            {t3BranchesWithT4.length > 0 ? (
              <div
                className={t3BranchesWithoutT4.length > 0 ? "mt-5 grid grid-cols-2 items-start gap-5" : "grid grid-cols-2 items-start gap-5"}
              >
                {t3BranchesWithT4.map(renderT3Branch)}
              </div>
            ) : null}
          </div>

          <div className="grid items-start gap-5 md:hidden" data-hero-job-tree-layout="narrow">
            {compactT3Branches.map(renderT3Branch)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HeroJobMaterialsSection({
  heroId,
  mode,
  allowedJobConnectionIds,
  finalJobDetails,
  statDomains,
  heartFetterEffects,
}: {
  heroId: number;
  mode: "normal" | "sp";
  allowedJobConnectionIds?: readonly number[] | undefined;
  finalJobDetails: HeroFinalJobCardDetail[];
  statDomains: Record<HeroFinalJobStatKey, HeroFinalJobStatDomain>;
  heartFetterEffects: HeroHeartFetterEffectView[];
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
    const jobId = detail.sp.finalJob.jobId;
    const finalJobDetail = finalJobDetails.find((row) => row.jobId === jobId);
    if (!finalJobDetail) {
      throw new Error(`Hero ${heroId} SP Job ${String(jobId)} has no projected final stat detail.`);
    }
    return (
      <HeroSpJobMovementSection
        heroId={heroId}
        finalJob={detail.sp.finalJob}
        finalJobDetail={finalJobDetail}
        statDomains={statDomains}
        heartFetterEffects={heartFetterEffects}
      />
    );
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
        finalJobDetails={finalJobDetails}
        statDomains={statDomains}
        heartFetterEffects={heartFetterEffects}
      />
    </div>
  );
}
