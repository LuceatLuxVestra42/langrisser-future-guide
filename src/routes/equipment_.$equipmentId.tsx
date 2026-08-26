import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { getEquipmentDetailPageData } from "@/lib/equipment-page.functions";

export const Route = createFileRoute("/equipment/$equipmentId")({
  loader: async ({ params }) => {
    if (!/^\d+$/.test(params.equipmentId)) {
      throw notFound();
    }

    const equipmentId = Number(params.equipmentId);
    if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) {
      throw notFound();
    }

    const data = await getEquipmentDetailPageData({ data: { equipmentId } });
    if (!data) {
      throw notFound();
    }

    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.displayName} | 랑그릿사 모바일 장비`
          : "장비 | 랑그릿사 모바일 미래시 정보",
      },
    ],
  }),
  component: EquipmentDetailRouteScaffold,
  notFoundComponent: EquipmentNotFound,
});

function EquipmentDetailRouteScaffold() {
  const data = Route.useLoaderData();

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-12">
      <Link
        to={data.kind === "exclusive" ? "/equipment/exclusive" : "/equipment"}
        className="text-sm font-medium text-muted-foreground"
      >
        ← {data.kind === "exclusive" ? "전용장비" : "SSR 장비"}
      </Link>

      <section className="mt-6 rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Equipment Stage 4-1</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">{data.displayName}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          equipmentId {data.equipmentId} · {data.kind}
        </p>
        {data.ownerHero ? (
          <p className="mt-1 text-sm text-muted-foreground">
            전용 영웅: {data.ownerHero.nameKr}
          </p>
        ) : null}
        <p className="mt-5 text-sm text-muted-foreground">
          Detail loader scaffold ready. 실제 상세 블록 UI는 Stage 4-3/4-4에서 연결합니다.
        </p>
      </section>
    </main>
  );
}

function EquipmentNotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-12">
      <h1 className="text-2xl font-bold text-foreground">공개 장비를 찾을 수 없습니다.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        공개 consumer에 포함되지 않은 장비이거나 잘못된 equipmentId입니다.
      </p>
      <Link to="/equipment" className="mt-6 inline-block text-sm font-medium text-foreground">
        SSR 장비로 돌아가기
      </Link>
    </main>
  );
}
