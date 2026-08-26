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

const routeTreeText = fs.readFileSync(contract.inputs.frontendRouteTree, 'utf8');
check(routeTreeText.includes("'/banners'"), 'route tree no longer contains /banners');
const routeText = fs.readFileSync('src/routes/banners.tsx', 'utf8');
for (const label of expected.frontend.sections) check(routeText.includes(label), `frontend section label missing: ${label}`);

console.log(contract.completionStatus);
