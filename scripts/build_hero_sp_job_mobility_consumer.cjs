'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadArray } = require('./lib/configdata-direct.cjs');

const CONTRACT = 'data/contracts/hero-sp-job-movement-consumer.v1.json';
const RANGE = 'data/generated/hero-final-job-attack-range.v1.json';
const MOVEMENT_CONTRACT = 'data/contracts/hero-soldier-movement-type-presentation.v1.json';
const SOURCE_PACK = 'data/contracts/configdata-source-pack-contract.v1.json';
const OUTPUT = 'data/generated/hero-sp-job-movement.v1.json';
const VALIDATION = 'data/validation/hero-sp-job-movement.v1.json';

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const writeJson = (relative, value) => {
  const file = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const fail = (message, detail = null) => {
  const error = new Error(message);
  error.detail = detail;
  throw error;
};

function build() {
  const contract = readJson(CONTRACT);
  const range = readJson(RANGE);
  const movementContract = readJson(MOVEMENT_CONTRACT);
  const sourcePack = readJson(SOURCE_PACK);

  if (contract?.status !== 'PRODUCER_READY' || contract?.owner !== 'hero-canonical') fail('SP movement contract drift');
  if (range?.status !== 'FROZEN' || range?.summary?.releasedSpReferenceCount !== contract.populationAuthority.requiredReleasedSpReferenceCount) {
    fail('frozen SP population consumer drift');
  }
  const allowedMoveTypes = new Set((movementContract?.definitions ?? []).map((row) => row.id));
  if (allowedMoveTypes.size !== 5 || [1,2,3,4,5].some((id) => !allowedMoveTypes.has(id))) fail('movement definition set drift');

  const sourceRows = loadArray('ConfigDataJobInfo');
  const sourceById = new Map();
  for (const row of sourceRows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (sourceById.has(row.ID)) fail('duplicate ConfigDataJobInfo.ID', { jobId: row.ID });
    sourceById.set(row.ID, row);
  }

  const records = [];
  const seenHeroes = new Set();
  const seenConnections = new Set();
  const seenJobs = new Set();
  for (const rangeRecord of Object.values(range.byJobId ?? {})) {
    for (const ref of rangeRecord?.references ?? []) {
      if (ref?.kind !== 'SP') continue;
      const heroId = ref.heroId;
      const jobConnectionId = ref.jobConnectionId;
      const jobId = rangeRecord.jobId;
      if (![heroId, jobConnectionId, jobId].every((value) => Number.isInteger(value) && value > 0)) {
        fail('invalid frozen SP identity', { heroId, jobConnectionId, jobId });
      }
      if (seenHeroes.has(heroId) || seenConnections.has(jobConnectionId) || seenJobs.has(jobId)) {
        fail('duplicate frozen SP identity', { heroId, jobConnectionId, jobId });
      }
      seenHeroes.add(heroId);
      seenConnections.add(jobConnectionId);
      seenJobs.add(jobId);

      const source = sourceById.get(jobId);
      if (!source) fail('SP JobID missing from ConfigDataJobInfo', { heroId, jobId });
      if (!allowedMoveTypes.has(source.MoveType)) fail('SP JobID has undefined MoveType', { heroId, jobId, moveType: source.MoveType ?? null });
      if (!Number.isFinite(source.BF_MovePoint) || source.BF_MovePoint < 0) fail('SP JobID has invalid BF_MovePoint', { heroId, jobId, movePoint: source.BF_MovePoint ?? null });

      records.push({
        heroId,
        jobConnectionId,
        jobId,
        nameCn: source.Name ?? null,
        moveType: source.MoveType,
        movePoint: source.BF_MovePoint,
        sourceFields: ['MoveType', 'BF_MovePoint'],
      });
    }
  }
  records.sort((a, b) => a.heroId - b.heroId);
  if (records.length !== contract.populationAuthority.requiredReleasedSpReferenceCount) {
    fail('released SP movement population mismatch', { expected: contract.populationAuthority.requiredReleasedSpReferenceCount, actual: records.length });
  }

  const consumer = {
    version: 1,
    stage: 'hero-sp-job-movement-consumer',
    status: 'FROZEN',
    owner: 'hero-canonical',
    semanticAuthority: contract.semanticAuthority,
    source: {
      sourceCommitSha: sourcePack?.authoritativePredecessor?.sourceCommitSha ?? null,
      sourceTreeGitSha1: sourcePack?.authoritativePredecessor?.sourceTreeGitSha1 ?? null,
      logicalPath: 'data/configdata/ConfigDataJobInfo.json',
      populationConsumer: RANGE,
      movementDefinitions: MOVEMENT_CONTRACT,
    },
    summary: {
      releasedSpHeroCount: records.length,
      releasedSpJobCount: seenJobs.size,
      minMovePoint: records.length ? Math.min(...records.map((row) => row.movePoint)) : null,
      maxMovePoint: records.length ? Math.max(...records.map((row) => row.movePoint)) : null,
      hardErrorCount: 0,
    },
    byHeroId: Object.fromEntries(records.map((row) => [String(row.heroId), row])),
    boundaries: contract.boundaries,
  };
  writeJson(OUTPUT, consumer);

  writeJson(VALIDATION, {
    version: 1,
    stage: 'hero-sp-job-movement-consumer',
    status: 'PASS',
    completion: 'COMPLETE',
    owner: 'hero-canonical',
    expectedBaseHead: contract.expectedBaseHead,
    summary: {
      releasedSpHeroCount: records.length,
      releasedSpJobCount: seenJobs.size,
      missingSourceJobCount: 0,
      invalidMoveTypeCount: 0,
      invalidMovePointCount: 0,
      hardErrorCount: 0,
    },
    consumer: OUTPUT,
    validator: 'scripts/validate_hero_sp_job_mobility_consumer.cjs',
    nextOwner: 'hero-frontend',
    decision: 'Reuse frozen released-SP final-job identities and resolve movement fields by exact numeric JobID only.',
  });
}

try {
  build();
  console.log('hero SP job mobility consumer: generated');
} catch (error) {
  console.error(error.message);
  if (error.detail != null) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
}
