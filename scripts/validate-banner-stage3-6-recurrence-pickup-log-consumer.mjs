import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const contract = load('data/contracts/banner-stage3-6-recurrence-pickup-log-consumer.v1.json');
const output = load(contract.outputs.consumer);
const summary = load(contract.outputs.summary);
const stage33 = load(contract.inputs.stage33BasicTable);
const stage35 = load(contract.inputs.stage35CpEventConsumer);
const recurrence = load(contract.inputs.recurrenceHistory);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const uniq = values => [...new Set(values)];

assert(output.status === 'BANNER_STAGE3_6_RECURRENCE_PICKUP_LOG_CONSUMER_MATERIALIZED', `output status ${output.status}`);
assert(summary.status === 'PASS_BANNER_STAGE3_6_RECURRENCE_PICKUP_LOG_CONSUMER', `summary status ${summary.status}`);
assert(Array.isArray(output.errors) && output.errors.length === 0, 'output errors not empty');
assert(Array.isArray(summary.errors) && summary.errors.length === 0, 'summary errors not empty');
assert(output.policy.historyScope === contract.historyPolicy.scope, 'history scope changed');
assert(output.policy.firstObservedMeansFirstEver === false, 'firstObserved promoted to first-ever');
assert(output.policy.fixedCadenceInferenceAllowed === false, 'fixed cadence inference enabled');
assert(output.policy.futureRecurrencePredictionAllowed === false, 'future recurrence prediction enabled');
assert(output.policy.nextExpectedDateMaterialized === false, 'next expected date materialized');
assert(output.policy.durationOrTimeInferenceAllowed === false, 'duration/time inference enabled');
assert(output.policy.stage2LifecycleRewriteAllowed === false, 'lifecycle rewrite enabled');

const stage33Rows = stage33.rows ?? [];
const cpRows = stage35.occurrenceRecords ?? [];
const histories = recurrence.definitionHistories ?? [];
const consumerHistories = output.definitionHistoryRecords ?? [];
const occurrenceLogs = output.occurrenceLogRecords ?? [];
const links = output.recurrenceLinks ?? [];

assert(consumerHistories.length === contract.expectedCanonicalPopulation.definitions, `definition histories ${consumerHistories.length}`);
assert(occurrenceLogs.length === contract.expectedCanonicalPopulation.occurrences, `occurrence logs ${occurrenceLogs.length}`);
assert(links.length === contract.expectedCanonicalPopulation.recurrenceLinks, `recurrence links ${links.length}`);
assert(output.definitionHistoryRecordCount === consumerHistories.length, 'definitionHistoryRecordCount mismatch');
assert(output.occurrenceLogRecordCount === occurrenceLogs.length, 'occurrenceLogRecordCount mismatch');
assert(output.recurrenceLinkCount === links.length, 'recurrenceLinkCount mismatch');

const sourceHistoryById = new Map(histories.map(row => [row.bannerDefinitionId, row]));
const consumerHistoryById = new Map(consumerHistories.map(row => [row.bannerDefinitionId, row]));
const stage33ById = new Map(stage33Rows.map(row => [row.bannerOccurrenceId, row]));
const occurrenceLogById = new Map(occurrenceLogs.map(row => [row.bannerOccurrenceId, row]));
const cpById = new Map(cpRows.map(row => [row.bannerOccurrenceId, row]));

assert(sourceHistoryById.size === histories.length, 'duplicate source definition histories');
assert(consumerHistoryById.size === consumerHistories.length, 'duplicate consumer definition histories');
assert(stage33ById.size === stage33Rows.length, 'duplicate Stage 3-3 rows');
assert(occurrenceLogById.size === occurrenceLogs.length, 'duplicate occurrence-log IDs');

for (const history of histories) {
  const projected = consumerHistoryById.get(history.bannerDefinitionId);
  assert(Boolean(projected), `${history.bannerDefinitionId}: missing projected history`);
  if (!projected) continue;

  assert(projected.effectiveSourceRecordKey === history.effectiveSourceRecordKey, `${history.bannerDefinitionId}: source key changed`);
  assert(projected.sourceKind === history.sourceKind, `${history.bannerDefinitionId}: source kind changed`);
  assert(projected.historyScope === history.historyScope, `${history.bannerDefinitionId}: history scope mismatch`);
  assert(projected.historyStatus === history.historyStatus, `${history.bannerDefinitionId}: history status changed`);
  assert(projected.observedOccurrenceCount === history.observedOccurrenceCount, `${history.bannerDefinitionId}: occurrence count changed`);
  assert(projected.firstObservedOccurrenceId === history.firstObservedOccurrenceId, `${history.bannerDefinitionId}: first occurrence changed`);
  assert(projected.firstObservedKrDisplayDate === history.firstObservedKrDisplayDate, `${history.bannerDefinitionId}: first date changed`);
  assert(projected.latestObservedOccurrenceId === history.latestObservedOccurrenceId, `${history.bannerDefinitionId}: latest occurrence changed`);
  assert(projected.latestObservedKrDisplayDate === history.latestObservedKrDisplayDate, `${history.bannerDefinitionId}: latest date changed`);
  assert(JSON.stringify(projected.observedOccurrenceIds) === JSON.stringify(history.observedOccurrences.map(row => row.bannerOccurrenceId)),
    `${history.bannerDefinitionId}: observed occurrence IDs changed`);
  assert(projected.firstObservedMeansFirstEver === false, `${history.bannerDefinitionId}: first-ever inference leaked`);
  assert(projected.fixedCadenceEstablished === false, `${history.bannerDefinitionId}: cadence inference leaked`);
  assert(projected.futureRecurrencePredicted === false, `${history.bannerDefinitionId}: future prediction leaked`);
}

for (const history of histories) {
  for (const observed of history.observedOccurrences ?? []) {
    const sourceRow = stage33ById.get(observed.bannerOccurrenceId);
    const log = occurrenceLogById.get(observed.bannerOccurrenceId);
    assert(Boolean(sourceRow), `${observed.bannerOccurrenceId}: missing Stage 3-3 source row`);
    assert(Boolean(log), `${observed.bannerOccurrenceId}: missing occurrence log`);
    if (!sourceRow || !log) continue;

    assert(log.bannerDefinitionId === history.bannerDefinitionId, `${observed.bannerOccurrenceId}: definition changed`);
    assert(log.krDisplayDate === observed.krDisplayDate, `${observed.bannerOccurrenceId}: recurrence date changed`);
    assert(log.displayOrder === observed.displayOrder, `${observed.bannerOccurrenceId}: recurrence displayOrder changed`);
    assert(log.krDisplayDate === sourceRow.krDisplayDate, `${observed.bannerOccurrenceId}: Stage 3-3 date mismatch`);
    assert(log.displayOrder === sourceRow.displayOrder, `${observed.bannerOccurrenceId}: Stage 3-3 displayOrder mismatch`);
    assert(log.mechanicFamily === sourceRow.mechanicFamily, `${observed.bannerOccurrenceId}: mechanic family changed`);
    assert(log.typeLabelKr === sourceRow.typeLabelKr, `${observed.bannerOccurrenceId}: type label changed`);
    assert(log.lifecycle === sourceRow.lifecycle, `${observed.bannerOccurrenceId}: lifecycle changed`);
    assert(JSON.stringify(log.image) === JSON.stringify(sourceRow.image), `${observed.bannerOccurrenceId}: image projection changed`);

    const expectedPickupHeroes = sourceRow.mechanicFamily === 'PICKUP' ? sourceRow.pickupHeroes : [];
    assert(JSON.stringify(log.pickupHeroes) === JSON.stringify(expectedPickupHeroes), `${observed.bannerOccurrenceId}: pickup Heroes changed`);
    assert(log.pickupHeroCount === (sourceRow.mechanicFamily === 'PICKUP' ? sourceRow.pickupHeroCount : 0),
      `${observed.bannerOccurrenceId}: pickup Hero count changed`);

    assert(log.history.historyStatus === history.historyStatus, `${observed.bannerOccurrenceId}: history status mismatch`);
    assert(log.history.observedOccurrenceCount === history.observedOccurrenceCount, `${observed.bannerOccurrenceId}: history count mismatch`);
    assert(log.history.appearanceIndex === observed.appearanceIndex, `${observed.bannerOccurrenceId}: appearance index changed`);
    assert(log.history.observationRole === observed.observationRole, `${observed.bannerOccurrenceId}: observation role changed`);
    assert(log.history.previousObservedOccurrenceId === observed.previousObservedOccurrenceId, `${observed.bannerOccurrenceId}: previous occurrence changed`);
    assert(log.history.previousObservedGapDays === observed.previousObservedGapDays, `${observed.bannerOccurrenceId}: previous gap changed`);
    assert(log.history.nextObservedOccurrenceId === observed.nextObservedOccurrenceId, `${observed.bannerOccurrenceId}: next occurrence changed`);
    assert(log.history.nextObservedGapDays === observed.nextObservedGapDays, `${observed.bannerOccurrenceId}: next gap changed`);
    assert(log.history.firstObservedMeansFirstEver === false, `${observed.bannerOccurrenceId}: first-ever inference leaked`);
    assert(log.history.gapDaysEstablishFixedCadence === false, `${observed.bannerOccurrenceId}: cadence inference leaked`);
    assert(log.prediction === null, `${observed.bannerOccurrenceId}: prediction payload materialized`);

    const cp = cpById.get(observed.bannerOccurrenceId);
    if (cp) {
      assert(log.logKinds.includes('CP_PICKUP'), `${observed.bannerOccurrenceId}: CP_PICKUP index missing`);
      assert(log.cpContext?.cpRelationType === cp.cpRelationType, `${observed.bannerOccurrenceId}: CP relation changed`);
      assert(log.cpContext?.eventReferenceLabelCn === cp.eventReferenceLabelCn, `${observed.bannerOccurrenceId}: Event label changed`);
      assert(log.cpContext?.canonicalEventId === cp.canonicalEventId, `${observed.bannerOccurrenceId}: canonical Event ID changed`);
      assert(log.cpContext?.eventNavigationAvailable === cp.eventNavigationAvailable, `${observed.bannerOccurrenceId}: Event navigation changed`);
    } else {
      assert(log.cpContext === null, `${observed.bannerOccurrenceId}: unexpected CP context`);
      assert(!log.logKinds.includes('CP_PICKUP'), `${observed.bannerOccurrenceId}: unexpected CP_PICKUP index`);
    }
  }
}

const expectedLinks = [];
for (const history of histories) {
  for (const observed of history.observedOccurrences ?? []) {
    if (observed.nextObservedOccurrenceId == null) continue;
    expectedLinks.push({
      bannerDefinitionId: history.bannerDefinitionId,
      fromOccurrenceId: observed.bannerOccurrenceId,
      toOccurrenceId: observed.nextObservedOccurrenceId,
      observedGapDays: observed.nextObservedGapDays,
      interpretation: 'OBSERVED_ADJACENT_GAP_ONLY'
    });
  }
}
assert(JSON.stringify(links) === JSON.stringify(expectedLinks), 'recurrence links differ from frozen Stage 2 history');

for (let i = 1; i < occurrenceLogs.length; i += 1) {
  const a = occurrenceLogs[i - 1];
  const b = occurrenceLogs[i];
  const ok = a.krDisplayDate < b.krDisplayDate
    || (a.krDisplayDate === b.krDisplayDate && a.displayOrder < b.displayOrder)
    || (a.krDisplayDate === b.krDisplayDate && a.displayOrder === b.displayOrder
      && a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId) <= 0);
  assert(ok, `chronology violation at ${b.bannerOccurrenceId}`);
}

const repeated = consumerHistories.filter(row => row.isRepeatedInCurrentDataset);
const singles = consumerHistories.filter(row => !row.isRepeatedInCurrentDataset);
const maxObserved = Math.max(...consumerHistories.map(row => row.observedOccurrenceCount));
const appearanceHistogram = {};
for (const row of consumerHistories) {
  const key = String(row.observedOccurrenceCount);
  appearanceHistogram[key] = (appearanceHistogram[key] ?? 0) + 1;
}

assert(repeated.length === contract.expectedCanonicalPopulation.repeatedDefinitions, `repeated definitions ${repeated.length}`);
assert(singles.length === contract.expectedCanonicalPopulation.singleObservedDefinitions, `single definitions ${singles.length}`);
assert(maxObserved === contract.expectedCanonicalPopulation.maxObservedOccurrenceCount, `max observed ${maxObserved}`);
assert(appearanceHistogram['1'] === 66, `1x histogram ${appearanceHistogram['1']}`);
assert(appearanceHistogram['2'] === 8, `2x histogram ${appearanceHistogram['2']}`);
assert(appearanceHistogram['3'] === 1, `3x histogram ${appearanceHistogram['3']}`);
assert(appearanceHistogram['4'] === 1, `4x histogram ${appearanceHistogram['4']}`);
assert(appearanceHistogram['5'] === 1, `5x histogram ${appearanceHistogram['5']}`);
assert(repeated.filter(row => row.sourceKind === 'MANUAL_OCCURRENCE_SCOPED').length === 0, 'manual source-null definition repeated');

const pickupLogs = occurrenceLogs.filter(row => row.logKinds.includes('PICKUP'));
const cpPickupLogs = occurrenceLogs.filter(row => row.logKinds.includes('CP_PICKUP'));
assert(pickupLogs.length === contract.expectedCanonicalPopulation.pickupOccurrences, `pickup logs ${pickupLogs.length}`);
assert(cpPickupLogs.length === contract.expectedCanonicalPopulation.cpPickupOccurrences, `CP pickup logs ${cpPickupLogs.length}`);
assert(JSON.stringify(output.indexes.pickupOccurrenceIds) === JSON.stringify(pickupLogs.map(row => row.bannerOccurrenceId)), 'pickup index mismatch');
assert(JSON.stringify(output.indexes.cpPickupOccurrenceIds) === JSON.stringify(cpPickupLogs.map(row => row.bannerOccurrenceId)), 'CP pickup index mismatch');
assert(JSON.stringify(output.indexes.repeatedDefinitionIds) === JSON.stringify(repeated.map(row => row.bannerDefinitionId)), 'repeated-definition index mismatch');

const corrected7001History = histories.find(row => row.effectiveSourceRecordKey === 'cardpool:265');
assert(Boolean(corrected7001History), 'cardpool:265 corrected canonical history missing');
if (corrected7001History) {
  const projected = consumerHistoryById.get(corrected7001History.bannerDefinitionId);
  assert(projected?.observedOccurrenceCount === corrected7001History.observedOccurrenceCount, 'cardpool:265 history count changed');
  assert(JSON.stringify(projected?.observedOccurrenceIds) === JSON.stringify(corrected7001History.observedOccurrences.map(row => row.bannerOccurrenceId)),
    'cardpool:265 corrected occurrence history changed');
}

assert(summary.recurrenceHistory.repeatedDefinitions === repeated.length, 'summary repeated-definition count mismatch');
assert(summary.recurrenceHistory.singleObservedDefinitions === singles.length, 'summary single-definition count mismatch');
assert(summary.recurrenceHistory.recurrenceLinks === links.length, 'summary recurrence-link count mismatch');
assert(summary.recurrenceHistory.manualRepeatedDefinitions === 0, 'summary manual repeated definitions not zero');
assert(summary.recurrenceHistory.firstEverReleaseEstablished === false, 'summary first-ever release inference');
assert(summary.recurrenceHistory.fixedCadenceEstablished === false, 'summary fixed cadence inference');
assert(summary.recurrenceHistory.futurePredictionsMaterialized === 0, 'summary future predictions materialized');
assert(summary.semanticFreeze.futureRecurrencePredicted === false, 'semantic freeze future prediction');
assert(summary.semanticFreeze.lifecycleRewritten === false, 'semantic freeze lifecycle rewrite');

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL_BANNER_STAGE3_6_RECURRENCE_PICKUP_LOG_VALIDATION', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS_BANNER_STAGE3_6_RECURRENCE_PICKUP_LOG_VALIDATION',
  definitions: consumerHistories.length,
  occurrences: occurrenceLogs.length,
  repeatedDefinitions: repeated.length,
  recurrenceLinks: links.length,
  pickupOccurrences: pickupLogs.length,
  cpPickupOccurrences: cpPickupLogs.length,
  reobservedOccurrences: output.indexes.reobservedOccurrenceIds.length
}, null, 2));
