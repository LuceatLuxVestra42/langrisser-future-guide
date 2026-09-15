'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadArray } = require('./lib/configdata-direct.cjs');

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
}

function fail(message, detail = null) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

function collectExpectedJobIds(manifest) {
  const ids = new Set();
  let normalReferenceCount = 0;
  let releasedSpReferenceCount = 0;
  for (const [heroIdKey, meta] of Object.entries(manifest?.storage?.byHeroId ?? {})) {
    const heroId = Number(heroIdKey);
    const shard = readJson(meta.path);
    if (shard.heroId !== heroId) fail('hero shard identity mismatch', { heroId, shardHeroId: shard.heroId });

    const connections = Array.isArray(shard?.normal?.jobTree?.connections) ? shard.normal.jobTree.connections : [];
    const byConnectionId = new Map(connections.map((row) => [row.jobConnectionId, row]));
    const branches = Array.isArray(shard?.normal?.jobTree?.branches) ? shard.normal.jobTree.branches : [];
    for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
      const branch = branches[branchIndex];
      if (!Array.isArray(branch) || branch.length === 0) continue;
      const capstone = byConnectionId.get(branch[branch.length - 1]);
      if (!capstone) fail('missing branch capstone', { heroId, branchIndex });
      if (capstone?.job?.rank !== 4) continue;
      if (!Number.isInteger(capstone.jobId) || capstone.jobId !== capstone?.job?.id) {
        fail('invalid normal capstone JobID parity', { heroId, branchIndex, jobId: capstone.jobId, nestedJobId: capstone?.job?.id });
      }
      ids.add(capstone.jobId);
      normalReferenceCount += 1;
    }

    if (shard?.sp?.status === 'RELEASED') {
      const jobId = shard?.sp?.job?.jobId;
      if (!Number.isInteger(jobId) || jobId <= 0) fail('released SP missing explicit JobID', { heroId, jobId });
      ids.add(jobId);
      releasedSpReferenceCount += 1;
    }
  }
  return { ids, normalReferenceCount, releasedSpReferenceCount };
}

try {
  const contract = readJson('data/contracts/hero-final-job-attack-range-consumer.v1.json');
  const manifest = readJson('data/generated/hero-detail.v1.json');
  const consumer = readJson('data/generated/hero-final-job-attack-range.v1.json');
  const validation = readJson('data/validation/hero-final-job-attack-range.v1.json');
  const sourcePack = readJson('data/contracts/configdata-source-pack-contract.v1.json');

  if (contract?.owner !== 'hero-canonical' || contract?.status !== 'PRODUCER_READY') fail('contract drift');
  if (consumer?.status !== 'FROZEN' || consumer?.owner !== 'hero-canonical') fail('consumer drift');
  if (validation?.status !== 'PASS' || validation?.completion !== 'COMPLETE') fail('validation output drift');
  if (consumer?.source?.sourceCommitSha !== sourcePack?.authoritativePredecessor?.sourceCommitSha) fail('source commit provenance mismatch');
  if (consumer?.source?.sourceTreeGitSha1 !== sourcePack?.authoritativePredecessor?.sourceTreeGitSha1) fail('source tree provenance mismatch');

  const expected = collectExpectedJobIds(manifest);
  const actualIds = Object.keys(consumer?.byJobId ?? {}).map(Number).sort((a, b) => a - b);
  const expectedIds = [...expected.ids].sort((a, b) => a - b);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    fail('consumer JobID set mismatch', { expectedIds, actualIds });
  }

  const sourceRows = loadArray('ConfigDataJobInfo');
  const sourceById = new Map();
  for (const row of sourceRows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (sourceById.has(row.ID)) fail('duplicate ConfigDataJobInfo.ID', { jobId: row.ID });
    sourceById.set(row.ID, row);
  }

  for (const jobId of expectedIds) {
    const source = sourceById.get(jobId);
    if (!source) fail('expected JobID missing in source', { jobId });
    const attackRange = source.BF_AttackDistance;
    if (!Number.isInteger(attackRange) || attackRange <= 0) fail('invalid source BF_AttackDistance', { jobId, attackRange });
    const record = consumer.byJobId[String(jobId)];
    if (!record || record.jobId !== jobId || record.attackRange !== attackRange || record.sourceField !== 'BF_AttackDistance') {
      fail('consumer parity mismatch', { jobId, sourceAttackRange: attackRange, record });
    }
  }

  if (consumer.summary.finalJobIdCount !== expectedIds.length) fail('finalJobIdCount mismatch');
  if (consumer.summary.normalReferenceCount !== expected.normalReferenceCount) fail('normalReferenceCount mismatch');
  if (consumer.summary.releasedSpReferenceCount !== expected.releasedSpReferenceCount) fail('releasedSpReferenceCount mismatch');
  if (consumer.summary.hardErrorCount !== 0 || validation.summary.hardErrorCount !== 0) fail('hard error summary drift');

  console.log(JSON.stringify({
    status: 'PASS',
    finalJobIdCount: expectedIds.length,
    normalReferenceCount: expected.normalReferenceCount,
    releasedSpReferenceCount: expected.releasedSpReferenceCount,
    minAttackRange: consumer.summary.minAttackRange,
    maxAttackRange: consumer.summary.maxAttackRange,
  }));
} catch (error) {
  console.error(error.message);
  if (error.detail != null) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
}
