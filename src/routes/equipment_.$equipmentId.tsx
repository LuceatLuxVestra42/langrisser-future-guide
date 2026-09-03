import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Sparkles, Swords, UserRound } from "lucide-react";

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

type Stats = GeneralEquipmentDetailPageData["detail"]["stats"];
type Effect = GeneralEquipmentDetailPageData["detail"]["effect"];

function EquipmentDetailPage() {
  const data = Route.useLoaderData();

  if (data.kind === "exclusive") {
    return <ExclusiveEquipmentDetail data={data} />;
  }

  return <GeneralEquipmentDetail data={data} />;
}

function GeneralEquipmentDetail({ data }: { data: GeneralEquipmentDetailPageData }) {
  const { classification, stats, effect } = data.detail;

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
          displayName={data.displayName}
          classification={`${classification.groupKo} · ${classification.subtypeKo}`}
          equipmentId={data.equipmentId}
        />

        <div className="mt-6 space-y-6">
          <StatsSection stats={stats} />
          <EffectSection effect={effect} />
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
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
  const { classification, stats, effect } = data.detail;
  const { ownerHero } = data;

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
          displayName={data.displayName}
          classification={`${classification.groupKo} · ${classification.subtypeKo}`}
          equipmentId={data.equipmentId}
        />

        <section className="mt-6 rounded-2xl border border-primary/20 bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <UserRound size={18} aria-hidden="true" className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">전용 영웅</h2>
          </div>
          <Link
            reloadDocument
            to="/heroes/$heroId"
            params={{ heroId: String(ownerHero.heroId) }}
            className="group mt-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/35 p-4 transition hover:border-primary/35 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="min-w-0 truncate text-xl font-bold text-foreground">{ownerHero.nameKr}</p>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
              영웅 상세
              <ChevronRight
                size={15}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </Link>
        </section>

        <div className="mt-6 space-y-6">
          <StatsSection stats={stats} />
          <EffectSection effect={effect} />
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
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
  displayName,
  classification,
  equipmentId,
}: {
  displayName: string;
  classification: string;
  equipmentId: number;
}) {
  const imageUrl = getOfficialEquipmentImageUrl(equipmentId);

  return (
    <header className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:p-7 md:flex-row md:items-center md:gap-7 lg:p-8">
        <div className="flex shrink-0 items-center justify-center self-center rounded-2xl border border-border bg-muted/25 p-2.5 md:self-auto">
          <img
            src={imageUrl}
            alt={displayName + " 장비 이미지"}
            decoding="async"
            className="h-28 w-28 object-contain sm:h-32 sm:w-32"
          />
        </div>

        <div className="min-w-0 flex-1 text-center md:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
              {classification}
            </span>
          </div>

          <h1 className="mt-4 break-keep text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {displayName}
          </h1>
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
