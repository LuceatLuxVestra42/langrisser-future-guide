import { getHeroCentralDisciplineKoBySkillId } from "@/lib/hero-central-discipline-ko";

export type HeroCentralDisciplinePresentation = {
  released: boolean;
  skillId: number | null;
  descCn: string | null;
};

function stripConfigMarkup(value: string) {
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}

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
  }

  const fallbackChineseText = centralDiscipline.released && !koreanPresentation
    ? centralDiscipline.descCn?.trim() || null
    : null;
  const effectText = koreanPresentation?.effectTextKo ?? (fallbackChineseText ? stripConfigMarkup(fallbackChineseText) : null);

  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-central-discipline>
      <h2 className="font-bold text-foreground">중앙율정</h2>

      {effectText ? (
        <article
          className="mt-4"
          data-central-discipline-skill-id={centralDiscipline.skillId ?? undefined}
          data-central-discipline-source-sheet={koreanPresentation?.source.sheet}
          data-central-discipline-source-row={koreanPresentation?.source.effectRow}
          data-central-discipline-localization={koreanPresentation ? "ko" : "cn-fallback"}
        >
          {!koreanPresentation ? (
            <p className="mb-2 text-xs font-semibold text-muted-foreground">한국어 설명 준비 중 · 중국 서버 원문</p>
          ) : null}
          <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{effectText}</p>
        </article>
      ) : centralDiscipline.released ? (
        <p className="mt-4 text-sm text-muted-foreground">중앙율정 설명 준비 중</p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">중앙율정 없음</p>
      )}
    </section>
  );
}
