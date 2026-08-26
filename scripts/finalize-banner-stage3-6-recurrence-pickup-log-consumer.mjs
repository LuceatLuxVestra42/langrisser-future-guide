import fs from 'node:fs';
import path from 'node:path';

const CONTRACT_PATH = 'data/contracts/banner-stage3-6-recurrence-pickup-log-consumer.v1.json';
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const uniq = values => [...new Set(values)];
const countBy = (rows, keyFn) => {
  const out = {};
  for (const row of rows) {
    const key = String(keyFn(row));
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

const contract = load(CONTRACT_PATH);
const stage33Summary = load(contract.inputs.stage33Summary);
const stage33 = load(contract.inputs.stage33BasicTable);
const stage35Summary = load(contract.inputs.stage35Summary);
const stage35 = load(contract.inputs.stage35CpEventConsumer);
const recurrence = load(contract.inputs.recurrenceHistory);

const errors = [];
const reviews = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

check(stage33Summary.status === 'PASS_BANNER_STAGE3_3_BASIC_TABLE_CONSUMER', `Stage 3-3 status changed: ${stage33Summary.status}`);
check(stage35Summary.status === 'PASS_BANNER_STAGE3_5_CP_EVENT_CONSUMER', `Stage 3-5 status changed: ${stage35Summary.status}`);
check(recurrence.status === 'CANONICAL_BANNER_RECURRENCE_HISTORY_MATERIALIZED', `recurrence status changed: ${recurrence.status}`);
check(recurrence.historyScope === contract.historyPolicy.scope, `history scope changed: ${recurrence.historyScope}`);
check(recurrence.firstEverReleaseEstablished === false, 'recurrence source unexpectedly establishes first-ever release');
check(recurrence.fixedCadenceEstablished === false, 'recurrence source unexpectedly establishes fixed cadence');

const rows = stage33.rows ?? [];
const histories = recurrence.definitionHistories ?? [];
const cpRows = stage35.occurrenceRecords ?? [];

check(rows.length === contract.expectedCanonicalPopulation.occurrences, `Stage 3-3 rows ${rows.length}`);
check(histories.length === contract.expectedCanonicalPopulation.definitions, `recurrence definitions ${histories.length}`);
check(cpRows.length === contract.expectedCanonicalPopulation.cpPickupOccurrences, `Stage 3-5 CP rows ${cpRows.length}`);

const rowByOccurrenceId = new Map(rows.map(row => [row.bannerOccurrenceId, row]));
const historyByDefinitionId = new Map(histories.map(history => [history.bannerDefinitionId, history]));
const cpRowByOccurrenceId = new Map(cpRows.map(row => [row.bannerOccurrenceId, row]));
check(rowByOccurrenceId.size === rows.length, 'duplicate Stage 3-3 occurrence IDs');
check(historyByDefinitionId.size === histories.length, 'duplicate recurrence definition IDs');
check(cpRowByOccurrenceId.size === cpRows.length, 'duplicate Stage 3-5 CP occurrence IDs');

const recurrenceOccurrenceById = new Map();
const recurrenceLinks = [];
const manualRepeatedDefinitions = [];
let maxObservedOccurrenceCount = 0;

for (const history of histories) {
  check(history.historyScope === contract.historyPolicy.scope, `${history.bannerDefinitionId}: history scope mismatch`);
  check(Array.isArray(history.observedOccurrences), `${history.bannerDefinitionId}: observedOccurrences missing`);
  check(history.observedOccurrenceCount === (history.observedOccurrences?.length ?? -1), `${history.bannerDefinitionId}: observed count mismatch`);
  maxObservedOccurrenceCount = Math.max(maxObservedOccurrenceCount, history.observedOccurrenceCount ?? 0);

  if (history.sourceKind === 'MANUAL_OCCURRENCE_SCOPED' && history.observedOccurrenceCount > 1) {
    manualRepeatedDefinitions.push(history.bannerDefinitionId);
  }

  for (const observed of history.observedOccurrences ?? []) {
    check(!recurrenceOccurrenceById.has(observed.bannerOccurrenceId), `${observed.bannerOccurrenceId}: duplicated across histories`);
    recurrenceOccurrenceById.set(observed.bannerOccurrenceId, {
      ...observed,
      bannerDefinitionId: history.bannerDefinitionId,
      historyStatus: history.historyStatus,
      observedOccurrenceCount: history.observedOccurrenceCount,
      sourceKind: history.sourceKind,
      effectiveSourceRecordKey: history.effectiveSourceRecordKey
    });

    if (observed.nextObservedOccurrenceId != null) {
      recurrenceLinks.push({
        bannerDefinitionId: history.bannerDefinitionId,
        fromOccurrenceId: observed.bannerOccurrenceId,
        toOccurrenceId: observed.nextObservedOccurrenceId,
        observedGapDays: observed.nextObservedGapDays,
        interpretation: 'OBSERVED_ADJACENT_GAP_ONLY'
      });
    }
  }
}

check(recurrenceOccurrenceById.size === contract.expectedCanonicalPopulation.occurrences,
  `flattened recurrence occurrences ${recurrenceOccurrenceById.size}`);
check(manualRepeatedDefinitions.length === 0, `manual repeated definitions ${manualRepeatedDefinitions.length}`);

for (const link of recurrenceLinks) {
  const from = recurrenceOccurrenceById.get(link.fromOccurrenceId);
  const to = recurrenceOccurrenceById.get(link.toOccurrenceId);
  check(Boolean(from), `${link.fromOccurrenceId}: missing recurrence-link source`);
  check(Boolean(to), `${link.toOccurrenceId}: missing recurrence-link target`);
  if (!from || !to) continue;
  check(from.bannerDefinitionId === to.bannerDefinitionId, `${link.fromOccurrenceId}: recurrence link crosses definitions`);
  check(to.previousObservedOccurrenceId === from.bannerOccurrenceId, `${link.toOccurrenceId}: previous occurrence backlink mismatch`);
  check(to.previousObservedGapDays === link.observedGapDays, `${link.toOccurrenceId}: recurrence gap backlink mismatch`);
  check(Number.isInteger(link.observedGapDays) && link.observedGapDays >= 0, `${link.fromOccurrenceId}: invalid observed gap`);
}

const occurrenceLogRecords = [];
for (const row of rows) {
  const observed = recurrenceOccurrenceById.get(row.bannerOccurrenceId);
  check(Boolean(observed), `${row.bannerOccurrenceId}: missing recurrence occurrence`);
  if (!observed) continue;

  check(observed.bannerDefinitionId === row.bannerDefinitionId, `${row.bannerOccurrenceId}: definition mismatch`);
  check(observed.krDisplayDate === row.krDisplayDate, `${row.bannerOccurrenceId}: date mismatch`);
  check(observed.displayOrder === row.displayOrder, `${row.bannerOccurrenceId}: displayOrder mismatch`);

  const isRepeatedDefinition = observed.observedOccurrenceCount > 1;
  const isReobservedOccurrence = observed.observationRole === 'REOBSERVED_IN_CURRENT_DATASET';
  const cp = cpRowByOccurrenceId.get(row.bannerOccurrenceId) ?? null;

  occurrenceLogRecords.push({
    rowId: row.bannerOccurrenceId,
    bannerOccurrenceId: row.bannerOccurrenceId,
    bannerDefinitionId: row.bannerDefinitionId,
    krDisplayDate: row.krDisplayDate,
    displayOrder: row.displayOrder,
    mechanicFamily: row.mechanicFamily,
    typeLabelKr: row.typeLabelKr,
    lifecycle: row.lifecycle,
    lifecycleLabelKr: row.lifecycleLabelKr,
    image: row.image,
    pickupHeroes: row.mechanicFamily === 'PICKUP' ? row.pickupHeroes : [],
    pickupHeroCount: row.mechanicFamily === 'PICKUP' ? row.pickupHeroCount : 0,
    history: {
      scope: contract.historyPolicy.scope,
      historyStatus: observed.historyStatus,
      observedOccurrenceCount: observed.observedOccurrenceCount,
      appearanceIndex: observed.appearanceIndex,
      observationRole: observed.observationRole,
      observationLabelKr: isReobservedOccurrence ? '재등장 관측' : '현 데이터셋 최초 관측',
      previousObservedOccurrenceId: observed.previousObservedOccurrenceId,
      previousObservedGapDays: observed.previousObservedGapDays,
      nextObservedOccurrenceId: observed.nextObservedOccurrenceId,
      nextObservedGapDays: observed.nextObservedGapDays,
      isRepeatedDefinition,
      firstObservedMeansFirstEver: false,
      gapDaysEstablishFixedCadence: false
    },
    logKinds: [
      'BANNER_HISTORY',
      ...(row.mechanicFamily === 'PICKUP' ? ['PICKUP'] : []),
      ...(cp ? ['CP_PICKUP'] : [])
    ],
    cpContext: cp ? {
      cpRelationType: cp.cpRelationType,
      eventReferenceLabelCn: cp.eventReferenceLabelCn,
      canonicalEventId: cp.canonicalEventId,
      eventNavigationAvailable: cp.eventNavigationAvailable
    } : null,
    prediction: null
  });
}

occurrenceLogRecords.sort((a, b) => a.krDisplayDate.localeCompare(b.krDisplayDate)
  || a.displayOrder - b.displayOrder
  || a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));

for (let i = 1; i < occurrenceLogRecords.length; i += 1) {
  const a = occurrenceLogRecords[i - 1];
  const b = occurrenceLogRecords[i];
  const ok = a.krDisplayDate < b.krDisplayDate
    || (a.krDisplayDate === b.krDisplayDate && a.displayOrder < b.displayOrder)
    || (a.krDisplayDate === b.krDisplayDate && a.displayOrder === b.displayOrder
      && a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId) <= 0);
  check(ok, `consumer chronology violation at ${b.bannerOccurrenceId}`);
}

const definitionHistoryRecords = histories.map(history => {
  const observedOccurrenceIds = (history.observedOccurrences ?? []).map(observed => observed.bannerOccurrenceId);
  const firstRow = rowByOccurrenceId.get(history.firstObservedOccurrenceId);
  check(Boolean(firstRow), `${history.bannerDefinitionId}: first observed row missing from Stage 3-3`);
  const isRepeated = history.observedOccurrenceCount > 1;
  return {
    bannerDefinitionId: history.bannerDefinitionId,
    effectiveSourceRecordKey: history.effectiveSourceRecordKey,
    sourceKind: history.sourceKind,
    historyScope: history.historyScope,
    historyStatus: history.historyStatus,
    historyLabelKr: `${history.observedOccurrenceCount}회 관측`,
    observedOccurrenceCount: history.observedOccurrenceCount,
    firstObservedOccurrenceId: history.firstObservedOccurrenceId,
    firstObservedKrDisplayDate: history.firstObservedKrDisplayDate,
    latestObservedOccurrenceId: history.latestObservedOccurrenceId,
    latestObservedKrDisplayDate: history.latestObservedKrDisplayDate,
    observedOccurrenceIds,
    mechanicFamily: firstRow?.mechanicFamily ?? null,
    typeLabelKr: firstRow?.typeLabelKr ?? null,
    isRepeatedInCurrentDataset: isRepeated,
    firstObservedMeansFirstEver: false,
    fixedCadenceEstablished: false,
    futureRecurrencePredicted: false
  };
}).sort((a, b) => a.firstObservedKrDisplayDate.localeCompare(b.firstObservedKrDisplayDate)
  || a.bannerDefinitionId.localeCompare(b.bannerDefinitionId));

const repeatedDefinitionRecords = definitionHistoryRecords.filter(record => record.isRepeatedInCurrentDataset);
const singleObservedDefinitionRecords = definitionHistoryRecords.filter(record => !record.isRepeatedInCurrentDataset);
const pickupOccurrenceIds = occurrenceLogRecords.filter(row => row.mechanicFamily === 'PICKUP').map(row => row.bannerOccurrenceId);
const cpPickupOccurrenceIds = occurrenceLogRecords.filter(row => row.logKinds.includes('CP_PICKUP')).map(row => row.bannerOccurrenceId);
const reobservedOccurrenceIds = occurrenceLogRecords.filter(row => row.history.observationRole === 'REOBSERVED_IN_CURRENT_DATASET')
  .map(row => row.bannerOccurrenceId);
const repeatedPickupDefinitionIds = uniq(occurrenceLogRecords
  .filter(row => row.mechanicFamily === 'PICKUP' && row.history.isRepeatedDefinition)
  .map(row => row.bannerDefinitionId));

check(definitionHistoryRecords.length === contract.expectedCanonicalPopulation.definitions,
  `definition history records ${definitionHistoryRecords.length}`);
check(occurrenceLogRecords.length === contract.expectedCanonicalPopulation.occurrences,
  `occurrence log records ${occurrenceLogRecords.length}`);
check(repeatedDefinitionRecords.length === contract.expectedCanonicalPopulation.repeatedDefinitions,
  `repeated definitions ${repeatedDefinitionRecords.length}`);
check(singleObservedDefinitionRecords.length === contract.expectedCanonicalPopulation.singleObservedDefinitions,
  `single-observed definitions ${singleObservedDefinitionRecords.length}`);
check(recurrenceLinks.length === contract.expectedCanonicalPopulation.recurrenceLinks,
  `recurrence links ${recurrenceLinks.length}`);
check(maxObservedOccurrenceCount === contract.expectedCanonicalPopulation.maxObservedOccurrenceCount,
  `max observed count ${maxObservedOccurrenceCount}`);
check(pickupOccurrenceIds.length === contract.expectedCanonicalPopulation.pickupOccurrences,
  `pickup occurrence IDs ${pickupOccurrenceIds.length}`);
check(cpPickupOccurrenceIds.length === contract.expectedCanonicalPopulation.cpPickupOccurrences,
  `CP pickup occurrence IDs ${cpPickupOccurrenceIds.length}`);

for (const cpId of cpPickupOccurrenceIds) {
  const row = rowByOccurrenceId.get(cpId);
  check(row?.mechanicFamily === 'PICKUP', `${cpId}: CP occurrence is not PICKUP in Stage 3-3`);
}

const appearanceHistogram = countBy(definitionHistoryRecords, record => record.observedOccurrenceCount);
const pickupRows = occurrenceLogRecords.filter(row => row.mechanicFamily === 'PICKUP');
const cpPickupRows = occurrenceLogRecords.filter(row => row.logKinds.includes('CP_PICKUP'));
const pickupHeroIds = pickupRows.flatMap(row => row.pickupHeroes.map(hero => hero.heroId));
const cpPickupHeroIds = cpPickupRows.flatMap(row => row.pickupHeroes.map(hero => hero.heroId));

check(pickupRows.reduce((sum, row) => sum + row.pickupHeroCount, 0) === stage33Summary.pickupSummary.pickupHeroReferencesAcrossRows,
  'pickup Hero reference count changed from Stage 3-3');
check(uniq(pickupHeroIds).length === stage33Summary.pickupSummary.uniquePickupHeroes,
  'unique pickup Hero count changed from Stage 3-3');
check(cpPickupRows.reduce((sum, row) => sum + row.pickupHeroCount, 0) === stage35Summary.cpContext.pickupHeroReferencesAcrossOccurrences,
  'CP pickup Hero reference count changed from Stage 3-5');
check(uniq(cpPickupHeroIds).length === stage35Summary.cpContext.uniquePickupHeroesAcrossOccurrences,
  'unique CP pickup Hero count changed from Stage 3-5');

const output = {
  version: 1,
  stage: 'Banner Stage 3-6',
  status: errors.length === 0
    ? 'BANNER_STAGE3_6_RECURRENCE_PICKUP_LOG_CONSUMER_MATERIALIZED'
    : 'BANNER_STAGE3_6_RECURRENCE_PICKUP_LOG_CONSUMER_WITH_ERRORS',
  policy: {
    historyScope: contract.historyPolicy.scope,
    chronology: contract.historyPolicy.chronology,
    firstObservedMeansFirstEver: false,
    fixedCadenceInferenceAllowed: false,
    futureRecurrencePredictionAllowed: false,
    nextExpectedDateMaterialized: false,
    durationOrTimeInferenceAllowed: false,
    stage2LifecycleRewriteAllowed: false,
    pickupHeroRelationsRecomputed: false,
    cpEventCanonicalJoinExpanded: false
  },
  definitionHistoryRecordCount: definitionHistoryRecords.length,
  occurrenceLogRecordCount: occurrenceLogRecords.length,
  recurrenceLinkCount: recurrenceLinks.length,
  definitionHistoryRecords,
  occurrenceLogRecords,
  recurrenceLinks,
  indexes: {
    repeatedDefinitionIds: repeatedDefinitionRecords.map(record => record.bannerDefinitionId),
    reobservedOccurrenceIds,
    pickupOccurrenceIds,
    repeatedPickupDefinitionIds,
    cpPickupOccurrenceIds
  },
  reviews,
  errors
};

const summary = {
  stage: '3-6',
  status: errors.length === 0
    ? 'PASS_BANNER_STAGE3_6_RECURRENCE_PICKUP_LOG_CONSUMER'
    : 'FAIL_BANNER_STAGE3_6_RECURRENCE_PICKUP_LOG_CONSUMER',
  canonicalPopulation: {
    definitions: definitionHistoryRecords.length,
    occurrences: occurrenceLogRecords.length
  },
  recurrenceHistory: {
    historyScope: contract.historyPolicy.scope,
    repeatedDefinitions: repeatedDefinitionRecords.length,
    singleObservedDefinitions: singleObservedDefinitionRecords.length,
    recurrenceLinks: recurrenceLinks.length,
    maxObservedOccurrenceCount,
    appearanceHistogram,
    reobservedOccurrences: reobservedOccurrenceIds.length,
    manualRepeatedDefinitions: manualRepeatedDefinitions.length,
    firstEverReleaseEstablished: false,
    fixedCadenceEstablished: false,
    futurePredictionsMaterialized: 0
  },
  pickupLog: {
    pickupOccurrences: pickupOccurrenceIds.length,
    repeatedPickupDefinitions: repeatedPickupDefinitionIds.length,
    pickupHeroReferencesAcrossOccurrences: pickupRows.reduce((sum, row) => sum + row.pickupHeroCount, 0),
    uniquePickupHeroes: uniq(pickupHeroIds).length,
    cpPickupOccurrences: cpPickupOccurrenceIds.length,
    cpPickupHeroReferences: cpPickupRows.reduce((sum, row) => sum + row.pickupHeroCount, 0),
    uniqueCpPickupHeroes: uniq(cpPickupHeroIds).length
  },
  semanticFreeze: {
    stage2DefinitionIdsChanged: false,
    stage2OccurrenceIdsChanged: false,
    stage2RecurrenceHistoryChanged: false,
    stage33PickupRelationsRecomputed: false,
    stage35CpRelationsExpanded: false,
    firstObservedPromotedToFirstEver: false,
    observedGapsPromotedToCadence: false,
    futureRecurrencePredicted: false,
    lifecycleRewritten: false,
    heroRoutesInvented: false
  },
  reviews,
  errors,
  nextStage: contract.nextStage
};

fs.mkdirSync(path.dirname(contract.outputs.consumer), { recursive: true });
fs.mkdirSync(path.dirname(contract.outputs.summary), { recursive: true });
fs.writeFileSync(contract.outputs.consumer, `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(contract.outputs.summary, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (errors.length > 0) process.exitCode = 1;
