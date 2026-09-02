import { ShieldCheck } from "lucide-react";

export type HeroCentralDisciplinePresentation = {
  released: boolean;
  descCn: string | null;
};

function stripConfigMarkup(value: string | null) {
  if (!value) return "-";
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}

export function HeroCentralDisciplineSection({
  centralDiscipline,
}: {
  centralDiscipline: HeroCentralDisciplinePresentation;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-central-discipline>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        <h2 className="font-bold text-foreground">중앙율정</h2>
      </div>

      {centralDiscipline.released ? (
        <article className="mt-5 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
          <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(centralDiscipline.descCn)}</p>
        </article>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">중앙율정 없음</p>
      )}
    </section>
  );
}
