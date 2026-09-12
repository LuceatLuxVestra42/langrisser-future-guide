import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { SinglePickupLogPage } from "@/components/banner-log/single-pickup-log-page";

export const Route = createFileRoute("/banners_/single-log")({
  head: () => ({
    meta: [
      { title: "1인 배너 log | 가챠 배너 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "랑그릿사 모바일 1인 픽업 배너 재등장 로그를 확인합니다.",
      },
    ],
  }),
  component: SinglePickupLogRoute,
});

function SinglePickupLogRoute() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            to="/banners"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-primary/40 bg-card/95 px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/70 hover:bg-muted"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            가챠 배너로
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-primary/40 bg-card/95 px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/70 hover:bg-muted"
          >
            메인으로
          </Link>
        </div>

        <SinglePickupLogPage />
      </div>
    </main>
  );
}
