import equipmentNameKrJson from "../../data/generated/equipment-name-kr-user-approved.v1.json";
import equipmentPublicAdmissionCorrectionJson from "../../data/presentation/equipment-public-admission-correction.v1.json";
import equipmentReleaseChronologyJson from "../../data/presentation/equipment-p3-1-release-metadata.v1.json";
import equipmentReleaseContractJson from "../../data/presentation/equipment-p3-1-release-metadata.v2.json";
import {
  EQUIPMENT_DISPLAY_COLLECTION_EXPECTED_COUNTS,
  resolveEquipmentDisplayCollection,
} from "./equipment-display-collection";
import type { EquipmentDisplayCollection } from "./equipment-display-collection";
import {
  readEquipmentDetailPageData as readBaseEquipmentDetailPageData,
  readExclusiveEquipmentPageData as readBaseExclusiveEquipmentPageData,
  readGeneralEquipmentPageData as readBaseGeneralEquipmentPageData,
} from "./equipment-page.server";
import type {
  EquipmentListRecord,
  ExclusiveEquipmentDetailPageData,
  GeneralEquipmentDetailPageData,
} from "./equipment-page.server";

type EquipmentNameKrProjection = {
  byEquipmentId: Record<
    string,
    {
      nameCn: string;
      nameKr: string | null;
      pageReady: boolean;
      status: string;
    }
  >;
};

type EquipmentReleaseProjectionRecord = {
  equipmentId: number;
  nameCn: string;
  releaseGroupDate: string;
  evidenceStatus: string;
  sourceId: string;
  releaseFamily: string;
};

type EquipmentReleaseChronology = {
  scope: {
    siteTab: number;
    targetCount: number;
    releaseDateCoverage: number;
  };
  policy: {
    joinKey: string;
  };
  defaultOrderEquipmentIds: number[];
  byEquipmentId: Record<string, EquipmentReleaseProjectionRecord>;
};

type EquipmentReleaseContract = {
  status: string;
  completion: string;
  predecessor: {
    chronologyDataSource: string;
    displayCollection: string;
  };
  scope: {
    technicalSiteTab: number;
    chronologyPopulationMode: string;
    technicalTargetCount: number;
    releaseDateCoverage: number;
    publicChronologyCount: number;
    publicExcludedTechnicalEquipmentIds: number[];
    chronologyDefinesDisplayMembership: boolean;
    displayMembershipSource: string;
    equipmentPassCount: number;
    semanticStageReopened: boolean;
    stage2AcquisitionClassificationChanged: boolean;
  };
  dataReuse: {
    mode: string;
    joinKey: string;
    defaultOrderRecomputed: boolean;
    releaseDatesRecomputed: boolean;
    evidenceStatusesRecomputed: boolean;
    sourceIdsRecomputed: boolean;
    releaseFamiliesRecomputed: boolean;
    identityContinuityRecomputed: boolean;
  };
  consumerPolicy: {
    chronologyJoinKey: string;
    publicConsumerUsesPublicSubsetOnly: boolean;
    technicalSiteTabMustBePreservedBeforeDisplayMapping: boolean;
    displayCollectionMustNotBeDerivedFromChronology: boolean;
    releaseFamilyMustNotBeUsedAsMembershipRule: boolean;
  };
};

type EquipmentPublicAdmissionCorrection = {
  status: string;
  policy: {
    joinKey: string;
    scope: string;
  };
  excludedEquipmentIds: number[];
  records: Array<{
    equipmentId: number;
    nameCn: string;
    duplicateOfEquipmentId: number;
    duplicateOfNameCn: string;
    reason: string;
  }>;
  expectedPublicProjection: {
    generalEquipmentCount: number;
    technicalTabCountsAfterAdmissionOnly: Record<string, number>;
    excludedCount: number;
  };
};

type LocalizedGeneralEquipmentDetailPageData = Omit<
  GeneralEquipmentDetailPageData,
  "detail"
> & {
  detail: Omit<GeneralEquipmentDetailPageData["detail"], "classification"> & {
    classification: GeneralEquipmentDetailPageData["detail"]["classification"] & {
      technicalSiteTab: number;
      displayCollection: EquipmentDisplayCollection;
    };
  };
};

type LocalizedEquipmentDetailPageData =
  | LocalizedGeneralEquipmentDetailPageData
  | ExclusiveEquipmentDetailPageData;

const equipmentNameKr = equipmentNameKrJson as EquipmentNameKrProjection;
const equipmentReleaseChronology = equipmentReleaseChronologyJson as EquipmentReleaseChronology;
const equipmentReleaseContract = equipmentReleaseContractJson as EquipmentReleaseContract;
const equipmentPublicAdmissionCorrection =
  equipmentPublicAdmissionCorrectionJson as EquipmentPublicAdmissionCorrection;
const equipmentReleaseOrder = new Map(
  equipmentReleaseChronology.defaultOrderEquipmentIds.map((equipmentId, index) => [equipmentId, index]),
);
const publicExcludedEquipmentIds = new Set(
  equipmentPublicAdmissionCorrection.excludedEquipmentIds,
);
const publicExcludedChronologyIds = new Set(
  equipmentReleaseContract.scope.publicExcludedTechnicalEquipmentIds,
);

if (
  equipmentPublicAdmissionCorrection.status !== "FROZEN" ||
  equipmentPublicAdmissionCorrection.policy.joinKey !== "equipmentId" ||
  publicExcludedEquipmentIds.size !== equipmentPublicAdmissionCorrection.expectedPublicProjection.excludedCount ||
  equipmentPublicAdmissionCorrection.records.length !== publicExcludedEquipmentIds.size
) {
  throw new Error("Equipment public admission correction contract is inconsistent.");
}

for (const record of equipmentPublicAdmissionCorrection.records) {
  if (!publicExcludedEquipmentIds.has(record.equipmentId)) {
    throw new Error(
      `Equipment public admission correction record ${record.equipmentId} is missing from excludedEquipmentIds.`,
    );
  }
}

if (
  equipmentReleaseContract.status !== "FROZEN" ||
  equipmentReleaseContract.completion !== "EQUIPMENT_P3_1_RELEASE_CHRONOLOGY_V2_FROZEN" ||
  equipmentReleaseContract.predecessor.chronologyDataSource !==
    "data/presentation/equipment-p3-1-release-metadata.v1.json" ||
  equipmentReleaseContract.predecessor.displayCollection !==
    "data/presentation/equipment-display-collection.v1.json" ||
  equipmentReleaseContract.scope.chronologyDefinesDisplayMembership !== false ||
  equipmentReleaseContract.scope.displayMembershipSource !==
    "data/presentation/equipment-display-collection.v1.json" ||
  equipmentReleaseContract.dataReuse.mode !== "REUSE_FROZEN_V1_CHRONOLOGY_RECORDS" ||
  equipmentReleaseContract.dataReuse.joinKey !== "equipmentId" ||
  equipmentReleaseContract.consumerPolicy.chronologyJoinKey !== "equipmentId" ||
  equipmentReleaseContract.consumerPolicy.displayCollectionMustNotBeDerivedFromChronology !== true ||
  equipmentReleaseContract.consumerPolicy.releaseFamilyMustNotBeUsedAsMembershipRule !== true
) {
  throw new Error("Equipment P3-1 chronology V2 contract is inconsistent.");
}

if (
  equipmentReleaseContract.dataReuse.defaultOrderRecomputed ||
  equipmentReleaseContract.dataReuse.releaseDatesRecomputed ||
  equipmentReleaseContract.dataReuse.evidenceStatusesRecomputed ||
  equipmentReleaseContract.dataReuse.sourceIdsRecomputed ||
  equipmentReleaseContract.dataReuse.releaseFamiliesRecomputed ||
  equipmentReleaseContract.dataReuse.identityContinuityRecomputed
) {
  throw new Error("Equipment P3-1 chronology V2 must reuse the frozen V1 chronology without recomputation.");
}

if (
  equipmentReleaseChronology.scope.siteTab !== equipmentReleaseContract.scope.technicalSiteTab ||
  equipmentReleaseChronology.scope.targetCount !== equipmentReleaseContract.scope.technicalTargetCount ||
  equipmentReleaseChronology.scope.releaseDateCoverage !== equipmentReleaseContract.scope.releaseDateCoverage ||
  equipmentReleaseChronology.policy.joinKey !== equipmentReleaseContract.dataReuse.joinKey
) {
  throw new Error("Equipment P3-1 chronology V1 data and V2 active contract diverge.");
}

if (
  publicExcludedChronologyIds.size !==
  equipmentReleaseContract.scope.publicExcludedTechnicalEquipmentIds.length
) {
  throw new Error("Equipment P3-1 V2 public-excluded chronology membership contains duplicates.");
}
for (const equipmentId of publicExcludedChronologyIds) {
  if (!publicExcludedEquipmentIds.has(equipmentId)) {
    throw new Error(`Equipment ${equipmentId} is chronology-excluded but not public-admission excluded.`);
  }
}

function resolveNameKr(equipmentId: number, nameCn: string, fallback: string | null) {
  const localized = equipmentNameKr.byEquipmentId[String(equipmentId)];
  if (!localized) {
    throw new Error(`Missing Korean equipment presentation record for ${equipmentId}.`);
  }
  if (localized.nameCn !== nameCn) {
    throw new Error(
      `Equipment ${equipmentId} Korean presentation identity mismatch: ${localized.nameCn} !== ${nameCn}.`,
    );
  }
  return localized.nameKr ?? fallback;
}

function requireReleaseChronology(equipmentId: number, nameCn: string) {
  const projected = equipmentReleaseChronology.byEquipmentId[String(equipmentId)];
  if (!projected) {
    throw new Error(`Missing P3-1 release chronology record for Equipment ${equipmentId}.`);
  }
  if (projected.equipmentId !== equipmentId || projected.nameCn !== nameCn) {
    throw new Error(
      `Equipment ${equipmentId} P3-1 release identity mismatch: ${projected.nameCn} !== ${nameCn}.`,
    );
  }
  if (!projected.releaseGroupDate) {
    throw new Error(`Equipment ${equipmentId} P3-1 releaseGroupDate is empty.`);
  }
  return projected;
}

function applyGeneralReleaseChronology(records: EquipmentListRecord[]) {
  const targetTab = equipmentReleaseContract.scope.technicalSiteTab;
  const projectedIds = equipmentReleaseChronology.defaultOrderEquipmentIds;
  const projectedIdSet = new Set(projectedIds);

  if (
    projectedIds.length !== equipmentReleaseContract.scope.technicalTargetCount ||
    projectedIdSet.size !== projectedIds.length ||
    Object.keys(equipmentReleaseChronology.byEquipmentId).length !== projectedIds.length
  ) {
    throw new Error("Equipment P3-1 release chronology population contract is inconsistent.");
  }

  const chronologyPresentedRecords = records.map((record) => {
    if (record.siteTab !== targetTab) return record;
    const release = requireReleaseChronology(record.equipmentId, record.nameCn);
    return {
      ...record,
      releaseGroupDate: release.releaseGroupDate,
    };
  });

  const targetRecords = chronologyPresentedRecords.filter((record) => record.siteTab === targetTab);
  if (targetRecords.length !== equipmentReleaseContract.scope.publicChronologyCount) {
    throw new Error(
      `Equipment P3-1 public chronology population mismatch: ${targetRecords.length} !== ${equipmentReleaseContract.scope.publicChronologyCount}.`,
    );
  }

  for (const record of targetRecords) {
    if (!projectedIdSet.has(record.equipmentId)) {
      throw new Error(`Equipment ${record.equipmentId} is missing from the frozen P3-1 chronology order.`);
    }
  }

  const sortedTargetRecords = [...targetRecords].sort((left, right) => {
    const leftRank = equipmentReleaseOrder.get(left.equipmentId);
    const rightRank = equipmentReleaseOrder.get(right.equipmentId);
    if (leftRank === undefined || rightRank === undefined) {
      throw new Error("Equipment P3-1 chronology order rank is missing.");
    }
    return leftRank - rightRank;
  });

  let targetCursor = 0;
  return chronologyPresentedRecords.map((record) => {
    if (record.siteTab !== targetTab) return record;
    const replacement = sortedTargetRecords[targetCursor++];
    if (!replacement) {
      throw new Error("Equipment P3-1 ordered chronology record is missing.");
    }
    return replacement;
  });
}

function countTabs(records: EquipmentListRecord[]) {
  return Object.fromEntries(
    [1, 2, 3].map((tab) => [
      String(tab),
      records.filter((record) => record.siteTab === tab).length,
    ]),
  );
}

export function readGeneralEquipmentPageData() {
  const data = readBaseGeneralEquipmentPageData();
  const publicRecords = data.records.filter(
    (record) => !publicExcludedEquipmentIds.has(record.equipmentId),
  );

  if (
    publicRecords.length !==
    equipmentPublicAdmissionCorrection.expectedPublicProjection.generalEquipmentCount
  ) {
    throw new Error(
      `Equipment public general population mismatch: ${publicRecords.length} !== ${equipmentPublicAdmissionCorrection.expectedPublicProjection.generalEquipmentCount}.`,
    );
  }

  const technicalTabs = countTabs(publicRecords);
  for (const [tab, expected] of Object.entries(
    equipmentPublicAdmissionCorrection.expectedPublicProjection.technicalTabCountsAfterAdmissionOnly,
  )) {
    if (technicalTabs[tab] !== expected) {
      throw new Error(`Equipment public technical tab ${tab} mismatch: ${technicalTabs[tab]} !== ${expected}.`);
    }
  }

  const localizedRecords = publicRecords.map((record) => ({
    ...record,
    nameKr: resolveNameKr(record.equipmentId, record.nameCn, record.nameKr),
  }));
  const chronologyPresentedRecords = applyGeneralReleaseChronology(localizedRecords);
  const presentationRecords = chronologyPresentedRecords.map((record) => {
    const technicalSiteTab = record.siteTab;
    if (technicalSiteTab == null) {
      throw new Error(`Public general Equipment ${record.equipmentId} is missing technical siteTab.`);
    }
    const displayCollection = resolveEquipmentDisplayCollection(record.equipmentId, technicalSiteTab);
    return {
      ...record,
      technicalSiteTab,
      displayCollection,
      siteTab: displayCollection,
    };
  });
  const presentationTabs = countTabs(presentationRecords);

  for (const tab of [1, 2, 3] as const) {
    const expected = EQUIPMENT_DISPLAY_COLLECTION_EXPECTED_COUNTS[tab];
    if (presentationTabs[String(tab)] !== expected) {
      throw new Error(
        `Equipment display collection ${tab} mismatch: ${presentationTabs[String(tab)]} !== ${expected}.`,
      );
    }
  }

  return {
    ...data,
    records: presentationRecords,
    tabs: presentationTabs,
    technicalTabs,
  };
}

export function readExclusiveEquipmentPageData() {
  const data = readBaseExclusiveEquipmentPageData();
  return {
    ...data,
    records: data.records.map((record) => ({
      ...record,
      nameKr: resolveNameKr(record.equipmentId, record.nameCn, record.nameKr),
    })),
  };
}

export function readEquipmentDetailPageData(
  equipmentId: number,
): LocalizedEquipmentDetailPageData | null {
  if (publicExcludedEquipmentIds.has(equipmentId)) return null;

  const data = readBaseEquipmentDetailPageData(equipmentId);
  if (!data) return null;

  if (data.kind === "general") {
    const identity = data.detail.identity;
    const technicalSiteTab = data.detail.classification.siteTab;
    const displayCollection = resolveEquipmentDisplayCollection(equipmentId, technicalSiteTab);
    const nameKr = resolveNameKr(equipmentId, identity.nameCn, identity.nameKr);
    const release =
      technicalSiteTab === equipmentReleaseContract.scope.technicalSiteTab
        ? requireReleaseChronology(equipmentId, identity.nameCn)
        : null;
    const localized: LocalizedGeneralEquipmentDetailPageData = {
      ...data,
      displayName: nameKr ?? identity.nameCn,
      detail: {
        ...data.detail,
        identity: {
          ...identity,
          nameKr,
        },
        classification: {
          ...data.detail.classification,
          technicalSiteTab,
          displayCollection,
          siteTab: displayCollection,
        },
        acquisition: release
          ? {
              ...data.detail.acquisition,
              releaseGroupDate: release.releaseGroupDate,
            }
          : data.detail.acquisition,
      },
    };
    return localized;
  }

  const identity = data.detail.identity;
  const nameKr = resolveNameKr(equipmentId, identity.nameCn, identity.nameKr);
  const localized: ExclusiveEquipmentDetailPageData = {
    ...data,
    displayName: nameKr ?? identity.nameCn,
    detail: {
      ...data.detail,
      identity: {
        ...identity,
        nameKr,
      },
    },
  };
  return localized;
}
