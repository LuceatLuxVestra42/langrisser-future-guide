'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadArray } = require('./lib/configdata-direct.cjs');

const CONTRACT_PATH = path.join(ROOT, 'data/contracts/hero-final-job-attack-range-consumer.v1.json');
const MANIFEST_PATH = path.join(ROOT, 'data/generated/hero-detail.v1.json');
const OUTPUT_PATH = path.join(ROOT, 'data/generated/hero-final-job-attack-range.v1.json');
const VALIDATION_PATH = path.join(ROOT, 'data/validation/hero-final-job-attack-range.v1.json');
const CHECKPOINT_PATH = path.join(ROOT, 'data/checkpoints/hero-final-job-attack-range.md');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function fail(message, detail = null) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) fail(`invalid ${label}`, value ?? null);
  return value;
}

function collectFinalJobRefs(manifest) {
  const byJobId = new Map();
  const add = (jobId, ref) => {
    const id = positiveInteger(jobId, 'jobId');
    if (!byJobId.has(id)) byJobId.set(id, []);
    byJobId.get(id).push(ref);
  };

  const entries = Object.entries(manifest?.storage?.byHeroId ?? {});
  if (entries.length !== manifest?.storage?.recordCount) {
    fail('hero manifest recordCount mismatch', { entries: entries.length, recordCount: manifest?.storage?.recordCount });
  }

  let normalReferenceCount = 0;
  let spReferenceCount = 0;
  for (const [heroIdKey, meta] of entries) {
    const heroId = positiveInteger(Number(heroIdKey), 'heroId');
    if (typeof meta?.path !== 'string') fail('hero shard path missing', { heroId });
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
      if (capstone.jobId !== capstone?.job?.id) {
        fail('normal capstone jobId parity mismatch', { heroId, branchIndex, jobId: capstone.jobId, nestedJobId: capstone?.job?.id });
      }
      add(capstone.jobId, { kind: 'NORMAL', heroId, branchIndex, jobConnectionId: capstoneConnectionId });
      normalReferenceCount += 1;
    }

    if (shard?.sp?.status === 'RELEASED') {
      const spJobId = shard?.sp?.job?.jobId;
      add(spJobId, { kind: 'SP', heroId, jobConnectionId: shard?.sp?.job?.jobConnectionId ?? null });
      spReferenceCount += 1;
    }
  }

  return { byJobId, normalReferenceCount, spReferenceCount };
}

function build() {
  const contract = readJson(CONTRACT_PATH);
  const manifest = readJson(MANIFEST_PATH);
  if (contract?.status !== 'PRODUCER_READY' || contract?.owner !== 'hero-canonical') {
    fail('attack-range contract is not admitted producer input');
  }
  if (manifest?.stage !== 'hero-page-6-3' || manifest?.completion !== 'COMPLETE') {
    fail('Stage 6 hero manifest is not COMPLETE');
  }

  const refs = collectFinalJobRefs(manifest);
  const jobRows = loadArray('ConfigDataJobInfo');
  const sourceById = new Map();
  const duplicateSourceIds = [];
  for (const row of jobRows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (sourceById.has(row.ID)) duplicateSourceIds.push(row.ID);
    else sourceById.set(row.ID, row);
  }
  if (duplicateSourceIds.length) fail('duplicate ConfigDataJobInfo.ID values', duplicateSourceIds);

  const records = [];
  for (const jobId of [...refs.byJobId.keys()].sort((a, b) => a - b)) {
    const source = sourceById.get(jobId);
    if (!source) fail('final JobID missing from ConfigDataJobInfo', { jobId });
    const attackRange = source.BF_AttackDistance;
    if (!Number.isInteger(attackRange) || attackRange <= 0) {
      fail('invalid BF_AttackDistance for final JobID', { jobId, attackRange });
    }
    records.push({
      jobId,
      attackRange,
      sourceField: 'BF_AttackDistance',
      references: refs.byJobId.get(jobId),
    });
  }

  const sourcePackContract = readJson(path.join(ROOT, 'data/contracts/configdata-source-pack-contract.v1.json'));
  const consumer = {
    version: 1,
    stage: 'hero-final-job-attack-range-consumer',
    status: 'FROZEN',
    owner: 'hero-canonical',
    semanticAuthority: 'ConfigDataJobInfo.ID + BF_AttackDistance from pinned ConfigData source pack',
    source: {
      sourceCommitSha: sourcePackContract?.authoritativePredecessor?.sourceCommitSha ?? null,
      sourceTreeGitSha1: sourcePackContract?.authoritativePredecessor?.sourceTreeGitSha1 ?? null,
      logicalPath: 'data/configdata/ConfigDataJobInfo.json',
      heroManifest: 'data/generated/hero-detail.v1.json',
    },
    summary: {
      heroCount: manifest.storage.recordCount,
      finalJobIdCount: records.length,
      normalReferenceCount: refs.normalReferenceCount,
      releasedSpReferenceCount: refs.spReferenceCount,
      minAttackRange: records.length ? Math.min(...records.map((row) => row.attackRange)) : null,
      maxAttackRange: records.length ? Math.max(...records.map((row) => row.attackRange)) : null,
      hardErrorCount: 0,
    },
    byJobId: Object.fromEntries(records.map((row) => [String(row.jobId), row])),
    boundaries: contract.boundaries,
  };
  writeJson(OUTPUT_PATH, consumer);

  const validation = {
    version: 1,
    stage: 'hero-final-job-attack-range-consumer',
    status: 'PASS',
    completion: 'COMPLETE',
    owner: 'hero-canonical',
    summary: {
      finalJobIdCount: records.length,
      normalReferenceCount: refs.normalReferenceCount,
      releasedSpReferenceCount: refs.spReferenceCount,
      missingJobIdCount: 0,
      duplicateSourceIdCount: 0,
      invalidAttackRangeCount: 0,
      hardErrorCount: 0,
    },
    consumer: 'data/generated/hero-final-job-attack-range.v1.json',
    validator: 'scripts/validate_hero_final_job_attack_range_consumer.cjs',
    decision: 'Current Stage 6 final-job JobIDs resolve by exact numeric ID to pinned ConfigDataJobInfo.BF_AttackDistance with no heuristic mapping.',
  };
  writeJson(VALIDATION_PATH, validation);

  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, `# Hero final-job attack-range consumer\n\n- owner: hero-canonical\n- source: pinned ConfigData source pack + current Stage 6 Hero shards\n- status: COMPLETE / PASS\n- final JobIDs: ${records.length}\n- normal references: ${refs.normalReferenceCount}\n- released SP references: ${refs.spReferenceCount}\n- consumer: data/generated/hero-final-job-attack-range.v1.json\n- validator: scripts/validate_hero_final_job_attack_range_consumer.cjs\n- next owner: hero-frontend\n- reopen only on source snapshot, Stage 6 final-job population, schema/contract change, or validator hard failure.\n`);
}

try {
  build();
  console.log('hero final-job attack-range consumer: generated');
} catch (error) {
  console.error(error.message);
  if (error.detail != null) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
}
