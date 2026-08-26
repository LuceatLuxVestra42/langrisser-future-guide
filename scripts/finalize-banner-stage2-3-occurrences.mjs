import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const writeJson = (p, value) => {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n');
};

const stage22 = readJson('data/validation/banner-stage2-2-summary.v1.json');
const scheduleDoc = readJson('data/kr-banner-schedule.v1.json');
const mapDoc = readJson('data/generated/banner-occurrence-definition-map.v1.json');
const definitionsDoc = readJson('data/generated/banner-definitions.v1.json');

if (stage22.status !== 'PASS_STAGE2_2_CANONICAL_DEFINITION_MATERIALIZATION') {
  throw new Error(`Stage 2-2 not PASS: ${stage22.status}`);
}

const schedule = scheduleDoc.records ?? [];
const mappings = mapDoc.records ?? [];
const definitions = definitionsDoc.records ?? [];
if (schedule.length !== 94) throw new Error(`Expected 94 schedule rows, got ${schedule.length}`);
if (mappings.length !== 94) throw new Error(`Expected 94 Stage 2-2 mappings, got ${mappings.length}`);

const mappingByRecordKey = new Map(mappings.map(x => [x.recordKey, x]));
const definitionIds = new Set(definitions.map(x => x.bannerDefinitionId));
if (mappingByRecordKey.size !== mappings.length) throw new Error('Duplicate recordKey in Stage 2-2 mapping');

const records = schedule.map(row => {
  const mapping = mappingByRecordKey.get(row.recordKey);
  if (!mapping) throw new Error(`Missing Stage 2-2 mapping for ${row.recordKey}`);
  if (!definitionIds.has(mapping.bannerDefinitionId)) {
    throw new Error(`Unknown bannerDefinitionId for ${row.recordKey}: ${mapping.bannerDefinitionId}`);
  }
  const expectedOccurrenceId = `bocc:${row.recordKey}`;
  if (mapping.bannerOccurrenceId !== expectedOccurrenceId) {
    throw new Error(`Occurrence ID mismatch for ${row.recordKey}`);
  }

  return {
    bannerOccurrenceId: mapping.bannerOccurrenceId,
    bannerDefinitionId: mapping.bannerDefinitionId,
    sourceOccurrenceKey: row.recordKey,
    krDisplayDate: row.krDisplayDate,
    displayOrder: row.displayOrder,
    sourceRelation: {
      recordedSourceRecordKey: mapping.recordedSourceRecordKey ?? null,
      effectiveSourceRecordKey: mapping.effectiveSourceRecordKey ?? null,
      correctionStatus: mapping.correctionStatus ?? 'NONE'
    },
    scheduleProvenance: {
      bannerCode: row.bannerCode ?? null,
      patchCode: row.patchCode ?? null,
      slotCode: row.slotCode ?? null,
      sourceTypeRaw: row.sourceType ?? null,
      scheduleTypeRaw: row.scheduleType ?? null,
      manualOverride: row.manualOverride ?? false,
      matchStatus: row.matchStatus ?? null
    },
    display: {
      visualType: row.visualType ?? null,
      imageType: row.displayImageType ?? null,
      imageFile: row.displayImageFile ?? null,
      imageStatus: row.displayImageStatus ?? null
    }
  };
});

const occurrenceIds = new Set(records.map(x => x.bannerOccurrenceId));
if (records.length !== 94 || occurrenceIds.size !== 94) {
  throw new Error(`Occurrence materialization uniqueness/coverage failed: ${records.length}/${occurrenceIds.size}`);
}

const output = {
  version: 1,
  stage: 'Banner Stage 2-3',
  status: 'CANONICAL_BANNER_OCCURRENCES_MATERIALIZED',
  recordCount: records.length,
  definitionCount: new Set(records.map(x => x.bannerDefinitionId)).size,
  sourceNullOccurrenceCount: records.filter(x => x.sourceRelation.effectiveSourceRecordKey === null).length,
  correctedOccurrenceCount: records.filter(x => x.sourceRelation.correctionStatus !== 'NONE').length,
  records
};

writeJson('data/generated/banner-occurrences.v1.json', output);
console.log(`Materialized ${records.length} canonical banner occurrences across ${output.definitionCount} definitions.`);
