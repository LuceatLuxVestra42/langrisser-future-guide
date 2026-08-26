import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const writeJson = (p, value) => {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n');
};

const occurrencesDoc = readJson('data/generated/banner-occurrences.v1.json');
const definitionsDoc = readJson('data/generated/banner-definitions.v1.json');
const scheduleDoc = readJson('data/kr-banner-schedule.v1.json');

const occurrences = occurrencesDoc.records ?? [];
const definitions = definitionsDoc.records ?? [];
const schedule = scheduleDoc.records ?? [];

if (occurrences.length !== 94) throw new Error(`Expected 94 occurrences, got ${occurrences.length}`);
if (definitions.length !== 77) throw new Error(`Expected 77 definitions, got ${definitions.length}`);

const scheduleByKey = new Map(schedule.map(x => [x.recordKey, x]));
const countBy = values => Object.fromEntries([...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
const pairKey = o => `${o.scheduleProvenance.sourceTypeRaw ?? 'null'} -> ${o.scheduleProvenance.scheduleTypeRaw ?? 'null'}`;

const sourceTypeCounts = countBy(occurrences.map(o => o.scheduleProvenance.sourceTypeRaw ?? 'null'));
const scheduleTypeCounts = countBy(occurrences.map(o => o.scheduleProvenance.scheduleTypeRaw ?? 'null'));
const rawPairCounts = countBy(occurrences.map(pairKey));

const occurrencesByDefinition = new Map();
for (const o of occurrences) {
  if (!occurrencesByDefinition.has(o.bannerDefinitionId)) occurrencesByDefinition.set(o.bannerDefinitionId, []);
  occurrencesByDefinition.get(o.bannerDefinitionId).push(o);
}

const definitionRawProfiles = definitions.map(d => {
  const rows = occurrencesByDefinition.get(d.bannerDefinitionId) ?? [];
  const sourceTypes = [...new Set(rows.map(o => o.scheduleProvenance.sourceTypeRaw ?? null))];
  const scheduleTypes = [...new Set(rows.map(o => o.scheduleProvenance.scheduleTypeRaw ?? null))];
  return {
    bannerDefinitionId: d.bannerDefinitionId,
    effectiveSourceRecordKey: d.effectiveSourceRecordKey,
    occurrenceCount: rows.length,
    sourceTypes,
    scheduleTypes,
    manualOccurrenceScoped: d.sourceKind === 'MANUAL_OCCURRENCE_SCOPED'
  };
});

const multiSourceTypeDefinitions = definitionRawProfiles.filter(x => x.sourceTypes.length > 1);
const multiScheduleTypeDefinitions = definitionRawProfiles.filter(x => x.scheduleTypes.length > 1);

const manualOccurrences = occurrences.filter(o => o.scheduleProvenance.manualOverride);
const correctedOccurrences = occurrences.filter(o => o.sourceRelation.correctionStatus !== 'NONE');
const legacyReusableOccurrences = occurrences.filter(o => (scheduleByKey.get(o.sourceOccurrenceKey)?.matchBasis ?? '').includes('legacyReusable'));
const noteKeywordCounts = {
  cp: schedule.filter(x => /\bCP\b|CP배너|CP 관련/i.test(x.note ?? '')).length,
  collab: schedule.filter(x => /콜라보|collab|联动/i.test(`${x.note ?? ''} ${x.nameCn ?? ''}`)).length
};

const census = {
  version: 1,
  stage: 'Banner Stage 2-4',
  status: 'RAW_TAXONOMY_CENSUS_READY',
  population: { occurrenceCount: occurrences.length, definitionCount: definitions.length },
  sourceTypeCounts,
  scheduleTypeCounts,
  rawPairCounts,
  definitionConsistency: {
    multiSourceTypeDefinitionCount: multiSourceTypeDefinitions.length,
    multiScheduleTypeDefinitionCount: multiScheduleTypeDefinitions.length,
    multiSourceTypeDefinitions,
    multiScheduleTypeDefinitions
  },
  provenanceCandidates: {
    manualOverrideOccurrenceCount: manualOccurrences.length,
    correctedOccurrenceCount: correctedOccurrences.length,
    legacyReusableOccurrenceCount: legacyReusableOccurrences.length
  },
  contextKeywordCensus: noteKeywordCounts,
  boundaries: {
    contextKeywordMatchesAreNotCanonicalContextTags: true,
    noNameOrAssetBasedTaxonomy: true,
    noHeroSetBasedTaxonomy: true
  }
};

writeJson('data/investigation/banner-stage2-4-taxonomy-census.v1.json', census);
console.log(JSON.stringify(census, null, 2));
