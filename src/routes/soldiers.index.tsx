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
      className="absolute top-6 z-20 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-sky-400 bg-sky-100 px-4 py-2.5 text-sm font-semibold text-sky-950 shadow-sm transition hover:border-sky-500 hover:bg-sky-200 lg:top-10"
      style={{ right: "max(1rem, calc((100vw - 80rem) / 2 + 2rem))" }}
      aria-label="훈련장"
    >
      훈련장
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
