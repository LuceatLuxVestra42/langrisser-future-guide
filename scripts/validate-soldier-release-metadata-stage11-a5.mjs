import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-cn-chronology-correction-evidence-stage11-a4.v1.json',
  a1Evidence: 'data/soldier-release-official-notice-evidence-stage11-a1.v1.json',
  baseSource: 'data/soldier-release-source.v1.json',
  a2Checkpoint: 'data/validation/soldier-release-metadata-stage11-a2-promotion.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  listOutput: 'data/generated/soldier-list-stage5-8.v1.json',
  validation: 'data/validation/soldier-stage5-8-release.v1.json',
  checkpoint: 'data/validation/soldier-release-metadata-stage11-a5-correction.v1.json',
};
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const push = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function indexById(records, label) {
  const map = new Map();
  for (const record of records ?? []) {
    if (!Number.isInteger(record?.soldierId)) { push(`${label} invalid soldierId`); continue; }
    if (map.has(record.soldierId)) push(`${label} duplicate soldierId ${record.soldierId}`);
    else map.set(record.soldierId, record);
  }
  return map;
}
function expectedCorrected(record) {
  return {
    releaseStatus: 'CONFIRMED',
    releaseDate: record.officialCnReleaseDate,
    patchGroup: record.officialCnReleaseDate,
    samePatchOrder: null,
    sourceKind: 'OFFICIAL_CN_RELEASE_NOTICE',
    sourceLabel: record.canonicalNameCn,
    sourceRows: null,
    mappingStatus: 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION',
  };
}

const evidence = readJson(paths.evidence);
const a1Evidence = readJson(paths.a1Evidence);
const baseSource = readJson(paths.baseSource);
const a2Checkpoint = readJson(paths.a2Checkpoint);
const releaseMetadata = readJson(paths.releaseMetadata);
const listOutput = readJson(paths.listOutput);
const validation = readJson(paths.validation);
const checkpoint = readJson(paths.checkpoint);

if (checkpoint.schemaId !== 'soldier-release-metadata-stage11-a5-correction/v1'
  || checkpoint.stage !== '11-A5'
  || checkpoint.status !== 'PASS'
  || checkpoint.completion !== 'CN_CHRONOLOGY_SOURCE_CORRECTION_COMPLETE'
  || checkpoint.owner !== 'soldier-release-metadata-promotion-correction') {
  push('Stage 11-A5 checkpoint identity/status drift');
}
if (evidence.schemaId !== 'soldier-release-cn-chronology-correction-evidence/v1'
  || evidence.stage !== '11-A4'
  || evidence.status !== 'FROZEN_CORRECTION_READY'
  || evidence.records?.length !== 11) {
  push('Stage 11-A4 correction evidence predecessor drift');
}
if (a1Evidence.schemaId !== 'soldier-release-official-notice-evidence/v1'
  || a1Evidence.status !== 'FROZEN_ADMITTED'
  || a1Evidence.records?.length !== 40) {
  push('Stage 11-A1 official evidence predecessor drift');
}
if (baseSource.schemaId !== 'soldier-release-source/v1'
  || baseSource.status !== 'FROZEN_PARTIAL'
  || baseSource.confirmedRecords?.length !== 11) {
  push('historical Google Sheet source predecessor drift');
}
if (a2Checkpoint.schemaId !== 'soldier-release-metadata-stage11-a2-promotion/v1'
  || a2Checkpoint.status !== 'PASS'
  || a2Checkpoint.coverage?.baseConfirmed !== 11
  || a2Checkpoint.coverage?.officialPromoted !== 40
  || a2Checkpoint.coverage?.confirmed !== 51
  || a2Checkpoint.coverage?.unresolved !== 173) {
  push('Stage 11-A2 checkpoint predecessor drift');
}
for (const artifact of [releaseMetadata, listOutput, validation]) {
  if (artifact.status !== 'PASS') push(`${artifact.schemaId ?? 'artifact'} must remain PASS`);
}

const rm = releaseMetadata.summary ?? {};
if (rm.canonicalSoldiers !== 224 || rm.confirmedReleaseRecords !== 51 || rm.unresolvedReleaseRecords !== 173
  || rm.normalTier3Confirmed !== 51 || rm.normalTier3Unresolved !== 78 || rm.spSoldiers !== 56 || rm.lowerTierNormal !== 39) {
  push(`release metadata coverage mismatch: ${JSON.stringify(rm)}`);
}
const lo = listOutput.summary ?? {};
if (lo.recordCount !== 224 || lo.confirmedReleaseCount !== 51 || lo.unresolvedNormalTier3Count !== 78
  || lo.spCount !== 56 || lo.lowerTierCount !== 39) {
  push(`Stage 5-8 list coverage mismatch: ${JSON.stringify(lo)}`);
}
const vc = validation.coverage ?? {};
if (vc.canonicalSoldiers !== 224 || vc.confirmedReleaseCount !== 51 || vc.unresolvedReleaseCount !== 173
  || vc.unresolvedNormalTier3Count !== 78 || vc.spCount !== 56 || vc.lowerTierCount !== 39
  || vc.officialNoticePromotedCount !== 40 || vc.cnChronologyCorrectedCount !== 11 || vc.officialCnConfirmedCount !== 51) {
  push(`Stage 5-8 validation coverage mismatch: ${JSON.stringify(vc)}`);
}
if (51 + 173 !== 224 || 78 + 56 + 39 !== 173) push('A5 coverage partition arithmetic drift');

const releaseIndex = indexById(releaseMetadata.records, 'release metadata');
const listIndex = indexById(listOutput.records, 'Stage 5-8 list');
const correctionIndex = indexById(evidence.records, 'Stage 11-A4 correction evidence');
const historicalIndex = indexById(baseSource.confirmedRecords, 'historical Google Sheet source');
const a1Index = indexById(a1Evidence.records, 'Stage 11-A1 official evidence');

for (const correction of evidence.records ?? []) {
  if (a1Index.has(correction.soldierId)) push(`A4 correction soldierId ${correction.soldierId} overlaps A1 promoted overlay`);
  const historical = historicalIndex.get(correction.soldierId);
  const releaseRecord = releaseIndex.get(correction.soldierId);
  const listRecord = listIndex.get(correction.soldierId);
  if (!historical || !releaseRecord || !listRecord) { push(`A5 correction soldierId ${correction.soldierId} missing from predecessor/output`); continue; }
  if (historical.releaseDate !== correction.historicalSheetReleaseDate || historical.sourceLabel !== correction.historicalSheetSourceLabel) {
    push(`A5 correction soldierId ${correction.soldierId} historical provenance drift`);
  }
  if (listRecord.nameCn !== correction.canonicalNameCn || listRecord.tier !== 3 || listRecord.isSp !== false) {
    push(`A5 correction soldierId ${correction.soldierId} canonical identity drift`);
  }
  const expected = expectedCorrected(correction);
  const actual = {
    releaseStatus: releaseRecord.releaseStatus,
    releaseDate: releaseRecord.releaseDate,
    patchGroup: releaseRecord.patchGroup,
    samePatchOrder: releaseRecord.samePatchOrder,
    sourceKind: releaseRecord.sourceKind,
    sourceLabel: releaseRecord.sourceLabel,
    sourceRows: releaseRecord.sourceRows,
    mappingStatus: releaseRecord.mappingStatus,
  };
  if (!same(actual, expected)) push(`A5 correction soldierId ${correction.soldierId} final metadata mismatch`);
  if (!same(listRecord.release, expected)) push(`A5 correction soldierId ${correction.soldierId} list projection mismatch`);
  if (listRecord.sortBucket !== 'NORMAL_TIER3_CONFIRMED_RELEASE') push(`A5 correction soldierId ${correction.soldierId} sort bucket drift`);
}
if (correctionIndex.size !== 11 || historicalIndex.size !== 11) push('A5 must exactly correct all 11 historical source records');

for (const candidate of a1Evidence.records ?? []) {
  const releaseRecord = releaseIndex.get(candidate.soldierId);
  const listRecord = listIndex.get(candidate.soldierId);
  if (!releaseRecord || !listRecord) { push(`A1 promoted soldierId ${candidate.soldierId} missing after A5`); continue; }
  const expected = {
    releaseStatus: 'CONFIRMED',
    releaseDate: candidate.releaseDate,
    patchGroup: candidate.releaseDate,
    samePatchOrder: null,
    sourceKind: 'OFFICIAL_CN_RELEASE_NOTICE',
    sourceLabel: candidate.canonicalNameCn,
    sourceRows: null,
    mappingStatus: 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION',
  };
  const actual = {
    releaseStatus: releaseRecord.releaseStatus,
    releaseDate: releaseRecord.releaseDate,
    patchGroup: releaseRecord.patchGroup,
    samePatchOrder: releaseRecord.samePatchOrder,
    sourceKind: releaseRecord.sourceKind,
    sourceLabel: releaseRecord.sourceLabel,
    sourceRows: releaseRecord.sourceRows,
    mappingStatus: releaseRecord.mappingStatus,
  };
  if (!same(actual, expected) || !same(listRecord.release, expected)) push(`A1 promoted soldierId ${candidate.soldierId} changed during A5`);
}

const confirmed = [...releaseIndex.values()].filter(record => record.releaseStatus === 'CONFIRMED');
const unresolved = [...releaseIndex.values()].filter(record => record.releaseStatus === 'UNRESOLVED');
const sourceKinds = confirmed.reduce((acc, record) => {
  acc[record.sourceKind] = (acc[record.sourceKind] ?? 0) + 1;
  return acc;
}, {});
if (confirmed.length !== 51 || unresolved.length !== 173) push('A5 record-level coverage drift');
if (sourceKinds.OFFICIAL_CN_RELEASE_NOTICE !== 51 || Object.keys(sourceKinds).length !== 1) {
  push(`A5 confirmed source-kind split mismatch: ${JSON.stringify(sourceKinds)}`);
}
if (confirmed.some(record => record.samePatchOrder !== null)) push('A5 confirmed records may not invent same-patch order');

for (const listRecord of listOutput.records ?? []) {
  const meta = releaseIndex.get(listRecord.soldierId);
  if (!meta) { push(`list soldierId ${listRecord.soldierId} absent from release metadata`); continue; }
  if (!same({ soldierId: listRecord.soldierId, ...listRecord.release }, meta)) push(`A5 release/list parity mismatch ${listRecord.soldierId}`);
}

const expectedGroups = new Map();
for (const record of confirmed) {
  const ids = expectedGroups.get(record.releaseDate) ?? [];
  ids.push(record.soldierId);
  expectedGroups.set(record.releaseDate, ids);
}
const normalizedExpectedGroups = [...expectedGroups.entries()]
  .sort(([a], [b]) => b.localeCompare(a))
  .map(([releaseDate, ids]) => ({ releaseDate, count: ids.length, soldierIds: [...ids].sort((a, b) => a - b) }));
if (!same(validation.coverage?.patchGroups, normalizedExpectedGroups)) push('A5 validation patch-group coverage mismatch');
const listGroups = (listOutput.sortBuckets?.normalTier3ConfirmedReleaseGroups ?? []).map(group => ({
  releaseDate: group.releaseDate,
  count: group.soldierIds?.length ?? 0,
  soldierIds: group.soldierIds,
}));
if (!same(listGroups, normalizedExpectedGroups)) push('A5 list patch-group projection mismatch');

for (const artifact of [releaseMetadata, listOutput, validation]) {
  const correctionSource = artifact.sources?.cnChronologyCorrectionEvidence;
  if (correctionSource?.path !== paths.evidence
    || correctionSource.schemaId !== evidence.schemaId
    || correctionSource.stage !== '11-A4'
    || correctionSource.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
    || correctionSource.sourceAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
    || correctionSource.correctionEventCount !== 5
    || correctionSource.correctedRecordCount !== 11
    || typeof correctionSource.gitBlobSha !== 'string' || correctionSource.gitBlobSha.length !== 40) {
    push(`${artifact.schemaId} A4 correction provenance descriptor mismatch`);
  }
  if (artifact.sources?.releaseSource?.authorityRole !== 'HISTORICAL_TIMELINE_UNSPECIFIED_BASE_EVIDENCE'
    || artifact.sources?.releaseSource?.eligibleForCnChronology !== false) {
    push(`${artifact.schemaId} historical release-source authority boundary drift`);
  }
  if (!same(artifact.releaseTimeline, {
    authority: 'CN_SERVER_RELEASE_CHRONOLOGY',
    officialSourceAuthority: 'OFFICIAL_CN_RELEASE_NOTICE',
    historicalGoogleSheetAuthority: 'REGION_OR_TIMELINE_SCOPE_UNSPECIFIED',
    historicalGoogleSheetEligibleForCnChronology: false,
    correctionStage: '11-A5',
  })) push(`${artifact.schemaId} releaseTimeline marker drift`);
  if (!same(artifact.correction, {
    stage: '11-A5',
    status: 'PASS',
    correctedHistoricalRecords: 11,
    officialCnCorrectionEvents: 5,
    totalOfficialCnConfirmedRecords: 51,
    totalConfirmedRecords: 51,
    unresolvedRecords: 173,
    coverageChanged: false,
    samePatchOrder: 'UNRESOLVED',
  })) push(`${artifact.schemaId} A5 correction marker drift`);
  if (artifact.promotion?.stage !== '11-A2' || artifact.promotion?.status !== 'PASS'
    || artifact.promotion?.baseConfirmedRecords !== 11 || artifact.promotion?.officialNoticeOverlayRecords !== 40
    || artifact.promotion?.totalConfirmedRecords !== 51 || artifact.promotion?.unresolvedRecords !== 173) {
    push(`${artifact.schemaId} historical A2 promotion marker must remain intact`);
  }
}
if (validation.checks?.officialNoticePromotionMismatch !== 0 || validation.checks?.cnChronologyCorrectionMismatch !== 0) {
  push('Stage 5-8 A2/A5 promotion/correction checks must both be zero');
}
if (validation.errors?.length) push(`Stage 5-8 validation has errors: ${validation.errors.join('; ')}`);

if (checkpoint.predecessors?.stage11A2Checkpoint !== paths.a2Checkpoint
  || checkpoint.predecessors?.stage11A4Evidence !== paths.evidence
  || checkpoint.predecessors?.historicalReleaseSource !== paths.baseSource
  || checkpoint.outputs?.releaseMetadata !== paths.releaseMetadata
  || checkpoint.outputs?.listOutput !== paths.listOutput
  || checkpoint.outputs?.validation !== paths.validation) {
  push('A5 checkpoint path contract drift');
}
if (!same(checkpoint.coverage, {
  canonicalSoldiers: 224,
  confirmed: 51,
  unresolved: 173,
  normalTier3Confirmed: 51,
  normalTier3Unresolved: 78,
  sp: 56,
  lowerTier: 39,
  officialCnConfirmed: 51,
  historicalGoogleSheetConfirmedInFinalConsumer: 0,
})) push('A5 checkpoint coverage drift');
if (checkpoint.correction?.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || checkpoint.correction?.priorSourceKind !== 'GOOGLE_SHEET'
  || checkpoint.correction?.finalSourceKind !== 'OFFICIAL_CN_RELEASE_NOTICE'
  || checkpoint.correction?.historicalRecordsCorrected !== 11
  || checkpoint.correction?.officialCorrectionEvents !== 5
  || checkpoint.correction?.correctedByKey !== 'soldierId'
  || checkpoint.correction?.exactCnLabelRequired !== true
  || checkpoint.correction?.coverageChanged !== false
  || checkpoint.correction?.samePatchOrder !== 'UNRESOLVED') {
  push('A5 checkpoint correction contract drift');
}
for (const [key, value] of Object.entries(checkpoint.boundaries ?? {})) if (value !== false) push(`A5 forbidden boundary ${key} must remain false`);
if (checkpoint.nextOwner !== 'soldier-site-admission-refresh') push(`unexpected A5 nextOwner: ${checkpoint.nextOwner}`);
if (!Array.isArray(checkpoint.blockers) || checkpoint.blockers.length !== 0) push('A5 checkpoint must have zero blockers');

if (errors.length) {
  console.error(`Soldier Stage 11-A5 CN chronology correction: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A5 CN chronology correction: PASS');
console.log('correctedHistoricalRecords=11');
console.log('confirmedProvenance=51 OFFICIAL_CN_RELEASE_NOTICE');
console.log('coverage=224 = 51 confirmed + 173 unresolved');
console.log('unresolvedPartition=78 normal tier-3 + 56 SP + 39 lower-tier');
console.log('nextOwner=soldier-site-admission-refresh');
