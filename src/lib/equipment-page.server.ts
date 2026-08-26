import exclusiveConsumerJson from "../../data/generated/equipment_stage3_5_exclusive_consumer.json";
import exclusiveByEquipmentJson from "../../data/generated/hero-exclusive-equipment-by-equipment.v1.json";
import generalDetailJson from "../../data/generated/equipment_stage3_4_general_detail.json";
import generalListJson from "../../data/generated/equipment_stage3_3_general_list.json";
import restrictionSourceJson from "../../data/generated/equipment_stage2_6_restrictions.json";
import jobIndexJson from "../../data/generated/equipment_stage2_6_job_index.json";
import heroMasterJson from "../../data/hero-name-master.v1.json";

export type EquipmentListRecord = {
  equipmentId: number;
  nameCn: string;
  nameKr: string | null;
  icon: string;
  group: string;
  groupKo: string;
  subtype: string;
  subtypeKo: string;
  groupOrder: number;
  subtypeOrder: number;
  acquisitionClass: string;
  siteTab: number | null;
  releaseGroupDate: string | null;
  sortIndex: number;
  effectName: string;
  effectText: string;
};

export type EquipmentFilterGroup = {
  group: string;
  groupKo: string;
  groupOrder: number;
  subtypes: Array<{
    subtype: string;
    subtypeKo: string;
    subtypeOrder: number;
  }>;
};

export type EquipmentStatProperty = {
  propertyId: number;
  propertyKo: string;
  base: number;
  growthPer10Levels: number;
  maxLevel: number;
  maxRaw: number;
  maxValue: number;
};

export type EquipmentEffectSegment = {
  text: string;
  highlight: boolean;
};

type EquipmentRestrictionRecord = {
  mode: string;
  generalArmyIds: number[];
  specialJobIds: number[];
};

type EquipmentDetailCommon = {
  equipmentId: number;
  identity: {
    equipmentId: number;
    nameCn: string;
    nameKr: string | null;
    icon: string;
  };
  stats: {
    maxLevel: number;
    properties: EquipmentStatProperty[];
  };
  effect: {
    maxEffectSkillId: number;
    effectName: string;
    effectText: string;
    effectSegments: EquipmentEffectSegment[];
  };
  restriction: EquipmentRestrictionRecord;
  acquisition: {
    releaseGroupDate: string | null;
    confidencePercent: number;
    classificationBasis: string;
  };
};

export type GeneralEquipmentDetailRecord = EquipmentDetailCommon & {
  classification: {
    group: string;
    groupKo: string;
    subtype: string;
    subtypeKo: string;
    groupOrder: number;
    subtypeOrder: number;
    equipmentType: number;
    label: number;
    acquisitionClass: string;
    siteTab: number;
    sortIndex: number;
  };
};

export type ExclusiveEquipmentDetailRecord = EquipmentDetailCommon & {
  classification: {
    group: string;
    groupKo: string;
    subtype: string;
    subtypeKo: string;
    groupOrder: number;
    subtypeOrder: number;
    equipmentType: number;
    label: number;
    acquisitionClass: string;
    siteTab: null;
    sortIndex: number;
  };
};

export type RestrictionArmyDisplay = {
  armyId: number;
  nameCn: string;
  nameKo: string;
};

export type RestrictionJobDisplay = {
  jobId: number;
  nameCn: string;
  rank: number;
  armyId: number;
  armyNameKo: string;
};

type EquipmentRestrictionPresentation = EquipmentRestrictionRecord & {
  generalArmies: RestrictionArmyDisplay[];
  specialJobs: RestrictionJobDisplay[];
  semanticStatus: string;
  semanticConfidence: number;
};

export type GeneralEquipmentDetailPresentation = Omit<GeneralEquipmentDetailRecord, "restriction"> & {
  restriction: EquipmentRestrictionPresentation;
};

export type ExclusiveEquipmentDetailPresentation = Omit<ExclusiveEquipmentDetailRecord, "restriction"> & {
  restriction: EquipmentRestrictionPresentation;
};

export type HeroNameRecord = {
  heroId: number;
  nameCn: string;
  nameKr: string;
  nameEn: string;
  aliasesKr: string[];
  status: string;
};

type GeneralListSource = {
  counts: {
    total: number;
    tabs: Record<string, number>;
  };
  filters: EquipmentFilterGroup[];
  records: EquipmentListRecord[];
};

type GeneralDetailSource = {
  records: GeneralEquipmentDetailRecord[];
};

type ExclusiveConsumerSource = {
  counts: {
    total: number;
    list: number;
    detail: number;
  };
  filters: EquipmentFilterGroup[];
  listRecords: EquipmentListRecord[];
  detailRecords: ExclusiveEquipmentDetailRecord[];
};

type ExclusiveByEquipmentSource = {
  byEquipmentId: Record<string, number[]>;
};

type HeroMasterSource = {
  recordCount: number;
  records: HeroNameRecord[];
};

type RestrictionSource = {
  semantics: {
    confidence: number;
    status: string;
  };
  armyIndex: Record<
    string,
    {
      nameCn: string;
      nameKo: string;
      armyTag: number;
    }
  >;
};

type JobIndexSource = {
  jobs: Record<
    string,
    {
      name: string;
      rank: number;
      armyId: number;
      armyNameCn: string;
      armyNameKo: string;
    }
  >;
};

const generalList = generalListJson as unknown as GeneralListSource;
const generalDetail = generalDetailJson as unknown as GeneralDetailSource;
const exclusiveConsumer = exclusiveConsumerJson as unknown as ExclusiveConsumerSource;
const exclusiveByEquipment = exclusiveByEquipmentJson as unknown as ExclusiveByEquipmentSource;
const heroMaster = heroMasterJson as unknown as HeroMasterSource;
const restrictionSource = restrictionSourceJson as unknown as RestrictionSource;
const jobIndex = jobIndexJson as unknown as JobIndexSource;

const heroById = new Map(heroMaster.records.map((hero) => [hero.heroId, hero]));
const generalDetailById = new Map(
  generalDetail.records.map((record) => [record.equipmentId, record]),
);
const exclusiveDetailById = new Map(
  exclusiveConsumer.detailRecords.map((record) => [record.equipmentId, record]),
);

function resolveExclusiveOwnerHero(equipmentId: number): HeroNameRecord {
  const ownerIds = exclusiveByEquipment.byEquipmentId[String(equipmentId)] ?? [];

  if (ownerIds.length !== 1) {
    throw new Error(
      `Exclusive equipment ${equipmentId} must resolve exactly one owner Hero; got ${ownerIds.length}.`,
    );
  }

  const ownerHero = heroById.get(ownerIds[0]!);
  if (!ownerHero) {
    throw new Error(
      `Exclusive equipment ${equipmentId} owner Hero ${ownerIds[0]} is missing from hero-name-master.`,
    );
  }

  return ownerHero;
}

function getDisplayName(record: EquipmentDetailCommon): string {
  return record.identity.nameKr ?? record.identity.nameCn;
}

function resolveRestrictionPresentation(
  equipmentId: number,
  restriction: EquipmentRestrictionRecord,
): EquipmentRestrictionPresentation {
  const generalArmies = restriction.generalArmyIds.map((armyId) => {
    const army = restrictionSource.armyIndex[String(armyId)];
    if (!army) {
      throw new Error(`Equipment ${equipmentId} references missing Army ${armyId}.`);
    }
    return {
      armyId,
      nameCn: army.nameCn,
      nameKo: army.nameKo,
    };
  });

  const specialJobs = restriction.specialJobIds.map((jobId) => {
    const job = jobIndex.jobs[String(jobId)];
    if (!job) {
      throw new Error(`Equipment ${equipmentId} references missing Job ${jobId}.`);
    }
    return {
      jobId,
      nameCn: job.name,
      rank: job.rank,
      armyId: job.armyId,
      armyNameKo: job.armyNameKo,
    };
  });

  return {
    ...restriction,
    generalArmies,
    specialJobs,
    semanticStatus: restrictionSource.semantics.status,
    semanticConfidence: restrictionSource.semantics.confidence,
  };
}

function resolveGeneralRestrictionPresentation(
  record: GeneralEquipmentDetailRecord,
): EquipmentRestrictionPresentation {
  return resolveRestrictionPresentation(record.equipmentId, record.restriction);
}

function resolveExclusiveRestrictionPresentation(
  record: ExclusiveEquipmentDetailRecord,
): EquipmentRestrictionPresentation {
  return resolveRestrictionPresentation(record.equipmentId, record.restriction);
}

export function readGeneralEquipmentPageData() {
  return {
    records: generalList.records,
    filters: generalList.filters,
    tabs: generalList.counts.tabs,
  };
}

export function readExclusiveEquipmentPageData() {
  return {
    records: exclusiveConsumer.listRecords.map((record) => ({
      ...record,
      ownerHero: resolveExclusiveOwnerHero(record.equipmentId),
    })),
    filters: exclusiveConsumer.filters,
    total: exclusiveConsumer.counts.total,
  };
}

export type GeneralEquipmentDetailPageData = {
  kind: "general";
  equipmentId: number;
  displayName: string;
  detail: GeneralEquipmentDetailPresentation;
  ownerHero: null;
};

export type ExclusiveEquipmentDetailPageData = {
  kind: "exclusive";
  equipmentId: number;
  displayName: string;
  detail: ExclusiveEquipmentDetailPresentation;
  ownerHero: HeroNameRecord;
};

export type EquipmentDetailPageData =
  | GeneralEquipmentDetailPageData
  | ExclusiveEquipmentDetailPageData;

export function readEquipmentDetailPageData(
  equipmentId: number,
): EquipmentDetailPageData | null {
  const general = generalDetailById.get(equipmentId);
  if (general) {
    return {
      kind: "general",
      equipmentId,
      displayName: getDisplayName(general),
      detail: {
        ...general,
        restriction: resolveGeneralRestrictionPresentation(general),
      },
      ownerHero: null,
    };
  }

  const exclusive = exclusiveDetailById.get(equipmentId);
  if (exclusive) {
    return {
      kind: "exclusive",
      equipmentId,
      displayName: getDisplayName(exclusive),
      detail: {
        ...exclusive,
        restriction: resolveExclusiveRestrictionPresentation(exclusive),
      },
      ownerHero: resolveExclusiveOwnerHero(equipmentId),
    };
  }

  return null;
}
