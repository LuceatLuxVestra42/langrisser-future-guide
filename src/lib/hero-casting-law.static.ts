import byHeroRaw from "../../data/generated/hero-casting-law-by-hero.v1.json";
import catalogRaw from "../../data/generated/hero-casting-law-materials.v1.json";

export type HeroCastingLawCostProfile = "A" | "B" | "C";

export type HeroCastingLawMaterialTotal = {
  itemId: number;
  count: number;
};

export type HeroCastingLawRangeTotals = {
  gold: number;
  materials: HeroCastingLawMaterialTotal[];
};

export type HeroCastingLawSlot = {
  sourceIndex: number;
  templateId: number;
  slotType: string;
  costProfile: HeroCastingLawCostProfile;
  templateNameCn: string | null;
  equipmentType: number | null;
  level1to5: HeroCastingLawRangeTotals;
  level6to10: HeroCastingLawRangeTotals;
  level1to10: HeroCastingLawRangeTotals;
};

export type HeroCastingLawRecord = {
  heroId: number;
  nameKr: string | null;
  nameCn: string | null;
  nameEn: string | null;
  sourceState: "RESOLVED";
  templateIds: number[];
  slots: HeroCastingLawSlot[];
  totals: {
    level1to5: HeroCastingLawRangeTotals;
    level6to10: HeroCastingLawRangeTotals;
    level1to10: HeroCastingLawRangeTotals;
  };
};

type HeroCastingLawByHeroArtifact = {
  version: 1;
  domain: "hero-casting-law-by-hero";
  status: "PASS";
  summary: {
    heroCount: number;
    templateReferenceCount: number;
    emptyTemplateHeroCount: number;
    weaponSlotCount: number;
    profileTemplateCounts: { A: number; B: number; C: number };
  };
  records: HeroCastingLawRecord[];
};

export type HeroCastingLawCatalogMaterial = {
  goodsType: number;
  id: number;
  count: number;
  item: {
    itemId: number;
    nameCn: string;
    descriptionCn: string;
    rank: number | null;
    icon: string | null;
    getPathDescriptionCn: string | null;
  };
};

export type HeroCastingLawCatalogLevel = {
  level: number;
  levelInfoId: number;
  nameCn: string | null;
  goldCost: number;
  predecessorLevelInfoId: number | null;
  properties: Array<{ slot: number; propertyId: number | null; value: number | null }>;
  materials: HeroCastingLawCatalogMaterial[];
};

export type HeroCastingLawCatalogTemplate = {
  templateId: number;
  nameCn: string | null;
  equipmentType: number | null;
  icon: string | null;
  levelInfoIds: number[];
  levels: HeroCastingLawCatalogLevel[];
};

type HeroCastingLawCatalogArtifact = {
  version: 1;
  domain: "hero-casting-law-materials";
  status: "PASS";
  summary: {
    templateCount: number;
    totalTemplateLevelCount: number;
    materialEntryCount: number;
    distinctMaterialItemCount: number;
  };
  templates: HeroCastingLawCatalogTemplate[];
};

const byHero = byHeroRaw as unknown as HeroCastingLawByHeroArtifact;
const catalog = catalogRaw as unknown as HeroCastingLawCatalogArtifact;

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

const byHeroId = new Map<number, HeroCastingLawRecord>();
for (const record of byHero.records) {
  if (!Number.isSafeInteger(record.heroId) || record.heroId <= 0 || byHeroId.has(record.heroId)) {
    throw new Error(`Per-Hero Casting Law identity violation at heroId=${String(record.heroId)}.`);
  }
  if (record.sourceState !== "RESOLVED" || record.slots.length !== record.templateIds.length || record.slots.length === 0) {
    throw new Error(`Hero ${record.heroId} has an invalid frozen Casting Law relation.`);
  }
  byHeroId.set(record.heroId, record);
}

const templateById = new Map<number, HeroCastingLawCatalogTemplate>();
const itemNameById = new Map<number, string>();
for (const template of catalog.templates) {
  if (
    !Number.isSafeInteger(template.templateId) ||
    template.templateId <= 0 ||
    templateById.has(template.templateId) ||
    template.levels.length !== 10
  ) {
    throw new Error(`Casting Law catalog template identity/coverage violation at templateId=${String(template.templateId)}.`);
  }
  templateById.set(template.templateId, template);
  for (const level of template.levels) {
    for (const material of level.materials) {
      const existing = itemNameById.get(material.id);
      if (existing && existing !== material.item.nameCn) {
        throw new Error(`Casting Law item ${material.id} has conflicting frozen names.`);
      }
      itemNameById.set(material.id, material.item.nameCn);
    }
  }
}

for (const record of byHero.records) {
  for (const slot of record.slots) {
    const template = templateById.get(slot.templateId);
    if (!template) {
      throw new Error(`Hero ${record.heroId} references missing Casting Law template ${slot.templateId}.`);
    }
  }
}

export function getStaticHeroCastingLaw(heroId: number) {
  return byHeroId.get(heroId) ?? null;
}

export function getStaticHeroCastingLawTemplate(templateId: number) {
  return templateById.get(templateId) ?? null;
}

export function getStaticHeroCastingLawMaterialName(itemId: number) {
  return itemNameById.get(itemId) ?? null;
}
