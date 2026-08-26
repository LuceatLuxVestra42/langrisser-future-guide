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
const occurrenceDoc = readJson('data/generated/banner-occurrences.v1.json');

const schedule = scheduleDoc.records ?? [];
const mappings = mapDoc.records ?? [];
const definitions = definitionsDoc.records ?? [];
const occurrences = occurrenceDoc.records ?? [];
const errors = [];

if (stage22.status !== 'PASS_STAGE2_2_CANONICAL_DEFINITION_MATERIALIZATION') errors.push(`Stage 2-2 not PASS: ${stage22.status}`);
if (schedule.length !== 94) errors.push(`schedule count ${schedule.length} != 94`);
if (mappings.length !== 94) errors.push(`mapping count ${mappings.length} != 94`);
if (occurrences.length !== 94) errors.push(`occurrence count ${occurrences.length} != 94`);

const scheduleByKey = new Map(schedule.map(x => [x.recordKey, x]));
const mappingByKey = new Map(mappings.map(x => [x.recordKey, x]));
const occurrenceByKey = new Map(occurrences.map(x => [x.sourceOccurrenceKey, x]));
const definitionIds = new Set(definitions.map(x => x.bannerDefinitionId));
const occurrenceIds = new Set(occurrences.map(x => x.bannerOccurrenceId));

if (scheduleByKey.size !== schedule.length) errors.push('duplicate recordKey in source schedule');
if (mappingByKey.size !== mappings.length) errors.push('duplicate recordKey in Stage 2-2 mapping');
if (occurrenceByKey.size !== occurrences.length) errors.push('duplicate sourceOccurrenceKey in Stage 2-3 occurrences');
if (occurrenceIds.size !== occurrences.length) errors.push('duplicate bannerOccurrenceId in Stage 2-3 occurrences');

let mappingMismatchCount = 0;
let scheduleFieldMismatchCount = 0;
let unresolvedDefinitionCount = 0;
let sourceNullLeakCount = 0;
let forbiddenFieldCount = 0;
const forbiddenKeys = new Set([
  'lifecycle', 'mechanicFamily', 'pickupCardinality', 'heroRelations', 'wishCandidateHeroRelations',
  'cpRelated', 'eventId', 'eventReferences', 'startDateTime', 'endDateTime', 'endDate', 'duration',
  'timezone', 'firstEverRelease', 'assetId', 'assetHash'
]);

const scanForbidden = (value, pathParts = []) => {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanForbidden(v, [...pathParts, String(i)]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      forbiddenFieldCount += 1;
      errors.push(`forbidden downstream field ${[...pathParts, key].join('.')}`);
    }
    scanForbidden(child, [...pathParts, key]);
  }
};
scanForbidden(occurrenceDoc);

for (const row of schedule) {
  const mapping = mappingByKey.get(row.recordKey);
  const occurrence = occurrenceByKey.get(row.recordKey);
  if (!mapping) {
    errors.push(`missing mapping for ${row.recordKey}`);
    continue;
  }
  if (!occurrence) {
    errors.push(`missing occurrence for ${row.recordKey}`);
    continue;
  }

  const expectedOccurrenceId = `bocc:${row.recordKey}`;
  const mappingChecks = [
    ['bannerOccurrenceId', occurrence.bannerOccurrenceId, mapping.bannerOccurrenceId],
    ['bannerDefinitionId', occurrence.bannerDefinitionId, mapping.bannerDefinitionId],
    ['recordedSourceRecordKey', occurrence.sourceRelation?.recordedSourceRecordKey ?? null, mapping.recordedSourceRecordKey ?? null],
    ['effectiveSourceRecordKey', occurrence.sourceRelation?.effectiveSourceRecordKey ?? null, mapping.effectiveSourceRecordKey ?? null],
    ['correctionStatus', occurrence.sourceRelation?.correctionStatus ?? 'NONE', mapping.correctionStatus ?? 'NONE']
  ];
  for (const [field, actual, expected] of mappingChecks) {
    if (actual !== expected) {
      mappingMismatchCount += 1;
      errors.push(`mapping mismatch ${row.recordKey}.${field}`);
    }
  }
  if (occurrence.bannerOccurrenceId !== expectedOccurrenceId) errors.push(`canonical occurrence ID mismatch ${row.recordKey}`);
  if (!definitionIds.has(occurrence.bannerDefinitionId)) {
    unresolvedDefinitionCount += 1;
    errors.push(`unresolved definition ${row.recordKey}`);
  }

  const scheduleChecks = [
    ['sourceOccurrenceKey', occurrence.sourceOccurrenceKey, row.recordKey],
    ['krDisplayDate', occurrence.krDisplayDate, row.krDisplayDate],
    ['displayOrder', occurrence.displayOrder, row.displayOrder],
    ['bannerCode', occurrence.scheduleProvenance?.bannerCode ?? null, row.bannerCode ?? null],
    ['patchCode', occurrence.scheduleProvenance?.patchCode ?? null, row.patchCode ?? null],
    ['slotCode', occurrence.scheduleProvenance?.slotCode ?? null, row.slotCode ?? null],
    ['sourceTypeRaw', occurrence.scheduleProvenance?.sourceTypeRaw ?? null, row.sourceType ?? null],
    ['scheduleTypeRaw', occurrence.scheduleProvenance?.scheduleTypeRaw ?? null, row.scheduleType ?? null],
    ['manualOverride', occurrence.scheduleProvenance?.manualOverride ?? false, row.manualOverride ?? false],
    ['matchStatus', occurrence.scheduleProvenance?.matchStatus ?? null, row.matchStatus ?? null],
    ['visualType', occurrence.display?.visualType ?? null, row.visualType ?? null],
    ['imageType', occurrence.display?.imageType ?? null, row.displayImageType ?? null],
    ['imageFile', occurrence.display?.imageFile ?? null, row.displayImageFile ?? null],
    ['imageStatus', occurrence.display?.imageStatus ?? null, row.displayImageStatus ?? null]
  ];
  for (const [field, actual, expected] of scheduleChecks) {
    if (actual !== expected) {
      scheduleFieldMismatchCount += 1;
      errors.push(`schedule field mismatch ${row.recordKey}.${field}`);
    }
  }

  if ((row.sourceRecordKey ?? null) === null && (occurrence.sourceRelation?.effectiveSourceRecordKey ?? null) !== null) {
    sourceNullLeakCount += 1;
    errors.push(`source-null occurrence gained synthetic source ${row.recordKey}`);
  }
}

const corrected7001 = occurrenceByKey.get('kr-banner:20270331:4');
const earlier7001 = occurrenceByKey.get('kr-banner:20261007:8');
if (!corrected7001) errors.push('corrected 7001 occurrence missing');
else {
  if (corrected7001.sourceRelation?.recordedSourceRecordKey !== 'cardpool:263') errors.push('7001 recorded source not cardpool:263');
  if (corrected7001.sourceRelation?.effectiveSourceRecordKey !== 'cardpool:265') errors.push('7001 effective source not cardpool:265');
  if (corrected7001.sourceRelation?.correctionStatus === 'NONE') errors.push('7001 correction status not propagated');
}
if (!earlier7001) errors.push('earlier 7001 occurrence missing');
else if (corrected7001 && earlier7001.bannerDefinitionId !== corrected7001.bannerDefinitionId) errors.push('7001 corrected occurrence does not share definition with earlier occurrence');

const sourceNullOccurrenceCount = occurrences.filter(x => x.sourceRelation?.effectiveSourceRecordKey === null).length;
const correctedOccurrenceCount = occurrences.filter(x => (x.sourceRelation?.correctionStatus ?? 'NONE') !== 'NONE').length;
const definitionCount = new Set(occurrences.map(x => x.bannerDefinitionId)).size;

const summary = {
  version: 1,
  stage: 'Banner Stage 2-3',
  status: errors.length === 0 ? 'PASS_STAGE2_3_CANONICAL_OCCURRENCE_MATERIALIZATION' : 'FAIL_STAGE2_3_CANONICAL_OCCURRENCE_MATERIALIZATION',
  validationMode: 'EXECUTED_FULL_POPULATION_REGRESSION',
  sourceOccurrenceCount: schedule.length,
  mappedOccurrenceCount: mappings.length,
  materializedOccurrenceCount: occurrences.length,
  referencedDefinitionCount: definitionCount,
  canonicalDefinitionPopulationCount: definitions.length,
  sourceNullOccurrenceCount,
  correctedOccurrenceCount,
  mappingMismatchCount,
  scheduleFieldMismatchCount,
  unresolvedDefinitionCount,
  sourceNullLeakCount,
  forbiddenFieldCount,
  errorCount: errors.length,
  errors,
  invariants: {
    all94OccurrencesMaterializedExactlyOnce: occurrences.length === 94 && occurrenceByKey.size === 94,
    occurrenceIdsUnique: occurrenceIds.size === occurrences.length,
    allOccurrenceDefinitionIdsResolve: unresolvedDefinitionCount === 0,
    allStage22MappingsPreservedExactly: mappingMismatchCount === 0,
    allIncludedScheduleFieldsPreservedExactly: scheduleFieldMismatchCount === 0,
    corrected7001RecordedSourceIs263: corrected7001?.sourceRelation?.recordedSourceRecordKey === 'cardpool:263',
    corrected7001EffectiveSourceIs265: corrected7001?.sourceRelation?.effectiveSourceRecordKey === 'cardpool:265',
    corrected7001DefinitionContinuityPreserved: Boolean(corrected7001 && earlier7001 && corrected7001.bannerDefinitionId === earlier7001.bannerDefinitionId),
    sourceNullManualRowsRemainSourceNull: sourceNullLeakCount === 0,
    downstreamTaxonomyRelationsTimingFieldsAbsent: forbiddenFieldCount === 0,
    definitionPopulationStill77: definitions.length === 77 && definitionCount === 77
  },
  completion: {
    bannerOccurrencesMaterialized: errors.length === 0,
    stage2_3Closed: errors.length === 0,
    nextStageReady: errors.length === 0
  },
  nextStartPoint: {
    stage: 'Banner Stage 2-4',
    task: 'Materialize normalized banner taxonomy dimensions without changing canonical occurrence/definition identities.'
  }
};

writeJson('data/validation/banner-stage2-3-summary.v1.json', summary);
console.log(`${summary.status}: ${errors.length} error(s), ${occurrences.length} occurrences.`);
if (errors.length) process.exitCode = 1;
