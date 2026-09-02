import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-notice-evidence-stage11-a1.v1.json',
  baseSource: 'data/soldier-release-source.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  listOutput: 'data/generated/soldier-list-stage5-8.v1.json',
  validation: 'data/validation/soldier-stage5-8-release.v1.json',
  checkpoint: 'data/validation/soldier-release-metadata-stage11-a2-promotion.v1.json',
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

const evidence = readJson(paths.evidence);
const baseSource = readJson(paths.baseSource);
const releaseMetadata = readJson(paths.releaseMetadata);
const listOutput = readJson(paths.listOutput);
const validation = readJson(paths.validation);
const checkpoint = readJson(paths.checkpoint);

if (checkpoint.schemaId !== 'soldier-release-metadata-stage11-a2-promotion/v1'
  || checkpoint.stage !== '11-A2'
  || checkpoint.status !== 'PASS'
  || checkpoint.completion !== 'RELEASE_METADATA_PROMOTION_COMPLETE'
  || checkpoint.owner !== 'soldier-release-metadata-promotion') {
  push('Stage 11-A2 checkpoint identity/status drift');
}
if (evidence.schemaId !== 'soldier-release-official-notice-evidence/v1'
  || evidence.status !== 'FROZEN_ADMITTED'
  || evidence.records?.length !== 40) {
  push('Stage 11-A1 evidence predecessor drift');
}
if (baseSource.schemaId !== 'soldier-release-source/v1'
  || baseSource.status !== 'FROZEN_PARTIAL'
  || baseSource.confirmedRecords?.length !== 11) {
  push('Stage 5-8 base release source must remain the frozen 11-record predecessor');
}
for (const artifact of [releaseMetadata, listOutput, validation]) {
  if (artifact.status !== 'PASS') push(`${artifact.schemaId ?? 'artifact'} must be PASS`);
}

const expectedCoverage = {
  canonicalSoldiers: 224,
  baseConfirmed: 11,
  officialPromoted: 40,
  confirmed: 51,
  unresolved: 173,
  normalTier3Confirmed: 51,
  normalTier3Unresolved: 78,
  sp: 56,
  lowerTier: 39,
};
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
  || vc.officialNoticePromotedCount !== 40) {
  push(`Stage 5-8 validation coverage mismatch: ${JSON.stringify(vc)}`);
}
if (!same(checkpoint.coverage, expectedCoverage)) push('Stage 11-A2 checkpoint coverage drift');

if (51 + 173 !== 224) push('51 confirmed + 173 unresolved must equal canonical 224');
if (78 + 56 + 39 !== 173) push('173 unresolved must partition as 78 normal tier-3 + 56 SP + 39 lower-tier');
if (11 + 40 !== 51) push('confirmed provenance split must be 11 base + 40 official');

const releaseIndex = indexById(releaseMetadata.records, 'release metadata');
const listIndex = indexById(listOutput.records, 'Stage 5-8 list');
const evidenceIndex = indexById(evidence.records, 'Stage 11-A1 evidence');
const baseIndex = indexById(baseSource.confirmedRecords, 'Stage 5-8 base source');

for (const source of baseSource.confirmedRecords ?? []) {
  const record = releaseIndex.get(source.soldierId);
  if (!record) { push(`base confirmed soldierId ${source.soldierId} missing`); continue; }
  if (record.releaseStatus !== 'CONFIRMED'
    || record.releaseDate !== source.releaseDate
    || record.patchGroup !== source.patchGroup
    || record.samePatchOrder !== null
    || record.sourceKind !== 'GOOGLE_SHEET'
    || record.sourceLabel !== source.sourceLabel
    || !same(record.sourceRows, source.sourceRows)
    || record.mappingStatus !== source.mappingStatus) {
    push(`base confirmed soldierId ${source.soldierId} changed during promotion`);
  }
}

for (const candidate of evidence.records ?? []) {
  if (baseIndex.has(candidate.soldierId)) push(`official candidate ${candidate.soldierId} overlaps frozen base source`);
  const record = releaseIndex.get(candidate.soldierId);
  const listRecord = listIndex.get(candidate.soldierId);
  if (!record || !listRecord) { push(`official candidate ${candidate.soldierId} missing from promoted outputs`); continue; }
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
    releaseStatus: record.releaseStatus,
    releaseDate: record.releaseDate,
    patchGroup: record.patchGroup,
    samePatchOrder: record.samePatchOrder,
    sourceKind: record.sourceKind,
    sourceLabel: record.sourceLabel,
    sourceRows: record.sourceRows,
    mappingStatus: record.mappingStatus,
  };
  if (!same(actual, expected)) push(`official candidate ${candidate.soldierId} promotion mismatch`);
  if (!same(listRecord.release, expected)) push(`official candidate ${candidate.soldierId} list release projection mismatch`);
  if (listRecord.sortBucket !== 'NORMAL_TIER3_CONFIRMED_RELEASE') push(`official candidate ${candidate.soldierId} sort bucket mismatch`);
}
if (evidenceIndex.size !== 40) push(`official evidence unique candidate count must be 40, got ${evidenceIndex.size}`);

const confirmed = [...releaseIndex.values()].filter(record => record.releaseStatus === 'CONFIRMED');
const unresolved = [...releaseIndex.values()].filter(record => record.releaseStatus === 'UNRESOLVED');
const sourceKinds = confirmed.reduce((acc, record) => {
  acc[record.sourceKind] = (acc[record.sourceKind] ?? 0) + 1;
  return acc;
}, {});
if (!same(sourceKinds, { GOOGLE_SHEET: 11, OFFICIAL_CN_RELEASE_NOTICE: 40 })) {
  push(`confirmed source-kind split mismatch: ${JSON.stringify(sourceKinds)}`);
}
if (confirmed.length !== 51 || unresolved.length !== 173) push('record-level confirmed/unresolved coverage mismatch');
if (confirmed.some(record => record.samePatchOrder !== null)) push('confirmed records may not invent same-patch order');

for (const listRecord of listOutput.records ?? []) {
  const meta = releaseIndex.get(listRecord.soldierId);
  if (!meta) { push(`list soldierId ${listRecord.soldierId} absent from release metadata`); continue; }
  if (!same({ soldierId: listRecord.soldierId, ...listRecord.release }, meta)) push(`release/list parity mismatch ${listRecord.soldierId}`);
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
if (!same(validation.coverage?.patchGroups, normalizedExpectedGroups)) push('validation patch-group coverage mismatch');

for (const artifact of [releaseMetadata, listOutput, validation]) {
  const src = artifact.sources?.officialNoticeEvidence;
  if (src?.path !== paths.evidence
    || src.schemaId !== evidence.schemaId
    || src.stage !== '11-A1'
    || src.sourceAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
    || src.officialEventCount !== 19
    || src.promotedRecordCount !== 40
    || typeof src.gitBlobSha !== 'string' || src.gitBlobSha.length !== 40) {
    push(`${artifact.schemaId} official-notice provenance descriptor mismatch`);
  }
  if (artifact.promotion?.stage !== '11-A2' || artifact.promotion?.status !== 'PASS'
    || artifact.promotion?.baseConfirmedRecords !== 11 || artifact.promotion?.officialNoticeOverlayRecords !== 40
    || artifact.promotion?.totalConfirmedRecords !== 51 || artifact.promotion?.unresolvedRecords !== 173
    || artifact.promotion?.samePatchOrder !== 'UNRESOLVED') {
    push(`${artifact.schemaId} promotion marker mismatch`);
  }
}

if (validation.errors?.length) push(`Stage 5-8 validation has errors: ${validation.errors.join('; ')}`);
if (validation.checks?.officialNoticePromotionMismatch !== 0) push('officialNoticePromotionMismatch check must be zero');

if (checkpoint.predecessors?.stage11A1Evidence !== paths.evidence
  || checkpoint.outputs?.releaseMetadata !== paths.releaseMetadata
  || checkpoint.outputs?.listOutput !== paths.listOutput
  || checkpoint.outputs?.validation !== paths.validation) {
  push('Stage 11-A2 checkpoint path contract drift');
}
if (checkpoint.boundaries?.baseReleaseSourceMutated !== false
  || checkpoint.boundaries?.canonicalPopulationRecomputed !== false
  || checkpoint.boundaries?.heroSoldierRelationRecomputed !== false
  || checkpoint.boundaries?.samePatchOrderClaimed !== false
  || checkpoint.boundaries?.spChronologyIncluded !== false
  || checkpoint.boundaries?.lowerTierChronologyIncluded !== false) {
  push('Stage 11-A2 forbidden boundary drift');
}
if (checkpoint.nextOwner !== 'soldier-site-admission-refresh') push(`unexpected Stage 11-A2 nextOwner: ${checkpoint.nextOwner}`);
if (!Array.isArray(checkpoint.blockers) || checkpoint.blockers.length !== 0) push('Stage 11-A2 checkpoint must have zero blockers');

if (errors.length) {
  console.error(`Soldier Stage 11-A2 release promotion: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A2 release promotion: PASS');
console.log('coverage=224 = 51 confirmed + 173 unresolved');
console.log('unresolvedPartition=78 normal tier-3 + 56 SP + 39 lower-tier');
console.log('confirmedProvenance=11 GOOGLE_SHEET + 40 OFFICIAL_CN_RELEASE_NOTICE');
console.log('nextOwner=soldier-site-admission-refresh');
