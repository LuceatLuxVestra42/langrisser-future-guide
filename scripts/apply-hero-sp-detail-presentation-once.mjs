import fs from "node:fs";

const libPath = "src/lib/hero-detail-stage5.server.ts";
const routePath = "src/routes/heroes_.$heroId.tsx";

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  return source.replace(before, after);
}

let lib = fs.readFileSync(libPath, "utf8");
let route = fs.readFileSync(routePath, "utf8");

lib = replaceOnce(
  lib,
  `type FeatureBlock = {\n  status?: string | null;\n} | null | undefined;\n`,
  `type FeatureBlock = {\n  status?: string | null;\n} | null | undefined;\n\ntype Stage6SpMission = {\n  id?: number;\n  stage?: string | null;\n  titleCn?: string | null;\n  descCn?: string | null;\n  missionType?: number | null;\n  condition?: {\n    kind?: string | null;\n    items?: Array<{\n      GoodsType?: number;\n      Id?: number;\n      Count?: number;\n    }> | null;\n  } | null;\n};\n\ntype Stage6Sp = {\n  status?: string | null;\n  job?: {\n    jobConnectionId?: number | null;\n    jobId?: number | null;\n    nameCn?: string | null;\n  } | null;\n  missions?: {\n    firstStage?: Stage6SpMission[] | null;\n    secondStage?: Stage6SpMission[] | null;\n  } | null;\n  secondStageRewards?: {\n    buff?: {\n      buffId?: number | null;\n      nameCn?: string | null;\n      descCn?: string | null;\n    } | null;\n    skills?: Array<{\n      skillId?: number | null;\n      nameCn?: string | null;\n      descCn?: string | null;\n    }> | null;\n    soldiers?: Array<{\n      soldierId?: number | null;\n      nameKr?: string | null;\n      nameCn?: string | null;\n    }> | null;\n  } | null;\n} | null | undefined;\n`,
  "insert Stage6 SP types",
);

lib = replaceOnce(lib, "  sp?: FeatureBlock;", "  sp?: Stage6Sp;", "bind Stage6 SP type");

lib = replaceOnce(
  lib,
  `function projectStage6Shard(shard: Stage6HeroShard) {`,
  `function projectSp(sp: Stage6Sp) {\n  const projectMission = (mission: Stage6SpMission) => ({\n    missionId: Number.isInteger(mission.id) ? Number(mission.id) : null,\n    stage: mission.stage ?? null,\n    titleCn: mission.titleCn ?? null,\n    descCn: mission.descCn ?? null,\n    missionType: Number.isInteger(mission.missionType) ? Number(mission.missionType) : null,\n    conditionKind: mission.condition?.kind ?? null,\n    materials: Array.isArray(mission.condition?.items)\n      ? mission.condition.items.map((item) => ({\n          goodsType: Number.isInteger(item.GoodsType) ? Number(item.GoodsType) : null,\n          sourceId: Number.isInteger(item.Id) ? Number(item.Id) : null,\n          count: Number.isInteger(item.Count) ? Number(item.Count) : null,\n        }))\n      : [],\n  });\n  const firstStage = Array.isArray(sp?.missions?.firstStage) ? sp.missions.firstStage.map(projectMission) : [];\n  const secondStage = Array.isArray(sp?.missions?.secondStage) ? sp.missions.secondStage.map(projectMission) : [];\n  const rewardSkills = Array.isArray(sp?.secondStageRewards?.skills)\n    ? sp.secondStageRewards.skills.map((skill) => ({\n        skillId: Number.isInteger(skill.skillId) ? Number(skill.skillId) : null,\n        nameCn: skill.nameCn ?? null,\n        descCn: skill.descCn ?? null,\n      }))\n    : [];\n  const rewardSoldiers = Array.isArray(sp?.secondStageRewards?.soldiers)\n    ? sp.secondStageRewards.soldiers.map((soldier) => ({\n        soldierId: Number.isInteger(soldier.soldierId) ? Number(soldier.soldierId) : null,\n        nameKr: soldier.nameKr ?? null,\n        nameCn: soldier.nameCn ?? null,\n      }))\n    : [];\n  const buff = sp?.secondStageRewards?.buff;\n\n  return {\n    status: sp?.status ?? null,\n    released: isReleased(sp),\n    job: sp?.job\n      ? {\n          jobConnectionId: Number.isInteger(sp.job.jobConnectionId) ? Number(sp.job.jobConnectionId) : null,\n          jobId: Number.isInteger(sp.job.jobId) ? Number(sp.job.jobId) : null,\n          nameCn: sp.job.nameCn ?? null,\n        }\n      : null,\n    missions: {\n      firstStage,\n      secondStage,\n      totalCount: firstStage.length + secondStage.length,\n    },\n    secondStageRewards: {\n      buff: buff\n        ? {\n            buffId: Number.isInteger(buff.buffId) ? Number(buff.buffId) : null,\n            nameCn: buff.nameCn ?? null,\n            descCn: buff.descCn ?? null,\n          }\n        : null,\n      skills: rewardSkills,\n      soldiers: rewardSoldiers,\n    },\n  };\n}\n\nfunction projectStage6Shard(shard: Stage6HeroShard) {`,
  "insert SP projection",
);

lib = replaceOnce(
  lib,
  `  const centralDiscipline = projectCentralDiscipline(shard.centralDiscipline);\n  const soldierIds = Array.isArray(shard.soldiers?.ids) ? shard.soldiers.ids : [];`,
  `  const centralDiscipline = projectCentralDiscipline(shard.centralDiscipline);\n  const sp = projectSp(shard.sp);\n  const soldierIds = Array.isArray(shard.soldiers?.ids) ? shard.soldiers.ids : [];`,
  "project SP from shard",
);

lib = replaceOnce(
  lib,
  `    centralDiscipline,\n    soldiers: { count: soldierIds.length, ids: soldierIds },\n    systems: {`,
  `    centralDiscipline,\n    sp,\n    soldiers: { count: soldierIds.length, ids: soldierIds },\n    systems: {`,
  "expose projected SP",
);

lib = replaceOnce(
  lib,
  `      spStatus: shard.sp?.status ?? null,\n      spReleased: isReleased(shard.sp),`,
  `      spStatus: sp.status,\n      spReleased: sp.released,`,
  "reuse projected SP status",
);

route = replaceOnce(
  route,
  `        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">\n          <SectionTitle icon={<Database className="h-4 w-4" aria-hidden="true" />} title="상세 데이터 상태" />`,
  `        <HeroSpSection sp={detail.sp} />\n\n        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">\n          <SectionTitle icon={<Database className="h-4 w-4" aria-hidden="true" />} title="상세 데이터 상태" />`,
  "mount Hero SP section",
);

route = replaceOnce(
  route,
  `type SkillView = { skillId: number; nameCn: string | null; desc: string | null; iconPath: string | null; displayType: string | null; cooldown: string | null; range: string | null; areaOrTarget: string | null };`,
  `type HeroSpView = {\n  status: string | null;\n  released: boolean;\n  job: { jobConnectionId: number | null; jobId: number | null; nameCn: string | null } | null;\n  missions: {\n    firstStage: Array<{ missionId: number | null; stage: string | null; titleCn: string | null; descCn: string | null; missionType: number | null; conditionKind: string | null; materials: Array<{ goodsType: number | null; sourceId: number | null; count: number | null }> }>;\n    secondStage: Array<{ missionId: number | null; stage: string | null; titleCn: string | null; descCn: string | null; missionType: number | null; conditionKind: string | null; materials: Array<{ goodsType: number | null; sourceId: number | null; count: number | null }> }>;\n    totalCount: number;\n  };\n  secondStageRewards: {\n    buff: { buffId: number | null; nameCn: string | null; descCn: string | null } | null;\n    skills: Array<{ skillId: number | null; nameCn: string | null; descCn: string | null }>;\n    soldiers: Array<{ soldierId: number | null; nameKr: string | null; nameCn: string | null }>;\n  };\n};\n\ntype SkillView = { skillId: number; nameCn: string | null; desc: string | null; iconPath: string | null; displayType: string | null; cooldown: string | null; range: string | null; areaOrTarget: string | null };`,
  "insert Hero SP view type",
);

route = replaceOnce(
  route,
  `function SkillCard({ skill, sourceLabel }: { skill: SkillView; sourceLabel: string }) {`,
  `function HeroSpSection({ sp }: { sp: HeroSpView }) {\n  if (!sp.released) return null;\n  const groups = [\n    { key: "first", title: "SP 1부", rows: sp.missions.firstStage },\n    { key: "second", title: "SP 2부", rows: sp.missions.secondStage },\n  ] as const;\n\n  return (\n    <section data-hero-sp-detail="true" className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">\n      <div className="flex flex-wrap items-start justify-between gap-3">\n        <div>\n          <SectionTitle icon={<Sparkles className="h-4 w-4" aria-hidden="true" />} title="SP 전직" />\n          <p className="mt-2 text-sm text-muted-foreground">Stage 6 frozen SP 블록의 전직, 미션, 2단계 보상을 그대로 표시해. MissionType이나 Goods ID 의미를 새로 추론하지 않아.</p>\n        </div>\n        <div className="flex flex-wrap gap-2 text-xs">\n          <span className="rounded-full bg-muted px-3 py-1.5 font-semibold text-foreground">미션 {sp.missions.totalCount}개</span>\n          {sp.job?.nameCn ? <span className="rounded-full bg-muted px-3 py-1.5 font-semibold text-foreground">{sp.job.nameCn}</span> : null}\n        </div>\n      </div>\n\n      {sp.job ? (\n        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">\n          <p className="text-[11px] font-bold text-muted-foreground">SP 직업</p>\n          <p className="mt-1 font-bold text-foreground">{sp.job.nameCn ?? `Job ${sp.job.jobId ?? "?"}`}</p>\n          <p className="mt-1 text-xs text-muted-foreground">Job #{sp.job.jobId ?? "-"} · Connection #{sp.job.jobConnectionId ?? "-"}</p>\n        </div>\n      ) : null}\n\n      <div className="mt-5 grid gap-4 xl:grid-cols-2">\n        {groups.map((group) => (\n          <div key={group.key} className="rounded-2xl border border-border bg-muted/10 p-4 sm:p-5">\n            <div className="flex items-center justify-between gap-3">\n              <h3 className="font-bold text-foreground">{group.title}</h3>\n              <span className="text-xs font-semibold text-muted-foreground">{group.rows.length}개</span>\n            </div>\n            <div className="mt-3 space-y-2">\n              {group.rows.map((mission, index) => (\n                <article key={`${group.key}-${mission.missionId ?? index}`} className="rounded-xl border border-border bg-background p-3.5">\n                  <div className="flex flex-wrap items-start justify-between gap-2">\n                    <div>\n                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{index + 1}단계</p>\n                      <h4 className="mt-1 text-sm font-bold text-foreground">{mission.titleCn ?? `Mission ${mission.missionId ?? "?"}`}</h4>\n                    </div>\n                    {mission.missionId != null ? <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">#{mission.missionId}</span> : null}\n                  </div>\n                  {mission.descCn ? <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">{stripConfigMarkup(mission.descCn)}</p> : null}\n                  {mission.materials.length > 0 ? (\n                    <div className="mt-2 flex flex-wrap gap-1.5">\n                      {mission.materials.map((material, materialIndex) => (\n                        <span key={`${mission.missionId ?? index}-material-${materialIndex}`} className="rounded-md border border-border bg-muted/30 px-2 py-1 text-[10px] font-semibold text-muted-foreground">\n                          GoodsType {material.goodsType ?? "?"}{material.sourceId != null ? ` / ID ${material.sourceId}` : ""} ×{material.count ?? "?"}\n                        </span>\n                      ))}\n                    </div>\n                  ) : null}\n                </article>\n              ))}\n            </div>\n          </div>\n        ))}\n      </div>\n\n      <div className="mt-5 rounded-2xl border border-border bg-muted/10 p-4 sm:p-5">\n        <h3 className="font-bold text-foreground">SP 2부 보상</h3>\n        <div className="mt-3 grid gap-3 lg:grid-cols-2">\n          {sp.secondStageRewards.buff ? (\n            <article className="rounded-xl border border-border bg-background p-4">\n              <p className="text-[11px] font-bold text-muted-foreground">보상 버프</p>\n              <p className="mt-1 font-bold text-foreground">{sp.secondStageRewards.buff.nameCn ?? `Buff ${sp.secondStageRewards.buff.buffId ?? "?"}`}</p>\n              {sp.secondStageRewards.buff.descCn ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{stripConfigMarkup(sp.secondStageRewards.buff.descCn)}</p> : null}\n            </article>\n          ) : null}\n          {sp.secondStageRewards.skills.map((skill, index) => (\n            <article key={`sp-reward-skill-${skill.skillId ?? index}`} className="rounded-xl border border-border bg-background p-4">\n              <p className="text-[11px] font-bold text-muted-foreground">보상 스킬</p>\n              <p className="mt-1 font-bold text-foreground">{skill.nameCn ?? `Skill ${skill.skillId ?? "?"}`}</p>\n              {skill.descCn ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{stripConfigMarkup(skill.descCn)}</p> : null}\n            </article>\n          ))}\n        </div>\n        {sp.secondStageRewards.soldiers.length > 0 ? (\n          <div className="mt-3 flex flex-wrap gap-2 text-xs">\n            <span className="font-bold text-muted-foreground">추가 용병</span>\n            {sp.secondStageRewards.soldiers.map((soldier, index) => (\n              <span key={`sp-reward-soldier-${soldier.soldierId ?? index}`} className="rounded-md bg-background px-2 py-1 font-semibold text-foreground">{soldier.nameKr ?? soldier.nameCn ?? `Soldier ${soldier.soldierId ?? "?"}`}</span>\n            ))}\n          </div>\n        ) : null}\n      </div>\n    </section>\n  );\n}\n\nfunction SkillCard({ skill, sourceLabel }: { skill: SkillView; sourceLabel: string }) {`,
  "insert Hero SP section component",
);

fs.writeFileSync(libPath, lib);
fs.writeFileSync(routePath, route);
console.log("Applied scoped Hero SP detail presentation patch.");
