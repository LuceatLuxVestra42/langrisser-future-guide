import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const schedulePath = path.join(ROOT, 'data/kr-banner-schedule.v1.json');
const correctionsPath = path.join(ROOT, 'data/checkpoints/banner-stage1-4-relation-corrections.v1.json');
const outputPath = path.join(ROOT, 'data/generated/banner-stage2-0-effective-occurrences.v1.json');

const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
const correctionDoc = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));

const records = Array.isArray(schedule) ? schedule : (schedule.records ?? schedule.occurrences ?? schedule.banners ?? []);
if (!Array.isArray(records)) throw new Error('Unable to locate occurrence array in kr-banner-schedule.v1.json');

const corrections = correctionDoc.corrections ?? [];
const correctionByOccurrence = new Map(corrections.map(c => [c.occurrenceRecordKey, c]));

let appliedCorrectionCount = 0;
const effectiveOccurrences = records.map((row, index) => {
  const correction = correctionByOccurrence.get(row.recordKey);
  let effectiveSourceRecordKey = row.sourceRecordKey ?? null;
  let correctionStatus = 'NONE';

  if (correction) {
    if (correction.field !== 'sourceRecordKey') {
      throw new Error(`Unsupported correction field for ${row.recordKey}: ${correction.field}`);
    }
    if ((row.sourceRecordKey ?? null) !== correction.observedValue) {
      throw new Error(`Correction observedValue mismatch for ${row.recordKey}`);
    }
    effectiveSourceRecordKey = correction.correctedValue;
    correctionStatus = correction.status ?? 'VERIFIED_CORRECTION';
    appliedCorrectionCount += 1;
  }

  return {
    occurrenceIndex: index,
    recordKey: row.recordKey,
    krDisplayDate: row.krDisplayDate,
    displayOrder: row.displayOrder,
    bannerCode: row.bannerCode ?? null,
    recordedSourceRecordKey: row.sourceRecordKey ?? null,
    effectiveSourceRecordKey,
    correctionStatus,
    manualOverride: row.manualOverride ?? false,
    scheduleType: row.scheduleType ?? null,
    sourceType: row.sourceType ?? null,
    displayImageType: row.displayImageType ?? null,
    displayImageFile: row.displayImageFile ?? null,
    displayImageStatus: row.displayImageStatus ?? null
  };
});

if (effectiveOccurrences.length !== 94) {
  throw new Error(`Expected 94 occurrences, got ${effectiveOccurrences.length}`);
}
if (appliedCorrectionCount !== corrections.length) {
  throw new Error(`Applied ${appliedCorrectionCount}/${corrections.length} corrections`);
}

const output = {
  version: 1,
  stage: 'Banner Stage 2-0',
  status: 'EFFECTIVE_OCCURRENCE_INPUT_GENERATED',
  sourceSchedule: 'data/kr-banner-schedule.v1.json',
  correctionCheckpoint: 'data/checkpoints/banner-stage1-4-relation-corrections.v1.json',
  recordCount: effectiveOccurrences.length,
  appliedCorrectionCount,
  sourceMutationPerformed: false,
  policy: {
    recordedSourceRecordKey: 'Exact source schedule value preserved as provenance.',
    effectiveSourceRecordKey: 'Stage 2 source relation after applying only verified correction checkpoints.',
    manualNullSource: 'Preserved as null; no synthetic CardPool relation is created.'
  },
  records: effectiveOccurrences
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
console.log(`Wrote ${effectiveOccurrences.length} effective occurrences; corrections applied: ${appliedCorrectionCount}`);
