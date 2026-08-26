import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => { fs.mkdirSync(p.split('/').slice(0,-1).join('/'), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };
const gapDays = (a,b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const recurrenceCensus = read('data/investigation/banner-stage1-5-date-recurrence-census.v1.json');
const definitions = read('data/generated/banner-definitions.v1.json');
const occurrences = read('data/generated/banner-occurrences.v1.json');
const taxonomySummary = read('data/validation/banner-stage2-4-summary.v1.json');
const census = read('data/investigation/banner-stage2-7-history-census.v1.json');

if (recurrenceCensus.status !== 'DATE_RECURRENCE_CENSUS_COMPLETE') throw new Error('Stage 1 recurrence census not closed');
if (taxonomySummary.status !== 'PASS_STAGE2_4_TAXONOMY') throw new Error('Stage 2-4 taxonomy not closed');
if (census.status !== 'HISTORY_CENSUS_READY') throw new Error('Stage 2-7 census not ready');
if (definitions.recordCount !== 77 || occurrences.recordCount !== 94) throw new Error('Unexpected canonical population');

const occById = new Map(occurrences.records.map(r => [r.bannerOccurrenceId, r]));
const definitionHistories = [];
let recurrenceLinkCount = 0;

for (const def of definitions.records) {
  const ordered = def.occurrenceIds.map(id => {
    const occ = occById.get(id);
    if (!occ) throw new Error(`Missing occurrence ${id}`);
    if (occ.bannerDefinitionId !== def.bannerDefinitionId) throw new Error(`Mapping mismatch ${id}`);
    return occ;
  }).sort((a,b) => a.krDisplayDate.localeCompare(b.krDisplayDate) || a.displayOrder - b.displayOrder || a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));

  if (ordered.length !== def.occurrenceCount || ordered.length < 1) throw new Error(`Occurrence count mismatch ${def.bannerDefinitionId}`);
  recurrenceLinkCount += Math.max(0, ordered.length - 1);

  const historyOccurrences = ordered.map((occ, i) => {
    const prev = i > 0 ? ordered[i-1] : null;
    const next = i < ordered.length - 1 ? ordered[i+1] : null;
    return {
      appearanceIndex: i + 1,
      observationRole: i === 0 ? 'FIRST_OBSERVED_IN_CURRENT_DATASET' : 'REOBSERVED_IN_CURRENT_DATASET',
      bannerOccurrenceId: occ.bannerOccurrenceId,
      krDisplayDate: occ.krDisplayDate,
      displayOrder: occ.displayOrder,
      previousObservedOccurrenceId: prev?.bannerOccurrenceId ?? null,
      previousObservedGapDays: prev ? gapDays(prev.krDisplayDate, occ.krDisplayDate) : null,
      nextObservedOccurrenceId: next?.bannerOccurrenceId ?? null,
      nextObservedGapDays: next ? gapDays(occ.krDisplayDate, next.krDisplayDate) : null
    };
  });

  definitionHistories.push({
    bannerDefinitionId: def.bannerDefinitionId,
    effectiveSourceRecordKey: def.effectiveSourceRecordKey,
    sourceKind: def.sourceKind,
    historyScope: 'CURRENT_CANONICAL_KR_SCHEDULE_DATASET',
    historyStatus: ordered.length > 1 ? 'REPEATED_OBSERVED_OCCURRENCES' : 'SINGLE_OBSERVED_OCCURRENCE',
    observedOccurrenceCount: ordered.length,
    firstObservedOccurrenceId: ordered[0].bannerOccurrenceId,
    firstObservedKrDisplayDate: ordered[0].krDisplayDate,
    latestObservedOccurrenceId: ordered.at(-1).bannerOccurrenceId,
    latestObservedKrDisplayDate: ordered.at(-1).krDisplayDate,
    observedOccurrences: historyOccurrences
  });
}

definitionHistories.sort((a,b) => a.bannerDefinitionId.localeCompare(b.bannerDefinitionId));
const repeatedDefinitionCount = definitionHistories.filter(r => r.observedOccurrenceCount > 1).length;
const occurrenceHistoryEntryCount = definitionHistories.reduce((n,r) => n + r.observedOccurrences.length, 0);

const out = {
  version: 1,
  stage: 'Banner Stage 2-7',
  status: 'CANONICAL_BANNER_RECURRENCE_HISTORY_MATERIALIZED',
  historyScope: 'CURRENT_CANONICAL_KR_SCHEDULE_DATASET',
  definitionCount: definitionHistories.length,
  occurrenceCount: occurrenceHistoryEntryCount,
  repeatedDefinitionCount,
  singleObservedDefinitionCount: definitionHistories.length - repeatedDefinitionCount,
  recurrenceLinkCount,
  firstEverReleaseEstablished: false,
  fixedCadenceEstablished: false,
  definitionHistories
};

write('data/generated/banner-recurrence-history.v1.json', out);
console.log(JSON.stringify({ definitionCount: out.definitionCount, occurrenceCount: out.occurrenceCount, repeatedDefinitionCount, recurrenceLinkCount }, null, 2));
