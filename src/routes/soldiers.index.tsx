import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/soldiers/")({
  component: SoldierIndexAction,
});

function SoldierIndexAction() {
  return (
    <Link
      reloadDocument
      to="/soldiers/training"
      className="absolute top-6 z-20 inline-flex items-center justify-center gap-2 rounded-xl border border-primary/25 bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/45 hover:bg-accent lg:top-10"
      style={{ right: "max(1rem, calc((100vw - 80rem) / 2 + 2rem))" }}
      aria-label="훈련장"
    >
      훈련장
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
