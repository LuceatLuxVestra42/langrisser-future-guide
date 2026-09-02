import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-cn-chronology-correction-evidence-stage11-a4.v1.json',
  baseSource: 'data/soldier-release-source.v1.json',
  a2Checkpoint: 'data/validation/soldier-release-metadata-stage11-a2-promotion.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  listOutput: 'data/generated/soldier-list-stage5-8.v1.json',
  validation: 'data/validation/soldier-stage5-8-release.v1.json',
  checkpoint: 'data/validation/soldier-release-metadata-stage11-a5-correction.v1.json',
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
function correctedRelease(record) {
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
const baseSource = readJson(paths.baseSource);
const a2Checkpoint = readJson(paths.a2Checkpoint);
const releaseMetadata = readJson(paths.releaseMetadata);
const listOutput = readJson(paths.listOutput);
const validation = readJson(paths.validation);

if (evidence.schemaId !== 'soldier-release-cn-chronology-correction-evidence/v1'
  || evidence.stage !== '11-A4'
  || evidence.status !== 'FROZEN_CORRECTION_READY'
  || evidence.timelineDecision?.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || evidence.timelineDecision?.officialCnAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
  || evidence.timelineDecision?.historicalGoogleSheetUseForCnChronology !== false) {
  fail('Stage 11-A4 correction evidence identity/timeline decision drift');
}
if (!Array.isArray(evidence.records) || evidence.records.length !== 11) fail('Stage 11-A4 correction evidence must contain exactly 11 records');
if (baseSource.schemaId !== 'soldier-release-source/v1' || baseSource.status !== 'FROZEN_PARTIAL' || baseSource.confirmedRecords?.length !== 11) {
  fail('historical 11-record Google Sheet source predecessor drift');
}
if (a2Checkpoint.schemaId !== 'soldier-release-metadata-stage11-a2-promotion/v1'
  || a2Checkpoint.status !== 'PASS'
  || a2Checkpoint.coverage?.confirmed !== 51
  || a2Checkpoint.coverage?.unresolved !== 173) {
  fail('Stage 11-A2 promotion checkpoint predecessor drift');
}
if (releaseMetadata.schemaId !== 'soldier-release-metadata/v1' || releaseMetadata.status !== 'PASS') fail('Stage 5-8 release metadata must be PASS');
if (listOutput.schemaId !== 'soldier-list-release/v1' || listOutput.status !== 'PASS') fail('Stage 5-8 list output must be PASS');
if (validation.schemaId !== 'soldier-stage5-8-release-validation/v1' || validation.status !== 'PASS') fail('Stage 5-8 validation must be PASS');

const summary = releaseMetadata.summary ?? {};
if (summary.canonicalSoldiers !== 224
  || summary.confirmedReleaseRecords !== 51
  || summary.unresolvedReleaseRecords !== 173
  || summary.normalTier3Confirmed !== 51
  || summary.normalTier3Unresolved !== 78
  || summary.spSoldiers !== 56
  || summary.lowerTierNormal !== 39) {
  fail(`Stage 11-A5 promoter requires exact A2 coverage 224=51+173 with 78/56/39 unresolved partition, got ${JSON.stringify(summary)}`);
}
if (releaseMetadata.promotion?.stage !== '11-A2'
  || releaseMetadata.promotion?.status !== 'PASS'
  || releaseMetadata.promotion?.baseConfirmedRecords !== 11
  || releaseMetadata.promotion?.officialNoticeOverlayRecords !== 40
  || releaseMetadata.promotion?.totalConfirmedRecords !== 51) {
  fail('Stage 11-A2 promotion marker drift before A5 correction');
}

const releaseIndex = indexById(releaseMetadata.records, 'release metadata');
const listIndex = indexById(listOutput.records, 'Stage 5-8 list');
const historicalIndex = indexById(baseSource.confirmedRecords, 'historical Google Sheet source');
const correctionIndex = indexById(evidence.records, 'Stage 11-A4 correction evidence');

for (const correction of evidence.records) {
  const releaseRecord = releaseIndex.get(correction.soldierId);
  const listRecord = listIndex.get(correction.soldierId);
  const historical = historicalIndex.get(correction.soldierId);
  if (!releaseRecord || !listRecord || !historical) fail(`correction soldierId ${correction.soldierId} missing from required predecessor`);
  if (listRecord.tier !== 3 || listRecord.isSp !== false || listRecord.nameCn !== correction.canonicalNameCn) {
    fail(`correction soldierId ${correction.soldierId} canonical identity drift`);
  }
  if (historical.releaseDate !== correction.historicalSheetReleaseDate
    || historical.patchGroup !== correction.historicalSheetReleaseDate
    || historical.sourceLabel !== correction.historicalSheetSourceLabel) {
    fail(`correction soldierId ${correction.soldierId} historical source mismatch`);
  }
  const expectedPre = {
    releaseStatus: 'CONFIRMED',
    releaseDate: correction.historicalSheetReleaseDate,
    patchGroup: correction.historicalSheetReleaseDate,
    samePatchOrder: null,
    sourceKind: 'GOOGLE_SHEET',
    sourceLabel: correction.historicalSheetSourceLabel,
    sourceRows: historical.sourceRows,
    mappingStatus: historical.mappingStatus,
  };
  const actualPre = {
    releaseStatus: releaseRecord.releaseStatus,
    releaseDate: releaseRecord.releaseDate,
    patchGroup: releaseRecord.patchGroup,
    samePatchOrder: releaseRecord.samePatchOrder,
    sourceKind: releaseRecord.sourceKind,
    sourceLabel: releaseRecord.sourceLabel,
    sourceRows: releaseRecord.sourceRows,
    mappingStatus: releaseRecord.mappingStatus,
  };
  if (!same(actualPre, expectedPre)) fail(`correction soldierId ${correction.soldierId} pre-correction A2 state drift`);
  if (!same(listRecord.release, expectedPre)) fail(`correction soldierId ${correction.soldierId} pre-correction list state drift`);
  if (correction.samePatchOrder !== null) fail(`correction soldierId ${correction.soldierId} invents samePatchOrder`);
  const corrected = correctedRelease(correction);
  Object.assign(releaseRecord, corrected);
  listRecord.release = { ...corrected };
  listRecord.sortBucket = 'NORMAL_TIER3_CONFIRMED_RELEASE';
}
if (correctionIndex.size !== 11 || historicalIndex.size !== 11) fail('A5 correction must exactly cover the 11 historical Google Sheet records');

const confirmed = releaseMetadata.records.filter(record => record.releaseStatus === 'CONFIRMED');
const unresolved = releaseMetadata.records.filter(record => record.releaseStatus === 'UNRESOLVED');
const officialConfirmed = confirmed.filter(record => record.sourceKind === 'OFFICIAL_CN_RELEASE_NOTICE');
const googleSheetConfirmed = confirmed.filter(record => record.sourceKind === 'GOOGLE_SHEET');
const unresolvedTier3 = listOutput.records.filter(record => record.isSp === false && record.tier === 3 && record.release?.releaseStatus === 'UNRESOLVED');
const spRecords = listOutput.records.filter(record => record.isSp === true);
const lowerTier = listOutput.records.filter(record => record.isSp === false && record.tier !== 3);

if (confirmed.length !== 51 || unresolved.length !== 173) fail(`A5 coverage changed unexpectedly: ${confirmed.length} confirmed / ${unresolved.length} unresolved`);
if (officialConfirmed.length !== 51 || googleSheetConfirmed.length !== 0) fail(`A5 final confirmed chronology must be 51 official CN / 0 Google Sheet, got ${officialConfirmed.length}/${googleSheetConfirmed.length}`);
if (unresolvedTier3.length !== 78 || spRecords.length !== 56 || lowerTier.length !== 39) fail('A5 unresolved partition must remain 78 normal tier-3 + 56 SP + 39 lower-tier');
if (confirmed.some(record => record.samePatchOrder !== null)) fail('A5 correction may not create same-patch absolute order');

const groups = buildGroups(releaseMetadata.records);
const correctionSource = {
  path: paths.evidence,
  gitBlobSha: gitBlobSha(paths.evidence),
  schemaId: evidence.schemaId,
  stage: evidence.stage,
  targetTimeline: evidence.timelineDecision.targetTimeline,
  sourceAuthority: evidence.timelineDecision.officialCnAuthority,
  correctionEventCount: evidence.summary?.officialCnCorrectionEvents,
  correctedRecordCount: evidence.summary?.officialCnCorrectionRecords,
};
const timeline = {
  authority: 'CN_SERVER_RELEASE_CHRONOLOGY',
  officialSourceAuthority: 'OFFICIAL_CN_RELEASE_NOTICE',
  historicalGoogleSheetAuthority: 'REGION_OR_TIMELINE_SCOPE_UNSPECIFIED',
  historicalGoogleSheetEligibleForCnChronology: false,
  correctionStage: '11-A5',
};
const correctionMarker = {
  stage: '11-A5',
  status: 'PASS',
  correctedHistoricalRecords: 11,
  officialCnCorrectionEvents: 5,
  totalOfficialCnConfirmedRecords: 51,
  totalConfirmedRecords: 51,
  unresolvedRecords: 173,
  coverageChanged: false,
  samePatchOrder: 'UNRESOLVED',
};

for (const target of [releaseMetadata, listOutput, validation]) {
  target.sources = { ...(target.sources ?? {}), cnChronologyCorrectionEvidence: correctionSource };
  if (target.sources.releaseSource) {
    target.sources.releaseSource = {
      ...target.sources.releaseSource,
      authorityRole: 'HISTORICAL_TIMELINE_UNSPECIFIED_BASE_EVIDENCE',
      eligibleForCnChronology: false,
    };
  }
  target.releaseTimeline = { ...timeline };
  target.correction = { ...correctionMarker };
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

validation.checks = {
  ...(validation.checks ?? {}),
  cnChronologyCorrectionMismatch: 0,
};
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
  cnChronologyCorrectedCount: 11,
  officialCnConfirmedCount: 51,
};
validation.reviews = [
  '78 normal tier-3 Soldiers still have no officially admitted Chinese-server release date after the Stage 11-A1 overlay and Stage 11-A5 source correction are applied.',
  '56 SP Soldiers are grouped before normal Soldiers by UI policy; their internal release order remains unresolved because no canonical identity provenance has yet been admitted for the available SP release buckets.',
  '39 normal tier-1/tier-2 Soldiers remain in a technical bucket because release ordering is not required for the current list policy.',
  `${validation.coverage.nonPassIdentityMetadataCount} list rows retain non-PASS identity/presentation metadata from Stage 5-7.`,
  'Same-patch order is intentionally unresolved; no Soldier-ID ordering is presented as release ordering.',
];

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
if (releaseListParityErrors.length) fail(`A5 release/list parity mismatch for ${releaseListParityErrors.length} Soldier IDs`);

const checkpoint = {
  version: 1,
  schemaId: 'soldier-release-metadata-stage11-a5-correction/v1',
  stage: '11-A5',
  status: 'PASS',
  completion: 'CN_CHRONOLOGY_SOURCE_CORRECTION_COMPLETE',
  owner: 'soldier-release-metadata-promotion-correction',
  scope: 'CORRECT_11_CONFIRMED_GOOGLE_SHEET_TIMELINE_VALUES_TO_OFFICIAL_CN_CHRONOLOGY',
  predecessors: {
    stage11A2Checkpoint: paths.a2Checkpoint,
    stage11A4Evidence: paths.evidence,
    historicalReleaseSource: paths.baseSource,
  },
  outputs: {
    releaseMetadata: paths.releaseMetadata,
    listOutput: paths.listOutput,
    validation: paths.validation,
  },
  correction: {
    targetTimeline: 'CN_SERVER_RELEASE_CHRONOLOGY',
    priorSourceKind: 'GOOGLE_SHEET',
    finalSourceKind: 'OFFICIAL_CN_RELEASE_NOTICE',
    historicalRecordsCorrected: 11,
    officialCorrectionEvents: 5,
    correctedByKey: 'soldierId',
    exactCnLabelRequired: true,
    coverageChanged: false,
    samePatchOrder: 'UNRESOLVED',
  },
  coverage: {
    canonicalSoldiers: 224,
    confirmed: 51,
    unresolved: 173,
    normalTier3Confirmed: 51,
    normalTier3Unresolved: 78,
    sp: 56,
    lowerTier: 39,
    officialCnConfirmed: 51,
    historicalGoogleSheetConfirmedInFinalConsumer: 0,
  },
  boundaries: {
    historicalReleaseSourceMutated: false,
    canonicalPopulationRecomputed: false,
    heroSoldierRelationRecomputed: false,
    rawConfigDataReleaseInference: false,
    nameSimilarityJoin: false,
    idArithmetic: false,
    unresolved78Inferred: false,
    samePatchOrderClaimed: false,
    spChronologyIncluded: false,
    lowerTierChronologyIncluded: false,
  },
  downstream: {
    path: 'data/validation/soldier-stage6-7-site-admission.v1.json',
    stateAfterCorrection: 'STALE_DEPENDENCY_EXPECTED',
    reason: 'Stage 11-A5 changes Stage 5-8 chronology bytes and patch-group provenance while preserving coverage and canonical Soldier identity, so release-dependent Stage 6 freshness must be refreshed without relation or population recomputation.',
  },
  blockers: [],
  reviews: [
    { code: 'NORMAL_TIER3_RELEASE_DATE_REMAINING', count: 78, classification: 'REVIEW' },
    { code: 'SP_INTERNAL_RELEASE_ORDER_SEPARATE_STAGE11_B', count: 56, classification: 'REVIEW' },
  ],
  nextOwner: 'soldier-site-admission-refresh',
  nextStartPoint: [
    'Refresh only release-dependent Stage 6 provenance/freshness after the Stage 5-8 chronology correction.',
    'Preserve canonical Soldier 224 and Hero-Soldier 5,977 without recomputation.',
    'Keep release-review count 173 and normal tier-3 unresolved count 78 unchanged.',
  ],
  reopenConditions: [
    'Any of the 11 Stage 11-A4 exact canonical mappings loses direct official Chinese release support.',
    'A stronger authoritative Chinese-server source contradicts one of the five correction events.',
    'Final Stage 5-8 coverage changes from 224 = 51 confirmed + 173 unresolved.',
  ],
};

writeJson(paths.releaseMetadata, releaseMetadata);
writeJson(paths.listOutput, listOutput);
writeJson(paths.validation, validation);
writeJson(paths.checkpoint, checkpoint);

console.log('Soldier Stage 11-A5 CN chronology correction: PASS');
console.log('correctedHistoricalRecords=11');
console.log('officialCnConfirmedRecords=51');
console.log('coverage=224 = 51 confirmed + 173 unresolved');
console.log('normalTier3Unresolved=78');
console.log('nextOwner=soldier-site-admission-refresh');
