import soldierCombatJson from "../../data/generated/soldier-detail-stage5-2.v1.json";
import soldierListJson from "../../data/generated/soldier-list-stage5-8.v1.json";

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

const soldierList = soldierListJson as unknown as SoldierListSource;
const soldierCombat = soldierCombatJson as unknown as SoldierCombatSource;
const combatById = new Map(
  soldierCombat.records.map((record) => [record.soldierId, record.combat]),
);

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

    return {
      ...record,
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
