import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-official-notice-extension-stage11-a16.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  listOutput: 'data/generated/soldier-list-stage5-8.v1.json',
  releaseValidation: 'data/validation/soldier-stage5-8-release.v1.json',
  promotionValidation: 'data/validation/soldier-release-metadata-stage11-a17-promotion.v1.json',
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
const releaseValidation = readJson(paths.releaseValidation);

if (evidence.schemaId !== 'soldier-release-official-notice-extension-stage11-a16/v1'
  || evidence.stage !== '11-A16'
  || evidence.status !== 'PASS'
  || evidence.completion !== 'OFFICIAL_CN_RELEASE_EVENT_BATCH_FROZEN_NO_PROMOTION'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition') {
  fail('Stage 11-A16 evidence identity/status drift');
}
if (evidence.policy?.sourceAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
  || evidence.policy?.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || evidence.policy?.promoteIntoStage5_8 !== false) {
  fail('Stage 11-A16 evidence authority/promotion boundary drift');
}
if (!Array.isArray(evidence.records) || evidence.records.length !== 2) fail('Stage 11-A16 must contain exactly two promotion candidates');
if (evidence.summary?.promotionEligibleRecords !== 2 || evidence.summary?.promotedRecordCountAtThisStage !== 0) fail('Stage 11-A16 promotion eligibility drift');
if (releaseMetadata.schemaId !== 'soldier-release-metadata/v1' || releaseMetadata.status !== 'PASS') fail('Stage 5-8 release metadata must be PASS');
if (listOutput.schemaId !== 'soldier-list-release/v1' || listOutput.status !== 'PASS') fail('Stage 5-8 list must be PASS');
if (releaseValidation.schemaId !== 'soldier-stage5-8-release-validation/v1' || releaseValidation.status !== 'PASS') fail('Stage 5-8 release validation must be PASS');

const baseline = releaseMetadata.summary ?? {};
if (baseline.confirmedReleaseRecords !== 51
  || baseline.unresolvedReleaseRecords !== 173
  || baseline.normalTier3Confirmed !== 51
  || baseline.normalTier3Unresolved !== 78
  || baseline.spSoldiers !== 56
  || baseline.lowerTierNormal !== 39) {
  fail(`Stage 11-A17 requires exact post-A5 baseline 51/173/78, got ${JSON.stringify(baseline)}`);
}

const expectedCandidates = new Map([
  [514, { canonicalNameCn: '海洋祭师', releaseDate: '2022-10-20' }],
  [816, { canonicalNameCn: '圣卫术师', releaseDate: '2022-10-20' }],
]);
const releaseIndex = indexById(releaseMetadata.records, 'release metadata');
const listIndex = indexById(listOutput.records, 'Stage 5-8 list');
const evidenceIndex = indexById(evidence.records, 'Stage 11-A16 evidence');
if (evidenceIndex.size !== expectedCandidates.size) fail('Stage 11-A16 candidate set drift');

for (const [soldierId, expected] of expectedCandidates) {
  const candidate = evidenceIndex.get(soldierId);
  const releaseRecord = releaseIndex.get(soldierId);
  const listRecord = listIndex.get(soldierId);
  if (!candidate || !releaseRecord || !listRecord) fail(`promotion target ${soldierId} is missing`);
  if (candidate.canonicalNameCn !== expected.canonicalNameCn || candidate.releaseDate !== expected.releaseDate) fail(`promotion target ${soldierId} evidence drift`);
  if (candidate.currentReleaseStatus !== 'UNRESOLVED' || candidate.releasePromotionEligible !== true || candidate.samePatchOrder !== null) fail(`promotion target ${soldierId} is not eligible`);
  if (listRecord.tier !== 3 || listRecord.isSp !== false || listRecord.nameCn !== expected.canonicalNameCn) fail(`promotion target ${soldierId} canonical/list boundary drift`);
  if (releaseRecord.releaseStatus !== 'UNRESOLVED' || listRecord.release?.releaseStatus !== 'UNRESOLVED') fail(`promotion target ${soldierId} is not unresolved in post-A5 baseline`);

  const promoted = promotedRelease(candidate);
  Object.assign(releaseRecord, promoted);
  listRecord.release = { ...promoted };
  listRecord.sortBucket = 'NORMAL_TIER3_CONFIRMED_RELEASE';
}

const confirmed = releaseMetadata.records.filter(record => record.releaseStatus === 'CONFIRMED');
const unresolved = releaseMetadata.records.filter(record => record.releaseStatus === 'UNRESOLVED');
const unresolvedTier3 = listOutput.records.filter(record => record.isSp === false && record.tier === 3 && record.release?.releaseStatus === 'UNRESOLVED');
const spRecords = listOutput.records.filter(record => record.isSp === true);
const lowerTier = listOutput.records.filter(record => record.isSp === false && record.tier !== 3);
const officialConfirmed = confirmed.filter(record => record.sourceKind === 'OFFICIAL_CN_RELEASE_NOTICE');
if (confirmed.length !== 53 || unresolved.length !== 171) fail(`A17 coverage must be 53 confirmed / 171 unresolved, got ${confirmed.length}/${unresolved.length}`);
if (unresolvedTier3.length !== 76 || spRecords.length !== 56 || lowerTier.length !== 39) fail('A17 unresolved partition must be 76 normal tier-3 + 56 SP + 39 lower-tier');
if (officialConfirmed.length !== 53) fail(`A17 final confirmed provenance must be 53 official records, got ${officialConfirmed.length}`);
if (confirmed.some(record => record.samePatchOrder !== null)) fail('A17 may not create same-patch absolute order');

const groups = buildGroups(releaseMetadata.records);
const promotedGroup = groups.find(group => group.releaseDate === '2022-10-20');
if (!promotedGroup || !same(promotedGroup.soldierIds, [514, 816])) fail('A17 2022-10-20 patch group must contain exactly Soldier 514 and 816');

const evidenceSource = {
  path: paths.evidence,
  gitBlobSha: gitBlobSha(paths.evidence),
  schemaId: evidence.schemaId,
  stage: evidence.stage,
  sourceAuthority: evidence.policy.sourceAuthority,
  sourceId: evidence.source?.sourceId,
  releaseDate: evidence.source?.releaseDate,
  promotedRecordCount: 2,
};
for (const target of [releaseMetadata, listOutput, releaseValidation]) {
  target.sources = { ...(target.sources ?? {}), officialNoticeExtensionStage11A16: evidenceSource };
}

releaseMetadata.summary = {
  ...releaseMetadata.summary,
  confirmedReleaseRecords: 53,
  unresolvedReleaseRecords: 171,
  normalTier3Confirmed: 53,
  normalTier3Unresolved: 76,
  spSoldiers: 56,
  lowerTierNormal: 39,
};
releaseMetadata.promotionExtension = {
  stage: '11-A17',
  status: 'PASS',
  predecessorConfirmedRecords: 51,
  promotedRecords: 2,
  totalConfirmedRecords: 53,
  unresolvedRecords: 171,
  normalTier3Unresolved: 76,
  sourceEvidence: paths.evidence,
  samePatchOrder: 'UNRESOLVED',
};

listOutput.summary = {
  ...listOutput.summary,
  confirmedReleaseCount: 53,
  unresolvedNormalTier3Count: 76,
};
listOutput.sortBuckets = {
  spSoldierIds: spRecords.map(record => record.soldierId).sort((a, b) => a - b),
  normalTier3ConfirmedReleaseGroups: groups,
  normalTier3UnresolvedSoldierIds: unresolvedTier3.map(record => record.soldierId).sort((a, b) => a - b),
  lowerTierSoldierIds: lowerTier.map(record => record.soldierId).sort((a, b) => a - b),
};
listOutput.promotionExtension = { ...releaseMetadata.promotionExtension };

releaseValidation.checks = { ...(releaseValidation.checks ?? {}), stage11A17PromotionMismatch: 0 };
releaseValidation.coverage = {
  ...releaseValidation.coverage,
  confirmedReleaseCount: 53,
  unresolvedReleaseCount: 171,
  unresolvedNormalTier3Count: 76,
  patchGroups: groups.map(group => ({ releaseDate: group.releaseDate, count: group.soldierIds.length, soldierIds: group.soldierIds })),
  stage11A17PromotedCount: 2,
};
releaseValidation.reviews = [
  '76 normal tier-3 Soldiers have no externally confirmed release date after the frozen Stage 11-A17 extension is applied.',
  '56 SP Soldiers remain a separate chronology owner scope; their internal release order is unresolved.',
  '39 normal tier-1/tier-2 Soldiers remain in a technical bucket because release ordering is not required for the current list policy.',
  `${releaseValidation.coverage.nonPassIdentityMetadataCount} list rows retain non-PASS identity/presentation metadata from Stage 5-7.`,
  'Same-patch order is intentionally unresolved; Soldier ID is used only for deterministic display inside a confirmed patch group.',
];
releaseValidation.promotionExtension = { ...releaseMetadata.promotionExtension };

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
if (releaseListParityErrors.length) fail(`A17 release/list parity mismatch for ${releaseListParityErrors.length} Soldier IDs`);

const promotionValidation = {
  version: 1,
  schemaId: 'soldier-release-metadata-stage11-a17-promotion/v1',
  stage: '11-A17',
  status: 'PASS',
  completion: 'SOLDIER_RELEASE_METADATA_2022_10_PROMOTION_COMPLETE',
  owner: 'soldier-release-metadata-promotion',
  predecessor: {
    evidence: paths.evidence,
    evidenceGitBlobSha: gitBlobSha(paths.evidence),
    postA5ConfirmedReleaseRecords: 51,
    postA5UnresolvedReleaseRecords: 173,
    postA5NormalTier3Unresolved: 78,
  },
  promotedRecords: evidence.records.map(record => ({
    soldierId: record.soldierId,
    canonicalNameCn: record.canonicalNameCn,
    releaseDate: record.releaseDate,
    samePatchOrder: null,
    sourceAuthority: 'OFFICIAL_CN_RELEASE_NOTICE',
  })),
  coverageAfter: {
    canonicalSoldiers: 224,
    confirmedReleaseRecords: 53,
    unresolvedReleaseRecords: 171,
    normalTier3Confirmed: 53,
    normalTier3Unresolved: 76,
    sp: 56,
    lowerTier: 39,
  },
  checks: {
    exactCandidateSet: true,
    exactCanonicalLabels: true,
    targetsPreviouslyUnresolved: true,
    promotedReleaseListParity: true,
    exact20221020PatchGroup: true,
    samePatchOrderUnresolved: true,
    canonicalPopulationUnchanged: true,
    spChronologyUnchanged: true,
    lowerTierBoundaryUnchanged: true,
  },
  blockers: [],
  reviews: [
    '76 normal tier-3 Soldier release dates remain unresolved and stay with soldier-release-metadata-evidence-acquisition.',
    'Same-patch order between Soldier 514 and 816 remains unresolved.',
  ],
  nextOwner: 'soldier-site-admission-refresh',
  nextStartPoint: 'Refresh only Stage 6 release/freshness projections affected by 51/173 -> 53/171 and normal tier-3 unresolved 78 -> 76. Do not recompute canonical Soldier population or Hero-Soldier relation membership.',
};

writeJson(paths.releaseMetadata, releaseMetadata);
writeJson(paths.listOutput, listOutput);
writeJson(paths.releaseValidation, releaseValidation);
writeJson(paths.promotionValidation, promotionValidation);

console.log('Soldier Stage 11-A17 promotion: PASS');
console.log('promotedSoldierIds=514,816');
console.log('confirmedReleaseRecords=53');
console.log('unresolvedReleaseRecords=171');
console.log('normalTier3Unresolved=76');
