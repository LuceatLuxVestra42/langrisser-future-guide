import equipmentDisplayCollectionJson from "../../data/presentation/equipment-display-collection.v1.json";

export type EquipmentDisplayCollection = 1 | 2 | 3;

type EquipmentDisplayCollectionContract = {
  status: string;
  completion: string;
  scope: {
    runtimePublicGeneralCount: number;
    technicalSiteTabIsPresentationMembership: boolean;
    equipmentPassMembershipMode: string;
  };
  displayCollections: {
    initial: {
      value: EquipmentDisplayCollection;
      expectedCount: number;
    };
    previousAdditional: {
      value: EquipmentDisplayCollection;
      explicitCurrentAdditionalNonPassEquipmentIds: number[];
      expectedCount: number;
    };
    equipmentPass: {
      value: EquipmentDisplayCollection;
      equipmentIds: number[];
      expectedCount: number;
    };
  };
  expectedPresentationCounts: {
    initial: number;
    previousAdditional: number;
    equipmentPass: number;
    total: number;
  };
};

const contract = equipmentDisplayCollectionJson as EquipmentDisplayCollectionContract;
const explicitEquipmentPassIds = new Set(contract.displayCollections.equipmentPass.equipmentIds);
const explicitCurrentAdditionalNonPassIds = new Set(
  contract.displayCollections.previousAdditional.explicitCurrentAdditionalNonPassEquipmentIds,
);

function assertFrozenContract() {
  if (
    contract.status !== "FROZEN" ||
    contract.completion !== "EQUIPMENT_DISPLAY_COLLECTION_V1_FROZEN" ||
    contract.scope.technicalSiteTabIsPresentationMembership !== false ||
    contract.scope.equipmentPassMembershipMode !== "EXPLICIT_EQUIPMENT_ID"
  ) {
    throw new Error("Equipment display collection frozen contract is inconsistent.");
  }

  if (
    explicitEquipmentPassIds.size !== contract.displayCollections.equipmentPass.expectedCount ||
    explicitCurrentAdditionalNonPassIds.size !==
      contract.displayCollections.previousAdditional.explicitCurrentAdditionalNonPassEquipmentIds.length
  ) {
    throw new Error("Equipment display collection explicit membership contains duplicates.");
  }

  for (const equipmentId of explicitEquipmentPassIds) {
    if (explicitCurrentAdditionalNonPassIds.has(equipmentId)) {
      throw new Error(`Equipment ${equipmentId} belongs to conflicting display collections.`);
    }
  }

  const counts = contract.expectedPresentationCounts;
  if (
    counts.initial !== contract.displayCollections.initial.expectedCount ||
    counts.previousAdditional !== contract.displayCollections.previousAdditional.expectedCount ||
    counts.equipmentPass !== contract.displayCollections.equipmentPass.expectedCount ||
    counts.total !== contract.scope.runtimePublicGeneralCount ||
    counts.initial + counts.previousAdditional + counts.equipmentPass !== counts.total
  ) {
    throw new Error("Equipment display collection expected counts are inconsistent.");
  }
}

assertFrozenContract();

export const EQUIPMENT_DISPLAY_COLLECTION_EXPECTED_COUNTS = Object.freeze({
  1: contract.expectedPresentationCounts.initial,
  2: contract.expectedPresentationCounts.previousAdditional,
  3: contract.expectedPresentationCounts.equipmentPass,
}) satisfies Readonly<Record<EquipmentDisplayCollection, number>>;

export function resolveEquipmentDisplayCollection(
  equipmentId: number,
  technicalSiteTab: number,
): EquipmentDisplayCollection {
  const isEquipmentPass = explicitEquipmentPassIds.has(equipmentId);
  const isExplicitCurrentAdditionalNonPass = explicitCurrentAdditionalNonPassIds.has(equipmentId);

  if (isEquipmentPass && isExplicitCurrentAdditionalNonPass) {
    throw new Error(`Equipment ${equipmentId} has conflicting display collection membership.`);
  }

  if (technicalSiteTab === 1) {
    if (isEquipmentPass || isExplicitCurrentAdditionalNonPass) {
      throw new Error(`Equipment ${equipmentId} explicit membership conflicts with technical siteTab 1.`);
    }
    return 1;
  }

  if (technicalSiteTab === 2) {
    if (isEquipmentPass || isExplicitCurrentAdditionalNonPass) {
      throw new Error(`Equipment ${equipmentId} explicit membership conflicts with technical siteTab 2.`);
    }
    return 2;
  }

  if (technicalSiteTab === 3) {
    if (isEquipmentPass) return 3;
    if (isExplicitCurrentAdditionalNonPass) return 2;
    throw new Error(
      `Equipment ${equipmentId} technical siteTab 3 is missing explicit display collection membership.`,
    );
  }

  throw new Error(`Equipment ${equipmentId} has unsupported technical siteTab ${technicalSiteTab}.`);
}
