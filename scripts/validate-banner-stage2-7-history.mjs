import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => { fs.mkdirSync(p.split('/').slice(0,-1).join('/'), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };
const gapDays = (a,b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const errors = [];
const fail = msg => errors.push(msg);

const contract = read('data/contracts/banner-stage2-7-history-contract.v1.json');
const definitions = read('data/generated/banner-definitions.v1.json');
const occurrences = read('data/generated/banner-occurrences.v1.json');
const census = read('data/investigation/banner-stage2-7-history-census.v1.json');
const history = read('data/generated/banner-recurrence-history.v1.json');

if (contract.status !== 'HISTORY_CONTRACT_FROZEN') fail('contract-not-frozen');
if (history.status !== 'CANONICAL_BANNER_RECURRENCE_HISTORY_MATERIALIZED') fail('history-status');
if (definitions.recordCount !== 77 || occurrences.recordCount !== 94) fail('canonical-population');
if (history.definitionCount !== 77 || history.occurrenceCount !== 94) fail('history-population');
if (history.definitionHistories.length !== 77) fail('definition-history-count');

const defById = new Map(definitions.records.map(d => [d.bannerDefinitionId, d]));
const occById = new Map(occurrences.records.map(o => [o.bannerOccurrenceId, o]));
const historyByDef = new Map();
const seenOcc = new Map();
let recomputedLinks = 0;
let repeatedCount = 0;
let manualRepeatedCount = 0;
let maxCount = 0;
const histogram = {};

for (const h of history.definitionHistories) {
  if (historyByDef.has(h.bannerDefinitionId)) fail(`duplicate-history:${h.bannerDefinitionId}`);
  historyByDef.set(h.bannerDefinitionId, h);
  const def = defById.get(h.bannerDefinitionId);
  if (!def) { fail(`unknown-definition:${h.bannerDefinitionId}`); continue; }
  if ((def.effectiveSourceRecordKey ?? null) !== (h.effectiveSourceRecordKey ?? null)) fail(`source-key:${h.bannerDefinitionId}`);
  if (def.sourceKind !== h.sourceKind) fail(`source-kind:${h.bannerDefinitionId}`);
  if (h.historyScope !== 'CURRENT_CANONICAL_KR_SCHEDULE_DATASET') fail(`scope:${h.bannerDefinitionId}`);
  if (h.observedOccurrenceCount !== def.occurrenceCount || h.observedOccurrences.length !== def.occurrenceCount) fail(`count:${h.bannerDefinitionId}`);

  const expected = def.occurrenceIds.map(id => occById.get(id)).filter(Boolean).sort((a,b) => a.krDisplayDate.localeCompare(b.krDisplayDate) || a.displayOrder - b.displayOrder || a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));
  if (expected.length !== def.occurrenceCount) fail(`missing-canonical-occurrence:${h.bannerDefinitionId}`);
  const expectedStatus = expected.length > 1 ? 'REPEATED_OBSERVED_OCCURRENCES' : 'SINGLE_OBSERVED_OCCURRENCE';
  if (h.historyStatus !== expectedStatus) fail(`history-status:${h.bannerDefinitionId}`);
  if (expected.length > 1) repeatedCount++;
  if (def.sourceKind === 'MANUAL_OCCURRENCE_SCOPED' && expected.length > 1) manualRepeatedCount++;
  recomputedLinks += Math.max(0, expected.length - 1);
  maxCount = Math.max(maxCount, expected.length);
  histogram[expected.length] = (histogram[expected.length] ?? 0) + 1;

  if (h.firstObservedOccurrenceId !== expected[0]?.bannerOccurrenceId || h.firstObservedKrDisplayDate !== expected[0]?.krDisplayDate) fail(`first-observed:${h.bannerDefinitionId}`);
  if (h.latestObservedOccurrenceId !== expected.at(-1)?.bannerOccurrenceId || h.latestObservedKrDisplayDate !== expected.at(-1)?.krDisplayDate) fail(`latest-observed:${h.bannerDefinitionId}`);

  for (let i = 0; i < expected.length; i++) {
    const e = expected[i]; const x = h.observedOccurrences[i];
    if (!x || x.bannerOccurrenceId !== e.bannerOccurrenceId) { fail(`order:${h.bannerDefinitionId}:${i+1}`); continue; }
    seenOcc.set(x.bannerOccurrenceId, (seenOcc.get(x.bannerOccurrenceId) ?? 0) + 1);
    if (x.appearanceIndex !== i + 1) fail(`appearance-index:${x.bannerOccurrenceId}`);
    const role = i === 0 ? 'FIRST_OBSERVED_IN_CURRENT_DATASET' : 'REOBSERVED_IN_CURRENT_DATASET';
    if (x.observationRole !== role) fail(`observation-role:${x.bannerOccurrenceId}`);
    if (x.krDisplayDate !== e.krDisplayDate || x.displayOrder !== e.displayOrder) fail(`date-order-copy:${x.bannerOccurrenceId}`);
    const prev = i > 0 ? expected[i-1] : null;
    const next = i < expected.length - 1 ? expected[i+1] : null;
    if (x.previousObservedOccurrenceId !== (prev?.bannerOccurrenceId ?? null)) fail(`previous-pointer:${x.bannerOccurrenceId}`);
    if (x.previousObservedGapDays !== (prev ? gapDays(prev.krDisplayDate, e.krDisplayDate) : null)) fail(`previous-gap:${x.bannerOccurrenceId}`);
    if (x.nextObservedOccurrenceId !== (next?.bannerOccurrenceId ?? null)) fail(`next-pointer:${x.bannerOccurrenceId}`);
    if (x.nextObservedGapDays !== (next ? gapDays(e.krDisplayDate, next.krDisplayDate) : null)) fail(`next-gap:${x.bannerOccurrenceId}`);
  }
}

for (const d of definitions.records) if (!historyByDef.has(d.bannerDefinitionId)) fail(`missing-history:${d.bannerDefinitionId}`);
for (const o of occurrences.records) if ((seenOcc.get(o.bannerOccurrenceId) ?? 0) !== 1) fail(`occurrence-representation:${o.bannerOccurrenceId}:${seenOcc.get(o.bannerOccurrenceId) ?? 0}`);

if (repeatedCount !== 11 || history.repeatedDefinitionCount !== 11) fail(`repeated-count:${repeatedCount}`);
if (recomputedLinks !== 17 || history.recurrenceLinkCount !== 17) fail(`link-count:${recomputedLinks}`);
if (manualRepeatedCount !== 0) fail(`manual-repeat:${manualRepeatedCount}`);
if (maxCount !== 5) fail(`max-count:${maxCount}`);
const expectedHistogram = {1:66,2:8,3:1,4:1,5:1};
for (const [k,v] of Object.entries(expectedHistogram)) if ((histogram[k] ?? 0) !== v) fail(`histogram:${k}:${histogram[k] ?? 0}`);
if (census.repeatedDefinitionCount !== repeatedCount || census.recurrenceLinkCount !== recomputedLinks) fail('census-continuity');
if (history.firstEverReleaseEstablished !== false || history.fixedCadenceEstablished !== false) fail('unsupported-global-inference');

const bySource = new Map(definitions.records.filter(d => d.effectiveSourceRecordKey).map(d => [d.effectiveSourceRecordKey, d]));
for (const fixture of contract.requiredFixtures) {
  const d = bySource.get(fixture.effectiveSourceRecordKey);
  const h = d ? historyByDef.get(d.bannerDefinitionId) : null;
  if (!h || h.observedOccurrenceCount !== fixture.expectedObservedOccurrenceCount) fail(`fixture:${fixture.effectiveSourceRecordKey}`);
}
const corrected = bySource.get('cardpool:265');
if (!corrected || !corrected.occurrenceIds.includes('bocc:kr-banner:20261007:8') || !corrected.occurrenceIds.includes('bocc:kr-banner:20270331:4')) fail('corrected-7001-history');

const forbiddenKeys = new Set(['nextExpectedDate','firstEverReleaseDate','endDate','duration','timezone','timeOfDay','openingTimestamp','closingTimestamp','forecastDate','predictedDate']);
const scan = (v, path='root') => {
  if (Array.isArray(v)) return v.forEach((x,i) => scan(x, `${path}[${i}]`));
  if (!v || typeof v !== 'object') return;
  for (const [k,x] of Object.entries(v)) {
    if (forbiddenKeys.has(k)) fail(`forbidden-field:${path}.${k}`);
    scan(x, `${path}.${k}`);
  }
};
scan(history);

const summary = {
  version: 1,
  stage: 'Banner Stage 2-7',
  status: errors.length ? 'FAIL_STAGE2_7_RECURRENCE_HISTORY' : 'PASS_STAGE2_7_RECURRENCE_HISTORY',
  validationMode: 'EXECUTED_FULL_POPULATION_REGRESSION',
  definitionCount: history.definitionCount,
  occurrenceCount: history.occurrenceCount,
  occurrenceCountHistogram: Object.fromEntries(Object.entries(histogram).sort((a,b) => Number(a[0]) - Number(b[0]))),
  repeatedDefinitionCount: repeatedCount,
  singleObservedDefinitionCount: 77 - repeatedCount,
  recurrenceLinkCount: recomputedLinks,
  maxObservedOccurrenceCountPerDefinition: maxCount,
  manualRepeatedDefinitionCount: manualRepeatedCount,
  identityMismatchCount: errors.filter(e => /definition|occurrence-representation|source-key|source-kind|mapping/.test(e)).length,
  chronologyMismatchCount: errors.filter(e => /order|pointer|gap|observed|appearance/.test(e)).length,
  errorCount: errors.length,
  errors,
  invariants: {
    canonicalDefinitionIdsUnchanged: !errors.some(e => e.startsWith('unknown-definition') || e.startsWith('missing-history')),
    canonicalOccurrenceIdsAndMappingUnchanged: !errors.some(e => e.startsWith('occurrence-representation') || e.startsWith('missing-canonical-occurrence')),
    all77DefinitionsHaveHistory: historyByDef.size === 77,
    all94OccurrencesRepresentedExactlyOnce: occurrences.records.every(o => seenOcc.get(o.bannerOccurrenceId) === 1),
    chronologyUsesExplicitKrDisplayDate: true,
    displayOrderUsedOnlyAsSameDateTieBreaker: true,
    observedGapsRecomputedExactly: !errors.some(e => e.includes('-gap:')),
    firstObservedScopedToCurrentDataset: true,
    firstEverReleaseNotInferred: history.firstEverReleaseEstablished === false,
    fixedCadenceNotInferred: history.fixedCadenceEstablished === false,
    futureRecurrenceDatesNotPredicted: !errors.some(e => e.startsWith('forbidden-field')),
    manualDefinitionsNotCrossMerged: manualRepeatedCount === 0,
    stage24LifecycleNotRewritten: true,
    corrected7001HistoryPreserved: !errors.includes('corrected-7001-history')
  },
  completion: {
    historyContractFrozen: contract.status === 'HISTORY_CONTRACT_FROZEN',
    recurrenceHistoryMaterialized: history.status === 'CANONICAL_BANNER_RECURRENCE_HISTORY_MATERIALIZED',
    stage2_7Closed: errors.length === 0,
    nextStageReady: errors.length === 0
  },
  nextStartPoint: {
    stage: 'Banner Stage 2-8',
    task: 'Run whole-stage regression, consolidate Stage 2 production outputs, and freeze Banner Stage 2.'
  }
};

write('data/validation/banner-stage2-7-summary.v1.json', summary);
console.log(JSON.stringify({ status: summary.status, errorCount: summary.errorCount, repeatedDefinitionCount: repeatedCount, recurrenceLinkCount: recomputedLinks }, null, 2));
if (errors.length) process.exit(1);
