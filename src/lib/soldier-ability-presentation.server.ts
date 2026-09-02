import soldierAbilityKrJson from "../../data/presentation/soldier-ability-kr.v1.json";

import {
  readSoldierPrototypePageData,
  type SoldierPrototypeRecord,
} from "./soldier-page.server";

type SoldierAbilityPresentationSource = {
  version: number;
  schemaId: string;
  status: string;
  scope: string;
  source: {
    identityMutation: boolean;
    mappingMethod: string;
    spAbilityPolicy: string;
  };
  coverage: {
    recordCount: number;
    normalCount: number;
    spCount: number;
    localizedAbilityCount: number;
    noAbilityCount: number;
    unresolvedCount: number;
  };
  normalBySoldierId: Record<string, string | null>;
  spBySoldierId: Record<
    string,
    {
      normalSoldierId: number;
      abilityKr: string;
    }
  >;
};

export type SoldierAbilityKrStatus = "LOCALIZED" | "NO_ABILITY";

export type SoldierPrototypePresentationRecord = SoldierPrototypeRecord & {
  presentation: {
    abilityKr: string | null;
    abilityKrStatus: SoldierAbilityKrStatus;
  };
};

type SoldierPrototypePageData = ReturnType<typeof readSoldierPrototypePageData>;

const soldierAbilityKr = soldierAbilityKrJson as unknown as SoldierAbilityPresentationSource;
const CJK_IDEOGRAPH_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff]/u;
const hasOwn = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

function fail(message: string): never {
  throw new Error(`Soldier Korean ability presentation: ${message}`);
}

function assertLocalizedAbility(soldierId: number, abilityKr: unknown): asserts abilityKr is string {
  if (typeof abilityKr !== "string" || !abilityKr.trim()) {
    fail(`Soldier ${soldierId} has an empty/non-string Korean ability.`);
  }
  if (abilityKr.trim() === "-") {
    fail(`Soldier ${soldierId} stores '-' instead of an explicit no-ability state.`);
  }
  if (CJK_IDEOGRAPH_PATTERN.test(abilityKr)) {
    fail(`Soldier ${soldierId} Korean ability contains CJK ideographs.`);
  }
}

function assertPresentationSourceContract() {
  if (
    soldierAbilityKr.version !== 1 ||
    soldierAbilityKr.schemaId !== "soldier-ability-kr-presentation/v1" ||
    soldierAbilityKr.status !== "PASS" ||
    soldierAbilityKr.scope !== "frontend-presentation-only" ||
    soldierAbilityKr.source?.identityMutation !== false
  ) {
    fail("source contract mismatch.");
  }

  if (
    soldierAbilityKr.source.mappingMethod !==
    "Direct ID projection from the supplied confirmed source. No name JOIN, ID arithmetic, or semantic recomputation."
  ) {
    fail("identity mapping policy mismatch.");
  }

  if (
    soldierAbilityKr.source.spAbilityPolicy !==
    "Use the SP row's directly supplied SP ability text; never patch NORMAL ability numbers to derive SP text."
  ) {
    fail("SP ability policy mismatch.");
  }

  const expectedCoverage = {
    recordCount: 224,
    normalCount: 168,
    spCount: 56,
    localizedAbilityCount: 212,
    noAbilityCount: 12,
    unresolvedCount: 0,
  };

  for (const [key, expected] of Object.entries(expectedCoverage)) {
    if (soldierAbilityKr.coverage?.[key as keyof typeof expectedCoverage] !== expected) {
      fail(`coverage.${key} must be ${expected}.`);
    }
  }

  const normalIds = Object.keys(soldierAbilityKr.normalBySoldierId ?? {});
  const spIds = Object.keys(soldierAbilityKr.spBySoldierId ?? {});
  if (normalIds.length !== 168 || spIds.length !== 56) {
    fail(`source ID population mismatch: NORMAL=${normalIds.length}, SP=${spIds.length}.`);
  }

  const sourceIds = new Set(normalIds);
  for (const soldierId of spIds) {
    if (sourceIds.has(soldierId)) {
      fail(`Soldier ${soldierId} appears in both NORMAL and SP presentation maps.`);
    }
    sourceIds.add(soldierId);
  }
  if (sourceIds.size !== 224) {
    fail(`source Soldier ID coverage must be 224; got ${sourceIds.size}.`);
  }
}

export function readSoldierPrototypePageDataWithAbilityPresentation(
  pageData: SoldierPrototypePageData = readSoldierPrototypePageData(),
) {
  assertPresentationSourceContract();

  if (
    pageData.records.length !== 224 ||
    pageData.summary.recordCount !== 224 ||
    pageData.summary.normalCount !== 168 ||
    pageData.summary.spCount !== 56
  ) {
    fail("frozen frontend Soldier population contract mismatch.");
  }

  const pageIds = new Set<number>();
  let localizedAbilityCount = 0;
  let noAbilityCount = 0;

  const records = pageData.records.map((record): SoldierPrototypePresentationRecord => {
    if (pageIds.has(record.soldierId)) {
      fail(`duplicate frontend Soldier ID ${record.soldierId}.`);
    }
    pageIds.add(record.soldierId);

    const key = String(record.soldierId);

    if (record.isSp) {
      if (hasOwn(soldierAbilityKr.normalBySoldierId, key)) {
        fail(`SP Soldier ${record.soldierId} is incorrectly present in the NORMAL presentation map.`);
      }
      if (!hasOwn(soldierAbilityKr.spBySoldierId, key)) {
        fail(`missing SP Korean ability for Soldier ${record.soldierId}.`);
      }

      const presentation = soldierAbilityKr.spBySoldierId[key];
      if (!presentation || presentation.normalSoldierId !== record.normalSoldierId) {
        fail(
          `SP relation mismatch for Soldier ${record.soldierId}: presentation=${presentation?.normalSoldierId ?? "missing"}, frontend=${record.normalSoldierId ?? "null"}.`,
        );
      }
      assertLocalizedAbility(record.soldierId, presentation.abilityKr);
      localizedAbilityCount += 1;

      return {
        ...record,
        presentation: {
          abilityKr: presentation.abilityKr,
          abilityKrStatus: "LOCALIZED",
        },
      };
    }

    if (hasOwn(soldierAbilityKr.spBySoldierId, key)) {
      fail(`NORMAL Soldier ${record.soldierId} is incorrectly present in the SP presentation map.`);
    }
    if (!hasOwn(soldierAbilityKr.normalBySoldierId, key)) {
      fail(`missing NORMAL Korean ability presentation for Soldier ${record.soldierId}.`);
    }

    const abilityKr = soldierAbilityKr.normalBySoldierId[key];
    if (abilityKr === null) {
      if (record.tier !== 1) {
        fail(`only Tier 1 NORMAL Soldiers may have no ability: ${record.soldierId}.`);
      }
      noAbilityCount += 1;
      return {
        ...record,
        presentation: {
          abilityKr: null,
          abilityKrStatus: "NO_ABILITY",
        },
      };
    }

    assertLocalizedAbility(record.soldierId, abilityKr);
    localizedAbilityCount += 1;
    return {
      ...record,
      presentation: {
        abilityKr,
        abilityKrStatus: "LOCALIZED",
      },
    };
  });

  const sourceIds = [
    ...Object.keys(soldierAbilityKr.normalBySoldierId),
    ...Object.keys(soldierAbilityKr.spBySoldierId),
  ].map(Number);
  const unexpectedSourceIds = sourceIds.filter((soldierId) => !pageIds.has(soldierId));
  if (unexpectedSourceIds.length > 0) {
    fail(`presentation contains unexpected Soldier IDs: ${unexpectedSourceIds.join(",")}.`);
  }

  if (
    pageIds.size !== soldierAbilityKr.coverage.recordCount ||
    localizedAbilityCount !== soldierAbilityKr.coverage.localizedAbilityCount ||
    noAbilityCount !== soldierAbilityKr.coverage.noAbilityCount
  ) {
    fail(
      `resolved coverage mismatch: records=${pageIds.size}, localized=${localizedAbilityCount}, noAbility=${noAbilityCount}.`,
    );
  }

  return {
    ...pageData,
    abilityPresentation: {
      status: "PASS" as const,
      localizedAbilityCount,
      noAbilityCount,
      unresolvedCount: 0,
      runtimeNameJoin: false,
      semanticRecomputation: false,
    },
    records,
  };
}
