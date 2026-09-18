import { getHeroAwakeningMaterialIconUrl } from "@/lib/hero-awakening-material-icon-assets";
import { getStaticHeroAwakeningMaterials } from "@/lib/hero-awakening-materials.static";


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
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
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
              className="inline-flex items-center gap-2"
              data-awakening-material-id={material.id}
              data-awakening-material-icon={material.item.icon ?? ""}
            >
              <img
                src={iconUrl}
                alt={material.item.nameCn}
                title={material.item.nameCn}
                loading="lazy"
                decoding="async"
                className="h-12 w-12 shrink-0 object-contain"
              />
              <span className="text-sm font-extrabold tabular-nums text-foreground">x {material.count}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
