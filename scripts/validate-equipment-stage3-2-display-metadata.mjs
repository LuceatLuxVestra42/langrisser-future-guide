import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };

const contract = load('data/contracts/equipment-stage3-2-display-metadata.v1.json');
const stage31 = load('data/validation/equipment-stage3-1-schema-summary.v1.json');
const data = load('data/generated/equipment_stage3_2_display_metadata.json');
const records = data.records ?? [];
const ids = records.map(r => Number(r.equipmentId));
const pageReady = records.filter(r => r.pageReady === true);
const validNameStatuses = new Set(contract.statuses.nameKr);
const validIconStatuses = new Set(contract.statuses.icon);

check(records.length === contract.canonicalCount, `canonical count ${records.length}`);
check(new Set(ids).size === records.length, 'duplicate equipmentId in Stage 3-2 output');
check(pageReady.length === contract.pageReadyCount, `page-ready count ${pageReady.length}`);
check(pageReady.length === stage31.schemaReadiness.structurallyPageReady, 'Stage 3-1 page-ready count changed');
check(data.policy?.noInventedTranslation === true, 'no-invented-translation policy missing');
check(data.policy?.stage2SemanticsReopened === false, 'Stage 2 semantics unexpectedly reopened');

for (const row of records) {
  check(validNameStatuses.has(row.nameKrStatus), `invalid nameKrStatus: ${row.equipmentId}`);
  check(validIconStatuses.has(row.iconStatus), `invalid iconStatus: ${row.equipmentId}`);
  if (row.nameKr != null) {
    check(row.nameKrStatus === 'VERIFIED_REFERENCE_MATCH', `non-null Korean name is not verified: ${row.equipmentId}`);
    check(String(row.nameKr).trim().length > 0, `blank Korean name: ${row.equipmentId}`);
    check(row.nameKrSource?.url && row.nameKrSource?.sheet && Number(row.nameKrSource?.row) > 0, `missing Korean-name provenance: ${row.equipmentId}`);
    check(Number.isFinite(Number(row.nameKrSource?.matchScore)), `missing match score: ${row.equipmentId}`);
  }
  if (row.nameKrStatus === 'REVIEW_REFERENCE_MATCH') {
    check(row.nameKr == null && row.nameKrCandidate, `review match must not be promoted to display name: ${row.equipmentId}`);
    check(row.nameKrSource?.sheet, `review match missing provenance: ${row.equipmentId}`);
  }
}
for (const row of pageReady) {
  check(row.iconStatus === 'VERIFIED_DIRECT' && String(row.icon ?? '').trim(), `page-ready icon missing: ${row.equipmentId}`);
}

check(data.summary?.sourceRows?.launch === 94, `launch source rows ${data.summary?.sourceRows?.launch}`);
check(data.summary?.sourceRows?.legacyAdditional === 80, `legacy source rows ${data.summary?.sourceRows?.legacyAdditional}`);
check(data.summary?.sourceRows?.exclusiveNamed === 141, `exclusive named source rows ${data.summary?.sourceRows?.exclusiveNamed}`);
check(data.summary?.iconVerifiedPageReady === contract.completion.iconCoveragePageReady, 'page-ready icon coverage mismatch');
check(data.summary?.verifiedByClass?.['current-additional'] === 0, 'current-additional Korean names were synthesized unexpectedly');
check(data.status === 'COMPLETE_WITH_REVIEW', `unexpected Stage 3-2 status ${data.status}`);

const summary = {
  stage: '3-2', status: 'PASS', finalStageStatus: data.status,
  canonicalEquipmentCount: records.length, pageReadyEquipmentCount: pageReady.length,
  iconCoverage: { pageReadyVerified: pageReady.filter(r => r.iconStatus === 'VERIFIED_DIRECT').length, missing: pageReady.filter(r => r.iconStatus !== 'VERIFIED_DIRECT').length },
  koreanNameCoverage: {
    verified: pageReady.filter(r => r.nameKrStatus === 'VERIFIED_REFERENCE_MATCH').length,
    reviewReferenceMatch: pageReady.filter(r => r.nameKrStatus === 'REVIEW_REFERENCE_MATCH').length,
    reviewMissingName: pageReady.filter(r => r.nameKrStatus === 'REVIEW_NAME_KR').length
  },
  verifiedByClass: data.summary.verifiedByClass,
  sourceRows: data.summary.sourceRows,
  policy: { inventedTranslations: 0, stage2SemanticsReopened: false, nextStage: contract.nextStage }
};
fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/validation/equipment-stage3-2-display-metadata-summary.v1.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
