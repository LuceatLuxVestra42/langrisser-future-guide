import { createFileRoute, Link } from "@tanstack/react-router";

import { getGeneralEquipmentPageData } from "@/lib/equipment-page.functions";

export const Route = createFileRoute("/equipment")({
  loader: () => getGeneralEquipmentPageData(),
  head: () => ({
    meta: [
      { title: "SSR 장비 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "랑그릿사 모바일 SSR 일반 장비 목록과 분류 정보를 확인합니다.",
      },
    ],
  }),
  component: EquipmentRouteScaffold,
});

function EquipmentRouteScaffold() {
  const data = Route.useLoaderData();

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-12">
      <div className="flex items-center justify-between gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Equipment Stage 4-1</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">SSR 장비</h1>
        </div>
        <Link
          to="/equipment/exclusive"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          전용장비 보러가기
        </Link>
      </div>

      <section className="mt-8 rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Route/loader scaffold ready. 목록 UI는 Stage 4-2에서 연결합니다.
        </p>
        <p className="mt-3 text-lg font-semibold text-foreground">
          일반 장비 {data.records.length}개
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          탭 {data.tabs["1"] ?? 0} / {data.tabs["2"] ?? 0} / {data.tabs["3"] ?? 0}
        </p>
      </section>
    </main>
  );
}
