import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const writeJson = (p, value) => {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n');
};

const scheduleDoc = readJson('data/kr-banner-schedule.v1.json');
const effectiveDoc = readJson('data/generated/banner-stage2-0-effective-occurrences.v1.json');
const stage21 = readJson('data/validation/banner-stage2-1-summary.v1.json');
const definitionsDoc = readJson('data/generated/banner-definitions.v1.json');
const mapDoc = readJson('data/generated/banner-occurrence-definition-map.v1.json');

const schedule = scheduleDoc.records ?? [];
const definitions = definitionsDoc.records ?? [];
const mappings = mapDoc.records ?? [];
const overlay = new Map((effectiveDoc.correctionOverlay ?? []).map(x => [x.occurrenceRecordKey, x]));
const errors = [];

if (stage21.status !== 'PASS_STAGE2_1_IDENTITY_GROUPING_POLICY') errors.push('Stage 2-1 status is not PASS');
if (schedule.length !== 94) errors.push(`schedule count ${schedule.length} != 94`);
if (mappings.length !== 94) errors.push(`mapping count ${mappings.length} != 94`);
if (definitions.length === 0) errors.push('definition population is empty');

const scheduleKeys = new Set(schedule.map(x => x.recordKey));
const mappingKeys = new Set(mappings.map(x => x.recordKey));
const occurrenceIds = new Set(mappings.map(x => x.bannerOccurrenceId));
const definitionIds = new Set(definitions.map(x => x.bannerDefinitionId));
const groupKeys = new Set(definitions.map(x => x.definitionGroupKey));

if (scheduleKeys.size !== schedule.length) errors.push('duplicate source schedule recordKey');
if (mappingKeys.size !== mappings.length) errors.push('duplicate occurrence mapping recordKey');
if (occurrenceIds.size !== mappings.length) errors.push('duplicate bannerOccurrenceId');
if (definitionIds.size !== definitions.length) errors.push('duplicate bannerDefinitionId');
if (groupKeys.size !== definitions.length) errors.push('duplicate definitionGroupKey');

for (const key of scheduleKeys) if (!mappingKeys.has(key)) errors.push(`missing mapping for ${key}`);
for (const key of mappingKeys) if (!scheduleKeys.has(key)) errors.push(`mapping references unknown occurrence ${key}`);

const defById = new Map(definitions.map(x => [x.bannerDefinitionId, x]));
const mapByKey = new Map(mappings.map(x => [x.recordKey, x]));

for (const m of mappings) {
  if (m.bannerOccurrenceId !== `bocc:${m.recordKey}`) errors.push(`occurrence ID mismatch ${m.recordKey}`);
  const def = defById.get(m.bannerDefinitionId);
  if (!def) errors.push(`missing definition ${m.bannerDefinitionId} for ${m.recordKey}`);
  else if (!def.occurrenceRecordKeys.includes(m.recordKey)) errors.push(`definition membership missing ${m.recordKey}`);

  const sourceRow = schedule.find(x => x.recordKey === m.recordKey);
  const correction = overlay.get(m.recordKey) ?? null;
  const expectedRecorded = sourceRow?.sourceRecordKey ?? null;
  const expectedEffective = correction?.effectiveValue ?? expectedRecorded;
  if ((m.recordedSourceRecordKey ?? null) !== expectedRecorded) errors.push(`recorded source mismatch ${m.recordKey}`);
  if ((m.effectiveSourceRecordKey ?? null) !== expectedEffective) errors.push(`effective source mismatch ${m.recordKey}`);
  const expectedGroup = expectedEffective ? `source:${expectedEffective}` : `manual-occurrence:${m.recordKey}`;
  if (m.definitionGroupKey !== expectedGroup) errors.push(`definition group mismatch ${m.recordKey}`);
}

for (const def of definitions) {
  if (def.occurrenceCount < 1) errors.push(`empty definition ${def.bannerDefinitionId}`);
  if (def.occurrenceCount !== def.occurrenceRecordKeys.length || def.occurrenceCount !== def.occurrenceIds.length) {
    errors.push(`occurrence count mismatch ${def.bannerDefinitionId}`);
  }
  for (const recordKey of def.occurrenceRecordKeys) {
    const m = mapByKey.get(recordKey);
    if (!m || m.bannerDefinitionId !== def.bannerDefinitionId) errors.push(`reverse membership mismatch ${recordKey}`);
  }
  if (def.sourceKind === 'MANUAL_OCCURRENCE_SCOPED' && def.occurrenceCount !== 1) {
    errors.push(`manual occurrence-scoped definition merged: ${def.bannerDefinitionId}`);
  }
}

const a7001 = mapByKey.get('kr-banner:20261007:8');
const b7001 = mapByKey.get('kr-banner:20270331:4');
if (!a7001 || !b7001) errors.push('7001 fixture missing');
else {
  if (b7001.recordedSourceRecordKey !== 'cardpool:263') errors.push('7001 recorded source is not cardpool:263');
  if (b7001.effectiveSourceRecordKey !== 'cardpool:265') errors.push('7001 effective source is not cardpool:265');
  if (a7001.bannerDefinitionId !== b7001.bannerDefinitionId) errors.push('7001 corrected occurrences do not share definition');
}

const manualA = mapByKey.get('kr-manual-wish-langrisser-1-5-20260909');
const manualB = mapByKey.get('kr-manual-wish-langrisser-1-5-20270317');
if (!manualA || !manualB) errors.push('manual isolation fixtures missing');
else if (manualA.bannerDefinitionId === manualB.bannerDefinitionId) errors.push('source-null manual Wish occurrences were auto-merged');

const sourceLinkedDefinitionCount = definitions.filter(x => x.sourceKind === 'CARDPOOL_SOURCE').length;
const manualOccurrenceScopedDefinitionCount = definitions.filter(x => x.sourceKind === 'MANUAL_OCCURRENCE_SCOPED').length;
const reusedDefinitionCount = definitions.filter(x => x.occurrenceCount > 1).length;
const maxOccurrenceCountPerDefinition = Math.max(...definitions.map(x => x.occurrenceCount));

const summary = {
  version: 1,
  stage: 'Banner Stage 2-2',
  status: errors.length === 0 ? 'PASS_STAGE2_2_CANONICAL_DEFINITION_MATERIALIZATION' : 'FAIL_STAGE2_2_CANONICAL_DEFINITION_MATERIALIZATION',
  validationMode: 'EXECUTED_FULL_POPULATION_REGRESSION',
  sourceOccurrenceCount: schedule.length,
  mappedOccurrenceCount: mappings.length,
  canonicalDefinitionCount: definitions.length,
  sourceLinkedDefinitionCount,
  manualOccurrenceScopedDefinitionCount,
  reusedDefinitionCount,
  maxOccurrenceCountPerDefinition,
  correctionOverlayCount: overlay.size,
  errorCount: errors.length,
  errors,
  invariants: {
    all94OccurrencesMappedExactlyOnce: schedule.length === 94 && mappings.length === 94 && mappingKeys.size === 94,
    occurrenceIdsUnique: occurrenceIds.size === mappings.length,
    definitionIdsUnique: definitionIds.size === definitions.length,
    groupKeysUnique: groupKeys.size === definitions.length,
    allDefinitionsNonEmpty: definitions.every(x => x.occurrenceCount >= 1),
    corrected7001UsesCardpool265: b7001?.effectiveSourceRecordKey === 'cardpool:265',
    corrected7001SharesDefinitionWithEarlierOccurrence: !!a7001 && !!b7001 && a7001.bannerDefinitionId === b7001.bannerDefinitionId,
    sourceNullManualRowsRemainOccurrenceScoped: definitions.filter(x => x.sourceKind === 'MANUAL_OCCURRENCE_SCOPED').every(x => x.occurrenceCount === 1),
    repeatedManualWishPresentationNotAutoMerged: !!manualA && !!manualB && manualA.bannerDefinitionId !== manualB.bannerDefinitionId,
    crossSourceAutomaticMergePerformed: false,
    heroRelationMaterialized: false,
    cpEventCanonicalJoinMaterialized: false,
    assetCanonicalizationPerformed: false,
    frontendIntegrationPerformed: false
  },
  completion: {
    definitionsMaterialized: errors.length === 0,
    occurrenceDefinitionMapMaterialized: errors.length === 0,
    stage2_2Closed: errors.length === 0,
    nextStageReady: errors.length === 0
  },
  nextStartPoint: {
    stage: 'Banner Stage 2-3',
    task: 'Materialize canonical production bannerOccurrence records using the Stage 2-2 definition mapping.'
  }
};

writeJson('data/validation/banner-stage2-2-summary.v1.json', summary);
console.log(`${summary.status}: definitions=${definitions.length}, occurrences=${mappings.length}, errors=${errors.length}`);
if (errors.length) process.exitCode = 1;
