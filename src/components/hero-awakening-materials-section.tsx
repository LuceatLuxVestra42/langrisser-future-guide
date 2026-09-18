import { getHeroAwakeningMaterialIconUrl } from "@/lib/hero-awakening-material-icon-assets";
import { getStaticHeroAwakeningMaterials } from "@/lib/hero-awakening-materials.static";

function stripConfigMarkup(value: string) {
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}

export function HeroAwakeningMaterialsSection({ heroId }: { heroId: number }) {
  const hero = getStaticHeroAwakeningMaterials(heroId);
  if (!hero) {
    throw new Error(`Hero ${heroId} has no frozen awakening-material record.`);
  }
  if (!hero.awakening) return null;

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-awakening-materials="true"
      data-awakening-skill-id={hero.awakening.skillId}
      data-awakening-material-entry-count={hero.awakening.materials.length}
    >
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-foreground">각성기 재료</h2>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          검증된 중국 서버 ConfigData 기준 · 재료명은 중국 서버 원문
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-foreground">각성기 습득</span>
          <span className="text-[11px] font-bold text-muted-foreground">Skill {hero.awakening.skillId}</span>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {hero.awakening.materials.map((material, index) => {
            const iconUrl = getHeroAwakeningMaterialIconUrl(material.item.icon);
            if (!iconUrl) {
              throw new Error(
                `Awakening material ${material.id} has no admitted icon for sourcePath=${String(material.item.icon)}.`,
              );
            }

            return (
              <li
                key={`${material.id}-${index}`}
                className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/70 px-3 py-3"
                data-awakening-material-id={material.id}
                data-awakening-material-icon={material.item.icon ?? ""}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-1 shadow-sm">
                  <img
                    src={iconUrl}
                    alt={material.item.nameCn}
                    title={material.item.nameCn}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="text-sm font-extrabold tabular-nums text-foreground">×{material.count}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
