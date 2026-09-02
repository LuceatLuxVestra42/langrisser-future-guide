import { createFileRoute, Link } from "@tanstack/react-router";
import { Dumbbell } from "lucide-react";

export const Route = createFileRoute("/soldiers/")({
  component: SoldierIndexAction,
});

function SoldierIndexAction() {
  return (
    <Link
      to="/soldiers/training"
      className="fixed top-6 z-20 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:top-10"
      style={{ right: "max(1rem, calc((100vw - 80rem) / 2 + 2rem))" }}
      aria-label="훈련장 열기"
    >
      <Dumbbell className="h-4 w-4" aria-hidden="true" />
      훈련장
    </Link>
  );
}
