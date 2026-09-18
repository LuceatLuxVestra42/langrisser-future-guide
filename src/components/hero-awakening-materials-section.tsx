import { getHeroAwakeningMaterialIconUrl } from "@/lib/hero-awakening-material-icon-assets";
import {
  getStaticHeroAwakeningMaterials,
  type HeroAwakeningMaterialEntry,
} from "@/lib/hero-awakening-materials.static";

function MaterialList({
  materials,
  stage,
}: {
  materials: HeroAwakeningMaterialEntry[];
  stage: 1 | 2;
}) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
      {materials.map((material, index) => {
        const iconUrl = getHeroAwakeningMaterialIconUrl(material.item.icon);
        if (!iconUrl) {
          throw new Error(
            `Awakening stage ${stage} material ${material.id} has no admitted icon for sourcePath=${String(material.item.icon)}.`,
          );
        }

        return (
          <li
            key={`${material.id}-${index}`}
            className="inline-flex items-center gap-2"
            data-awakening-stage={stage}
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
  );
}

export function HeroAwakeningMaterialsSection({ heroId }: { heroId: number }) {
  const hero = getStaticHeroAwakeningMaterials(heroId);
  if (!hero) {
    throw new Error(`Hero ${heroId} has no frozen awakening-material record.`);
  }
  if (!hero.stage1 && !hero.awakening) return null;

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-hero-awakening-materials="true"
      data-awakening-stage1-material-entry-count={hero.stage1?.materials.length ?? 0}
      data-awakening-stage2-material-entry-count={hero.awakening?.materials.length ?? 0}
      data-awakening-skill-id={hero.awakening?.skillId ?? ""}
    >
      <h2 className="text-lg font-extrabold tracking-tight text-foreground">각성 재료</h2>

      {hero.stage1 ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4" data-awakening-stage-section="1">
          <p className="text-sm font-extrabold text-foreground">1단계 · 스킬 Cost 상한 6</p>
          <MaterialList materials={hero.stage1.materials} stage={1} />
        </div>
      ) : null}

      {hero.awakening ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/20 p-4" data-awakening-stage-section="2">
          <p className="text-sm font-extrabold text-foreground">2단계 · 각성기 습득</p>
          <MaterialList materials={hero.awakening.materials} stage={2} />
        </div>
      ) : null}
    </section>
  );
}
