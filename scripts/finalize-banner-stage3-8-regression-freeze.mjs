import fs from 'node:fs';

const CONTRACT_PATH = 'data/contracts/banner-stage3-8-regression-freeze.v1.json';
const load = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const sameArray = (actual, expected, label) => {
  check(Array.isArray(actual), `${label}: expected array`);
  check(actual.length === expected.length, `${label}: length ${actual.length} expected ${expected.length}`);
  for (let i = 0; i < expected.length; i += 1) check(actual[i] === expected[i], `${label}[${i}] ${actual[i]} expected ${expected[i]}`);
};

const contract = load(CONTRACT_PATH);
const summaries = {};
for (const [key, spec] of Object.entries(contract.inputs.summaries)) {
  check(fs.existsSync(spec.path), `${key}: summary missing ${spec.path}`);
  const summary = load(spec.path);
  check(summary.status === spec.status, `${key}: status ${summary.status} expected ${spec.status}`);
  check(Array.isArray(summary.errors) ? summary.errors.length === 0 : true, `${key}: errors are not empty`);
  summaries[key] = summary;
}
for (const validator of contract.inputs.validators) check(fs.existsSync(validator), `validator missing ${validator}`);
check(fs.existsSync(contract.inputs.frontendRouteTree), `route tree missing ${contract.inputs.frontendRouteTree}`);

const { stage30, stage31, stage32, stage33, stage34, stage35, stage36, stage37 } = summaries;
const expected = contract.expected;
const canonicalStages = [stage30, stage31, stage32, stage33, stage34, stage35, stage36];
for (const [index, stage] of canonicalStages.entries()) {
  check(stage.canonicalPopulation?.definitions === expected.canonical.definitions, `stage3-${index}: definitions ${stage.canonicalPopulation?.definitions}`);
  check(stage.canonicalPopulation?.occurrences === expected.canonical.occurrences, `stage3-${index}: occurrences ${stage.canonicalPopulation?.occurrences}`);
}

check(stage30.displayProvenanceHandoff?.imageFileNonNull === expected.display.resolvedOrRenderableOccurrences, '3-0 non-null image handoff changed');
check(stage30.displayProvenanceHandoff?.imageFileNull === expected.display.placeholderOccurrences, '3-0 null image handoff changed');
check(stage30.heroRelations?.relationTypes?.WISH_CANDIDATE_HERO === expected.wish.candidateEdges, '3-0 Wish edge count changed');
check(stage30.cpEventRelations?.cpDefinitions === expected.cpEvent.definitions, '3-0 CP definition count changed');
check(stage30.cpEventRelations?.canonicalEventRelations === expected.cpEvent.canonicalEventRelations, '3-0 canonical Event relation changed');
check(stage30.recurrenceHistory?.repeatedDefinitions === expected.recurrence.repeatedDefinitions, '3-0 repeated definition count changed');
check(stage30.recurrenceHistory?.recurrenceLinks === expected.recurrence.recurrenceLinks, '3-0 recurrence link count changed');
check(stage30.recurrenceHistory?.firstEverReleaseEstablished === false, '3-0 first-ever boundary changed');
check(stage30.recurrenceHistory?.fixedCadenceEstablished === false, '3-0 cadence boundary changed');

check(stage31.referenceResolution?.resolvedOccurrences === expected.display.resolvedOrRenderableOccurrences, '3-1 resolved occurrence count changed');
check(stage31.referenceResolution?.nullImageReferences === expected.display.placeholderOccurrences, '3-1 null image reference count changed');
check(stage31.referenceResolution?.statusCounts?.MISSING_REFERENCED_FILE === 0, '3-1 missing referenced assets introduced');
check(stage31.referenceResolution?.statusCounts?.AMBIGUOUS_REFERENCED_FILE === 0, '3-1 ambiguous referenced assets introduced');
check(stage31.referenceResolution?.statusCounts?.UNSUPPORTED_IMAGE_TYPE === 0, '3-1 unsupported image type introduced');
check(stage31.semanticFreeze?.assetUsedForDefinitionGrouping === false, '3-1 asset grouping boundary changed');
check(stage31.semanticFreeze?.canonicalAssetOwnerInvented === false, '3-1 canonical asset owner invented');

check(stage32.occurrenceDisplay?.renderableOccurrences === expected.display.resolvedOrRenderableOccurrences, '3-2 renderable occurrence count changed');
check(stage32.occurrenceDisplay?.placeholderOccurrences === expected.display.placeholderOccurrences, '3-2 placeholder occurrence count changed');
sameArray(stage32.pendingManualAssetAssignments.map(row => row.bannerOccurrenceId), expected.display.placeholderOccurrenceIds, '3-2 pending manual asset occurrences');
check(stage32.semanticFreeze?.occurrenceFallbackApplied === false, '3-2 fallback was introduced');
check(stage32.semanticFreeze?.sharedAssetUsedToMergeDefinitions === false, '3-2 shared asset merged definitions');

check(stage33.canonicalPopulation?.consumerRows === expected.basicTable.rows, '3-3 row count changed');
check(stage33.chronology?.dateGroups === expected.basicTable.dateGroups, '3-3 date-group count changed');
check(stage33.chronology?.firstDate === expected.basicTable.firstDate, '3-3 first date changed');
check(stage33.chronology?.lastDate === expected.basicTable.lastDate, '3-3 last date changed');
check(stage33.rowTaxonomy?.mechanicFamilyCounts?.PICKUP === expected.basicTable.pickupRows, '3-3 PICKUP row count changed');
check(stage33.rowTaxonomy?.mechanicFamilyCounts?.WISH === expected.basicTable.wishRows, '3-3 WISH row count changed');
check(stage33.imageDisplay?.renderableRows === expected.basicTable.renderableRows, '3-3 renderable row count changed');
sameArray(stage33.imageDisplay?.placeholderRowIds, expected.display.placeholderOccurrenceIds, '3-3 placeholder rows');
check(stage33.pickupSummary?.definitionCardinalityRelationMismatchCount === expected.pickupCardinalityReviews.count, '3-3 cardinality review count changed');
sameArray(stage33.pickupSummary?.neutralizedDisplayRowIds, expected.pickupCardinalityReviews.neutralizedRowIds, '3-3 neutralized display rows');
check(stage33.semanticFreeze?.stage2PickupRelationsTrimmed === false, '3-3 pickup relations were trimmed');
check(stage33.semanticFreeze?.stage2PickupTaxonomyRewritten === false, '3-3 pickup taxonomy was rewritten');

check(stage34.canonicalPopulation?.wishDefinitions === expected.wish.definitions, '3-4 Wish definition count changed');
check(stage34.canonicalPopulation?.wishOccurrences === expected.wish.occurrences, '3-4 Wish occurrence count changed');
check(stage34.candidateSets?.candidateEdges === expected.wish.candidateEdges, '3-4 candidate edge count changed');
check(stage34.candidateSets?.definitionsWithCandidates === expected.wish.verifiedDefinitions, '3-4 verified Wish definition count changed');
check(stage34.candidateSets?.definitionsWithoutExplicitCandidates === expected.wish.reviewDefinitions, '3-4 review Wish definition count changed');
check(stage34.semanticFreeze?.manualCandidatesSynthesized === expected.wish.manualCandidatesSynthesized, '3-4 manual candidate synthesis boundary changed');
check(stage34.semanticFreeze?.pickupRelationsJoined === false, '3-4 PICKUP relations leaked into Wish consumer');

check(stage35.canonicalPopulation?.cpRelatedDefinitions === expected.cpEvent.definitions, '3-5 CP definition count changed');
check(stage35.canonicalPopulation?.cpRelatedOccurrences === expected.cpEvent.occurrences, '3-5 CP occurrence count changed');
check(stage35.eventReference?.canonicalEventRelationCount === expected.cpEvent.canonicalEventRelations, '3-5 canonical Event relation changed');
check(stage35.eventReference?.eventNavigationAvailableOccurrences === expected.cpEvent.eventNavigationOccurrences, '3-5 Event navigation changed');
check(stage35.eventReference?.resolutionStatusCounts?.TEXT_REFERENCE_ONLY_REVIEW === expected.cpEvent.textReferenceOnlyReviews, '3-5 text-reference review count changed');
check(stage35.semanticFreeze?.canonicalEventIdInvented === false, '3-5 canonical Event ID invented');
check(stage35.semanticFreeze?.eventRouteInvented === false, '3-5 Event route invented');

check(stage36.recurrenceHistory?.repeatedDefinitions === expected.recurrence.repeatedDefinitions, '3-6 repeated definition count changed');
check(stage36.recurrenceHistory?.recurrenceLinks === expected.recurrence.recurrenceLinks, '3-6 recurrence links changed');
check(stage36.recurrenceHistory?.futurePredictionsMaterialized === expected.recurrence.futurePredictionsMaterialized, '3-6 future predictions materialized');
check(stage36.recurrenceHistory?.firstEverReleaseEstablished === expected.recurrence.firstEverReleaseEstablished, '3-6 first-ever boundary changed');
check(stage36.recurrenceHistory?.fixedCadenceEstablished === expected.recurrence.fixedCadenceEstablished, '3-6 cadence boundary changed');
check(stage36.pickupLog?.repeatedPickupDefinitions === expected.recurrence.repeatedPickupDefinitions, '3-6 repeated PICKUP subset changed');
check(stage36.pickupLog?.pickupOccurrences === expected.basicTable.pickupRows, '3-6 pickup occurrence count changed');
check(stage36.semanticFreeze?.futureRecurrencePredicted === false, '3-6 recurrence prediction introduced');

check(stage37.route?.path === expected.frontend.route, '3-7 route changed');
check(stage37.route?.mainCategoryLinked === expected.frontend.mainCategoryLinked, '3-7 main category link changed');
sameArray(stage37.route?.sections, expected.frontend.sections, '3-7 sections');
check(stage37.integratedConsumers?.basicTable?.rows === expected.basicTable.rows, '3-7 basic table rows changed');
check(stage37.integratedConsumers?.basicTable?.dateGroups === expected.basicTable.dateGroups, '3-7 date groups changed');
check(stage37.integratedConsumers?.basicTable?.pickupRows === expected.basicTable.pickupRows, '3-7 pickup rows changed');
check(stage37.integratedConsumers?.basicTable?.wishRows === expected.basicTable.wishRows, '3-7 Wish rows changed');
check(stage37.integratedConsumers?.basicTable?.renderableRows === expected.basicTable.renderableRows, '3-7 renderable rows changed');
check(stage37.integratedConsumers?.wish?.definitions === expected.wish.definitions, '3-7 Wish definitions changed');
check(stage37.integratedConsumers?.wish?.occurrences === expected.wish.occurrences, '3-7 Wish occurrences changed');
check(stage37.integratedConsumers?.wish?.candidateEdges === expected.wish.candidateEdges, '3-7 Wish candidate edges changed');
check(stage37.integratedConsumers?.wish?.verifiedDefinitions === expected.wish.verifiedDefinitions, '3-7 verified Wish definitions changed');
check(stage37.integratedConsumers?.wish?.reviewDefinitions === expected.wish.reviewDefinitions, '3-7 review Wish definitions changed');
check(stage37.integratedConsumers?.cpEvent?.definitions === expected.cpEvent.definitions, '3-7 CP definitions changed');
check(stage37.integratedConsumers?.cpEvent?.occurrences === expected.cpEvent.occurrences, '3-7 CP occurrences changed');
check(stage37.integratedConsumers?.cpEvent?.canonicalEventRelations === expected.cpEvent.canonicalEventRelations, '3-7 canonical Event relations changed');
check(stage37.integratedConsumers?.cpEvent?.eventNavigationOccurrences === expected.cpEvent.eventNavigationOccurrences, '3-7 Event navigation changed');
check(stage37.integratedConsumers?.recurrence?.definitionHistories === expected.recurrence.definitionHistories, '3-7 definition histories changed');
check(stage37.integratedConsumers?.recurrence?.occurrenceLogs === expected.recurrence.occurrenceLogs, '3-7 occurrence logs changed');
check(stage37.integratedConsumers?.recurrence?.recurrenceLinks === expected.recurrence.recurrenceLinks, '3-7 recurrence links changed');
check(stage37.integratedConsumers?.recurrence?.repeatedPickupDefinitions === expected.recurrence.repeatedPickupDefinitions, '3-7 repeated PICKUP definitions changed');
for (const key of ['sourceConfigDataReadByFrontend', 'wishManualCandidatesSynthesized', 'canonicalEventIdInvented', 'eventRouteInvented', 'heroRouteInvented', 'observedGapPromotedToCadence', 'futureRecurrencePredicted']) {
  check(stage37.semanticFreeze?.[key] === false, `3-7 semantic boundary ${key} changed`);
}

const routeTreeText = fs.readFileSync(contract.inputs.frontendRouteTree, 'utf8');
check(routeTreeText.includes("'/banners'"), 'generated route tree no longer contains /banners');

const summary = {
  stage: '3-8',
  status: contract.completionStatus,
  freezeState: contract.freezeState,
  validatedStages: Object.entries(contract.inputs.summaries).map(([key, spec]) => ({ key, path: spec.path, status: summaries[key].status })),
  canonicalPopulation: { ...expected.canonical },
  display: {
    renderableOccurrences: expected.display.resolvedOrRenderableOccurrences,
    placeholderOccurrences: expected.display.placeholderOccurrences,
    placeholderOccurrenceIds: expected.display.placeholderOccurrenceIds
  },
  basicTable: { ...expected.basicTable },
  wish: { ...expected.wish },
  cpEvent: { ...expected.cpEvent },
  recurrence: { ...expected.recurrence },
  pickupCardinalityReviews: { ...expected.pickupCardinalityReviews },
  frontend: { ...expected.frontend, productionBuildRequired: true, generatedRouteTreeVerified: true },
  knownDeferredNonErrors: contract.knownDeferredNonErrors,
  freezePolicy: contract.freezePolicy,
  errors: [],
  nextStage: null
};

const manifest = {
  version: 'banner-stage3-production-manifest/v1',
  status: contract.manifest.status,
  representation: contract.manifest.representation,
  freezeState: contract.freezeState,
  canonicalPopulation: { ...expected.canonical },
  datasetWindow: { firstKrDisplayDate: expected.basicTable.firstDate, lastKrDisplayDate: expected.basicTable.lastDate },
  stageCheckpoints: Object.values(contract.inputs.summaries).map(spec => ({ path: spec.path, expectedStatus: spec.status })),
  productionArtifacts: [
    { role: 'stage2FrozenSourceManifest', path: 'data/generated/banner-stage2-production-manifest.v1.json' },
    { role: 'assetRelations', path: 'data/generated/banner-stage3-1-asset-relations.v1.json' },
    { role: 'displayMetadata', path: 'data/generated/banner-stage3-2-display-metadata.v1.json' },
    { role: 'basicTableConsumer', path: 'data/generated/banner-stage3-3-basic-table-consumer.v1.json' },
    { role: 'wishConsumer', path: 'data/generated/banner-stage3-4-wish-consumer.v1.json' },
    { role: 'cpEventConsumer', path: 'data/generated/banner-stage3-5-cp-event-consumer.v1.json' },
    { role: 'recurrencePickupLogConsumer', path: 'data/generated/banner-stage3-6-recurrence-pickup-log-consumer.v1.json' },
    { role: 'frontendRoute', path: 'src/routes/banners.tsx' },
    { role: 'frontendServerAdapter', path: 'src/lib/banner-page.server.ts' },
    { role: 'frontendServerFunction', path: 'src/lib/banner-page.functions.ts' },
    { role: 'stage3FreezeSummary', path: contract.outputs.summary }
  ],
  frontend: { route: expected.frontend.route, sections: expected.frontend.sections },
  knownDeferredNonErrors: contract.knownDeferredNonErrors,
  semanticBoundaries: contract.freezePolicy,
  changeControl: 'Future Banner semantic changes require an explicit scoped stage or migration; silent identity, JOIN, display, or recurrence reinterpretation is not allowed.'
};

for (const artifact of manifest.productionArtifacts.filter(row => row.role !== 'stage3FreezeSummary')) {
  check(fs.existsSync(artifact.path), `production artifact missing ${artifact.role}: ${artifact.path}`);
}
write(contract.outputs.summary, summary);
write(contract.outputs.manifest, manifest);
console.log(contract.completionStatus);
