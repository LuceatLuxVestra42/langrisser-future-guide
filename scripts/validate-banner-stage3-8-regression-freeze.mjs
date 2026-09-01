import fs from 'node:fs';

const load = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const sameArray = (actual, expected, label) => {
  check(Array.isArray(actual), `${label}: expected array`);
  check(JSON.stringify(actual) === JSON.stringify(expected), `${label}: ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
};

const contract = load('data/contracts/banner-stage3-8-regression-freeze.v1.json');
const summary = load(contract.outputs.summary);
const manifest = load(contract.outputs.manifest);
const expected = contract.expected;

check(summary.stage === '3-8', `summary stage ${summary.stage}`);
check(summary.status === contract.completionStatus, `summary status ${summary.status}`);
check(summary.freezeState === contract.freezeState, `summary freeze state ${summary.freezeState}`);
check(Array.isArray(summary.errors) && summary.errors.length === 0, 'summary errors are not empty');
check(summary.nextStage === null, 'Stage 3 freeze must not silently nominate a semantic next stage');

const checkpointSpecs = Object.values(contract.inputs.summaries);
check(summary.validatedStages?.length === checkpointSpecs.length, `validated stage count ${summary.validatedStages?.length}`);
for (const spec of checkpointSpecs) {
  const row = summary.validatedStages.find(item => item.path === spec.path);
  check(row, `validated stage missing ${spec.path}`);
  check(row.status === spec.status, `validated stage status mismatch ${spec.path}`);
  const upstream = load(spec.path);
  check(upstream.status === spec.status, `upstream status changed ${spec.path}: ${upstream.status}`);
  check(Array.isArray(upstream.errors) ? upstream.errors.length === 0 : true, `upstream errors not empty ${spec.path}`);
}

check(summary.canonicalPopulation?.definitions === expected.canonical.definitions, 'summary definition count mismatch');
check(summary.canonicalPopulation?.occurrences === expected.canonical.occurrences, 'summary occurrence count mismatch');
check(summary.display?.renderableOccurrences === expected.display.resolvedOrRenderableOccurrences, 'summary renderable count mismatch');
check(summary.display?.placeholderOccurrences === expected.display.placeholderOccurrences, 'summary placeholder count mismatch');
sameArray(summary.display?.placeholderOccurrenceIds, expected.display.placeholderOccurrenceIds, 'summary placeholder occurrence IDs');

for (const key of ['rows', 'dateGroups', 'pickupRows', 'wishRows', 'renderableRows', 'firstDate', 'lastDate']) {
  check(summary.basicTable?.[key] === expected.basicTable[key], `summary basicTable ${key} mismatch`);
}
for (const key of ['definitions', 'occurrences', 'candidateEdges', 'verifiedDefinitions', 'reviewDefinitions', 'manualCandidatesSynthesized']) {
  check(summary.wish?.[key] === expected.wish[key], `summary Wish ${key} mismatch`);
}
for (const key of ['definitions', 'occurrences', 'canonicalEventRelations', 'eventNavigationOccurrences', 'textReferenceOnlyReviews']) {
  check(summary.cpEvent?.[key] === expected.cpEvent[key], `summary CP/Event ${key} mismatch`);
}
for (const key of ['definitionHistories', 'occurrenceLogs', 'repeatedDefinitions', 'repeatedPickupDefinitions', 'recurrenceLinks', 'futurePredictionsMaterialized', 'firstEverReleaseEstablished', 'fixedCadenceEstablished']) {
  check(summary.recurrence?.[key] === expected.recurrence[key], `summary recurrence ${key} mismatch`);
}
check(summary.pickupCardinalityReviews?.count === expected.pickupCardinalityReviews.count, 'summary pickup review count mismatch');
sameArray(summary.pickupCardinalityReviews?.neutralizedRowIds, expected.pickupCardinalityReviews.neutralizedRowIds, 'summary neutralized pickup rows');
check(summary.frontend?.route === expected.frontend.route, 'summary frontend route mismatch');
check(summary.frontend?.mainCategoryLinked === true, 'summary main category link mismatch');
sameArray(summary.frontend?.sections, expected.frontend.sections, 'summary frontend sections');
check(summary.frontend?.productionBuildRequired === true, 'summary production build gate missing');
check(summary.frontend?.generatedRouteTreeVerified === true, 'summary route-tree verification missing');

check(JSON.stringify(summary.knownDeferredNonErrors) === JSON.stringify(contract.knownDeferredNonErrors), 'known deferred/non-error ledger changed');
check(JSON.stringify(summary.freezePolicy) === JSON.stringify(contract.freezePolicy), 'freeze policy changed');
for (const [key, value] of Object.entries(contract.freezePolicy)) check(summary.freezePolicy[key] === value, `freeze policy ${key} mismatch`);

check(manifest.status === contract.manifest.status, `manifest status ${manifest.status}`);
check(manifest.representation === contract.manifest.representation, `manifest representation ${manifest.representation}`);
check(manifest.freezeState === contract.freezeState, `manifest freeze state ${manifest.freezeState}`);
check(manifest.canonicalPopulation?.definitions === expected.canonical.definitions, 'manifest definition count mismatch');
check(manifest.canonicalPopulation?.occurrences === expected.canonical.occurrences, 'manifest occurrence count mismatch');
check(manifest.datasetWindow?.firstKrDisplayDate === expected.basicTable.firstDate, 'manifest first date mismatch');
check(manifest.datasetWindow?.lastKrDisplayDate === expected.basicTable.lastDate, 'manifest last date mismatch');
check(manifest.stageCheckpoints?.length === checkpointSpecs.length, 'manifest checkpoint count mismatch');
check(manifest.productionArtifacts?.length === 11, `manifest production artifact count ${manifest.productionArtifacts?.length}`);
check(manifest.frontend?.route === expected.frontend.route, 'manifest frontend route mismatch');
sameArray(manifest.frontend?.sections, expected.frontend.sections, 'manifest frontend sections');
check(JSON.stringify(manifest.knownDeferredNonErrors) === JSON.stringify(contract.knownDeferredNonErrors), 'manifest known deferred ledger changed');
check(JSON.stringify(manifest.semanticBoundaries) === JSON.stringify(contract.freezePolicy), 'manifest semantic boundaries changed');
check(manifest.changeControl?.includes('explicit scoped stage or migration'), 'manifest change-control rule missing');

const artifactRoles = new Set();
for (const artifact of manifest.productionArtifacts) {
  check(typeof artifact.role === 'string' && artifact.role.length > 0, 'manifest artifact role missing');
  check(!artifactRoles.has(artifact.role), `duplicate manifest artifact role ${artifact.role}`);
  artifactRoles.add(artifact.role);
  check(typeof artifact.path === 'string' && artifact.path.length > 0, `manifest artifact path missing ${artifact.role}`);
  check(fs.existsSync(artifact.path), `manifest artifact missing on disk ${artifact.role}: ${artifact.path}`);
}

// Scoped post-freeze resolution for the previously deferred manual
// ChuanShuoReturn Wish candidate source. This does not alter Stage 2/3 IDs or
// the frozen Stage 3-4 relation artifact; it validates the explicit direct-rule
// overlay consumed by the frontend.
const directWishOverlay = load('data/generated/banner-manual-wish-direct-candidates.v1.json');
const heroList = load('data/generated/hero-list-stage1.v1.json');
const wishConsumer = load('data/generated/banner-stage3-4-wish-consumer.v1.json');
const basicTable = load('data/generated/banner-stage3-3-basic-table-consumer.v1.json');

check(directWishOverlay.status === 'PASS_BANNER_MANUAL_WISH_DIRECT_CANDIDATES',
  `direct Wish overlay status ${directWishOverlay.status}`);
check(directWishOverlay.scope === 'CHUANSHUORETURN_LANGRISSER_I_V_ALL_SSR',
  `direct Wish overlay scope ${directWishOverlay.scope}`);
check(directWishOverlay.candidateState === 'VERIFIED_DIRECT_RULE_CANDIDATES',
  `direct Wish overlay candidate state ${directWishOverlay.candidateState}`);
check(directWishOverlay.source?.authority === 'ZLONGAME_OFFICIAL_UPDATE_NOTICE', 'direct Wish source authority changed');
check(directWishOverlay.source?.url === 'https://news.zlongame.com/jx/mzgg/20260603/26598.html', 'direct Wish official source URL changed');
check(directWishOverlay.source?.summonNameCn === '传说的归来·许愿召唤', 'direct Wish summon name changed');
check(directWishOverlay.source?.selectionCount === 2, 'direct Wish selection count changed');
check(directWishOverlay.source?.candidateRuleCn === '梦幻模拟战Ⅰ-Ⅴ代所有SSR英雄', 'direct Wish candidate rule changed');

check(heroList.freezeState === directWishOverlay.heroBasis?.requiredFreezeState,
  `Hero list freeze state ${heroList.freezeState}`);
check(heroList.status === 'PASS' && heroList.completion === 'COMPLETE', 'Hero list consumer is not PASS/COMPLETE');
sameArray(directWishOverlay.heroBasis?.productionIds, [4, 5, 6, 7, 8], 'direct Wish production IDs');
check(directWishOverlay.heroBasis?.originCategory === 'ORIGINAL', 'direct Wish origin category changed');
check(directWishOverlay.heroBasis?.rarityBaseLabel === 'SSR', 'direct Wish rarity changed');

const expectedProductionNames = {
  4: '梦幻模拟战I',
  5: '梦幻模拟战II',
  6: '梦幻模拟战III',
  7: '梦幻模拟战IV',
  8: '梦幻模拟战V'
};
check(JSON.stringify(directWishOverlay.heroBasis?.productionNamesCn) === JSON.stringify(expectedProductionNames),
  'direct Wish production name mapping changed');

const heroRecords = heroList.records ?? [];
const allowedProductionIds = new Set(directWishOverlay.heroBasis.productionIds);
const expectedDirectCandidates = heroRecords
  .filter(hero => hero.rarity?.baseLabel === directWishOverlay.heroBasis.rarityBaseLabel
    && hero.origin?.category === directWishOverlay.heroBasis.originCategory
    && allowedProductionIds.has(hero.origin?.productionId))
  .sort((a, b) => a.heroId - b.heroId);
const overlayCandidates = directWishOverlay.candidates ?? [];

check(directWishOverlay.candidateCount === 32, `direct Wish candidate count ${directWishOverlay.candidateCount}`);
check(overlayCandidates.length === directWishOverlay.candidateCount,
  `direct Wish candidate payload length ${overlayCandidates.length}`);
check(new Set(overlayCandidates.map(candidate => candidate.heroId)).size === overlayCandidates.length,
  'direct Wish candidate IDs are duplicated');
sameArray(
  overlayCandidates.map(candidate => candidate.heroId),
  expectedDirectCandidates.map(hero => hero.heroId),
  'direct Wish candidate Hero IDs from frozen Hero origin + rarity fields'
);

const heroById = new Map(heroRecords.map(hero => [hero.heroId, hero]));
for (const candidate of overlayCandidates) {
  const hero = heroById.get(candidate.heroId);
  check(Boolean(hero), `direct Wish candidate missing from Hero consumer: ${candidate.heroId}`);
  check(hero.identity?.nameKr === candidate.heroNameKr,
    `direct Wish candidate Korean name mismatch ${candidate.heroId}: ${candidate.heroNameKr} != ${hero.identity?.nameKr}`);
  check(hero.origin?.productionId === candidate.productionId,
    `direct Wish candidate production mismatch ${candidate.heroId}`);
  check(hero.origin?.nameCn === expectedProductionNames[candidate.productionId],
    `direct Wish candidate production name mismatch ${candidate.heroId}: ${hero.origin?.nameCn}`);
  check(hero.origin?.category === 'ORIGINAL', `direct Wish candidate is not ORIGINAL ${candidate.heroId}`);
  check(hero.rarity?.baseLabel === 'SSR', `direct Wish candidate is not SSR ${candidate.heroId}`);
}

const bindings = directWishOverlay.bindings ?? [];
check(directWishOverlay.boundDefinitionCount === 7, `direct Wish bound definition count ${directWishOverlay.boundDefinitionCount}`);
check(directWishOverlay.boundOccurrenceCount === 7, `direct Wish bound occurrence count ${directWishOverlay.boundOccurrenceCount}`);
check(bindings.length === 7, `direct Wish binding count ${bindings.length}`);
check(new Set(bindings.map(binding => binding.bannerDefinitionId)).size === bindings.length,
  'direct Wish binding definition IDs are duplicated');
check(new Set(bindings.map(binding => binding.bannerOccurrenceId)).size === bindings.length,
  'direct Wish binding occurrence IDs are duplicated');

const baseWishByDefinition = new Map((wishConsumer.definitionCandidateSets ?? []).map(row => [row.bannerDefinitionId, row]));
const wishOccurrenceById = new Map((wishConsumer.occurrenceWishRecords ?? []).map(row => [row.bannerOccurrenceId, row]));
const basicRowByOccurrence = new Map((basicTable.rows ?? []).map(row => [row.bannerOccurrenceId, row]));
for (const binding of bindings) {
  const baseSet = baseWishByDefinition.get(binding.bannerDefinitionId);
  check(Boolean(baseSet), `direct Wish binding missing Stage 3-4 definition ${binding.bannerDefinitionId}`);
  check(baseSet.candidateState === 'NO_EXPLICIT_ID_SOURCE_REVIEW' && baseSet.candidateCount === 0,
    `direct Wish overlay may only resolve a source-null Stage 3-4 REVIEW definition: ${binding.bannerDefinitionId}`);
  check(baseSet.taxonomyBasis === 'SOURCE_NULL_MANUAL_WISH',
    `direct Wish binding is not source-null manual Wish: ${binding.bannerDefinitionId}`);

  const occurrence = wishOccurrenceById.get(binding.bannerOccurrenceId);
  check(Boolean(occurrence), `direct Wish binding missing Stage 3-4 occurrence ${binding.bannerOccurrenceId}`);
  check(occurrence.bannerDefinitionId === binding.bannerDefinitionId,
    `direct Wish occurrence/definition mismatch ${binding.bannerOccurrenceId}`);
  check(occurrence.candidateState === 'NO_EXPLICIT_ID_SOURCE_REVIEW' && occurrence.candidateCount === 0,
    `direct Wish occurrence is no longer the deferred REVIEW ${binding.bannerOccurrenceId}`);

  const basicRow = basicRowByOccurrence.get(binding.bannerOccurrenceId);
  check(Boolean(basicRow), `direct Wish binding missing Stage 3-3 row ${binding.bannerOccurrenceId}`);
  check(basicRow.bannerDefinitionId === binding.bannerDefinitionId,
    `direct Wish Stage 3-3 definition mismatch ${binding.bannerOccurrenceId}`);
  check(basicRow.mechanicFamily === 'WISH', `direct Wish Stage 3-3 row is not WISH ${binding.bannerOccurrenceId}`);
  check(basicRow.image?.publicPath === '/images/banners/Picture_Notice/Picture_Notice_ChuanShuoReturn.webp',
    `direct Wish Stage 3-3 image changed ${binding.bannerOccurrenceId}: ${basicRow.image?.publicPath}`);
}

const unrelatedManualWishDefinitionId = 'bdef:v1:f723f05efffc5f5f4ae0d65c';
const unrelatedManualWish = baseWishByDefinition.get(unrelatedManualWishDefinitionId);
check(Boolean(unrelatedManualWish), 'unrelated source-null manual Wish definition missing');
check(unrelatedManualWish.candidateState === 'NO_EXPLICIT_ID_SOURCE_REVIEW' && unrelatedManualWish.candidateCount === 0,
  'unrelated source-null manual Wish must remain unresolved');
check(!bindings.some(binding => binding.bannerDefinitionId === unrelatedManualWishDefinitionId),
  'direct Wish overlay incorrectly binds the unrelated manual Wish');
check(directWishOverlay.semanticBoundary?.stage2DefinitionIdsChanged === false, 'direct Wish overlay changed Stage 2 definition IDs');
check(directWishOverlay.semanticBoundary?.stage2OccurrenceIdsChanged === false, 'direct Wish overlay changed Stage 2 occurrence IDs');
check(directWishOverlay.semanticBoundary?.stage2HeroRelationsChanged === false, 'direct Wish overlay changed Stage 2 Hero relations');
check(directWishOverlay.semanticBoundary?.stage3FrozenArtifactsRecomputed === false, 'direct Wish overlay recomputed Stage 3 frozen artifacts');
check(directWishOverlay.semanticBoundary?.frontendRuntimeHeroFiltering === false, 'direct Wish overlay permits frontend runtime filtering');
check(directWishOverlay.semanticBoundary?.nameJoinUsed === false, 'direct Wish overlay used name JOIN');
check(directWishOverlay.semanticBoundary?.idArithmeticUsed === false, 'direct Wish overlay used ID arithmetic');
check(directWishOverlay.semanticBoundary?.unrelatedManualWishResolved === false, 'direct Wish overlay resolved unrelated manual Wish');

const routeTreeText = fs.readFileSync(contract.inputs.frontendRouteTree, 'utf8');
check(routeTreeText.includes("'/banners'"), 'route tree no longer contains /banners');
const routeText = fs.readFileSync('src/routes/banners.tsx', 'utf8');
for (const label of expected.frontend.sections) check(routeText.includes(label), `frontend section label missing: ${label}`);

console.log(contract.completionStatus);
