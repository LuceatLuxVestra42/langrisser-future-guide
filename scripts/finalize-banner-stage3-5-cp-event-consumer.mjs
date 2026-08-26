import fs from 'node:fs';
import path from 'node:path';

const CONTRACT_PATH = 'data/contracts/banner-stage3-5-cp-event-consumer.v1.json';
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const countBy = (rows, keyFn) => {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

const contract = load(CONTRACT_PATH);
const stage33Summary = load(contract.inputs.stage33Summary);
const stage33 = load(contract.inputs.stage33BasicTable);
const source = load(contract.inputs.cpEventRelations);

const errors = [];
const reviews = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

const definitionRelations = source.definitionRelations ?? [];
const occurrenceProjections = source.occurrenceProjections ?? [];
const stage33Rows = stage33.rows ?? [];
const stage33ByOccurrenceId = new Map(stage33Rows.map(row => [row.bannerOccurrenceId, row]));

check(stage33Summary.status === 'PASS_BANNER_STAGE3_3_BASIC_TABLE_CONSUMER', `Stage 3-3 status changed: ${stage33Summary.status}`);
check(stage33Rows.length === contract.expectedCanonicalPopulation.occurrences, `Stage 3-3 row count ${stage33Rows.length}`);
check(source.definitionCount === contract.expectedCanonicalPopulation.definitions, `source definition count ${source.definitionCount}`);
check(source.cpRelatedDefinitionCount === contract.expectedCanonicalPopulation.cpRelatedDefinitions, `CP definition count ${source.cpRelatedDefinitionCount}`);
check(source.cpRelatedOccurrenceCount === contract.expectedCanonicalPopulation.cpRelatedOccurrences, `CP occurrence count ${source.cpRelatedOccurrenceCount}`);
check(source.eventTextReferenceCount === contract.expectedCanonicalPopulation.eventTextReferences, `event text reference count ${source.eventTextReferenceCount}`);
check(source.canonicalEventRelationCount === contract.expectedCanonicalPopulation.canonicalEventRelations, `canonical Event relation count ${source.canonicalEventRelationCount}`);
check(definitionRelations.length === contract.expectedCanonicalPopulation.cpRelatedDefinitions, `definition relation records ${definitionRelations.length}`);
check(occurrenceProjections.length === contract.expectedCanonicalPopulation.cpRelatedOccurrences, `occurrence projection records ${occurrenceProjections.length}`);

const definitionRecords = definitionRelations.map(relation => {
  const cp = relation.cpContext ?? {};
  const event = relation.eventTextReference ?? {};

  check(cp.relationType === contract.consumerPolicy.cpRelationType,
    `${relation.bannerDefinitionId}: CP relation type ${cp.relationType}`);
  check(event.relationType === contract.consumerPolicy.eventReferenceRelationType,
    `${relation.bannerDefinitionId}: Event reference relation type ${event.relationType}`);
  check(event.canonicalEventId === null,
    `${relation.bannerDefinitionId}: canonical Event ID must remain null`);
  check(event.joinMethod === 'NONE',
    `${relation.bannerDefinitionId}: Event join method ${event.joinMethod}`);
  check(event.resolutionStatus === 'TEXT_REFERENCE_ONLY_REVIEW',
    `${relation.bannerDefinitionId}: Event resolution status ${event.resolutionStatus}`);

  return {
    bannerDefinitionId: relation.bannerDefinitionId,
    effectiveSourceRecordKey: relation.effectiveSourceRecordKey,
    cpContext: {
      relationType: cp.relationType,
      evidenceSourceField: cp.evidenceSourceField,
      evidenceText: cp.evidenceText
    },
    eventReference: {
      relationType: event.relationType,
      labelCn: event.labelCn,
      canonicalEventId: event.canonicalEventId,
      resolutionStatus: event.resolutionStatus,
      joinMethod: event.joinMethod
    },
    canonicalEventResolved: false,
    eventNavigationAvailable: false,
    consumerStatus: 'CP_CONTEXT_READY_EVENT_REFERENCE_REVIEW'
  };
});

const definitionById = new Map(definitionRecords.map(row => [row.bannerDefinitionId, row]));
check(definitionById.size === definitionRecords.length, 'duplicate CP definition IDs');

const occurrenceRecords = occurrenceProjections.map(projection => {
  const base = stage33ByOccurrenceId.get(projection.bannerOccurrenceId);
  const definition = definitionById.get(projection.bannerDefinitionId);

  check(Boolean(base), `${projection.bannerOccurrenceId}: missing Stage 3-3 row`);
  check(Boolean(definition), `${projection.bannerOccurrenceId}: missing CP definition relation`);
  check(projection.relationType === contract.consumerPolicy.cpRelationType,
    `${projection.bannerOccurrenceId}: occurrence relation type ${projection.relationType}`);
  check(projection.derivedFromDefinitionRelation === true,
    `${projection.bannerOccurrenceId}: occurrence projection no longer derived from definition relation`);
  if (!base || !definition) return null;

  check(base.bannerDefinitionId === projection.bannerDefinitionId,
    `${projection.bannerOccurrenceId}: Stage 3-3 definition mismatch`);
  check(base.mechanicFamily === 'PICKUP',
    `${projection.bannerOccurrenceId}: CP occurrence is not PICKUP (${base.mechanicFamily})`);

  return {
    rowId: projection.bannerOccurrenceId,
    bannerOccurrenceId: projection.bannerOccurrenceId,
    bannerDefinitionId: projection.bannerDefinitionId,
    krDisplayDate: base.krDisplayDate,
    displayOrder: base.displayOrder,
    mechanicFamily: base.mechanicFamily,
    typeLabelKr: base.typeLabelKr,
    lifecycle: base.lifecycle,
    lifecycleLabelKr: base.lifecycleLabelKr,
    image: base.image,
    pickupHeroes: base.pickupHeroes,
    pickupHeroCount: base.pickupHeroCount,
    cpRelationType: projection.relationType,
    cpDefinitionReference: projection.bannerDefinitionId,
    eventReferenceLabelCn: definition.eventReference.labelCn,
    canonicalEventId: null,
    eventNavigationAvailable: false,
    consumerStatus: 'CP_CONTEXT_READY_EVENT_REFERENCE_REVIEW'
  };
}).filter(Boolean);

occurrenceRecords.sort((a, b) => a.krDisplayDate.localeCompare(b.krDisplayDate)
  || a.displayOrder - b.displayOrder
  || a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));

check(occurrenceRecords.length === contract.expectedCanonicalPopulation.cpRelatedOccurrences,
  `consumer occurrence count ${occurrenceRecords.length}`);
check(new Set(occurrenceRecords.map(row => row.bannerOccurrenceId)).size === occurrenceRecords.length,
  'duplicate CP occurrence IDs');
check(occurrenceRecords.every(row => row.canonicalEventId === null),
  'canonical Event ID was materialized in occurrence consumer');
check(occurrenceRecords.every(row => row.eventNavigationAvailable === false),
  'Event navigation was enabled without canonical Event ID');

const uniqueEventLabels = [...new Set(definitionRecords.map(row => row.eventReference.labelCn))];
const uniqueDates = [...new Set(occurrenceRecords.map(row => row.krDisplayDate))];
const uniquePickupHeroIds = [...new Set(occurrenceRecords.flatMap(row => row.pickupHeroes.map(hero => hero.heroId)))];

if (definitionRecords.some(row => row.eventReference.canonicalEventId === null)) {
  reviews.push({
    code: 'CANONICAL_EVENT_ID_UNRESOLVED',
    count: definitionRecords.filter(row => row.eventReference.canonicalEventId === null).length,
    interpretation: 'Stage 2 only proves a CP-related text reference to an Event label. Stage 3-5 exposes that reference but does not invent or infer a canonical Event ID, route, or Korean Event name.',
    eventLabelsCn: uniqueEventLabels,
    bannerDefinitionIds: definitionRecords.map(row => row.bannerDefinitionId)
  });
}

const output = {
  version: 1,
  stage: 'Banner Stage 3-5',
  status: errors.length === 0 ? 'BANNER_STAGE3_5_CP_EVENT_CONSUMER_MATERIALIZED' : 'BANNER_STAGE3_5_CP_EVENT_CONSUMER_WITH_ERRORS',
  policy: {
    definitionContextStoredOnce: true,
    occurrenceReferencesDefinitionContext: true,
    basicDisplaySource: contract.consumerPolicy.basicDisplaySource,
    pickupSummarySource: contract.consumerPolicy.pickupSummarySource,
    canonicalEventIdInvented: false,
    eventConfigJoined: false,
    eventRouteInvented: false,
    eventKoreanNameInvented: false,
    textReferenceUsedAsCanonicalIdentity: false,
    wishCandidateRelationsIncluded: false,
    recurrenceHistoryIncluded: false
  },
  definitionRecordCount: definitionRecords.length,
  occurrenceRecordCount: occurrenceRecords.length,
  definitionRecords,
  occurrenceRecords,
  reviews,
  errors
};

const summary = {
  stage: '3-5',
  status: errors.length === 0 ? 'PASS_BANNER_STAGE3_5_CP_EVENT_CONSUMER' : 'FAIL_BANNER_STAGE3_5_CP_EVENT_CONSUMER',
  canonicalPopulation: {
    definitions: source.definitionCount,
    occurrences: stage33Rows.length,
    cpRelatedDefinitions: definitionRecords.length,
    cpRelatedOccurrences: occurrenceRecords.length
  },
  cpContext: {
    relationTypeCounts: countBy(definitionRecords, row => row.cpContext.relationType),
    evidenceSourceFieldCounts: countBy(definitionRecords, row => row.cpContext.evidenceSourceField),
    occurrenceDates: uniqueDates,
    pickupHeroReferencesAcrossOccurrences: occurrenceRecords.reduce((sum, row) => sum + row.pickupHeroCount, 0),
    uniquePickupHeroesAcrossOccurrences: uniquePickupHeroIds.length
  },
  eventReference: {
    textReferenceCount: definitionRecords.length,
    uniqueLabelsCn: uniqueEventLabels,
    canonicalEventRelationCount: 0,
    resolvedCanonicalEventIds: 0,
    eventNavigationAvailableOccurrences: 0,
    resolutionStatusCounts: countBy(definitionRecords, row => row.eventReference.resolutionStatus),
    joinMethodCounts: countBy(definitionRecords, row => row.eventReference.joinMethod)
  },
  semanticFreeze: {
    stage2DefinitionIdsChanged: false,
    stage2OccurrenceIdsChanged: false,
    stage2CpRelationsChanged: false,
    stage33DisplayRecomputed: false,
    canonicalEventIdInvented: false,
    eventConfigJoined: false,
    eventRouteInvented: false,
    eventKoreanNameInvented: false,
    eventTextLabelPromotedToCanonicalIdentity: false,
    wishCandidateRelationsJoinedEarly: false,
    recurrenceHistoryJoinedEarly: false
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
