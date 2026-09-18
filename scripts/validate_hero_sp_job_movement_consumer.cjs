'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadArray } = require('./lib/configdata-direct.cjs');

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const fail = (message, detail = null) => {
  const error = new Error(message);
  error.detail = detail;
  throw error;
};

try {
  const contract = readJson('data/contracts/hero-sp-job-movement-consumer.v1.json');
  const range = readJson('data/generated/hero-final-job-attack-range.v1.json');
  const movementContract = readJson('data/contracts/hero-soldier-movement-type-presentation.v1.json');
  const sourcePack = readJson('data/contracts/configdata-source-pack-contract.v1.json');
  const consumer = readJson('data/generated/hero-sp-job-movement.v1.json');
  const validation = readJson('data/validation/hero-sp-job-movement.v1.json');

  if (contract?.status !== 'PRODUCER_READY' || contract?.owner !== 'hero-canonical') fail('contract drift');
  if (range?.status !== 'FROZEN') fail('SP population consumer is not frozen');
  if (consumer?.status !== 'FROZEN' || consumer?.owner !== 'hero-canonical') fail('consumer drift');
  if (validation?.status !== 'PASS' || validation?.completion !== 'COMPLETE') fail('validation drift');
  if (consumer?.source?.sourceCommitSha !== sourcePack?.authoritativePredecessor?.sourceCommitSha) fail('source commit provenance mismatch');
  if (consumer?.source?.sourceTreeGitSha1 !== sourcePack?.authoritativePredecessor?.sourceTreeGitSha1) fail('source tree provenance mismatch');

  const allowedMoveTypes = new Set((movementContract?.definitions ?? []).map((row) => row.id));
  const sourceById = new Map();
  for (const row of loadArray('ConfigDataJobInfo')) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (sourceById.has(row.ID)) fail('duplicate ConfigDataJobInfo.ID', { jobId: row.ID });
    sourceById.set(row.ID, row);
  }

  const expected = [];
  for (const rangeRecord of Object.values(range.byJobId ?? {})) {
    for (const ref of rangeRecord?.references ?? []) {
      if (ref?.kind !== 'SP') continue;
      expected.push({ heroId: ref.heroId, jobConnectionId: ref.jobConnectionId, jobId: rangeRecord.jobId });
    }
  }
  expected.sort((a, b) => a.heroId - b.heroId);
  if (expected.length !== contract.populationAuthority.requiredReleasedSpReferenceCount) {
    fail('expected SP population count drift', { expected: contract.populationAuthority.requiredReleasedSpReferenceCount, actual: expected.length });
  }

  const actualKeys = Object.keys(consumer?.byHeroId ?? {}).map(Number).sort((a,b)=>a-b);
  const expectedKeys = expected.map((row) => row.heroId).sort((a,b)=>a-b);
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) fail('SP HeroID coverage mismatch', { expectedKeys, actualKeys });

  for (const identity of expected) {
    const source = sourceById.get(identity.jobId);
    if (!source) fail('expected SP JobID missing from source', identity);
    if (!allowedMoveTypes.has(source.MoveType)) fail('source MoveType invalid', { ...identity, moveType: source.MoveType ?? null });
    if (!Number.isFinite(source.BF_MovePoint) || source.BF_MovePoint < 0) fail('source BF_MovePoint invalid', { ...identity, movePoint: source.BF_MovePoint ?? null });
    const record = consumer.byHeroId[String(identity.heroId)];
    const expectedRecord = {
      heroId: identity.heroId,
      jobConnectionId: identity.jobConnectionId,
      jobId: identity.jobId,
      nameCn: source.Name ?? null,
      moveType: source.MoveType,
      movePoint: source.BF_MovePoint,
      sourceFields: ['MoveType', 'BF_MovePoint'],
    };
    if (JSON.stringify(record) !== JSON.stringify(expectedRecord)) fail('SP movement consumer parity mismatch', { expectedRecord, record });
  }

  if (consumer.summary.releasedSpHeroCount !== expected.length || consumer.summary.releasedSpJobCount !== expected.length) fail('consumer summary count mismatch');
  if (consumer.summary.hardErrorCount !== 0 || validation.summary.hardErrorCount !== 0) fail('hard error summary drift');

  console.log(JSON.stringify({
    status:'PASS',
    releasedSpHeroCount: expected.length,
    minMovePoint: consumer.summary.minMovePoint,
    maxMovePoint: consumer.summary.maxMovePoint,
  }));
} catch (error) {
  console.error(error.message);
  if (error.detail != null) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
}
