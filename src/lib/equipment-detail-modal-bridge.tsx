import { Link } from "@tanstack/react-router";
import { ChevronRight, Sparkles, Swords, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";

import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";
import { getEquipmentDetailPageData } from "@/lib/equipment-page.functions";
import type {
  ExclusiveEquipmentDetailPageData,
  GeneralEquipmentDetailPageData,
} from "@/lib/equipment-page.server";

type EquipmentDetailData =
  | GeneralEquipmentDetailPageData
  | ExclusiveEquipmentDetailPageData;
type Stats = GeneralEquipmentDetailPageData["detail"]["stats"];
type Effect = GeneralEquipmentDetailPageData["detail"]["effect"];

export function EquipmentDetailModalBridge() {
  const [equipmentId, setEquipmentId] = useState<number | null>(null);

  useEffect(() => {
    const handleClickCapture = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const currentUrl = new URL(window.location.href);
      if (!/\/equipment(?:\/exclusive)?\/?$/.test(currentUrl.pathname)) return;

      const anchor = event
        .composedPath()
        .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, currentUrl);
      if (destination.origin !== currentUrl.origin) return;

      const match = destination.pathname.match(/\/equipment\/([1-9]\d*)\/?$/);
      if (!match) return;

      const nextEquipmentId = Number(match[1]);
      if (!Number.isSafeInteger(nextEquipmentId) || nextEquipmentId <= 0) return;

      event.preventDefault();
      event.stopPropagation();
      setEquipmentId(nextEquipmentId);
    };

    document.addEventListener("click", handleClickCapture, true);
    return () => document.removeEventListener("click", handleClickCapture, true);
  }, []);

  if (equipmentId === null) return null;

  return (
    <EquipmentDetailDialog
      key={equipmentId}
      equipmentId={equipmentId}
      onClose={() => setEquipmentId(null)}
    />
  );
}

function EquipmentDetailDialog({
  equipmentId,
  onClose,
}: {
  equipmentId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<EquipmentDetailData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setData(null);
    setLoadState("loading");

    void getEquipmentDetailPageData({ data: { equipmentId } })
      .then((result) => {
        if (!active) return;
        if (!result) {
          setLoadState("error");
          return;
        }
        setData(result);
        setLoadState("ready");
      })
      .catch(() => {
        if (active) setLoadState("error");
      });

    return () => {
      active = false;
    };
  }, [equipmentId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-detail-title"
        aria-busy={loadState === "loading"}
        className="relative max-h-[calc(100dvh-1rem)] w-full max-w-5xl overflow-y-auto rounded-2xl bg-background shadow-2xl sm:max-h-[90vh]"
      >
        <button
          type="button"
          aria-label="장비 상세 창 닫기"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {loadState === "loading" ? (
          <div className="flex min-h-72 items-center justify-center px-6 py-16 text-sm font-semibold text-muted-foreground">
            장비 정보를 불러오는 중이야.
          </div>
        ) : loadState === "error" || !data ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 py-16 text-center">
            <h2 id="equipment-detail-title" className="text-xl font-bold text-foreground">
              장비 정보를 불러올 수 없어
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">잠시 후 다시 열어봐.</p>
          </div>
        ) : (
          <EquipmentDetailContent data={data} />
        )}
      </div>
    </div>
  );
}

function EquipmentDetailContent({ data }: { data: EquipmentDetailData }) {
  const { classification, stats, effect } = data.detail;

  return (
    <div className="p-4 pt-14 sm:p-6 sm:pt-14 lg:p-8 lg:pt-14">
      <EquipmentHeader
        displayName={data.displayName}
        classification={`${classification.groupKo} · ${classification.subtypeKo}`}
        equipmentId={data.equipmentId}
      />

      {data.kind === "exclusive" ? <ExclusiveHeroSection data={data} /> : null}

      <div className="mt-6 space-y-6">
        <StatsSection stats={stats} />
        <EffectSection effect={effect} />
      </div>
    </div>
  );
}

function ExclusiveHeroSection({ data }: { data: ExclusiveEquipmentDetailPageData }) {
  const { ownerHero } = data;

  return (
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
    <header className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:p-7 md:flex-row md:items-center md:gap-7 lg:p-8">
        <div className="flex shrink-0 items-center justify-center self-center rounded-2xl border border-border bg-muted/25 p-2.5 md:self-auto">
          <img
            src={imageUrl}
            alt={`${displayName} 장비 이미지`}
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

          <h1
            id="equipment-detail-title"
            className="mt-4 break-keep text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
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
