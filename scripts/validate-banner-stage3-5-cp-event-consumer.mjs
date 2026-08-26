import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const contract = load('data/contracts/banner-stage3-5-cp-event-consumer.v1.json');
const output = load(contract.outputs.consumer);
const summary = load(contract.outputs.summary);
const stage33 = load(contract.inputs.stage33BasicTable);
const source = load(contract.inputs.cpEventRelations);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(output.status === 'BANNER_STAGE3_5_CP_EVENT_CONSUMER_MATERIALIZED', `output status ${output.status}`);
assert(summary.status === 'PASS_BANNER_STAGE3_5_CP_EVENT_CONSUMER', `summary status ${summary.status}`);
assert(Array.isArray(output.definitionRecords) && output.definitionRecords.length === contract.expectedCanonicalPopulation.cpRelatedDefinitions,
  `definition record count ${output.definitionRecords?.length}`);
assert(Array.isArray(output.occurrenceRecords) && output.occurrenceRecords.length === contract.expectedCanonicalPopulation.cpRelatedOccurrences,
  `occurrence record count ${output.occurrenceRecords?.length}`);
assert(Array.isArray(output.errors) && output.errors.length === 0, 'output errors not empty');
assert(Array.isArray(summary.errors) && summary.errors.length === 0, 'summary errors not empty');

const sourceDefinitions = new Map((source.definitionRelations ?? []).map(row => [row.bannerDefinitionId, row]));
const sourceOccurrences = new Map((source.occurrenceProjections ?? []).map(row => [row.bannerOccurrenceId, row]));
const stage33Rows = new Map((stage33.rows ?? []).map(row => [row.bannerOccurrenceId, row]));
const outputDefinitions = new Map(output.definitionRecords.map(row => [row.bannerDefinitionId, row]));

assert(sourceDefinitions.size === contract.expectedCanonicalPopulation.cpRelatedDefinitions, 'source CP definition count changed');
assert(sourceOccurrences.size === contract.expectedCanonicalPopulation.cpRelatedOccurrences, 'source CP occurrence count changed');
assert(outputDefinitions.size === output.definitionRecords.length, 'duplicate output CP definition IDs');
assert(new Set(output.occurrenceRecords.map(row => row.bannerOccurrenceId)).size === output.occurrenceRecords.length,
  'duplicate output CP occurrence IDs');

for (const row of output.definitionRecords) {
  const sourceRow = sourceDefinitions.get(row.bannerDefinitionId);
  assert(Boolean(sourceRow), `${row.bannerDefinitionId}: unknown CP definition`);
  if (!sourceRow) continue;

  assert(row.effectiveSourceRecordKey === sourceRow.effectiveSourceRecordKey,
    `${row.bannerDefinitionId}: effective source key changed`);
  assert(JSON.stringify(row.cpContext) === JSON.stringify(sourceRow.cpContext),
    `${row.bannerDefinitionId}: CP context changed`);
  assert(row.eventReference.relationType === sourceRow.eventTextReference.relationType,
    `${row.bannerDefinitionId}: Event relation type changed`);
  assert(row.eventReference.labelCn === sourceRow.eventTextReference.labelCn,
    `${row.bannerDefinitionId}: Event label changed`);
  assert(row.eventReference.canonicalEventId === null,
    `${row.bannerDefinitionId}: canonical Event ID invented`);
  assert(row.eventReference.resolutionStatus === 'TEXT_REFERENCE_ONLY_REVIEW',
    `${row.bannerDefinitionId}: resolution status changed`);
  assert(row.eventReference.joinMethod === 'NONE',
    `${row.bannerDefinitionId}: Event join invented`);
  assert(row.canonicalEventResolved === false,
    `${row.bannerDefinitionId}: canonical Event marked resolved`);
  assert(row.eventNavigationAvailable === false,
    `${row.bannerDefinitionId}: Event navigation enabled`);
}

for (const row of output.occurrenceRecords) {
  const sourceProjection = sourceOccurrences.get(row.bannerOccurrenceId);
  const base = stage33Rows.get(row.bannerOccurrenceId);
  const definition = outputDefinitions.get(row.bannerDefinitionId);

  assert(Boolean(sourceProjection), `${row.bannerOccurrenceId}: unknown CP occurrence projection`);
  assert(Boolean(base), `${row.bannerOccurrenceId}: missing Stage 3-3 row`);
  assert(Boolean(definition), `${row.bannerOccurrenceId}: missing output definition context`);
  if (!sourceProjection || !base || !definition) continue;

  assert(row.rowId === row.bannerOccurrenceId, `${row.bannerOccurrenceId}: row identity changed`);
  assert(row.bannerDefinitionId === sourceProjection.bannerDefinitionId,
    `${row.bannerOccurrenceId}: source definition mismatch`);
  assert(row.bannerDefinitionId === base.bannerDefinitionId,
    `${row.bannerOccurrenceId}: Stage 3-3 definition mismatch`);
  assert(row.krDisplayDate === base.krDisplayDate, `${row.bannerOccurrenceId}: date changed`);
  assert(row.displayOrder === base.displayOrder, `${row.bannerOccurrenceId}: displayOrder changed`);
  assert(row.mechanicFamily === base.mechanicFamily && row.mechanicFamily === 'PICKUP',
    `${row.bannerOccurrenceId}: mechanic family changed`);
  assert(row.typeLabelKr === base.typeLabelKr, `${row.bannerOccurrenceId}: type label changed`);
  assert(row.lifecycle === base.lifecycle, `${row.bannerOccurrenceId}: lifecycle changed`);
  assert(row.lifecycleLabelKr === base.lifecycleLabelKr, `${row.bannerOccurrenceId}: lifecycle label changed`);
  assert(JSON.stringify(row.image) === JSON.stringify(base.image), `${row.bannerOccurrenceId}: image projection changed`);
  assert(JSON.stringify(row.pickupHeroes) === JSON.stringify(base.pickupHeroes), `${row.bannerOccurrenceId}: pickup Hero projection changed`);
  assert(row.pickupHeroCount === base.pickupHeroCount, `${row.bannerOccurrenceId}: pickup Hero count changed`);
  assert(row.cpRelationType === 'CP_RELATED', `${row.bannerOccurrenceId}: CP relation type changed`);
  assert(row.eventReferenceLabelCn === definition.eventReference.labelCn,
    `${row.bannerOccurrenceId}: Event label projection mismatch`);
  assert(row.canonicalEventId === null, `${row.bannerOccurrenceId}: canonical Event ID invented`);
  assert(row.eventNavigationAvailable === false, `${row.bannerOccurrenceId}: Event navigation enabled`);
}

assert(source.canonicalEventRelationCount === 0, `source canonical Event relation count ${source.canonicalEventRelationCount}`);
assert(summary.eventReference.canonicalEventRelationCount === 0, 'summary canonical Event relation count changed');
assert(summary.eventReference.resolvedCanonicalEventIds === 0, 'resolved canonical Event IDs must be zero');
assert(summary.eventReference.eventNavigationAvailableOccurrences === 0, 'Event navigation must remain unavailable');
assert(output.policy.canonicalEventIdInvented === false, 'canonical Event ID inference enabled');
assert(output.policy.eventConfigJoined === false, 'Event ConfigData joined');
assert(output.policy.eventRouteInvented === false, 'Event route invented');
assert(output.policy.eventKoreanNameInvented === false, 'Event Korean name invented');
assert(output.policy.textReferenceUsedAsCanonicalIdentity === false, 'text label promoted to canonical identity');
assert(output.policy.wishCandidateRelationsIncluded === false, 'Wish candidates joined early');
assert(output.policy.recurrenceHistoryIncluded === false, 'recurrence history joined early');

const outputOccurrenceIds = new Set(output.occurrenceRecords.map(row => row.bannerOccurrenceId));
for (const sourceOccurrenceId of sourceOccurrences.keys()) {
  assert(outputOccurrenceIds.has(sourceOccurrenceId), `${sourceOccurrenceId}: missing from CP consumer`);
}
for (const outputOccurrenceId of outputOccurrenceIds) {
  assert(sourceOccurrences.has(outputOccurrenceId), `${outputOccurrenceId}: non-CP occurrence leaked into consumer`);
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL_BANNER_STAGE3_5_CP_EVENT_VALIDATION', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS_BANNER_STAGE3_5_CP_EVENT_VALIDATION',
  definitions: output.definitionRecords.length,
  occurrences: output.occurrenceRecords.length,
  eventTextReferences: summary.eventReference.textReferenceCount,
  canonicalEventRelations: summary.eventReference.canonicalEventRelationCount,
  eventNavigationAvailableOccurrences: summary.eventReference.eventNavigationAvailableOccurrences,
  reviewCount: output.reviews?.length ?? 0
}, null, 2));
