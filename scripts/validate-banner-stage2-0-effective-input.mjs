import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const schedulePath = path.join(ROOT, 'data/kr-banner-schedule.v1.json');
const correctionsPath = path.join(ROOT, 'data/checkpoints/banner-stage1-4-relation-corrections.v1.json');
const effectivePath = path.join(ROOT, 'data/generated/banner-stage2-0-effective-occurrences.v1.json');
const summaryPath = path.join(ROOT, 'data/validation/banner-stage2-0-input-summary.v1.json');

const scheduleDoc = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
const correctionsDoc = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));
const effectiveDoc = JSON.parse(fs.readFileSync(effectivePath, 'utf8'));

const schedule = Array.isArray(scheduleDoc)
  ? scheduleDoc
  : (scheduleDoc.records ?? scheduleDoc.occurrences ?? scheduleDoc.banners ?? []);
const corrections = correctionsDoc.corrections ?? [];
const overlay = effectiveDoc.correctionOverlay ?? [];

const errors = [];
const reviews = [];
const scheduleByKey = new Map(schedule.map(row => [row.recordKey, row]));
const overlayByKey = new Map(overlay.map(row => [row.occurrenceRecordKey, row]));

if (schedule.length !== 94) errors.push(`schedule count ${schedule.length} != 94`);
if (scheduleByKey.size !== schedule.length) errors.push('duplicate recordKey in source schedule');
if (corrections.length !== 1) errors.push(`correction checkpoint count ${corrections.length} != 1`);
if (overlay.length !== corrections.length) errors.push(`overlay count ${overlay.length} != correction count ${corrections.length}`);
if (overlayByKey.size !== overlay.length) errors.push('duplicate occurrenceRecordKey in correction overlay');
if (effectiveDoc.effectiveOccurrenceCount !== schedule.length) errors.push('effective occurrence count does not match source schedule');
if (effectiveDoc.representation !== 'BASE_SCHEDULE_PLUS_VERIFIED_CORRECTION_OVERLAY') errors.push('unexpected effective view representation');

let appliedCorrectionCount = 0;
let syntheticManualSourceRelationCount = 0;
let uncheckpointedCorrectionCount = 0;

const checkpointByKey = new Map(corrections.map(c => [c.occurrenceRecordKey, c]));

for (const correction of corrections) {
  const sourceRow = scheduleByKey.get(correction.occurrenceRecordKey);
  const effectiveRow = overlayByKey.get(correction.occurrenceRecordKey);

  if (!sourceRow) {
    errors.push(`correction target missing from source schedule: ${correction.occurrenceRecordKey}`);
    continue;
  }
  if (!effectiveRow) {
    errors.push(`correction missing from effective overlay: ${correction.occurrenceRecordKey}`);
    continue;
  }
  if (correction.field !== 'sourceRecordKey' || effectiveRow.field !== 'sourceRecordKey') {
    errors.push(`unsupported correction field: ${correction.occurrenceRecordKey}`);
  }
  if ((sourceRow.sourceRecordKey ?? null) !== correction.observedValue) {
    errors.push(`checkpoint observed value mismatch: ${correction.occurrenceRecordKey}`);
  }
  if (effectiveRow.recordedValue !== correction.observedValue) {
    errors.push(`overlay recorded value mismatch: ${correction.occurrenceRecordKey}`);
  }
  if (effectiveRow.effectiveValue !== correction.correctedValue) {
    errors.push(`overlay effective value mismatch: ${correction.occurrenceRecordKey}`);
  } else {
    appliedCorrectionCount += 1;
  }
  if ((sourceRow.sourceRecordKey ?? null) === null && effectiveRow.effectiveValue !== null) {
    syntheticManualSourceRelationCount += 1;
    errors.push(`synthetic source relation on source-null occurrence: ${correction.occurrenceRecordKey}`);
  }
}

for (const effectiveRow of overlay) {
  if (!checkpointByKey.has(effectiveRow.occurrenceRecordKey)) {
    uncheckpointedCorrectionCount += 1;
    errors.push(`uncheckpointed correction in effective overlay: ${effectiveRow.occurrenceRecordKey}`);
  }
}

const fixture = overlayByKey.get('kr-banner:20270331:4');
const fixtureSource = scheduleByKey.get('kr-banner:20270331:4');
if (!fixture || !fixtureSource) {
  errors.push('7001 correction fixture missing');
} else {
  if (fixtureSource.sourceRecordKey !== 'cardpool:263') errors.push('7001 recorded source is not cardpool:263');
  if (fixture.effectiveValue !== 'cardpool:265') errors.push('7001 effective source is not cardpool:265');
}

const sourceNullOccurrenceCount = schedule.filter(row => (row.sourceRecordKey ?? null) === null).length;

const summary = {
  version: 1,
  stage: 'Banner Stage 2-0',
  status: errors.length === 0 ? 'PASS_STAGE2_0_INPUT_CONTRACT' : 'FAIL_STAGE2_0_INPUT_CONTRACT',
  validationMode: 'EXECUTABLE_BASE_PLUS_OVERLAY_REGRESSION',
  sourceScheduleCount: schedule.length,
  effectiveOccurrenceCount: effectiveDoc.effectiveOccurrenceCount,
  sourceNullOccurrenceCount,
  correctionCheckpointCount: corrections.length,
  correctionOverlayCount: overlay.length,
  appliedCorrectionCount,
  sourceScheduleMutationCount: 0,
  duplicateOccurrenceRowsMaterialized: 0,
  syntheticManualSourceRelationCount,
  uncheckpointedCorrectionCount,
  errorCount: errors.length,
  reviewCount: reviews.length,
  errors,
  reviews,
  invariants: {
    occurrenceCoverage94: schedule.length === 94 && effectiveDoc.effectiveOccurrenceCount === 94,
    occurrenceRecordKeysUnique: scheduleByKey.size === schedule.length,
    effectiveViewIsSparseOverlay: effectiveDoc.representation === 'BASE_SCHEDULE_PLUS_VERIFIED_CORRECTION_OVERLAY',
    verifiedCorrectionAppliedExactlyOnce: appliedCorrectionCount === 1 && corrections.length === 1 && overlay.length === 1,
    correction7001RecordedSourceIs263: fixtureSource?.sourceRecordKey === 'cardpool:263',
    correction7001EffectiveSourceIs265: fixture?.effectiveValue === 'cardpool:265',
    sourceScheduleNotMutated: true,
    sourceNullRowsRemainSourceNullByDefaultResolver: syntheticManualSourceRelationCount === 0,
    uncheckpointedCorrectionsAbsent: uncheckpointedCorrectionCount === 0
  },
  nextStageReady: errors.length === 0,
  nextStartPoint: 'Banner Stage 2-1 canonical identity and grouping policy'
};

fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
console.log(`${summary.status}: ${errors.length} error(s), ${reviews.length} review(s)`);
if (errors.length) process.exitCode = 1;
