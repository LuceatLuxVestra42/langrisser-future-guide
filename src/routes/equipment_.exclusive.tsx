import { createFileRoute, Link } from "@tanstack/react-router";

import { getExclusiveEquipmentPageData } from "@/lib/equipment-page.functions";

export const Route = createFileRoute("/equipment/exclusive")({
  loader: () => getExclusiveEquipmentPageData(),
  head: () => ({
    meta: [
      { title: "전용장비 | 랑그릿사 모바일 미래시 정보" },
      {
        name: "description",
        content: "랑그릿사 모바일 영웅 전용장비와 소유 영웅 관계를 확인합니다.",
      },
    ],
  }),
  component: ExclusiveEquipmentRouteScaffold,
});

function ExclusiveEquipmentRouteScaffold() {
  const data = Route.useLoaderData();

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-12">
      <Link to="/equipment" className="text-sm font-medium text-muted-foreground">
        ← SSR 장비
      </Link>

      <section className="mt-6 rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Equipment Stage 4-1</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">전용장비</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Route/loader scaffold ready. 전용장비 UI는 Stage 4-4에서 연결합니다.
        </p>
        <p className="mt-3 text-lg font-semibold text-foreground">
          전용장비 {data.records.length}개
        </p>
      </section>
    </main>
  );
}
