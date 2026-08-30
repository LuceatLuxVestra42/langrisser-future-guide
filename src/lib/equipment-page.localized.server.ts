import equipmentNameKrJson from "../../data/generated/equipment-name-kr-user-approved.v1.json";
import equipmentPublicAdmissionCorrectionJson from "../../data/presentation/equipment-public-admission-correction.v1.json";
import equipmentReleaseProjectionJson from "../../data/presentation/equipment-p3-1-release-metadata.v1.json";
import {
  readEquipmentDetailPageData as readBaseEquipmentDetailPageData,
  readExclusiveEquipmentPageData as readBaseExclusiveEquipmentPageData,
  readGeneralEquipmentPageData as readBaseGeneralEquipmentPageData,
} from "./equipment-page.server";
import type {
  EquipmentDetailPageData,
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

type EquipmentReleaseProjection = {
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

const equipmentNameKr = equipmentNameKrJson as EquipmentNameKrProjection;
const equipmentReleaseProjection = equipmentReleaseProjectionJson as EquipmentReleaseProjection;
const equipmentPublicAdmissionCorrection =
  equipmentPublicAdmissionCorrectionJson as EquipmentPublicAdmissionCorrection;
const equipmentReleaseOrder = new Map(
  equipmentReleaseProjection.defaultOrderEquipmentIds.map((equipmentId, index) => [equipmentId, index]),
);
const publicExcludedEquipmentIds = new Set(
  equipmentPublicAdmissionCorrection.excludedEquipmentIds,
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

function requireReleaseProjection(equipmentId: number, nameCn: string) {
  const projected = equipmentReleaseProjection.byEquipmentId[String(equipmentId)];
  if (!projected) {
    throw new Error(`Missing P3-1 release presentation record for Equipment ${equipmentId}.`);
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

function applyGeneralReleasePresentation(records: EquipmentListRecord[]) {
  if (equipmentReleaseProjection.policy.joinKey !== "equipmentId") {
    throw new Error("Equipment P3-1 release projection join key must remain equipmentId.");
  }

  const targetTab = equipmentReleaseProjection.scope.siteTab;
  const projectedIds = equipmentReleaseProjection.defaultOrderEquipmentIds;
  const projectedIdSet = new Set(projectedIds);

  if (
    projectedIds.length !== equipmentReleaseProjection.scope.targetCount ||
    projectedIdSet.size !== projectedIds.length ||
    Object.keys(equipmentReleaseProjection.byEquipmentId).length !== projectedIds.length
  ) {
    throw new Error("Equipment P3-1 release projection population contract is inconsistent.");
  }

  const projectedRecords = records.map((record) => {
    if (record.siteTab !== targetTab) return record;
    const release = requireReleaseProjection(record.equipmentId, record.nameCn);
    return {
      ...record,
      releaseGroupDate: release.releaseGroupDate,
    };
  });

  const targetRecords = projectedRecords.filter((record) => record.siteTab === targetTab);
  const excludedProjectedTargetCount = projectedIds.filter((equipmentId) =>
    publicExcludedEquipmentIds.has(equipmentId),
  ).length;
  const expectedPublicTargetCount =
    equipmentReleaseProjection.scope.targetCount - excludedProjectedTargetCount;
  if (targetRecords.length !== expectedPublicTargetCount) {
    throw new Error(
      `Equipment P3-1 public target population mismatch: ${targetRecords.length} !== ${expectedPublicTargetCount}.`,
    );
  }

  for (const record of targetRecords) {
    if (!projectedIdSet.has(record.equipmentId)) {
      throw new Error(`Equipment ${record.equipmentId} is missing from the frozen P3-1 default order.`);
    }
  }

  const sortedTargetRecords = [...targetRecords].sort((left, right) => {
    const leftRank = equipmentReleaseOrder.get(left.equipmentId);
    const rightRank = equipmentReleaseOrder.get(right.equipmentId);
    if (leftRank === undefined || rightRank === undefined) {
      throw new Error("Equipment P3-1 default order rank is missing.");
    }
    return leftRank - rightRank;
  });

  let targetCursor = 0;
  return projectedRecords.map((record) => {
    if (record.siteTab !== targetTab) return record;
    const replacement = sortedTargetRecords[targetCursor++];
    if (!replacement) {
      throw new Error("Equipment P3-1 ordered target record is missing.");
    }
    return replacement;
  });
}

function countPublicTabs(records: EquipmentListRecord[]) {
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

  const publicTabs = countPublicTabs(publicRecords);
  for (const [tab, expected] of Object.entries(
    equipmentPublicAdmissionCorrection.expectedPublicProjection.technicalTabCountsAfterAdmissionOnly,
  )) {
    if (publicTabs[tab] !== expected) {
      throw new Error(`Equipment public tab ${tab} mismatch: ${publicTabs[tab]} !== ${expected}.`);
    }
  }

  const localizedRecords = publicRecords.map((record) => ({
    ...record,
    nameKr: resolveNameKr(record.equipmentId, record.nameCn, record.nameKr),
  }));

  return {
    ...data,
    records: applyGeneralReleasePresentation(localizedRecords),
    tabs: publicTabs,
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
): EquipmentDetailPageData | null {
  if (publicExcludedEquipmentIds.has(equipmentId)) return null;

  const data = readBaseEquipmentDetailPageData(equipmentId);
  if (!data) return null;

  if (data.kind === "general") {
    const identity = data.detail.identity;
    const nameKr = resolveNameKr(equipmentId, identity.nameCn, identity.nameKr);
    const release =
      data.detail.classification.siteTab === equipmentReleaseProjection.scope.siteTab
        ? requireReleaseProjection(equipmentId, identity.nameCn)
        : null;
    const localized: GeneralEquipmentDetailPageData = {
      ...data,
      displayName: nameKr ?? identity.nameCn,
      detail: {
        ...data.detail,
        identity: {
          ...identity,
          nameKr,
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
