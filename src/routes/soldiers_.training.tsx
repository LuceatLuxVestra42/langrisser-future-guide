import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { getOfficialArmyIconUrl } from "@/lib/army-icon-assets";
import { getSoldierTrainingPageData } from "@/lib/soldier-training-page.functions";
import type {
  SoldierTrainingTech,
  TrainingStatEffect,
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
type TrainingGroupFilter = "ALL" | "INFANTRY" | "LANCER" | "CAVALRY" | "FLYING_WATER" | "ARCHER_ASSASSIN" | "MAGE_HOLY_DEMON";

const KIND_FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: "ALL", label: "전체" },
  { id: "COMMON_STAT", label: "기본 능력치" },
  { id: "COMMON_PASSIVE", label: "조건부 효과" },
];

const TRAINING_GROUPS: Array<{
  id: Exclude<TrainingGroupFilter, "ALL">;
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

const TRAINING_GROUP_FILTERS: Array<{
  id: TrainingGroupFilter;
  label: string;
  armyTypes: string[];
}> = [
  { id: "ALL", label: "전체 훈련", armyTypes: [] },
  ...TRAINING_GROUPS.map(({ id, label, armyTypes }) => ({ id, label, armyTypes })),
];

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
  ["연합 공격 훈련", "연합 방어 훈련", "연합 생존 훈련"],
] as const;

const STAT_TRAINING_POSITION = new Map<string, { row: number; column: number }>(
  STAT_TRAINING_ROWS.flatMap((row, rowIndex) =>
    row.map((nameKr, columnIndex) => [nameKr, { row: rowIndex, column: columnIndex }] as const),
  ),
);

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

  return matches[0];
}

function SoldierTrainingPage() {
  const data = Route.useLoaderData();
  const [selectedTechId, setSelectedTechId] = useState(data.techs[0]?.techId ?? 0);
  const [level, setLevel] = useState(1);
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [trainingGroupFilter, setTrainingGroupFilter] = useState<TrainingGroupFilter>("ALL");
  const [query, setQuery] = useState("");

  const trainingGroupByTechId = useMemo(
    () => new Map(data.techs.map((tech) => [tech.techId, resolveTrainingGroup(tech)] as const)),
    [data.techs],
  );

  const filteredTechs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.techs.filter((tech) => {
      if (kindFilter !== "ALL" && tech.kind !== kindFilter) return false;
      const trainingGroup = trainingGroupByTechId.get(tech.techId);
      if (!trainingGroup) throw new Error(`Missing training group for Tech ${tech.techId}.`);
      if (trainingGroupFilter !== "ALL" && trainingGroup.id !== trainingGroupFilter) return false;
      if (!needle) return true;
      return [tech.nameKr, tech.nameCn, String(tech.techId), trainingGroup.label]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data.techs, kindFilter, query, trainingGroupByTechId, trainingGroupFilter]);

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
  const selectedTrainingGroup = selectedTech ? trainingGroupByTechId.get(selectedTech.techId) : undefined;
  const safeLevel = selectedTech ? Math.min(Math.max(level, 1), selectedTech.maxLevel) : 1;

  function selectTech(tech: SoldierTrainingTech) {
    setSelectedTechId(tech.techId);
    setLevel((current) => Math.min(current, tech.maxLevel));
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
          <label className="relative block w-full">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">훈련 항목 검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="검색"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/50 focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="mt-4">
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
                    {filter.armyTypes.length > 0 ? (
                      <span className="inline-flex items-center -space-x-0.5" aria-hidden="true">
                        {filter.armyTypes.map((armyType) => (
                          <TrainingArmyIcon key={armyType} armyType={armyType} />
                        ))}
                      </span>
                    ) : null}
                    <span>{filter.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold text-muted-foreground">효과 유형</p>
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
                  <div className="sticky top-0 z-10 mb-1 flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs font-black text-foreground">
                    <span>{group.label}</span>
                    <span className="text-[10px] font-bold text-muted-foreground">{techs.length}개</span>
                  </div>
                  <TrainingTechGroupList
                    techs={techs}
                    selectedTechId={selectedTech?.techId}
                    groupLabel={group.label}
                    onSelect={selectTech}
                  />
                </section>
              ))}
              {filteredTechs.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-muted-foreground">검색 결과가 없어.</div>
              ) : null}
            </div>

            {selectedTech ? (
              <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-foreground">{selectedTech.nameKr}</h3>
                      {selectedTech.nameStatus === "provisional-display" ? (
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                          임시 표기
                        </span>
                      ) : null}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        훈련 #{selectedTech.techId}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedTrainingGroup ? `${selectedTrainingGroup.label} · ` : ""}
                      {selectedTech.kind === "COMMON_STAT" ? "기본 능력치 훈련" : "조건부 효과 훈련"}
                    </p>
                  </div>
                  <div className="min-w-40">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>선택 레벨</span>
                      <span>Lv.{safeLevel} / {selectedTech.maxLevel}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={selectedTech.maxLevel}
                      value={safeLevel}
                      onChange={(event) => setLevel(Number(event.target.value))}
                      className="mt-2 w-full accent-foreground"
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-bold text-muted-foreground">Lv.{safeLevel} 효과</p>
                  <LevelEffect tech={selectedTech} level={safeLevel} />
                </div>

                <div className="mt-5">
                  <h4 className="text-sm font-black text-foreground">전체 레벨표</h4>
                  <div className="mt-2 overflow-hidden rounded-lg border border-border">
                    {selectedTech.levels.map((row) => (
                      <button
                        key={row.level}
                        type="button"
                        onClick={() => setLevel(row.level)}
                        className={`grid w-full grid-cols-[52px_minmax(0,1fr)] border-b border-border px-3 py-2.5 text-left text-xs last:border-b-0 ${
                          safeLevel === row.level ? "bg-muted" : "bg-card hover:bg-muted/60"
                        }`}
                      >
                        <span className="font-black text-foreground">Lv.{row.level}</span>
                        <span className="leading-5 text-muted-foreground">
                          {row.statEffects ? formatStatEffects(row.statEffects) : stripColorTags(row.passiveDescriptionKr ?? "-")}
                        </span>
                      </button>
                    ))}
                  </div>
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
  selectedTechId?: number;
  groupLabel: string;
  onSelect: (tech: SoldierTrainingTech) => void;
}) {
  const statTechs = techs.filter((tech) => tech.kind === "COMMON_STAT");
  const passiveTechs = techs.filter((tech) => tech.kind === "COMMON_PASSIVE");
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

      {passiveTechs.length > 0 ? (
        <div className={statTechs.length > 0 ? "mt-2 border-t border-border pt-2" : ""}>
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
        title={`${tech.nameKr} · 훈련 #${tech.techId}`}
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
          <span className="truncate text-sm font-bold">{tech.nameKr}</span>
          {tech.nameStatus === "provisional-display" ? (
            <span className="shrink-0 rounded border border-current/25 px-1 py-0.5 text-[9px] font-bold opacity-70">
              임시 표기
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-[10px] opacity-70">#{tech.techId}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] opacity-70">
        <span>{tech.kind === "COMMON_STAT" ? "기본 능력치" : "조건부 효과"}</span>
        <span>Lv.{tech.maxLevel}</span>
        <span>{groupLabel}</span>
      </div>
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

function LevelEffect({ tech, level }: { tech: SoldierTrainingTech; level: number }) {
  const current = tech.levels[level - 1];
  const previous = level > 1 ? tech.levels[level - 2] : null;

  if (!current) {
    return <p className="mt-2 text-sm text-muted-foreground">선택한 레벨 정보를 찾을 수 없어.</p>;
  }

  if (current.statEffects) {
    return (
      <div className="mt-2 space-y-2">
        {current.statEffects.map((effect, index) => {
          const previousValue = previous?.statEffects?.[index]?.value ?? 0;
          const delta = effect.value - previousValue;
          return (
            <div key={`${effect.statKey}-${effect.unit}`} className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold text-foreground">
                {STAT_LABELS[effect.statKey]} {effect.unit === "PERCENT" ? "%" : ""}
              </span>
              <span className="text-sm font-black text-foreground">
                {formatEffectValue(effect)}
                <span className="ml-2 text-xs font-semibold text-muted-foreground">
                  전 레벨 대비 {formatSigned(delta, effect.unit)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-sm leading-6 text-foreground">{stripColorTags(current.passiveDescriptionKr ?? "-")}</p>
      {previous?.passiveDescriptionKr ? (
        <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          이전 레벨: {stripColorTags(previous.passiveDescriptionKr)}
        </p>
      ) : null}
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
        조건부 효과 문구는 검증된 원문 조건과 레벨별 수치를 그대로 반영해.
      </p>
    </div>
  );
}

function formatEffectValue(effect: TrainingStatEffect) {
  return `+${effect.value}${effect.unit === "PERCENT" ? "%" : ""}`;
}

function formatSigned(value: number, unit: TrainingStatEffect["unit"]) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}${unit === "PERCENT" ? "%" : ""}`;
}

function formatStatEffects(effects: TrainingStatEffect[]) {
  return effects
    .map((effect) => `${STAT_LABELS[effect.statKey]} ${formatEffectValue(effect)}`)
    .join(" · ");
}

function stripColorTags(value: string) {
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}
