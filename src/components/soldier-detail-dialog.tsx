import { X } from "lucide-react";
import { useEffect, type ComponentProps } from "react";

import { SoldierDetailModal } from "@/components/soldier-detail-modal";

type SoldierDetailDialogProps = ComponentProps<typeof SoldierDetailModal> & {
  onClose: () => void;
};

export function SoldierDetailDialog({
  record,
  heroCardIcons,
  onClose,
}: SoldierDetailDialogProps) {
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
        aria-labelledby="soldier-detail-title"
        className="relative max-h-[calc(100dvh-1rem)] w-full max-w-6xl overflow-y-auto sm:max-h-[90vh]"
      >
        <button
          type="button"
          aria-label="상세 창 닫기"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <SoldierDetailModal
          key={record.soldierId}
          record={record}
          heroCardIcons={heroCardIcons}
        />
      </div>
    </div>
  );
}
