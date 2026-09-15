'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const UPSTREAM = P('data/generated/hero-job-links.v1.json');
const OUTPUT = P('data/generated/hero-job-attack-range.v1.json');
const SUMMARY = P('data/validation/hero-job-attack-range-summary.v1.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function main() {
  const errors = [];
  const upstream = read(UPSTREAM);
  const output = read(OUTPUT);
  const summary = read(SUMMARY);
  const jobRows = loadArray('ConfigDataJobInfo');

  const jobById = new Map();
  for (const row of jobRows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (jobById.has(row.ID)) errors.push(`ConfigDataJobInfo duplicate ID=${row.ID}`);
    else jobById.set(row.ID, row);
  }

  if (upstream.status !== 'PASS') errors.push(`upstream status=${upstream.status}`);
  if (output.version !== 1 || output.domain !== 'hero-job-attack-range' || output.status !== 'PASS') errors.push('generated artifact is not PASS v1');
  if (summary.version !== 1 || summary.domain !== 'hero-job-attack-range' || summary.status !== 'PASS') errors.push('summary is not PASS v1');
  if (!output.ranges || Array.isArray(output.ranges) || typeof output.ranges !== 'object') errors.push('generated ranges is not an object');

  const actualRangeByJobId = new Map();
  for (const [rawRange, jobIds] of Object.entries(output.ranges || {})) {
    const range = Number(rawRange);
    if (!Number.isSafeInteger(range) || range <= 0 || String(range) !== rawRange) {
      errors.push(`invalid generated range key=${rawRange}`);
      continue;
    }
    if (!Array.isArray(jobIds)) {
      errors.push(`generated range ${rawRange} is not an array`);
      continue;
    }
    let previousJobId = 0;
    for (const jobId of jobIds) {
      if (!Number.isSafeInteger(jobId) || jobId <= 0) {
        errors.push(`generated range ${range}: invalid jobId=${String(jobId)}`);
        continue;
      }
      if (jobId <= previousJobId) errors.push(`generated range ${range}: job IDs are not strictly ascending at ${jobId}`);
      previousJobId = jobId;
      if (actualRangeByJobId.has(jobId)) errors.push(`generated JobInfo ${jobId} appears in multiple range groups`);
      else actualRangeByJobId.set(jobId, range);
    }
  }

  let connectionCount = 0;
  const referencedJobIds = new Set();
  const rangeHistogram = new Map();
  for (const hero of upstream.records || []) {
    for (const connection of hero.connections || []) {
      connectionCount += 1;
      const jobId = connection.jobId;
      if (!Number.isInteger(jobId) || jobId <= 0) {
        errors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: invalid upstream jobId=${String(jobId)}`);
        continue;
      }
      referencedJobIds.add(jobId);
      const sourceJob = jobById.get(jobId);
      if (!sourceJob) {
        errors.push(`missing source JobInfo ${jobId}`);
        continue;
      }
      const expectedRange = sourceJob.BF_AttackDistance;
      if (!Number.isInteger(expectedRange) || expectedRange <= 0) {
        errors.push(`JobInfo ${jobId}: invalid BF_AttackDistance=${String(expectedRange)}`);
        continue;
      }
      rangeHistogram.set(expectedRange, (rangeHistogram.get(expectedRange) || 0) + 1);
      if (actualRangeByJobId.get(jobId) !== expectedRange) {
        errors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: range=${String(actualRangeByJobId.get(jobId))}, expected=${expectedRange}`);
      }
    }
  }

  for (const jobId of actualRangeByJobId.keys()) {
    if (!referencedJobIds.has(jobId)) errors.push(`generated range has unreferenced JobInfo ${jobId}`);
  }
  if (output.jobCount !== referencedJobIds.size) errors.push(`output.jobCount=${output.jobCount}, expected=${referencedJobIds.size}`);
  if (actualRangeByJobId.size !== referencedJobIds.size) errors.push(`generated job count=${actualRangeByJobId.size}, expected=${referencedJobIds.size}`);

  const expectedHistogram = Object.fromEntries([...rangeHistogram.entries()].sort((a, b) => a[0] - b[0]).map(([key, value]) => [String(key), value]));
  const heroCount = (upstream.records || []).length;
  if (summary.heroCount !== heroCount) errors.push(`summary.heroCount=${summary.heroCount}, expected=${heroCount}`);
  if (summary.connectionCount !== connectionCount) errors.push(`summary.connectionCount=${summary.connectionCount}, expected=${connectionCount}`);
  if (summary.distinctReferencedJobCount !== referencedJobIds.size) errors.push(`summary.distinctReferencedJobCount=${summary.distinctReferencedJobCount}, expected=${referencedJobIds.size}`);
  if (summary.sourceJobInfoCount !== jobRows.length) errors.push(`summary.sourceJobInfoCount=${summary.sourceJobInfoCount}, expected=${jobRows.length}`);
  if (JSON.stringify(summary.rangeHistogram) !== JSON.stringify(expectedHistogram)) errors.push('summary.rangeHistogram mismatch');
  if ((summary.hardErrors || []).length !== 0) errors.push(`summary hardErrors=${summary.hardErrors.length}`);

  console.log(`HERO JOB ATTACK RANGE VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
  console.log(`heroes=${heroCount} connections=${connectionCount} distinctJobs=${referencedJobIds.size} sourceJobs=${jobRows.length} ranges=${JSON.stringify(expectedHistogram)} errors=${errors.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
