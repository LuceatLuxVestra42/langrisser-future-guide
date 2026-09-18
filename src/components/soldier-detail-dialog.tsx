import { X } from "lucide-react";
import { useEffect, useMemo, type ComponentProps } from "react";
import { createPortal } from "react-dom";

import { SoldierDetailModal } from "@/components/soldier-detail-modal";
import { resolveHeroDisplayNameKr } from "@/lib/hero-display-name";

type SoldierDetailDialogProps = ComponentProps<typeof SoldierDetailModal> & {
  onClose: () => void;
};

export function SoldierDetailDialog({
  record,
  heroCardIcons,
  onClose,
}: SoldierDetailDialogProps) {
  const presentedHeroCardIcons = useMemo(
    () => heroCardIcons.map((card) => ({
      ...card,
      nameKr: resolveHeroDisplayNameKr(card.heroId, card.nameKr, card.nameCn),
    })),
    [heroCardIcons],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const mainElement = document.querySelector("main");
    const previousMainPointerEvents = mainElement instanceof HTMLElement
      ? mainElement.style.pointerEvents
      : null;

    document.body.style.overflow = "hidden";
    if (mainElement instanceof HTMLElement) {
      mainElement.style.pointerEvents = "none";
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (mainElement instanceof HTMLElement && previousMainPointerEvents != null) {
        mainElement.style.pointerEvents = previousMainPointerEvents;
      }
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="soldier-detail-title"
        className="pointer-events-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col sm:max-h-[90vh]"
      >
        <div className="flex shrink-0 justify-end pb-2">
          <button
            type="button"
            aria-label="상세 창 닫기"
            aria-controls="soldier-detail-title"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">
          <SoldierDetailModal
            key={record.soldierId}
            record={record}
            heroCardIcons={presentedHeroCardIcons}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
