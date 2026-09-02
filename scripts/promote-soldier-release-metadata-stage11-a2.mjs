import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-notice-evidence-stage11-a1.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  listOutput: 'data/generated/soldier-list-stage5-8.v1.json',
  validation: 'data/validation/soldier-stage5-8-release.v1.json',
};

const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const writeJson = (rel, value) => fs.writeFileSync(path.join(root, rel), `${JSON.stringify(value, null, 2)}\n`);
const fail = message => { throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function gitBlobSha(rel) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function indexById(records, label) {
  const map = new Map();
  for (const record of records ?? []) {
    if (!Number.isInteger(record?.soldierId)) fail(`${label} has invalid soldierId`);
    if (map.has(record.soldierId)) fail(`${label} duplicate soldierId ${record.soldierId}`);
    map.set(record.soldierId, record);
  }
  return map;
}
function promotedRelease(candidate) {
  return {
    releaseStatus: 'CONFIRMED',
    releaseDate: candidate.releaseDate,
    patchGroup: candidate.releaseDate,
    samePatchOrder: null,
    sourceKind: 'OFFICIAL_CN_RELEASE_NOTICE',
    sourceLabel: candidate.canonicalNameCn,
    sourceRows: null,
    mappingStatus: 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION',
  };
}
function buildGroups(releaseRecords) {
  const groups = new Map();
  for (const record of releaseRecords) {
    if (record.releaseStatus !== 'CONFIRMED') continue;
    if (record.samePatchOrder !== null) fail(`confirmed soldierId ${record.soldierId} invents samePatchOrder`);
    const ids = groups.get(record.releaseDate) ?? [];
    ids.push(record.soldierId);
    groups.set(record.releaseDate, ids);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([releaseDate, ids]) => ({
      releaseDate,
      soldierIds: [...ids].sort((a, b) => a - b),
      samePatchOrderStatus: 'UNRESOLVED',
      internalOrder: 'soldierId-ascending-for-determinism-only',
    }));
}

const evidence = readJson(paths.evidence);
const releaseMetadata = readJson(paths.releaseMetadata);
const listOutput = readJson(paths.listOutput);
const validation = readJson(paths.validation);

if (evidence.schemaId !== 'soldier-release-official-notice-evidence/v1'
  || evidence.stage !== '11-A1'
  || evidence.status !== 'FROZEN_ADMITTED'
  || evidence.policy?.sourceAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE') {
  fail('Stage 11-A1 evidence identity/status drift');
}
if (evidence.policy?.promoteIntoStage5_8 !== false) fail('Stage 11-A1 acquisition checkpoint must remain non-promoting historical evidence');
if (!Array.isArray(evidence.records) || evidence.records.length !== 40) fail('Stage 11-A1 evidence must contain exactly 40 admitted candidates');
if (releaseMetadata.schemaId !== 'soldier-release-metadata/v1' || releaseMetadata.status !== 'PASS') fail('Stage 5-8 release metadata baseline must be PASS');
if (listOutput.schemaId !== 'soldier-list-release/v1' || listOutput.status !== 'PASS') fail('Stage 5-8 list baseline must be PASS');
if (validation.schemaId !== 'soldier-stage5-8-release-validation/v1' || validation.status !== 'PASS') fail('Stage 5-8 validation baseline must be PASS');

const baseline = releaseMetadata.summary ?? {};
if (baseline.confirmedReleaseRecords !== 11
  || baseline.unresolvedReleaseRecords !== 213
  || baseline.normalTier3Confirmed !== 11
  || baseline.normalTier3Unresolved !== 118
  || baseline.spSoldiers !== 56
  || baseline.lowerTierNormal !== 39) {
  fail(`Stage 11-A2 promoter requires exact Stage 5-8 baseline 11/213/118, got ${JSON.stringify(baseline)}`);
}

const releaseIndex = indexById(releaseMetadata.records, 'release metadata');
const listIndex = indexById(listOutput.records, 'Stage 5-8 list');
const candidateIndex = indexById(evidence.records, 'Stage 11-A1 evidence');

for (const candidate of evidence.records) {
  const releaseRecord = releaseIndex.get(candidate.soldierId);
  const listRecord = listIndex.get(candidate.soldierId);
  if (!releaseRecord || !listRecord) fail(`candidate soldierId ${candidate.soldierId} is absent from Stage 5-8 outputs`);
  if (listRecord.tier !== 3 || listRecord.isSp !== false) fail(`candidate soldierId ${candidate.soldierId} is not normal tier-3`);
  if (listRecord.nameCn !== candidate.canonicalNameCn) fail(`candidate soldierId ${candidate.soldierId} canonical Chinese label drift`);
  if (releaseRecord.releaseStatus !== 'UNRESOLVED') fail(`candidate soldierId ${candidate.soldierId} is not unresolved in baseline producer output`);
  if (candidate.samePatchOrder !== null) fail(`candidate soldierId ${candidate.soldierId} invents samePatchOrder`);

  const promoted = promotedRelease(candidate);
  Object.assign(releaseRecord, promoted);
  listRecord.release = { ...promoted };
  listRecord.sortBucket = 'NORMAL_TIER3_CONFIRMED_RELEASE';
}

if (candidateIndex.size !== 40) fail('Stage 11-A1 evidence unique candidate count drift');

const confirmed = releaseMetadata.records.filter(record => record.releaseStatus === 'CONFIRMED');
const unresolved = releaseMetadata.records.filter(record => record.releaseStatus === 'UNRESOLVED');
const officialConfirmed = confirmed.filter(record => record.sourceKind === 'OFFICIAL_CN_RELEASE_NOTICE');
const baseConfirmed = confirmed.filter(record => record.sourceKind === 'GOOGLE_SHEET');
const unresolvedTier3 = listOutput.records.filter(record => record.isSp === false && record.tier === 3 && record.release?.releaseStatus === 'UNRESOLVED');
const spRecords = listOutput.records.filter(record => record.isSp === true);
const lowerTier = listOutput.records.filter(record => record.isSp === false && record.tier !== 3);

if (confirmed.length !== 51 || unresolved.length !== 173) fail(`promoted coverage must be 51 confirmed / 173 unresolved, got ${confirmed.length}/${unresolved.length}`);
if (officialConfirmed.length !== 40 || baseConfirmed.length !== 11) fail(`confirmed provenance split must be 11 base + 40 official, got ${baseConfirmed.length}+${officialConfirmed.length}`);
if (unresolvedTier3.length !== 78 || spRecords.length !== 56 || lowerTier.length !== 39) fail('promoted unresolved partition must be 78 normal tier-3 + 56 SP + 39 lower-tier');
if (confirmed.some(record => record.samePatchOrder !== null)) fail('promotion may not create same-patch absolute order');

const groups = buildGroups(releaseMetadata.records);
const officialSource = {
  path: paths.evidence,
  gitBlobSha: gitBlobSha(paths.evidence),
  schemaId: evidence.schemaId,
  stage: evidence.stage,
  sourceAuthority: evidence.policy.sourceAuthority,
  officialEventCount: evidence.summary?.officialEventCount,
  promotedRecordCount: evidence.summary?.candidatePromotionRecordCount,
};
for (const target of [releaseMetadata, listOutput, validation]) {
  target.sources = { ...(target.sources ?? {}), officialNoticeEvidence: officialSource };
}

releaseMetadata.summary = {
  ...releaseMetadata.summary,
  confirmedReleaseRecords: 51,
  unresolvedReleaseRecords: 173,
  normalTier3Confirmed: 51,
  normalTier3Unresolved: 78,
  spSoldiers: 56,
  lowerTierNormal: 39,
};
releaseMetadata.promotion = {
  stage: '11-A2',
  status: 'PASS',
  baseConfirmedRecords: 11,
  officialNoticeOverlayRecords: 40,
  totalConfirmedRecords: 51,
  unresolvedRecords: 173,
  samePatchOrder: 'UNRESOLVED',
};

listOutput.summary = {
  ...listOutput.summary,
  confirmedReleaseCount: 51,
  unresolvedNormalTier3Count: 78,
};
listOutput.sortBuckets = {
  spSoldierIds: spRecords.map(record => record.soldierId).sort((a, b) => a - b),
  normalTier3ConfirmedReleaseGroups: groups,
  normalTier3UnresolvedSoldierIds: unresolvedTier3.map(record => record.soldierId).sort((a, b) => a - b),
  lowerTierSoldierIds: lowerTier.map(record => record.soldierId).sort((a, b) => a - b),
};
listOutput.promotion = { ...releaseMetadata.promotion };

validation.checks = { ...(validation.checks ?? {}), officialNoticePromotionMismatch: 0 };
validation.coverage = {
  ...validation.coverage,
  confirmedReleaseCount: 51,
  unresolvedReleaseCount: 173,
  unresolvedNormalTier3Count: 78,
  patchGroups: groups.map(group => ({
    releaseDate: group.releaseDate,
    count: group.soldierIds.length,
    soldierIds: group.soldierIds,
  })),
  officialNoticePromotedCount: 40,
};
validation.reviews = [
  '78 normal tier-3 Soldiers have no externally confirmed release date after the frozen Stage 5-8 base source and admitted Stage 11-A1 official-notice overlay are combined.',
  '56 SP Soldiers are grouped before normal Soldiers by UI policy; their internal release order remains unresolved because no canonical identity provenance has yet been admitted for the available SP release buckets.',
  '39 normal tier-1/tier-2 Soldiers remain in a technical bucket because release ordering is not required for the current list policy.',
  `${validation.coverage.nonPassIdentityMetadataCount} list rows retain non-PASS identity/presentation metadata from Stage 5-7.`,
  'Same-patch order is intentionally unresolved; no Soldier-ID ordering is presented as release ordering.',
];
validation.promotion = { ...releaseMetadata.promotion };

const releaseListParityErrors = [];
for (const listRecord of listOutput.records) {
  const metadataRecord = releaseIndex.get(listRecord.soldierId);
  if (!metadataRecord) {
    releaseListParityErrors.push(listRecord.soldierId);
    continue;
  }
  const projected = { soldierId: listRecord.soldierId, ...listRecord.release };
  if (!same(projected, metadataRecord)) releaseListParityErrors.push(listRecord.soldierId);
}
if (releaseListParityErrors.length) fail(`promotion release/list parity mismatch for ${releaseListParityErrors.length} Soldier IDs`);

writeJson(paths.releaseMetadata, releaseMetadata);
writeJson(paths.listOutput, listOutput);
writeJson(paths.validation, validation);

console.log('Soldier Stage 11-A2 promotion: PASS');
console.log('confirmedReleaseRecords=51');
console.log('unresolvedReleaseRecords=173');
console.log('normalTier3Unresolved=78');
console.log('provenance=11 GOOGLE_SHEET + 40 OFFICIAL_CN_RELEASE_NOTICE');
