import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const contract = load('data/contracts/banner-stage3-3-basic-table-consumer.v1.json');
const output = load(contract.outputs.consumer);
const summary = load(contract.outputs.summary);
const occurrences = load(contract.inputs.occurrences).records ?? [];
const definitionTaxonomy = load(contract.inputs.definitionTaxonomy).records ?? [];
const occurrenceTaxonomy = load(contract.inputs.occurrenceTaxonomy).records ?? [];
const heroRelations = load(contract.inputs.heroRelations).edges ?? [];
const stage32Display = load(contract.inputs.stage32DisplayMetadata).occurrenceDisplayRecords ?? [];

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(output.status === 'BANNER_STAGE3_3_BASIC_TABLE_CONSUMER_MATERIALIZED', `output status ${output.status}`);
assert(summary.status === 'PASS_BANNER_STAGE3_3_BASIC_TABLE_CONSUMER', `summary status ${summary.status}`);
assert(Array.isArray(output.rows) && output.rows.length === contract.expectedCanonicalPopulation.occurrences,
  `row count ${output.rows?.length}`);
assert(output.rowCount === output.rows.length, 'rowCount mismatch');
assert(Array.isArray(output.dateGroups), 'dateGroups missing');
assert(Array.isArray(output.errors) && output.errors.length === 0, 'output errors not empty');
assert(Array.isArray(summary.errors) && summary.errors.length === 0, 'summary errors not empty');

const occurrenceById = new Map(occurrences.map(row => [row.bannerOccurrenceId, row]));
const definitionTaxonomyById = new Map(definitionTaxonomy.map(row => [row.bannerDefinitionId, row]));
const occurrenceTaxonomyById = new Map(occurrenceTaxonomy.map(row => [row.bannerOccurrenceId, row]));
const displayById = new Map(stage32Display.map(row => [row.bannerOccurrenceId, row]));
const pickupEdgesByDefinition = new Map();
for (const edge of heroRelations) {
  if (edge.relationType !== 'PICKUP_HERO') continue;
  if (!pickupEdgesByDefinition.has(edge.bannerDefinitionId)) pickupEdgesByDefinition.set(edge.bannerDefinitionId, []);
  pickupEdgesByDefinition.get(edge.bannerDefinitionId).push(edge);
}
for (const edges of pickupEdgesByDefinition.values()) {
  edges.sort((a, b) => (a.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (b.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    || a.heroId - b.heroId);
}

const expectedCardinalityCount = { SINGLE: 1, DUAL: 2, TRIPLE: 3 };

assert(occurrenceById.size === occurrences.length, 'duplicate source occurrence IDs');
assert(new Set(output.rows.map(row => row.rowId)).size === output.rows.length, 'duplicate consumer row IDs');

for (const row of output.rows) {
  const occurrence = occurrenceById.get(row.bannerOccurrenceId);
  const definitionTax = definitionTaxonomyById.get(row.bannerDefinitionId);
  const occurrenceTax = occurrenceTaxonomyById.get(row.bannerOccurrenceId);
  const display = displayById.get(row.bannerOccurrenceId);

  assert(row.rowId === row.bannerOccurrenceId, `${row.rowId}: row identity mismatch`);
  assert(Boolean(occurrence), `${row.rowId}: unknown occurrence`);
  assert(Boolean(definitionTax), `${row.rowId}: unknown definition taxonomy`);
  assert(Boolean(occurrenceTax), `${row.rowId}: unknown occurrence taxonomy`);
  assert(Boolean(display), `${row.rowId}: unknown Stage 3-2 display`);
  if (!occurrence || !definitionTax || !occurrenceTax || !display) continue;

  assert(row.bannerDefinitionId === occurrence.bannerDefinitionId, `${row.rowId}: definition changed`);
  assert(row.krDisplayDate === occurrence.krDisplayDate, `${row.rowId}: date changed`);
  assert(row.displayOrder === occurrence.displayOrder, `${row.rowId}: displayOrder changed`);
  assert(row.mechanicFamily === definitionTax.mechanicFamily, `${row.rowId}: mechanic family mismatch`);
  assert(row.pickupCardinality === definitionTax.pickupCardinality, `${row.rowId}: pickup cardinality mismatch`);
  assert(row.lifecycle === occurrenceTax.lifecycle, `${row.rowId}: lifecycle mismatch`);
  assert(JSON.stringify(row.provenanceTags) === JSON.stringify(occurrenceTax.provenanceTags ?? []), `${row.rowId}: provenance tags mismatch`);
  assert(JSON.stringify(row.validationTags) === JSON.stringify(occurrenceTax.validationTags ?? []), `${row.rowId}: validation tags mismatch`);

  assert(row.image.displayState === display.displayState, `${row.rowId}: displayState recomputed`);
  assert(row.image.canRenderImage === display.canRenderImage, `${row.rowId}: canRenderImage recomputed`);
  assert(row.image.publicPath === display.publicPath, `${row.rowId}: publicPath changed`);
  assert(row.image.assetId === display.assetId, `${row.rowId}: assetId changed`);
  assert(row.image.placeholderKey === display.placeholderKey, `${row.rowId}: placeholder changed`);

  if (row.mechanicFamily === 'PICKUP') {
    const expectedEdges = pickupEdgesByDefinition.get(row.bannerDefinitionId) ?? [];
    const expectedHeroes = expectedEdges.map(edge => ({
      heroId: edge.heroId,
      heroNameKr: edge.heroNameKr,
      sourceIndex: edge.sourceIndex,
      heroStatus: edge.heroStatus
    }));
    assert(JSON.stringify(row.pickupHeroes) === JSON.stringify(expectedHeroes), `${row.rowId}: pickup hero projection mismatch`);
    assert(row.deferredDetail === null, `${row.rowId}: PICKUP row has deferred Wish detail`);

    const expectedCount = expectedCardinalityCount[definitionTax.pickupCardinality] ?? null;
    const matches = expectedCount == null ? null : expectedHeroes.length === expectedCount;
    assert(row.pickupHeroCountMatchesCardinality === matches, `${row.rowId}: cardinality relation flag mismatch`);
    if (matches === false) {
      assert(row.typeLabelKr === contract.typeLabelsKr.PICKUP_REVIEW, `${row.rowId}: reviewed mismatch label not neutralized`);
      assert(row.typeLabelBasis === 'NEUTRALIZED_CARDINALITY_RELATION_REVIEW', `${row.rowId}: reviewed mismatch label basis missing`);
    } else {
      assert(row.typeLabelKr === contract.typeLabelsKr[`PICKUP_${definitionTax.pickupCardinality}`], `${row.rowId}: normal pickup label mismatch`);
      assert(row.typeLabelBasis === 'TAXONOMY_CARDINALITY', `${row.rowId}: normal pickup label basis mismatch`);
    }
  } else {
    assert(row.mechanicFamily === 'WISH', `${row.rowId}: unsupported mechanic family ${row.mechanicFamily}`);
    assert(Array.isArray(row.pickupHeroes) && row.pickupHeroes.length === 0, `${row.rowId}: Wish row contains pickup heroes`);
    assert(row.typeLabelKr === contract.typeLabelsKr.WISH, `${row.rowId}: Wish label mismatch`);
    assert(row.typeLabelBasis === 'MECHANIC_FAMILY', `${row.rowId}: Wish label basis mismatch`);
    assert(row.deferredDetail?.kind === 'WISH_CANDIDATES', `${row.rowId}: Wish deferral missing`);
    assert(row.deferredDetail?.materializedHere === false, `${row.rowId}: Wish candidates materialized early`);
    assert(!Object.prototype.hasOwnProperty.call(row, 'wishCandidates'), `${row.rowId}: Wish candidate payload leaked`);
  }
}

for (let i = 1; i < output.rows.length; i += 1) {
  const a = output.rows[i - 1];
  const b = output.rows[i];
  const ok = a.krDisplayDate < b.krDisplayDate
    || (a.krDisplayDate === b.krDisplayDate && a.displayOrder < b.displayOrder)
    || (a.krDisplayDate === b.krDisplayDate && a.displayOrder === b.displayOrder
      && a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId) <= 0);
  assert(ok, `sort order violation at ${b.rowId}`);
}

const groupedIds = output.dateGroups.flatMap(group => group.rowIds ?? []);
assert(groupedIds.length === output.rows.length, 'date group row coverage mismatch');
assert(new Set(groupedIds).size === output.rows.length, 'date group duplicate row IDs');
assert(new Set(groupedIds).size === new Set(output.rows.map(row => row.rowId)).size, 'date group identity coverage mismatch');
for (const group of output.dateGroups) {
  assert(group.rowCount === group.rowIds.length, `${group.krDisplayDate}: date group count mismatch`);
  for (const rowId of group.rowIds) {
    const row = output.rows.find(candidate => candidate.rowId === rowId);
    assert(row?.krDisplayDate === group.krDisplayDate, `${rowId}: date group assignment mismatch`);
  }
}

const renderable = output.rows.filter(row => row.image.canRenderImage).length;
const placeholders = output.rows.length - renderable;
const neutralizedRows = output.rows.filter(row => row.typeLabelBasis === 'NEUTRALIZED_CARDINALITY_RELATION_REVIEW');
const mismatchDefinitions = new Set(neutralizedRows.map(row => row.bannerDefinitionId));
assert(renderable === contract.expectedCanonicalPopulation.renderableOccurrences, `renderable ${renderable}`);
assert(placeholders === contract.expectedCanonicalPopulation.placeholderOccurrences, `placeholders ${placeholders}`);
assert(summary.imageDisplay.renderableRows === renderable, 'summary renderable mismatch');
assert(summary.imageDisplay.placeholderRows === placeholders, 'summary placeholder mismatch');
assert(summary.pickupSummary.definitionCardinalityRelationMismatchCount === mismatchDefinitions.size, 'summary mismatch definition count mismatch');
assert(summary.pickupSummary.neutralizedDisplayRowCount === neutralizedRows.length, 'summary neutralized row count mismatch');
assert(JSON.stringify(summary.pickupSummary.neutralizedDisplayRowIds) === JSON.stringify(neutralizedRows.map(row => row.rowId)), 'summary neutralized row IDs mismatch');
assert(summary.wishSummary.candidateListsMaterialized === 0, 'Wish candidates materialized in Stage 3-3');
assert(output.policy.cpEventRelationsIncluded === false, 'CP/Event joined early');
assert(output.policy.recurrenceHistoryIncluded === false, 'recurrence joined early');
assert(output.policy.bannerTitlesInvented === false, 'banner title invented');
assert(output.policy.heroRoutesInvented === false, 'hero route invented');
assert(output.policy.fallbackAssetsInvented === false, 'fallback asset invented');
assert(summary.semanticFreeze.stage2PickupRelationsTrimmed === false, 'Stage 2 pickup relations trimmed');
assert(summary.semanticFreeze.stage2PickupTaxonomyRewritten === false, 'Stage 2 pickup taxonomy rewritten');

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL_BANNER_STAGE3_3_BASIC_TABLE_VALIDATION', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS_BANNER_STAGE3_3_BASIC_TABLE_VALIDATION',
  rows: output.rows.length,
  dateGroups: output.dateGroups.length,
  renderable,
  placeholders,
  pickupRows: output.rows.filter(row => row.mechanicFamily === 'PICKUP').length,
  wishRows: output.rows.filter(row => row.mechanicFamily === 'WISH').length,
  neutralizedRows: neutralizedRows.length,
  mismatchDefinitions: mismatchDefinitions.size,
  reviewCount: output.reviews?.length ?? 0
}, null, 2));
