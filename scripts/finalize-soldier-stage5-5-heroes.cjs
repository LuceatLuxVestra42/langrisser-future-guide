const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
  stage5_4: 'data/generated/soldier-detail-stage5-4.v1.json',
  stage5_4Validation: 'data/validation/soldier-stage5-4-training.v1.json',
  bySoldier: 'data/generated/hero-soldier-by-soldier.v1.json',
  relationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
  output: 'data/generated/soldier-detail-stage5-5.v1.json',
  validation: 'data/validation/soldier-stage5-5-heroes.v1.json'
};
function abs(p) { return path.join(rootDir, p); }
function loadJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + '\n'); }
function gitBlobSha(p) { try { return execFileSync('git', ['rev-parse', `HEAD:${p}`], { cwd: rootDir, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch { return null; } }
function indexByInteger(records, key) {
  const map = new Map(), duplicates = [], invalid = [];
  for (const record of records) {
    const id = record?.[key];
    if (!Number.isInteger(id)) { invalid.push(id ?? null); continue; }
    if (map.has(id)) duplicates.push(id); else map.set(id, record);
  }
  return { map, duplicates: [...new Set(duplicates)].sort((a,b)=>a-b), invalid };
}
function integerKeyIds(object) { return Object.keys(object ?? {}).filter(k => /^\d+$/.test(k)).map(Number).sort((a,b)=>a-b); }
function isSortedUniqueIntegers(values) {
  if (!Array.isArray(values)) return false;
  for (let i=0;i<values.length;i+=1) {
    if (!Number.isInteger(values[i])) return false;
    if (i>0 && values[i] <= values[i-1]) return false;
  }
  return true;
}
function main() {
  const contract = loadJson(paths.contract);
  const stage5_4 = loadJson(paths.stage5_4);
  const stage5_4Validation = loadJson(paths.stage5_4Validation);
  const bySoldier = loadJson(paths.bySoldier);
  const relationValidation = loadJson(paths.relationValidation);
  const stage5Records = Array.isArray(stage5_4.records) ? stage5_4.records : [];
  const stage5Index = indexByInteger(stage5Records, 'soldierId');
  const sourceBySoldierId = bySoldier?.bySoldierId && typeof bySoldier.bySoldierId === 'object' ? bySoldier.bySoldierId : {};
  const errors = [], reviews = [];

  if (contract.status !== 'FROZEN') errors.push(`Stage 5-1 contract must be FROZEN, got ${contract.status}`);
  if (contract.schemaId !== 'soldier-detail-contract/v1') errors.push(`Unexpected Stage 5-1 schemaId: ${contract.schemaId}`);
  if (stage5_4.status !== 'PASS') errors.push(`Stage 5-4 artifact must be PASS, got ${stage5_4.status}`);
  if (stage5_4Validation.status !== 'PASS') errors.push(`Stage 5-4 validation must be PASS, got ${stage5_4Validation.status}`);
  if (bySoldier.schemaId !== 'hero-soldier-by-soldier/v1') errors.push(`Unexpected bySoldier schemaId: ${bySoldier.schemaId}`);
  if (relationValidation.status !== 'PASS') errors.push(`Shared relation validation must be PASS, got ${relationValidation.status}`);
  if (stage5Index.invalid.length) errors.push(`Stage 5-4 contains ${stage5Index.invalid.length} invalid soldierId values`);
  if (stage5Index.duplicates.length) errors.push(`Duplicate Stage 5-4 Soldier IDs: ${stage5Index.duplicates.join(', ')}`);

  const currentBySoldierBlobSha = gitBlobSha(paths.bySoldier);
  const validationBySoldierBlobSha = relationValidation?.indexes?.bySoldier?.gitBlobSha ?? null;
  const currentRelationSetSha = bySoldier?.relationSet?.gitBlobSha ?? null;
  const validationRelationSetSha = relationValidation?.relationSet?.gitBlobSha ?? null;
  if (!currentBySoldierBlobSha || currentBySoldierBlobSha !== validationBySoldierBlobSha) errors.push(`bySoldier index blob mismatch: current=${currentBySoldierBlobSha} validation=${validationBySoldierBlobSha}`);
  if (!currentRelationSetSha || currentRelationSetSha !== validationRelationSetSha) errors.push(`relation-set blob mismatch: bySoldier=${currentRelationSetSha} validation=${validationRelationSetSha}`);

  const canonicalSoldierIds = [...stage5Index.map.keys()].sort((a,b)=>a-b);
  const canonicalSet = new Set(canonicalSoldierIds);
  const sourceSoldierIds = integerKeyIds(sourceBySoldierId);
  const sourceSet = new Set(sourceSoldierIds);
  const missingBySoldierKeys = canonicalSoldierIds.filter(id => !sourceSet.has(id));
  const extraBySoldierKeys = sourceSoldierIds.filter(id => !canonicalSet.has(id));
  if (missingBySoldierKeys.length) errors.push(`Canonical Soldiers missing from bySoldierId: ${missingBySoldierKeys.join(', ')}`);
  if (extraBySoldierKeys.length) errors.push(`Unknown Soldier keys in bySoldierId: ${extraBySoldierKeys.join(', ')}`);
  if (Number.isInteger(bySoldier?.summary?.keyCount) && bySoldier.summary.keyCount !== sourceSoldierIds.length) errors.push(`bySoldier keyCount mismatch: declared=${bySoldier.summary.keyCount} actual=${sourceSoldierIds.length}`);

  const malformedHeroLists = [], duplicateHeroLists = [], records = [];
  let relationCount = 0, soldiersWithNoHeroes = 0;
  for (const soldierId of canonicalSoldierIds) {
    const base = stage5Index.map.get(soldierId);
    const raw = sourceBySoldierId[String(soldierId)];
    const finalHeroIds = Array.isArray(raw) ? [...raw] : [];
    if (!isSortedUniqueIntegers(finalHeroIds)) {
      malformedHeroLists.push(soldierId);
      if (new Set(finalHeroIds).size !== finalHeroIds.length) duplicateHeroLists.push(soldierId);
    }
    relationCount += finalHeroIds.length;
    if (!finalHeroIds.length) soldiersWithNoHeroes += 1;
    records.push({ soldierId, identity: base.identity, combat: base.combat, ability: base.ability, training: base.training, heroes: { finalHeroIds }, sp: base.sp });
  }

  if (malformedHeroLists.length) errors.push(`${malformedHeroLists.length} Soldier hero lists are not strictly sorted unique integer arrays`);
  if (duplicateHeroLists.length) errors.push(`${duplicateHeroLists.length} Soldier hero lists contain duplicate Hero IDs`);
  const declaredRelationCount = bySoldier?.summary?.relationCount;
  const contractRelationCount = contract?.baseline?.relationEdges;
  const contractKeyCount = contract?.baseline?.relationBySoldierKeys;
  if (Number.isInteger(declaredRelationCount) && relationCount !== declaredRelationCount) errors.push(`relation count mismatch: generated=${relationCount} bySoldier=${declaredRelationCount}`);
  if (Number.isInteger(contractRelationCount) && relationCount !== contractRelationCount) errors.push(`relation count mismatch: generated=${relationCount} contract=${contractRelationCount}`);
  if (Number.isInteger(contractKeyCount) && sourceSoldierIds.length !== contractKeyCount) errors.push(`bySoldier key count mismatch: actual=${sourceSoldierIds.length} contract=${contractKeyCount}`);
  if (records.length !== stage5Records.length) errors.push(`output record count mismatch: output=${records.length} stage5-4=${stage5Records.length}`);

  const failedRelationChecks = Object.entries(relationValidation?.checks ?? {}).filter(([,v]) => typeof v === 'number' && v !== 0).map(([k]) => k);
  if (failedRelationChecks.length) errors.push(`Shared relation validation has non-zero checks: ${failedRelationChecks.join(', ')}`);
  const nonPassIdentityMetadataCount = records.filter(r => r.identity?.validationStatus && r.identity.validationStatus !== 'PASS').length;
  if (nonPassIdentityMetadataCount) reviews.push(`${nonPassIdentityMetadataCount} Soldier identity records retain non-PASS presentation metadata; final Hero membership is unaffected.`);

  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = bySoldier.generatedAt ?? relationValidation.generatedAt ?? stage5_4.generatedAt ?? null;
  const sources = {
    contract: { path: paths.contract, gitBlobSha: gitBlobSha(paths.contract) },
    stage5_4: { path: paths.stage5_4, gitBlobSha: gitBlobSha(paths.stage5_4) },
    stage5_4Validation: { path: paths.stage5_4Validation, gitBlobSha: gitBlobSha(paths.stage5_4Validation) },
    bySoldier: { path: paths.bySoldier, gitBlobSha: currentBySoldierBlobSha, relationSetGitBlobSha: currentRelationSetSha },
    relationValidation: { path: paths.relationValidation, gitBlobSha: gitBlobSha(paths.relationValidation) }
  };
  const output = {
    version: 1, schemaId: 'soldier-detail-heroes/v1', stage: '5-5', status, generatedAt,
    technicalOrder: 'soldierId-ascending; not release order',
    completedSections: ['identity','combat','ability','training','heroes','sp.description'],
    pendingSections: ['sp.stage1','sp.stage2','sp.statDelta','list','releaseMetadata'],
    heroMembershipOwnership: 'Copied only from data/generated/hero-soldier-by-soldier.v1.json; Stage 5 does not recompute relation membership.',
    sources,
    summary: { recordCount: records.length, bySoldierKeyCount: sourceSoldierIds.length, relationCount, soldiersWithNoHeroes, nonPassIdentityMetadataCount },
    records
  };
  const validation = {
    version: 1, schemaId: 'soldier-stage5-5-heroes-validation/v1', stage: '5-5', status, generatedAt, sources,
    checks: {
      contractNotFrozen: contract.status === 'FROZEN' ? 0 : 1,
      stage5_4NotPass: stage5_4.status === 'PASS' ? 0 : 1,
      stage5_4ValidationNotPass: stage5_4Validation.status === 'PASS' ? 0 : 1,
      relationValidationNotPass: relationValidation.status === 'PASS' ? 0 : 1,
      duplicateStage5Ids: stage5Index.duplicates.length,
      invalidStage5Ids: stage5Index.invalid.length,
      bySoldierBlobMismatch: currentBySoldierBlobSha === validationBySoldierBlobSha ? 0 : 1,
      relationSetBlobMismatch: currentRelationSetSha === validationRelationSetSha ? 0 : 1,
      missingBySoldierKeys: missingBySoldierKeys.length,
      extraBySoldierKeys: extraBySoldierKeys.length,
      malformedHeroLists: malformedHeroLists.length,
      duplicateHeroLists: duplicateHeroLists.length,
      relationCountMismatch: Number.isInteger(declaredRelationCount) && relationCount !== declaredRelationCount ? 1 : 0,
      contractRelationCountMismatch: Number.isInteger(contractRelationCount) && relationCount !== contractRelationCount ? 1 : 0,
      contractKeyCountMismatch: Number.isInteger(contractKeyCount) && sourceSoldierIds.length !== contractKeyCount ? 1 : 0,
      sharedRelationNonZeroChecks: failedRelationChecks.length,
      outputRecordCountMismatch: records.length === stage5Records.length ? 0 : 1
    },
    coverage: { canonicalSoldiers: canonicalSoldierIds.length, generatedRecords: records.length, bySoldierKeys: sourceSoldierIds.length, relationCount, soldiersWithNoHeroes, nonPassIdentityMetadataCount, missingBySoldierKeys, extraBySoldierKeys, malformedHeroLists, duplicateHeroLists },
    errors, reviews
  };
  writeJson(paths.output, output);
  writeJson(paths.validation, validation);
  console.log(`Soldier Stage 5-5: ${status}`);
  console.log(`Records: ${records.length}/${stage5Records.length}`);
  console.log(`bySoldier keys: ${sourceSoldierIds.length}`);
  console.log(`Relations: ${relationCount}`);
  console.log(`Soldiers with no Heroes: ${soldiersWithNoHeroes}`);
  if (errors.length) { for (const error of errors) console.error(`ERROR: ${error}`); process.exitCode = 1; }
}
main();
