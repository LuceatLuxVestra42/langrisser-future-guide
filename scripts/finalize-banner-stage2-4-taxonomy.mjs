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
const definitionsDoc = readJson('data/generated/banner-definitions.v1.json');
const occurrencesDoc = readJson('data/generated/banner-occurrences.v1.json');
const scheduleDoc = readJson('data/kr-banner-schedule.v1.json');

if (stage23.status !== 'PASS_STAGE2_3_CANONICAL_OCCURRENCE_MATERIALIZATION') {
  throw new Error(`Stage 2-3 not PASS: ${stage23.status}`);
}

const definitions = definitionsDoc.records ?? [];
const occurrences = occurrencesDoc.records ?? [];
const schedule = scheduleDoc.records ?? [];
if (definitions.length !== 77) throw new Error(`Expected 77 definitions, got ${definitions.length}`);
if (occurrences.length !== 94) throw new Error(`Expected 94 occurrences, got ${occurrences.length}`);
if (schedule.length !== 94) throw new Error(`Expected 94 schedule rows, got ${schedule.length}`);

const scheduleByKey = new Map(schedule.map(x => [x.recordKey, x]));
const occurrencesByDefinition = new Map();
for (const o of occurrences) {
  if (!occurrencesByDefinition.has(o.bannerDefinitionId)) occurrencesByDefinition.set(o.bannerDefinitionId, []);
  occurrencesByDefinition.get(o.bannerDefinitionId).push(o);
}
for (const rows of occurrencesByDefinition.values()) {
  rows.sort((a, b) => a.krDisplayDate.localeCompare(b.krDisplayDate) || a.displayOrder - b.displayOrder || a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));
}

const classifyDefinition = definition => {
  const rows = occurrencesByDefinition.get(definition.bannerDefinitionId) ?? [];
  if (!rows.length) throw new Error(`Definition has no occurrences: ${definition.bannerDefinitionId}`);
  const sourceTypes = [...new Set(rows.map(o => o.scheduleProvenance.sourceTypeRaw ?? null))];
  const scheduleTypes = [...new Set(rows.map(o => o.scheduleProvenance.scheduleTypeRaw ?? null))];
  if (sourceTypes.length !== 1) throw new Error(`Definition sourceTypeRaw is unstable: ${definition.bannerDefinitionId}`);

  const raw = sourceTypes[0];
  let mechanicFamily;
  let pickupCardinality;
  let basis;

  if (raw === 'new') {
    mechanicFamily = 'PICKUP';
    pickupCardinality = 'SINGLE';
    basis = 'SOURCE_TYPE_NEW';
  } else if (raw === 'dual') {
    mechanicFamily = 'PICKUP';
    pickupCardinality = 'DUAL';
    basis = 'SOURCE_TYPE_DUAL';
  } else if (raw === 'triple') {
    mechanicFamily = 'PICKUP';
    pickupCardinality = 'TRIPLE';
    basis = 'SOURCE_TYPE_TRIPLE';
  } else if (raw === 'wish') {
    mechanicFamily = 'WISH';
    pickupCardinality = 'NOT_APPLICABLE';
    basis = 'SOURCE_TYPE_WISH';
  } else if (raw === null && definition.sourceKind === 'MANUAL_OCCURRENCE_SCOPED' && scheduleTypes.length === 1 && scheduleTypes[0] === 'wish') {
    mechanicFamily = 'WISH';
    pickupCardinality = 'NOT_APPLICABLE';
    basis = 'SOURCE_NULL_MANUAL_WISH';
  } else {
    throw new Error(`Unclassifiable definition ${definition.bannerDefinitionId}: sourceTypeRaw=${raw}, scheduleTypes=${scheduleTypes.join(',')}`);
  }

  return {
    bannerDefinitionId: definition.bannerDefinitionId,
    mechanicFamily,
    pickupCardinality,
    taxonomyBasis: basis
  };
};

const definitionRecords = definitions.map(classifyDefinition).sort((a,b) => a.bannerDefinitionId.localeCompare(b.bannerDefinitionId));
const definitionTaxonomyById = new Map(definitionRecords.map(x => [x.bannerDefinitionId, x]));

const occurrenceRecords = [];
for (const definition of definitions) {
  const rows = occurrencesByDefinition.get(definition.bannerDefinitionId) ?? [];
  rows.forEach((o, index) => {
    let lifecycle;
    let lifecycleBasis;
    if (o.scheduleProvenance.scheduleTypeRaw === 'new') {
      lifecycle = 'NEW';
      lifecycleBasis = 'EXPLICIT_SCHEDULE_NEW';
    } else if (o.scheduleProvenance.scheduleTypeRaw === 'single') {
      lifecycle = 'RERUN';
      lifecycleBasis = 'EXPLICIT_SCHEDULE_SINGLE';
    } else if (index > 0) {
      lifecycle = 'RERUN';
      lifecycleBasis = 'REPEATED_CANONICAL_DEFINITION_IN_CURRENT_DATASET';
    } else {
      lifecycle = 'FIRST_OBSERVED_IN_CURRENT_DATASET';
      lifecycleBasis = 'EARLIEST_CURRENT_DATASET_OCCURRENCE_ONLY';
    }

    const scheduleRow = scheduleByKey.get(o.sourceOccurrenceKey);
    if (!scheduleRow) throw new Error(`Missing schedule provenance for ${o.bannerOccurrenceId}`);

    const provenanceTags = [];
    if (o.sourceRelation.effectiveSourceRecordKey == null && o.scheduleProvenance.matchStatus === 'manual') provenanceTags.push('MANUAL_KR');
    if ((scheduleRow.matchBasis ?? '').includes('legacyReusable')) provenanceTags.push('LEGACY_REUSE');

    const validationTags = [];
    if (o.sourceRelation.correctionStatus !== 'NONE') validationTags.push('SOURCE_CONFLICT');

    occurrenceRecords.push({
      bannerOccurrenceId: o.bannerOccurrenceId,
      bannerDefinitionId: o.bannerDefinitionId,
      lifecycle,
      lifecycleBasis,
      contextTags: [],
      provenanceTags,
      validationTags
    });
  });
}
occurrenceRecords.sort((a,b) => a.bannerOccurrenceId.localeCompare(b.bannerOccurrenceId));

const countField = (rows, field) => Object.fromEntries([...rows.reduce((m, r) => {
  const v = r[field];
  m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}, new Map())].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
const countTag = (rows, field, tag) => rows.filter(r => r[field].includes(tag)).length;

const definitionTaxonomyDoc = {
  version: 1,
  stage: 'Banner Stage 2-4',
  status: 'CANONICAL_DEFINITION_TAXONOMY_MATERIALIZED',
  recordCount: definitionRecords.length,
  mechanicFamilyCounts: countField(definitionRecords, 'mechanicFamily'),
  pickupCardinalityCounts: countField(definitionRecords, 'pickupCardinality'),
  records: definitionRecords
};

const occurrenceTaxonomyDoc = {
  version: 1,
  stage: 'Banner Stage 2-4',
  status: 'CANONICAL_OCCURRENCE_TAXONOMY_MATERIALIZED',
  recordCount: occurrenceRecords.length,
  definitionCount: definitionTaxonomyById.size,
  lifecycleCounts: countField(occurrenceRecords, 'lifecycle'),
  contextTagCounts: { CP_RELATED: countTag(occurrenceRecords, 'contextTags', 'CP_RELATED'), COLLAB: countTag(occurrenceRecords, 'contextTags', 'COLLAB') },
  provenanceTagCounts: { MANUAL_KR: countTag(occurrenceRecords, 'provenanceTags', 'MANUAL_KR'), LEGACY_REUSE: countTag(occurrenceRecords, 'provenanceTags', 'LEGACY_REUSE') },
  validationTagCounts: { SOURCE_CONFLICT: countTag(occurrenceRecords, 'validationTags', 'SOURCE_CONFLICT') },
  records: occurrenceRecords
};

writeJson('data/generated/banner-definition-taxonomy.v1.json', definitionTaxonomyDoc);
writeJson('data/generated/banner-occurrence-taxonomy.v1.json', occurrenceTaxonomyDoc);
console.log(`Materialized taxonomy for ${definitionRecords.length} definitions and ${occurrenceRecords.length} occurrences.`);
