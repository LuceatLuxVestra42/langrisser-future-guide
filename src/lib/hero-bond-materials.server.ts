import artifactRaw from "../../data/generated/hero-bond-level-materials.v1.json";
import summaryRaw from "../../data/validation/hero-bond-level-materials-summary.v1.json";

type FrozenMaterial = {
  itemType: number;
  itemId: number;
  count: number;
};

type FrozenLevel = {
  targetLevel: number;
  goldCost: number;
  materials: FrozenMaterial[];
};

type FrozenProfile = {
  profileId: string;
  levels: FrozenLevel[];
  total: {
    gold: number;
    materials: FrozenMaterial[];
  };
};

type ItemCatalogRow = {
  itemType: number;
  itemId: number;
  nameCn: string | null;
  descriptionCn: string | null;
  icon: string | null;
};

type FrozenHero = {
  heroId: number;
  identity: {
    nameKr: string | null;
    nameCn: string;
    nameEn: string | null;
  };
  regularFetters: Array<{
    order: number;
    fetterId: number;
    nameCn: string | null;
    costProfileId: string;
  }>;
  heartFetter: {
    heartFetterId: number;
    sourceIndex: number;
    nameCn: string | null;
    costProfileId: string;
  };
};

type Artifact = {
  schemaVersion: 1;
  stage: "hero-bond-level-materials-v1";
  status: "FROZEN_CANDIDATE";
  semanticAuthority: false;
  owner: "hero-canonical";
  counts: {
    heroes: number;
    regularFetterRefs: number;
    heartFetterRefs: number;
    regularCostProfiles: number;
    heartCostProfiles: number;
    materialItems: number;
  };
  regularCostProfiles: FrozenProfile[];
  heartCostProfiles: FrozenProfile[];
  itemCatalog: ItemCatalogRow[];
  records: FrozenHero[];
};

type Summary = {
  version: 1;
  stage: "hero-bond-level-materials-v1";
  status: "PASS";
  owner: "hero-canonical";
  counts: Artifact["counts"];
  coverage: {
    heroPopulationComplete: boolean;
    fiveRegularFettersPerHero: boolean;
    oneHeartFetterPerHero: boolean;
    targetLevelsPerProfile: number;
    targetLevelRange: [number, number];
    unresolvedMaterialItems: number;
    conflictingMaterialMetadata: number;
  };
  normalization: {
    perHeroCostRowsDuplicated: boolean;
    regularCostProfiles: number;
    heartCostProfiles: number;
  };
  boundaries: {
    regularCostsReusedFromFrozenHeroConsumer: boolean;
    heartRelationReusedFromFrozenRawEvidence: boolean;
    rawHeroInfoReselection: boolean;
    nameJoin: boolean;
    idArithmetic: boolean;
    newBondEffectSemantics: boolean;
    frontendMutation: boolean;
  };
};

const artifact = artifactRaw as unknown as Artifact;
const summary = summaryRaw as unknown as Summary;

if (
  artifact.schemaVersion !== 1 ||
  artifact.stage !== "hero-bond-level-materials-v1" ||
  artifact.status !== "FROZEN_CANDIDATE" ||
  artifact.semanticAuthority !== false ||
  artifact.owner !== "hero-canonical" ||
  artifact.counts.heroes !== 267 ||
  artifact.counts.regularFetterRefs !== 1335 ||
  artifact.counts.heartFetterRefs !== 267 ||
  artifact.counts.regularCostProfiles !== 15 ||
  artifact.counts.heartCostProfiles !== 24 ||
  artifact.counts.materialItems !== 43 ||
  artifact.records.length !== 267
) {
  throw new Error("Hero bond level-material frozen artifact is not production-ready.");
}

if (
  summary.version !== 1 ||
  summary.stage !== "hero-bond-level-materials-v1" ||
  summary.status !== "PASS" ||
  summary.owner !== "hero-canonical" ||
  summary.coverage.heroPopulationComplete !== true ||
  summary.coverage.fiveRegularFettersPerHero !== true ||
  summary.coverage.oneHeartFetterPerHero !== true ||
  summary.coverage.targetLevelsPerProfile !== 9 ||
  summary.coverage.targetLevelRange[0] !== 2 ||
  summary.coverage.targetLevelRange[1] !== 10 ||
  summary.coverage.unresolvedMaterialItems !== 0 ||
  summary.coverage.conflictingMaterialMetadata !== 0 ||
  summary.normalization.perHeroCostRowsDuplicated !== false ||
  summary.boundaries.regularCostsReusedFromFrozenHeroConsumer !== true ||
  summary.boundaries.heartRelationReusedFromFrozenRawEvidence !== true ||
  summary.boundaries.rawHeroInfoReselection !== false ||
  summary.boundaries.nameJoin !== false ||
  summary.boundaries.idArithmetic !== false ||
  summary.boundaries.newBondEffectSemantics !== false ||
  summary.boundaries.frontendMutation !== false
) {
  throw new Error("Hero bond level-material validation summary is not production-ready.");
}

const materialById = new Map<number, ItemCatalogRow>();
for (const item of artifact.itemCatalog) {
  if (
    item.itemType !== 6 ||
    !Number.isSafeInteger(item.itemId) ||
    item.itemId <= 0 ||
    materialById.has(item.itemId)
  ) {
    throw new Error(`Hero bond material catalog identity violation at itemId=${String(item.itemId)}.`);
  }
  materialById.set(item.itemId, item);
}
if (materialById.size !== 43) {
  throw new Error("Hero bond material catalog coverage drift.");
}

function profileMap(profiles: FrozenProfile[], prefix: "RF-" | "HF-") {
  const map = new Map<string, FrozenProfile>();
  for (const profile of profiles) {
    if (
      !profile.profileId.startsWith(prefix) ||
      profile.levels.length !== 9 ||
      map.has(profile.profileId)
    ) {
      throw new Error(`Hero bond cost-profile violation at profileId=${profile.profileId}.`);
    }
    const levels = profile.levels.map((row) => row.targetLevel);
    if (levels.some((level, index) => level !== index + 2)) {
      throw new Error(`Hero bond cost-profile level coverage violation at profileId=${profile.profileId}.`);
    }
    map.set(profile.profileId, profile);
  }
  return map;
}

const regularProfileById = profileMap(artifact.regularCostProfiles, "RF-");
const heartProfileById = profileMap(artifact.heartCostProfiles, "HF-");

const heroById = new Map<number, FrozenHero>();
for (const hero of artifact.records) {
  if (
    !Number.isSafeInteger(hero.heroId) ||
    hero.heroId <= 0 ||
    heroById.has(hero.heroId) ||
    hero.regularFetters.length !== 5
  ) {
    throw new Error(`Hero bond relation violation at heroId=${String(hero.heroId)}.`);
  }
  heroById.set(hero.heroId, hero);
}

function projectMaterial(material: FrozenMaterial) {
  if (material.itemType !== 6) {
    throw new Error(`Hero bond material ItemType ${material.itemType} is not admitted for presentation.`);
  }
  const item = materialById.get(material.itemId);
  if (!item) {
    throw new Error(`Hero bond material Item ${material.itemId} is missing from the frozen catalog.`);
  }
  return {
    itemId: material.itemId,
    count: material.count,
    nameCn: item.nameCn ?? `Item ${material.itemId}`,
  };
}

function projectProfile(profile: FrozenProfile) {
  return {
    profileId: profile.profileId,
    levels: profile.levels.map((level) => ({
      targetLevel: level.targetLevel,
      goldCost: level.goldCost,
      materials: level.materials.map(projectMaterial),
    })),
    total: {
      gold: profile.total.gold,
      materials: profile.total.materials.map(projectMaterial),
    },
  };
}

export function readHeroBondMaterialsPresentation(heroId: number) {
  const hero = heroById.get(heroId);
  if (!hero) return null;

  const regularFetters = hero.regularFetters.map((fetter, index) => {
    const profile = regularProfileById.get(fetter.costProfileId);
    if (!profile) {
      throw new Error(`Hero ${heroId} references missing regular Fetter cost profile ${fetter.costProfileId}.`);
    }
    return {
      order: fetter.order,
      displayOrder: index + 1,
      fetterId: fetter.fetterId,
      nameCn: fetter.nameCn,
      ...projectProfile(profile),
    };
  });

  const heartProfile = heartProfileById.get(hero.heartFetter.costProfileId);
  if (!heartProfile) {
    throw new Error(`Hero ${heroId} references missing HeartFetter cost profile ${hero.heartFetter.costProfileId}.`);
  }

  return {
    heroId,
    regularFetters,
    heartFetter: {
      heartFetterId: hero.heartFetter.heartFetterId,
      nameCn: hero.heartFetter.nameCn,
      ...projectProfile(heartProfile),
    },
  };
}
