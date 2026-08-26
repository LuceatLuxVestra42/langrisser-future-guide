import fs from 'node:fs';
import path from 'node:path';

const CONTRACT_PATH = 'data/contracts/banner-stage3-3-basic-table-consumer.v1.json';
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
const stage32Summary = load(contract.inputs.stage32Summary);
const stage32Display = load(contract.inputs.stage32DisplayMetadata);
const occurrencesData = load(contract.inputs.occurrences);
const definitionTaxonomyData = load(contract.inputs.definitionTaxonomy);
const occurrenceTaxonomyData = load(contract.inputs.occurrenceTaxonomy);
const heroRelationsData = load(contract.inputs.heroRelations);

const occurrences = occurrencesData.records ?? [];
const definitionTaxonomy = definitionTaxonomyData.records ?? [];
const occurrenceTaxonomy = occurrenceTaxonomyData.records ?? [];
const displayRecords = stage32Display.occurrenceDisplayRecords ?? [];
const heroEdges = heroRelationsData.edges ?? [];

const errors = [];
const reviews = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

check(stage32Summary.status === 'PASS_BANNER_STAGE3_2_DISPLAY_METADATA', `Stage 3-2 status changed: ${stage32Summary.status}`);
check(occurrences.length === contract.expectedCanonicalPopulation.occurrences, `occurrence count ${occurrences.length}`);
check(definitionTaxonomy.length === contract.expectedCanonicalPopulation.definitions, `definition taxonomy count ${definitionTaxonomy.length}`);
check(occurrenceTaxonomy.length === contract.expectedCanonicalPopulation.occurrences, `occurrence taxonomy count ${occurrenceTaxonomy.length}`);
check(displayRecords.length === contract.expectedCanonicalPopulation.occurrences, `Stage 3-2 display count ${displayRecords.length}`);
check(definitionTaxonomyData.mechanicFamilyCounts?.PICKUP === contract.expectedCanonicalPopulation.definitionMechanicFamilies.PICKUP,
  `PICKUP definition count ${definitionTaxonomyData.mechanicFamilyCounts?.PICKUP}`);
check(definitionTaxonomyData.mechanicFamilyCounts?.WISH === contract.expectedCanonicalPopulation.definitionMechanicFamilies.WISH,
  `WISH definition count ${definitionTaxonomyData.mechanicFamilyCounts?.WISH}`);

const definitionTaxonomyById = new Map(definitionTaxonomy.map(row => [row.bannerDefinitionId, row]));
const occurrenceTaxonomyById = new Map(occurrenceTaxonomy.map(row => [row.bannerOccurrenceId, row]));
const displayByOccurrenceId = new Map(displayRecords.map(row => [row.bannerOccurrenceId, row]));

check(definitionTaxonomyById.size === definitionTaxonomy.length, 'duplicate definition taxonomy IDs');
check(occurrenceTaxonomyById.size === occurrenceTaxonomy.length, 'duplicate occurrence taxonomy IDs');
check(displayByOccurrenceId.size === displayRecords.length, 'duplicate Stage 3-2 display occurrence IDs');

const pickupEdgesByDefinition = new Map();
for (const edge of heroEdges) {
  if (edge.relationType !== 'PICKUP_HERO') continue;
  if (!pickupEdgesByDefinition.has(edge.bannerDefinitionId)) pickupEdgesByDefinition.set(edge.bannerDefinitionId, []);
  pickupEdgesByDefinition.get(edge.bannerDefinitionId).push(edge);
}
for (const edges of pickupEdgesByDefinition.values()) {
  edges.sort((a, b) => (a.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (b.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    || a.heroId - b.heroId);
}

const cardinalityExpectedCount = {
  SINGLE: 1,
  DUAL: 2,
  TRIPLE: 3
};

function typeLabel(taxonomy) {
  if (taxonomy.mechanicFamily === 'WISH') return contract.typeLabelsKr.WISH;
  return contract.typeLabelsKr[`PICKUP_${taxonomy.pickupCardinality}`] ?? `픽업(${taxonomy.pickupCardinality})`;
}

const rows = [];
for (const occurrence of occurrences) {
  const definitionTax = definitionTaxonomyById.get(occurrence.bannerDefinitionId);
  const occurrenceTax = occurrenceTaxonomyById.get(occurrence.bannerOccurrenceId);
  const display = displayByOccurrenceId.get(occurrence.bannerOccurrenceId);

  check(Boolean(definitionTax), `${occurrence.bannerOccurrenceId}: missing definition taxonomy`);
  check(Boolean(occurrenceTax), `${occurrence.bannerOccurrenceId}: missing occurrence taxonomy`);
  check(Boolean(display), `${occurrence.bannerOccurrenceId}: missing Stage 3-2 display metadata`);
  if (!definitionTax || !occurrenceTax || !display) continue;

  check(occurrenceTax.bannerDefinitionId === occurrence.bannerDefinitionId,
    `${occurrence.bannerOccurrenceId}: occurrence taxonomy definition mismatch`);
  check(display.bannerDefinitionId === occurrence.bannerDefinitionId,
    `${occurrence.bannerOccurrenceId}: display definition mismatch`);
  check(display.krDisplayDate === occurrence.krDisplayDate,
    `${occurrence.bannerOccurrenceId}: display date mismatch`);
  check(display.displayOrder === occurrence.displayOrder,
    `${occurrence.bannerOccurrenceId}: display order mismatch`);

  const pickupEdges = definitionTax.mechanicFamily === 'PICKUP'
    ? (pickupEdgesByDefinition.get(occurrence.bannerDefinitionId) ?? [])
    : [];
  const pickupHeroes = pickupEdges.map(edge => ({
    heroId: edge.heroId,
    heroNameKr: edge.heroNameKr,
    sourceIndex: edge.sourceIndex,
    heroStatus: edge.heroStatus
  }));

  const expectedPickupCount = definitionTax.mechanicFamily === 'PICKUP'
    ? (cardinalityExpectedCount[definitionTax.pickupCardinality] ?? null)
    : null;
  const pickupHeroCountMatchesCardinality = expectedPickupCount == null
    ? null
    : pickupHeroes.length === expectedPickupCount;

  rows.push({
    rowId: occurrence.bannerOccurrenceId,
    bannerOccurrenceId: occurrence.bannerOccurrenceId,
    bannerDefinitionId: occurrence.bannerDefinitionId,
    krDisplayDate: occurrence.krDisplayDate,
    displayOrder: occurrence.displayOrder,
    mechanicFamily: definitionTax.mechanicFamily,
    pickupCardinality: definitionTax.pickupCardinality,
    typeLabelKr: typeLabel(definitionTax),
    lifecycle: occurrenceTax.lifecycle,
    lifecycleLabelKr: contract.lifecycleLabelsKr[occurrenceTax.lifecycle] ?? occurrenceTax.lifecycle,
    provenanceTags: occurrenceTax.provenanceTags ?? [],
    validationTags: occurrenceTax.validationTags ?? [],
    image: {
      displayState: display.displayState,
      canRenderImage: display.canRenderImage,
      publicPath: display.publicPath,
      assetId: display.assetId,
      provenance: display.provenance,
      replacementState: display.replacementState,
      placeholderKey: display.placeholderKey
    },
    pickupHeroes,
    pickupHeroCount: pickupHeroes.length,
    pickupHeroCountMatchesCardinality,
    deferredDetail: definitionTax.mechanicFamily === 'WISH'
      ? {
          kind: 'WISH_CANDIDATES',
          stage: 'Banner Stage 3-4 Wish consumer',
          materializedHere: false
        }
      : null,
    rowStatus: display.canRenderImage ? 'READY' : 'IMAGE_PLACEHOLDER'
  });
}

rows.sort((a, b) => a.krDisplayDate.localeCompare(b.krDisplayDate)
  || a.displayOrder - b.displayOrder
  || a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));

check(rows.length === occurrences.length, `consumer row count ${rows.length}`);
check(new Set(rows.map(row => row.rowId)).size === rows.length, 'duplicate consumer row IDs');
for (let i = 1; i < rows.length; i += 1) {
  const previous = rows[i - 1];
  const current = rows[i];
  const sorted = previous.krDisplayDate < current.krDisplayDate
    || (previous.krDisplayDate === current.krDisplayDate && previous.displayOrder < current.displayOrder)
    || (previous.krDisplayDate === current.krDisplayDate && previous.displayOrder === current.displayOrder
      && previous.bannerOccurrenceId.localeCompare(current.bannerOccurrenceId) <= 0);
  check(sorted, `row order violation at ${current.bannerOccurrenceId}`);
}

const dateMap = new Map();
for (const row of rows) {
  if (!dateMap.has(row.krDisplayDate)) dateMap.set(row.krDisplayDate, []);
  dateMap.get(row.krDisplayDate).push(row.rowId);
}
const dateGroups = [...dateMap.entries()].map(([krDisplayDate, rowIds]) => ({
  krDisplayDate,
  rowCount: rowIds.length,
  rowIds
}));

const groupedRowIds = dateGroups.flatMap(group => group.rowIds);
check(groupedRowIds.length === rows.length, 'date groups do not cover all rows');
check(new Set(groupedRowIds).size === rows.length, 'date groups contain duplicate rows');

const pickupDefinitionMismatches = [];
for (const taxonomy of definitionTaxonomy) {
  if (taxonomy.mechanicFamily !== 'PICKUP') continue;
  const actual = (pickupEdgesByDefinition.get(taxonomy.bannerDefinitionId) ?? []).length;
  const expected = cardinalityExpectedCount[taxonomy.pickupCardinality] ?? null;
  if (expected != null && actual !== expected) {
    pickupDefinitionMismatches.push({
      bannerDefinitionId: taxonomy.bannerDefinitionId,
      pickupCardinality: taxonomy.pickupCardinality,
      expectedHeroCount: expected,
      actualPickupHeroCount: actual,
      disposition: 'PRESERVE_STAGE2_TAXONOMY_AND_RELATIONS_SEPARATELY'
    });
  }
}
if (pickupDefinitionMismatches.length > 0) {
  reviews.push({
    code: 'PICKUP_CARDINALITY_RELATION_COUNT_DIFFERENCE',
    count: pickupDefinitionMismatches.length,
    interpretation: 'Do not rewrite Stage 2 taxonomy or Hero relations in Stage 3-3; consumer exposes both fields separately.',
    definitions: pickupDefinitionMismatches
  });
}

const wishRowsWithCandidatePayload = rows.filter(row => row.mechanicFamily === 'WISH'
  && Object.prototype.hasOwnProperty.call(row, 'wishCandidates'));
check(wishRowsWithCandidatePayload.length === 0, 'Wish candidate payload leaked into Stage 3-3');

const renderableRows = rows.filter(row => row.image.canRenderImage).length;
const placeholderRows = rows.length - renderableRows;
check(renderableRows === contract.expectedCanonicalPopulation.renderableOccurrences, `renderable rows ${renderableRows}`);
check(placeholderRows === contract.expectedCanonicalPopulation.placeholderOccurrences, `placeholder rows ${placeholderRows}`);

const pickupRows = rows.filter(row => row.mechanicFamily === 'PICKUP');
const wishRows = rows.filter(row => row.mechanicFamily === 'WISH');
const uniquePickupHeroIds = uniq(pickupRows.flatMap(row => row.pickupHeroes.map(hero => hero.heroId)));

const output = {
  version: 1,
  stage: 'Banner Stage 3-3',
  status: errors.length === 0 ? 'BANNER_STAGE3_3_BASIC_TABLE_CONSUMER_MATERIALIZED' : 'BANNER_STAGE3_3_BASIC_TABLE_CONSUMER_WITH_ERRORS',
  policy: {
    rowIdentity: contract.consumerPolicy.rowIdentity,
    sortOrder: contract.consumerPolicy.sortOrder,
    allOccurrencesIncluded: true,
    wishRowsIncluded: true,
    wishCandidateListsIncluded: false,
    cpEventRelationsIncluded: false,
    recurrenceHistoryIncluded: false,
    imageSource: contract.consumerPolicy.imageSource,
    bannerTitlesInvented: false,
    heroRoutesInvented: false,
    fallbackAssetsInvented: false
  },
  tableColumns: [
    'krDisplayDate',
    'displayOrder',
    'typeLabelKr',
    'lifecycleLabelKr',
    'image',
    'pickupHeroes'
  ],
  rowCount: rows.length,
  dateGroupCount: dateGroups.length,
  rows,
  dateGroups,
  reviews,
  errors
};

const summary = {
  stage: '3-3',
  status: errors.length === 0 ? 'PASS_BANNER_STAGE3_3_BASIC_TABLE_CONSUMER' : 'FAIL_BANNER_STAGE3_3_BASIC_TABLE_CONSUMER',
  canonicalPopulation: {
    definitions: definitionTaxonomy.length,
    occurrences: occurrences.length,
    consumerRows: rows.length
  },
  chronology: {
    dateGroups: dateGroups.length,
    firstDate: rows[0]?.krDisplayDate ?? null,
    lastDate: rows.at(-1)?.krDisplayDate ?? null,
    sortOrder: contract.consumerPolicy.sortOrder
  },
  rowTaxonomy: {
    mechanicFamilyCounts: countBy(rows, row => row.mechanicFamily),
    pickupCardinalityCounts: countBy(pickupRows, row => row.pickupCardinality),
    lifecycleCounts: countBy(rows, row => row.lifecycle)
  },
  imageDisplay: {
    renderableRows,
    placeholderRows,
    placeholderRowIds: rows.filter(row => !row.image.canRenderImage).map(row => row.rowId)
  },
  pickupSummary: {
    pickupRows: pickupRows.length,
    pickupHeroReferencesAcrossRows: pickupRows.reduce((sum, row) => sum + row.pickupHeroCount, 0),
    uniquePickupHeroes: uniquePickupHeroIds.length,
    definitionCardinalityRelationMismatchCount: pickupDefinitionMismatches.length,
    definitionCardinalityRelationMismatches: pickupDefinitionMismatches
  },
  wishSummary: {
    wishRows: wishRows.length,
    candidateListsMaterialized: 0,
    deferredTo: contract.consumerPolicy.wishCandidateDetailDeferredTo
  },
  deferredConsumers: {
    wish: contract.consumerPolicy.wishCandidateDetailDeferredTo,
    cpEvent: contract.consumerPolicy.cpEventDetailDeferredTo,
    recurrence: contract.consumerPolicy.recurrenceDetailDeferredTo
  },
  semanticFreeze: {
    stage2DefinitionIdsChanged: false,
    stage2OccurrenceIdsChanged: false,
    stage31AssetIdsChanged: false,
    stage32DisplayRecomputed: false,
    wishCandidateListsMaterializedEarly: false,
    cpEventRelationsJoinedEarly: false,
    recurrenceHistoryJoinedEarly: false,
    bannerTitlesInvented: false,
    exactTimesInvented: false
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
