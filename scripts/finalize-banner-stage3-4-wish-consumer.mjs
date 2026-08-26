import fs from 'node:fs';
import path from 'node:path';

const CONTRACT_PATH = 'data/contracts/banner-stage3-4-wish-consumer.v1.json';
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const uniq = values => [...new Set(values)];
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
const stage33Consumer = load(contract.inputs.stage33Consumer);
const definitionTaxonomyData = load(contract.inputs.definitionTaxonomy);
const heroRelationsData = load(contract.inputs.heroRelations);

const taxonomy = definitionTaxonomyData.records ?? [];
const stage33Rows = stage33Consumer.rows ?? [];
const definitionResults = heroRelationsData.definitionResults ?? [];
const heroEdges = heroRelationsData.edges ?? [];

const errors = [];
const reviews = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

check(stage33Summary.status === 'PASS_BANNER_STAGE3_3_BASIC_TABLE_CONSUMER', `Stage 3-3 summary status changed: ${stage33Summary.status}`);
check(stage33Consumer.status === 'BANNER_STAGE3_3_BASIC_TABLE_CONSUMER_MATERIALIZED', `Stage 3-3 consumer status changed: ${stage33Consumer.status}`);
check(taxonomy.length === contract.expectedCanonicalPopulation.definitions, `definition taxonomy count ${taxonomy.length}`);
check(stage33Rows.length === contract.expectedCanonicalPopulation.occurrences, `Stage 3-3 row count ${stage33Rows.length}`);
check(heroRelationsData.edgeCount === heroEdges.length, `Hero edge count header ${heroRelationsData.edgeCount} != ${heroEdges.length}`);
check(heroRelationsData.wishCandidateHeroEdgeCount === contract.expectedCanonicalPopulation.wishCandidateHeroEdges,
  `WISH candidate edge header ${heroRelationsData.wishCandidateHeroEdgeCount}`);

const wishTaxonomy = taxonomy.filter(row => row.mechanicFamily === 'WISH');
const wishDefinitionIds = new Set(wishTaxonomy.map(row => row.bannerDefinitionId));
const wishRows = stage33Rows.filter(row => row.mechanicFamily === 'WISH');
const relationResultByDefinition = new Map(definitionResults.map(row => [row.bannerDefinitionId, row]));
const candidateEdges = heroEdges.filter(edge => edge.relationType === contract.consumerPolicy.candidateRelationType);

check(wishTaxonomy.length === contract.expectedCanonicalPopulation.wishDefinitions, `WISH definition count ${wishTaxonomy.length}`);
check(wishDefinitionIds.size === wishTaxonomy.length, 'duplicate WISH definition taxonomy IDs');
check(wishRows.length === contract.expectedCanonicalPopulation.wishOccurrences, `WISH occurrence row count ${wishRows.length}`);
check(new Set(wishRows.map(row => row.bannerOccurrenceId)).size === wishRows.length, 'duplicate WISH occurrence IDs in Stage 3-3');
check(candidateEdges.length === contract.expectedCanonicalPopulation.wishCandidateHeroEdges, `WISH candidate edge count ${candidateEdges.length}`);
check(candidateEdges.every(edge => wishDefinitionIds.has(edge.bannerDefinitionId)), 'WISH candidate edge points to non-WISH definition');
check(candidateEdges.every(edge => edge.sourceField === contract.consumerPolicy.candidateSourceField), 'unexpected WISH candidate sourceField');
check(candidateEdges.every(edge => Number.isInteger(edge.sourceIndex) && edge.sourceIndex >= 0), 'WISH candidate sourceIndex is not a non-negative integer');
check(candidateEdges.every(edge => Number.isInteger(edge.heroId)), 'WISH candidate heroId is not an integer');
check(candidateEdges.every(edge => edge.heroStatus === 'verified'), 'WISH candidate Hero relation contains non-verified Hero status');

const edgesByDefinition = new Map();
for (const edge of candidateEdges) {
  if (!edgesByDefinition.has(edge.bannerDefinitionId)) edgesByDefinition.set(edge.bannerDefinitionId, []);
  edgesByDefinition.get(edge.bannerDefinitionId).push(edge);
}
for (const edges of edgesByDefinition.values()) {
  edges.sort((a, b) => a.sourceIndex - b.sourceIndex || a.heroId - b.heroId);
}

const taxonomyByDefinition = new Map(wishTaxonomy.map(row => [row.bannerDefinitionId, row]));
const definitionCandidateSets = [];
for (const taxonomyRow of wishTaxonomy) {
  const relationResult = relationResultByDefinition.get(taxonomyRow.bannerDefinitionId);
  const edges = edgesByDefinition.get(taxonomyRow.bannerDefinitionId) ?? [];
  check(Boolean(relationResult), `${taxonomyRow.bannerDefinitionId}: missing Stage 2 Hero relation result`);
  if (!relationResult) continue;

  const sourceNullManual = taxonomyRow.taxonomyBasis === 'SOURCE_NULL_MANUAL_WISH';
  const hasCandidates = edges.length > 0;
  const candidateState = hasCandidates ? 'VERIFIED_EXPLICIT_CANDIDATES' : 'NO_EXPLICIT_ID_SOURCE_REVIEW';

  if (sourceNullManual) {
    check(relationResult.effectiveSourceRecordKey === null,
      `${taxonomyRow.bannerDefinitionId}: manual WISH unexpectedly has effective source key`);
    check(relationResult.relationHandlingStatus === contract.consumerPolicy.manualSourceNullState,
      `${taxonomyRow.bannerDefinitionId}: manual WISH relation status ${relationResult.relationHandlingStatus}`);
    check(edges.length === 0, `${taxonomyRow.bannerDefinitionId}: synthetic candidate edges emitted for source-null manual WISH`);
  } else {
    check(relationResult.effectiveSourceRecordKey !== null,
      `${taxonomyRow.bannerDefinitionId}: source-linked WISH missing effective source key`);
    check(relationResult.relationHandlingStatus === 'EXPLICIT_ID_RELATIONS_MATERIALIZED',
      `${taxonomyRow.bannerDefinitionId}: source-linked WISH relation status ${relationResult.relationHandlingStatus}`);
    check(edges.length > 0, `${taxonomyRow.bannerDefinitionId}: source-linked WISH has zero candidate edges`);
  }

  const sourceIndexValues = edges.map(edge => edge.sourceIndex);
  check(new Set(sourceIndexValues).size === sourceIndexValues.length,
    `${taxonomyRow.bannerDefinitionId}: duplicate candidate sourceIndex`);

  definitionCandidateSets.push({
    bannerDefinitionId: taxonomyRow.bannerDefinitionId,
    mechanicFamily: 'WISH',
    taxonomyBasis: taxonomyRow.taxonomyBasis,
    effectiveSourceRecordKey: relationResult.effectiveSourceRecordKey,
    relationHandlingStatus: relationResult.relationHandlingStatus,
    candidateState,
    candidateCount: edges.length,
    sourceFields: uniq(edges.map(edge => edge.sourceField)),
    candidates: edges.map(edge => ({
      heroId: edge.heroId,
      heroNameKr: edge.heroNameKr,
      sourceIndex: edge.sourceIndex,
      sourceField: edge.sourceField,
      sourceRecordKey: edge.sourceRecordKey,
      heroStatus: edge.heroStatus
    }))
  });
}

definitionCandidateSets.sort((a, b) => a.bannerDefinitionId.localeCompare(b.bannerDefinitionId));
const candidateSetByDefinition = new Map(definitionCandidateSets.map(row => [row.bannerDefinitionId, row]));
check(candidateSetByDefinition.size === definitionCandidateSets.length, 'duplicate definition candidate sets');
check(definitionCandidateSets.length === wishTaxonomy.length, `definition candidate set count ${definitionCandidateSets.length}`);

const sourceLinkedCandidateSets = definitionCandidateSets.filter(row => row.effectiveSourceRecordKey !== null);
const manualSourceNullCandidateSets = definitionCandidateSets.filter(row => row.effectiveSourceRecordKey === null);
check(sourceLinkedCandidateSets.length === contract.expectedCanonicalPopulation.sourceLinkedWishDefinitions,
  `source-linked WISH definitions ${sourceLinkedCandidateSets.length}`);
check(manualSourceNullCandidateSets.length === contract.expectedCanonicalPopulation.manualSourceNullWishDefinitions,
  `manual source-null WISH definitions ${manualSourceNullCandidateSets.length}`);
check(sourceLinkedCandidateSets.every(row => row.candidateCount > 0), 'source-linked WISH candidate set with zero candidates');
check(manualSourceNullCandidateSets.every(row => row.candidateCount === 0), 'manual source-null WISH candidate set received candidates');

const occurrenceWishRecords = wishRows.map(row => {
  const candidateSet = candidateSetByDefinition.get(row.bannerDefinitionId);
  check(Boolean(candidateSet), `${row.bannerOccurrenceId}: missing WISH candidate set`);
  const candidateState = candidateSet?.candidateState ?? 'MISSING_CANDIDATE_SET';
  const candidateCount = candidateSet?.candidateCount ?? 0;
  let consumerStatus = 'READY';
  if (candidateCount === 0 && !row.image?.canRenderImage) consumerStatus = 'REVIEW_CANDIDATES_AND_IMAGE';
  else if (candidateCount === 0) consumerStatus = 'REVIEW_CANDIDATES';
  else if (!row.image?.canRenderImage) consumerStatus = 'IMAGE_PLACEHOLDER';

  return {
    bannerOccurrenceId: row.bannerOccurrenceId,
    bannerDefinitionId: row.bannerDefinitionId,
    krDisplayDate: row.krDisplayDate,
    displayOrder: row.displayOrder,
    lifecycle: row.lifecycle,
    lifecycleLabelKr: row.lifecycleLabelKr,
    provenanceTags: row.provenanceTags ?? [],
    validationTags: row.validationTags ?? [],
    image: row.image,
    candidateDefinitionRef: row.bannerDefinitionId,
    candidateState,
    candidateCount,
    candidatePayloadInline: false,
    consumerStatus
  };
});

occurrenceWishRecords.sort((a, b) => a.krDisplayDate.localeCompare(b.krDisplayDate)
  || a.displayOrder - b.displayOrder
  || a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));

check(occurrenceWishRecords.length === wishRows.length, `WISH occurrence projection count ${occurrenceWishRecords.length}`);
check(new Set(occurrenceWishRecords.map(row => row.bannerOccurrenceId)).size === occurrenceWishRecords.length,
  'duplicate WISH occurrence projection IDs');
check(occurrenceWishRecords.every(row => row.candidatePayloadInline === false), 'candidate payload duplicated inline on occurrence');
check(occurrenceWishRecords.every(row => wishDefinitionIds.has(row.bannerDefinitionId)), 'non-WISH occurrence leaked into WISH consumer');

const candidateCountTotal = definitionCandidateSets.reduce((sum, row) => sum + row.candidateCount, 0);
check(candidateCountTotal === candidateEdges.length, `definition candidate total ${candidateCountTotal}`);

const manualReviewDefinitions = manualSourceNullCandidateSets.map(row => ({
  bannerDefinitionId: row.bannerDefinitionId,
  candidateState: row.candidateState,
  taxonomyBasis: row.taxonomyBasis,
  disposition: 'PRESERVE_NO_EXPLICIT_ID_SOURCE_DO_NOT_SYNTHESIZE'
}));
if (manualReviewDefinitions.length > 0) {
  reviews.push({
    code: 'MANUAL_WISH_NO_EXPLICIT_ID_SOURCE',
    count: manualReviewDefinitions.length,
    interpretation: 'These source-null manual Wish definitions have no frozen explicit Hero-ID source. Stage 3-4 must not parse text or invent selectable candidates.',
    definitions: manualReviewDefinitions
  });
}

const candidateHeroIds = candidateEdges.map(edge => edge.heroId);
const candidateCountsPositive = sourceLinkedCandidateSets.map(row => row.candidateCount);
const occurrenceStatusCounts = countBy(occurrenceWishRecords, row => row.consumerStatus);

const output = {
  version: 1,
  stage: 'Banner Stage 3-4',
  status: errors.length === 0 ? 'BANNER_STAGE3_4_WISH_CONSUMER_MATERIALIZED' : 'BANNER_STAGE3_4_WISH_CONSUMER_WITH_ERRORS',
  policy: {
    definitionCandidateSetIdentity: contract.consumerPolicy.definitionCandidateSetIdentity,
    occurrenceIdentity: contract.consumerPolicy.occurrenceIdentity,
    candidateRelationType: contract.consumerPolicy.candidateRelationType,
    candidateListsStoredOncePerDefinition: true,
    occurrenceCandidateArraysDuplicated: false,
    manualSourceNullCandidatesSynthesized: false,
    pickupHeroRelationsIncluded: false,
    heroRoutesInvented: false,
    candidateGroupsInvented: false,
    selectableTextParsedIntoCandidates: false,
    cpEventRelationsIncluded: false,
    recurrenceHistoryIncluded: false
  },
  definitionCandidateSetCount: definitionCandidateSets.length,
  occurrenceWishRecordCount: occurrenceWishRecords.length,
  candidateEdgeCount: candidateCountTotal,
  definitionCandidateSets,
  occurrenceWishRecords,
  reviews,
  errors
};

const summary = {
  stage: '3-4',
  status: errors.length === 0 ? 'PASS_BANNER_STAGE3_4_WISH_CONSUMER' : 'FAIL_BANNER_STAGE3_4_WISH_CONSUMER',
  canonicalPopulation: {
    definitions: taxonomy.length,
    occurrences: stage33Rows.length,
    wishDefinitions: wishTaxonomy.length,
    wishOccurrences: wishRows.length
  },
  candidateSets: {
    sourceLinkedDefinitions: sourceLinkedCandidateSets.length,
    manualSourceNullDefinitions: manualSourceNullCandidateSets.length,
    definitionsWithCandidates: definitionCandidateSets.filter(row => row.candidateCount > 0).length,
    definitionsWithoutExplicitCandidates: definitionCandidateSets.filter(row => row.candidateCount === 0).length,
    candidateEdges: candidateCountTotal,
    uniqueCandidateHeroes: new Set(candidateHeroIds).size,
    minCandidatesOnSourceLinkedDefinition: candidateCountsPositive.length ? Math.min(...candidateCountsPositive) : 0,
    maxCandidatesOnSourceLinkedDefinition: candidateCountsPositive.length ? Math.max(...candidateCountsPositive) : 0,
    sourceFieldCounts: countBy(candidateEdges, edge => edge.sourceField)
  },
  occurrenceProjection: {
    records: occurrenceWishRecords.length,
    occurrenceCandidateArraysDuplicated: false,
    consumerStatusCounts: occurrenceStatusCounts,
    candidateReadyOccurrences: occurrenceWishRecords.filter(row => row.candidateCount > 0).length,
    candidateReviewOccurrences: occurrenceWishRecords.filter(row => row.candidateCount === 0).length,
    imagePlaceholderOccurrences: occurrenceWishRecords.filter(row => !row.image?.canRenderImage).length
  },
  semanticFreeze: {
    stage2DefinitionIdsChanged: false,
    stage2OccurrenceIdsChanged: false,
    stage2WishCandidateRelationsChanged: false,
    manualCandidatesSynthesized: false,
    selectableTextParsedIntoCandidates: false,
    pickupRelationsJoined: false,
    heroRoutesInvented: false,
    candidateGroupsInvented: false,
    cpEventRelationsJoinedEarly: false,
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
