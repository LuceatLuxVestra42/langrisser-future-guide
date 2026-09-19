import byHeroRaw from "../../data/generated/hero-casting-law-by-hero.v1.json";
import catalogRaw from "../../data/generated/hero-casting-law-materials.v1.json";
import iconAssetsRaw from "../../data/generated/hero-casting-law-material-icon-assets.v1.json";

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

type CastingLawIconAssetRecord = {
  itemId: number;
  nameCn: string;
  rank: number | null;
  sourcePath: string;
  asset: {
    repository: "redpanda7301/langrisser";
    commit: string;
    path: string;
    fileName: string;
    gitBlobSha: string;
    bytes: number;
    url: string;
  };
};

type CastingLawIconAssetArtifact = {
  version: 1;
  schemaId: "hero-casting-law-material-icon-assets/v1";
  status: "FROZEN";
  completion: "COMPLETE";
  semanticReopen: false;
  summary: {
    targetCount: number;
    resolvedCount: number;
    unresolvedCount: number;
    uniqueItemIdCount: number;
    uniqueSourcePathCount: number;
    uniqueAssetUrlCount: number;
  };
  records: CastingLawIconAssetRecord[];
};

const byHero = byHeroRaw as unknown as ByHeroArtifact;
const catalog = catalogRaw as unknown as CatalogArtifact;
const iconAssets = iconAssetsRaw as unknown as CastingLawIconAssetArtifact;

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
if (
  iconAssets.version !== 1 ||
  iconAssets.schemaId !== "hero-casting-law-material-icon-assets/v1" ||
  iconAssets.status !== "FROZEN" ||
  iconAssets.completion !== "COMPLETE" ||
  iconAssets.semanticReopen !== false ||
  iconAssets.summary.targetCount !== 45 ||
  iconAssets.summary.resolvedCount !== 45 ||
  iconAssets.summary.unresolvedCount !== 0 ||
  iconAssets.records.length !== 45
) {
  throw new Error("Casting Law material icon asset map is not production-ready.");
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

const iconAssetByItemId = new Map<number, CastingLawIconAssetRecord>();
for (const record of iconAssets.records) {
  if (!Number.isSafeInteger(record.itemId) || record.itemId <= 0 || iconAssetByItemId.has(record.itemId)) {
    throw new Error(`Casting Law icon asset identity violation at itemId=${String(record.itemId)}.`);
  }
  if (!record.sourcePath || !record.asset?.url || !record.asset?.gitBlobSha) {
    throw new Error(`Casting Law icon asset provenance missing at itemId=${record.itemId}.`);
  }
  iconAssetByItemId.set(record.itemId, record);
}

for (const template of catalog.templates) {
  for (const level of template.levels) {
    for (const material of level.materials) {
      const asset = iconAssetByItemId.get(material.item.itemId);
      if (!asset || asset.sourcePath !== material.item.icon || asset.nameCn !== material.item.nameCn) {
        throw new Error(`Casting Law icon asset/catalog parity mismatch at itemId=${material.item.itemId}.`);
      }
    }
  }
}

function materialPresentationById(template: CatalogTemplate, itemId: number) {
  for (const level of template.levels) {
    for (const material of level.materials) {
      if (material.id !== itemId) continue;
      const asset = iconAssetByItemId.get(itemId);
      if (!asset || asset.sourcePath !== material.item.icon) {
        throw new Error(`Casting Law template ${template.templateId} cannot resolve icon asset for Item ${itemId}.`);
      }
      return { nameCn: material.item.nameCn, iconUrl: asset.asset.url };
    }
  }
  throw new Error(`Casting Law template ${template.templateId} cannot resolve material Item ${itemId}.`);
}

function projectRange(template: CatalogTemplate, range: RangeTotals) {
  return {
    gold: range.gold,
    materials: range.materials.map((material) => {
      const presentation = materialPresentationById(template, material.itemId);
      return {
        itemId: material.itemId,
        count: material.count,
        nameCn: presentation.nameCn,
        iconUrl: presentation.iconUrl,
      };
    }),
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
          const asset = iconAssetByItemId.get(material.id);
          if (!asset || asset.sourcePath !== material.item.icon) {
            throw new Error(`Casting Law level material icon parity mismatch at Item ${material.id}.`);
          }
          return {
            itemId: material.id,
            count: material.count,
            nameCn: material.item.nameCn,
            iconUrl: asset.asset.url,
          };
        }),
      })),
    };
  });

  const aggregatePresentation = new Map<number, { nameCn: string; iconUrl: string }>();
  for (const slot of slots) {
    for (const level of slot.levels) {
      for (const material of level.materials) {
        const existing = aggregatePresentation.get(material.itemId);
        if (existing && (existing.nameCn !== material.nameCn || existing.iconUrl !== material.iconUrl)) {
          throw new Error(`Hero ${heroId} Casting Law material ${material.itemId} has conflicting presentation data.`);
        }
        aggregatePresentation.set(material.itemId, { nameCn: material.nameCn, iconUrl: material.iconUrl });
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
      return {
        itemId: material.itemId,
        count: material.count,
        nameCn: presentation.nameCn,
        iconUrl: presentation.iconUrl,
      };
    }),
  });

  return {
    heroId,
    slots,
    totals: {
      level1to5: projectAggregate(hero.totals.level1to5),
      level6to10: projectAggregate(hero.totals.level6to10),
      level1to10: projectAggregate(hero.totals.level1to10),
    },
  };
}
