import fs from 'node:fs';
import crypto from 'node:crypto';

const CONTRACT_PATH = 'data/contracts/banner-stage3-0-input-contract.v1.json';
const SUMMARY_PATH = 'data/validation/banner-stage3-0-input-summary.v1.json';

const loadText = path => fs.readFileSync(path, 'utf8');
const load = path => JSON.parse(loadText(path));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const countBy = (rows, keyFn) => {
  const result = {};
  for (const row of rows) {
    const key = String(keyFn(row));
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
};
const exactObjectCounts = (actual, expected, label) => {
  for (const [key, value] of Object.entries(expected)) {
    check((actual[key] ?? 0) === value, `${label}: ${key} count ${(actual[key] ?? 0)} expected ${value}`);
  }
  const extras = Object.keys(actual).filter(key => !Object.prototype.hasOwnProperty.call(expected, key));
  check(extras.length === 0, `${label}: unexpected keys ${extras.join(',')}`);
};
const uniqueSet = (values, label) => {
  const set = new Set(values);
  check(set.size === values.length, `${label}: duplicate values`);
  return set;
};
const sameSet = (left, right, label) => {
  check(left.size === right.size, `${label}: size ${left.size} expected ${right.size}`);
  const missing = [...right].filter(value => !left.has(value));
  const extra = [...left].filter(value => !right.has(value));
  check(missing.length === 0 && extra.length === 0,
    `${label}: missing=${missing.join(',')} extra=${extra.join(',')}`);
};

const contract = load(CONTRACT_PATH);
const expected = contract.canonicalExpectations;
const manifestText = loadText(contract.manifest.path);
const manifest = JSON.parse(manifestText);

check(manifest.status === contract.manifest.status, `manifest status ${manifest.status}`);
check(manifest.representation === contract.manifest.representation, `manifest representation ${manifest.representation}`);

for (const [key, value] of Object.entries({
  bannerDefinitionCount: expected.bannerDefinitionCount,
  bannerOccurrenceCount: expected.bannerOccurrenceCount,
  mappedOccurrenceCount: expected.mappedOccurrenceCount,
  sourceLinkedDefinitionCount: expected.sourceLinkedDefinitionCount,
  manualOccurrenceScopedDefinitionCount: expected.manualOccurrenceScopedDefinitionCount,
  heroRelationEdgeCount: expected.heroRelationEdgeCount,
  cpRelatedDefinitionCount: expected.cpRelatedDefinitionCount,
  cpRelatedOccurrenceCount: expected.cpRelatedOccurrenceCount,
  repeatedDefinitionCount: expected.repeatedDefinitionCount,
  recurrenceLinkCount: expected.recurrenceLinkCount
})) {
  check(Number(manifest.population?.[key]) === value, `manifest population ${key} ${manifest.population?.[key]} expected ${value}`);
}

check(manifest.identityPolicy?.silentRegroupingAllowedAfterFreeze === false,
  'manifest identity policy unexpectedly allows silent regrouping');
check(manifest.identityPolicy?.identityChangeRequiresMigrationOrAliasCheckpoint === true,
  'manifest identity migration/alias checkpoint requirement missing');
for (const key of [
  'firstEverReleaseEstablished',
  'fixedCadenceEstablished',
  'canonicalEventIdsEstablished',
  'assetCanonicalizationEstablished',
  'frontendIntegrationEstablished'
]) {
  check(manifest.semanticBoundaries?.[key] === false, `manifest semantic boundary ${key} is no longer false`);
}

const manifestArtifacts = new Map((manifest.productionArtifacts ?? []).map(row => [row.role, row]));
check(manifestArtifacts.size === Object.keys(contract.productionArtifacts).length,
  `manifest production artifact role count ${manifestArtifacts.size}`);

const expectedArtifactCount = {
  canonicalDefinitions: expected.bannerDefinitionCount,
  occurrenceDefinitionMap: expected.mappedOccurrenceCount,
  canonicalOccurrences: expected.bannerOccurrenceCount,
  definitionTaxonomy: expected.bannerDefinitionCount,
  occurrenceTaxonomy: expected.bannerOccurrenceCount,
  heroRelations: expected.heroRelationEdgeCount,
  cpEventRelations: expected.cpRelatedDefinitionCount,
  recurrenceHistory: expected.bannerDefinitionCount
};

const loaded = {};
for (const [name, spec] of Object.entries(contract.productionArtifacts)) {
  const manifestArtifact = manifestArtifacts.get(spec.role);
  check(manifestArtifact, `${name}: manifest role ${spec.role} missing`);
  check(manifestArtifact.path === spec.path, `${name}: manifest path ${manifestArtifact.path}`);
  check(manifestArtifact.status === spec.status, `${name}: manifest status ${manifestArtifact.status}`);
  check(Number(manifestArtifact[spec.manifestCountField]) === expectedArtifactCount[name],
    `${name}: manifest count ${manifestArtifact[spec.manifestCountField]} expected ${expectedArtifactCount[name]}`);

  const text = loadText(spec.path);
  const data = JSON.parse(text);
  check(data.status === spec.status, `${name}: artifact status ${data.status}`);
  loaded[name] = { data, text, sha256: sha256(text) };
}

const definitions = loaded.canonicalDefinitions.data;
check(Number(definitions.recordCount) === expected.bannerDefinitionCount, 'definitions: recordCount mismatch');
check(Number(definitions.sourceLinkedDefinitionCount) === expected.sourceLinkedDefinitionCount,
  'definitions: sourceLinkedDefinitionCount mismatch');
check(Number(definitions.manualOccurrenceScopedDefinitionCount) === expected.manualOccurrenceScopedDefinitionCount,
  'definitions: manualOccurrenceScopedDefinitionCount mismatch');
check(Array.isArray(definitions.records) && definitions.records.length === expected.bannerDefinitionCount,
  'definitions: records length mismatch');

const definitionIds = uniqueSet(definitions.records.map(row => row.bannerDefinitionId), 'definitions IDs');
check([...definitionIds].every(id => /^bdef:v1:[0-9a-f]{24}$/.test(id)), 'definitions: invalid canonical ID format');
const sourceLinkedDefinitionCount = definitions.records.filter(row => row.effectiveSourceRecordKey != null).length;
const manualDefinitionIds = new Set(definitions.records
  .filter(row => row.effectiveSourceRecordKey == null)
  .map(row => row.bannerDefinitionId));
check(sourceLinkedDefinitionCount === expected.sourceLinkedDefinitionCount,
  `definitions: computed source-linked count ${sourceLinkedDefinitionCount}`);
check(manualDefinitionIds.size === expected.manualOccurrenceScopedDefinitionCount,
  `definitions: computed manual count ${manualDefinitionIds.size}`);

const definitionOccurrenceIds = [];
for (const row of definitions.records) {
  check(Array.isArray(row.occurrenceIds), `definitions: ${row.bannerDefinitionId} occurrenceIds missing`);
  check(Number(row.occurrenceCount) === row.occurrenceIds.length,
    `definitions: ${row.bannerDefinitionId} occurrenceCount mismatch`);
  definitionOccurrenceIds.push(...row.occurrenceIds);
}
const definitionOccurrenceSet = uniqueSet(definitionOccurrenceIds, 'definitions occurrence membership');
check(definitionOccurrenceSet.size === expected.bannerOccurrenceCount,
  `definitions: occurrence membership count ${definitionOccurrenceSet.size}`);

const occurrenceMap = loaded.occurrenceDefinitionMap.data;
check(Number(occurrenceMap.occurrenceCount) === expected.bannerOccurrenceCount, 'occurrence map: occurrenceCount mismatch');
check(Number(occurrenceMap.definitionCount) === expected.bannerDefinitionCount, 'occurrence map: definitionCount mismatch');
check(Array.isArray(occurrenceMap.records) && occurrenceMap.records.length === expected.mappedOccurrenceCount,
  'occurrence map: records length mismatch');
const mapOccurrenceIds = uniqueSet(occurrenceMap.records.map(row => row.bannerOccurrenceId), 'occurrence map IDs');
for (const row of occurrenceMap.records) {
  check(row.bannerOccurrenceId === `bocc:${row.recordKey}`, `occurrence map: malformed occurrence ID ${row.bannerOccurrenceId}`);
  check(definitionIds.has(row.bannerDefinitionId), `occurrence map: unknown definition ${row.bannerDefinitionId}`);
}
check(new Set(occurrenceMap.records.map(row => row.bannerDefinitionId)).size === expected.bannerDefinitionCount,
  'occurrence map: definition coverage mismatch');
sameSet(mapOccurrenceIds, definitionOccurrenceSet, 'occurrence map vs definition membership');
const definitionByOccurrence = new Map(occurrenceMap.records.map(row => [row.bannerOccurrenceId, row.bannerDefinitionId]));

const occurrences = loaded.canonicalOccurrences.data;
check(Number(occurrences.recordCount) === expected.bannerOccurrenceCount, 'occurrences: recordCount mismatch');
check(Number(occurrences.definitionCount) === expected.bannerDefinitionCount, 'occurrences: definitionCount mismatch');
check(Number(occurrences.sourceNullOccurrenceCount) === expected.manualOccurrenceScopedDefinitionCount,
  'occurrences: sourceNullOccurrenceCount mismatch');
check(Number(occurrences.correctedOccurrenceCount) === 1, 'occurrences: correctedOccurrenceCount mismatch');
check(Array.isArray(occurrences.records) && occurrences.records.length === expected.bannerOccurrenceCount,
  'occurrences: records length mismatch');
const occurrenceIds = uniqueSet(occurrences.records.map(row => row.bannerOccurrenceId), 'occurrence IDs');
sameSet(occurrenceIds, mapOccurrenceIds, 'occurrences vs occurrence map');

const displayStatusCounts = {};
let displayBlockCount = 0;
let nonNullImageFileCount = 0;
let nullImageFileCount = 0;
let sourceNullOccurrenceCount = 0;
let correctedOccurrenceCount = 0;
for (const row of occurrences.records) {
  check(definitionIds.has(row.bannerDefinitionId), `occurrences: unknown definition ${row.bannerDefinitionId}`);
  check(definitionByOccurrence.get(row.bannerOccurrenceId) === row.bannerDefinitionId,
    `occurrences: mapping mismatch ${row.bannerOccurrenceId}`);
  check(/^\d{4}-\d{2}-\d{2}$/.test(row.krDisplayDate), `occurrences: invalid krDisplayDate ${row.krDisplayDate}`);
  check(row.display && typeof row.display === 'object', `occurrences: display block missing ${row.bannerOccurrenceId}`);
  displayBlockCount += 1;
  const imageStatus = String(row.display.imageStatus ?? 'MISSING_STATUS');
  displayStatusCounts[imageStatus] = (displayStatusCounts[imageStatus] ?? 0) + 1;
  if (row.display.imageFile == null) nullImageFileCount += 1;
  else nonNullImageFileCount += 1;
  if (row.sourceRelation?.effectiveSourceRecordKey == null) sourceNullOccurrenceCount += 1;
  if (row.sourceRelation?.correctionStatus !== 'NONE') correctedOccurrenceCount += 1;
}
check(sourceNullOccurrenceCount === expected.manualOccurrenceScopedDefinitionCount,
  `occurrences: computed source-null count ${sourceNullOccurrenceCount}`);
check(correctedOccurrenceCount === 1, `occurrences: computed corrected count ${correctedOccurrenceCount}`);

const definitionTaxonomy = loaded.definitionTaxonomy.data;
check(Number(definitionTaxonomy.recordCount) === expected.bannerDefinitionCount,
  'definition taxonomy: recordCount mismatch');
check(Array.isArray(definitionTaxonomy.records) && definitionTaxonomy.records.length === expected.bannerDefinitionCount,
  'definition taxonomy: records length mismatch');
const definitionTaxonomyIds = uniqueSet(definitionTaxonomy.records.map(row => row.bannerDefinitionId), 'definition taxonomy IDs');
sameSet(definitionTaxonomyIds, definitionIds, 'definition taxonomy coverage');
exactObjectCounts(countBy(definitionTaxonomy.records, row => row.mechanicFamily),
  expected.definitionMechanicFamilies, 'definition taxonomy mechanicFamily');

const occurrenceTaxonomy = loaded.occurrenceTaxonomy.data;
check(Number(occurrenceTaxonomy.recordCount) === expected.bannerOccurrenceCount,
  'occurrence taxonomy: recordCount mismatch');
check(Number(occurrenceTaxonomy.definitionCount) === expected.bannerDefinitionCount,
  'occurrence taxonomy: definitionCount mismatch');
check(Array.isArray(occurrenceTaxonomy.records) && occurrenceTaxonomy.records.length === expected.bannerOccurrenceCount,
  'occurrence taxonomy: records length mismatch');
const occurrenceTaxonomyIds = uniqueSet(occurrenceTaxonomy.records.map(row => row.bannerOccurrenceId), 'occurrence taxonomy IDs');
sameSet(occurrenceTaxonomyIds, occurrenceIds, 'occurrence taxonomy coverage');
for (const row of occurrenceTaxonomy.records) {
  check(definitionByOccurrence.get(row.bannerOccurrenceId) === row.bannerDefinitionId,
    `occurrence taxonomy: definition mismatch ${row.bannerOccurrenceId}`);
}
exactObjectCounts(countBy(occurrenceTaxonomy.records, row => row.lifecycle),
  expected.occurrenceLifecycle, 'occurrence taxonomy lifecycle');

const heroRelations = loaded.heroRelations.data;
check(Number(heroRelations.definitionCount) === expected.bannerDefinitionCount, 'hero relations: definitionCount mismatch');
check(Number(heroRelations.edgeCount) === expected.heroRelationEdgeCount, 'hero relations: edgeCount mismatch');
check(Number(heroRelations.pickupHeroEdgeCount) === expected.pickupHeroEdgeCount,
  'hero relations: pickupHeroEdgeCount mismatch');
check(Number(heroRelations.wishCandidateHeroEdgeCount) === expected.wishCandidateHeroEdgeCount,
  'hero relations: wishCandidateHeroEdgeCount mismatch');
check(Number(heroRelations.sourceNullDefinitionCount) === expected.manualOccurrenceScopedDefinitionCount,
  'hero relations: sourceNullDefinitionCount mismatch');
check(Number(heroRelations.zeroEdgeDefinitionCount) === expected.manualOccurrenceScopedDefinitionCount,
  'hero relations: zeroEdgeDefinitionCount mismatch');
check(Number(heroRelations.unresolvedReferenceCount) === 0, 'hero relations: unresolved references present');
check(Array.isArray(heroRelations.definitionResults) && heroRelations.definitionResults.length === expected.bannerDefinitionCount,
  'hero relations: definitionResults length mismatch');
check(Array.isArray(heroRelations.edges) && heroRelations.edges.length === expected.heroRelationEdgeCount,
  'hero relations: edges length mismatch');
const heroResultIds = uniqueSet(heroRelations.definitionResults.map(row => row.bannerDefinitionId), 'hero relation definition IDs');
sameSet(heroResultIds, definitionIds, 'hero relation definition coverage');
const relationTypeCounts = countBy(heroRelations.edges, row => row.relationType);
exactObjectCounts(relationTypeCounts, {
  PICKUP_HERO: expected.pickupHeroEdgeCount,
  WISH_CANDIDATE_HERO: expected.wishCandidateHeroEdgeCount
}, 'hero relation types');
const heroEdgeKeys = [];
for (const edge of heroRelations.edges) {
  check(definitionIds.has(edge.bannerDefinitionId), `hero relations: unknown definition ${edge.bannerDefinitionId}`);
  check(Number.isInteger(Number(edge.heroId)), `hero relations: invalid heroId ${edge.heroId}`);
  check(!manualDefinitionIds.has(edge.bannerDefinitionId),
    `hero relations: synthetic manual edge leaked for ${edge.bannerDefinitionId}`);
  heroEdgeKeys.push(`${edge.bannerDefinitionId}|${edge.relationType}|${edge.heroId}`);
}
uniqueSet(heroEdgeKeys, 'hero relation composite keys');
for (const result of heroRelations.definitionResults.filter(row => manualDefinitionIds.has(row.bannerDefinitionId))) {
  check(Number(result.emittedEdgeCount) === 0,
    `hero relations: manual definition ${result.bannerDefinitionId} emitted edges`);
  check(result.approvedManualHeroIdMappingApplied === false,
    `hero relations: unapproved manual Hero mapping applied ${result.bannerDefinitionId}`);
}

const cpEvent = loaded.cpEventRelations.data;
check(Number(cpEvent.definitionCount) === expected.bannerDefinitionCount, 'CP/Event: definitionCount mismatch');
check(Number(cpEvent.cpRelatedDefinitionCount) === expected.cpRelatedDefinitionCount,
  'CP/Event: cpRelatedDefinitionCount mismatch');
check(Number(cpEvent.cpRelatedOccurrenceCount) === expected.cpRelatedOccurrenceCount,
  'CP/Event: cpRelatedOccurrenceCount mismatch');
check(Number(cpEvent.canonicalEventRelationCount) === expected.canonicalEventRelationCount,
  'CP/Event: canonicalEventRelationCount mismatch');
check(Array.isArray(cpEvent.definitionRelations) && cpEvent.definitionRelations.length === expected.cpRelatedDefinitionCount,
  'CP/Event: definitionRelations length mismatch');
check(Array.isArray(cpEvent.occurrenceProjections) && cpEvent.occurrenceProjections.length === expected.cpRelatedOccurrenceCount,
  'CP/Event: occurrenceProjections length mismatch');
const cpDefinitionIds = uniqueSet(cpEvent.definitionRelations.map(row => row.bannerDefinitionId), 'CP definition relation IDs');
for (const row of cpEvent.definitionRelations) {
  check(definitionIds.has(row.bannerDefinitionId), `CP/Event: unknown definition ${row.bannerDefinitionId}`);
  check(row.cpContext?.relationType === 'CP_RELATED', `CP/Event: invalid CP relation ${row.bannerDefinitionId}`);
  check(row.eventTextReference?.canonicalEventId == null,
    `CP/Event: canonical Event ID was silently introduced ${row.bannerDefinitionId}`);
  check(row.eventTextReference?.joinMethod === 'NONE',
    `CP/Event: unexpected Event join method ${row.bannerDefinitionId}`);
}
const cpOccurrenceIds = uniqueSet(cpEvent.occurrenceProjections.map(row => row.bannerOccurrenceId), 'CP occurrence projection IDs');
for (const row of cpEvent.occurrenceProjections) {
  check(occurrenceIds.has(row.bannerOccurrenceId), `CP/Event: unknown occurrence ${row.bannerOccurrenceId}`);
  check(cpDefinitionIds.has(row.bannerDefinitionId), `CP/Event: non-CP definition projection ${row.bannerDefinitionId}`);
  check(definitionByOccurrence.get(row.bannerOccurrenceId) === row.bannerDefinitionId,
    `CP/Event: occurrence-definition projection mismatch ${row.bannerOccurrenceId}`);
}
check(cpOccurrenceIds.size === expected.cpRelatedOccurrenceCount, 'CP/Event: occurrence projection coverage mismatch');

const history = loaded.recurrenceHistory.data;
check(history.historyScope === contract.semanticFreeze.historyScope, `history: scope ${history.historyScope}`);
check(Number(history.definitionCount) === expected.bannerDefinitionCount, 'history: definitionCount mismatch');
check(Number(history.occurrenceCount) === expected.bannerOccurrenceCount, 'history: occurrenceCount mismatch');
check(Number(history.repeatedDefinitionCount) === expected.repeatedDefinitionCount,
  'history: repeatedDefinitionCount mismatch');
check(Number(history.singleObservedDefinitionCount) === expected.singleObservedDefinitionCount,
  'history: singleObservedDefinitionCount mismatch');
check(Number(history.recurrenceLinkCount) === expected.recurrenceLinkCount,
  'history: recurrenceLinkCount mismatch');
check(history.firstEverReleaseEstablished === false, 'history: first-ever release was silently established');
check(history.fixedCadenceEstablished === false, 'history: fixed recurrence cadence was silently established');
check(Array.isArray(history.definitionHistories) && history.definitionHistories.length === expected.bannerDefinitionCount,
  'history: definitionHistories length mismatch');
const historyDefinitionIds = uniqueSet(history.definitionHistories.map(row => row.bannerDefinitionId), 'history definition IDs');
sameSet(historyDefinitionIds, definitionIds, 'history definition coverage');
let observedOccurrenceCount = 0;
let computedRepeatedDefinitions = 0;
let computedSingleDefinitions = 0;
let computedRecurrenceLinks = 0;
const historyOccurrenceIds = [];
for (const row of history.definitionHistories) {
  check(Array.isArray(row.observedOccurrences), `history: observedOccurrences missing ${row.bannerDefinitionId}`);
  check(Number(row.observedOccurrenceCount) === row.observedOccurrences.length,
    `history: observedOccurrenceCount mismatch ${row.bannerDefinitionId}`);
  observedOccurrenceCount += row.observedOccurrences.length;
  if (row.observedOccurrences.length > 1) computedRepeatedDefinitions += 1;
  else computedSingleDefinitions += 1;
  computedRecurrenceLinks += Math.max(0, row.observedOccurrences.length - 1);
  for (const occurrence of row.observedOccurrences) {
    check(occurrenceIds.has(occurrence.bannerOccurrenceId),
      `history: unknown occurrence ${occurrence.bannerOccurrenceId}`);
    check(definitionByOccurrence.get(occurrence.bannerOccurrenceId) === row.bannerDefinitionId,
      `history: occurrence belongs to another definition ${occurrence.bannerOccurrenceId}`);
    historyOccurrenceIds.push(occurrence.bannerOccurrenceId);
  }
}
check(observedOccurrenceCount === expected.bannerOccurrenceCount,
  `history: observed occurrence total ${observedOccurrenceCount}`);
check(computedRepeatedDefinitions === expected.repeatedDefinitionCount,
  `history: computed repeated definitions ${computedRepeatedDefinitions}`);
check(computedSingleDefinitions === expected.singleObservedDefinitionCount,
  `history: computed single definitions ${computedSingleDefinitions}`);
check(computedRecurrenceLinks === expected.recurrenceLinkCount,
  `history: computed recurrence links ${computedRecurrenceLinks}`);
const historyOccurrenceSet = uniqueSet(historyOccurrenceIds, 'history occurrence IDs');
sameSet(historyOccurrenceSet, occurrenceIds, 'history occurrence coverage');

const summary = {
  stage: '3-0',
  status: contract.completion.validatorStatus,
  manifest: {
    path: contract.manifest.path,
    sha256: sha256(manifestText),
    status: manifest.status,
    representation: manifest.representation
  },
  canonicalPopulation: {
    definitions: definitionIds.size,
    occurrences: occurrenceIds.size,
    occurrenceDefinitionMappings: mapOccurrenceIds.size,
    sourceLinkedDefinitions: sourceLinkedDefinitionCount,
    manualOccurrenceScopedDefinitions: manualDefinitionIds.size
  },
  taxonomy: {
    definitionMechanicFamilies: countBy(definitionTaxonomy.records, row => row.mechanicFamily),
    occurrenceLifecycle: countBy(occurrenceTaxonomy.records, row => row.lifecycle)
  },
  heroRelations: {
    edges: heroRelations.edges.length,
    relationTypes: relationTypeCounts,
    unresolvedReferences: Number(heroRelations.unresolvedReferenceCount),
    syntheticManualHeroEdges: heroRelations.edges.filter(edge => manualDefinitionIds.has(edge.bannerDefinitionId)).length
  },
  cpEventRelations: {
    cpDefinitions: cpDefinitionIds.size,
    cpOccurrences: cpOccurrenceIds.size,
    canonicalEventRelations: Number(cpEvent.canonicalEventRelationCount),
    eventReferenceMode: 'TEXT_REFERENCE_ONLY'
  },
  recurrenceHistory: {
    definitions: historyDefinitionIds.size,
    observedOccurrences: observedOccurrenceCount,
    repeatedDefinitions: computedRepeatedDefinitions,
    singleObservedDefinitions: computedSingleDefinitions,
    recurrenceLinks: computedRecurrenceLinks,
    firstEverReleaseEstablished: history.firstEverReleaseEstablished,
    fixedCadenceEstablished: history.fixedCadenceEstablished
  },
  displayProvenanceHandoff: {
    occurrenceDisplayBlocks: displayBlockCount,
    imageFileNonNull: nonNullImageFileCount,
    imageFileNull: nullImageFileCount,
    imageStatusCounts: displayStatusCounts,
    interpretation: 'PROVENANCE_ONLY_NOT_CANONICAL_ASSET_IDENTITY'
  },
  artifactSha256: Object.fromEntries(Object.entries(loaded).map(([name, value]) => [name, value.sha256])),
  semanticFreeze: {
    stage2IdentityReopened: false,
    stage2RelationsRecomputed: false,
    canonicalEventIdsIntroduced: false,
    assetCanonicalizationEstablished: false,
    futureRecurrencePredicted: false
  },
  nextStage: contract.consumerPolicy.nextStage
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
