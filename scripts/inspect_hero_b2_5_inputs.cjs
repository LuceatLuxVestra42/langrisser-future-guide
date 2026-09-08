'use strict';

const fs = require('fs');
const path = require('path');
const { resolveConfigDataSourceRoot } = require('./configdata-source-pack-maintenance-root.cjs');

const ROOT = path.resolve(__dirname, '..');
const sourceRoot = resolveConfigDataSourceRoot();
const configDir = path.join(sourceRoot, 'data', 'configdata');
const rows = d => Array.isArray(d) ? d : (d?.records || d?.rows || d?.data || []);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const load = name => rows(read(path.join(configDir, `${name}.json`)));
const byId = a => new Map(a.map(x => [Number(x.ID), x]));

const stage54 = read(path.join(ROOT, 'data/generated/hero-page-stage5-4-sp.v1.json'));
const released = (stage54.records || []).filter(r => r?.sp?.status === 'RELEASED');
if (released.length !== 25) throw new Error(`released=${released.length}`);

const spBy = byId(load('ConfigDataSPHeroInfo'));
const jcBy = byId(load('ConfigDataJobConnectionInfo'));
const jobBy = byId(load('ConfigDataJobInfo'));
const levelBy = byId(load('ConfigDataJobLevelInfo'));

function finalLevel(connection) {
  const ids = Array.isArray(connection?.JobLevels_ID) ? connection.JobLevels_ID.map(Number) : [];
  const candidates = ids.map(id => levelBy.get(id)).filter(Boolean);
  candidates.sort((a, b) => Number(a.JobLevelUpHeroLevel || 0) - Number(b.JobLevelUpHeroLevel || 0) || Number(a.ID) - Number(b.ID));
  return { ids, row: candidates[candidates.length - 1] || null, resolved: candidates.length };
}

const usedPropertyIds = [...new Set(released.flatMap(r => (r.sp?.secondStageRewards?.buff?.properties || []).map(p => Number(p.propertyId))))].filter(Number.isInteger).sort((a,b)=>a-b);
const propertyFileCandidates = fs.readdirSync(configDir).filter(name => /property.*modify|modify.*property/i.test(name)).sort();
const propertyHits = [];
for (const filename of propertyFileCandidates) {
  let data;
  try { data = rows(read(path.join(configDir, filename))); } catch { continue; }
  for (const row of data) if (usedPropertyIds.includes(Number(row?.ID))) propertyHits.push({ filename, row });
}

const records = released.map(r => {
  const heroId = Number(r.heroId);
  const rawSp = spBy.get(heroId);
  const jc = jcBy.get(Number(r.sp.job.jobConnectionId));
  const job = jobBy.get(Number(r.sp.job.jobId));
  const f = finalLevel(jc);
  return {
    heroId,
    jobConnectionId: Number(r.sp.job.jobConnectionId),
    jobId: Number(r.sp.job.jobId),
    stage54JobMatchesRaw: Number(rawSp?.JobConnection_ID) === Number(r.sp.job.jobConnectionId) && Number(jc?.Job_ID) === Number(r.sp.job.jobId),
    jobLevelIds: f.ids,
    finalJobLevelResolvedCount: f.resolved,
    finalJobLevel: f.row,
    jobInfo: job,
    spStar: Object.fromEntries(Object.entries(r.sp.stats || {}).filter(([k]) => /Star$/.test(k))),
    reshape: r.sp.secondStageRewards?.buff || null,
  };
});

const unresolved = records.filter(r => !r.stage54JobMatchesRaw || r.finalJobLevelResolvedCount !== r.jobLevelIds.length || !r.finalJobLevel);
console.log(JSON.stringify({
  status: unresolved.length ? 'FAIL' : 'PASS',
  sourceRootKind: sourceRoot === ROOT ? 'TRACKED' : 'EXTERNAL_PINNED_PACK',
  releasedCount: released.length,
  usedPropertyIds,
  propertyFileCandidates,
  propertyHits,
  unresolved: unresolved.map(r => r.heroId),
  leon: records.find(r => r.heroId === 6),
  records: records.map(r => ({
    heroId:r.heroId, jobConnectionId:r.jobConnectionId, jobId:r.jobId,
    jobLevelIds:r.jobLevelIds, finalJobLevelResolvedCount:r.finalJobLevelResolvedCount,
    finalJobLevel:r.finalJobLevel, jobInfo:r.jobInfo, reshape:r.reshape,
  })),
}, null, 2));
if (unresolved.length) process.exitCode = 1;
