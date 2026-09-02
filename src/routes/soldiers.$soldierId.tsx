import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { SoldierDetailDialog } from "@/components/soldier-detail-dialog";
import { getStaticHeroCardIconIndex } from "@/lib/hero-card-icon-assets.static";
import { getSoldierPrototypePageData } from "@/lib/soldier-page.functions";

export const Route = createFileRoute("/soldiers/$soldierId")({
  loader: ({ params }) => {
    if (!/^[1-9]\d*$/.test(params.soldierId)) throw notFound();
    const soldierId = Number(params.soldierId);
    if (!Number.isSafeInteger(soldierId) || soldierId <= 0) throw notFound();
    const data = getSoldierPrototypePageData();
    const record = data.records.find((item) => item.soldierId === soldierId) ?? null;
    if (!record) throw notFound();

    const heroCardIcons = getStaticHeroCardIconIndex();
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

  return (
    <SoldierDetailDialog
      record={record}
      heroCardIcons={heroCardIcons}
      onClose={closeDetail}
    />
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
