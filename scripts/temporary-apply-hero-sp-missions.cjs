'use strict';
const fs = require('fs');

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first === -1) throw new Error('Missing patch anchor: ' + label);
  if (source.indexOf(needle, first + needle.length) !== -1) throw new Error('Non-unique patch anchor: ' + label);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const serverPath = 'src/lib/hero-detail-stage5.server.ts';
let server = fs.readFileSync(serverPath, 'utf8');

server = replaceOnce(
  server,
  'type Stage6Sp = {\n',
  [
    'type Stage6SpMission = {',
    '  id?: number | null;',
    '  stage?: string | null;',
    '  titleCn?: string | null;',
    '  descCn?: string | null;',
    '  missionType?: number | null;',
    '  condition?: {',
    '    kind?: string | null;',
    '    items?: Array<{ GoodsType?: number | null; Id?: number | null; Count?: number | null }> | null;',
    '    equipmentId?: number | null;',
    '    requiredLevel?: number | null;',
    '    requiredHeroIds?: number[] | null;',
    '    stageId?: number | null;',
    '    stageIds?: number[] | null;',
    '    clearCount?: number | null;',
    '  } | null;',
    '};',
    '',
    'type Stage6Sp = {',
    '',
  ].join('\n'),
  'server SP mission type',
);

server = replaceOnce(
  server,
  '  finalDisplayStats?: Stage6JobConnection["finalDisplayStats"];\n  secondStageRewards?: {\n',
  [
    '  finalDisplayStats?: Stage6JobConnection["finalDisplayStats"];',
    '  missions?: {',
    '    firstStage?: Stage6SpMission[] | null;',
    '    secondStage?: Stage6SpMission[] | null;',
    '  } | null;',
    '  secondStageRewards?: {',
    '',
  ].join('\n'),
  'server Stage6Sp missions field',
);

const rewardBlock = [
  '  const spRewardSkills = Array.isArray(shard.sp?.secondStageRewards?.skills)',
  '    ? shard.sp.secondStageRewards.skills',
  '        .map(projectSpRewardSkill)',
  '        .filter((skill): skill is NonNullable<typeof skill> => skill !== null)',
  '    : [];',
  '',
].join('\n');

server = replaceOnce(
  server,
  rewardBlock,
  rewardBlock + [
    '  const projectSpMission = (mission: Stage6SpMission) => ({',
    '    missionId: Number.isInteger(mission.id) ? Number(mission.id) : null,',
    '    phase: mission.stage ?? null,',
    '    titleCn: mission.titleCn ?? null,',
    '    descCn: mission.descCn ?? null,',
    '    missionType: Number.isInteger(mission.missionType) ? Number(mission.missionType) : null,',
    '    condition: {',
    '      kind: mission.condition?.kind ?? null,',
    '      items: Array.isArray(mission.condition?.items)',
    '        ? mission.condition.items.map((item) => ({',
    '            goodsType: Number.isInteger(item.GoodsType) ? Number(item.GoodsType) : null,',
    '            sourceId: Number.isInteger(item.Id) ? Number(item.Id) : null,',
    '            count: Number.isInteger(item.Count) ? Number(item.Count) : null,',
    '          }))',
    '        : [],',
    '      equipmentId: Number.isInteger(mission.condition?.equipmentId) ? Number(mission.condition?.equipmentId) : null,',
    '      requiredLevel: Number.isInteger(mission.condition?.requiredLevel) ? Number(mission.condition?.requiredLevel) : null,',
    '      requiredHeroIds: Array.isArray(mission.condition?.requiredHeroIds)',
    '        ? mission.condition.requiredHeroIds.filter((value): value is number => Number.isInteger(value)).map(Number)',
    '        : [],',
    '      stageId: Number.isInteger(mission.condition?.stageId) ? Number(mission.condition?.stageId) : null,',
    '      stageIds: Array.isArray(mission.condition?.stageIds)',
    '        ? mission.condition.stageIds.filter((value): value is number => Number.isInteger(value)).map(Number)',
    '        : [],',
    '      clearCount: Number.isInteger(mission.condition?.clearCount) ? Number(mission.condition?.clearCount) : null,',
    '    },',
    '  });',
    '  const spFirstStageMissions = Array.isArray(shard.sp?.missions?.firstStage)',
    '    ? shard.sp.missions.firstStage.map(projectSpMission)',
    '    : [];',
    '  const spSecondStageMissions = Array.isArray(shard.sp?.missions?.secondStage)',
    '    ? shard.sp.missions.secondStage.map(projectSpMission)',
    '    : [];',
    '',
  ].join('\n'),
  'server SP mission projection',
);

server = replaceOnce(
  server,
  '      finalJob: spFinalJob,\n      secondStageRewards: {\n',
  [
    '      finalJob: spFinalJob,',
    '      missions: {',
    '        firstStage: spFirstStageMissions,',
    '        secondStage: spSecondStageMissions,',
    '      },',
    '      secondStageRewards: {',
    '',
  ].join('\n'),
  'server SP mission output',
);

fs.writeFileSync(serverPath, server);

const routePath = 'src/routes/heroes_.$heroId.tsx';
let route = fs.readFileSync(routePath, 'utf8');

route = replaceOnce(
  route,
  '        </section>\n\n        <HeroSoldierCommandSection soldierCommand={soldierCommand} />\n',
  '        </section>\n\n        {detail.sp.released ? <HeroSpMissionSection missions={detail.sp.missions} /> : null}\n\n        <HeroSoldierCommandSection soldierCommand={soldierCommand} />\n',
  'route SP mission section insertion',
);

const missionUi = [
  'type SpMissionView = {',
  '  missionId: number | null;',
  '  phase: string | null;',
  '  titleCn: string | null;',
  '  descCn: string | null;',
  '  missionType: number | null;',
  '  condition: {',
  '    kind: string | null;',
  '    items: Array<{ goodsType: number | null; sourceId: number | null; count: number | null }>;',
  '    equipmentId: number | null;',
  '    requiredLevel: number | null;',
  '    requiredHeroIds: number[];',
  '    stageId: number | null;',
  '    stageIds: number[];',
  '    clearCount: number | null;',
  '  };',
  '};',
  '',
  'function HeroSpMissionSection({ missions }: { missions: { firstStage: SpMissionView[]; secondStage: SpMissionView[] } }) {',
  '  if (missions.firstStage.length === 0 && missions.secondStage.length === 0) return null;',
  '  return (',
  '    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-sp-missions="true" data-sp-first-stage-count={missions.firstStage.length} data-sp-second-stage-count={missions.secondStage.length}>',
  '      <SectionTitle title="SP 전직 미션" />',
  '      <div className="mt-5 grid gap-4 lg:grid-cols-2">',
  '        <SpMissionPhase title="1차 전직" missions={missions.firstStage} />',
  '        <SpMissionPhase title="2차 전직" missions={missions.secondStage} />',
  '      </div>',
  '    </section>',
  '  );',
  '}',
  '',
  'function SpMissionPhase({ title, missions }: { title: string; missions: SpMissionView[] }) {',
  '  return (',
  '    <div className="rounded-xl border border-border bg-muted/10 p-3 sm:p-4">',
  '      <div className="flex items-center justify-between gap-3">',
  '        <h3 className="text-sm font-bold text-foreground">{title}</h3>',
  '        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{missions.length}개</span>',
  '      </div>',
  '      <ol className="mt-3 space-y-2">',
  '        {missions.map((mission, index) => (',
  '          <li key={mission.missionId ?? index} className="rounded-lg border border-border bg-background px-3 py-3" data-sp-mission-id={mission.missionId ?? undefined}>',
  '            <div className="flex flex-wrap items-center gap-2">',
  '              <span className="text-xs font-black tabular-nums text-muted-foreground">{index + 1}</span>',
  '              <span className="text-sm font-bold text-foreground">{mission.titleCn ?? ("Mission " + (mission.missionId ?? "?"))}</span>',
  '            </div>',
  '            {mission.descCn ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(mission.descCn)}</p> : null}',
  '            {mission.condition.items.length > 0 ? (',
  '              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="필요 재료">',
  '                {mission.condition.items.map((item, itemIndex) => (',
  '                  <span key={String(mission.missionId ?? index) + "-material-" + itemIndex} className="rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] font-semibold text-foreground">',
  '                    {"ID " + (item.sourceId ?? "?") + " ×" + (item.count ?? "?")}',
  '                  </span>',
  '                ))}',
  '              </div>',
  '            ) : null}',
  '            {formatSpMissionCondition(mission) ? <p className="mt-2 text-xs font-semibold leading-5 text-foreground">{formatSpMissionCondition(mission)}</p> : null}',
  '          </li>',
  '        ))}',
  '      </ol>',
  '    </div>',
  '  );',
  '}',
  '',
  'function formatSpMissionCondition(mission: SpMissionView) {',
  '  const condition = mission.condition;',
  '  if (condition.kind === "EXCLUSIVE_EQUIPMENT_LEVEL") return "전용장비 ID " + (condition.equipmentId ?? "?") + " · Lv." + (condition.requiredLevel ?? "?") + " 달성";',
  '  if (condition.kind === "CLEAR_STORY_STAGE_WITH_HEROES") return "Hero " + condition.requiredHeroIds.join(", ") + " 포함 · Stage " + (condition.stageId ?? "?") + " · " + (condition.clearCount ?? 1) + "회 클리어";',
  '  if (condition.kind === "CLEAR_ACTIVITY_STAGE_WITH_HEROES" || condition.kind === "CLEAR_ACTIVITY_STAGE_SOLO_OR_SPECIFIED") return "Hero " + condition.requiredHeroIds.join(", ") + " 포함 · Stage " + condition.stageIds.join(", ") + " · " + (condition.clearCount ?? 1) + "회 클리어";',
  '  return null;',
  '}',
  '',
].join('\n');

const formatBondAnchor = 'function formatBondCondition(condition: { requiredHero: { heroId: number | null; nameKr: string | null; nameCn: string | null; nameEn: string | null } | null; mission: { missionId: number | null; title: string | null; desc: string | null; missionType: number | null } | null; stage: { stageId: number | null; nameCn: string | null } | null; favorability: { targetHeroId: number | null; targetHeroNameKr: string | null; targetHeroNameCn: string | null; targetHeroNameEn: string | null; requiredLevel: number | null } | null }) {\n';
route = replaceOnce(route, formatBondAnchor, missionUi + formatBondAnchor, 'route SP mission components');

fs.writeFileSync(routePath, route);

if (!route.includes('data-hero-sp-missions="true"')) throw new Error('SP mission UI marker missing');
if (server.includes('data/generated/hero-page-stage5-4-sp.v1.json') || route.includes('data/generated/hero-page-stage5-4-sp.v1.json')) throw new Error('Forbidden Stage 5 runtime read introduced');
console.log('Applied scoped Hero SP mission projection and presentation patch.');
