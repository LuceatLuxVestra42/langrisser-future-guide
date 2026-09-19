import byHeroRaw from "../../data/generated/hero-casting-law-by-hero.v1.json";
import catalogRaw from "../../data/generated/hero-casting-law-materials.v1.json";
import {
  getHeroCastingLawMaterialIconPublicPath,
  getHeroCastingLawMaterialIconSymbolId,
} from "./hero-casting-law-material-icon-assets";

type CostProfile = "A" | "B" | "C";

type MaterialTotal = {
  itemId: number;
  count: number;
};

type RangeTotals = {
  gold: number;
  materials: MaterialTotal[];
};

type FrozenSlot = {
  sourceIndex: number;
  templateId: number;
  slotType: string;
  costProfile: CostProfile;
  templateNameCn: string | null;
  equipmentType: number | null;
  level1to5: RangeTotals;
  level6to10: RangeTotals;
  level1to10: RangeTotals;
};

type FrozenHero = {
  heroId: number;
  sourceState: "RESOLVED";
  templateIds: number[];
  slots: FrozenSlot[];
  totals: {
    level1to5: RangeTotals;
    level6to10: RangeTotals;
    level1to10: RangeTotals;
  };
};

type ByHeroArtifact = {
  version: 1;
  domain: "hero-casting-law-by-hero";
  status: "PASS";
  summary: {
    heroCount: number;
    emptyTemplateHeroCount: number;
    profileTemplateCounts: { A: number; B: number; C: number };
  };
  records: FrozenHero[];
};

type CatalogMaterial = {
  goodsType: number;
  id: number;
  count: number;
  item: {
    itemId: number;
    nameCn: string;
    icon: string | null;
  };
};

type CatalogLevel = {
  level: number;
  levelInfoId: number;
  goldCost: number;
  materials: CatalogMaterial[];
};

type CatalogTemplate = {
  templateId: number;
  nameCn: string | null;
  equipmentType: number | null;
  levels: CatalogLevel[];
};

type CatalogArtifact = {
  version: 1;
  domain: "hero-casting-law-materials";
  status: "PASS";
  summary: {
    templateCount: number;
    totalTemplateLevelCount: number;
  };
  templates: CatalogTemplate[];
};

const byHero = byHeroRaw as unknown as ByHeroArtifact;
const catalog = catalogRaw as unknown as CatalogArtifact;

if (
  byHero.version !== 1 ||
  byHero.domain !== "hero-casting-law-by-hero" ||
  byHero.status !== "PASS" ||
  byHero.summary.heroCount !== 267 ||
  byHero.summary.emptyTemplateHeroCount !== 0 ||
  byHero.summary.profileTemplateCounts.A !== 25 ||
  byHero.summary.profileTemplateCounts.B !== 21 ||
  byHero.summary.profileTemplateCounts.C !== 4 ||
  byHero.records.length !== 267
) {
  throw new Error("Per-Hero Casting Law frozen artifact is not production-ready.");
}
if (
  catalog.version !== 1 ||
  catalog.domain !== "hero-casting-law-materials" ||
  catalog.status !== "PASS" ||
  catalog.summary.templateCount !== 50 ||
  catalog.summary.totalTemplateLevelCount !== 500 ||
  catalog.templates.length !== 50
) {
  throw new Error("Casting Law material catalog is not production-ready.");
}

const heroById = new Map<number, FrozenHero>();
for (const hero of byHero.records) {
  if (!Number.isSafeInteger(hero.heroId) || hero.heroId <= 0 || heroById.has(hero.heroId)) {
    throw new Error(`Per-Hero Casting Law identity violation at heroId=${String(hero.heroId)}.`);
  }
  if (hero.sourceState !== "RESOLVED" || hero.slots.length !== hero.templateIds.length || hero.slots.length === 0) {
    throw new Error(`Hero ${hero.heroId} has an invalid frozen Casting Law relation.`);
  }
  heroById.set(hero.heroId, hero);
}

const templateById = new Map<number, CatalogTemplate>();
for (const template of catalog.templates) {
  if (
    !Number.isSafeInteger(template.templateId) ||
    template.templateId <= 0 ||
    templateById.has(template.templateId) ||
    template.levels.length !== 10
  ) {
    throw new Error(`Casting Law template identity/coverage violation at templateId=${String(template.templateId)}.`);
  }
  templateById.set(template.templateId, template);
}

function materialPresentationById(template: CatalogTemplate, itemId: number) {
  for (const level of template.levels) {
    for (const material of level.materials) {
      if (material.id !== itemId) continue;
      const iconSymbolId = getHeroCastingLawMaterialIconSymbolId(material.id, material.item.icon);
      if (!iconSymbolId) {
        throw new Error(
          `Casting Law material ${material.id} has no verified icon mapping for sourcePath=${String(material.item.icon)}.`,
        );
      }
      return {
        nameCn: material.item.nameCn,
        sourceIconPath: material.item.icon,
        iconSymbolId,
      };
    }
  }
  throw new Error(`Casting Law template ${template.templateId} cannot resolve material Item ${itemId}.`);
}

function projectRange(template: CatalogTemplate, range: RangeTotals) {
  return {
    gold: range.gold,
    materials: range.materials.map((material) => ({
      itemId: material.itemId,
      count: material.count,
      ...materialPresentationById(template, material.itemId),
    })),
  };
}

export function readHeroCastingLawPresentation(heroId: number) {
  const hero = heroById.get(heroId);
  if (!hero) return null;

  const slots = hero.slots.map((slot) => {
    const template = templateById.get(slot.templateId);
    if (!template) {
      throw new Error(`Hero ${heroId} references missing Casting Law template ${slot.templateId}.`);
    }

    return {
      sourceIndex: slot.sourceIndex,
      templateId: slot.templateId,
      slotType: slot.slotType,
      costProfile: slot.costProfile,
      templateNameCn: slot.templateNameCn,
      equipmentType: slot.equipmentType,
      level1to5: projectRange(template, slot.level1to5),
      level6to10: projectRange(template, slot.level6to10),
      level1to10: projectRange(template, slot.level1to10),
      levels: template.levels.map((level) => ({
        level: level.level,
        levelInfoId: level.levelInfoId,
        goldCost: level.goldCost,
        materials: level.materials.map((material) => {
          const iconSymbolId = getHeroCastingLawMaterialIconSymbolId(material.id, material.item.icon);
          if (!iconSymbolId) {
            throw new Error(
              `Casting Law material ${material.id} has no verified icon mapping for sourcePath=${String(material.item.icon)}.`,
            );
          }
          return {
            itemId: material.id,
            count: material.count,
            nameCn: material.item.nameCn,
            sourceIconPath: material.item.icon,
            iconSymbolId,
          };
        }),
      })),
    };
  });

  const aggregatePresentation = new Map<number, { nameCn: string; sourceIconPath: string | null; iconSymbolId: string }>();
  for (const slot of slots) {
    for (const level of slot.levels) {
      for (const material of level.materials) {
        const existing = aggregatePresentation.get(material.itemId);
        const next = {
          nameCn: material.nameCn,
          sourceIconPath: material.sourceIconPath,
          iconSymbolId: material.iconSymbolId,
        };
        if (existing && JSON.stringify(existing) !== JSON.stringify(next)) {
          throw new Error(`Hero ${heroId} Casting Law material ${material.itemId} has conflicting presentation metadata.`);
        }
        aggregatePresentation.set(material.itemId, next);
      }
    }
  }
  const projectAggregate = (range: RangeTotals) => ({
    gold: range.gold,
    materials: range.materials.map((material) => {
      const presentation = aggregatePresentation.get(material.itemId);
      if (!presentation) {
        throw new Error(`Hero ${heroId} cannot resolve aggregate Casting Law material ${material.itemId}.`);
      }
      return { itemId: material.itemId, count: material.count, ...presentation };
    }),
  });

  return {
    heroId,
    iconSpritePublicPath: getHeroCastingLawMaterialIconPublicPath(),
    slots,
    totals: {
      level1to5: projectAggregate(hero.totals.level1to5),
      level6to10: projectAggregate(hero.totals.level6to10),
      level1to10: projectAggregate(hero.totals.level1to10),
    },
  };
}
