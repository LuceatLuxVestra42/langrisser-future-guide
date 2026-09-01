import basicTableJson from "../../data/generated/banner-stage3-3-basic-table-consumer.v1.json";
import wishConsumerJson from "../../data/generated/banner-stage3-4-wish-consumer.v1.json";
import directWishCandidatesJson from "../../data/generated/banner-manual-wish-direct-candidates.v1.json";
import cpConsumerJson from "../../data/generated/banner-stage3-5-cp-event-consumer.v1.json";
import recurrenceConsumerJson from "../../data/generated/banner-stage3-6-recurrence-pickup-log-consumer.v1.json";

type BannerHero = {
  heroId: number;
  heroNameKr: string;
  sourceIndex: number;
  heroStatus: string;
};

type BannerImage = {
  displayState: string;
  canRenderImage: boolean;
  publicPath: string | null;
  assetId: string | null;
  provenance: string;
  replacementState: string;
  placeholderKey: string | null;
};

type BasicRow = {
  rowId: string;
  bannerOccurrenceId: string;
  bannerDefinitionId: string;
  krDisplayDate: string;
  displayOrder: number;
  mechanicFamily: "PICKUP" | "WISH";
  typeLabelKr: string;
  lifecycle: string;
  lifecycleLabelKr: string;
  image: BannerImage;
  pickupHeroes: BannerHero[];
  pickupHeroCount: number;
  rowStatus: string;
};

type BasicTableSource = {
  rowCount: number;
  dateGroupCount: number;
  rows: BasicRow[];
};

type WishCandidate = {
  heroId: number;
  heroNameKr: string;
  sourceIndex: number;
  heroStatus: string;
};

type WishCandidateSet = {
  bannerDefinitionId: string;
  candidateState: string;
  candidateCount: number;
  candidates: WishCandidate[];
};

type WishConsumerSource = {
  definitionCandidateSetCount: number;
  occurrenceWishRecordCount: number;
  candidateEdgeCount: number;
  definitionCandidateSets: WishCandidateSet[];
};

type DirectWishCandidate = {
  heroId: number;
  heroNameKr: string;
  productionId: number;
};

type DirectWishBinding = {
  bannerOccurrenceId: string;
  bannerDefinitionId: string;
};

type DirectWishCandidatesSource = {
  status: string;
  candidateState: string;
  candidateCount: number;
  candidates: DirectWishCandidate[];
  bindings: DirectWishBinding[];
};

type CpOccurrence = {
  bannerOccurrenceId: string;
  bannerDefinitionId: string;
  krDisplayDate: string;
  displayOrder: number;
  pickupHeroes: BannerHero[];
  pickupHeroCount: number;
  cpRelationType: string;
  eventReferenceLabelCn: string;
  canonicalEventId: string | null;
  eventNavigationAvailable: boolean;
  consumerStatus: string;
};

type CpConsumerSource = {
  definitionRecordCount: number;
  occurrenceRecordCount: number;
  occurrenceRecords: CpOccurrence[];
};

type DefinitionHistory = {
  bannerDefinitionId: string;
  historyScope: string;
  historyStatus: string;
  historyLabelKr: string;
  observedOccurrenceCount: number;
  firstObservedOccurrenceId: string;
  firstObservedKrDisplayDate: string;
  latestObservedOccurrenceId: string;
  latestObservedKrDisplayDate: string;
  observedOccurrenceIds: string[];
  mechanicFamily: "PICKUP" | "WISH";
  typeLabelKr: string;
  isRepeatedInCurrentDataset: boolean;
};

type RecurrenceLink = {
  bannerDefinitionId: string;
  fromOccurrenceId: string;
  toOccurrenceId: string;
  observedGapDays: number;
};

type RecurrenceConsumerSource = {
  definitionHistoryRecordCount: number;
  occurrenceLogRecordCount: number;
  recurrenceLinkCount: number;
  definitionHistoryRecords: DefinitionHistory[];
  recurrenceLinks: RecurrenceLink[];
};

export type BannerPageRow = {
  bannerOccurrenceId: string;
  bannerDefinitionId: string;
  krDisplayDate: string;
  displayOrder: number;
  mechanicFamily: "PICKUP" | "WISH";
  typeLabelKr: string;
  lifecycleLabelKr: string;
  image: BannerImage;
  pickupHeroes: Array<Pick<BannerHero, "heroId" | "heroNameKr">>;
  wishCandidateState: string | null;
  wishCandidateCount: number | null;
  cpRelated: boolean;
};

export type BannerWishCandidateSet = {
  bannerDefinitionId: string;
  candidateState: string;
  candidateCount: number;
  candidates: Array<{ heroId: number; heroNameKr: string }>;
};

export type BannerCpRecord = {
  bannerOccurrenceId: string;
  bannerDefinitionId: string;
  krDisplayDate: string;
  displayOrder: number;
  pickupHeroes: Array<Pick<BannerHero, "heroId" | "heroNameKr">>;
  eventReferenceLabelCn: string;
  canonicalEventId: string | null;
  eventNavigationAvailable: boolean;
  consumerStatus: string;
};

export type BannerPickupLog = {
  bannerDefinitionId: string;
  typeLabelKr: string;
  observedOccurrenceCount: number;
  historyLabelKr: string;
  firstObservedKrDisplayDate: string;
  latestObservedKrDisplayDate: string;
  appearances: Array<{
    bannerOccurrenceId: string;
    krDisplayDate: string;
    displayOrder: number;
    gapDaysFromPrevious: number | null;
    image: BannerImage;
    pickupHeroes: Array<Pick<BannerHero, "heroId" | "heroNameKr">>;
  }>;
};

const basicTable = basicTableJson as unknown as BasicTableSource;
const wishConsumer = wishConsumerJson as unknown as WishConsumerSource;
const directWishCandidates = directWishCandidatesJson as unknown as DirectWishCandidatesSource;
const cpConsumer = cpConsumerJson as unknown as CpConsumerSource;
const recurrenceConsumer = recurrenceConsumerJson as unknown as RecurrenceConsumerSource;

const basicRowByOccurrence = new Map(
  basicTable.rows.map((row) => [row.bannerOccurrenceId, row]),
);
const wishByDefinition = new Map(
  wishConsumer.definitionCandidateSets.map((record) => [record.bannerDefinitionId, record]),
);
const directWishDefinitionIds = new Set(
  directWishCandidates.bindings.map((binding) => binding.bannerDefinitionId),
);
const cpByOccurrence = new Map(
  cpConsumer.occurrenceRecords.map((record) => [record.bannerOccurrenceId, record]),
);
const gapByToOccurrence = new Map(
  recurrenceConsumer.recurrenceLinks.map((link) => [link.toOccurrenceId, link.observedGapDays]),
);

function projectHero(hero: BannerHero | WishCandidate | DirectWishCandidate) {
  return {
    heroId: hero.heroId,
    heroNameKr: hero.heroNameKr,
  };
}

function resolveWishCandidateSet(bannerDefinitionId: string): BannerWishCandidateSet | null {
  const frozenSet = wishByDefinition.get(bannerDefinitionId);
  if (!frozenSet) return null;

  if (frozenSet.candidateCount > 0 || !directWishDefinitionIds.has(bannerDefinitionId)) {
    return {
      bannerDefinitionId,
      candidateState: frozenSet.candidateState,
      candidateCount: frozenSet.candidateCount,
      candidates: frozenSet.candidates.map(projectHero),
    };
  }

  return {
    bannerDefinitionId,
    candidateState: directWishCandidates.candidateState,
    candidateCount: directWishCandidates.candidateCount,
    candidates: directWishCandidates.candidates.map(projectHero),
  };
}

export function readBannerPageData() {
  const rows: BannerPageRow[] = basicTable.rows.map((row) => {
    const wish = row.mechanicFamily === "WISH" ? resolveWishCandidateSet(row.bannerDefinitionId) : null;

    return {
      bannerOccurrenceId: row.bannerOccurrenceId,
      bannerDefinitionId: row.bannerDefinitionId,
      krDisplayDate: row.krDisplayDate,
      displayOrder: row.displayOrder,
      mechanicFamily: row.mechanicFamily,
      typeLabelKr: row.typeLabelKr,
      lifecycleLabelKr: row.lifecycleLabelKr,
      image: row.image,
      pickupHeroes: row.pickupHeroes.map(projectHero),
      wishCandidateState: wish?.candidateState ?? null,
      wishCandidateCount: wish?.candidateCount ?? null,
      cpRelated: cpByOccurrence.has(row.bannerOccurrenceId),
    };
  });

  const dateGroups = Array.from(
    rows.reduce((groups, row) => {
      const existing = groups.get(row.krDisplayDate) ?? [];
      existing.push(row);
      groups.set(row.krDisplayDate, existing);
      return groups;
    }, new Map<string, BannerPageRow[]>()),
    ([date, groupedRows]) => ({ date, rows: groupedRows }),
  );

  const wishCandidateSets: BannerWishCandidateSet[] = wishConsumer.definitionCandidateSets.map(
    (record) => resolveWishCandidateSet(record.bannerDefinitionId) ?? {
      bannerDefinitionId: record.bannerDefinitionId,
      candidateState: record.candidateState,
      candidateCount: record.candidateCount,
      candidates: record.candidates.map(projectHero),
    },
  );

  const cpRecords: BannerCpRecord[] = cpConsumer.occurrenceRecords.map((record) => ({
    bannerOccurrenceId: record.bannerOccurrenceId,
    bannerDefinitionId: record.bannerDefinitionId,
    krDisplayDate: record.krDisplayDate,
    displayOrder: record.displayOrder,
    pickupHeroes: record.pickupHeroes.map(projectHero),
    eventReferenceLabelCn: record.eventReferenceLabelCn,
    canonicalEventId: record.canonicalEventId,
    eventNavigationAvailable: record.eventNavigationAvailable,
    consumerStatus: record.consumerStatus,
  }));

  const pickupLogs: BannerPickupLog[] = recurrenceConsumer.definitionHistoryRecords
    .filter(
      (history) => history.mechanicFamily === "PICKUP" && history.isRepeatedInCurrentDataset,
    )
    .map((history) => ({
      bannerDefinitionId: history.bannerDefinitionId,
      typeLabelKr: history.typeLabelKr,
      observedOccurrenceCount: history.observedOccurrenceCount,
      historyLabelKr: history.historyLabelKr,
      firstObservedKrDisplayDate: history.firstObservedKrDisplayDate,
      latestObservedKrDisplayDate: history.latestObservedKrDisplayDate,
      appearances: history.observedOccurrenceIds.map((occurrenceId) => {
        const row = basicRowByOccurrence.get(occurrenceId);
        if (!row) {
          throw new Error(`Banner recurrence occurrence ${occurrenceId} is missing from Stage 3-3.`);
        }
        return {
          bannerOccurrenceId: occurrenceId,
          krDisplayDate: row.krDisplayDate,
          displayOrder: row.displayOrder,
          gapDaysFromPrevious: gapByToOccurrence.get(occurrenceId) ?? null,
          image: row.image,
          pickupHeroes: row.pickupHeroes.map(projectHero),
        };
      }),
    }));

  return {
    summary: {
      bannerRows: rows.length,
      dateGroups: dateGroups.length,
      pickupRows: rows.filter((row) => row.mechanicFamily === "PICKUP").length,
      wishRows: rows.filter((row) => row.mechanicFamily === "WISH").length,
      renderableRows: rows.filter((row) => row.image.canRenderImage).length,
      wishDefinitions: wishCandidateSets.length,
      wishDefinitionsWithCandidates: wishCandidateSets.filter((record) => record.candidateCount > 0).length,
      wishDefinitionsReview: wishCandidateSets.filter((record) => record.candidateCount === 0).length,
      cpOccurrences: cpRecords.length,
      canonicalEventRelations: cpRecords.filter((record) => record.canonicalEventId !== null).length,
      repeatedPickupDefinitions: pickupLogs.length,
      recurrenceLinks: recurrenceConsumer.recurrenceLinkCount,
    },
    dateGroups,
    wishCandidateSets,
    cpRecords,
    pickupLogs,
    semantics: {
      historyScope: "CURRENT_CANONICAL_KR_SCHEDULE_DATASET",
      firstObservedMeansFirstEver: false,
      fixedCadenceEstablished: false,
      futureRecurrencePredicted: false,
      generalEventScheduleIntegrated: false,
      canonicalEventNavigationAvailable: false,
      heroDetailNavigationAvailable: false,
    },
  };
}
