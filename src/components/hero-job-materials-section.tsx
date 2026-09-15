import { getStaticHeroJobAttackRanges } from "@/lib/hero-job-attack-range.static";
import { getStaticHeroJobMaterials } from "@/lib/hero-job-materials.static";

function stripConfigMarkup(value: string) {
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}

export function HeroJobMaterialsSection({ heroId }: { heroId: number }) {
  const hero = getStaticHeroJobMaterials(heroId);
  if (!hero) {
    throw new Error(`Hero ${heroId} has no frozen job-material record.`);
  }
  const attackRanges = getStaticHeroJobAttackRanges(heroId);
  if (!attackRanges) {
    throw new Error(`Hero ${heroId} has no frozen job attack-range record.`);
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
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-job-materials="true"
      data-job-material-entry-count={materialEntryCount}
      data-job-attack-range-count={attackRanges.length}
    >
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-foreground">전직 정보</h2>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          검증된 중국 서버 ConfigData 기준 · 전직별 일반공격 사거리와 승급 재료
        </p>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-extrabold text-foreground">전직별 일반공격 사거리</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {attackRanges.map((job) => (
            <div
              key={job.jobConnectionId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5"
              data-job-attack-range="true"
              data-job-connection-id={job.jobConnectionId}
              data-job-id={job.jobId}
              data-basic-attack-range={job.basicAttackRange}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  {job.nameCn ?? job.nameEn ?? `Job ${job.jobId}`}
                </p>
                {job.rank != null ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Rank {job.rank}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">사거리</p>
                <p className="text-base font-extrabold tabular-nums text-foreground">{job.basicAttackRange}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-extrabold text-foreground">전직 재료</h3>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">재료명은 중국 서버 원문</p>
      </div>

      {connections.length > 0 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
  );
}
