import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
const fail = message => { throw new Error(message); };
const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
};
const byId = (records, id) => records.find(record => record?.id === id);
const gitHistory = relative => execFileSync('git', ['log', '--format=%H', '--', relative], {
  cwd: repoRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
}).trim().split(/\r?\n/).filter(Boolean);

const paths = {
  inventory: 'data/validation/soldier-release-metadata-stage11-a-inventory.v1.json',
  admission: 'data/validation/soldier-stage6-7-site-admission.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  releaseValidation: 'data/validation/soldier-stage5-8-release.v1.json',
  releaseSource: 'data/soldier-release-source.v1.json',
  configDataSoldier: 'data/configdata/ConfigDataSoldierInfo.json',
};

const inventory = readJson(paths.inventory);
const admission = readJson(paths.admission);
const releaseMetadata = readJson(paths.releaseMetadata);
const releaseValidation = readJson(paths.releaseValidation);
const releaseSource = readJson(paths.releaseSource);

if (inventory.schemaId !== 'soldier-release-metadata-stage11-a-inventory/v1'
  || inventory.stage !== '11-A'
  || inventory.status !== 'PASS'
  || inventory.completion !== 'EVIDENCE_INVENTORY_COMPLETE_WITH_UNRESOLVED_REVIEW'
  || inventory.owner !== 'soldier-canonical'
  || inventory.scope !== 'INVENTORY_ONLY_NO_RELEASE_BACKFILL') {
  fail('Stage 11-A inventory identity/status drift');
}

same(inventory.authoritativeSources, {
  siteAdmission: paths.admission,
  releaseMetadata: paths.releaseMetadata,
  releaseValidation: paths.releaseValidation,
  releaseSource: paths.releaseSource,
}, 'Stage 11-A authoritative source paths');

if (admission.schemaId !== 'soldier-stage6-7-site-admission-validation/v1'
  || admission.status !== 'PASS'
  || admission.admissionStatus !== 'READY_WITH_REVIEW') {
  fail('current Soldier site-admission predecessor must remain PASS/READY_WITH_REVIEW');
}
if (releaseMetadata.schemaId !== 'soldier-release-metadata/v1'
  || releaseMetadata.status !== 'PASS'
  || releaseMetadata.releaseCoverageStatus !== 'PARTIAL_CONFIRMED_WITH_UNRESOLVED_REVIEW') {
  fail('Stage 5-8 release metadata predecessor drift');
}
if (releaseValidation.schemaId !== 'soldier-stage5-8-release-validation/v1'
  || releaseValidation.status !== 'PASS') {
  fail('Stage 5-8 release validation predecessor drift');
}
if (releaseSource.schemaId !== 'soldier-release-source/v1'
  || releaseSource.status !== 'FROZEN_PARTIAL') {
  fail('Stage 5-8 frozen partial release source drift');
}

const expectedCoverage = {
  canonicalSoldiers: 224,
  confirmedReleaseRecords: 11,
  unresolvedReleaseRecords: 213,
  normalTier3Unresolved: 118,
  spUnresolved: 56,
  lowerTierReleaseOrderNotRequired: 39,
};
same(inventory.coverage, expectedCoverage, 'Stage 11-A inventory coverage');
same({
  canonicalSoldiers: releaseMetadata.summary?.canonicalSoldiers,
  confirmedReleaseRecords: releaseMetadata.summary?.confirmedReleaseRecords,
  unresolvedReleaseRecords: releaseMetadata.summary?.unresolvedReleaseRecords,
  normalTier3Unresolved: releaseMetadata.summary?.normalTier3Unresolved,
  spUnresolved: releaseMetadata.summary?.spSoldiers,
  lowerTierReleaseOrderNotRequired: releaseMetadata.summary?.lowerTierNormal,
}, expectedCoverage, 'Stage 5-8 release metadata coverage');
same({
  canonicalSoldiers: releaseValidation.coverage?.canonicalSoldiers,
  confirmedReleaseRecords: releaseValidation.coverage?.confirmedReleaseCount,
  unresolvedReleaseRecords: releaseValidation.coverage?.unresolvedReleaseCount,
  normalTier3Unresolved: releaseValidation.coverage?.unresolvedNormalTier3Count,
  spUnresolved: releaseValidation.coverage?.spCount,
  lowerTierReleaseOrderNotRequired: releaseValidation.coverage?.lowerTierCount,
}, expectedCoverage, 'Stage 5-8 release validation coverage');

if (expectedCoverage.confirmedReleaseRecords + expectedCoverage.unresolvedReleaseRecords !== expectedCoverage.canonicalSoldiers) {
  fail('11 confirmed + 213 unresolved must equal the canonical 224 Soldiers');
}
if (expectedCoverage.normalTier3Unresolved + expectedCoverage.spUnresolved + expectedCoverage.lowerTierReleaseOrderNotRequired
  !== expectedCoverage.unresolvedReleaseRecords) {
  fail('213 unresolved must remain partitioned as 118 normal tier-3 + 56 SP + 39 lower-tier');
}

same({
  canonicalSoldiers: admission.coverage?.canonicalSoldiers,
  normalSoldiers: admission.coverage?.normalSoldiers,
  spSoldiers: admission.coverage?.spSoldiers,
  passRecords: admission.coverage?.passRecords,
  reviewRecords: admission.coverage?.reviewRecords,
  heroSoldierRelations: admission.coverage?.heroSoldierRelations,
}, {
  canonicalSoldiers: 224,
  normalSoldiers: 168,
  spSoldiers: 56,
  passRecords: 11,
  reviewRecords: 213,
  heroSoldierRelations: 5977,
}, 'Stage 6-7 admission preservation');

const admissionReview = code => admission.reviews?.find(review => review.code === code);
if (admissionReview('RELEASE_DATE_UNRESOLVED')?.count !== 213
  || admissionReview('RELEASE_DATE_UNRESOLVED')?.classification !== 'REVIEW') {
  fail('RELEASE_DATE_UNRESOLVED must remain an explicit 213-count REVIEW');
}
if (admissionReview('SP_INTERNAL_RELEASE_ORDER_UNRESOLVED')?.count !== 56) {
  fail('SP internal release-order review must remain 56 for Stage 11-B handoff');
}
if (admissionReview('LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED')?.count !== 39) {
  fail('lower-tier release-order-not-required boundary must remain 39');
}

if (releaseMetadata.policy?.soldierIdIsReleaseOrder !== false
  || releaseMetadata.policy?.samePatchOrder !== 'UNRESOLVED') {
  fail('release metadata must continue to forbid Soldier-ID chronology and same-patch inference');
}
if (!Array.isArray(releaseSource.confirmedRecords) || releaseSource.confirmedRecords.length !== 11
  || releaseSource.coveragePolicy?.confirmedRecordCount !== 11
  || releaseSource.coveragePolicy?.allOtherSoldiers !== 'UNRESOLVED') {
  fail('frozen Stage 5-8 release source coverage drift');
}
if (releaseSource.confirmedRecords.some(record => record.samePatchOrder !== null)) {
  fail('confirmed Stage 5-8 records may not invent same-patch order');
}

const confirmedPatchGroups = [...new Map(releaseSource.confirmedRecords.map(record => [record.releaseDate, []])).entries()]
  .map(([releaseDate]) => ({
    releaseDate,
    soldierIds: releaseSource.confirmedRecords
      .filter(record => record.releaseDate === releaseDate)
      .map(record => record.soldierId)
      .sort((a, b) => a - b),
  }))
  .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
same(inventory.confirmedPatchGroups, confirmedPatchGroups, 'confirmed Stage 5-8 patch groups');

const sourceExternal = releaseSource.externalSource;
const validationExternal = releaseValidation.sources?.externalReleaseSource;
if (sourceExternal?.kind !== 'GOOGLE_SHEET'
  || sourceExternal.spreadsheetId !== '1Oa7afFUhP21SRLSJ0uzP9oUc5C1_Cij0JqRExzUJGFo'
  || sourceExternal.sheetName !== '신규용병') {
  fail('frozen external release-source descriptor drift');
}
same(validationExternal, sourceExternal, 'Stage 5-8 external release-source parity');

const inventoryRows = inventory.evidenceInventory ?? [];
if (inventoryRows.length !== 7 || new Set(inventoryRows.map(row => row.id)).size !== 7) {
  fail('Stage 11-A evidence inventory must contain seven unique evidence classifications');
}
const frozenSourceEvidence = byId(inventoryRows, 'frozen-stage5-8-release-source');
if (frozenSourceEvidence?.state !== 'REUSABLE_AUTHORITATIVE_PARTIAL'
  || frozenSourceEvidence.confirmedRecordCount !== 11
  || frozenSourceEvidence.unresolvedRecordCount !== 213) {
  fail('frozen Stage 5-8 release-source evidence classification drift');
}

const newSoldierSheet = byId(inventoryRows, 'connected-google-sheet-new-soldiers');
if (newSoldierSheet?.canonicalAuthority !== false
  || newSoldierSheet.spreadsheetId !== sourceExternal.spreadsheetId
  || newSoldierSheet.sheetName !== sourceExternal.sheetName
  || newSoldierSheet.dateGroupCount !== sourceExternal.dateCells?.length
  || newSoldierSheet.textSoldierLabelCount !== 11
  || newSoldierSheet.matchesFrozenConfirmedRecordCount !== 11) {
  fail('connected 신규용병 read-only observation drift');
}

for (const id of ['connected-google-sheet-sp-soldiers', 'connected-google-sheet-released-sp-soldiers']) {
  const evidence = byId(inventoryRows, id);
  if (evidence?.canonicalAuthority !== false
    || evidence.textSoldierIdentityCellValueCount !== 0
    || evidence.canonicalSoldierIdCellValueCount !== 0
    || evidence.canBackfillCanonicalReleaseMetadata !== false
    || !String(evidence.disposition ?? '').startsWith('DO_NOT_JOIN_BY_')) {
    fail(`${id} must remain a non-canonical no-JOIN observation`);
  }
}
if (byId(inventoryRows, 'connected-google-sheet-sp-soldiers')?.dateGroupCellCount !== 5) {
  fail('SP용병 observation must preserve the five visible date-group cells without mapping identities');
}

const releaseHistoryEvidence = byId(inventoryRows, 'release-source-git-history');
const configHistoryEvidence = byId(inventoryRows, 'configdata-soldier-git-history');
const currentReleaseHistory = gitHistory(paths.releaseSource);
const currentConfigHistory = gitHistory(paths.configDataSoldier);
same(currentReleaseHistory, releaseHistoryEvidence?.commits, 'release-source git history');
same(currentConfigHistory, configHistoryEvidence?.commits, 'ConfigDataSoldierInfo git history');
if (releaseHistoryEvidence?.commitCount !== currentReleaseHistory.length
  || releaseHistoryEvidence?.state !== 'NO_FURTHER_RELEASE_EVIDENCE_IN_CURRENT_HISTORY') {
  fail('release-source history inventory drift');
}
if (configHistoryEvidence?.commitCount !== currentConfigHistory.length
  || configHistoryEvidence?.usableChronologySnapshotPairs !== 0
  || configHistoryEvidence?.state !== 'NOT_A_PATCH_SNAPSHOT_SERIES') {
  fail('ConfigData Soldier history must remain classified as non-chronology evidence');
}

const officialEvidence = byId(inventoryRows, 'official-update-notice-archive');
if (officialEvidence?.state !== 'NOT_REGISTERED_IN_CURRENT_RELEASE_EVIDENCE_CHAIN'
  || officialEvidence.canonicalAuthority !== false) {
  fail('official-update notice archive must remain a future acquisition candidate, not current authority');
}

same(inventory.acquisitionPartition, {
  normalTier3: { count: 118, disposition: 'NEXT_RELEASE_DATE_EVIDENCE_PRIORITY' },
  sp: { count: 56, disposition: 'HANDOFF_STAGE11_B_REQUIREMENT_AND_IDENTITY_PROVENANCE' },
  lowerTier: { count: 39, disposition: 'CURRENT_UI_RELEASE_ORDER_NOT_REQUIRED_BOUNDARY' },
}, 'Stage 11-A acquisition partition');

for (const [key, value] of Object.entries(inventory.boundaries ?? {})) {
  if (value !== false) fail(`Stage 11-A forbidden inference/mutation boundary violated: ${key}`);
}
for (const requiredBoundary of [
  'canonicalPopulationRecomputed',
  'heroSoldierRelationRecomputed',
  'rawConfigDataReleaseInference',
  'nameJoin',
  'idArithmetic',
  'filenameSimilarity',
  'screenOrRowOrderMapping',
  'abilityTextSimilarityMapping',
  'externalDriveMutation',
]) {
  if (!Object.prototype.hasOwnProperty.call(inventory.boundaries ?? {}, requiredBoundary)) {
    fail(`Stage 11-A boundary missing: ${requiredBoundary}`);
  }
}

if (!Array.isArray(inventory.blockers) || inventory.blockers.length !== 0) {
  fail('Stage 11-A evidence inventory has no hard blocker; unresolved dates remain review work');
}
same(inventory.reviews, [{ code: 'RELEASE_DATE_UNRESOLVED', count: 213, classification: 'REVIEW' }], 'Stage 11-A review handoff');
if (inventory.nextOwner !== 'soldier-release-metadata-evidence-acquisition'
  || !Array.isArray(inventory.nextStartPoint) || inventory.nextStartPoint.length !== 4
  || !Array.isArray(inventory.reopenConditions) || inventory.reopenConditions.length < 1) {
  fail('Stage 11-A handoff/checkpoint metadata drift');
}

console.log('[soldier-stage11-a] PASS: evidence inventory fixed at 224 = 11 confirmed + 213 unresolved (118 normal tier-3 + 56 SP + 39 lower-tier); no chronology inference or external mutation performed.');
