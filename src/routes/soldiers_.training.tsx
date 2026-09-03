import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Dumbbell, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";

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
        content: "검증된 용병 훈련장 자료와 TrainingTech 레벨별 상승 효과를 확인합니다.",
      },
    ],
  }),
  component: SoldierTrainingPage,
});

type KindFilter = "ALL" | "COMMON_STAT" | "COMMON_PASSIVE";

const KIND_FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: "ALL", label: "전체" },
  { id: "COMMON_STAT", label: "기본 능력치" },
  { id: "COMMON_PASSIVE", label: "조건부 효과" },
];

const STAT_LABELS: Record<TrainingStatEffect["statKey"], string> = {
  HP: "생명",
  ATK: "공격",
  DEF: "방어",
  MDEF: "마방",
};

function SoldierTrainingPage() {
  const data = Route.useLoaderData();
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [selectedTechId, setSelectedTechId] = useState(data.techs[0]?.techId ?? 0);
  const [level, setLevel] = useState(1);
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [query, setQuery] = useState("");
  const simulatorRef = useRef<HTMLElement | null>(null);

  const filteredTechs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.techs.filter((tech) => {
      if (kindFilter !== "ALL" && tech.kind !== kindFilter) return false;
      if (!needle) return true;
      return [tech.nameCn, String(tech.techId), tech.armyIds.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data.techs, kindFilter, query]);

  const selectedTech =
    data.techs.find((tech) => tech.techId === selectedTechId) ?? filteredTechs[0] ?? data.techs[0];
  const safeLevel = selectedTech ? Math.min(Math.max(level, 1), selectedTech.maxLevel) : 1;

  function focusSimulator(materialId: number) {
    setSelectedMaterialId(materialId);
    simulatorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectTech(tech: SoldierTrainingTech) {
    setSelectedTechId(tech.techId);
    setLevel((current) => Math.min(current, tech.maxLevel));
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link
            reloadDocument
            to="/soldiers"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            용병 라인업으로
          </Link>
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
            <Dumbbell className="h-4 w-4" aria-hidden="true" />
            검증된 효과 {data.coverage.total}개
          </div>
        </header>

        <section className="mt-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Training Hall</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground sm:text-3xl">훈련장</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              검증된 훈련 재료 에셋을 둘러보고, 아래 시뮬레이터에서 frozen TrainingTech의 레벨별 상승 효과를 확인할 수 있어.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {data.materials.map((material) => {
              const selected = selectedMaterialId === material.itemId;
              return (
                <button
                  key={material.itemId}
                  type="button"
                  onClick={() => focusSimulator(material.itemId)}
                  className={`group overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected ? "border-foreground ring-1 ring-foreground" : "border-border"
                  }`}
                >
                  <div className="aspect-square bg-muted/40 p-2">
                    <img
                      src={material.imageUrl}
                      alt=""
                      className="h-full w-full object-contain transition group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="border-t border-border px-2 py-2">
                    <p className="line-clamp-2 text-[11px] font-semibold leading-4 text-foreground">
                      {material.nameCn}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">#{material.itemId}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            에셋 선택은 시뮬레이터 진입용 UI야. 재료 아이템과 특정 TrainingTech 사이의 관계는 이 화면에서 새로 추론하지 않아.
          </p>
        </section>

        <section ref={simulatorRef} className="mt-10 scroll-mt-6 border-t border-border pt-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Simulator</p>
              <h2 className="mt-2 text-xl font-black text-foreground sm:text-2xl">레벨별 상승효과</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                기본 능력치 84개 + 조건부 효과 46개. 아직 effect extraction 대상이 아닌 성장/병사 전용 진행 Tech는 계산하지 않아.
              </p>
            </div>

            <label className="relative block w-full lg:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="sr-only">훈련 Tech 검색</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="중문 이름 / Tech ID / Army ID 검색"
                className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/50 focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
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

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
            <div className="max-h-[680px] overflow-y-auto rounded-xl border border-border bg-card p-2">
              {filteredTechs.map((tech) => (
                <button
                  key={tech.techId}
                  type="button"
                  onClick={() => selectTech(tech)}
                  className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition last:mb-0 ${
                    selectedTech?.techId === tech.techId
                      ? "bg-foreground text-background"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-bold">{tech.nameCn}</span>
                    <span className="shrink-0 text-[10px] opacity-70">#{tech.techId}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] opacity-70">
                    <span>{tech.kind === "COMMON_STAT" ? "기본 능력치" : "조건부 효과"}</span>
                    <span>Lv.{tech.maxLevel}</span>
                    {tech.armyIds.length ? <span>Army {tech.armyIds.join(", ")}</span> : null}
                  </div>
                </button>
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
                      <h3 className="text-lg font-black text-foreground">{selectedTech.nameCn}</h3>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        Tech #{selectedTech.techId}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedTech.kind === "COMMON_STAT" ? "COMMON_STAT frozen consumer" : "COMMON_PASSIVE frozen consumer"}
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
                          {row.statEffects ? formatStatEffects(row.statEffects) : stripColorTags(row.passiveDescription ?? "-")}
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
      <p className="text-sm leading-6 text-foreground">{stripColorTags(current.passiveDescription ?? "-")}</p>
      {previous?.passiveDescription ? (
        <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          이전 레벨: {stripColorTags(previous.passiveDescription)}
        </p>
      ) : null}
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
        조건부 효과는 source template의 의미를 그대로 보존하며, 화면에서 조건/대상 AST를 새로 해석하지 않아.
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
