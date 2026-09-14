'use strict';
const fs = require('fs');

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first === -1) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(needle, first + needle.length) !== -1) throw new Error(`Non-unique patch anchor: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const serverPath = 'src/lib/hero-detail-stage5.server.ts';
let server = fs.readFileSync(serverPath, 'utf8');

server = replaceOnce(
  server,
  `type Stage6Sp = {\n`,
  `type Stage6SpGoods = {\n  GoodsType?: number | null;\n  Id?: number | null;\n  Count?: number | null;\n};\n\ntype Stage6SpMission = {\n  id?: number | null;\n  stage?: string | null;\n  titleCn?: string | null;\n  descCn?: string | null;\n  missionType?: number | null;\n  condition?: {\n    kind?: string | null;\n    submitSetId?: number | null;\n    items?: Stage6SpGoods[] | null;\n    equipmentId?: number | null;\n    requiredLevel?: number | null;\n    activityType?: number | null;\n    routeType?: number | null;\n    stageId?: number | null;\n    clearCount?: number | null;\n    requiredHeroIds?: number[] | null;\n    stageIds?: number[] | null;\n  } | null;\n};\n\ntype Stage6Sp = {\n`,
  'server SP mission types',
);

server = replaceOnce(
  server,
  `  finalDisplayStats?: Stage6JobConnection["finalDisplayStats"];\n  secondStageRewards?: {\n`,
  `  finalDisplayStats?: Stage6JobConnection["finalDisplayStats"];\n  missions?: {\n    firstStage?: Stage6SpMission[] | null;\n    secondStage?: Stage6SpMission[] | null;\n  } | null;\n  secondStageRewards?: {\n`,
  'server Stage6Sp missions field',
);

server = replaceOnce(
  server,
  `function projectCentralBondStats(finalDisplayStats: Stage6JobConnection["finalDisplayStats"]) {\n`,
  `function projectSpGoods(goods: Stage6SpGoods | null | undefined) {\n  if (!goods) return null;\n  return {\n    goodsType: Number.isInteger(goods.GoodsType) ? Number(goods.GoodsType) : null,\n    sourceId: Number.isInteger(goods.Id) ? Number(goods.Id) : null,\n    count: Number.isInteger(goods.Count) ? Number(goods.Count) : null,\n  };\n}\n\nfunction projectSpMission(mission: Stage6SpMission | null | undefined) {\n  if (!mission || !Number.isInteger(mission.id)) return null;\n  const condition = mission.condition;\n  const items = Array.isArray(condition?.items)\n    ? condition.items\n        .map(projectSpGoods)\n        .filter((item): item is NonNullable<typeof item> => item !== null)\n    : [];\n  return {\n    missionId: Number(mission.id),\n    phase: mission.stage ?? null,\n    titleCn: mission.titleCn ?? null,\n    descCn: mission.descCn ?? null,\n    missionType: Number.isInteger(mission.missionType) ? Number(mission.missionType) : null,\n    condition: {\n      kind: condition?.kind ?? null,\n      submitSetId: Number.isInteger(condition?.submitSetId) ? Number(condition?.submitSetId) : null,\n      equipmentId: Number.isInteger(condition?.equipmentId) ? Number(condition?.equipmentId) : null,\n      requiredLevel: Number.isInteger(condition?.requiredLevel) ? Number(condition?.requiredLevel) : null,\n      activityType: Number.isInteger(condition?.activityType) ? Number(condition?.activityType) : null,\n      routeType: Number.isInteger(condition?.routeType) ? Number(condition?.routeType) : null,\n      stageId: Number.isInteger(condition?.stageId) ? Number(condition?.stageId) : null,\n      clearCount: Number.isInteger(condition?.clearCount) ? Number(condition?.clearCount) : null,\n      requiredHeroIds: Array.isArray(condition?.requiredHeroIds)\n        ? condition.requiredHeroIds.filter((value): value is number => Number.isInteger(value)).map(Number)\n        : [],\n      stageIds: Array.isArray(condition?.stageIds)\n        ? condition.stageIds.filter((value): value is number => Number.isInteger(value)).map(Number)\n        : [],\n      items,\n    },\n  };\n}\n\nfunction projectCentralBondStats(finalDisplayStats: Stage6JobConnection["finalDisplayStats"]) {\n`,
  'server SP mission projector',
);

const rewardBlock = `  const spRewardSkills = Array.isArray(shard.sp?.secondStageRewards?.skills)\n    ? shard.sp.secondStageRewards.skills\n        .map(projectSpRewardSkill)\n        .filter((skill): skill is NonNullable<typeof skill> => skill !== null)\n    : [];\n`;
server = replaceOnce(
  server,
  rewardBlock,
  `${rewardBlock}  const spFirstStageMissions = Array.isArray(shard.sp?.missions?.firstStage)\n    ? shard.sp.missions.firstStage\n        .map(projectSpMission)\n        .filter((mission): mission is NonNullable<typeof mission> => mission !== null)\n    : [];\n  const spSecondStageMissions = Array.isArray(shard.sp?.missions?.secondStage)\n    ? shard.sp.missions.secondStage\n        .map(projectSpMission)\n        .filter((mission): mission is NonNullable<typeof mission> => mission !== null)\n    : [];\n`,
  'server SP mission projection arrays',
);

server = replaceOnce(
  server,
  `      finalJob: spFinalJob,\n      secondStageRewards: {\n`,
  `      finalJob: spFinalJob,\n      missions: {\n        firstStage: spFirstStageMissions,\n        secondStage: spSecondStageMissions,\n      },\n      secondStageRewards: {\n`,
  'server SP mission output',
);

fs.writeFileSync(serverPath, server);

const routePath = 'src/routes/heroes_.$heroId.tsx';
let route = fs.readFileSync(routePath, 'utf8');

route = replaceOnce(
  route,
  `        </section>\n\n        <HeroSoldierCommandSection soldierCommand={soldierCommand} />\n`,
  `        </section>\n\n        {detail.sp.released ? <HeroSpMissionSection missions={detail.sp.missions} /> : null}\n\n        <HeroSoldierCommandSection soldierCommand={soldierCommand} />\n`,
  'route SP mission section insertion',
);

route = replaceOnce(
  route,
  `function formatBondCondition(condition: { requiredHero: { heroId: number | null; nameKr: string | null; nameCn: string | null; nameEn: string | null } | null; mission: { missionId: number | null; title: string | null; desc: string | null; missionType: number | null } | null; stage: { stageId: number | null; nameCn: string | null } | null; favorability: { targetHeroId: number | null; targetHeroNameKr: string | null; targetHeroNameCn: string | null; targetHeroNameEn: string | null; requiredLevel: number | null } | null }) {\n`,
  `type SpMissionMaterialView = { goodsType: number | null; sourceId: number | null; count: number | null };\ntype SpMissionView = {\n  missionId: number;\n  phase: string | null;\n  titleCn: string | null;\n  descCn: string | null;\n  missionType: number | null;\n  condition: {\n    kind: string | null;\n    submitSetId: number | null;\n    equipmentId: number | null;\n    requiredLevel: number | null;\n    activityType: number | null;\n    routeType: number | null;\n    stageId: number | null;\n    clearCount: number | null;\n    requiredHeroIds: number[];\n    stageIds: number[];\n    items: SpMissionMaterialView[];\n  };\n};\n\nfunction HeroSpMissionSection({ missions }: { missions: { firstStage: SpMissionView[]; secondStage: SpMissionView[] } }) {\n  if (missions.firstStage.length === 0 && missions.secondStage.length === 0) return null;\n  return (\n    <section\n      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"\n      data-hero-sp-missions="true"\n      data-sp-first-stage-count={missions.firstStage.length}\n      data-sp-second-stage-count={missions.secondStage.length}\n    >\n      <SectionTitle title="SP 전직 미션" />\n      <p className="mt-2 text-xs leading-5 text-muted-foreground">확정된 SP 미션 순서와 조건을 그대로 표시해. 원문 미션 문구는 현재 frozen Hero consumer의 중국어 표시를 유지해.</p>\n      <div className="mt-5 grid gap-4 lg:grid-cols-2">\n        <SpMissionPhase title="1차 전직" missions={missions.firstStage} />\n        <SpMissionPhase title="2차 전직" missions={missions.secondStage} />\n      </div>\n    </section>\n  );\n}\n\nfunction SpMissionPhase({ title, missions }: { title: string; missions: SpMissionView[] }) {\n  return (\n    <div className="rounded-xl border border-border bg-muted/10 p-3 sm:p-4">\n      <div className="flex items-center justify-between gap-3">\n        <h3 className="text-sm font-bold text-foreground">{title}</h3>\n        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{missions.length}개</span>\n      </div>\n      <ol className="mt-3 space-y-2">\n        {missions.map((mission, index) => (\n          <li key={mission.missionId} className="rounded-lg border border-border bg-background px-3 py-3" data-sp-mission-id={mission.missionId}>\n            <div className="flex flex-wrap items-center gap-2">\n              <span className="text-xs font-black tabular-nums text-muted-foreground">{index + 1}</span>\n              <span className="text-sm font-bold text-foreground">{mission.titleCn ?? `Mission ${mission.missionId}`}</span>\n              <span className="ml-auto rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">#{mission.missionId}</span>\n            </div>\n            {mission.descCn ? (\n              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(mission.descCn)}</p>\n            ) : null}\n            {mission.condition.items.length > 0 ? (\n              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="필요 재료">\n                {mission.condition.items.map((item, itemIndex) => (\n                  <span key={`${mission.missionId}-material-${itemIndex}`} className="rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] font-semibold text-foreground">\n                    {formatSpMissionMaterial(item)}\n                  </span>\n                ))}\n              </div>\n            ) : null}\n            {formatSpMissionStructuredCondition(mission) ? (\n              <p className="mt-2 text-xs font-semibold leading-5 text-foreground">{formatSpMissionStructuredCondition(mission)}</p>\n            ) : null}\n            {!mission.descCn && mission.condition.items.length === 0 && !formatSpMissionStructuredCondition(mission) ? (\n              <p className="mt-2 text-xs font-semibold text-muted-foreground">SP 단계 완료</p>\n            ) : null}\n          </li>\n        ))}\n      </ol>\n    </div>\n  );\n}\n\nfunction formatSpMissionMaterial(item: SpMissionMaterialView) {\n  const namespace = item.sourceId == null\n    ? `GoodsType ${item.goodsType ?? "?"}`\n    : `GoodsType ${item.goodsType ?? "?"} / ID ${item.sourceId}`;\n  return `${namespace} ×${item.count ?? "?"}`;\n}\n\nfunction formatSpMissionStructuredCondition(mission: SpMissionView) {\n  const condition = mission.condition;\n  if (condition.kind === "EXCLUSIVE_EQUIPMENT_LEVEL") {\n    return `전용장비 ID ${condition.equipmentId ?? "?"} · Lv.${condition.requiredLevel ?? "?"} 달성`;\n  }\n  if (condition.kind === "CLEAR_ACTIVITY_STAGE_WITH_HEROES" || condition.kind === "CLEAR_ACTIVITY_STAGE_SOLO_OR_SPECIFIED") {\n    const heroPart = condition.requiredHeroIds.length > 0 ? `Hero ${condition.requiredHeroIds.join(", ")} 포함` : "지정 영웅 조건";\n    const stagePart = condition.stageIds.length > 0 ? `대상 Stage ${condition.stageIds.join(", ")}` : "대상 Stage 확인";\n    return `${heroPart} · ${stagePart} · ${condition.clearCount ?? 1}회 클리어`;\n  }\n  if (condition.kind === "CLEAR_STORY_STAGE_WITH_HEROES") {\n    const heroPart = condition.requiredHeroIds.length > 0 ? `Hero ${condition.requiredHeroIds.join(", ")} 포함` : "지정 영웅 조건";\n    return `${heroPart} · Stage ${condition.stageId ?? "?"} · ${condition.clearCount ?? 1}회 클리어`;\n  }\n  return null;\n}\n\nfunction formatBondCondition(condition: { requiredHero: { heroId: number | null; nameKr: string | null; nameCn: string | null; nameEn: string | null } | null; mission: { missionId: number | null; title: string | null; desc: string | null; missionType: number | null } | null; stage: { stageId: number | null; nameCn: string | null } | null; favorability: { targetHeroId: number | null; targetHeroNameKr: string | null; targetHeroNameCn: string | null; targetHeroNameEn: string | null; requiredLevel: number | null } | null }) {\n`,
  'route SP mission components',
);

fs.writeFileSync(routePath, route);

for (const [path, text] of [[serverPath, server], [routePath, route]]) {
  if (!text.includes('SP 전직 미션') && path === routePath) throw new Error('SP mission UI marker missing');
  if (text.includes('data/generated/hero-page-stage5-4-sp.v1.json')) throw new Error(`Forbidden Stage 5 runtime read introduced in ${path}`);
}

console.log('Applied scoped Hero SP mission projection and presentation patch.');
