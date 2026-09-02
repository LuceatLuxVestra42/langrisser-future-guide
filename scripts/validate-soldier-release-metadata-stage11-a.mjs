import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(message); };
const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
};
const byId = (records, id) => records.find(record => record?.id === id);

const paths = {
  inventory: 'data/validation/soldier-release-metadata-stage11-a-inventory.v1.json',
  admission: 'data/validation/soldier-stage6-7-site-admission.v1.json',
  releaseMetadata: 'data/generated/soldier-release-metadata.v1.json',
  releaseValidation: 'data/validation/soldier-stage5-8-release.v1.json',
  releaseSource: 'data/soldier-release-source.v1.json',
  officialEvidence: 'data/soldier-release-official-notice-evidence-stage11-a1.v1.json',
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

const historicalCoverage = {
  canonicalSoldiers: 224,
  confirmedReleaseRecords: 11,
  unresolvedReleaseRecords: 213,
  normalTier3Unresolved: 118,
  spUnresolved: 56,
  lowerTierReleaseOrderNotRequired: 39,
};
same(inventory.coverage, historicalCoverage, 'Stage 11-A frozen historical coverage');
if (11 + 213 !== 224 || 118 + 56 + 39 !== 213) fail('Stage 11-A historical coverage arithmetic drift');

if (releaseSource.schemaId !== 'soldier-release-source/v1'
  || releaseSource.status !== 'FROZEN_PARTIAL'
  || releaseSource.confirmedRecords?.length !== 11
  || releaseSource.coveragePolicy?.confirmedRecordCount !== 11
  || releaseSource.coveragePolicy?.allOtherSoldiers !== 'UNRESOLVED') {
  fail('Stage 11-A frozen 11-record release-source predecessor drift');
}
if (releaseSource.confirmedRecords.some(record => record.samePatchOrder !== null)) fail('frozen Stage 5-8 base source may not invent same-patch order');

const confirmedPatchGroups = [...new Set(releaseSource.confirmedRecords.map(record => record.releaseDate))]
  .sort()
  .map(releaseDate => ({
    releaseDate,
    soldierIds: releaseSource.confirmedRecords.filter(record => record.releaseDate === releaseDate).map(record => record.soldierId).sort((a, b) => a - b),
  }));
same(inventory.confirmedPatchGroups, confirmedPatchGroups, 'Stage 11-A frozen confirmed patch groups');

const inventoryRows = inventory.evidenceInventory ?? [];
if (inventoryRows.length !== 7 || new Set(inventoryRows.map(row => row.id)).size !== 7) fail('Stage 11-A evidence inventory must preserve seven unique classifications');
const frozen = byId(inventoryRows, 'frozen-stage5-8-release-source');
if (frozen?.state !== 'REUSABLE_AUTHORITATIVE_PARTIAL' || frozen.confirmedRecordCount !== 11 || frozen.unresolvedRecordCount !== 213) {
  fail('Stage 11-A frozen source evidence classification drift');
}
const officialAtCapture = byId(inventoryRows, 'official-update-notice-archive');
if (officialAtCapture?.state !== 'NOT_REGISTERED_IN_CURRENT_RELEASE_EVIDENCE_CHAIN' || officialAtCapture.canonicalAuthority !== false) {
  fail('Stage 11-A historical official-notice inventory classification drift');
}
for (const id of ['connected-google-sheet-sp-soldiers', 'connected-google-sheet-released-sp-soldiers']) {
  const evidence = byId(inventoryRows, id);
  if (evidence?.canonicalAuthority !== false || evidence.canBackfillCanonicalReleaseMetadata !== false
    || evidence.textSoldierIdentityCellValueCount !== 0 || evidence.canonicalSoldierIdCellValueCount !== 0) {
    fail(`${id} historical no-JOIN boundary drift`);
  }
}

same(inventory.acquisitionPartition, {
  normalTier3: { count: 118, disposition: 'NEXT_RELEASE_DATE_EVIDENCE_PRIORITY' },
  sp: { count: 56, disposition: 'HANDOFF_STAGE11_B_REQUIREMENT_AND_IDENTITY_PROVENANCE' },
  lowerTier: { count: 39, disposition: 'CURRENT_UI_RELEASE_ORDER_NOT_REQUIRED_BOUNDARY' },
}, 'Stage 11-A historical acquisition partition');
for (const [key, value] of Object.entries(inventory.boundaries ?? {})) {
  if (value !== false) fail(`Stage 11-A historical boundary violated: ${key}`);
}
same(inventory.reviews, [{ code: 'RELEASE_DATE_UNRESOLVED', count: 213, classification: 'REVIEW' }], 'Stage 11-A historical review handoff');

if (admission.schemaId !== 'soldier-stage6-7-site-admission-validation/v1'
  || admission.status !== 'PASS'
  || admission.admissionStatus !== 'READY_WITH_REVIEW'
  || admission.coverage?.canonicalSoldiers !== 224
  || admission.coverage?.normalSoldiers !== 168
  || admission.coverage?.spSoldiers !== 56
  || admission.coverage?.heroSoldierRelations !== 5977) {
  fail('current Stage 6-7 canonical admission identity/relation predecessor drift');
}

if (releaseMetadata.schemaId !== 'soldier-release-metadata/v1' || releaseMetadata.status !== 'PASS'
  || releaseValidation.schemaId !== 'soldier-stage5-8-release-validation/v1' || releaseValidation.status !== 'PASS') {
  fail('current Stage 5-8 release artifacts must remain PASS');
}
if (releaseMetadata.policy?.soldierIdIsReleaseOrder !== false || releaseMetadata.policy?.samePatchOrder !== 'UNRESOLVED') {
  fail('current release metadata must forbid Soldier-ID chronology and same-patch inference');
}

const current = {
  canonicalSoldiers: releaseMetadata.summary?.canonicalSoldiers,
  confirmed: releaseMetadata.summary?.confirmedReleaseRecords,
  unresolved: releaseMetadata.summary?.unresolvedReleaseRecords,
  normalTier3Unresolved: releaseMetadata.summary?.normalTier3Unresolved,
  sp: releaseMetadata.summary?.spSoldiers,
  lowerTier: releaseMetadata.summary?.lowerTierNormal,
};
const baseline = { canonicalSoldiers: 224, confirmed: 11, unresolved: 213, normalTier3Unresolved: 118, sp: 56, lowerTier: 39 };
const promoted = { canonicalSoldiers: 224, confirmed: 51, unresolved: 173, normalTier3Unresolved: 78, sp: 56, lowerTier: 39 };
const mode = JSON.stringify(current) === JSON.stringify(baseline) ? 'PRE_PROMOTION'
  : JSON.stringify(current) === JSON.stringify(promoted) ? 'PROMOTED_11_A2'
  : null;
if (!mode) fail(`current Stage 5-8 coverage is neither the frozen Stage 11-A baseline nor admitted Stage 11-A2 promotion: ${JSON.stringify(current)}`);

const validationCurrent = {
  canonicalSoldiers: releaseValidation.coverage?.canonicalSoldiers,
  confirmed: releaseValidation.coverage?.confirmedReleaseCount,
  unresolved: releaseValidation.coverage?.unresolvedReleaseCount,
  normalTier3Unresolved: releaseValidation.coverage?.unresolvedNormalTier3Count,
  sp: releaseValidation.coverage?.spCount,
  lowerTier: releaseValidation.coverage?.lowerTierCount,
};
same(validationCurrent, current, 'current Stage 5-8 metadata/validation coverage parity');

if (mode === 'PROMOTED_11_A2') {
  if (!fs.existsSync(path.join(root, paths.officialEvidence))) fail('promoted state requires Stage 11-A1 official evidence');
  if (releaseMetadata.sources?.officialNoticeEvidence?.path !== paths.officialEvidence
    || releaseValidation.sources?.officialNoticeEvidence?.path !== paths.officialEvidence) {
    fail('promoted state requires explicit official-notice evidence provenance');
  }
}

console.log(`[soldier-stage11-a] PASS: historical inventory remains 224 = 11 + 213; current release mode=${mode}.`);
