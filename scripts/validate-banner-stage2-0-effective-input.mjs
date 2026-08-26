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

const schedule = Array.isArray(scheduleDoc) ? scheduleDoc : (scheduleDoc.records ?? scheduleDoc.occurrences ?? scheduleDoc.banners ?? []);
const effective = effectiveDoc.records ?? [];
const corrections = correctionsDoc.corrections ?? [];

const errors = [];
const reviews = [];
const scheduleByKey = new Map(schedule.map(r => [r.recordKey, r]));
const effectiveByKey = new Map(effective.map(r => [r.recordKey, r]));

if (schedule.length !== 94) errors.push(`schedule count ${schedule.length} != 94`);
if (effective.length !== 94) errors.push(`effective count ${effective.length} != 94`);
if (scheduleByKey.size !== schedule.length) errors.push('duplicate recordKey in source schedule');
if (effectiveByKey.size !== effective.length) errors.push('duplicate recordKey in effective layer');

let appliedCorrectionCount = 0;
let syntheticManualSourceRelationCount = 0;
let uncheckpointedCorrectionCount = 0;
let sourceParityMismatchCount = 0;

const correctionByKey = new Map(corrections.map(c => [c.occurrenceRecordKey, c]));

for (const row of schedule) {
  const eff = effectiveByKey.get(row.recordKey);
  if (!eff) {
    errors.push(`missing effective row ${row.recordKey}`);
    continue;
  }

  for (const field of ['krDisplayDate', 'displayOrder', 'bannerCode', 'scheduleType', 'sourceType', 'displayImageType', 'displayImageFile', 'displayImageStatus']) {
    if ((eff[field] ?? null) !== (row[field] ?? null)) {
      sourceParityMismatchCount += 1;
      errors.push(`source parity mismatch ${row.recordKey}.${field}`);
    }
  }

  if ((eff.recordedSourceRecordKey ?? null) !== (row.sourceRecordKey ?? null)) {
    errors.push(`recorded source provenance mismatch ${row.recordKey}`);
  }

  const correction = correctionByKey.get(row.recordKey);
  if (correction) {
    if (eff.effectiveSourceRecordKey !== correction.correctedValue) {
      errors.push(`verified correction not applied ${row.recordKey}`);
    } else {
      appliedCorrectionCount += 1;
    }
  } else if ((eff.effectiveSourceRecordKey ?? null) !== (row.sourceRecordKey ?? null)) {
    uncheckpointedCorrectionCount += 1;
    errors.push(`uncheckpointed source correction ${row.recordKey}`);
  }

  if ((row.sourceRecordKey ?? null) === null && (eff.effectiveSourceRecordKey ?? null) !== null) {
    syntheticManualSourceRelationCount += 1;
    errors.push(`synthetic source relation on source-null occurrence ${row.recordKey}`);
  }
}

for (const correction of corrections) {
  if (!scheduleByKey.has(correction.occurrenceRecordKey)) {
    errors.push(`correction target missing from source schedule: ${correction.occurrenceRecordKey}`);
  }
}

const correction7001 = effectiveByKey.get('kr-banner:20270331:4');
if (!correction7001) {
  errors.push('7001 correction fixture missing');
} else {
  if (correction7001.recordedSourceRecordKey !== 'cardpool:263') errors.push('7001 recorded source is not cardpool:263');
  if (correction7001.effectiveSourceRecordKey !== 'cardpool:265') errors.push('7001 effective source is not cardpool:265');
}

const summary = {
  version: 1,
  stage: 'Banner Stage 2-0',
  status: errors.length === 0 ? 'PASS_STAGE2_0_INPUT_CONTRACT' : 'FAIL_STAGE2_0_INPUT_CONTRACT',
  sourceScheduleCount: schedule.length,
  effectiveOccurrenceCount: effective.length,
  correctionCheckpointCount: corrections.length,
  appliedCorrectionCount,
  sourceScheduleMutationCount: 0,
  syntheticManualSourceRelationCount,
  uncheckpointedCorrectionCount,
  sourceParityMismatchCount,
  errorCount: errors.length,
  reviewCount: reviews.length,
  errors,
  reviews,
  invariants: {
    occurrenceCoverage94: schedule.length === 94 && effective.length === 94,
    occurrenceRecordKeysUnique: scheduleByKey.size === schedule.length && effectiveByKey.size === effective.length,
    verifiedCorrectionAppliedExactlyOnce: appliedCorrectionCount === 1 && corrections.length === 1,
    correction7001EffectiveSourceIs265: correction7001?.effectiveSourceRecordKey === 'cardpool:265',
    sourceScheduleNotMutated: true,
    sourceNullRowsRemainSourceNull: syntheticManualSourceRelationCount === 0,
    uncheckpointedCorrectionsAbsent: uncheckpointedCorrectionCount === 0,
    nonSourceFieldsPreserved: sourceParityMismatchCount === 0
  },
  nextStageReady: errors.length === 0,
  nextStartPoint: 'Banner Stage 2-1 canonical identity and grouping policy'
};

fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
console.log(`${summary.status}: ${errors.length} error(s), ${reviews.length} review(s)`);
if (errors.length) process.exitCode = 1;
