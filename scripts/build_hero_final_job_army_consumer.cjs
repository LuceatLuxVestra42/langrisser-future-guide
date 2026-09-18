'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadArray } = require('./lib/configdata-direct.cjs');

const CONTRACT_PATH = path.join(ROOT, 'data/contracts/hero-final-job-army-consumer.v1.json');
const MANIFEST_PATH = path.join(ROOT, 'data/generated/hero-detail.v1.json');
const OUTPUT_PATH = path.join(ROOT, 'data/generated/hero-final-job-army.v1.json');
const VALIDATION_PATH = path.join(ROOT, 'data/validation/hero-final-job-army.v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function fail(message, detail = null) { const error = new Error(message); error.detail = detail; throw error; }
function positiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) fail('invalid ' + label, value ?? null); return value; }

function collectFinalJobRefs(manifest) {
  const byJobId = new Map();
  const add = (jobId, ref) => {
    const id = positiveInteger(jobId, 'jobId');
    if (!byJobId.has(id)) byJobId.set(id, []);
    byJobId.get(id).push(ref);
  };
  const entries = Object.entries(manifest?.storage?.byHeroId ?? {});
  if (entries.length !== manifest?.storage?.recordCount) fail('hero manifest recordCount mismatch');
  let normalReferenceCount = 0;
  let spReferenceCount = 0;
  for (const [heroIdKey, meta] of entries) {
    const heroId = positiveInteger(Number(heroIdKey), 'heroId');
    const shard = readJson(path.join(ROOT, meta.path));
    if (shard.heroId !== heroId) fail('hero shard identity mismatch', { heroId, shardHeroId: shard.heroId });
    const connections = Array.isArray(shard?.normal?.jobTree?.connections) ? shard.normal.jobTree.connections : [];
    const byConnectionId = new Map(connections.map((row) => [row.jobConnectionId, row]));
    const branches = Array.isArray(shard?.normal?.jobTree?.branches) ? shard.normal.jobTree.branches : [];
    for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
      const branch = branches[branchIndex];
      if (!Array.isArray(branch) || branch.length === 0) continue;
      const capstoneConnectionId = branch[branch.length - 1];
      const capstone = byConnectionId.get(capstoneConnectionId);
      if (!capstone) fail('normal branch capstone connection missing', { heroId, branchIndex, capstoneConnectionId });
      if (capstone?.job?.rank !== 4) continue;
      if (capstone.jobId !== capstone?.job?.id) fail('normal capstone jobId parity mismatch', { heroId, branchIndex });
      add(capstone.jobId, { kind: 'NORMAL', heroId, branchIndex, jobConnectionId: capstoneConnectionId });
      normalReferenceCount += 1;
    }
    if (shard?.sp?.status === 'RELEASED') {
      add(shard?.sp?.job?.jobId, { kind: 'SP', heroId, jobConnectionId: shard?.sp?.job?.jobConnectionId ?? null });
      spReferenceCount += 1;
    }
  }
  return { byJobId, normalReferenceCount, spReferenceCount };
}

function indexUnique(rows, label) {
  const byId = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (byId.has(row.ID)) fail('duplicate ' + label + '.ID', { id: row.ID });
    byId.set(row.ID, row);
  }
  return byId;
}

function build() {
  const contract = readJson(CONTRACT_PATH);
  const manifest = readJson(MANIFEST_PATH);
  if (contract?.status !== 'PRODUCER_READY' || contract?.owner !== 'hero-canonical') fail('army contract is not admitted producer input');
  if (manifest?.stage !== 'hero-page-6-3' || manifest?.completion !== 'COMPLETE') fail('Stage 6 hero manifest is not COMPLETE');

  const refs = collectFinalJobRefs(manifest);
  const jobs = indexUnique(loadArray('ConfigDataJobInfo'), 'ConfigDataJobInfo');
  const armies = indexUnique(loadArray('ConfigDataArmyInfo'), 'ConfigDataArmyInfo');
  const records = [];
  const armyIdUsage = {};

  for (const jobId of [...refs.byJobId.keys()].sort((a, b) => a - b)) {
    const source = jobs.get(jobId);
    if (!source) fail('final JobID missing from ConfigDataJobInfo', { jobId });
    const armyId = source.Army_ID;
    if (!Number.isInteger(armyId) || armyId <= 0) fail('invalid Army_ID for final JobID', { jobId, armyId });
    const army = armies.get(armyId);
    if (!army) fail('Army_ID missing from ConfigDataArmyInfo', { jobId, armyId });
    if (typeof army.Icon_NoBack !== 'string' || !army.Icon_NoBack.length) fail('ArmyInfo Icon_NoBack missing', { jobId, armyId });
    armyIdUsage[String(armyId)] = (armyIdUsage[String(armyId)] || 0) + 1;
    records.push({
      jobId,
      armyId,
      armyNameCn: army.Name ?? null,
      iconNoBackLocator: army.Icon_NoBack,
      sourceFields: ['Army_ID', 'Icon_NoBack'],
      references: refs.byJobId.get(jobId),
    });
  }

  const sourcePack = readJson(path.join(ROOT, 'data/contracts/configdata-source-pack-contract.v1.json'));
  const consumer = {
    version: 1,
    stage: 'hero-final-job-army-consumer',
    status: 'FROZEN',
    owner: 'hero-canonical',
    semanticAuthority: 'ConfigDataJobInfo.ID + Army_ID joined by exact numeric Army_ID to ConfigDataArmyInfo.ID from pinned ConfigData source pack',
    source: {
      sourceCommitSha: sourcePack?.authoritativePredecessor?.sourceCommitSha ?? null,
      sourceTreeGitSha1: sourcePack?.authoritativePredecessor?.sourceTreeGitSha1 ?? null,
      jobInfoLogicalPath: 'data/configdata/ConfigDataJobInfo.json',
      armyInfoLogicalPath: 'data/configdata/ConfigDataArmyInfo.json',
      heroManifest: 'data/generated/hero-detail.v1.json',
    },
    summary: {
      heroCount: manifest.storage.recordCount,
      finalJobIdCount: records.length,
      normalReferenceCount: refs.normalReferenceCount,
      releasedSpReferenceCount: refs.spReferenceCount,
      armyIdUsage,
      distinctArmyIdCount: Object.keys(armyIdUsage).length,
      hardErrorCount: 0,
    },
    byJobId: Object.fromEntries(records.map((row) => [String(row.jobId), row])),
    boundaries: contract.boundaries,
  };
  writeJson(OUTPUT_PATH, consumer);

  writeJson(VALIDATION_PATH, {
    version: 1,
    stage: 'hero-final-job-army-consumer',
    status: 'PASS',
    completion: 'COMPLETE',
    owner: 'hero-canonical',
    expectedBaseHead: contract.expectedBaseHead,
    summary: {
      finalJobIdCount: records.length,
      normalReferenceCount: refs.normalReferenceCount,
      releasedSpReferenceCount: refs.spReferenceCount,
      distinctArmyIdCount: Object.keys(armyIdUsage).length,
      missingJobIdCount: 0,
      missingArmyIdCount: 0,
      duplicateSourceIdCount: 0,
      invalidArmyIdCount: 0,
      parityMismatchCount: 0,
      hardErrorCount: 0,
    },
    consumer: 'data/generated/hero-final-job-army.v1.json',
    validator: 'scripts/validate_hero_final_job_army_consumer.cjs',
    nextOwner: 'hero-frontend',
    decision: 'Current Stage 6 final-job JobIDs resolve by exact numeric ID to pinned ConfigDataJobInfo.Army_ID and exact ConfigDataArmyInfo.ID with no heuristic mapping.',
  });
}

try { build(); console.log('hero final-job army consumer: generated'); }
catch (error) { console.error(error.message); if (error.detail != null) console.error(JSON.stringify(error.detail, null, 2)); process.exit(1); }
