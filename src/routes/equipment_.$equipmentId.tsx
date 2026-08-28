import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronRight,
  CircleHelp,
  ShieldCheck,
  Sparkles,
  Swords,
  UserRound,
} from "lucide-react";

import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";
import { getEquipmentDetailPageData } from "@/lib/equipment-page.functions";
import type {
  ExclusiveEquipmentDetailPageData,
  GeneralEquipmentDetailPageData,
} from "@/lib/equipment-page.server";

export const Route = createFileRoute("/equipment_/$equipmentId")({
  loader: async ({ params }) => {
    if (!/^\d+$/.test(params.equipmentId)) {
      throw notFound();
    }

    const equipmentId = Number(params.equipmentId);
    if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) {
      throw notFound();
    }

    const data = await getEquipmentDetailPageData({ data: { equipmentId } });
    if (!data) {
      throw notFound();
    }

    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.displayName} | 랑그릿사 모바일 장비`
          : "장비 | 랑그릿사 모바일 미래시 정보",
      },
    ],
  }),
  component: EquipmentDetailPage,
  notFoundComponent: EquipmentNotFound,
});

const TAB_LABELS: Record<number, string> = {
  1: "초기 장비",
  2: "이전 추가 장비",
  3: "장비패스",
};

type Stats = GeneralEquipmentDetailPageData["detail"]["stats"];
type Effect = GeneralEquipmentDetailPageData["detail"]["effect"];
type Restriction = GeneralEquipmentDetailPageData["detail"]["restriction"];

function EquipmentDetailPage() {
  const data = Route.useLoaderData();

  if (data.kind === "exclusive") {
    return <ExclusiveEquipmentDetail data={data} />;
  }

  return <GeneralEquipmentDetail data={data} />;
}

function GeneralEquipmentDetail({ data }: { data: GeneralEquipmentDetailPageData }) {
  const { detail } = data;
  const { identity, classification, stats, effect, restriction, acquisition } = detail;
  const tabLabel = TAB_LABELS[classification.siteTab] ?? `탭 ${classification.siteTab}`;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Link
          reloadDocument
          to="/equipment"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          SSR 장비 목록
        </Link>

        <EquipmentHeader
          badge="SSR"
          displayName={data.displayName}
          nameCn={identity.nameCn}
          nameKr={identity.nameKr}
          classification={`${classification.groupKo} · ${classification.subtypeKo}`}
          secondaryBadge={tabLabel}
          equipmentId={data.equipmentId}
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <div className="space-y-6">
            <StatsSection stats={stats} />
            <EffectSection effect={effect} />
          </div>

          <div className="space-y-6">
            <RestrictionSection restriction={restriction} />

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold text-foreground">획득 계열</h2>
              <div className="mt-4 rounded-xl bg-muted/35 p-4">
                <p className="font-semibold text-foreground">{tabLabel}</p>
                {acquisition.releaseGroupDate ? (
                  <>
                    <p className="mt-2 text-sm text-muted-foreground">확인된 출시 그룹 날짜</p>
                    <p className="mt-0.5 font-semibold tabular-nums text-foreground">
                      {acquisition.releaseGroupDate}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      같은 출시 그룹 안의 개별 순서는 확정하지 않았어.
                    </p>
                  </>
                ) : classification.siteTab === 3 ? (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    이 계열의 정확한 출시 순서는 REVIEW 상태라 날짜나 최신순으로 표시하지 않아.
                  </p>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    정확한 개별 출시일과 역사적 순서는 확정하지 않았어.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-8 flex justify-between border-t border-border pt-6">
          <Link
            reloadDocument
            to="/equipment"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            목록으로 돌아가기
          </Link>
          <Link
            reloadDocument
            to="/equipment/exclusive"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            전용장비
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}

function ExclusiveEquipmentDetail({ data }: { data: ExclusiveEquipmentDetailPageData }) {
  const { detail, ownerHero } = data;
  const { identity, classification, stats, effect, restriction } = detail;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Link
          reloadDocument
          to="/equipment/exclusive"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          전용장비 목록
        </Link>

        <EquipmentHeader
          badge="전용"
          displayName={data.displayName}
          nameCn={identity.nameCn}
          nameKr={identity.nameKr}
          classification={`${classification.groupKo} · ${classification.subtypeKo}`}
          secondaryBadge="영웅 전용장비"
          equipmentId={data.equipmentId}
        />

        <section className="mt-6 rounded-2xl border border-primary/20 bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <UserRound size={18} aria-hidden="true" className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">전용 영웅</h2>
          </div>
          <div className="mt-4 rounded-xl border border-border bg-muted/35 p-4">
            <p className="text-xl font-bold text-foreground">{ownerHero.nameKr}</p>
            <p className="mt-1 text-sm text-muted-foreground">{ownerHero.nameCn}</p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              이 관계는 Stage B에서 확정한 equipmentId → heroIds 인덱스를 그대로 소비해. 장비명이나 출시순으로 소유 영웅을 추정하지 않아.
            </p>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <div className="space-y-6">
            <StatsSection stats={stats} />
            <EffectSection effect={effect} />
          </div>

          <div className="space-y-6">
            <RestrictionSection restriction={restriction} />

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold text-foreground">획득 계열</h2>
              <div className="mt-4 rounded-xl bg-muted/35 p-4">
                <p className="font-semibold text-foreground">영웅 전용장비</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  현재 167개 전용장비의 정확한 출시 날짜와 출시 순서는 REVIEW 상태야. 화면의 목록 순서를 출시 chronology로 표시하지 않아.
                </p>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-8 flex justify-between border-t border-border pt-6">
          <Link
            reloadDocument
            to="/equipment/exclusive"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            전용장비 목록
          </Link>
          <Link
            reloadDocument
            to="/equipment"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            일반 SSR 장비
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}

function EquipmentHeader({
  badge,
  displayName,
  nameCn,
  nameKr,
  classification,
  secondaryBadge,
  equipmentId,
}: {
  badge: string;
  displayName: string;
  nameCn: string;
  nameKr: string | null;
  classification: string;
  secondaryBadge: string;
  equipmentId: number;
}) {
  const imageUrl = getOfficialEquipmentImageUrl(equipmentId);

  return (
    <header className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex shrink-0 items-center justify-center self-start rounded-2xl border border-border bg-muted/25 p-2">
          <img
            src={imageUrl}
            alt={displayName + " 장비 이미지"}
            decoding="async"
            className="h-28 w-28 object-contain sm:h-32 sm:w-32"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold tracking-wide text-primary-foreground">
              {badge}
            </span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
              {classification}
            </span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
              {secondaryBadge}
            </span>
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {displayName}
          </h1>
          {nameKr === null ? (
            <p className="mt-2 text-sm text-muted-foreground">
              한국명이 아직 검수 확정되지 않아 중문명 <span className="font-medium text-foreground">{nameCn}</span>을 임시 표시하고 있어.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">중문명 {nameCn}</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
          equipmentId <span className="font-semibold text-foreground">{equipmentId}</span>
        </div>
      </div>
    </header>
  );
}

function StatsSection({ stats }: { stats: Stats }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <Swords size={18} aria-hidden="true" className="text-primary" />
        <h2 className="text-lg font-bold text-foreground">Lv50 능력치</h2>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {stats.properties.map((property) => (
          <div
            key={property.propertyId}
            className="rounded-xl border border-border bg-muted/35 px-4 py-4"
          >
            <p className="text-sm font-medium text-muted-foreground">{property.propertyKo}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {property.maxValue.toLocaleString("ko-KR")}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Stage 3에서 확정한 Lv{stats.maxLevel} 최종값을 그대로 표시해. 프론트에서 능력치를 다시 계산하지 않아.
      </p>
    </section>
  );
}

function EffectSection({ effect }: { effect: Effect }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <Sparkles size={18} aria-hidden="true" className="text-primary" />
        <h2 className="text-lg font-bold text-foreground">최대 효과</h2>
      </div>

      <div className="mt-4 rounded-xl bg-muted/45 p-4 sm:p-5">
        <p className="font-bold text-foreground">{effect.effectName}</p>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          {effect.effectSegments.map((segment, index) =>
            segment.highlight ? (
              <mark
                key={`${index}-${segment.text}`}
                className="rounded bg-primary/10 px-0.5 font-semibold text-foreground"
              >
                {segment.text}
              </mark>
            ) : (
              <span key={`${index}-${segment.text}`}>{segment.text}</span>
            ),
          )}
        </p>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        효과 문장은 Stage 3 consumer 원문을 수정하지 않고 표시해.
      </p>
    </section>
  );
}

function RestrictionSection({ restriction }: { restriction: Restriction }) {
  const unrestricted = restriction.mode === "unrestricted-by-fields";

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} aria-hidden="true" className="text-primary" />
        <h2 className="text-lg font-bold text-foreground">장착 제한</h2>
      </div>

      {unrestricted ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/35 p-4">
          <p className="font-semibold text-foreground">필드 기준 장착 제한 없음</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            ArmyIds와 JobIds가 모두 비어 있는 장비야.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {restriction.generalArmies.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                일반 허용 병종
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {restriction.generalArmies.map((army) => (
                  <span
                    key={army.armyId}
                    className="rounded-full border border-border bg-muted/45 px-3 py-1.5 text-sm font-semibold text-foreground"
                  >
                    {army.nameKo}
                  </span>
                ))}
              </div>
            </div>
          )}

          {restriction.specialJobs.length > 0 && (
            <details className="rounded-xl border border-border bg-muted/25 p-4">
              <summary className="cursor-pointer list-none font-semibold text-foreground">
                추가 허용 직업 {restriction.specialJobs.length}개
                <span className="ml-2 text-xs font-normal text-muted-foreground">펼쳐보기</span>
              </summary>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                직업명은 확정 Job 인덱스의 중문명을 그대로 사용해.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {restriction.specialJobs.map((job) => (
                  <div
                    key={job.jobId}
                    className="rounded-lg border border-border bg-background px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-foreground">{job.nameCn}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {job.armyNameKo} · Job {job.jobId}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-2 rounded-xl border border-border bg-muted/25 p-3">
        <CircleHelp size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-5 text-muted-foreground">
          병종 또는 특정 직업 중 하나에 해당하면 장착 가능하다는 규칙은 전체 구조에서 확인한
          <span className="font-semibold text-foreground"> 구조 추론 99%</span> 상태야. 런타임 직접 장착 판정 코드가 확인된 것으로 표시하지 않아.
        </p>
      </div>
    </section>
  );
}

function EquipmentNotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <h1 className="text-2xl font-bold text-foreground">공개 장비를 찾을 수 없습니다.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        공개 consumer에 포함되지 않은 장비이거나 잘못된 equipmentId야.
      </p>
      <Link reloadDocument to="/equipment" className="mt-6 inline-block text-sm font-medium text-foreground">
        SSR 장비로 돌아가기
      </Link>
    </main>
  );
}
