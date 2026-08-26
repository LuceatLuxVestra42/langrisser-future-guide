import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

if (stage21.status !== 'PASS_STAGE2_1_IDENTITY_GROUPING_POLICY') {
  throw new Error(`Stage 2-1 not PASS: ${stage21.status}`);
}

const schedule = scheduleDoc.records ?? [];
if (schedule.length !== 94) throw new Error(`Expected 94 schedule rows, got ${schedule.length}`);

const overlay = new Map((effectiveDoc.correctionOverlay ?? []).map(x => [x.occurrenceRecordKey, x]));
const definitionIdFor = groupKey =>
  `bdef:v1:${crypto.createHash('sha256').update(`banner-definition:v1|${groupKey}`).digest('hex').slice(0, 24)}`;

const mapRecords = [];
const groupMap = new Map();

for (const row of schedule) {
  const correction = overlay.get(row.recordKey) ?? null;
  const recordedSourceRecordKey = row.sourceRecordKey ?? null;
  const effectiveSourceRecordKey = correction?.effectiveValue ?? recordedSourceRecordKey;
  const definitionGroupKey = effectiveSourceRecordKey
    ? `source:${effectiveSourceRecordKey}`
    : `manual-occurrence:${row.recordKey}`;
  const bannerDefinitionId = definitionIdFor(definitionGroupKey);
  const bannerOccurrenceId = `bocc:${row.recordKey}`;

  const mapRecord = {
    bannerOccurrenceId,
    recordKey: row.recordKey,
    bannerDefinitionId,
    definitionGroupKey,
    recordedSourceRecordKey,
    effectiveSourceRecordKey,
    correctionStatus: correction?.status ?? 'NONE'
  };
  mapRecords.push(mapRecord);

  let group = groupMap.get(definitionGroupKey);
  if (!group) {
    group = {
      bannerDefinitionId,
      definitionGroupKey,
      sourceKind: effectiveSourceRecordKey ? 'CARDPOOL_SOURCE' : 'MANUAL_OCCURRENCE_SCOPED',
      effectiveSourceRecordKey,
      occurrenceCount: 0,
      occurrenceIds: [],
      occurrenceRecordKeys: []
    };
    groupMap.set(definitionGroupKey, group);
  }

  if (group.bannerDefinitionId !== bannerDefinitionId) throw new Error(`Definition ID mismatch for ${definitionGroupKey}`);
  group.occurrenceCount += 1;
  group.occurrenceIds.push(bannerOccurrenceId);
  group.occurrenceRecordKeys.push(row.recordKey);
}

const definitions = [...groupMap.values()].sort((a, b) => a.bannerDefinitionId.localeCompare(b.bannerDefinitionId));
const definitionIds = new Set(definitions.map(x => x.bannerDefinitionId));
if (definitionIds.size !== definitions.length) throw new Error('bannerDefinitionId collision detected');
if (mapRecords.length !== 94) throw new Error('Occurrence map coverage is not 94');

const definitionsDoc = {
  version: 1,
  stage: 'Banner Stage 2-2',
  status: 'CANONICAL_BANNER_DEFINITIONS_MATERIALIZED',
  recordCount: definitions.length,
  sourceLinkedDefinitionCount: definitions.filter(x => x.sourceKind === 'CARDPOOL_SOURCE').length,
  manualOccurrenceScopedDefinitionCount: definitions.filter(x => x.sourceKind === 'MANUAL_OCCURRENCE_SCOPED').length,
  records: definitions
};

const mapDoc = {
  version: 1,
  stage: 'Banner Stage 2-2',
  status: 'OCCURRENCE_DEFINITION_MAP_MATERIALIZED',
  occurrenceCount: mapRecords.length,
  definitionCount: definitions.length,
  records: mapRecords
};

writeJson('data/generated/banner-definitions.v1.json', definitionsDoc);
writeJson('data/generated/banner-occurrence-definition-map.v1.json', mapDoc);
console.log(`Materialized ${definitions.length} definitions and ${mapRecords.length} occurrence mappings.`);
