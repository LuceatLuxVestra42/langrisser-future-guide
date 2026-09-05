import generalPart1Json from "../../data/presentation/equipment-effect-description-kr-general.part1.v1.json";
import generalPart2Json from "../../data/presentation/equipment-effect-description-kr-general.part2.v1.json";
import exclusivePart1Json from "../../data/presentation/equipment-effect-description-kr-exclusive.part1.v1.json";
import exclusivePart2Json from "../../data/presentation/equipment-effect-description-kr-exclusive.part2.v1.json";
import {
  readEquipmentDetailPageData as readLocalizedEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} from "./equipment-page.localized.server";
import type { EquipmentEffectSegment } from "./equipment-page.server";

export { readExclusiveEquipmentPageData, readGeneralEquipmentPageData };

type EffectDescriptionProjection = {
  version: number;
  status: string;
  scope: "general" | "exclusive";
  policy: {
    joinKey: string;
    runtimeNameJoin: boolean;
    nameMutation: boolean;
    effectNameLocalized: boolean;
    semanticStageReopened: boolean;
    effectTextRewrite: boolean;
    unmatchedRows: string;
  };
  counts: {
    sourceRows: number;
    matched: number;
    review: number;
    partMatched: number;
  };
  part: number;
  partCount: number;
  byEquipmentId: Record<string, string>;
};

type EffectCarrier = {
  effect: {
    effectText: string;
    effectSegments: EquipmentEffectSegment[];
  };
};

const projections = [
  generalPart1Json,
  generalPart2Json,
  exclusivePart1Json,
  exclusivePart2Json,
] as EffectDescriptionProjection[];

const expectedScopeCounts = {
  general: { sourceRows: 174, matched: 128, review: 46 },
  exclusive: { sourceRows: 143, matched: 133, review: 10 },
} as const;

const effectDescriptionByEquipmentId = new Map<number, string>();

for (const scope of ["general", "exclusive"] as const) {
  const scoped = projections.filter((projection) => projection.scope === scope);
  const expected = expectedScopeCounts[scope];
  if (scoped.length !== 2) {
    throw new Error(`Equipment KR effect ${scope} projection must have exactly two parts.`);
  }

  const seenParts = new Set<number>();
  let matched = 0;
  for (const projection of scoped) {
    if (
      projection.version !== 1 ||
      projection.status !== "FROZEN_PRESENTATION_INPUT" ||
      projection.policy.joinKey !== "equipmentId" ||
      projection.policy.runtimeNameJoin ||
      projection.policy.nameMutation ||
      projection.policy.effectNameLocalized ||
      projection.policy.semanticStageReopened ||
      projection.policy.effectTextRewrite ||
      projection.policy.unmatchedRows !== "REVIEW_ONLY" ||
      projection.partCount !== 2 ||
      projection.counts.sourceRows !== expected.sourceRows ||
      projection.counts.matched !== expected.matched ||
      projection.counts.review !== expected.review
    ) {
      throw new Error(`Equipment KR effect ${scope} projection contract is inconsistent.`);
    }

    if (seenParts.has(projection.part)) {
      throw new Error(`Equipment KR effect ${scope} projection part ${projection.part} is duplicated.`);
    }
    seenParts.add(projection.part);

    const entries = Object.entries(projection.byEquipmentId);
    if (entries.length !== projection.counts.partMatched) {
      throw new Error(`Equipment KR effect ${scope} part ${projection.part} count mismatch.`);
    }
    matched += entries.length;

    for (const [equipmentIdRaw, effectTextKr] of entries) {
      const equipmentId = Number(equipmentIdRaw);
      if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0 || !effectTextKr.trim()) {
        throw new Error(`Invalid Equipment KR effect record: ${equipmentIdRaw}.`);
      }
      if (effectDescriptionByEquipmentId.has(equipmentId)) {
        throw new Error(`Duplicate Equipment KR effect record: ${equipmentId}.`);
      }
      effectDescriptionByEquipmentId.set(equipmentId, effectTextKr);
    }
  }

  if (matched !== expected.matched) {
    throw new Error(`Equipment KR effect ${scope} matched count mismatch: ${matched} !== ${expected.matched}.`);
  }
}

if (effectDescriptionByEquipmentId.size !== 261) {
  throw new Error(`Equipment KR effect total matched count mismatch: ${effectDescriptionByEquipmentId.size} !== 261.`);
}

function applyEffectDescription<T extends EffectCarrier>(equipmentId: number, detail: T): T {
  const effectTextKr = effectDescriptionByEquipmentId.get(equipmentId);
  if (!effectTextKr) return detail;

  return {
    ...detail,
    effect: {
      ...detail.effect,
      effectText: effectTextKr,
      effectSegments: [{ text: effectTextKr, highlight: false }],
    },
  } as T;
}

export function readEquipmentDetailPageData(equipmentId: number) {
  const pageData = readLocalizedEquipmentDetailPageData(equipmentId);
  if (!pageData) return null;

  return {
    ...pageData,
    detail: applyEffectDescription(equipmentId, pageData.detail),
  };
}
