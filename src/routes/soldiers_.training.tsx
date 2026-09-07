import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { getOfficialArmyIconUrl } from "@/lib/army-icon-assets";
import { getSoldierCommonMaterialIconUrl } from "@/lib/soldier-common-material-assets";
import { getSoldierTrainingCostMaterialIconUrl } from "@/lib/soldier-training-cost-material-assets-supplemental";
import { getSoldierTrainingPageData } from "@/lib/soldier-training-page.functions";
import type {
  SoldierTrainingTech,
  TrainingStatEffect,
  TrainingTechLevel,
} from "@/lib/soldier-training-page.server";

export const Route = createFileRoute("/soldiers_/training")({
  loader: () => getSoldierTrainingPageData(),
  head: () => ({
    meta: [
      { title: "훈련장 | 용병 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "검증된 용병 훈련장 자료와 훈련 항목별 레벨 상승 효과를 확인합니다.",
      },
    ],
  }),
  component: SoldierTrainingPage,
});

type KindFilter = "ALL" | "COMMON_STAT" | "COMMON_PASSIVE";
type TrainingGroupFilter = "INFANTRY" | "LANCER" | "CAVALRY" | "FLYING_WATER" | "ARCHER_ASSASSIN" | "MAGE_HOLY_DEMON";

const KIND_FILTERS: Array<{ id: Exclude<KindFilter, "ALL">; label: string }> = [
  { id: "COMMON_STAT", label: "스탯" },
  { id: "COMMON_PASSIVE", label: "패시브" },
];

const TRAINING_GROUPS: Array<{
  id: TrainingGroupFilter;
  label: string;
  armyIds: number[];
  armyTypes: string[];
}> = [
  { id: "INFANTRY", label: "보병", armyIds: [2], armyTypes: ["INFANTRY"] },
  { id: "LANCER", label: "창병", armyIds: [1], armyTypes: ["LANCER"] },
  { id: "CAVALRY", label: "기병", armyIds: [3], armyTypes: ["CAVALRY"] },
  { id: "FLYING_WATER", label: "비병 + 수병", armyIds: [4, 5], armyTypes: ["FLYING", "WATER"] },
  { id: "ARCHER_ASSASSIN", label: "궁병 + 암살자", armyIds: [6, 11], armyTypes: ["ARCHER", "ASSASSIN"] },
  { id: "MAGE_HOLY_DEMON", label: "마법사 + 승려 + 마물", armyIds: [7, 8, 9], armyTypes: ["MAGE", "HOLY", "DEMON"] },
];

const TRAINING_GROUP_FILTERS = TRAINING_GROUPS.map(({ id, label, armyTypes }) => ({ id, label, armyTypes }));

const ULTIMATE_TRAINING_TECH_IDS = new Set([134, 232, 334, 437, 438, 540, 541, 645, 646, 647]);

const PASSIVE_TRAINING_ICON_FILE_IDS: Record<number, string> = {
  105: "1U8rkHk93Vep39-mHe-RObiLBecIlP2_b",
  122: "12HjCcfHNM4XbNPJI9Wg_lfg2G74KGSUH",
  123: "1eVBGBf9rDfhUlV3m16v6Ox-XdY9qXGh-",
  130: "11w5SN2Pj4ZFJGvWENTPFCfB4ha4kmW2T",
  131: "1kT915GMyJ4fkOKwF5knWxnOdAX84HX5a",
  205: "1m9AEKUkqz1K3MdPl0V5yYK8_0yR_yJhg",
  221: "1Ke_CIf5CpklYFnNFHDSwJPph9fYuM4v2",
  222: "1x3W3Wo7WppACsp1gU-C_iX6kE5ilGvkI",
  228: "1DrMr6K2BmRxhQhJyOyP_LgZTpQmsouoZ",
  229: "1_uvASF9unaYIo7UoKafE_U_WcIet2m45",
  305: "1fuQ5lpBhpdYbtSKukh48tjDuYNXDIW02",
  321: "1j8vKXqkdaFJ56MlbV0LRDwSroSt-1qHD",
  322: "1NlVKUINVs3pUWscRsM3tSuSSpIkBNj-C",
  329: "1lU20bQ4_9DZKRykve3gWmyDVj-HybrbD",
  330: "17pxeC8trB0kmzkNrXOxFz5RNaWxOXgeB",
  405: "1nKls1Sf5SYi8tlJ52pLDzd7L-b5J0UyY",
  424: "1bpx1EmpHfOMiWLvruZ4BpXFeF6hjHgtc",
  425: "1TQm-ob6obFQ10VuXixVnvHGI3PnCHyDw",
  426: "1Obdwj23q1KOdWBQlCXgUlruXKpABNDBQ",
  433: "17IZKkOwwldOJ0Q6_QkqC0i9D61qZBHTp",
  434: "1cvFmaiQk_ROYNEVpphkS4HMQEwJEh6ol",
  505: "1ntRkfxyWK9gePNa9a1lL6F5OglhGZg7U",
  522: "1otprMjUIk7vU6TEWGI0GTbAfc_ZUS6po",
  528: "1Wq5KUKhaEdJ8pa8TZQyWlVE6tYf8BiR3",
  529: "1vCrOl0gsVTj-YN-Z1FUltoX_NTnnX-qJ",
  536: "1inP6YKFkYy5f5izq4uIv0UiMsKLsXDVj",
  537: "1LdU5Xi6QPhoUOivHW0yaspWN26ZoAZFS",
  605: "1_wn-pvgkpw4kGHrtHamNAAEVB5IIfScV",
  622: "1sVsMa9InaNYtiShjnGjG9W9i8TdIarzi",
  623: "1QGNbY3hpqWxwEmAmlzoFb06dAjUwU4R2",
  629: "1FhXWK01SFKfD9VqsiqD-6EVHT17pVgvF",
  630: "1rk3TZg3BpSLpZmYufE8ArEF4oO832UVl",
  631: "1cWD-LX3IBakA0kwkNDhgNKhMvIPXJE3j",
  638: "1s8irSRbS-yvjEBmkicii-u_hNwoM4Ud_",
  639: "1dD1AAXKtpJiBcVJKA6qJwC1TMpRr5X8S",
  640: "14pdhdNODSIFIxC2ITtq-axujw0TsNTH-",
};

const STAT_LABELS: Record<TrainingStatEffect["statKey"], string> = {
  HP: "생명",
  ATK: "공격",
  DEF: "방어",
  MDEF: "마방",
};

const STAT_TRAINING_ROWS = [
  ["기초 공격 훈련", "기초 방어 훈련"],
  ["종합 공격 훈련", "종합 방어 훈련", "종합 생존 훈련"],
  ["강화 공격 훈련", "강화 방어 훈련", "강화 생존 훈련"],
  ["핵심 공격 훈련", "핵심 방어 훈련", "핵심 생존 훈련"],
  ["연계 공격 훈련", "연계 방어 훈련", "연계 생존 훈련"],
] as const;

const STAT_TRAINING_POSITION = new Map<string, { row: number; column: number }>(
  STAT_TRAINING_ROWS.flatMap((row, rowIndex) =>
    row.map((nameKr, columnIndex) => [nameKr, { row: rowIndex, column: columnIndex }] as const),
  ),
);

function isUltimateTrainingTech(tech: SoldierTrainingTech) {
  return ULTIMATE_TRAINING_TECH_IDS.has(tech.techId);
}

function getPresentationKind(tech: SoldierTrainingTech): Exclude<KindFilter, "ALL"> {
  return isUltimateTrainingTech(tech) ? "COMMON_STAT" : tech.kind;
}

function getPassiveTrainingIconUrl(techId: number) {
  const fileId = PASSIVE_TRAINING_ICON_FILE_IDS[techId];
  return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w170` : null;
}

function resolveTrainingGroup(tech: SoldierTrainingTech) {
  if (tech.armyIds.length === 0) {
    throw new Error(`Training Tech ${tech.techId} has no army relation.`);
  }

  const matches = TRAINING_GROUPS.filter((group) =>
    tech.armyIds.every((armyId) => group.armyIds.some((groupArmyId) => groupArmyId === armyId)),
  );

  if (matches.length !== 1) {
    throw new Error(
      `Training Tech ${tech.techId} must belong to exactly one training group; armyIds=${tech.armyIds.join(",")}.`,
    );
  }

  return matches[0]!;
}

function SoldierTrainingPage() {
  const data = Route.useLoaderData();
  const initialTech = data.techs.find((tech) => resolveTrainingGroup(tech).id === "INFANTRY") ?? data.techs[0];
  const [selectedTechId, setSelectedTechId] = useState(() => initialTech?.techId ?? 0);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [targetLevel, setTargetLevel] = useState(() => initialTech?.maxLevel ?? 1);
  const [kindFilter, setKindFilter] = useState<KindFilter>("COMMON_STAT");
  const [trainingGroupFilter, setTrainingGroupFilter] = useState<TrainingGroupFilter>("INFANTRY");

  const trainingGroupByTechId = useMemo(
    () => new Map(data.techs.map((tech) => [tech.techId, resolveTrainingGroup(tech)] as const)),
    [data.techs],
  );
  const filteredTechs = useMemo(
    () =>
      data.techs.filter((tech) => {
        if (kindFilter !== "ALL" && getPresentationKind(tech) !== kindFilter) return false;
        const trainingGroup = trainingGroupByTechId.get(tech.techId);
        if (!trainingGroup) throw new Error(`Missing training group for Tech ${tech.techId}.`);
        return trainingGroup.id === trainingGroupFilter;
      }),
    [data.techs, kindFilter, trainingGroupByTechId, trainingGroupFilter],
  );

  const groupedFilteredTechs = useMemo(
    () =>
      TRAINING_GROUPS.map((group) => ({
        group,
        techs: filteredTechs.filter((tech) => trainingGroupByTechId.get(tech.techId)?.id === group.id),
      })).filter(({ techs }) => techs.length > 0),
    [filteredTechs, trainingGroupByTechId],
  );

  const selectedTech =
    data.techs.find((tech) => tech.techId === selectedTechId) ?? filteredTechs[0] ?? data.techs[0];
  const safeTargetLevel = selectedTech ? clampLevel(targetLevel, 1, selectedTech.maxLevel) : 1;
  const safeCurrentLevel = selectedTech
    ? clampLevel(currentLevel, 0, Math.max(0, safeTargetLevel - 1))
    : 0;

  function selectTech(tech: SoldierTrainingTech) {
    setSelectedTechId(tech.techId);
    setCurrentLevel(0);
    setTargetLevel(tech.maxLevel);
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header>
          <Link
            reloadDocument
            to="/soldiers"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            용병
          </Link>
        </header>

        <section className="mt-6">
          <div>
            <p className="text-xs font-bold text-muted-foreground">훈련 계열</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TRAINING_GROUP_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={trainingGroupFilter === filter.id}
                  onClick={() => setTrainingGroupFilter(filter.id)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                    trainingGroupFilter === filter.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <span className="inline-flex items-center -space-x-0.5" aria-hidden="true">
                      {filter.armyTypes.map((armyType) => (
                        <TrainingArmyIcon key={armyType} armyType={armyType} />
                      ))}
                    </span>
                    <span>{filter.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold text-muted-foreground">유형</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {KIND_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={kindFilter === filter.id}
                  onClick={() => setKindFilter(filter.id)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                    kindFilter === filter.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
            <div className="max-h-[680px] overflow-y-auto rounded-xl border border-border bg-card p-2">
              {groupedFilteredTechs.map(({ group, techs }) => (
                <section key={group.id} className="mb-3 last:mb-0">
                  <TrainingTechGroupList
                    techs={techs}
                    selectedTechId={selectedTech?.techId}
                    groupLabel={group.label}
                    onSelect={selectTech}
                  />
                </section>
              ))}
            </div>

            {selectedTech ? (
              <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <TrainingPassiveIcon techId={selectedTech.techId} className="h-10 w-10" />
                    <h3 className="truncate text-lg font-black text-foreground">{selectedTech.nameKr}</h3>
                  </div>

                  <div className="grid min-w-0 grid-cols-[auto_minmax(110px,220px)_auto] items-center gap-2 sm:gap-3 xl:w-[430px]">
                    <label className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      <span className="whitespace-nowrap">현재</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={Math.max(0, selectedTech.maxLevel - 1)}
                        value={safeCurrentLevel}
                        onChange={(event) => {
                          const next = clampLevel(
                            Number(event.target.value),
                            0,
                            Math.max(0, selectedTech.maxLevel - 1),
                          );
                          setCurrentLevel(next);
                          if (next >= safeTargetLevel) {
                            setTargetLevel(Math.min(selectedTech.maxLevel, next + 1));
                          }
                        }}
                        className="h-9 w-12 rounded-md border border-border bg-background px-1 text-center text-sm font-black tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>

                    <input
                      type="range"
                      aria-label="목표 레벨"
                      min={1}
                      max={selectedTech.maxLevel}
                      value={safeTargetLevel}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setTargetLevel(next);
                        if (next <= safeCurrentLevel) {
                          setCurrentLevel(Math.max(0, next - 1));
                        }
                      }}
                      className="w-full accent-foreground"
                    />

                    <label className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      <span className="whitespace-nowrap">목표</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={selectedTech.maxLevel}
                        value={safeTargetLevel}
                        onChange={(event) => {
                          const next = clampLevel(Number(event.target.value), 1, selectedTech.maxLevel);
                          setTargetLevel(next);
                          if (next <= safeCurrentLevel) {
                            setCurrentLevel(Math.max(0, next - 1));
                          }
                        }}
                        className="h-9 w-12 rounded-md border border-border bg-background px-1 text-center text-sm font-black tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-5 rounded-lg border border-border bg-background p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
                    <EffectComparisonCard
                      label="현재 효과"
                      tech={selectedTech}
                      level={safeCurrentLevel}
                      emptyAtZero
                    />

                    <div
                      className="flex items-center justify-center text-muted-foreground"
                      aria-label={`Lv.${safeCurrentLevel}에서 Lv.${safeTargetLevel}로 강화`}
                    >
                      <span className="hidden text-3xl font-light leading-none md:block" aria-hidden="true">→</span>
                      <span className="text-3xl font-light leading-none md:hidden" aria-hidden="true">↓</span>
                    </div>

                    <EffectComparisonCard label="목표 효과" tech={selectedTech} level={safeTargetLevel} />
                  </div>

                  <TrainingCostSimulator
                    levels={selectedTech.levels}
                    startLevel={safeCurrentLevel}
                    endLevel={safeTargetLevel}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function TrainingTechGroupList({
  techs,
  selectedTechId,
  groupLabel,
  onSelect,
}: {
  techs: SoldierTrainingTech[];
  selectedTechId?: number | undefined;
  groupLabel: string;
  onSelect: (tech: SoldierTrainingTech) => void;
}) {
  const ultimateStatTechs = techs.filter(isUltimateTrainingTech);
  const statTechs = techs.filter((tech) => getPresentationKind(tech) === "COMMON_STAT" && !isUltimateTrainingTech(tech));
  const passiveTechs = techs.filter((tech) => getPresentationKind(tech) === "COMMON_PASSIVE");
  const knownStatTechIds = new Set<number>();

  const statRows = STAT_TRAINING_ROWS.map((names, rowIndex) => {
    const rowTechs = statTechs
      .filter((tech) => STAT_TRAINING_POSITION.get(tech.nameKr)?.row === rowIndex)
      .sort(
        (a, b) =>
          (STAT_TRAINING_POSITION.get(a.nameKr)?.column ?? Number.MAX_SAFE_INTEGER) -
          (STAT_TRAINING_POSITION.get(b.nameKr)?.column ?? Number.MAX_SAFE_INTEGER),
      );
    rowTechs.forEach((tech) => knownStatTechIds.add(tech.techId));
    return { key: names[0], techs: rowTechs };
  }).filter(({ techs: rowTechs }) => rowTechs.length > 0);

  const ungroupedStatTechs = statTechs.filter((tech) => !knownStatTechIds.has(tech.techId));

  return (
    <>
      {statRows.length > 0 ? (
        <div className="space-y-1.5 py-1">
          {statRows.map((row) => (
            <div key={row.key} className="grid grid-cols-3 gap-1.5">
              {row.techs.map((tech) => (
                <TrainingTechButton
                  key={tech.techId}
                  tech={tech}
                  selected={selectedTechId === tech.techId}
                  groupLabel={groupLabel}
                  compact
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {ungroupedStatTechs.length > 0 ? (
        <div className={statRows.length > 0 ? "mt-2 border-t border-border pt-2" : ""}>
          {ungroupedStatTechs.map((tech) => (
            <TrainingTechButton
              key={tech.techId}
              tech={tech}
              selected={selectedTechId === tech.techId}
              groupLabel={groupLabel}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}

      {ultimateStatTechs.length > 0 ? (
        <div>
          <div className="grid grid-cols-3 gap-1.5">
            {ultimateStatTechs.map((tech) => (
              <TrainingTechButton
                key={tech.techId}
                tech={tech}
                selected={selectedTechId === tech.techId}
                groupLabel={groupLabel}
                compact
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ) : null}

      {passiveTechs.length > 0 ? (
        <div className={`${statTechs.length > 0 || ultimateStatTechs.length > 0 ? "mt-2 border-t border-border pt-2 " : ""}grid grid-cols-3 gap-1.5`}>
          {passiveTechs.map((tech) => (
            <TrainingTechButton
              key={tech.techId}
              tech={tech}
              selected={selectedTechId === tech.techId}
              groupLabel={groupLabel}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function TrainingTechButton({
  tech,
  selected,
  groupLabel,
  compact = false,
  onSelect,
}: {
  tech: SoldierTrainingTech;
  selected: boolean;
  groupLabel: string;
  compact?: boolean;
  onSelect: (tech: SoldierTrainingTech) => void;
}) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onSelect(tech)}
        title={tech.nameKr}
        className={`min-h-[58px] min-w-0 rounded-lg px-2 py-2 text-center transition ${
          selected ? "bg-foreground text-background" : "bg-background hover:bg-muted"
        }`}
      >
        <span className="block text-[11px] font-black leading-4 sm:text-xs">{tech.nameKr}</span>
        <span className="mt-1 block text-[9px] font-semibold opacity-65">Lv.{tech.maxLevel}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(tech)}
      className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition last:mb-0 ${
        selected ? "bg-foreground text-background" : "hover:bg-muted"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <TrainingPassiveIcon techId={tech.techId} className="h-8 w-8" />
          <span className="truncate text-sm font-bold">{tech.nameKr}</span>
        </div>
      </div>
      {getPresentationKind(tech) === "COMMON_PASSIVE" ? null : (
        <div className="mt-1 flex items-center gap-2 text-[10px] opacity-70">
          <span>기본 능력치</span>
          <span>Lv.{tech.maxLevel}</span>
          <span>{groupLabel}</span>
        </div>
      )}
    </button>
  );
}

function TrainingArmyIcon({ armyType }: { armyType: string }) {
  const iconUrl = getOfficialArmyIconUrl(armyType);
  if (!iconUrl) return null;

  return (
    <img
      src={iconUrl}
      alt=""
      className="h-4 w-4 shrink-0 object-contain"
      aria-hidden="true"
    />
  );
}

function TrainingPassiveIcon({ techId, className }: { techId: number; className: string }) {
  const iconUrl = getPassiveTrainingIconUrl(techId);
  if (!iconUrl) return null;

  return <img src={iconUrl} alt="" className={`${className} shrink-0 object-contain`} aria-hidden="true" />;
}

function EffectComparisonCard({
  label,
  tech,
  level,
  emptyAtZero = false,
}: {
  label: string;
  tech: SoldierTrainingTech;
  level: number;
  emptyAtZero?: boolean;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="text-xs font-black tabular-nums text-foreground">Lv.{level}</p>
      </div>
      {emptyAtZero && level === 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">아직 적용된 효과 없음</p>
      ) : (
        <LevelEffect tech={tech} level={level} />
      )}
    </section>
  );
}

function LevelEffect({ tech, level }: { tech: SoldierTrainingTech; level: number }) {
  const current = tech.levels[level - 1];

  if (!current) {
    return <p className="mt-2 text-sm text-muted-foreground">선택한 레벨 정보를 찾을 수 없어.</p>;
  }

  if (current.statEffects) {
    return (
      <div className="mt-2 space-y-2">
        {current.statEffects.map((effect) => (
          <div key={`${effect.statKey}-${effect.unit}`} className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-foreground">
              {STAT_LABELS[effect.statKey]} {effect.unit === "PERCENT" ? "%" : ""}
            </span>
            <span className="text-sm font-black text-foreground">{formatEffectValue(effect)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-sm leading-6 text-foreground">{stripColorTags(current.passiveDescriptionKr ?? "-")}</p>
    </div>
  );
}

function TrainingCostSimulator({
  levels,
  startLevel,
  endLevel,
}: {
  levels: TrainingTechLevel[];
  startLevel: number;
  endLevel: number;
}) {
  const totals = useMemo(() => {
    const materials = new Map<
      string,
      { goodsType: number; id: number; count: number }
    >();
    let gold = 0;

    for (const level of levels) {
      if (level.level <= startLevel || level.level > endLevel) continue;
      gold += level.goldCost;
      for (const material of level.materialCosts) {
        const key = `${material.goodsType}:${material.id}`;
        const previous = materials.get(key);
        materials.set(key, {
          goodsType: material.goodsType,
          id: material.id,
          count: (previous?.count ?? 0) + material.count,
        });
      }
    }

    return { gold, materials: [...materials.values()] };
  }, [endLevel, levels, startLevel]);

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground">총 강화 비용</p>
        <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">
          Lv.{startLevel} → Lv.{endLevel}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-foreground">
          <img
            src={getSoldierCommonMaterialIconUrl("gold")}
            alt=""
            className="h-5 w-5 shrink-0 object-contain"
            aria-hidden="true"
          />
          <span className="font-black">×{formatNumber(totals.gold)}</span>
        </span>
        {totals.materials.map((material) => {
          const iconUrl = getSoldierTrainingCostMaterialIconUrl(material.id);
          return (
            <span
              key={`${material.goodsType}-${material.id}`}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-foreground"
            >
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt=""
                  className="h-5 w-5 shrink-0 object-contain"
                  aria-hidden="true"
                />
              ) : null}
              <span className="font-black">×{formatNumber(material.count)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function formatEffectValue(effect: TrainingStatEffect) {
  return `+${effect.value}${effect.unit === "PERCENT" ? "%" : ""}`;
}

function formatStatEffects(effects: TrainingStatEffect[]) {
  return effects
    .map((effect) => `${STAT_LABELS[effect.statKey]} ${formatEffectValue(effect)}`)
    .join(" · ");
}

function clampLevel(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function stripColorTags(value: string) {
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}
