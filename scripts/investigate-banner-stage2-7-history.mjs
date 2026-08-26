import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => { fs.mkdirSync(p.split('/').slice(0,-1).join('/'), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };

const definitions = read('data/generated/banner-definitions.v1.json');
const occurrences = read('data/generated/banner-occurrences.v1.json');
const occById = new Map(occurrences.records.map(r => [r.bannerOccurrenceId, r]));

if (definitions.recordCount !== 77 || occurrences.recordCount !== 94) throw new Error('Unexpected Stage 2-2/2-3 population');

const histogram = {};
const repeated = [];
let recurrenceLinkCount = 0;
let manualRepeatedDefinitionCount = 0;

for (const def of definitions.records) {
  const history = def.occurrenceIds.map(id => {
    const occ = occById.get(id);
    if (!occ) throw new Error(`Missing occurrence ${id}`);
    if (occ.bannerDefinitionId !== def.bannerDefinitionId) throw new Error(`Definition mismatch ${id}`);
    return occ;
  }).sort((a,b) => a.krDisplayDate.localeCompare(b.krDisplayDate) || a.displayOrder - b.displayOrder || a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));

  const n = history.length;
  histogram[n] = (histogram[n] ?? 0) + 1;
  recurrenceLinkCount += Math.max(0, n - 1);
  if (def.sourceKind === 'MANUAL_OCCURRENCE_SCOPED' && n > 1) manualRepeatedDefinitionCount++;
  if (n > 1) repeated.push({
    bannerDefinitionId: def.bannerDefinitionId,
    effectiveSourceRecordKey: def.effectiveSourceRecordKey,
    occurrenceCount: n,
    occurrences: history.map(r => ({ bannerOccurrenceId: r.bannerOccurrenceId, krDisplayDate: r.krDisplayDate, displayOrder: r.displayOrder }))
  });
}

repeated.sort((a,b) => b.occurrenceCount - a.occurrenceCount || a.bannerDefinitionId.localeCompare(b.bannerDefinitionId));

const bySource = new Map(definitions.records.filter(d => d.effectiveSourceRecordKey).map(d => [d.effectiveSourceRecordKey, d]));
const fixtures = ['cardpool:370','cardpool:213','cardpool:366','cardpool:305','cardpool:265'].map(source => {
  const def = bySource.get(source);
  return {
    effectiveSourceRecordKey: source,
    bannerDefinitionId: def?.bannerDefinitionId ?? null,
    occurrenceCount: def?.occurrenceCount ?? 0,
    occurrenceIds: def?.occurrenceIds ?? []
  };
});

const out = {
  version: 1,
  stage: 'Banner Stage 2-7',
  status: 'HISTORY_CENSUS_READY',
  definitionCount: definitions.recordCount,
  occurrenceCount: occurrences.recordCount,
  occurrenceCountHistogram: Object.fromEntries(Object.entries(histogram).sort((a,b) => Number(a[0]) - Number(b[0]))),
  repeatedDefinitionCount: repeated.length,
  singleObservedDefinitionCount: definitions.recordCount - repeated.length,
  recurrenceLinkCount,
  maxObservedOccurrenceCountPerDefinition: Math.max(...definitions.records.map(d => d.occurrenceCount)),
  manualRepeatedDefinitionCount,
  verifiedFixtures: fixtures,
  repeatedDefinitions: repeated,
  boundaries: {
    chronologySource: ['krDisplayDate','displayOrder'],
    recordKeyDateParsingUsed: false,
    fixedCadenceInferenceAllowed: false,
    firstEverReleaseInferenceAllowed: false,
    endDateOrDurationInferenceAllowed: false,
    manualCrossDefinitionRecurrenceMergeAllowed: false
  }
};

write('data/investigation/banner-stage2-7-history-census.v1.json', out);
console.log(JSON.stringify({ repeatedDefinitionCount: out.repeatedDefinitionCount, recurrenceLinkCount, histogram: out.occurrenceCountHistogram }, null, 2));