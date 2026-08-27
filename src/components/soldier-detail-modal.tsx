import { useEffect, useMemo, useState } from "react";

import type { SoldierPrototypeRecord } from "@/lib/soldier-page.server";

type MaterialCost = {
  goodsType: number;
  itemId: number;
  count: number;
};

type TrainingLevelCost = {
  level: number;
  gold: number;
  materials: MaterialCost[];
};

type AbilityLevel = {
  level: number;
  description: string;
};

type SpMission = {
  missionId: number;
  title: string;
  desc: string;
};

type SpStage = {
  awakenLevelId: number;
  awakenMaterials: MaterialCost[];
  missions: SpMission[];
};

type SoldierRichRecord = {
  soldierId: number;
  ability: {
    levels: AbilityLevel[];
    finalDescription: string | null;
  };
  training: {
    techId: number | null;
    perLevelCost: TrainingLevelCost[];
  };
  heroes: {
    finalHeroIds: number[];
  };
  sp: null | {
    normalSoldierId: number;
    spSoldierId: number;
    stage1?: SpStage | null;
    secondStageUnlock?: boolean;
    stage2?: SpStage | null;
    expandedHeroIds?: number[];
  };
};

type SoldierRichSource = {
  records: SoldierRichRecord[];
};

type LoadState = "loading" | "ready" | "error";

let soldierRichSourcePromise: Promise<SoldierRichSource> | null = null;

function loadSoldierRichSource() {
  if (!soldierRichSourcePromise) {
    const url = `${import.meta.env.BASE_URL}data/soldier-detail-stage5-6.v1.json`;
    soldierRichSourcePromise = fetch(url).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Soldier detail data request failed: ${response.status}`);
      }
      return (await response.json()) as SoldierRichSource;
    });
  }

  return soldierRichSourcePromise;
}

export function SoldierDetailModal({ record }: { record: SoldierPrototypeRecord }) {
  const [detail, setDetail] = useState<SoldierRichRecord | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const displayName = record.nameKr ?? record.nameCn;

  useEffect(() => {
    let active = true;
    setLoadState("loading");

    loadSoldierRichSource()
      .then((source) => {
        if (!active) return;
        const matched = source.records.find((item) => item.soldierId === record.soldierId) ?? null;
        setDetail(matched);
        setLoadState(matched ? "ready" : "error");
      })
      .catch(() => {
        if (!active) return;
        setDetail(null);
        setLoadState("error");
      });

    return () => {
      active = false;
    };
  }, [record.soldierId]);

  const level10Effect = useMemo(() => {
    if (!detail) return null;
    return (
      detail.ability.levels.find((level) => level.level === 10)?.description ??
      detail.ability.finalDescription
    );
  }, [detail]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <header className="border-b border-border px-4 py-3 pr-16 sm:px-5 sm:py-4 sm:pr-16">
        <h2 id="soldier-detail-title" className="truncate text-lg font-black text-foreground sm:text-xl">
          {displayName}
        </h2>
      </header>

      <div className="space-y-6 p-4 sm:p-5">
        <section aria-labelledby="soldier-basic-stats-title">
          <SectionHeading id="soldier-basic-stats-title">기본 속성</SectionHeading>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="사거리" value={`${record.combat.range}`} />
            <StatCard
              label="이동"
              value={`타입 ${record.combat.moveType} · ${record.combat.move}칸`}
            />
            <StatCard label="생명" value={record.combat.hp} />
            <StatCard label="공격" value={record.combat.atk} />
            <StatCard label="방어" value={record.combat.def} />
            <StatCard label="마방" value={record.combat.mdef} />
          </div>
        </section>

        <section aria-labelledby="soldier-level10-effect-title" className="border-t border-border pt-5">
          <SectionHeading id="soldier-level10-effect-title">10레벨 효과</SectionHeading>
          <div className="mt-2 rounded-xl border border-border bg-background px-4 py-3 text-sm leading-7 text-foreground">
            {loadState === "loading" ? (
              <LoadingText />
            ) : loadState === "error" ? (
              <p className="text-muted-foreground">10레벨 효과 데이터를 불러오지 못했어.</p>
            ) : level10Effect ? (
              <ConfigText text={level10Effect} />
            ) : (
              <p className="text-muted-foreground">10레벨 효과 데이터가 없는 용병이야.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="soldier-heroes-title" className="border-t border-border pt-5">
          <div className="flex items-end justify-between gap-3">
            <SectionHeading id="soldier-heroes-title">사용 가능 영웅</SectionHeading>
            {detail ? (
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                {detail.heroes.finalHeroIds.length}명
              </span>
            ) : null}
          </div>

          {loadState === "loading" ? (
            <div className="mt-2 rounded-xl border border-border bg-background px-4 py-5">
              <LoadingText />
            </div>
          ) : loadState === "error" || !detail ? (
            <div className="mt-2 rounded-xl border border-border bg-background px-4 py-5 text-sm text-muted-foreground">
              사용 가능 영웅 데이터를 불러오지 못했어.
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
              {detail.heroes.finalHeroIds.map((heroId) => (
                <div
                  key={heroId}
                  title={`Hero ${heroId}`}
                  className="flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg border border-border bg-background px-1 text-center"
                >
                  <span className="text-base font-black text-foreground">H</span>
                  <span className="mt-0.5 max-w-full truncate text-[9px] font-semibold tabular-nums text-muted-foreground sm:text-[10px]">
                    #{heroId}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="soldier-growth-title" className="border-t border-border pt-5">
          <SectionHeading id="soldier-growth-title">
            {record.isSp ? "SP 전직" : "레벨별 소모재료"}
          </SectionHeading>

          {loadState === "loading" ? (
            <div className="mt-2 rounded-xl border border-border bg-background px-4 py-6">
              <LoadingText />
            </div>
          ) : loadState === "error" || !detail ? (
            <div className="mt-2 rounded-xl border border-border bg-background px-4 py-5 text-sm text-muted-foreground">
              성장 데이터를 불러오지 못했어.
            </div>
          ) : record.isSp ? (
            <SpConversionPanel sp={detail.sp} />
          ) : (
            <TrainingSimulator levels={detail.training.perLevelCost} />
          )}
        </section>
      </div>
    </section>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h3 id={id} className="text-sm font-black tracking-tight text-foreground sm:text-base">
      {children}
    </h3>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-h-[68px] flex-col items-center justify-center rounded-xl border border-border bg-background px-2 py-2 text-center sm:min-h-[76px]">
      <p className="text-[10px] font-bold text-muted-foreground sm:text-xs">{label}</p>
      <p className="mt-1 text-sm font-black tabular-nums text-foreground sm:text-base">{value}</p>
    </div>
  );
}

function ConfigText({ text }: { text: string }) {
  const tokens = text.split(/(<color=[^>]+>|<\/color>)/g);
  let emphasized = false;
  let index = 0;
  const nodes = [];

  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith("<color=")) {
      emphasized = true;
      continue;
    }
    if (token === "</color>") {
      emphasized = false;
      continue;
    }

    nodes.push(
      <span key={`${index++}-${token.slice(0, 8)}`} className={emphasized ? "font-bold text-destructive" : undefined}>
        {token.replace(/<[^>]+>/g, "")}
      </span>,
    );
  }

  return <p className="whitespace-pre-line">{nodes}</p>;
}

function LoadingText() {
  return <p className="text-sm text-muted-foreground">데이터 불러오는 중...</p>;
}

function TrainingSimulator({ levels }: { levels: TrainingLevelCost[] }) {
  const maxLevel = useMemo(
    () => levels.reduce((max, level) => Math.max(max, level.level), 0),
    [levels],
  );
  const [currentLevel, setCurrentLevel] = useState(0);
  const [targetLevel, setTargetLevel] = useState(maxLevel || 10);

  useEffect(() => {
    setCurrentLevel(0);
    setTargetLevel(maxLevel || 10);
  }, [maxLevel]);

  const selectedLevels = useMemo(
    () => levels.filter((level) => level.level > currentLevel && level.level <= targetLevel),
    [currentLevel, levels, targetLevel],
  );

  const totals = useMemo(() => {
    const materials = new Map<string, MaterialCost>();
    let gold = 0;

    for (const level of selectedLevels) {
      gold += level.gold;
      for (const material of level.materials) {
        const key = `${material.goodsType}:${material.itemId}`;
        const previous = materials.get(key);
        materials.set(key, {
          goodsType: material.goodsType,
          itemId: material.itemId,
          count: (previous?.count ?? 0) + material.count,
        });
      }
    }

    return {
      gold,
      materials: [...materials.values()].sort((a, b) => a.itemId - b.itemId),
    };
  }, [selectedLevels]);

  if (levels.length === 0 || maxLevel === 0) {
    return (
      <div className="mt-2 rounded-xl border border-border bg-background px-4 py-5 text-sm text-muted-foreground">
        레벨별 훈련 소비 데이터가 없는 용병이야.
      </div>
    );
  }

  const levelOptions = Array.from({ length: maxLevel + 1 }, (_, index) => index);

  return (
    <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
      <div className="rounded-xl border border-border bg-background p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-muted-foreground">
            현재 레벨
            <select
              value={currentLevel}
              onChange={(event) => {
                const next = Number(event.target.value);
                setCurrentLevel(next);
                if (next >= targetLevel) setTargetLevel(Math.min(maxLevel, next + 1));
              }}
              className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {levelOptions.slice(0, -1).map((level) => (
                <option key={level} value={level}>
                  Lv.{level}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-muted-foreground">
            목표 레벨
            <select
              value={targetLevel}
              onChange={(event) => {
                const next = Number(event.target.value);
                setTargetLevel(next);
                if (next <= currentLevel) setCurrentLevel(Math.max(0, next - 1));
              }}
              className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {levelOptions.slice(1).map((level) => (
                <option key={level} value={level}>
                  Lv.{level}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[58px_92px_1fr] bg-muted px-2 py-1.5 text-[10px] font-black text-muted-foreground sm:text-xs">
            <span>레벨</span>
            <span>골드</span>
            <span>재료</span>
          </div>
          <div className="max-h-64 divide-y divide-border overflow-y-auto">
            {selectedLevels.map((level) => (
              <div
                key={level.level}
                className="grid grid-cols-[58px_92px_1fr] items-start gap-0 px-2 py-2 text-xs text-foreground"
              >
                <span className="font-black">Lv.{level.level}</span>
                <span className="tabular-nums">{formatNumber(level.gold)}</span>
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  {level.materials.map((material) => (
                    <span key={`${material.goodsType}:${material.itemId}`} className="whitespace-nowrap">
                      #{material.itemId} × {material.count}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/50 p-3 sm:p-4">
        <p className="text-sm font-black text-foreground">총 소모재료</p>
        <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2.5">
          <p className="text-[10px] font-bold text-muted-foreground">골드</p>
          <p className="mt-0.5 text-lg font-black tabular-nums text-foreground">
            {formatNumber(totals.gold)}
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
          {totals.materials.map((material) => (
            <div key={`${material.goodsType}:${material.itemId}`} className="rounded-lg border border-border bg-background px-2.5 py-2">
              <p className="truncate text-[10px] font-semibold text-muted-foreground">아이템 #{material.itemId}</p>
              <p className="mt-0.5 text-base font-black tabular-nums text-foreground">× {material.count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpConversionPanel({ sp }: { sp: SoldierRichRecord["sp"] }) {
  if (!sp) {
    return (
      <div className="mt-2 rounded-xl border border-border bg-background px-4 py-5 text-sm text-muted-foreground">
        SP 전직 데이터가 없어.
      </div>
    );
  }

  return (
    <div className="mt-2 grid gap-3 lg:grid-cols-2">
      <SpStageCard title="1차 SP 전직" stage={sp.stage1 ?? null} />
      {sp.secondStageUnlock ? (
        <SpStageCard title="2차 SP 전직" stage={sp.stage2 ?? null} />
      ) : (
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-black text-foreground">2차 SP 전직</p>
          <p className="mt-3 text-sm text-muted-foreground">2차 SP 전직 단계가 없는 용병이야.</p>
        </div>
      )}
    </div>
  );
}

function SpStageCard({ title, stage }: { title: string; stage: SpStage | null }) {
  if (!stage) {
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <p className="text-sm font-black text-foreground">{title}</p>
        <p className="mt-3 text-sm text-muted-foreground">전직 데이터를 불러오지 못했어.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-foreground">{title}</p>
        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
          단계 #{stage.awakenLevelId}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-xs font-bold text-muted-foreground">필요 재료</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {stage.awakenMaterials.map((material) => (
            <span
              key={`${material.goodsType}:${material.itemId}`}
              className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground"
            >
              #{material.itemId} × {material.count}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-bold text-muted-foreground">전직 미션</p>
        {stage.missions.map((mission) => (
          <div key={mission.missionId} className="rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="text-xs font-black text-foreground">{mission.title}</p>
            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted-foreground">{mission.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}
