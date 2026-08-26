import exclusiveConsumerJson from "../../data/generated/equipment_stage3_5_exclusive_consumer.json";
import exclusiveByEquipmentJson from "../../data/generated/hero-exclusive-equipment-by-equipment.v1.json";
import generalDetailJson from "../../data/generated/equipment_stage3_4_general_detail.json";
import generalListJson from "../../data/generated/equipment_stage3_3_general_list.json";
import heroMasterJson from "../../data/hero-name-master.v1.json";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

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

export type EquipmentDetailRecord = {
  equipmentId: number;
  identity?: {
    equipmentId: number;
    nameCn: string;
    nameKr: string | null;
    icon: string;
  };
  [key: string]: JsonValue | undefined;
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
  records: EquipmentDetailRecord[];
};

type ExclusiveConsumerSource = {
  listRecords: EquipmentListRecord[];
  detailRecords: EquipmentDetailRecord[];
};

type ExclusiveByEquipmentSource = {
  byEquipmentId: Record<string, number[]>;
};

type HeroMasterSource = {
  recordCount: number;
  records: HeroNameRecord[];
};

const generalList = generalListJson as unknown as GeneralListSource;
const generalDetail = generalDetailJson as unknown as GeneralDetailSource;
const exclusiveConsumer = exclusiveConsumerJson as unknown as ExclusiveConsumerSource;
const exclusiveByEquipment = exclusiveByEquipmentJson as unknown as ExclusiveByEquipmentSource;
const heroMaster = heroMasterJson as unknown as HeroMasterSource;

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

function getDisplayName(record: EquipmentDetailRecord): string {
  const identity = record.identity;
  if (!identity) return String(record.equipmentId);
  return identity.nameKr ?? identity.nameCn;
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
  };
}

export type EquipmentDetailPageData = {
  kind: "general" | "exclusive";
  equipmentId: number;
  displayName: string;
  detail: JsonValue;
  ownerHero: HeroNameRecord | null;
};

export function readEquipmentDetailPageData(
  equipmentId: number,
): EquipmentDetailPageData | null {
  const general = generalDetailById.get(equipmentId);
  if (general) {
    return {
      kind: "general" as const,
      equipmentId,
      displayName: getDisplayName(general),
      detail: general as unknown as JsonValue,
      ownerHero: null,
    };
  }

  const exclusive = exclusiveDetailById.get(equipmentId);
  if (exclusive) {
    return {
      kind: "exclusive" as const,
      equipmentId,
      displayName: getDisplayName(exclusive),
      detail: exclusive as unknown as JsonValue,
      ownerHero: resolveExclusiveOwnerHero(equipmentId),
    };
  }

  return null;
}
