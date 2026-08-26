import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const write = (p, v) => {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(v, null, 2) + '\n');
};

const contract = read('data/contracts/banner-stage2-8-freeze-contract.v1.json');
const summaries = {
  stage20: read('data/validation/banner-stage2-0-input-summary.v1.json'),
  stage21: read('data/validation/banner-stage2-1-summary.v1.json'),
  stage22: read('data/validation/banner-stage2-2-summary.v1.json'),
  stage23: read('data/validation/banner-stage2-3-summary.v1.json'),
  stage24: read('data/validation/banner-stage2-4-summary.v1.json'),
  stage25: read('data/validation/banner-stage2-5-summary.v1.json'),
  stage26: read('data/validation/banner-stage2-6-summary.v1.json'),
  stage27: read('data/validation/banner-stage2-7-summary.v1.json')
};
const definitions = read('data/generated/banner-definitions.v1.json');
const mapping = read('data/generated/banner-occurrence-definition-map.v1.json');
const occurrences = read('data/generated/banner-occurrences.v1.json');
const definitionTaxonomy = read('data/generated/banner-definition-taxonomy.v1.json');
const occurrenceTaxonomy = read('data/generated/banner-occurrence-taxonomy.v1.json');
const heroRelations = read('data/generated/banner-definition-hero-relations.v1.json');
const cpEvent = read('data/generated/banner-cp-event-relations.v1.json');
const history = read('data/generated/banner-recurrence-history.v1.json');

if (contract.status !== 'FREEZE_CONTRACT_FROZEN') throw new Error(`Unexpected Stage 2-8 contract status: ${contract.status}`);

const manifest = {
  version: 1,
  stage: 'Banner Stage 2-8',
  status: 'BANNER_STAGE2_PRODUCTION_MANIFEST_MATERIALIZED',
  representation: 'REFERENCE_MANIFEST_NO_LARGE_DATA_DUPLICATION',
  population: {
    bannerDefinitionCount: definitions.recordCount,
    bannerOccurrenceCount: occurrences.recordCount,
    mappedOccurrenceCount: mapping.occurrenceCount,
    sourceLinkedDefinitionCount: definitions.sourceLinkedDefinitionCount,
    manualOccurrenceScopedDefinitionCount: definitions.manualOccurrenceScopedDefinitionCount,
    heroRelationEdgeCount: heroRelations.edgeCount,
    cpRelatedDefinitionCount: cpEvent.cpRelatedDefinitionCount,
    cpRelatedOccurrenceCount: cpEvent.cpRelatedOccurrenceCount,
    repeatedDefinitionCount: history.repeatedDefinitionCount,
    recurrenceLinkCount: history.recurrenceLinkCount
  },
  predecessorStatuses: {
    stage20: summaries.stage20.status,
    stage21: summaries.stage21.status,
    stage22: summaries.stage22.status,
    stage23: summaries.stage23.status,
    stage24: summaries.stage24.status,
    stage25: summaries.stage25.status,
    stage26: summaries.stage26.status,
    stage27: summaries.stage27.status
  },
  lineageInputs: [
    { role: 'effective-source-overlay', path: 'data/generated/banner-stage2-0-effective-occurrences.v1.json' },
    { role: 'identity-grouping-policy', path: 'data/contracts/banner-stage2-1-identity-grouping-policy.v1.json' },
    { role: 'identity-grouping-plan', path: 'data/generated/banner-stage2-1-grouping-plan.v1.json' }
  ],
  productionArtifacts: [
    { role: 'canonical-definitions', path: 'data/generated/banner-definitions.v1.json', status: definitions.status, recordCount: definitions.recordCount },
    { role: 'occurrence-definition-map', path: 'data/generated/banner-occurrence-definition-map.v1.json', status: mapping.status, recordCount: mapping.occurrenceCount },
    { role: 'canonical-occurrences', path: 'data/generated/banner-occurrences.v1.json', status: occurrences.status, recordCount: occurrences.recordCount },
    { role: 'definition-taxonomy', path: 'data/generated/banner-definition-taxonomy.v1.json', status: definitionTaxonomy.status, recordCount: definitionTaxonomy.recordCount },
    { role: 'occurrence-taxonomy', path: 'data/generated/banner-occurrence-taxonomy.v1.json', status: occurrenceTaxonomy.status, recordCount: occurrenceTaxonomy.recordCount },
    { role: 'definition-hero-relations', path: 'data/generated/banner-definition-hero-relations.v1.json', status: heroRelations.status, edgeCount: heroRelations.edgeCount },
    { role: 'cp-event-reference-relations', path: 'data/generated/banner-cp-event-relations.v1.json', status: cpEvent.status, definitionRelationCount: cpEvent.cpRelatedDefinitionCount },
    { role: 'recurrence-history', path: 'data/generated/banner-recurrence-history.v1.json', status: history.status, definitionHistoryCount: history.definitionCount }
  ],
  identityPolicy: {
    bannerOccurrenceId: 'bocc:<recordKey>',
    bannerDefinitionId: "bdef:v1:<first 24 lowercase hex chars of SHA-256('banner-definition:v1|' + definitionGroupKey)>",
    sourceLinkedDefinitionGrouping: 'same effectiveSourceRecordKey => same canonical definition',
    sourceNullManualDefinitionGrouping: 'one occurrence-scoped definition unless an explicit approved mapping is introduced',
    silentRegroupingAllowedAfterFreeze: false,
    identityChangeRequiresMigrationOrAliasCheckpoint: true
  },
  semanticBoundaries: {
    krDisplayDatePrecision: 'DAY_CURRENT_KR_SCHEDULE_DISPLAY_PLACEMENT',
    firstObservedScope: 'CURRENT_CANONICAL_KR_SCHEDULE_DATASET',
    firstEverReleaseEstablished: false,
    fixedCadenceEstablished: false,
    canonicalEventIdsEstablished: false,
    assetCanonicalizationEstablished: false,
    frontendIntegrationEstablished: false
  },
  deferredBoundaries: contract.deferredBoundaries,
  nextStartPoint: {
    stage: 'Banner Stage 3',
    task: 'Consume the frozen Stage 2 canonical model for asset/frontend integration without silently changing canonical banner identity.'
  }
};

write('data/generated/banner-stage2-production-manifest.v1.json', manifest);
console.log(JSON.stringify({ status: manifest.status, population: manifest.population }, null, 2));
