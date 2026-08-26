import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const write = (p, v) => {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(v, null, 2) + '\n');
};
const gapDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const contract = read('data/contracts/banner-stage2-8-freeze-contract.v1.json');
const manifest = read('data/generated/banner-stage2-production-manifest.v1.json');
const stageSummaries = [
  read('data/validation/banner-stage2-0-input-summary.v1.json'),
  read('data/validation/banner-stage2-1-summary.v1.json'),
  read('data/validation/banner-stage2-2-summary.v1.json'),
  read('data/validation/banner-stage2-3-summary.v1.json'),
  read('data/validation/banner-stage2-4-summary.v1.json'),
  read('data/validation/banner-stage2-5-summary.v1.json'),
  read('data/validation/banner-stage2-6-summary.v1.json'),
  read('data/validation/banner-stage2-7-summary.v1.json')
];
const definitionsDoc = read('data/generated/banner-definitions.v1.json');
const mappingDoc = read('data/generated/banner-occurrence-definition-map.v1.json');
const occurrencesDoc = read('data/generated/banner-occurrences.v1.json');
const defTaxDoc = read('data/generated/banner-definition-taxonomy.v1.json');
const occTaxDoc = read('data/generated/banner-occurrence-taxonomy.v1.json');
const heroDoc = read('data/generated/banner-definition-hero-relations.v1.json');
const heroMaster = read('data/hero-name-master.v1.json');
const cpDoc = read('data/generated/banner-cp-event-relations.v1.json');
const historyDoc = read('data/generated/banner-recurrence-history.v1.json');

const errors = [];
const fail = msg => errors.push(msg);

if (contract.status !== 'FREEZE_CONTRACT_FROZEN') fail(`contract-status:${contract.status}`);
if (manifest.status !== 'BANNER_STAGE2_PRODUCTION_MANIFEST_MATERIALIZED') fail(`manifest-status:${manifest.status}`);

const expectedStatuses = contract.predecessorStages.map(x => x.expectedStatus);
stageSummaries.forEach((s, i) => {
  if (s.status !== expectedStatuses[i]) fail(`predecessor-status:${i}:${s.status}:${expectedStatuses[i]}`);
  if ((s.errorCount ?? 0) !== 0) fail(`predecessor-errors:${i}:${s.errorCount}`);
});

const definitions = definitionsDoc.records ?? [];
const mappings = mappingDoc.records ?? [];
const occurrences = occurrencesDoc.records ?? [];
const defTax = defTaxDoc.records ?? [];
const occTax = occTaxDoc.records ?? [];
const heroResults = heroDoc.definitionResults ?? [];
const heroEdges = heroDoc.edges ?? [];
const heroIds = new Set((heroMaster.records ?? []).map(x => x.heroId));
const cpRelations = cpDoc.definitionRelations ?? [];
const cpProjections = cpDoc.occurrenceProjections ?? [];
const histories = historyDoc.definitionHistories ?? [];

if (definitions.length !== 77 || definitionsDoc.recordCount !== 77) fail(`definition-count:${definitions.length}`);
if (occurrences.length !== 94 || occurrencesDoc.recordCount !== 94) fail(`occurrence-count:${occurrences.length}`);
if (mappings.length !== 94 || mappingDoc.occurrenceCount !== 94) fail(`mapping-count:${mappings.length}`);
if (definitionsDoc.sourceLinkedDefinitionCount !== 69) fail(`source-linked-definition-count:${definitionsDoc.sourceLinkedDefinitionCount}`);
if (definitionsDoc.manualOccurrenceScopedDefinitionCount !== 8) fail(`manual-definition-count:${definitionsDoc.manualOccurrenceScopedDefinitionCount}`);

const defById = new Map();
for (const d of definitions) {
  if (defById.has(d.bannerDefinitionId)) fail(`duplicate-definition:${d.bannerDefinitionId}`);
  defById.set(d.bannerDefinitionId, d);
}
const occById = new Map();
const occByKey = new Map();
for (const o of occurrences) {
  if (occById.has(o.bannerOccurrenceId)) fail(`duplicate-occurrence-id:${o.bannerOccurrenceId}`);
  if (occByKey.has(o.sourceOccurrenceKey)) fail(`duplicate-occurrence-key:${o.sourceOccurrenceKey}`);
  occById.set(o.bannerOccurrenceId, o);
  occByKey.set(o.sourceOccurrenceKey, o);
  if (!defById.has(o.bannerDefinitionId)) fail(`occurrence-unresolved-definition:${o.bannerOccurrenceId}`);
}

const mapByKey = new Map();
for (const m of mappings) {
  if (mapByKey.has(m.recordKey)) fail(`duplicate-mapping:${m.recordKey}`);
  mapByKey.set(m.recordKey, m);
  const o = occByKey.get(m.recordKey);
  if (!o) { fail(`mapping-missing-occurrence:${m.recordKey}`); continue; }
  if (m.bannerOccurrenceId !== o.bannerOccurrenceId) fail(`mapping-occurrence-id:${m.recordKey}`);
  if (m.bannerDefinitionId !== o.bannerDefinitionId) fail(`mapping-definition-id:${m.recordKey}`);
  if ((m.recordedSourceRecordKey ?? null) !== (o.sourceRelation?.recordedSourceRecordKey ?? null)) fail(`mapping-recorded-source:${m.recordKey}`);
  if ((m.effectiveSourceRecordKey ?? null) !== (o.sourceRelation?.effectiveSourceRecordKey ?? null)) fail(`mapping-effective-source:${m.recordKey}`);
}
if (mapByKey.size !== 94) fail(`mapping-unique-count:${mapByKey.size}`);

let definitionMembershipCount = 0;
const occurrenceMembership = new Map();
for (const d of definitions) {
  if (d.occurrenceCount !== d.occurrenceIds.length || d.occurrenceCount !== d.occurrenceRecordKeys.length) fail(`definition-membership-count:${d.bannerDefinitionId}`);
  if (d.occurrenceCount < 1) fail(`empty-definition:${d.bannerDefinitionId}`);
  definitionMembershipCount += d.occurrenceCount;
  for (let i = 0; i < d.occurrenceIds.length; i++) {
    const oid = d.occurrenceIds[i];
    const key = d.occurrenceRecordKeys[i];
    const o = occById.get(oid);
    if (!o) { fail(`definition-unknown-occurrence:${d.bannerDefinitionId}:${oid}`); continue; }
    if (o.sourceOccurrenceKey !== key) fail(`definition-occurrence-key:${d.bannerDefinitionId}:${oid}`);
    if (o.bannerDefinitionId !== d.bannerDefinitionId) fail(`definition-occurrence-backref:${d.bannerDefinitionId}:${oid}`);
    occurrenceMembership.set(oid, (occurrenceMembership.get(oid) ?? 0) + 1);
  }
}
if (definitionMembershipCount !== 94) fail(`definition-membership-total:${definitionMembershipCount}`);
for (const o of occurrences) if ((occurrenceMembership.get(o.bannerOccurrenceId) ?? 0) !== 1) fail(`occurrence-definition-cardinality:${o.bannerOccurrenceId}:${occurrenceMembership.get(o.bannerOccurrenceId) ?? 0}`);

const defTaxById = new Map();
for (const x of defTax) {
  if (defTaxById.has(x.bannerDefinitionId)) fail(`duplicate-definition-taxonomy:${x.bannerDefinitionId}`);
  defTaxById.set(x.bannerDefinitionId, x);
  if (!defById.has(x.bannerDefinitionId)) fail(`taxonomy-unknown-definition:${x.bannerDefinitionId}`);
}
if (defTaxById.size !== 77) fail(`definition-taxonomy-count:${defTaxById.size}`);
for (const d of definitions) if (!defTaxById.has(d.bannerDefinitionId)) fail(`definition-taxonomy-missing:${d.bannerDefinitionId}`);

const occTaxById = new Map();
for (const x of occTax) {
  if (occTaxById.has(x.bannerOccurrenceId)) fail(`duplicate-occurrence-taxonomy:${x.bannerOccurrenceId}`);
  occTaxById.set(x.bannerOccurrenceId, x);
  const o = occById.get(x.bannerOccurrenceId);
  if (!o) { fail(`taxonomy-unknown-occurrence:${x.bannerOccurrenceId}`); continue; }
  if (x.bannerDefinitionId !== o.bannerDefinitionId) fail(`occurrence-taxonomy-definition:${x.bannerOccurrenceId}`);
}
if (occTaxById.size !== 94) fail(`occurrence-taxonomy-count:${occTaxById.size}`);
for (const o of occurrences) if (!occTaxById.has(o.bannerOccurrenceId)) fail(`occurrence-taxonomy-missing:${o.bannerOccurrenceId}`);

const heroResultByDef = new Map();
for (const r of heroResults) {
  if (heroResultByDef.has(r.bannerDefinitionId)) fail(`duplicate-hero-result:${r.bannerDefinitionId}`);
  heroResultByDef.set(r.bannerDefinitionId, r);
  if (!defById.has(r.bannerDefinitionId)) fail(`hero-result-unknown-definition:${r.bannerDefinitionId}`);
}
if (heroResultByDef.size !== 77) fail(`hero-result-count:${heroResultByDef.size}`);
if (heroEdges.length !== 600 || heroDoc.edgeCount !== 600) fail(`hero-edge-count:${heroEdges.length}`);
if ((heroDoc.unresolvedReferences ?? []).length !== 0 || heroDoc.unresolvedReferenceCount !== 0) fail('hero-unresolved-reference');
for (const e of heroEdges) {
  if (!defById.has(e.bannerDefinitionId)) fail(`hero-edge-unknown-definition:${e.bannerDefinitionId}`);
  if (!heroIds.has(e.heroId)) fail(`hero-edge-unknown-hero:${e.bannerDefinitionId}:${e.heroId}`);
  if (!['PICKUP_HERO','WISH_CANDIDATE_HERO'].includes(e.relationType)) fail(`hero-edge-relation-type:${e.relationType}`);
}
const manualDefs = definitions.filter(d => d.sourceKind === 'MANUAL_OCCURRENCE_SCOPED');
if (manualDefs.length !== 8) fail(`manual-definitions:${manualDefs.length}`);
for (const d of manualDefs) {
  if (d.occurrenceCount !== 1) fail(`manual-definition-not-occurrence-scoped:${d.bannerDefinitionId}`);
  const r = heroResultByDef.get(d.bannerDefinitionId);
  if (!r || r.emittedEdgeCount !== 0) fail(`manual-definition-hero-edge:${d.bannerDefinitionId}`);
}

if (cpRelations.length !== 4 || cpDoc.cpRelatedDefinitionCount !== 4) fail(`cp-definition-count:${cpRelations.length}`);
if (cpProjections.length !== 4 || cpDoc.cpRelatedOccurrenceCount !== 4) fail(`cp-occurrence-count:${cpProjections.length}`);
if (cpDoc.canonicalEventRelationCount !== 0) fail(`canonical-event-relation-count:${cpDoc.canonicalEventRelationCount}`);
const cpDefIds = new Set();
for (const r of cpRelations) {
  if (!defById.has(r.bannerDefinitionId)) fail(`cp-unknown-definition:${r.bannerDefinitionId}`);
  if (r.cpContext?.relationType !== 'CP_RELATED') fail(`cp-relation-type:${r.bannerDefinitionId}`);
  if (r.cpContext?.evidenceSourceField !== 'CardPoolDetailDesc') fail(`cp-evidence-field:${r.bannerDefinitionId}`);
  if (!r.cpContext?.evidenceText) fail(`cp-evidence-text:${r.bannerDefinitionId}`);
  const ev = r.eventTextReference;
  if (!ev || ev.relationType !== 'CP_EVENT_TEXT_REFERENCE') fail(`cp-event-reference:${r.bannerDefinitionId}`);
  if (ev?.canonicalEventId !== null || ev?.joinMethod !== 'NONE') fail(`canonical-event-synthesized:${r.bannerDefinitionId}`);
  cpDefIds.add(r.bannerDefinitionId);
}
for (const p of cpProjections) {
  const o = occById.get(p.bannerOccurrenceId);
  if (!o) { fail(`cp-projection-unknown-occurrence:${p.bannerOccurrenceId}`); continue; }
  if (o.bannerDefinitionId !== p.bannerDefinitionId) fail(`cp-projection-definition:${p.bannerOccurrenceId}`);
  if (!cpDefIds.has(p.bannerDefinitionId)) fail(`cp-projection-no-definition-relation:${p.bannerOccurrenceId}`);
  if (p.relationType !== 'CP_RELATED' || p.derivedFromDefinitionRelation !== true) fail(`cp-projection-shape:${p.bannerOccurrenceId}`);
}

const historyByDef = new Map();
const historyOccCoverage = new Map();
let recomputedLinks = 0;
let repeatedDefinitionCount = 0;
for (const h of histories) {
  if (historyByDef.has(h.bannerDefinitionId)) fail(`duplicate-history:${h.bannerDefinitionId}`);
  historyByDef.set(h.bannerDefinitionId, h);
  const d = defById.get(h.bannerDefinitionId);
  if (!d) { fail(`history-unknown-definition:${h.bannerDefinitionId}`); continue; }
  if (h.historyScope !== 'CURRENT_CANONICAL_KR_SCHEDULE_DATASET') fail(`history-scope:${h.bannerDefinitionId}`);
  if (h.observedOccurrenceCount !== d.occurrenceCount || h.observedOccurrences.length !== d.occurrenceCount) fail(`history-count:${h.bannerDefinitionId}`);
  if (h.observedOccurrenceCount > 1) repeatedDefinitionCount++;
  recomputedLinks += Math.max(0, h.observedOccurrenceCount - 1);
  const expected = d.occurrenceIds.map(id => occById.get(id)).filter(Boolean).sort((a,b) => a.krDisplayDate.localeCompare(b.krDisplayDate) || a.displayOrder - b.displayOrder || a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const x = h.observedOccurrences[i];
    if (!x || x.bannerOccurrenceId !== e.bannerOccurrenceId) { fail(`history-order:${h.bannerDefinitionId}:${i}`); continue; }
    historyOccCoverage.set(x.bannerOccurrenceId, (historyOccCoverage.get(x.bannerOccurrenceId) ?? 0) + 1);
    if (x.appearanceIndex !== i + 1) fail(`history-index:${x.bannerOccurrenceId}`);
    const prev = i > 0 ? expected[i-1] : null;
    const next = i < expected.length - 1 ? expected[i+1] : null;
    if (x.previousObservedOccurrenceId !== (prev?.bannerOccurrenceId ?? null)) fail(`history-prev:${x.bannerOccurrenceId}`);
    if (x.nextObservedOccurrenceId !== (next?.bannerOccurrenceId ?? null)) fail(`history-next:${x.bannerOccurrenceId}`);
    if (x.previousObservedGapDays !== (prev ? gapDays(prev.krDisplayDate, e.krDisplayDate) : null)) fail(`history-prev-gap:${x.bannerOccurrenceId}`);
    if (x.nextObservedGapDays !== (next ? gapDays(e.krDisplayDate, next.krDisplayDate) : null)) fail(`history-next-gap:${x.bannerOccurrenceId}`);
  }
}
if (historyByDef.size !== 77) fail(`history-definition-count:${historyByDef.size}`);
for (const o of occurrences) if ((historyOccCoverage.get(o.bannerOccurrenceId) ?? 0) !== 1) fail(`history-occurrence-coverage:${o.bannerOccurrenceId}:${historyOccCoverage.get(o.bannerOccurrenceId) ?? 0}`);
if (repeatedDefinitionCount !== 11 || historyDoc.repeatedDefinitionCount !== 11) fail(`history-repeated-count:${repeatedDefinitionCount}`);
if (recomputedLinks !== 17 || historyDoc.recurrenceLinkCount !== 17) fail(`history-link-count:${recomputedLinks}`);
if (historyDoc.firstEverReleaseEstablished !== false) fail('history-first-ever-inferred');
if (historyDoc.fixedCadenceEstablished !== false) fail('history-fixed-cadence-inferred');

const forbiddenHistoryKeys = new Set(['nextExpectedDate','firstEverReleaseDate','endDate','duration','timezone','timeOfDay','openingTimestamp','closingTimestamp','forecastDate','predictedDate']);
const scanForbidden = (v, p='history') => {
  if (Array.isArray(v)) return v.forEach((x,i) => scanForbidden(x, `${p}[${i}]`));
  if (!v || typeof v !== 'object') return;
  for (const [k,x] of Object.entries(v)) {
    if (forbiddenHistoryKeys.has(k)) fail(`forbidden-history-field:${p}.${k}`);
    scanForbidden(x, `${p}.${k}`);
  }
};
scanForbidden(historyDoc);

const corrected = occByKey.get('kr-banner:20270331:4');
const earlier = occByKey.get('kr-banner:20261007:8');
if (!corrected || !earlier) fail('corrected-7001-fixture-missing');
else {
  if (corrected.sourceRelation?.recordedSourceRecordKey !== 'cardpool:263') fail('corrected-7001-recorded-source');
  if (corrected.sourceRelation?.effectiveSourceRecordKey !== 'cardpool:265') fail('corrected-7001-effective-source');
  if (corrected.bannerDefinitionId !== earlier.bannerDefinitionId) fail('corrected-7001-definition-continuity');
}

const expectedPopulation = contract.requiredPopulation;
for (const [k,v] of Object.entries(expectedPopulation)) {
  if (manifest.population[k] !== v) fail(`manifest-population:${k}:${manifest.population[k]}:${v}`);
}
if (manifest.semanticBoundaries?.firstEverReleaseEstablished !== false) fail('manifest-first-ever-boundary');
if (manifest.semanticBoundaries?.fixedCadenceEstablished !== false) fail('manifest-cadence-boundary');
if (manifest.semanticBoundaries?.canonicalEventIdsEstablished !== false) fail('manifest-event-boundary');
if (manifest.identityPolicy?.silentRegroupingAllowedAfterFreeze !== false) fail('manifest-silent-regrouping');
if (manifest.identityPolicy?.identityChangeRequiresMigrationOrAliasCheckpoint !== true) fail('manifest-migration-policy');

const identityErrors = errors.filter(e => /definition|occurrence|mapping|taxonomy|hero-edge-unknown-definition|cp-.*definition|history-.*definition/.test(e));
const relationErrors = errors.filter(e => /hero|cp-|canonical-event/.test(e));
const historyErrors = errors.filter(e => /history|recurrence|cadence|first-ever|forbidden-history/.test(e));

const summary = {
  version: 1,
  stage: 'Banner Stage 2-8',
  status: errors.length === 0 ? 'PASS_BANNER_STAGE2_FINAL_FREEZE' : 'FAIL_BANNER_STAGE2_FINAL_FREEZE',
  validationMode: 'EXECUTED_WHOLE_STAGE_CROSS_STAGE_REGRESSION',
  predecessorStageCount: stageSummaries.length,
  definitionCount: definitions.length,
  occurrenceCount: occurrences.length,
  mappedOccurrenceCount: mappings.length,
  definitionTaxonomyCount: defTaxById.size,
  occurrenceTaxonomyCount: occTaxById.size,
  heroRelationEdgeCount: heroEdges.length,
  cpRelatedDefinitionCount: cpRelations.length,
  cpRelatedOccurrenceCount: cpProjections.length,
  repeatedDefinitionCount,
  recurrenceLinkCount: recomputedLinks,
  manualOccurrenceScopedDefinitionCount: manualDefs.length,
  identityErrorCount: identityErrors.length,
  relationErrorCount: relationErrors.length,
  historyErrorCount: historyErrors.length,
  errorCount: errors.length,
  errors,
  invariants: {
    allPredecessorCheckpointsPass: stageSummaries.every((s,i) => s.status === expectedStatuses[i] && (s.errorCount ?? 0) === 0),
    canonicalDefinitionPopulation77: definitions.length === 77 && defById.size === 77,
    canonicalOccurrencePopulation94: occurrences.length === 94 && occById.size === 94,
    occurrenceDefinitionMappingExactlyOne: mapByKey.size === 94 && definitionMembershipCount === 94 && occurrences.every(o => occurrenceMembership.get(o.bannerOccurrenceId) === 1),
    allDefinitionsTaxonomized: defTaxById.size === 77,
    allOccurrencesTaxonomized: occTaxById.size === 94,
    heroRelationsResolveCanonicalDefinitionsAndHeroes: heroEdges.length === 600 && heroEdges.every(e => defById.has(e.bannerDefinitionId) && heroIds.has(e.heroId)),
    manualDefinitionsRemainOccurrenceScopedAndHeroUnlinked: manualDefs.length === 8 && manualDefs.every(d => d.occurrenceCount === 1 && heroResultByDef.get(d.bannerDefinitionId)?.emittedEdgeCount === 0),
    cpRelationsExplicitAndEventTextOnly: cpRelations.length === 4 && cpRelations.every(r => r.cpContext?.evidenceSourceField === 'CardPoolDetailDesc' && r.eventTextReference?.canonicalEventId === null && r.eventTextReference?.joinMethod === 'NONE'),
    allDefinitionsHaveHistory: historyByDef.size === 77,
    allOccurrencesHaveHistoryCoverageExactlyOnce: occurrences.every(o => historyOccCoverage.get(o.bannerOccurrenceId) === 1),
    corrected7001ContinuityPreserved: Boolean(corrected && earlier && corrected.sourceRelation?.recordedSourceRecordKey === 'cardpool:263' && corrected.sourceRelation?.effectiveSourceRecordKey === 'cardpool:265' && corrected.bannerDefinitionId === earlier.bannerDefinitionId),
    firstEverReleaseNotInferred: historyDoc.firstEverReleaseEstablished === false,
    fixedCadenceNotInferred: historyDoc.fixedCadenceEstablished === false,
    futureRecurrenceNotPredicted: !errors.some(e => e.startsWith('forbidden-history-field')),
    productionManifestReferencesWithoutDuplicatingLargeData: manifest.representation === 'REFERENCE_MANIFEST_NO_LARGE_DATA_DUPLICATION',
    silentIdentityRegroupingDisabled: manifest.identityPolicy?.silentRegroupingAllowedAfterFreeze === false
  },
  completion: {
    wholeStageRegressionPassed: errors.length === 0,
    productionManifestMaterialized: manifest.status === 'BANNER_STAGE2_PRODUCTION_MANIFEST_MATERIALIZED',
    bannerStage2Frozen: errors.length === 0,
    nextStageReady: errors.length === 0
  },
  nextStartPoint: manifest.nextStartPoint
};

const checkpoint = {
  version: 1,
  stage: 'Banner Stage 2',
  status: errors.length === 0 ? 'BANNER_STAGE2_FROZEN_READY_FOR_STAGE3' : 'BANNER_STAGE2_FREEZE_BLOCKED',
  frozenAtStage: 'Banner Stage 2-8',
  validationStatus: summary.status,
  completedScope: {
    canonicalDefinitionCount: definitions.length,
    canonicalOccurrenceCount: occurrences.length,
    sourceLinkedDefinitionCount: definitionsDoc.sourceLinkedDefinitionCount,
    manualOccurrenceScopedDefinitionCount: manualDefs.length,
    heroRelationEdgeCount: heroEdges.length,
    cpRelatedDefinitionCount: cpRelations.length,
    repeatedDefinitionCount,
    recurrenceLinkCount: recomputedLinks,
    errorCount: errors.length
  },
  frozenCanonicalOutputs: contract.canonicalProductionOutputs,
  frozenIdentityRules: manifest.identityPolicy,
  preservedUnknownsAndDeferrals: contract.deferredBoundaries,
  regressionBasis: {
    predecessorStages: contract.predecessorStages,
    wholeStageValidation: 'data/validation/banner-stage2-8-summary.v1.json',
    productionManifest: 'data/generated/banner-stage2-production-manifest.v1.json'
  },
  changePolicy: {
    strongerContradictorySourceMayReopen: true,
    semanticModelChangeMayReopen: true,
    silentCanonicalRegroupingAllowed: false,
    identityChangeRequiresExplicitMigrationOrAliasCheckpoint: true
  },
  nextStartPoint: manifest.nextStartPoint
};

write('data/validation/banner-stage2-8-summary.v1.json', summary);
write('data/checkpoints/banner-stage2-8-freeze.v1.json', checkpoint);
console.log(JSON.stringify({ status: summary.status, errorCount: summary.errorCount, definitionCount: summary.definitionCount, occurrenceCount: summary.occurrenceCount, heroRelationEdgeCount: summary.heroRelationEdgeCount, repeatedDefinitionCount: summary.repeatedDefinitionCount, recurrenceLinkCount: summary.recurrenceLinkCount }, null, 2));
if (errors.length) process.exit(1);
