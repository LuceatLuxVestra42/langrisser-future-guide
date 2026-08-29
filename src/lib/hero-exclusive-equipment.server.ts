import exclusiveByHeroJson from "../../data/generated/hero-exclusive-equipment-by-hero.v1.json";
import exclusiveConsumerJson from "../../data/generated/equipment_stage3_5_exclusive_consumer.json";

type ExclusiveByHeroSource = {
  summary: {
    keyCount: number;
    relationCount: number;
    maxValueCountPerKey: number;
    canonicalHeroesWithoutKey: number;
  };
  byHeroId: Record<string, number[]>;
};

type ExclusiveEquipmentDetailSource = {
  equipmentId: number;
  identity: {
    equipmentId: number;
    nameCn: string;
    nameKr: string | null;
    icon: string;
  };
  classification: {
    group: string;
    groupKo: string;
    subtype: string;
    subtypeKo: string;
    equipmentType: number;
    label: number;
    acquisitionClass: string;
    siteTab: null;
    sortIndex: number;
  };
  stats: {
    maxLevel: number;
    properties: Array<{
      propertyId: number;
      propertyKo: string;
      base: number;
      growthPer10Levels: number;
      maxLevel: number;
      maxRaw: number;
      maxValue: number;
    }>;
  };
  effect: {
    maxEffectSkillId: number;
    effectName: string;
    effectText: string;
    effectSegments: Array<{
      text: string;
      highlight: boolean;
    }>;
  };
  acquisition: {
    releaseGroupDate: string | null;
    confidencePercent: number;
    classificationBasis: string;
  };
};

type ExclusiveConsumerSource = {
  counts: {
    total: number;
    list: number;
    detail: number;
  };
  detailRecords: ExclusiveEquipmentDetailSource[];
};

const exclusiveByHero = exclusiveByHeroJson as unknown as ExclusiveByHeroSource;
const exclusiveConsumer = exclusiveConsumerJson as unknown as ExclusiveConsumerSource;
const exclusiveDetailById = new Map(
  exclusiveConsumer.detailRecords.map((record) => [record.equipmentId, record]),
);

function assertFrozenExclusivePredecessors() {
  if (
    exclusiveByHero.summary.keyCount !== 167 ||
    exclusiveByHero.summary.relationCount !== 167 ||
    exclusiveByHero.summary.maxValueCountPerKey !== 1 ||
    exclusiveByHero.summary.canonicalHeroesWithoutKey !== 100
  ) {
    throw new Error("Hero exclusive-equipment B-5 predecessor no longer matches the frozen 167/100 contract.");
  }

  if (
    exclusiveConsumer.counts.total !== 167 ||
    exclusiveConsumer.counts.list !== 167 ||
    exclusiveConsumer.counts.detail !== 167
  ) {
    throw new Error("Equipment Stage 3-5 exclusive metadata no longer matches the frozen 167-record contract.");
  }
}

export function readHeroExclusiveEquipmentPresentation(heroId: number) {
  assertFrozenExclusivePredecessors();

  const equipmentIds = exclusiveByHero.byHeroId[String(heroId)] ?? [];
  if (equipmentIds.length === 0) {
    return {
      status: "NOT_RELEASED" as const,
      released: false,
      equipmentId: null,
      detail: null,
    };
  }

  if (equipmentIds.length !== 1) {
    throw new Error(`Hero ${heroId} must resolve zero or one exclusive Equipment; got ${equipmentIds.length}.`);
  }

  const equipmentId = equipmentIds[0]!;
  const detail = exclusiveDetailById.get(equipmentId);
  if (!detail) {
    throw new Error(`Hero ${heroId} exclusive Equipment ${equipmentId} is missing Stage 3-5 metadata.`);
  }
  if (detail.classification.acquisitionClass !== "exclusive-equipment") {
    throw new Error(`Equipment ${equipmentId} is not admitted as exclusive-equipment metadata.`);
  }

  return {
    status: "RELEASED" as const,
    released: true,
    equipmentId,
    detail: {
      equipmentId: detail.equipmentId,
      identity: detail.identity,
      classification: {
        group: detail.classification.group,
        groupKo: detail.classification.groupKo,
        subtype: detail.classification.subtype,
        subtypeKo: detail.classification.subtypeKo,
        equipmentType: detail.classification.equipmentType,
        label: detail.classification.label,
        acquisitionClass: detail.classification.acquisitionClass,
      },
      stats: detail.stats,
      effect: {
        maxEffectSkillId: detail.effect.maxEffectSkillId,
        effectName: detail.effect.effectName,
        effectText: detail.effect.effectText,
      },
      acquisition: detail.acquisition,
    },
  };
}
