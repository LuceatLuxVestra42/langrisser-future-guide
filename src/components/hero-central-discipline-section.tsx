import { Boxes, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

export type HeroCentralDisciplinePresentation = {
  status: string | null;
  released: boolean;
  skillId: number | null;
  nameCn: string | null;
  descCn: string | null;
  iconPath: string | null;
  templateIds: number[];
  unlock: {
    equipmentLevel: number | null;
    heroStarLevel: number | null;
    castingLawLevel: number | null;
    materials: Array<{
      goodsType: number | null;
      sourceId: number | null;
      count: number | null;
    }>;
  };
  resolver: string | null;
};

function stripConfigMarkup(value: string | null) {
  if (!value) return "-";
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}

function UnlockChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-3">
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

export function HeroCentralDisciplineSection({
  centralDiscipline,
}: {
  centralDiscipline: HeroCentralDisciplinePresentation;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-central-discipline>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <h2 className="font-bold text-foreground">중앙율정</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Stage 6 frozen 중앙율정 consumer의 효과와 해금 조건을 그대로 표시해.</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">
          {centralDiscipline.status ?? "-"}
        </span>
      </div>

      {centralDiscipline.released ? (
        <div className="mt-5 space-y-4">
          <article className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-muted-foreground">율정 효과</p>
                <h3 className="mt-1 text-lg font-bold text-foreground">
                  {centralDiscipline.nameCn ?? (centralDiscipline.skillId != null ? `Skill ${centralDiscipline.skillId}` : "중앙율정")}
                </h3>
              </div>
              {centralDiscipline.skillId != null ? (
                <span className="rounded-md bg-background px-2 py-1 text-[11px] font-bold text-muted-foreground">Skill #{centralDiscipline.skillId}</span>
              ) : null}
            </div>
            <p className="mt-4 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(centralDiscipline.descCn)}</p>
          </article>

          <div className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-sm font-bold text-foreground">해금 조건</h3>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <UnlockChip label="장비 레벨" value={centralDiscipline.unlock.equipmentLevel != null ? `Lv.${centralDiscipline.unlock.equipmentLevel}` : "-"} />
              <UnlockChip label="영웅 성급" value={centralDiscipline.unlock.heroStarLevel != null ? `${centralDiscipline.unlock.heroStarLevel}성` : "-"} />
              <UnlockChip label="율정 레벨" value={centralDiscipline.unlock.castingLawLevel != null ? `Lv.${centralDiscipline.unlock.castingLawLevel}` : "-"} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-bold text-foreground">해금 재료</h3>
              </div>
              {centralDiscipline.unlock.materials.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {centralDiscipline.unlock.materials.map((material, index) => (
                    <div key={`${material.goodsType ?? "g"}-${material.sourceId ?? "i"}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-xs">
                      <span className="font-semibold text-foreground">
                        GoodsType {material.goodsType ?? "-"}{material.sourceId != null ? ` · ID ${material.sourceId}` : ""}
                      </span>
                      <span className="font-bold text-muted-foreground">× {material.count ?? "-"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">표시 가능한 해금 재료 없음</p>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-bold text-foreground">율정 템플릿</h3>
              </div>
              {centralDiscipline.templateIds.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {centralDiscipline.templateIds.map((templateId) => (
                    <span key={templateId} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground">Template #{templateId}</span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">표시 가능한 템플릿 없음</p>
              )}
            </div>
          </div>

          {centralDiscipline.resolver ? (
            <p className="text-[11px] leading-5 text-muted-foreground">Frozen resolver: {centralDiscipline.resolver}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          현재 frozen Hero consumer에서 공개된 중앙율정 상세가 없어.
        </div>
      )}
    </section>
  );
}
