const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

const paths = {
  contract: 'data/contracts/hero-page-soldiers-stage5-3-contract.v1.json',
  heroMaster: 'data/hero-name-master.v1.json',
  byHero: 'data/generated/hero-soldier-by-hero.v1.json',
  soldierMaster: 'data/generated/soldier-master.v1.json',
  relationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
  output: 'data/generated/hero-page-soldiers-stage5-3.v1.json',
  validation: 'data/validation/hero-page-stage5-3-4.v1.json',
};

function abs(relativePath) {
  return path.join(rootDir, relativePath);
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  const filePath = abs(relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function gitBlobSha(relativePath) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${relativePath}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function uniqueSortedIntegers(values) {
  return [...new Set(values.filter(Number.isInteger))].sort((a, b) => a - b);
}

function indexRecords(records, key) {
  const map = new Map();
  const duplicates = [];
  for (const record of records) {
    const id = record?.[key];
    if (!Number.isInteger(id)) continue;
    if (map.has(id)) duplicates.push(id);
    else map.set(id, record);
  }
  return { map, duplicates: uniqueSortedIntegers(duplicates) };
}

function projectSoldier(record) {
  return {
    soldierId: record.soldierId,
    siteId: record.siteId ?? null,
    nameKr: record.nameKr ?? null,
    nameCn: record.nameCn ?? null,
    nameKrStatus: record.nameKrStatus ?? null,
    tier: record.tier ?? null,
    armyType: record.armyType ?? null,
    uiGroup: record.uiGroup ?? null,
    isSp: Boolean(record.isSp),
    normalSoldierId: Number.isInteger(record.normalSoldierId) ? record.normalSoldierId : null,
    spSoldierId: Number.isInteger(record.spSoldierId) ? record.spSoldierId : null,
    validationStatus: record.validationStatus ?? null,
  };
}

function main() {
  const generatedAt = new Date().toISOString();
  const contract = loadJson(paths.contract);
  const heroMaster = loadJson(paths.heroMaster);
  const byHero = loadJson(paths.byHero);
  const soldierMaster = loadJson(paths.soldierMaster);
  const relationValidation = loadJson(paths.relationValidation);

  const heroRecords = Array.isArray(heroMaster.records) ? heroMaster.records : [];
  const soldierRecords = Array.isArray(soldierMaster.records) ? soldierMaster.records : [];
  const heroIndex = indexRecords(heroRecords, 'heroId');
  const soldierIndex = indexRecords(soldierRecords, 'soldierId');
  const sourceByHeroId = byHero.byHeroId && typeof byHero.byHeroId === 'object' ? byHero.byHeroId : {};

  const errors = [];
  const reviews = [];

  if (contract.status !== 'FROZEN') errors.push(`contract status must be FROZEN, got ${contract.status}`);
  if (relationValidation.status !== 'PASS') {
    errors.push(`shared relation validation must be PASS, got ${relationValidation.status}`);
  }
  if (heroMaster.recordCount !== heroRecords.length) {
    errors.push(`Hero Master count mismatch: declared=${heroMaster.recordCount} actual=${heroRecords.length}`);
  }
  if (heroIndex.duplicates.length) errors.push(`duplicate Hero IDs: ${heroIndex.duplicates.join(', ')}`);
  if (soldierIndex.duplicates.length) errors.push(`duplicate Soldier IDs: ${soldierIndex.duplicates.join(', ')}`);
  if (byHero.schemaId !== 'hero-soldier-by-hero/v1') errors.push(`unexpected byHero schemaId: ${byHero.schemaId}`);

  const validationRelationSha = relationValidation?.relationSet?.gitBlobSha ?? null;
  const byHeroRelationSha = byHero?.relationSet?.gitBlobSha ?? null;
  if (!validationRelationSha || !byHeroRelationSha || validationRelationSha !== byHeroRelationSha) {
    errors.push(`relation-set blob mismatch: validation=${validationRelationSha} byHero=${byHeroRelationSha}`);
  }

  const canonicalHeroIds = heroRecords.map((record) => record.heroId).filter(Number.isInteger);
  const canonicalHeroIdSet = new Set(canonicalHeroIds);
  const sourceHeroIds = Object.keys(sourceByHeroId)
    .filter((key) => /^\d+$/.test(key))
    .map(Number);
  const sourceHeroIdSet = new Set(sourceHeroIds);
  const missingByHeroKeys = canonicalHeroIds.filter((id) => !sourceHeroIdSet.has(id)).sort((a, b) => a - b);
  const extraByHeroKeys = sourceHeroIds.filter((id) => !canonicalHeroIdSet.has(id)).sort((a, b) => a - b);

  if (missingByHeroKeys.length) errors.push(`canonical Heroes missing from byHeroId: ${missingByHeroKeys.join(', ')}`);
  if (extraByHeroKeys.length) errors.push(`unknown Hero IDs in byHeroId: ${extraByHeroKeys.join(', ')}`);
  if (Number.isInteger(byHero?.summary?.keyCount) && byHero.summary.keyCount !== sourceHeroIds.length) {
    errors.push(`byHero keyCount mismatch: declared=${byHero.summary.keyCount} actual=${sourceHeroIds.length}`);
  }

  const normalizedByHeroId = {};
  const referencedSoldierIds = new Set();
  const unknownSoldierIds = new Set();
  const duplicatePairs = [];
  const reviewHeroIds = new Set();
  const reviewSoldierIds = new Set();
  const pendingKoreanNameSoldierIds = new Set();
  const heroesWithNoSoldiers = [];
  let relationCount = 0;

  for (const hero of heroRecords) {
    if (!Number.isInteger(hero.heroId)) {
      errors.push('Hero Master contains record with invalid heroId');
      continue;
    }

    const sourceIds = Array.isArray(sourceByHeroId[String(hero.heroId)])
      ? sourceByHeroId[String(hero.heroId)]
      : [];
    const seen = new Set();
    const normalizedIds = [];

    for (const soldierId of sourceIds) {
      relationCount += 1;
      if (!Number.isInteger(soldierId)) {
        errors.push(`heroId ${hero.heroId} has non-integer Soldier ID: ${JSON.stringify(soldierId)}`);
        continue;
      }
      if (seen.has(soldierId)) {
        duplicatePairs.push({ heroId: hero.heroId, soldierId });
        continue;
      }
      seen.add(soldierId);
      normalizedIds.push(soldierId);
      referencedSoldierIds.add(soldierId);

      const soldier = soldierIndex.map.get(soldierId);
      if (!soldier) {
        unknownSoldierIds.add(soldierId);
        continue;
      }
      if (soldier.validationStatus && soldier.validationStatus !== 'PASS') {
        reviewHeroIds.add(hero.heroId);
        reviewSoldierIds.add(soldierId);
      }
      if (soldier.nameKr == null || soldier.nameKrStatus === 'pending') {
        reviewHeroIds.add(hero.heroId);
        pendingKoreanNameSoldierIds.add(soldierId);
      }
    }

    if (normalizedIds.length === 0) heroesWithNoSoldiers.push(hero.heroId);
    normalizedByHeroId[String(hero.heroId)] = normalizedIds;
  }

  if (duplicatePairs.length) errors.push(`duplicate Soldier IDs within Hero lists: ${duplicatePairs.length}`);
  if (unknownSoldierIds.size) {
    errors.push(`unknown Soldier IDs: ${[...unknownSoldierIds].sort((a, b) => a - b).join(', ')}`);
  }
  if (Number.isInteger(byHero?.summary?.relationCount) && byHero.summary.relationCount !== relationCount) {
    errors.push(`relation count mismatch: declared=${byHero.summary.relationCount} actual=${relationCount}`);
  }

  const soldiersById = {};
  for (const soldierId of [...referencedSoldierIds].sort((a, b) => a - b)) {
    const soldier = soldierIndex.map.get(soldierId);
    if (soldier) soldiersById[String(soldierId)] = projectSoldier(soldier);
  }

  if (Object.keys(normalizedByHeroId).length !== heroRecords.length) {
    errors.push(`output Hero key count mismatch: heroes=${heroRecords.length} output=${Object.keys(normalizedByHeroId).length}`);
  }
  if (Object.keys(soldiersById).length !== referencedSoldierIds.size) {
    errors.push(`output Soldier metadata count mismatch: referenced=${referencedSoldierIds.size} output=${Object.keys(soldiersById).length}`);
  }

  if (pendingKoreanNameSoldierIds.size) {
    reviews.push(`${pendingKoreanNameSoldierIds.size} referenced Soldier records have pending/missing Korean display names; canonical relations are preserved.`);
  }
  if (reviewSoldierIds.size) {
    reviews.push(`${reviewSoldierIds.size} referenced Soldier Master records carry non-PASS presentation validation status.`);
  }

  const status = errors.length ? 'FAIL' : reviews.length ? 'PASS_WITH_REVIEW' : 'PASS';
  const sources = {
    contract: { path: paths.contract, gitBlobSha: gitBlobSha(paths.contract) },
    heroMaster: { path: paths.heroMaster, gitBlobSha: gitBlobSha(paths.heroMaster) },
    byHero: {
      path: paths.byHero,
      gitBlobSha: gitBlobSha(paths.byHero),
      relationSetGitBlobSha: byHeroRelationSha,
    },
    soldierMaster: { path: paths.soldierMaster, gitBlobSha: gitBlobSha(paths.soldierMaster) },
    relationValidation: { path: paths.relationValidation, gitBlobSha: gitBlobSha(paths.relationValidation) },
  };

  const output = {
    version: 1,
    schemaId: contract?.output?.schemaId || 'hero-page-soldiers/v1',
    stage: '5-3-4',
    status,
    generatedAt,
    sources,
    summary: {
      heroCount: Object.keys(normalizedByHeroId).length,
      relationCount,
      referencedUniqueSoldierCount: referencedSoldierIds.size,
      soldierMetadataCount: Object.keys(soldiersById).length,
      heroesWithNoSoldiers: heroesWithNoSoldiers.length,
      heroesWithReviewMetadata: reviewHeroIds.size,
      reviewSoldierCount: reviewSoldierIds.size,
      pendingKoreanNameSoldierCount: pendingKoreanNameSoldierIds.size,
    },
    byHeroId: normalizedByHeroId,
    soldiersById,
  };

  const validation = {
    version: 1,
    stage: 'hero-page-5-3-4',
    status,
    generatedAt,
    sources,
    checks: {
      heroMasterCountMismatch: heroMaster.recordCount === heroRecords.length ? 0 : 1,
      duplicateHeroIds: heroIndex.duplicates.length,
      duplicateSoldierMasterIds: soldierIndex.duplicates.length,
      relationValidationNotPass: relationValidation.status === 'PASS' ? 0 : 1,
      relationSetBlobMismatch: validationRelationSha === byHeroRelationSha ? 0 : 1,
      missingByHeroKeys: missingByHeroKeys.length,
      extraByHeroKeys: extraByHeroKeys.length,
      unknownSoldierIds: unknownSoldierIds.size,
      duplicateSoldierIdsWithinHero: duplicatePairs.length,
      relationCountMismatch: Number.isInteger(byHero?.summary?.relationCount) && byHero.summary.relationCount !== relationCount ? 1 : 0,
      outputHeroCountMismatch: Object.keys(normalizedByHeroId).length === heroRecords.length ? 0 : 1,
      outputSoldierMetadataMismatch: Object.keys(soldiersById).length === referencedSoldierIds.size ? 0 : 1,
    },
    coverage: {
      canonicalHeroes: heroRecords.length,
      generatedHeroKeys: Object.keys(normalizedByHeroId).length,
      heroesWithSoldiers: heroRecords.length - heroesWithNoSoldiers.length,
      heroesWithNoSoldiers,
      relationCount,
      referencedUniqueSoldierCount: referencedSoldierIds.size,
      soldierMetadataCount: Object.keys(soldiersById).length,
      soldierMasterRecordCount: soldierRecords.length,
      heroesWithReviewMetadata: reviewHeroIds.size,
      reviewSoldierIds: [...reviewSoldierIds].sort((a, b) => a - b),
      pendingKoreanNameSoldierIds: [...pendingKoreanNameSoldierIds].sort((a, b) => a - b),
    },
    errors,
    reviews,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  console.log(`Hero Stage 5-3-4: ${status}`);
  console.log(`Hero keys: ${Object.keys(normalizedByHeroId).length}/${heroRecords.length}`);
  console.log(`Relations: ${relationCount}`);
  console.log(`Soldier metadata: ${Object.keys(soldiersById).length}/${referencedSoldierIds.size}`);
  console.log(`Review Heroes: ${reviewHeroIds.size}`);
  console.log(`Pending Korean-name Soldiers: ${pendingKoreanNameSoldierIds.size}`);

  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
