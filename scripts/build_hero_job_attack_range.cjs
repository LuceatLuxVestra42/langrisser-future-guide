'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const UPSTREAM = P('data/generated/hero-job-links.v1.json');
const OUTPUT = P('data/generated/hero-job-attack-range.v1.json');
const SUMMARY = P('data/validation/hero-job-attack-range-summary.v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const upstream = readJson(UPSTREAM);
  if (upstream?.status !== 'PASS') throw new Error(`hero-job-links status=${upstream?.status ?? 'missing'}`);

  const jobRows = loadArray('ConfigDataJobInfo');
  const jobById = new Map();
  const duplicateJobIds = new Set();
  for (const row of jobRows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (jobById.has(row.ID)) duplicateJobIds.add(row.ID);
    else jobById.set(row.ID, row);
  }

  const hardErrors = [];
  if (duplicateJobIds.size) {
    hardErrors.push(`ConfigDataJobInfo duplicate IDs: ${[...duplicateJobIds].sort((a, b) => a - b).join(', ')}`);
  }

  let connectionCount = 0;
  const referencedJobIds = new Set();
  const rangeHistogram = new Map();

  const records = (upstream.records || []).map((hero) => ({
    heroId: hero.heroId,
    connections: (hero.connections || []).map((connection) => {
      connectionCount += 1;
      const jobId = connection.jobId;
      if (!Number.isInteger(jobId) || jobId <= 0) {
        hardErrors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: invalid jobId=${String(jobId)}`);
        return {
          jobConnectionId: connection.jobConnectionId,
          jobId: Number.isInteger(jobId) ? jobId : null,
          basicAttackRange: null,
        };
      }
      referencedJobIds.add(jobId);
      const sourceJob = jobById.get(jobId);
      if (!sourceJob) {
        hardErrors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: missing JobInfo ${jobId}`);
        return { jobConnectionId: connection.jobConnectionId, jobId, basicAttackRange: null };
      }
      const range = sourceJob.BF_AttackDistance;
      if (!Number.isInteger(range) || range <= 0) {
        hardErrors.push(`JobInfo ${jobId}: invalid BF_AttackDistance=${String(range)}`);
        return { jobConnectionId: connection.jobConnectionId, jobId, basicAttackRange: null };
      }
      rangeHistogram.set(range, (rangeHistogram.get(range) || 0) + 1);
      return { jobConnectionId: connection.jobConnectionId, jobId, basicAttackRange: range };
    }),
  }));

  const status = hardErrors.length ? 'FAIL' : 'PASS';
  const output = {
    version: 1,
    domain: 'hero-job-attack-range',
    status,
    source: {
      upstream: 'data/generated/hero-job-links.v1.json',
      configDataContract: 'data/contracts/configdata-source-pack-contract.v1.json',
      table: 'ConfigDataJobInfo',
      idField: 'ID',
      rangeField: 'BF_AttackDistance',
    },
    recordCount: records.length,
    records,
  };
  const summary = {
    version: 1,
    domain: 'hero-job-attack-range',
    status,
    heroCount: records.length,
    connectionCount,
    distinctReferencedJobCount: referencedJobIds.size,
    sourceJobInfoCount: jobRows.length,
    rangeHistogram: Object.fromEntries([...rangeHistogram.entries()].sort((a, b) => a[0] - b[0]).map(([key, value]) => [String(key), value])),
    hardErrors,
  };

  writeJson(OUTPUT, output);
  writeJson(SUMMARY, summary);
  console.log(`HERO JOB ATTACK RANGE BUILD: ${status}`);
  console.log(`heroes=${records.length} connections=${connectionCount} distinctJobs=${referencedJobIds.size} sourceJobs=${jobRows.length} ranges=${JSON.stringify(summary.rangeHistogram)} errors=${hardErrors.length}`);
  if (hardErrors.length) {
    for (const error of hardErrors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
