import soldierCombatJson from "../../data/generated/soldier-detail-stage5-2.v1.json";
import soldierListJson from "../../data/generated/soldier-list-stage5-8.v1.json";
import soldierLowerTierNameKrJson from "../../data/presentation/soldier-lower-tier-name-kr.v1.json";

export type SoldierUiGroup =
  | "INFANTRY"
  | "LANCER"
  | "CAVALRY"
  | "FLYING_WATER"
  | "ARCHER_ASSASSIN"
  | "MAGE_HOLY_DEMON";

export type SoldierCombat = {
  hp: number;
  atk: number;
  def: number;
  mdef: number;
  move: number;
  range: number;
  isMelee: boolean;
  moveType: number;
};

export type SoldierRelease = {
  releaseStatus: string;
  releaseDate: string | null;
  patchGroup: string | null;
  samePatchOrder: number | null;
  sourceKind: string | null;
  sourceLabel: string | null;
  sourceRows: number[] | null;
  mappingStatus: string | null;
};

export type SoldierPrototypeRecord = {
  soldierId: number;
  siteId: string;
  nameKr: string | null;
  nameCn: string;
  nameKrStatus: string;
  tier: number;
  armyId: number;
  armyType: string;
  uiGroup: SoldierUiGroup;
  isSp: boolean;
  normalSoldierId: number | null;
  spSoldierId: number | null;
  validationStatus: string;
  release: SoldierRelease;
  sortBucket: string;
  combat: SoldierCombat;
};

type SoldierListSource = {
  status: string;
  releaseCoverageStatus: string;
  summary: {
    recordCount: number;
    normalCount: number;
    spCount: number;
    normalTier3Count: number;
    confirmedReleaseCount: number;
    unresolvedNormalTier3Count: number;
    lowerTierCount: number;
    nonPassIdentityMetadataCount: number;
  };
  records: Array<Omit<SoldierPrototypeRecord, "combat">>;
};

type SoldierCombatSource = {
  status: string;
  records: Array<{
    soldierId: number;
    combat: SoldierCombat;
  }>;
};

type SoldierLowerTierNameKrSource = {
  status: string;
  scope: string;
  coverage: {
    tier1Count: number;
    tier2Count: number;
    recordCount: number;
    unresolvedCount: number;
  };
  records: Array<{
    soldierId: number;
    tier: number;
    nameCn: string;
    nameKr: string;
  }>;
};

const soldierList = soldierListJson as unknown as SoldierListSource;
const soldierCombat = soldierCombatJson as unknown as SoldierCombatSource;
const soldierLowerTierNameKr = soldierLowerTierNameKrJson as unknown as SoldierLowerTierNameKrSource;
const combatById = new Map(
  soldierCombat.records.map((record) => [record.soldierId, record.combat]),
);

if (
  soldierLowerTierNameKr.status !== "PASS" ||
  soldierLowerTierNameKr.scope !== "frontend-presentation-only" ||
  soldierLowerTierNameKr.coverage.recordCount !== soldierList.summary.lowerTierCount ||
  soldierLowerTierNameKr.coverage.unresolvedCount !== 0
) {
  throw new Error("Tier 1-2 Korean Soldier presentation source is not complete.");
}

const lowerTierNameKrById = new Map(
  soldierLowerTierNameKr.records.map((record) => [record.soldierId, record]),
);

if (lowerTierNameKrById.size !== soldierLowerTierNameKr.records.length) {
  throw new Error("Tier 1-2 Korean Soldier presentation source contains duplicate Soldier IDs.");
}

const lowerTierBaseRecords = soldierList.records.filter(
  (record) => record.sortBucket === "LOWER_TIER_TECHNICAL",
);

if (lowerTierBaseRecords.length !== soldierList.summary.lowerTierCount) {
  throw new Error("Frozen Soldier list lower-tier count mismatch.");
}

for (const record of lowerTierBaseRecords) {
  const presentation = lowerTierNameKrById.get(record.soldierId);
  if (!presentation) {
    throw new Error(`Missing Korean presentation name for lower-tier Soldier ${record.soldierId}.`);
  }
  if (
    record.isSp ||
    (record.tier !== 1 && record.tier !== 2) ||
    presentation.tier !== record.tier ||
    presentation.nameCn !== record.nameCn ||
    !presentation.nameKr.trim()
  ) {
    throw new Error(`Tier 1-2 Korean presentation mapping mismatch for Soldier ${record.soldierId}.`);
  }
}

for (const presentation of soldierLowerTierNameKr.records) {
  const base = soldierList.records.find((record) => record.soldierId === presentation.soldierId);
  if (!base || base.sortBucket !== "LOWER_TIER_TECHNICAL") {
    throw new Error(`Unexpected lower-tier Korean presentation mapping for Soldier ${presentation.soldierId}.`);
  }
}

const BUCKET_ORDER: Record<string, number> = {
  SP: 0,
  NORMAL_TIER3_CONFIRMED_RELEASE: 1,
  NORMAL_TIER3_UNRESOLVED: 2,
  LOWER_TIER_TECHNICAL: 3,
};

function compareSoldiers(
  a: Omit<SoldierPrototypeRecord, "combat">,
  b: Omit<SoldierPrototypeRecord, "combat">,
) {
  const bucketDiff =
    (BUCKET_ORDER[a.sortBucket] ?? 99) - (BUCKET_ORDER[b.sortBucket] ?? 99);
  if (bucketDiff !== 0) return bucketDiff;

  if (a.release.releaseDate && b.release.releaseDate) {
    const releaseDiff = b.release.releaseDate.localeCompare(a.release.releaseDate);
    if (releaseDiff !== 0) return releaseDiff;
  }

  return a.soldierId - b.soldierId;
}

export function readSoldierPrototypePageData() {
  const records = [...soldierList.records].sort(compareSoldiers).map((record) => {
    const combat = combatById.get(record.soldierId);
    if (!combat) {
      throw new Error(`Soldier ${record.soldierId} is missing Stage 5-2 combat data.`);
    }

    const lowerTierNameKr = lowerTierNameKrById.get(record.soldierId);
    const presentationRecord = lowerTierNameKr
      ? {
          ...record,
          nameKr: lowerTierNameKr.nameKr,
          nameKrStatus: "confirmed-presentation",
        }
      : record;

    return {
      ...presentationRecord,
      combat,
    } satisfies SoldierPrototypeRecord;
  });

  if (records.length !== soldierList.summary.recordCount) {
    throw new Error(
      `Soldier prototype record count mismatch: ${records.length} != ${soldierList.summary.recordCount}.`,
    );
  }

  return {
    status: soldierList.status,
    releaseCoverageStatus: soldierList.releaseCoverageStatus,
    summary: soldierList.summary,
    records,
  };
}
