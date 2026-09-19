'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadArray } = require('./lib/configdata-direct.cjs');

function readJson(relative) { return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8')); }
function fail(message, detail = null) { const error = new Error(message); error.detail = detail; throw error; }

function collectExpected(manifest) {
  const refs = new Map();
  const add = (jobId, ref) => {
    if (!Number.isInteger(jobId) || jobId <= 0) fail('invalid final JobID', { jobId });
    if (!refs.has(jobId)) refs.set(jobId, []);
    refs.get(jobId).push(ref);
  };
  let normalReferenceCount = 0;
  let releasedSpReferenceCount = 0;
  for (const [heroIdKey, meta] of Object.entries(manifest?.storage?.byHeroId ?? {})) {
    const heroId = Number(heroIdKey);
    const shard = readJson(meta.path);
    if (shard.heroId !== heroId) fail('hero shard identity mismatch', { heroId, shardHeroId: shard.heroId });
    const connections = Array.isArray(shard?.normal?.jobTree?.connections) ? shard.normal.jobTree.connections : [];
    const byConnectionId = new Map(connections.map((row) => [row.jobConnectionId, row]));
    for (const [branchIndex, branch] of (shard?.normal?.jobTree?.branches ?? []).entries()) {
      if (!Array.isArray(branch) || branch.length === 0) continue;
      const capstoneConnectionId = branch[branch.length - 1];
      const capstone = byConnectionId.get(capstoneConnectionId);
      if (!capstone) fail('missing branch capstone', { heroId, branchIndex });
      if (capstone?.job?.rank !== 4) continue;
      if (!Number.isInteger(capstone.jobId) || capstone.jobId !== capstone?.job?.id) fail('invalid normal capstone JobID parity', { heroId, branchIndex });
      add(capstone.jobId, { kind: 'NORMAL', heroId, branchIndex, jobConnectionId: capstoneConnectionId });
      normalReferenceCount += 1;
    }
    if (shard?.sp?.status === 'RELEASED') {
      const jobId = shard?.sp?.job?.jobId;
      add(jobId, { kind: 'SP', heroId, jobConnectionId: shard?.sp?.job?.jobConnectionId ?? null });
      releasedSpReferenceCount += 1;
    }
  }
  return { refs, normalReferenceCount, releasedSpReferenceCount };
}

function indexUnique(rows, label) {
  const map = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (map.has(row.ID)) fail('duplicate ' + label + '.ID', { id: row.ID });
    map.set(row.ID, row);
  }
  return map;
}

try {
  const contract = readJson('data/contracts/hero-final-job-army-consumer.v1.json');
  const manifest = readJson('data/generated/hero-detail.v1.json');
  const consumer = readJson('data/generated/hero-final-job-army.v1.json');
  const validation = readJson('data/validation/hero-final-job-army.v1.json');
  const sourcePack = readJson('data/contracts/configdata-source-pack-contract.v1.json');
  if (contract?.owner !== 'hero-canonical' || contract?.status !== 'PRODUCER_READY') fail('contract drift');
  if (consumer?.status !== 'FROZEN' || consumer?.owner !== 'hero-canonical') fail('consumer drift');
  if (validation?.status !== 'PASS' || validation?.completion !== 'COMPLETE') fail('validation output drift');
  if (consumer?.source?.sourceCommitSha !== sourcePack?.authoritativePredecessor?.sourceCommitSha) fail('source commit provenance mismatch');
  if (consumer?.source?.sourceTreeGitSha1 !== sourcePack?.authoritativePredecessor?.sourceTreeGitSha1) fail('source tree provenance mismatch');

  const expected = collectExpected(manifest);
  const expectedIds = [...expected.refs.keys()].sort((a, b) => a - b);
  const actualIds = Object.keys(consumer?.byJobId ?? {}).map(Number).sort((a, b) => a - b);
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) fail('consumer JobID set mismatch', { expectedIds, actualIds });

  const jobs = indexUnique(loadArray('ConfigDataJobInfo'), 'ConfigDataJobInfo');
  const armies = indexUnique(loadArray('ConfigDataArmyInfo'), 'ConfigDataArmyInfo');
  const usage = {};
  for (const jobId of expectedIds) {
    const source = jobs.get(jobId);
    if (!source) fail('expected JobID missing in source', { jobId });
    const armyId = source.Army_ID;
    if (!Number.isInteger(armyId) || armyId <= 0) fail('invalid source Army_ID', { jobId, armyId });
    const army = armies.get(armyId);
    if (!army) fail('source Army_ID missing from ArmyInfo', { jobId, armyId });
    const record = consumer.byJobId[String(jobId)];
    if (!record || record.jobId !== jobId || record.armyId !== armyId || record.armyNameCn !== (army.Name ?? null) || record.iconNoBackLocator !== army.Icon_NoBack) {
      fail('consumer parity mismatch', { jobId, armyId, record });
    }
    if (record.sourceFields?.[0] !== 'Army_ID' || record.sourceFields?.[1] !== 'Icon_NoBack') fail('source field provenance mismatch', { jobId });
    if (JSON.stringify(record.references) !== JSON.stringify(expected.refs.get(jobId))) fail('reference provenance mismatch', { jobId });
    usage[String(armyId)] = (usage[String(armyId)] || 0) + 1;
  }
  if (JSON.stringify(consumer.summary.armyIdUsage) !== JSON.stringify(usage)) fail('army usage summary mismatch', { expected: usage, actual: consumer.summary.armyIdUsage });
  if (consumer.summary.finalJobIdCount !== expectedIds.length) fail('finalJobIdCount mismatch');
  if (consumer.summary.normalReferenceCount !== expected.normalReferenceCount) fail('normalReferenceCount mismatch');
  if (consumer.summary.releasedSpReferenceCount !== expected.releasedSpReferenceCount) fail('releasedSpReferenceCount mismatch');
  if (consumer.summary.hardErrorCount !== 0 || validation.summary.hardErrorCount !== 0) fail('hard error summary drift');
  console.log(JSON.stringify({ status:'PASS', finalJobIdCount:expectedIds.length, normalReferenceCount:expected.normalReferenceCount, releasedSpReferenceCount:expected.releasedSpReferenceCount, armyIdUsage:usage }));
} catch (error) {
  console.error(error.message);
  if (error.detail != null) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
}
