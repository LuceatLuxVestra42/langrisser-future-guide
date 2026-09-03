import { ShieldCheck } from "lucide-react";

import { getHeroCentralDisciplineKoBySkillId } from "@/lib/hero-central-discipline-ko";

export type HeroCentralDisciplinePresentation = {
  released: boolean;
  skillId: number | null;
  descCn: string | null;
};

export function HeroCentralDisciplineSection({
  centralDiscipline,
}: {
  centralDiscipline: HeroCentralDisciplinePresentation;
}) {
  let koreanPresentation = null;
  if (centralDiscipline.released) {
    if (centralDiscipline.skillId == null) {
      throw new Error("Released Hero central discipline is missing its frozen Skill ID.");
    }
    koreanPresentation = getHeroCentralDisciplineKoBySkillId(centralDiscipline.skillId);
    if (!koreanPresentation) {
      throw new Error(
        `Released Hero central discipline Skill ${centralDiscipline.skillId} is missing its Korean presentation overlay.`,
      );
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-central-discipline>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        <h2 className="font-bold text-foreground">중앙율정</h2>
      </div>

      {koreanPresentation ? (
        <article
          className="mt-5 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5"
          data-central-discipline-skill-id={centralDiscipline.skillId ?? undefined}
          data-central-discipline-source-sheet={koreanPresentation.source.sheet}
          data-central-discipline-source-row={koreanPresentation.source.effectRow}
        >
          <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{koreanPresentation.effectTextKo}</p>
        </article>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">중앙율정 없음</p>
      )}
    </section>
  );
}
