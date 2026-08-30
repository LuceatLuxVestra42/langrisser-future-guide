import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useCallback, useEffect } from "react";

import { SoldierDetailModal } from "@/components/soldier-detail-modal";
import { getHeroCardIconIndex } from "@/lib/hero-card-icon-assets.functions";
import { getSoldierPrototypePageData } from "@/lib/soldier-page.functions";

export const Route = createFileRoute("/soldiers/$soldierId")({
  loader: async ({ params }) => {
    if (!/^[1-9]\d*$/.test(params.soldierId)) throw notFound();
    const soldierId = Number(params.soldierId);
    if (!Number.isSafeInteger(soldierId) || soldierId <= 0) throw notFound();
    const data = getSoldierPrototypePageData();
    const record = data.records.find((item) => item.soldierId === soldierId) ?? null;
    if (!record) throw notFound();

    const heroCardIcons = await getHeroCardIconIndex();
    if (
      heroCardIcons.summary.total !== 267 ||
      heroCardIcons.summary.resolved !== 267 ||
      heroCardIcons.summary.pending !== 0 ||
      heroCardIcons.summary.hardErrors !== 0 ||
      heroCardIcons.records.length !== 267
    ) {
      throw new Error("Hero card icon frozen index is not production-ready.");
    }

    return { record, heroCardIcons: heroCardIcons.records };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.record.nameKr ?? loaderData.record.nameCn} | 랑그릿사 모바일 용병` : "용병 | 랑그릿사 모바일 미래시 정보" }],
  }),
  component: SoldierDetailRoute,
  notFoundComponent: SoldierNotFound,
});

function SoldierDetailRoute() {
  const { record, heroCardIcons } = Route.useLoaderData();
  const navigate = useNavigate();
  const closeDetail = useCallback(() => {
    void navigate({ to: "/soldiers", replace: true, resetScroll: false });
  }, [navigate]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeDetail]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDetail(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="soldier-detail-title" className="relative max-h-[calc(100dvh-1rem)] w-full max-w-6xl overflow-y-auto sm:max-h-[90vh]">
        <button type="button" aria-label="상세 창 닫기" onClick={closeDetail} className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <SoldierDetailModal key={record.soldierId} record={record} heroCardIcons={heroCardIcons} />
      </div>
    </div>
  );
}

function SoldierNotFound() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="soldier-not-found-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
        <h2 id="soldier-not-found-title" className="text-xl font-black text-foreground">용병을 찾을 수 없어</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">공개 대상 Soldier ID가 아니거나 존재하지 않는 주소야.</p>
        <Link to="/soldiers" replace resetScroll={false} className="mt-5 inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">용병 목록으로</Link>
      </section>
    </div>
  );
}
