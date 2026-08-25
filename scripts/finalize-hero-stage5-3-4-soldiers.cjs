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

function uniqueIntegers(values) {
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
  return { map, duplicates: uniqueIntegers(duplicates) };
}

function soldierProjection(record) {
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

  const errors = [];
  const reviews = [];

  if (contract.status !== 'FROZEN') errors.push(`contract status must be FROZEN, got ${contract.status}`);
  if (relationValidation.status !== 'PASS') {
    errors.push(`shared relation validation must be PASS, got ${relationValidation.status}`);
  }
  if (heroMaster.recordCount !== heroRecords.length) {
    errors.push(`Hero Master count mismatch: declared=${heroMaster.recordCount} actual=${heroRecords.length}`);
  }
  if (heroIndex.duplicates.length) {
    errors.push(`duplicate Hero Master heroIds: ${heroIndex.duplicates.join(', ')}`);
  }
  if (soldierIndex.duplicates.length) {
    errors.push(`duplicate Soldier Master soldierIds: ${soldierIndex.duplicates.join(', ')}`);
  }
  if (byHero.schemaId !== 'hero-soldier-by-hero/v1') {
    errors.push(`unexpected byHero schemaId: ${byHero.schemaId}`);
  }

  const validationRelationSha = relationValidation?.relationSet?.gitBlobSha ?? null;
  const byHeroRelationSha = byHero?.relationSet?.gitBlobSha ?? null;
  if (!validationRelationSha || !byHeroRelationSha || validationRelationSha !== byHeroRelationSha) {
    errors.push(`relation-set blob mismatch: validation=${validationRelationSha} byHero=${byHeroRelationSha}`);
  }

  const byHeroId = byHero.byHeroId && typeof byHero.byHeroId === 'object' ? byHero.byHeroId : {};
  const canonicalHeroIds = heroRecords.map((record) => record.heroId).filter(Number.isInteger).sort((a, b) => a - b);
  const canonicalHeroIdSet = new Set(canonicalHeroIds);
  const byHeroKeys = Object.keys(byHeroId)
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b);
  const byHeroKeySet = new Set(byHeroKeys);

  const missingByHeroKeys = canonicalHeroIds.filter((heroId) => !byHeroKeySet.has(heroId));
  const extraByHeroKeys = byHeroKeys.filter((heroId) => !canonicalHeroIdSet.has(heroId));
  if (missingByHeroKeys.length) errors.push(`canonical Heroes missing from byHeroId: ${missingByHeroKeys.join(', ')}`);
  if (extraByHeroKeys.length) errors.push(`unknown Hero IDs in byHeroId: ${extraByHeroKeys.join(', ')}`);

  if (Number.isInteger(byHero?.summary?.keyCount) && byHero.summary.keyCount !== byHeroKeys.length) {
    errors.push(`byHero keyCount mismatch: declared=${byHero.summary.keyCount} actual=${byHeroKeys.length}`);
  }

  const outputRecords = [];
  const unknownSoldierIds = new Set();
  const duplicateSoldierIdsWithinHero = [];
  const referencedSoldierIds = new Set();
  const reviewSoldierIds = new Set();
  const pendingKoreanNameSoldierIds = new Set();
  const reviewHeroIds = new Set();
  let relationCount = 0;

  for (const hero of heroRecords) {
    if (!Number.isInteger(hero.heroId)) {
      errors.push('Hero Master contains record with invalid heroId');
      continue;
    }

    const sourceSoldierIds = Array.isArray(byHeroId[String(hero.heroId)])
      ? byHeroId[String(hero.heroId)]
      : [];
    const seen = new Set();
    const soldiers = [];

    for (const soldierId of sourceSoldierIds) {
      relationCount += 1;
      if (!Number.isInteger(soldierId)) {
        errors.push(`heroId ${hero.heroId} has non-integer Soldier ID: ${JSON.stringify(soldierId)}`);
        continue;
      }
      if (seen.has(soldierId)) {
        duplicateSoldierIdsWithinHero.push({ heroId: hero.heroId, soldierId });
        continue;
      }
      seen.add(soldierId);
      referencedSoldierIds.add(soldierId);

      const soldier = soldierIndex.map.get(soldierId);
      if (!soldier) {
        unknownSoldierIds.add(soldierId);
        continue;
      }

      if (soldier.validationStatus && soldier.validationStatus !== 'PASS') {
        reviewSoldierIds.add(soldierId);
        reviewHeroIds.add(hero.heroId);
      }
      if (soldier.nameKr == null || soldier.nameKrStatus === 'pending') {
        pendingKoreanNameSoldierIds.add(soldierId);
        reviewHeroIds.add(hero.heroId);
      }

      soldiers.push(soldierProjection(soldier));
    }

    outputRecords.push({
      heroId: hero.heroId,
      soldierCount: soldiers.length,
      soldiers,
    });
  }

  if (duplicateSoldierIdsWithinHero.length) {
    errors.push(`duplicate Soldier IDs within Hero lists: ${duplicateSoldierIdsWithinHero.length}`);
  }
  if (unknownSoldierIds.size) {
    errors.push(`unknown Soldier IDs referenced by byHeroId: ${[...unknownSoldierIds].sort((a, b) => a - b).join(', ')}`);
  }
  if (Number.isInteger(byHero?.summary?.relationCount) && byHero.summary.relationCount !== relationCount) {
    errors.push(`relation count mismatch: declared=${byHero.summary.relationCount} actual=${relationCount}`);
  }
  if (outputRecords.length !== heroRecords.length) {
    errors.push(`output record count mismatch: heroMaster=${heroRecords.length} output=${outputRecords.length}`);
  }

  if (pendingKoreanNameSoldierIds.size) {
    reviews.push(`${pendingKoreanNameSoldierIds.size} referenced Soldier records have pending/missing Korean display names; canonical relations are preserved.`);
  }
  if (reviewSoldierIds.size) {
    reviews.push(`${reviewSoldierIds.size} referenced Soldier Master records carry non-PASS presentation validation status.`);
  }

  const status = errors.length ? 'FAIL' : reviews.length ? 'PASS_WITH_REVIEW' : 'PASS';
  const heroesWithNoSoldiers = outputRecords.filter((record) => record.soldierCount === 0).map((record) => record.heroId);

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
      heroCount: outputRecords.length,
      relationCount,
      referencedUniqueSoldierCount: referencedSoldierIds.size,
      soldierMasterRecordCount: soldierRecords.length,
      heroesWithNoSoldiers: heroesWithNoSoldiers.length,
      heroesWithReviewMetadata: reviewHeroIds.size,
      reviewSoldierCount: reviewSoldierIds.size,
      pendingKoreanNameSoldierCount: pendingKoreanNameSoldierIds.size,
    },
    records: outputRecords,
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
      duplicateSoldierIdsWithinHero: duplicateSoldierIdsWithinHero.length,
      relationCountMismatch: Number.isInteger(byHero?.summary?.relationCount) && byHero.summary.relationCount !== relationCount ? 1 : 0,
      outputHeroCountMismatch: outputRecords.length === heroRecords.length ? 0 : 1,
    },
    coverage: {
      canonicalHeroes: heroRecords.length,
      generatedHeroBlocks: outputRecords.length,
      heroesWithSoldiers: outputRecords.length - heroesWithNoSoldiers.length,
      heroesWithNoSoldiers,
      relationCount,
      referencedUniqueSoldierCount: referencedSoldierIds.size,
      soldierMasterRecordCount: soldierRecords.length,
      heroIdsWithReviewMetadata: [...reviewHeroIds].sort((a, b) => a - b),
      reviewSoldierIds: [...reviewSoldierIds].sort((a, b) => a - b),
      pendingKoreanNameSoldierIds: [...pendingKoreanNameSoldierIds].sort((a, b) => a - b),
    },
    errors,
    reviews,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  console.log(`Hero Stage 5-3-4: ${status}`);
  console.log(`Hero blocks: ${outputRecords.length}/${heroRecords.length}`);
  console.log(`Relations: ${relationCount}`);
  console.log(`Referenced Soldiers: ${referencedSoldierIds.size}/${soldierRecords.length}`);
  console.log(`Review Heroes: ${reviewHeroIds.size}`);
  console.log(`Pending Korean-name Soldiers: ${pendingKoreanNameSoldierIds.size}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
