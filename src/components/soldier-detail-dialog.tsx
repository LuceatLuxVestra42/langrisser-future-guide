import { X } from "lucide-react";
import { useEffect, useMemo, type ComponentProps } from "react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-black/60"
        onMouseDown={onClose}
      />
      <button
        type="button"
        aria-label="상세 창 닫기"
        aria-controls="soldier-detail-title"
        onClick={onClose}
        className="fixed right-3 top-3 z-[70] flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-5 sm:top-5"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="soldier-detail-title"
        className="relative z-10 w-full max-w-6xl"
      >
        <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-[90vh]">
          <SoldierDetailModal
            key={record.soldierId}
            record={record}
            heroCardIcons={presentedHeroCardIcons}
          />
        </div>
      </div>
    </div>
  );
}
