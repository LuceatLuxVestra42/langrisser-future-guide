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

  const expectedHeroes = upstream.records || [];
  const actualHeroes = output.records || [];
  if (actualHeroes.length !== expectedHeroes.length) errors.push(`hero count=${actualHeroes.length}, expected=${expectedHeroes.length}`);

  const actualByHero = new Map();
  for (const hero of actualHeroes) {
    if (!Number.isInteger(hero?.heroId) || hero.heroId <= 0) { errors.push(`invalid generated heroId=${String(hero?.heroId)}`); continue; }
    if (actualByHero.has(hero.heroId)) errors.push(`duplicate generated heroId=${hero.heroId}`);
    else actualByHero.set(hero.heroId, hero);
  }

  let connectionCount = 0;
  const referencedJobIds = new Set();
  const rangeHistogram = new Map();

  for (const expectedHero of expectedHeroes) {
    const actualHero = actualByHero.get(expectedHero.heroId);
    if (!actualHero) { errors.push(`missing heroId=${expectedHero.heroId}`); continue; }
    const expectedConnections = expectedHero.connections || [];
    const actualConnections = actualHero.connections || [];
    if (actualConnections.length !== expectedConnections.length) {
      errors.push(`heroId ${expectedHero.heroId}: connection count mismatch`);
      continue;
    }
    for (let index = 0; index < expectedConnections.length; index += 1) {
      connectionCount += 1;
      const expectedConnection = expectedConnections[index];
      const actual = actualConnections[index];
      if (actual?.jobConnectionId !== expectedConnection.jobConnectionId || actual?.jobId !== expectedConnection.jobId) {
        errors.push(`heroId ${expectedHero.heroId} connection[${index}]: identity/order mismatch`);
        continue;
      }
      const jobId = expectedConnection.jobId;
      if (!Number.isInteger(jobId) || jobId <= 0) {
        errors.push(`heroId ${expectedHero.heroId} JobConnection ${expectedConnection.jobConnectionId}: invalid upstream jobId=${String(jobId)}`);
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
      if (actual.basicAttackRange !== expectedRange) {
        errors.push(`heroId ${expectedHero.heroId} JobConnection ${expectedConnection.jobConnectionId}: range=${String(actual.basicAttackRange)}, expected=${expectedRange}`);
      }
    }
  }

  const expectedHistogram = Object.fromEntries([...rangeHistogram.entries()].sort((a, b) => a[0] - b[0]).map(([key, value]) => [String(key), value]));
  if (summary.heroCount !== expectedHeroes.length) errors.push(`summary.heroCount=${summary.heroCount}, expected=${expectedHeroes.length}`);
  if (summary.connectionCount !== connectionCount) errors.push(`summary.connectionCount=${summary.connectionCount}, expected=${connectionCount}`);
  if (summary.distinctReferencedJobCount !== referencedJobIds.size) errors.push(`summary.distinctReferencedJobCount=${summary.distinctReferencedJobCount}, expected=${referencedJobIds.size}`);
  if (summary.sourceJobInfoCount !== jobRows.length) errors.push(`summary.sourceJobInfoCount=${summary.sourceJobInfoCount}, expected=${jobRows.length}`);
  if (JSON.stringify(summary.rangeHistogram) !== JSON.stringify(expectedHistogram)) errors.push('summary.rangeHistogram mismatch');
  if ((summary.hardErrors || []).length !== 0) errors.push(`summary hardErrors=${summary.hardErrors.length}`);

  console.log(`HERO JOB ATTACK RANGE VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
  console.log(`heroes=${expectedHeroes.length} connections=${connectionCount} distinctJobs=${referencedJobIds.size} sourceJobs=${jobRows.length} ranges=${JSON.stringify(expectedHistogram)} errors=${errors.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
