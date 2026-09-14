'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ROOT, loadArray } = require('./lib/configdata-direct.cjs');

const HERO_ID = 144;
const JOB_IDS = [126, 307];
const SKILL_IDS = [800033, 800034, 800035, 800036];
const BUFF_IDS = [800033, 800034, 800035, 800036];

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label}: expected positive integer, got ${String(value)}`);
  return value;
}

function indexUnique(records, label) {
  const map = new Map();
  records.forEach((record, sourceIndex) => {
    const id = positiveInteger(record?.ID, `${label}[${sourceIndex}].ID`);
    assert(!map.has(id), `${label}: duplicate ID ${id}`);
    map.set(id, { record, sourceIndex });
  });
  return map;
}

function selected(index, ids, label) {
  return ids.map((id) => {
    const hit = index.get(id);
    assert(hit, `${label}: unresolved ID ${id}`);
    return { sourceIndex: hit.sourceIndex, record: hit.record };
  });
}

function main() {
  const shardPath = path.join(ROOT, 'data/generated/hero-detail/by-id/144.json');
  const shard = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  assert.strictEqual(shard.heroId, HERO_ID);

  const jobs = indexUnique(loadArray('ConfigDataJobInfo'), 'ConfigDataJobInfo');
  const skills = indexUnique(loadArray('ConfigDataSkillInfo'), 'ConfigDataSkillInfo');
  const buffs = indexUnique(loadArray('ConfigDataBuffInfo'), 'ConfigDataBuffInfo');

  const normalJobs = (shard?.normal?.jobTree?.connections || []).map((connection) => ({
    jobConnectionId: connection.jobConnectionId,
    jobId: connection.jobId,
    role: connection.role,
    depth: connection.depth,
    nameCn: connection?.job?.nameCn ?? null,
    rank: connection?.job?.rank ?? null,
  }));
  const spJob = shard?.sp?.job ? {
    jobId: shard.sp.job.jobId,
    nameCn: shard.sp.job.nameCn ?? null,
    rank: shard.sp.job.rank ?? null,
  } : null;

  const diagnostic = {
    status: 'PASS_HERO_HEART_FETTER_KAGURA_SOURCE_DIAGNOSTIC_V1',
    semanticInterpretation: false,
    hero: {
      heroId: HERO_ID,
      identity: shard.identity,
      normalJobs,
      spJob,
    },
    targetIds: {
      jobs: JOB_IDS,
      skills: SKILL_IDS,
      buffs: BUFF_IDS,
    },
    jobRecords: selected(jobs, JOB_IDS, 'JobInfo'),
    skillRecords: selected(skills, SKILL_IDS, 'SkillInfo'),
    buffRecords: selected(buffs, BUFF_IDS, 'BuffInfo'),
  };

  process.stdout.write(`${JSON.stringify(diagnostic)}\n`);
}

main();
