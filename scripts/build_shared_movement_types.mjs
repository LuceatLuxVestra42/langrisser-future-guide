import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const paths = {
  contract: path.join(rootDir, 'data/contracts/hero-soldier-movement-type-presentation.v1.json'),
  jobInfo: path.join(rootDir, 'data/configdata/ConfigDataJobInfo.json'),
  soldierInfo: path.join(rootDir, 'data/configdata/ConfigDataSoldierInfo.json'),
  heroJobLinks: path.join(rootDir, 'data/generated/hero-job-links.v1.json'),
  soldierMaster: path.join(rootDir, 'data/generated/soldier-master.v1.json'),
  output: path.join(rootDir, 'data/generated/shared-movement-type-index.v1.json'),
  validation: path.join(rootDir, 'data/validation/shared-movement-type-index-final.v1.json'),
};

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function indexByIntegerId(records, label) {
  const map = new Map();
  const duplicates = [];
  for (const record of records) {
    const id = record?.ID;
    if (!Number.isInteger(id)) continue;
    if (map.has(id)) duplicates.push(id);
    else map.set(id, record);
  }
  return {
    map,
    duplicates: [...new Set(duplicates)].sort((a, b) => a - b),
    label,
  };
}

function uniqueSortedIntegers(values) {
  return [...new Set(values.filter(Number.isInteger))].sort((a, b) => a - b);
}

function countByMoveType(entries) {
  const counts = {};
  for (const entry of Object.values(entries)) {
    const key = String(entry.moveType);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => Number(a) - Number(b)));
}

function main() {
  const contract = loadJson(paths.contract);
  const jobInfo = loadJson(paths.jobInfo);
  const soldierInfo = loadJson(paths.soldierInfo);
  const heroJobLinks = loadJson(paths.heroJobLinks);
  const soldierMaster = loadJson(paths.soldierMaster);

  const hardErrors = [];

  if (!Array.isArray(jobInfo)) hardErrors.push('ConfigDataJobInfo root must be a decoded JSON array.');
  if (!Array.isArray(soldierInfo)) hardErrors.push('ConfigDataSoldierInfo root must be a decoded JSON array.');
  if (!Array.isArray(heroJobLinks?.records)) hardErrors.push('hero-job-links.v1.json records must be an array.');
  if (!Array.isArray(soldierMaster?.records)) hardErrors.push('soldier-master.v1.json records must be an array.');
  if (!Array.isArray(contract?.definitions)) hardErrors.push('movement contract definitions must be an array.');

  if (hardErrors.length) {
    const failed = {
      version: 1,
      schemaId: 'shared-movement-type-index-validation/v1',
      status: 'FAIL',
      generatedAt: new Date().toISOString(),
      hardErrors,
    };
    writeJson(paths.validation, failed);
    console.error('SHARED MOVEMENT TYPE PIPELINE: FAIL');
    for (const error of hardErrors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const definitions = contract.definitions.map((definition) => ({
    id: definition.id,
    key: definition.key,
    nameKr: definition.nameKr,
    iconFileName: definition.iconFileName,
  }));
  const definitionIds = definitions.map((definition) => definition.id);
  const allowedMoveTypes = new Set(definitionIds);

  if (definitions.length !== 5) hardErrors.push(`expected exactly 5 movement definitions, got ${definitions.length}`);
  if (new Set(definitionIds).size !== definitions.length) hardErrors.push('movement definition IDs must be unique');
  if (JSON.stringify([...definitionIds].sort((a, b) => a - b)) !== JSON.stringify([1, 2, 3, 4, 5])) {
    hardErrors.push(`movement definition IDs must be exactly 1..5, got ${definitionIds.join(', ')}`);
  }

  const jobIndex = indexByIntegerId(jobInfo, 'ConfigDataJobInfo');
  const soldierIndex = indexByIntegerId(soldierInfo, 'ConfigDataSoldierInfo');
  if (jobIndex.duplicates.length) hardErrors.push(`duplicate ConfigDataJobInfo IDs: ${jobIndex.duplicates.join(', ')}`);
  if (soldierIndex.duplicates.length) hardErrors.push(`duplicate ConfigDataSoldierInfo IDs: ${soldierIndex.duplicates.join(', ')}`);

  const heroJobIds = uniqueSortedIntegers(
    heroJobLinks.records.flatMap((hero) =>
      Array.isArray(hero?.connections) ? hero.connections.map((connection) => connection?.jobId) : [],
    ),
  );
  const soldierIds = uniqueSortedIntegers(soldierMaster.records.map((soldier) => soldier?.soldierId));

  const heroJobsById = {};
  const soldiersById = {};
  const missingHeroJobIds = [];
  const missingSoldierIds = [];
  const unknownHeroJobMoveTypes = [];
  const unknownSoldierMoveTypes = [];

  for (const jobId of heroJobIds) {
    const source = jobIndex.map.get(jobId);
    if (!source) {
      missingHeroJobIds.push(jobId);
      continue;
    }
    const moveType = source.MoveType;
    if (!Number.isInteger(moveType) || !allowedMoveTypes.has(moveType)) {
      unknownHeroJobMoveTypes.push({ jobId, moveType: moveType ?? null, nameCn: source.Name ?? null });
      continue;
    }
    heroJobsById[String(jobId)] = {
      moveType,
      movePoint: Number.isFinite(source.BF_MovePoint) ? source.BF_MovePoint : null,
      nameCn: source.Name ?? null,
    };
  }

  for (const soldierId of soldierIds) {
    const source = soldierIndex.map.get(soldierId);
    if (!source) {
      missingSoldierIds.push(soldierId);
      continue;
    }
    const moveType = source.MoveType;
    if (!Number.isInteger(moveType) || !allowedMoveTypes.has(moveType)) {
      unknownSoldierMoveTypes.push({ soldierId, moveType: moveType ?? null, nameCn: source.Name ?? null });
      continue;
    }
    soldiersById[String(soldierId)] = {
      moveType,
      movePoint: Number.isFinite(source.BF_MovePoint) ? source.BF_MovePoint : null,
      nameCn: source.Name ?? null,
    };
  }

  if (missingHeroJobIds.length) hardErrors.push(`Hero job IDs missing from ConfigDataJobInfo: ${missingHeroJobIds.join(', ')}`);
  if (missingSoldierIds.length) hardErrors.push(`canonical Soldier IDs missing from ConfigDataSoldierInfo: ${missingSoldierIds.join(', ')}`);
  if (unknownHeroJobMoveTypes.length) {
    hardErrors.push(`Hero jobs with undefined MoveType: ${unknownHeroJobMoveTypes.map((item) => `${item.jobId}:${String(item.moveType)}`).join(', ')}`);
  }
  if (unknownSoldierMoveTypes.length) {
    hardErrors.push(`Soldiers with undefined MoveType: ${unknownSoldierMoveTypes.map((item) => `${item.soldierId}:${String(item.moveType)}`).join(', ')}`);
  }

  const witnessExpectations = [
    { soldierId: 1033, expectedMoveType: 5 },
    { soldierId: 1037, expectedMoveType: 5 },
  ];
  const witnessResults = witnessExpectations.map(({ soldierId, expectedMoveType }) => {
    const source = soldierIndex.map.get(soldierId);
    return {
      soldierId,
      expectedMoveType,
      actualMoveType: source?.MoveType ?? null,
      nameCn: source?.Name ?? null,
      pass: source?.MoveType === expectedMoveType,
    };
  });
  for (const witness of witnessResults) {
    if (!witness.pass) {
      hardErrors.push(`field-army witness soldier ${witness.soldierId} expected MoveType 5, got ${String(witness.actualMoveType)}`);
    }
  }

  const status = hardErrors.length ? 'FAIL' : 'PASS';
  const generatedAt = new Date().toISOString();

  const output = {
    version: 1,
    schemaId: 'shared-movement-type-index/v1',
    status,
    generatedAt,
    contract: 'data/contracts/hero-soldier-movement-type-presentation.v1.json',
    definitions,
    heroJobsById: status === 'PASS' ? heroJobsById : {},
    soldiersById: status === 'PASS' ? soldiersById : {},
  };

  const validation = {
    version: 1,
    schemaId: 'shared-movement-type-index-validation/v1',
    status,
    generatedAt,
    sources: {
      contract: 'data/contracts/hero-soldier-movement-type-presentation.v1.json',
      heroJobs: 'data/generated/hero-job-links.v1.json',
      soldierMaster: 'data/generated/soldier-master.v1.json',
      jobInfo: 'data/configdata/ConfigDataJobInfo.json',
      soldierInfo: 'data/configdata/ConfigDataSoldierInfo.json',
    },
    summary: {
      definitionCount: definitions.length,
      canonicalHeroCount: heroJobLinks.records.length,
      heroJobCount: heroJobIds.length,
      generatedHeroJobCount: Object.keys(heroJobsById).length,
      canonicalSoldierCount: soldierIds.length,
      generatedSoldierCount: Object.keys(soldiersById).length,
      heroJobUsageByMoveType: countByMoveType(heroJobsById),
      soldierUsageByMoveType: countByMoveType(soldiersById),
      missingHeroJobCount: missingHeroJobIds.length,
      missingSoldierCount: missingSoldierIds.length,
      unknownHeroJobMoveTypeCount: unknownHeroJobMoveTypes.length,
      unknownSoldierMoveTypeCount: unknownSoldierMoveTypes.length,
      hardErrorCount: hardErrors.length,
    },
    fieldArmyWitnesses: witnessResults,
    missingHeroJobIds,
    missingSoldierIds,
    unknownHeroJobMoveTypes,
    unknownSoldierMoveTypes,
    hardErrors,
    invariants: {
      moveTypeIndependentFromMovePoint: true,
      heroMovementTypeScope: 'JOB',
      soldierMovementTypeScope: 'SOLDIER',
      runtimeConfigDataReadRequired: false,
      semanticProducerStagesReopened: false,
    },
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  console.log(`SHARED MOVEMENT TYPE PIPELINE: ${status}`);
  console.log(`definitions: ${definitions.length}`);
  console.log(`Hero jobs: ${Object.keys(heroJobsById).length}/${heroJobIds.length}`);
  console.log(`Soldiers: ${Object.keys(soldiersById).length}/${soldierIds.length}`);
  console.log(`Hero job usage: ${JSON.stringify(validation.summary.heroJobUsageByMoveType)}`);
  console.log(`Soldier usage: ${JSON.stringify(validation.summary.soldierUsageByMoveType)}`);

  if (hardErrors.length) {
    for (const error of hardErrors) console.error(`- FAIL: ${error}`);
    process.exitCode = 1;
  }
}

main();
