import equipmentPassClassificationJson from "../../data/generated/equipment-pass-classification.v1.json";

export type EquipmentDisplayCollection = 1 | 2 | 3;

type EquipmentPassClassificationState =
  | "PASS_CONFIRMED"
  | "NON_PASS_CONFIRMED"
  | "PASS_CANDIDATE"
  | "UNRESOLVED"
  | "NON_PUBLIC_EXCLUDED";

type EquipmentPassClassificationRecord = {
  equipmentId: number;
  nameCn: string;
  technicalAcquisitionClass: string;
  technicalSiteTab: number;
  classificationState: EquipmentPassClassificationState;
  evidenceSourceId: string | null;
  displayCollection: EquipmentDisplayCollection | null;
};

type EquipmentPassClassification = {
  status: string;
  completion: string;
  policy: {
    candidateClassIsMembership: boolean;
    membershipMode: string;
    explicitPassEquipmentIdListIsAuthoritative: boolean;
    generatedPassEquipmentIdsAreOutputOnly: boolean;
  };
  displayCounts: {
    "1": number;
    "2": number;
    "3": number;
    total: number;
  };
  confirmedEquipmentPassIds: number[];
  confirmedCurrentAdditionalNonPassIds: number[];
  nonPublicExcludedCandidateIds: number[];
  records: EquipmentPassClassificationRecord[];
};

const classification = equipmentPassClassificationJson as EquipmentPassClassification;
const classificationByEquipmentId = new Map(
  classification.records.map((record) => [record.equipmentId, record]),
);

function sortedNumbers(values: Iterable<number>) {
  return [...values].sort((left, right) => left - right);
}

function assertSameIds(actual: Iterable<number>, expected: Iterable<number>, label: string) {
  const left = JSON.stringify(sortedNumbers(actual));
  const right = JSON.stringify(sortedNumbers(expected));
  if (left !== right) {
    throw new Error(`${label} mismatch: ${left} !== ${right}`);
  }
}

function assertActiveClassification() {
  if (
    classification.status !== "PASS" ||
    classification.completion !== "EQUIPMENT_PASS_CLASSIFICATION_V1_GENERATED" ||
    classification.policy.candidateClassIsMembership !== false ||
    classification.policy.membershipMode !== "EVIDENCE_CLASSIFICATION" ||
    classification.policy.explicitPassEquipmentIdListIsAuthoritative !== false ||
    classification.policy.generatedPassEquipmentIdsAreOutputOnly !== true
  ) {
    throw new Error("Equipment Pass generated classification is inconsistent.");
  }

  if (classificationByEquipmentId.size !== classification.records.length) {
    throw new Error("Equipment Pass generated classification contains duplicate equipmentId records.");
  }

  const passIds: number[] = [];
  const nonPassIds: number[] = [];
  const excludedIds: number[] = [];

  for (const record of classification.records) {
    switch (record.classificationState) {
      case "PASS_CONFIRMED":
        if (record.displayCollection !== 3 || !record.evidenceSourceId) {
          throw new Error(`Equipment ${record.equipmentId} confirmed Pass record is incomplete.`);
        }
        passIds.push(record.equipmentId);
        break;
      case "NON_PASS_CONFIRMED":
        if (record.displayCollection !== 2 || !record.evidenceSourceId) {
          throw new Error(`Equipment ${record.equipmentId} confirmed non-Pass record is incomplete.`);
        }
        nonPassIds.push(record.equipmentId);
        break;
      case "NON_PUBLIC_EXCLUDED":
        if (record.displayCollection !== null) {
          throw new Error(`Equipment ${record.equipmentId} public-excluded record has a display collection.`);
        }
        excludedIds.push(record.equipmentId);
        break;
      case "PASS_CANDIDATE":
      case "UNRESOLVED":
        throw new Error(
          `Equipment ${record.equipmentId} classification is ${record.classificationState}; runtime admission is blocked until evidence resolves it.`,
        );
      default: {
        const exhaustive: never = record.classificationState;
        throw new Error(`Unsupported Equipment Pass classification state ${exhaustive}.`);
      }
    }
  }

  assertSameIds(passIds, classification.confirmedEquipmentPassIds, "Generated Equipment Pass output IDs");
  assertSameIds(
    nonPassIds,
    classification.confirmedCurrentAdditionalNonPassIds,
    "Generated current-additional non-Pass output IDs",
  );
  assertSameIds(
    excludedIds,
    classification.nonPublicExcludedCandidateIds,
    "Generated non-public candidate output IDs",
  );

  if (
    classification.displayCounts["1"] +
      classification.displayCounts["2"] +
      classification.displayCounts["3"] !==
      classification.displayCounts.total
  ) {
    throw new Error("Equipment Pass generated display counts are inconsistent.");
  }
}

assertActiveClassification();

export const EQUIPMENT_DISPLAY_COLLECTION_EXPECTED_COUNTS = Object.freeze({
  1: classification.displayCounts["1"],
  2: classification.displayCounts["2"],
  3: classification.displayCounts["3"],
}) satisfies Readonly<Record<EquipmentDisplayCollection, number>>;

export function resolveEquipmentDisplayCollection(
  equipmentId: number,
  technicalSiteTab: number,
): EquipmentDisplayCollection {
  const resolved = classificationByEquipmentId.get(equipmentId);

  if (resolved) {
    if (resolved.technicalSiteTab !== technicalSiteTab) {
      throw new Error(
        `Equipment ${equipmentId} technical siteTab drift: ${technicalSiteTab} !== ${resolved.technicalSiteTab}.`,
      );
    }

    if (resolved.classificationState === "PASS_CONFIRMED") return 3;
    if (resolved.classificationState === "NON_PASS_CONFIRMED") return 2;
    if (resolved.classificationState === "NON_PUBLIC_EXCLUDED") {
      throw new Error(`Equipment ${equipmentId} is excluded from the public Equipment projection.`);
    }
    throw new Error(
      `Equipment ${equipmentId} classification is ${resolved.classificationState}; accepted evidence is required before display mapping.`,
    );
  }

  if (technicalSiteTab === 1) return 1;
  if (technicalSiteTab === 2) return 2;
  if (technicalSiteTab === 3) {
    throw new Error(
      `Equipment ${equipmentId} technical siteTab 3 has no resolved Equipment Pass classification evidence.`,
    );
  }

  throw new Error(`Equipment ${equipmentId} has unsupported technical siteTab ${technicalSiteTab}.`);
}
