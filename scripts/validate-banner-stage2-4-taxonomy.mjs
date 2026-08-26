import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const writeJson = (p, value) => {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n');
};

const stage23 = readJson('data/validation/banner-stage2-3-summary.v1.json');
const contract = readJson('data/contracts/banner-stage2-4-taxonomy-contract.v1.json');
const definitionsDoc = readJson('data/generated/banner-definitions.v1.json');
const occurrencesDoc = readJson('data/generated/banner-occurrences.v1.json');
const definitionTaxonomyDoc = readJson('data/generated/banner-definition-taxonomy.v1.json');
const occurrenceTaxonomyDoc = readJson('data/generated/banner-occurrence-taxonomy.v1.json');
const scheduleDoc = readJson('data/kr-banner-schedule.v1.json');

const errors = [];
const definitions = definitionsDoc.records ?? [];
const occurrences = occurrencesDoc.records ?? [];
const definitionTaxonomy = definitionTaxonomyDoc.records ?? [];
const occurrenceTaxonomy = occurrenceTaxonomyDoc.records ?? [];
const schedule = scheduleDoc.records ?? [];

if (stage23.status !== 'PASS_STAGE2_3_CANONICAL_OCCURRENCE_MATERIALIZATION') errors.push(`Stage 2-3 not PASS: ${stage23.status}`);
if (contract.status !== 'TAXONOMY_CONTRACT_FROZEN') errors.push(`Taxonomy contract not frozen: ${contract.status}`);
if (definitions.length !== 77) errors.push(`Definition population expected 77, got ${definitions.length}`);
if (occurrences.length !== 94) errors.push(`Occurrence population expected 94, got ${occurrences.length}`);
if (definitionTaxonomy.length !== 77) errors.push(`Definition taxonomy expected 77, got ${definitionTaxonomy.length}`);
if (occurrenceTaxonomy.length !== 94) errors.push(`Occurrence taxonomy expected 94, got ${occurrenceTaxonomy.length}`);

const byDefinitionTaxonomy = new Map(definitionTaxonomy.map(x => [x.bannerDefinitionId, x]));
const byOccurrenceTaxonomy = new Map(occurrenceTaxonomy.map(x => [x.bannerOccurrenceId, x]));
const byOccurrence = new Map(occurrences.map(x => [x.bannerOccurrenceId, x]));
const scheduleByKey = new Map(schedule.map(x => [x.recordKey, x]));

if (byDefinitionTaxonomy.size !== definitionTaxonomy.length) errors.push('Duplicate bannerDefinitionId in definition taxonomy');
if (byOccurrenceTaxonomy.size !== occurrenceTaxonomy.length) errors.push('Duplicate bannerOccurrenceId in occurrence taxonomy');

const allowedMechanic = new Set(['PICKUP','WISH','SPECIAL']);
const allowedCardinality = new Set(['SINGLE','DUAL','TRIPLE','MULTI','NOT_APPLICABLE']);
const allowedLifecycle = new Set(['NEW','RERUN','FIRST_OBSERVED_IN_CURRENT_DATASET']);
const allowedContext = new Set(['CP_RELATED','COLLAB']);
const allowedProvenance = new Set(['MANUAL_KR','LEGACY_REUSE']);
const allowedValidation = new Set(['SOURCE_CONFLICT']);

for (const d of definitions) {
  const tax = byDefinitionTaxonomy.get(d.bannerDefinitionId);
  if (!tax) {
    errors.push(`Missing taxonomy for definition ${d.bannerDefinitionId}`);
    continue;
  }
  if (!allowedMechanic.has(tax.mechanicFamily)) errors.push(`Invalid mechanicFamily ${tax.mechanicFamily} for ${d.bannerDefinitionId}`);
  if (!allowedCardinality.has(tax.pickupCardinality)) errors.push(`Invalid pickupCardinality ${tax.pickupCardinality} for ${d.bannerDefinitionId}`);
  if (tax.mechanicFamily === 'WISH' && tax.pickupCardinality !== 'NOT_APPLICABLE') errors.push(`Wish definition cardinality must be NOT_APPLICABLE: ${d.bannerDefinitionId}`);
  if (tax.mechanicFamily === 'PICKUP' && !['SINGLE','DUAL','TRIPLE','MULTI'].includes(tax.pickupCardinality)) errors.push(`Pickup definition cardinality invalid: ${d.bannerDefinitionId}`);
}

const occurrencesByDefinition = new Map();
for (const o of occurrences) {
  if (!occurrencesByDefinition.has(o.bannerDefinitionId)) occurrencesByDefinition.set(o.bannerDefinitionId, []);
  occurrencesByDefinition.get(o.bannerDefinitionId).push(o);
}
for (const rows of occurrencesByDefinition.values()) rows.sort((a,b) => a.krDisplayDate.localeCompare(b.krDisplayDate) || a.displayOrder - b.displayOrder || a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));

let identityMismatchCount = 0;
let lifecycleMismatchCount = 0;
let contextTagCount = 0;
let provenanceMismatchCount = 0;
let validationMismatchCount = 0;

for (const [definitionId, rows] of occurrencesByDefinition) {
  rows.forEach((o, index) => {
    const tax = byOccurrenceTaxonomy.get(o.bannerOccurrenceId);
    if (!tax) {
      errors.push(`Missing taxonomy for occurrence ${o.bannerOccurrenceId}`);
      return;
    }
    if (tax.bannerDefinitionId !== o.bannerDefinitionId) {
      identityMismatchCount += 1;
      errors.push(`Definition identity changed for ${o.bannerOccurrenceId}`);
    }
    if (!allowedLifecycle.has(tax.lifecycle)) errors.push(`Invalid lifecycle ${tax.lifecycle} for ${o.bannerOccurrenceId}`);
    for (const tag of tax.contextTags ?? []) if (!allowedContext.has(tag)) errors.push(`Invalid context tag ${tag} for ${o.bannerOccurrenceId}`);
    for (const tag of tax.provenanceTags ?? []) if (!allowedProvenance.has(tag)) errors.push(`Invalid provenance tag ${tag} for ${o.bannerOccurrenceId}`);
    for (const tag of tax.validationTags ?? []) if (!allowedValidation.has(tag)) errors.push(`Invalid validation tag ${tag} for ${o.bannerOccurrenceId}`);
    contextTagCount += (tax.contextTags ?? []).length;

    let expectedLifecycle;
    if (o.scheduleProvenance.scheduleTypeRaw === 'new') expectedLifecycle = 'NEW';
    else if (o.scheduleProvenance.scheduleTypeRaw === 'single') expectedLifecycle = 'RERUN';
    else if (index > 0) expectedLifecycle = 'RERUN';
    else expectedLifecycle = 'FIRST_OBSERVED_IN_CURRENT_DATASET';
    if (tax.lifecycle !== expectedLifecycle) {
      lifecycleMismatchCount += 1;
      errors.push(`Lifecycle mismatch for ${o.bannerOccurrenceId}: ${tax.lifecycle} != ${expectedLifecycle}`);
    }

    const scheduleRow = scheduleByKey.get(o.sourceOccurrenceKey);
    if (!scheduleRow) {
      errors.push(`Missing schedule row for ${o.bannerOccurrenceId}`);
      return;
    }
    const expectedProvenance = [];
    if (o.sourceRelation.effectiveSourceRecordKey == null && o.scheduleProvenance.matchStatus === 'manual') expectedProvenance.push('MANUAL_KR');
    if ((scheduleRow.matchBasis ?? '').includes('legacyReusable')) expectedProvenance.push('LEGACY_REUSE');
    if (JSON.stringify(tax.provenanceTags ?? []) !== JSON.stringify(expectedProvenance)) {
      provenanceMismatchCount += 1;
      errors.push(`Provenance mismatch for ${o.bannerOccurrenceId}`);
    }

    const expectedValidation = o.sourceRelation.correctionStatus !== 'NONE' ? ['SOURCE_CONFLICT'] : [];
    if (JSON.stringify(tax.validationTags ?? []) !== JSON.stringify(expectedValidation)) {
      validationMismatchCount += 1;
      errors.push(`Validation tag mismatch for ${o.bannerOccurrenceId}`);
    }
  });
}

if (contextTagCount !== 0) errors.push(`Expected 0 canonical context tags, got ${contextTagCount}`);

const fixture = id => byOccurrenceTaxonomy.get(id);
if (fixture('bocc:kr-banner:20260923:1')?.lifecycle !== 'NEW') errors.push('NEW fixture failed: kr-banner:20260923:1');
if (fixture('bocc:kr-banner:20260930:1')?.lifecycle !== 'RERUN') errors.push('single rerun fixture failed: kr-banner:20260930:1');
if (fixture('bocc:kr-banner:20261202:3')?.lifecycle !== 'RERUN') errors.push('repeated wish fixture failed: kr-banner:20261202:3');
if (!fixture('bocc:kr-manual-wish-20260902')?.provenanceTags?.includes('MANUAL_KR')) errors.push('manual provenance fixture failed: kr-manual-wish-20260902');
if (!fixture('bocc:kr-banner:20260916:2')?.provenanceTags?.includes('LEGACY_REUSE')) errors.push('legacy reuse fixture failed: kr-banner:20260916:2');
if (!fixture('bocc:kr-banner:20270331:4')?.validationTags?.includes('SOURCE_CONFLICT')) errors.push('source conflict fixture failed: kr-banner:20270331:4');

const countTag = (rows, field, tag) => rows.filter(r => (r[field] ?? []).includes(tag)).length;
const lifecycleCounts = Object.fromEntries([...occurrenceTaxonomy.reduce((m, r) => m.set(r.lifecycle, (m.get(r.lifecycle) ?? 0) + 1), new Map())].sort((a,b)=>a[0].localeCompare(b[0])));
const mechanicFamilyCounts = Object.fromEntries([...definitionTaxonomy.reduce((m, r) => m.set(r.mechanicFamily, (m.get(r.mechanicFamily) ?? 0) + 1), new Map())].sort((a,b)=>a[0].localeCompare(b[0])));
const pickupCardinalityCounts = Object.fromEntries([...definitionTaxonomy.reduce((m, r) => m.set(r.pickupCardinality, (m.get(r.pickupCardinality) ?? 0) + 1), new Map())].sort((a,b)=>a[0].localeCompare(b[0])));

const summary = {
  version: 1,
  stage: 'Banner Stage 2-4',
  status: errors.length ? 'FAIL_STAGE2_4_TAXONOMY' : 'PASS_STAGE2_4_TAXONOMY',
  validationMode: 'EXECUTED_FULL_POPULATION_REGRESSION',
  definitionCount: definitionTaxonomy.length,
  occurrenceCount: occurrenceTaxonomy.length,
  mechanicFamilyCounts,
  pickupCardinalityCounts,
  lifecycleCounts,
  contextTagAssignmentCount: contextTagCount,
  provenanceTagCounts: {
    MANUAL_KR: countTag(occurrenceTaxonomy, 'provenanceTags', 'MANUAL_KR'),
    LEGACY_REUSE: countTag(occurrenceTaxonomy, 'provenanceTags', 'LEGACY_REUSE')
  },
  validationTagCounts: {
    SOURCE_CONFLICT: countTag(occurrenceTaxonomy, 'validationTags', 'SOURCE_CONFLICT')
  },
  identityMismatchCount,
  lifecycleMismatchCount,
  provenanceMismatchCount,
  validationMismatchCount,
  errorCount: errors.length,
  errors,
  invariants: {
    canonicalDefinitionIdsUnchanged: identityMismatchCount === 0 && definitions.every(d => byDefinitionTaxonomy.has(d.bannerDefinitionId)),
    canonicalOccurrenceIdsUnchanged: occurrences.every(o => byOccurrenceTaxonomy.has(o.bannerOccurrenceId)),
    occurrenceDefinitionMappingUnchanged: identityMismatchCount === 0,
    all77DefinitionsClassified: definitionTaxonomy.length === 77,
    all94OccurrencesClassified: occurrenceTaxonomy.length === 94,
    firstObservedNeverAutoPromotedToNew: lifecycleMismatchCount === 0,
    contextNotInferredFromTextOrAssets: contextTagCount === 0,
    manualKrSourceNullOnly: countTag(occurrenceTaxonomy, 'provenanceTags', 'MANUAL_KR') === 8,
    legacyReuseExplicitBasisOnly: countTag(occurrenceTaxonomy, 'provenanceTags', 'LEGACY_REUSE') === 6,
    sourceConflictCorrectionOnly: countTag(occurrenceTaxonomy, 'validationTags', 'SOURCE_CONFLICT') === 1,
    specialNotSynthesized: !definitionTaxonomy.some(x => x.mechanicFamily === 'SPECIAL'),
    multiNotSynthesized: !definitionTaxonomy.some(x => x.pickupCardinality === 'MULTI'),
    heroRelationsNotMaterialized: true,
    cpEventJoinsNotMaterialized: true,
    assetCanonicalizationNotMaterialized: true
  },
  completion: {
    taxonomyContractFrozen: contract.status === 'TAXONOMY_CONTRACT_FROZEN',
    definitionTaxonomyMaterialized: definitionTaxonomy.length === 77,
    occurrenceTaxonomyMaterialized: occurrenceTaxonomy.length === 94,
    stage2_4Closed: errors.length === 0,
    nextStageReady: errors.length === 0
  },
  nextStartPoint: {
    stage: 'Banner Stage 2-5',
    task: 'Materialize canonical Hero relations on banner definitions using exact Hero IDs and Stage 1 relation semantics.'
  }
};

writeJson('data/validation/banner-stage2-4-summary.v1.json', summary);
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exit(1);
