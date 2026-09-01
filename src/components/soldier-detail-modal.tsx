import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { getOfficialArmyIconUrl } from "@/lib/army-icon-assets";
import { getOfficialSoldierPortraitUrl } from "@/lib/soldier-portrait-assets";
import { getSoldierMaterialAssetUrl } from "@/lib/soldier-material-assets";
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
    descriptionLevels: AbilityLevel[];
    finalDescription: string;
    stage1?: SpStage | null;
    secondStageUnlock?: boolean;
    stage2?: SpStage | null;
    expandedHeroIds?: number[];
  };
};

type SoldierRichSource = {
  records: SoldierRichRecord[];
};

type HeroCardIconRecord = {
  heroId: number;
  nameKr: string | null;
  nameCn: string;
  webAssetPath: string;
  width: number;
  height: number;
  assetStatus: string;
};

type LoadState = "loading" | "ready" | "error";

type ArmyMeta = {
  label: string;
  shortLabel: string;
};

const ARMY_META = new Map<string, ArmyMeta>([
  ["INFANTRY", { label: "보병", shortLabel: "보" }],
  ["LANCER", { label: "창병", shortLabel: "창" }],
  ["CAVALRY", { label: "기병", shortLabel: "기" }],
  ["FLYING", { label: "비병", shortLabel: "비" }],
  ["WATER", { label: "수병", shortLabel: "수" }],
  ["ARCHER", { label: "궁병", shortLabel: "궁" }],
  ["ASSASSIN", { label: "암살자", shortLabel: "암" }],
  ["MAGE", { label: "마법사", shortLabel: "법" }],
  ["HOLY", { label: "승병", shortLabel: "승" }],
  ["DEMON", { label: "마족", shortLabel: "마" }],
]);

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

function resolvePublicAssetUrl(webAssetPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}${webAssetPath}`;
}

export function SoldierDetailModal({
  record,
  heroCardIcons,
}: {
  record: SoldierPrototypeRecord;
  heroCardIcons: HeroCardIconRecord[];
}) {
  const [detail, setDetail] = useState<SoldierRichRecord | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const displayName = record.nameKr ?? record.nameCn;
  const heroCardByHeroId = useMemo(
    () => new Map(heroCardIcons.map((card) => [card.heroId, card])),
    [heroCardIcons],
  );

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

  const abilityEffect = useMemo(() => {
    if (!detail) return null;

    if (record.isSp) {
      return detail.sp?.finalDescription ?? null;
    }

    return (
      detail.ability.levels.find((level) => level.level === 10)?.description ??
      detail.ability.finalDescription
    );
  }, [detail, record.isSp]);

  const heroGroups = useMemo(() => {
    if (!detail) {
      return { baseHeroIds: [] as number[], spUnlockedHeroIds: [] as number[] };
    }

    const spUnlockedHeroIds = record.isSp ? (detail.sp?.expandedHeroIds ?? []) : [];
    if (spUnlockedHeroIds.length === 0) {
      return { baseHeroIds: detail.heroes.finalHeroIds, spUnlockedHeroIds };
    }

    const spUnlockedHeroIdSet = new Set(spUnlockedHeroIds);
    return {
      baseHeroIds: detail.heroes.finalHeroIds.filter((heroId) => !spUnlockedHeroIdSet.has(heroId)),
      spUnlockedHeroIds,
    };
  }, [detail, record.isSp]);

  const abilityTitle = record.isSp ? "SP 고유기" : "10레벨 효과";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <header className="border-b border-border px-4 py-3 pr-16 sm:px-5 sm:py-4 sm:pr-16">
        <h2 id="soldier-detail-title" className="truncate text-lg font-black text-foreground sm:text-xl">
          {displayName}
        </h2>
      </header>

      <div className="space-y-6 p-4 sm:p-5">
        <section aria-label={`${displayName} 핵심 정보`}>
          <div className="grid gap-3 sm:h-[180px] sm:grid-cols-[180px_minmax(0,1fr)_156px] sm:items-stretch lg:h-[210px] lg:grid-cols-[210px_minmax(0,1fr)_168px]">
            <SoldierPreview record={record} />

            <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background p-3 sm:h-full sm:p-4">
              <p className="shrink-0 text-sm font-black text-foreground">{abilityTitle}</p>
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1 text-sm leading-6 text-foreground sm:mt-3">
                {loadState === "loading" ? (
                  <LoadingText />
                ) : loadState === "error" ? (
                  <p className="text-muted-foreground">{abilityTitle} 데이터를 불러오지 못했어.</p>
                ) : abilityEffect ? (
                  <ConfigText text={abilityEffect} />
                ) : (
                  <p className="text-muted-foreground">{abilityTitle} 데이터가 없는 용병이야.</p>
                )}
              </div>
            </div>

            <SoldierStatTable record={record} />
          </div>
        </section>

        <section aria-labelledby="soldier-heroes-title" className="border-t border-border pt-5">
          <div className="flex items-end justify-between gap-3">
            <SectionHeading id="soldier-heroes-title">사용 가능 영웅</SectionHeading>
            {detail ? (
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                {heroGroups.baseHeroIds.length}명
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
            <>
              <HeroIdGrid heroIds={heroGroups.baseHeroIds} heroCardByHeroId={heroCardByHeroId} />

              {record.isSp ? (
                <div className="mt-5 border-t border-border pt-4">
                  <div className="flex items-end justify-between gap-3">
                    <p className="text-sm font-black tracking-tight text-foreground sm:text-base">
                      SP 전직 후 추가 사용 가능 영웅
                    </p>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                      {heroGroups.spUnlockedHeroIds.length}명
                    </span>
                  </div>

                  {heroGroups.spUnlockedHeroIds.length > 0 ? (
                    <HeroIdGrid
                      heroIds={heroGroups.spUnlockedHeroIds}
                      heroCardByHeroId={heroCardByHeroId}
                    />
                  ) : (
                    <div className="mt-2 rounded-xl border border-border bg-background px-4 py-4 text-sm text-muted-foreground">
                      SP 전직으로 추가되는 사용 가능 영웅이 없어.
                    </div>
                  )}
                </div>
              ) : null}
            </>
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

function HeroIdGrid({
  heroIds,
  heroCardByHeroId,
}: {
  heroIds: number[];
  heroCardByHeroId: Map<number, HeroCardIconRecord>;
}) {
  return (
    <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
      {heroIds.map((heroId) => {
        const card = heroCardByHeroId.get(heroId);
        const displayName = card?.nameKr ?? card?.nameCn ?? `Hero ${heroId}`;
        const imageUrl = card?.assetStatus === "RESOLVED"
          ? resolvePublicAssetUrl(card.webAssetPath)
          : null;

        return (
          <Link
            key={heroId}
            reloadDocument
            to="/heroes/$heroId"
            params={{ heroId: String(heroId) }}
            title={`${displayName} 상세 보기`}
            aria-label={`${displayName} 상세 보기`}
            className="group min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2"
          >
            <article className="overflow-hidden rounded-lg border border-border bg-background p-1 text-center shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:border-foreground/25 group-hover:shadow-md">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted/20">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    width={card?.width}
                    height={card?.height}
                    loading="lazy"
                    className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.015]"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-muted/30 text-muted-foreground">
                    <span className="text-base font-black text-foreground">H</span>
                    <span className="mt-0.5 text-[9px] font-semibold tabular-nums sm:text-[10px]">
                      #{heroId}
                    </span>
                  </div>
                )}
              </div>
              <span className="mt-1 block truncate px-0.5 text-[9px] font-bold leading-tight text-foreground sm:text-[10px]">
                {displayName}
              </span>
            </article>
          </Link>
        );
      })}
    </div>
  );
}

function SoldierPreview({ record }: { record: SoldierPrototypeRecord }) {
  const army = ARMY_META.get(record.armyType);
  const displayName = record.nameKr ?? record.nameCn;
  const officialUrl = getOfficialArmyIconUrl(record.armyType);
  const portraitUrl = getOfficialSoldierPortraitUrl(record.soldierId);
  const [imageFailed, setImageFailed] = useState(false);
  const [portraitFailed, setPortraitFailed] = useState(false);

  return (
    <div className="mx-auto h-[180px] w-[180px] sm:mx-0 sm:h-full sm:w-full">
      <div className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted pb-9 text-muted-foreground">
          {portraitUrl && !portraitFailed ? (
            <img
              src={portraitUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-contain object-bottom px-2 pb-8 pt-2"
              onError={() => setPortraitFailed(true)}
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-current/20 bg-background/70">
              <span className="text-lg font-black tracking-tight">{army?.shortLabel ?? "?"}</span>
            </div>
          )}
        </div>

        <div className="absolute left-2 top-2">
          <span className="rounded bg-black/65 px-1.5 py-0.5 text-[14px] font-bold leading-none text-white">
            {record.isSp ? "SP" : `T${record.tier}`}
          </span>
        </div>

        <div
          className="absolute right-2 top-2 flex h-[22px] w-[22px] items-center justify-center"
          title={army?.label ?? record.armyType}
        >
          {officialUrl && !imageFailed ? (
            <img
              src={officialUrl}
              alt=""
              className="h-full w-full object-contain"
              aria-hidden="true"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="text-xs font-black text-foreground">{army?.shortLabel ?? "?"}</span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-2 text-center backdrop-blur-[1px]">
          <span className="line-clamp-2 text-xs font-bold leading-tight text-white">{displayName}</span>
        </div>
      </div>
    </div>
  );
}

function SoldierStatTable({ record }: { record: SoldierPrototypeRecord }) {
  const assetUrl = (folder: "stats" | "movement", fileName: string) =>
    `${import.meta.env.BASE_URL}images/shared/${folder}/${fileName}`;

  const movementIcons: Record<number, string> = {
    1: "Move_Ride.png",
    2: "Move_Walk.png",
    3: "Move_Water.png",
    4: "Move_Fly.png",
    5: "Move_FieldArmy.png",
  };

  const stats = [
    { label: "사거리", icon: assetUrl("stats", "Icon_Range.png"), value: record.combat.range },
    {
      label: "이동",
      icon: assetUrl("movement", movementIcons[record.combat.moveType] ?? "Move_Walk.png"),
      value: record.combat.move,
    },
    { label: "생명", icon: assetUrl("stats", "Icon_HP.png"), value: record.combat.hp },
    { label: "공격", icon: assetUrl("stats", "Icon_Attack.png"), value: record.combat.atk },
    { label: "방어", icon: assetUrl("stats", "Icon_Defense.png"), value: record.combat.def },
    { label: "마방", icon: assetUrl("stats", "Icon_MagicDefense.png"), value: record.combat.mdef },
  ];

  return (
    <div className="grid overflow-hidden rounded-xl border border-border bg-background sm:h-full sm:grid-cols-2 sm:grid-rows-3">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          title={stat.label}
          className={`flex min-h-[48px] items-center justify-center gap-1.5 px-1.5 py-1.5 sm:min-h-0 ${
            index % 2 === 0 ? "sm:border-r sm:border-border" : ""
          } ${index < 4 ? "sm:border-b sm:border-border" : ""}`}
        >
          <img
            src={stat.icon}
            alt=""
            aria-hidden="true"
            className="h-5 w-5 shrink-0 object-contain sm:h-6 sm:w-6"
          />
          <span className="text-sm font-black leading-none tabular-nums text-foreground sm:text-base">
            {stat.value}
          </span>
          <span className="sr-only">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h3 id={id} className="text-sm font-black tracking-tight text-foreground sm:text-base">
      {children}
    </h3>
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
      <span
        key={`${index++}-${token.slice(0, 8)}`}
        className={emphasized ? "font-bold text-destructive" : undefined}
      >
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
  const [startLevel, setStartLevel] = useState(0);
  const [endLevel, setEndLevel] = useState(maxLevel || 10);

  useEffect(() => {
    setStartLevel(0);
    setEndLevel(maxLevel || 10);
  }, [maxLevel]);

  const selectedLevels = useMemo(
    () => levels.filter((level) => level.level > startLevel && level.level <= endLevel),
    [endLevel, levels, startLevel],
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

  return (
    <div className="mt-2 grid gap-3 md:grid-cols-[280px_minmax(0,1fr)]">
      <div className="rounded-xl border border-border bg-background p-3 sm:p-4">
        <p className="text-sm font-black text-foreground">레벨 범위</p>
        <div className="mt-3 flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-bold text-muted-foreground">
            A 레벨
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={Math.max(0, maxLevel - 1)}
              value={startLevel}
              onChange={(event) => {
                const next = clampLevel(Number(event.target.value), 0, Math.max(0, maxLevel - 1));
                setStartLevel(next);
                if (next >= endLevel) setEndLevel(Math.min(maxLevel, next + 1));
              }}
              className="mt-1 h-10 w-full rounded-md border border-border bg-card px-2 text-center text-base font-black tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <span className="pb-2 text-lg font-black text-muted-foreground" aria-hidden="true">
            →
          </span>

          <label className="min-w-0 flex-1 text-xs font-bold text-muted-foreground">
            B 레벨
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={maxLevel}
              value={endLevel}
              onChange={(event) => {
                const next = clampLevel(Number(event.target.value), 1, maxLevel);
                setEndLevel(next);
                if (next <= startLevel) setStartLevel(Math.max(0, next - 1));
              }}
              className="mt-1 h-10 w-full rounded-md border border-border bg-card px-2 text-center text-base font-black tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/50 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black text-foreground">총 소모재료</p>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            Lv.{startLevel} → Lv.{endLevel}
          </span>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2.5">
          <p className="text-[10px] font-bold text-muted-foreground">골드</p>
          <p className="mt-0.5 text-lg font-black tabular-nums text-foreground">
            {formatNumber(totals.gold)}
          </p>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {totals.materials.map((material) => (
            <div
              key={`${material.goodsType}:${material.itemId}`}
              className="rounded-lg border border-border bg-background px-2.5 py-2"
            >
              <p className="truncate text-[10px] font-semibold text-muted-foreground">
                아이템 #{material.itemId}
              </p>
              <p className="mt-0.5 text-base font-black tabular-nums text-foreground">× {material.count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function clampLevel(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
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
          {stage.awakenMaterials.map((material) => {
            const assetUrl = getSoldierMaterialAssetUrl(material.goodsType, material.itemId);

            return (
              <span
                key={`${material.goodsType}:${material.itemId}`}
                title={`G${material.goodsType} / I${material.itemId}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground"
              >
                {assetUrl ? (
                  <>
                    <img
                      src={assetUrl}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="h-7 w-7 shrink-0 object-contain"
                    />
                    <span className="sr-only">아이템 #{material.itemId}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">#{material.itemId}</span>
                )}
                <span className="tabular-nums">× {formatNumber(material.count)}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-bold text-muted-foreground">전직 미션</p>
        {stage.missions.map((mission) => (
          <div key={mission.missionId} className="rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="text-xs font-black text-foreground">{mission.title}</p>
            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted-foreground">
              {mission.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}
