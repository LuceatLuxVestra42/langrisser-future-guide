import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const contract = load('data/contracts/banner-stage3-4-wish-consumer.v1.json');
const output = load(contract.outputs.consumer);
const summary = load(contract.outputs.summary);
const stage33 = load(contract.inputs.stage33Consumer);
const taxonomy = load(contract.inputs.definitionTaxonomy).records ?? [];
const heroRelations = load(contract.inputs.heroRelations);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(output.status === 'BANNER_STAGE3_4_WISH_CONSUMER_MATERIALIZED', `output status ${output.status}`);
assert(summary.status === 'PASS_BANNER_STAGE3_4_WISH_CONSUMER', `summary status ${summary.status}`);
assert(Array.isArray(output.errors) && output.errors.length === 0, 'output errors not empty');
assert(Array.isArray(summary.errors) && summary.errors.length === 0, 'summary errors not empty');

const wishTaxonomy = taxonomy.filter(row => row.mechanicFamily === 'WISH');
const wishDefinitionIds = new Set(wishTaxonomy.map(row => row.bannerDefinitionId));
const wishRows = (stage33.rows ?? []).filter(row => row.mechanicFamily === 'WISH');
const relationResults = new Map((heroRelations.definitionResults ?? []).map(row => [row.bannerDefinitionId, row]));
const sourceEdges = (heroRelations.edges ?? []).filter(edge => edge.relationType === contract.consumerPolicy.candidateRelationType);
const sourceEdgesByDefinition = new Map();
for (const edge of sourceEdges) {
  if (!sourceEdgesByDefinition.has(edge.bannerDefinitionId)) sourceEdgesByDefinition.set(edge.bannerDefinitionId, []);
  sourceEdgesByDefinition.get(edge.bannerDefinitionId).push(edge);
}
for (const edges of sourceEdgesByDefinition.values()) {
  edges.sort((a, b) => a.sourceIndex - b.sourceIndex || a.heroId - b.heroId);
}

assert(wishTaxonomy.length === contract.expectedCanonicalPopulation.wishDefinitions, `WISH definitions ${wishTaxonomy.length}`);
assert(wishRows.length === contract.expectedCanonicalPopulation.wishOccurrences, `WISH occurrences ${wishRows.length}`);
assert(sourceEdges.length === contract.expectedCanonicalPopulation.wishCandidateHeroEdges, `WISH candidate source edges ${sourceEdges.length}`);
assert(output.definitionCandidateSetCount === contract.expectedCanonicalPopulation.wishDefinitions,
  `definition candidate sets ${output.definitionCandidateSetCount}`);
assert(output.occurrenceWishRecordCount === contract.expectedCanonicalPopulation.wishOccurrences,
  `occurrence WISH records ${output.occurrenceWishRecordCount}`);
assert(output.candidateEdgeCount === contract.expectedCanonicalPopulation.wishCandidateHeroEdges,
  `consumer candidate edges ${output.candidateEdgeCount}`);
assert(Array.isArray(output.definitionCandidateSets), 'definitionCandidateSets missing');
assert(Array.isArray(output.occurrenceWishRecords), 'occurrenceWishRecords missing');
assert(new Set(output.definitionCandidateSets.map(row => row.bannerDefinitionId)).size === output.definitionCandidateSets.length,
  'duplicate definition candidate sets');
assert(new Set(output.occurrenceWishRecords.map(row => row.bannerOccurrenceId)).size === output.occurrenceWishRecords.length,
  'duplicate WISH occurrence records');

const taxonomyByDefinition = new Map(wishTaxonomy.map(row => [row.bannerDefinitionId, row]));
const candidateSetByDefinition = new Map(output.definitionCandidateSets.map(row => [row.bannerDefinitionId, row]));
for (const set of output.definitionCandidateSets) {
  const tax = taxonomyByDefinition.get(set.bannerDefinitionId);
  const relationResult = relationResults.get(set.bannerDefinitionId);
  const expectedEdges = sourceEdgesByDefinition.get(set.bannerDefinitionId) ?? [];
  assert(Boolean(tax), `${set.bannerDefinitionId}: non-WISH definition candidate set`);
  assert(Boolean(relationResult), `${set.bannerDefinitionId}: missing source relation result`);
  if (!tax || !relationResult) continue;

  assert(set.mechanicFamily === 'WISH', `${set.bannerDefinitionId}: mechanic family changed`);
  assert(set.taxonomyBasis === tax.taxonomyBasis, `${set.bannerDefinitionId}: taxonomy basis changed`);
  assert(set.effectiveSourceRecordKey === relationResult.effectiveSourceRecordKey,
    `${set.bannerDefinitionId}: effective source key changed`);
  assert(set.relationHandlingStatus === relationResult.relationHandlingStatus,
    `${set.bannerDefinitionId}: relation handling status changed`);
  assert(set.candidateCount === expectedEdges.length, `${set.bannerDefinitionId}: candidate count mismatch`);
  assert(Array.isArray(set.candidates) && set.candidates.length === expectedEdges.length,
    `${set.bannerDefinitionId}: candidate payload length mismatch`);

  const expectedCandidates = expectedEdges.map(edge => ({
    heroId: edge.heroId,
    heroNameKr: edge.heroNameKr,
    sourceIndex: edge.sourceIndex,
    sourceField: edge.sourceField,
    sourceRecordKey: edge.sourceRecordKey,
    heroStatus: edge.heroStatus
  }));
  assert(JSON.stringify(set.candidates) === JSON.stringify(expectedCandidates),
    `${set.bannerDefinitionId}: candidate projection changed from frozen Stage 2 edges`);

  const sourceNullManual = tax.taxonomyBasis === 'SOURCE_NULL_MANUAL_WISH';
  if (sourceNullManual) {
    assert(set.effectiveSourceRecordKey === null, `${set.bannerDefinitionId}: manual WISH source key invented`);
    assert(set.candidateCount === 0, `${set.bannerDefinitionId}: manual WISH candidates synthesized`);
    assert(set.candidateState === 'NO_EXPLICIT_ID_SOURCE_REVIEW', `${set.bannerDefinitionId}: manual WISH state ${set.candidateState}`);
  } else {
    assert(set.effectiveSourceRecordKey !== null, `${set.bannerDefinitionId}: source-linked WISH source key missing`);
    assert(set.candidateCount > 0, `${set.bannerDefinitionId}: source-linked WISH candidate list empty`);
    assert(set.candidateState === 'VERIFIED_EXPLICIT_CANDIDATES', `${set.bannerDefinitionId}: source-linked state ${set.candidateState}`);
  }

  const indexes = set.candidates.map(candidate => candidate.sourceIndex);
  assert(new Set(indexes).size === indexes.length, `${set.bannerDefinitionId}: duplicate candidate sourceIndex`);
  for (let i = 1; i < set.candidates.length; i += 1) {
    const a = set.candidates[i - 1];
    const b = set.candidates[i];
    assert(a.sourceIndex < b.sourceIndex || (a.sourceIndex === b.sourceIndex && a.heroId <= b.heroId),
      `${set.bannerDefinitionId}: candidate sort order violation`);
  }
}

const sourceLinkedSets = output.definitionCandidateSets.filter(row => row.effectiveSourceRecordKey !== null);
const manualSets = output.definitionCandidateSets.filter(row => row.effectiveSourceRecordKey === null);
assert(sourceLinkedSets.length === contract.expectedCanonicalPopulation.sourceLinkedWishDefinitions,
  `source-linked WISH definitions ${sourceLinkedSets.length}`);
assert(manualSets.length === contract.expectedCanonicalPopulation.manualSourceNullWishDefinitions,
  `manual source-null WISH definitions ${manualSets.length}`);
assert(manualSets.every(row => row.candidateCount === 0), 'manual WISH definition received candidate payload');
assert(sourceLinkedSets.every(row => row.candidateCount > 0), 'source-linked WISH definition missing candidate payload');
assert(output.definitionCandidateSets.reduce((sum, row) => sum + row.candidateCount, 0) === sourceEdges.length,
  'candidate edge coverage mismatch');

const wishRowByOccurrence = new Map(wishRows.map(row => [row.bannerOccurrenceId, row]));
for (const row of output.occurrenceWishRecords) {
  const source = wishRowByOccurrence.get(row.bannerOccurrenceId);
  const set = candidateSetByDefinition.get(row.bannerDefinitionId);
  assert(Boolean(source), `${row.bannerOccurrenceId}: non-WISH Stage 3-3 row projected`);
  assert(Boolean(set), `${row.bannerOccurrenceId}: missing definition candidate set`);
  if (!source || !set) continue;
  assert(row.bannerDefinitionId === source.bannerDefinitionId, `${row.bannerOccurrenceId}: definition changed`);
  assert(row.krDisplayDate === source.krDisplayDate, `${row.bannerOccurrenceId}: date changed`);
  assert(row.displayOrder === source.displayOrder, `${row.bannerOccurrenceId}: displayOrder changed`);
  assert(row.lifecycle === source.lifecycle, `${row.bannerOccurrenceId}: lifecycle changed`);
  assert(row.lifecycleLabelKr === source.lifecycleLabelKr, `${row.bannerOccurrenceId}: lifecycle label changed`);
  assert(JSON.stringify(row.image) === JSON.stringify(source.image), `${row.bannerOccurrenceId}: image metadata changed`);
  assert(row.candidateDefinitionRef === row.bannerDefinitionId, `${row.bannerOccurrenceId}: candidate definition ref changed`);
  assert(row.candidateState === set.candidateState, `${row.bannerOccurrenceId}: candidate state mismatch`);
  assert(row.candidateCount === set.candidateCount, `${row.bannerOccurrenceId}: candidate count mismatch`);
  assert(row.candidatePayloadInline === false, `${row.bannerOccurrenceId}: candidate payload duplicated inline`);
  assert(!Object.prototype.hasOwnProperty.call(row, 'candidates'), `${row.bannerOccurrenceId}: inline candidates leaked`);
}

for (const source of wishRows) {
  assert(output.occurrenceWishRecords.some(row => row.bannerOccurrenceId === source.bannerOccurrenceId),
    `${source.bannerOccurrenceId}: WISH occurrence missing from Stage 3-4`);
}

for (let i = 1; i < output.occurrenceWishRecords.length; i += 1) {
  const a = output.occurrenceWishRecords[i - 1];
  const b = output.occurrenceWishRecords[i];
  const ordered = a.krDisplayDate < b.krDisplayDate
    || (a.krDisplayDate === b.krDisplayDate && a.displayOrder < b.displayOrder)
    || (a.krDisplayDate === b.krDisplayDate && a.displayOrder === b.displayOrder
      && a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId) <= 0);
  assert(ordered, `occurrence sort order violation at ${b.bannerOccurrenceId}`);
}

assert(output.policy.candidateListsStoredOncePerDefinition === true, 'candidate lists are not definition-scoped');
assert(output.policy.occurrenceCandidateArraysDuplicated === false, 'candidate arrays duplicated per occurrence');
assert(output.policy.manualSourceNullCandidatesSynthesized === false, 'manual candidates synthesized');
assert(output.policy.pickupHeroRelationsIncluded === false, 'PICKUP relations joined into Wish consumer');
assert(output.policy.heroRoutesInvented === false, 'Hero routes invented');
assert(output.policy.candidateGroupsInvented === false, 'candidate groups invented');
assert(output.policy.selectableTextParsedIntoCandidates === false, 'selectableText parsed into candidate IDs');
assert(output.policy.cpEventRelationsIncluded === false, 'CP/Event relations joined early');
assert(output.policy.recurrenceHistoryIncluded === false, 'recurrence history joined early');

assert(summary.candidateSets.sourceLinkedDefinitions === sourceLinkedSets.length, 'summary source-linked count mismatch');
assert(summary.candidateSets.manualSourceNullDefinitions === manualSets.length, 'summary manual source-null count mismatch');
assert(summary.candidateSets.candidateEdges === sourceEdges.length, 'summary candidate edge count mismatch');
assert(summary.occurrenceProjection.records === wishRows.length, 'summary WISH occurrence count mismatch');
assert(summary.occurrenceProjection.occurrenceCandidateArraysDuplicated === false, 'summary says occurrence arrays duplicated');
assert(summary.semanticFreeze.stage2WishCandidateRelationsChanged === false, 'summary says Stage 2 Wish relations changed');
assert(summary.semanticFreeze.manualCandidatesSynthesized === false, 'summary says manual candidates synthesized');

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL_BANNER_STAGE3_4_WISH_VALIDATION', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS_BANNER_STAGE3_4_WISH_VALIDATION',
  wishDefinitions: output.definitionCandidateSets.length,
  wishOccurrences: output.occurrenceWishRecords.length,
  candidateEdges: output.candidateEdgeCount,
  sourceLinkedDefinitions: sourceLinkedSets.length,
  manualSourceNullDefinitions: manualSets.length,
  candidateReadyOccurrences: output.occurrenceWishRecords.filter(row => row.candidateCount > 0).length,
  candidateReviewOccurrences: output.occurrenceWishRecords.filter(row => row.candidateCount === 0).length,
  reviewCount: output.reviews?.length ?? 0
}, null, 2));
