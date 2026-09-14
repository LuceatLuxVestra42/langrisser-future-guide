type MappingMode =
  | "VALIDATED_DEFAULT"
  | "EXPLICIT_OVERRIDE"
  | "EXCLUSION_SET_MEMBER"
  | "SOURCE_CONFLICT_RESOLUTION";

type HeroTuple = [level: 4 | 7, jobId: number, skillId: number, mappingMode: MappingMode];

type Manifest = {
  schemaVersion: number;
  stage: string;
  status: string;
  semanticAuthority: boolean;
  presentationAuthority: boolean;
  productionConsumerAllowed: boolean;
  counts: {
    heroPopulation: number;
    effectRows: number;
    uniqueSkills: number;
    mappingModes: Record<MappingMode, number>;
  };
};

type HeroShard = {
  schemaVersion: number;
  kind: "HERO_MAP";
  ids: number[];
  heroes: Record<string, HeroTuple[]>;
};

type SkillShard = {
  schemaVersion: number;
  kind: "SKILL_TEXT";
  ids: number[];
  skills: Record<string, string>;
};

export type HeroHeartFetterEffect = {
  level: 4 | 7;
  jobId: number;
  skillId: number;
  mappingMode: MappingMode;
  text: string;
};

export type HeroHeartFetterPresentation = {
  heroId: number;
  effects: HeroHeartFetterEffect[];
};

const manifestModules = import.meta.glob<Manifest>(
  "../../data/generated/hero-heart-fetter-site-consumer/manifest.v1.json",
  { eager: true, import: "default" },
);
const heroShardModules = import.meta.glob<HeroShard>(
  "../../data/generated/hero-heart-fetter-site-consumer/hero-map-*.json",
  { eager: true, import: "default" },
);
const skillShardModules = import.meta.glob<SkillShard>(
  "../../data/generated/hero-heart-fetter-site-consumer/skill-text-*.json",
  { eager: true, import: "default" },
);

function getSingleModule<T>(modules: Record<string, T>, label: string): T {
  const values = Object.values(modules);
  if (values.length !== 1 || !values[0]) {
    throw new Error(`${label} frozen consumer module is missing or ambiguous.`);
  }
  return values[0];
}

const manifest = getSingleModule(manifestModules, "Hero HeartFetter manifest");
if (
  manifest.schemaVersion !== 1 ||
  manifest.stage !== "hero-heart-fetter-site-consumer-v1" ||
  manifest.status !== "FROZEN_PRESENTATION_CONSUMER" ||
  manifest.semanticAuthority !== false ||
  manifest.presentationAuthority !== true ||
  manifest.productionConsumerAllowed !== true ||
  manifest.counts.heroPopulation !== 267 ||
  manifest.counts.effectRows !== 1158 ||
  manifest.counts.uniqueSkills !== 1066 ||
  manifest.counts.mappingModes.VALIDATED_DEFAULT !== 1142 ||
  manifest.counts.mappingModes.EXPLICIT_OVERRIDE !== 6 ||
  manifest.counts.mappingModes.EXCLUSION_SET_MEMBER !== 8 ||
  manifest.counts.mappingModes.SOURCE_CONFLICT_RESOLUTION !== 2
) {
  throw new Error("Hero HeartFetter frozen presentation manifest is not production-ready.");
}

const skillTextById = new Map<number, string>();
for (const shard of Object.values(skillShardModules)) {
  if (shard.schemaVersion !== 1 || shard.kind !== "SKILL_TEXT") {
    throw new Error("Hero HeartFetter skill-text shard schema gate failed.");
  }
  for (const skillId of shard.ids) {
    const text = shard.skills[String(skillId)];
    if (!Number.isSafeInteger(skillId) || skillId <= 0 || typeof text !== "string" || text.length === 0) {
      throw new Error(`Hero HeartFetter skill-text record is invalid for Skill ${skillId}.`);
    }
    if (skillTextById.has(skillId)) {
      throw new Error(`Hero HeartFetter skill-text Skill ${skillId} is duplicated across shards.`);
    }
    skillTextById.set(skillId, text);
  }
}
if (skillTextById.size !== manifest.counts.uniqueSkills) {
  throw new Error("Hero HeartFetter skill-text population gate failed.");
}

const presentationByHeroId = new Map<number, HeroHeartFetterPresentation>();
let effectRowCount = 0;
const mappingModeCounts: Record<MappingMode, number> = {
  VALIDATED_DEFAULT: 0,
  EXPLICIT_OVERRIDE: 0,
  EXCLUSION_SET_MEMBER: 0,
  SOURCE_CONFLICT_RESOLUTION: 0,
};

for (const shard of Object.values(heroShardModules)) {
  if (shard.schemaVersion !== 1 || shard.kind !== "HERO_MAP") {
    throw new Error("Hero HeartFetter hero-map shard schema gate failed.");
  }
  for (const heroId of shard.ids) {
    if (!Number.isSafeInteger(heroId) || heroId <= 0 || presentationByHeroId.has(heroId)) {
      throw new Error(`Hero HeartFetter has invalid/duplicate heroId=${heroId}.`);
    }
    const tuples = shard.heroes[String(heroId)];
    if (!Array.isArray(tuples)) {
      throw new Error(`Hero ${heroId} is missing from its HeartFetter hero-map shard.`);
    }
    const effects = tuples.map(([level, jobId, skillId, mappingMode]) => {
      if ((level !== 4 && level !== 7) || !Number.isSafeInteger(jobId) || jobId <= 0 || !Number.isSafeInteger(skillId) || skillId <= 0) {
        throw new Error(`Hero ${heroId} has an invalid HeartFetter tuple.`);
      }
      if (!(mappingMode in mappingModeCounts)) {
        throw new Error(`Hero ${heroId} has unsupported HeartFetter mapping mode ${mappingMode}.`);
      }
      const text = skillTextById.get(skillId);
      if (!text) {
        throw new Error(`Hero ${heroId} HeartFetter Skill ${skillId} has no frozen text payload.`);
      }
      effectRowCount += 1;
      mappingModeCounts[mappingMode] += 1;
      return { level, jobId, skillId, mappingMode, text } satisfies HeroHeartFetterEffect;
    });
    presentationByHeroId.set(heroId, { heroId, effects });
  }
}

if (
  presentationByHeroId.size !== manifest.counts.heroPopulation ||
  effectRowCount !== manifest.counts.effectRows ||
  Object.entries(mappingModeCounts).some(
    ([mode, count]) => count !== manifest.counts.mappingModes[mode as MappingMode],
  )
) {
  throw new Error("Hero HeartFetter frozen presentation population/parity gate failed.");
}

export function readHeroHeartFetterPresentation(heroId: number) {
  const presentation = presentationByHeroId.get(heroId);
  if (!presentation) {
    throw new Error(`Hero ${heroId} is missing from frozen HeartFetter presentation consumer.`);
  }
  return presentation;
}
