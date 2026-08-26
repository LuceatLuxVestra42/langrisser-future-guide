import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const schedulePath = path.join(ROOT, 'data/kr-banner-schedule.v1.json');
const correctionsPath = path.join(ROOT, 'data/checkpoints/banner-stage1-4-relation-corrections.v1.json');
const outputPath = path.join(ROOT, 'data/generated/banner-stage2-0-effective-occurrences.v1.json');

const scheduleDoc = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
const correctionDoc = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));

const records = Array.isArray(scheduleDoc)
  ? scheduleDoc
  : (scheduleDoc.records ?? scheduleDoc.occurrences ?? scheduleDoc.banners ?? []);
const corrections = correctionDoc.corrections ?? [];

if (!Array.isArray(records)) throw new Error('Unable to locate occurrence array in kr-banner-schedule.v1.json');
if (records.length !== 94) throw new Error(`Expected 94 occurrences, got ${records.length}`);
if (corrections.length !== 1) throw new Error(`Expected 1 verified correction, got ${corrections.length}`);

const byRecordKey = new Map(records.map(row => [row.recordKey, row]));
if (byRecordKey.size !== records.length) throw new Error('Duplicate recordKey detected in source schedule');

const overlay = corrections.map(correction => {
  const row = byRecordKey.get(correction.occurrenceRecordKey);
  if (!row) throw new Error(`Correction target missing: ${correction.occurrenceRecordKey}`);
  if (correction.field !== 'sourceRecordKey') {
    throw new Error(`Unsupported correction field for ${correction.occurrenceRecordKey}: ${correction.field}`);
  }
  if ((row.sourceRecordKey ?? null) !== correction.observedValue) {
    throw new Error(`Correction observedValue mismatch for ${correction.occurrenceRecordKey}`);
  }
  if ((row.sourceRecordKey ?? null) === null) {
    throw new Error(`Correction unexpectedly targets source-null occurrence ${correction.occurrenceRecordKey}`);
  }

  return {
    occurrenceRecordKey: correction.occurrenceRecordKey,
    field: correction.field,
    recordedValue: correction.observedValue,
    effectiveValue: correction.correctedValue,
    status: correction.status ?? 'VERIFIED_CORRECTION'
  };
});

const output = {
  version: 1,
  stage: 'Banner Stage 2-0',
  status: 'EFFECTIVE_SOURCE_VIEW_READY',
  representation: 'BASE_SCHEDULE_PLUS_VERIFIED_CORRECTION_OVERLAY',
  baseSchedule: {
    path: 'data/kr-banner-schedule.v1.json',
    recordCount: records.length,
    rowGrain: 'KR_BANNER_OCCURRENCE_DISPLAY_ROW',
    readOnly: true
  },
  correctionCheckpoint: {
    path: 'data/checkpoints/banner-stage1-4-relation-corrections.v1.json',
    correctionCount: corrections.length
  },
  effectiveOccurrenceCount: records.length,
  overlayCount: overlay.length,
  resolver: 'effectiveSourceRecordKey = correctionByOccurrence[recordKey]?.effectiveValue ?? sourceRecordKey ?? null',
  correctionOverlay: overlay,
  invariants: {
    sourceScheduleMutationPerformed: false,
    duplicateOccurrenceRowsMaterialized: false,
    manualNullSourceRowsRemainBaseScheduleValues: true,
    uncheckpointedCorrectionCount: 0
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
console.log(`Wrote effective source view for ${records.length} occurrences with ${overlay.length} verified overlay(s)`);
