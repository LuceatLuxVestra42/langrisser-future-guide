'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveConfigDataFile } = require('./configdata-source-pack-maintenance-root.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = {
  contract: 'data/contracts/hero-b3-final-job-extrema-consumer.v1.json',
  b2Freeze: 'data/checkpoints/hero-b2-7-sp-bonded-freeze.v1.json',
  b1Contract: 'data/contracts/hero-b1-normal-bonded-consumer.v1.json',
  manifest: 'data/generated/hero-detail.v1.json',
  output: 'data/generated/hero-final-job-extrema.v1.json',
};
const STATS = ['hp', 'at', 'magic', 'df', 'magicDf', 'dex'];

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const rows = value => Array.isArray(value) ? value : (value?.records || value?.rows || value?.data || []);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value);

function readShard(locator, heroId) {
  if (!locator?.path || !fs.existsSync(abs(locator.path))) throw new Error(`Hero ${heroId}: shard missing`);
  const buffer = fs.readFileSync(abs(locator.path));
  if (sha256(buffer) !== locator.sha256 || buffer.length !== locator.byteLength) {
    throw new Error(`Hero ${heroId}: manifest integrity mismatch`);
  }
  const shard = JSON.parse(buffer.toString('utf8'));
  if (Number(shard?.heroId) !== heroId) throw new Error(`Hero ${heroId}: shard identity mismatch`);
  return shard;
}

function checkedValues(values, heroId, label) {
  const out = {};
  for (const stat of STATS) {
    const value = values?.[stat];
    if (!Number.isInteger(value) || value < 0) throw new Error(`Hero ${heroId}: invalid ${label} ${stat}`);
    out[stat] = value;
  }
  return out;
}

function candidateIdentity(shard) {
  return {
    nameKr: shard?.identity?.nameKr ?? null,
    nameCn: shard?.identity?.nameCn ?? null,
    nameEn: shard?.identity?.nameEn ?? null,
  };
}

function winnerView(candidate) {
  return {
    heroId: candidate.heroId,
    identity: candidate.identity,
    variant: candidate.variant,
    jobConnectionId: candidate.jobConnectionId,
    jobId: candidate.jobId,
    jobNameCn: candidate.jobNameCn,
  };
}

const contract = read(P.contract);
const b2Freeze = read(P.b2Freeze);
const b1Contract = read(P.b1Contract);
const manifest = read(P.manifest);
const jobRows = rows(JSON.parse(fs.readFileSync(resolveConfigDataFile('ConfigDataJobInfo.json'), 'utf8')));
const jobById = new Map(jobRows.map(row => [Number(row.ID), row]));
const errors = [];

if (contract?.stage !== 'hero-b3-final-job-extrema-consumer' || contract?.status !== 'INPUTS_FROZEN') errors.push('B3 contract not INPUTS_FROZEN');
if (b2Freeze?.status !== 'FINAL_FROZEN' || b2Freeze?.completion !== 'B2_7_FINAL_FROZEN') errors.push('B2-7 predecessor not FINAL_FROZEN');
if (b1Contract?.status !== 'FROZEN') errors.push('B1 predecessor not FROZEN');
if (manifest?.stage !== 'hero-page-6-3' || manifest?.completion !== 'COMPLETE' || manifest?.storage?.mode !== 'SHARDED_BY_HERO' || manifest?.storage?.recordCount !== 267) {
  errors.push('Hero manifest not COMPLETE SHARDED_BY_HERO/267');
}

const index = manifest?.storage?.byHeroId || {};
if (Object.keys(index).length !== 267) errors.push(`manifest locator count=${Object.keys(index).length}, expected 267`);

const candidates = [];
let normalBondedConnectionCount = 0;
let normalTier4Count = 0;
let spReleasedCount = 0;
let spTier4Count = 0;
let notReleasedPollution = 0;

for (const [heroIdText, locator] of Object.entries(index).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const heroId = Number(heroIdText);
  try {
    const shard = readShard(locator, heroId);
    const identity = candidateIdentity(shard);
    if (shard?.normalBondedStats?.status !== 'VERIFIED' || !Array.isArray(shard?.normalBondedStats?.connections)) {
      throw new Error(`Hero ${heroId}: normalBondedStats missing or invalid`);
    }
    const normalConnections = Array.isArray(shard?.normal?.jobTree?.connections) ? shard.normal.jobTree.connections : [];
    const normalByConnection = new Map();
    for (const connection of normalConnections) {
      const jcId = Number(connection?.jobConnectionId);
      if (!Number.isInteger(jcId) || normalByConnection.has(jcId)) throw new Error(`Hero ${heroId}: invalid/duplicate normal jobConnectionId=${jcId}`);
      normalByConnection.set(jcId, connection);
    }
    if (normalByConnection.size !== shard.normalBondedStats.connections.length) {
      throw new Error(`Hero ${heroId}: normal bonded/jobTree connection count mismatch`);
    }

    for (const bonded of shard.normalBondedStats.connections) {
      normalBondedConnectionCount += 1;
      const jobConnectionId = Number(bonded?.jobConnectionId);
      const connection = normalByConnection.get(jobConnectionId);
      if (!connection) throw new Error(`Hero ${heroId}: bonded normal connection ${jobConnectionId} not found in jobTree`);
      const jobId = Number(connection?.jobId ?? connection?.job?.id);
      const materializedRank = Number(connection?.job?.rank);
      const job = jobById.get(jobId);
      if (!job) throw new Error(`Hero ${heroId}: JobInfo ${jobId} missing`);
      const authoritativeRank = Number(job.Rank);
      if (!Number.isInteger(materializedRank) || materializedRank !== authoritativeRank) {
        throw new Error(`Hero ${heroId}: normal Job ${jobId} rank parity mismatch materialized=${materializedRank} authoritative=${authoritativeRank}`);
      }
      if (authoritativeRank !== 4) continue;
      normalTier4Count += 1;
      candidates.push({
        heroId,
        identity,
        variant: 'NORMAL',
        jobConnectionId,
        jobId,
        jobNameCn: connection?.job?.nameCn ?? null,
        values: checkedValues(bonded?.values, heroId, `normal Tier4 JC ${jobConnectionId}`),
      });
    }

    const spStatus = shard?.sp?.status;
    if (spStatus === 'RELEASED') {
      spReleasedCount += 1;
      if (shard?.spBondedStats?.status !== 'VERIFIED') throw new Error(`Hero ${heroId}: RELEASED SP missing verified spBondedStats`);
      const jobConnectionId = Number(shard.spBondedStats.jobConnectionId);
      const jobId = Number(shard.spBondedStats.jobId);
      if (Number(shard?.sp?.job?.jobConnectionId) !== jobConnectionId || Number(shard?.sp?.job?.jobId) !== jobId) {
        throw new Error(`Hero ${heroId}: SP job relation differs between frozen SP and bonded consumer`);
      }
      const job = jobById.get(jobId);
      if (!job) throw new Error(`Hero ${heroId}: SP JobInfo ${jobId} missing`);
      if (Number(job.Rank) !== 4) throw new Error(`Hero ${heroId}: RELEASED SP Job ${jobId} Rank=${job.Rank}, expected 4`);
      spTier4Count += 1;
      candidates.push({
        heroId,
        identity,
        variant: 'SP',
        jobConnectionId,
        jobId,
        jobNameCn: shard?.sp?.job?.nameCn ?? null,
        values: checkedValues(shard.spBondedStats.values, heroId, 'SP Tier4'),
      });
    } else if (spStatus === 'NOT_RELEASED') {
      if (Object.prototype.hasOwnProperty.call(shard, 'spBondedStats')) notReleasedPollution += 1;
    } else {
      throw new Error(`Hero ${heroId}: unexpected SP status ${String(spStatus)}`);
    }
  } catch (error) {
    errors.push(error.message);
  }
}

if (spReleasedCount !== 25) errors.push(`RELEASED SP count=${spReleasedCount}, expected 25`);
if (spTier4Count !== 25) errors.push(`Tier4 SP count=${spTier4Count}, expected 25`);
if (notReleasedPollution !== 0) errors.push(`NOT_RELEASED SP pollution=${notReleasedPollution}`);
if (!normalTier4Count) errors.push('no normal Tier4 candidates');

candidates.sort((a, b) => a.heroId - b.heroId || (a.variant === b.variant ? 0 : a.variant === 'NORMAL' ? -1 : 1) || a.jobConnectionId - b.jobConnectionId || a.jobId - b.jobId);
const extrema = {};
for (const stat of STATS) {
  let minValue = Infinity;
  let maxValue = -Infinity;
  for (const candidate of candidates) {
    const value = candidate.values[stat];
    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }
  const minWinners = candidates.filter(c => c.values[stat] === minValue).map(winnerView);
  const maxWinners = candidates.filter(c => c.values[stat] === maxValue).map(winnerView);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || !minWinners.length || !maxWinners.length) errors.push(`extrema missing for ${stat}`);
  extrema[stat] = {
    min: { value: minValue, winners: minWinners },
    max: { value: maxValue, winners: maxWinners },
  };
}

const candidateKeyRows = candidates.map(c => ({ heroId: c.heroId, variant: c.variant, jobConnectionId: c.jobConnectionId, jobId: c.jobId }));
const candidateSetSha256 = sha256(Buffer.from(stable(candidateKeyRows)));
const candidateValuesSha256 = sha256(Buffer.from(stable(candidates.map(c => ({ ...candidateKeyRows.shift?.(), heroId: c.heroId, variant: c.variant, jobConnectionId: c.jobConnectionId, jobId: c.jobId, values: c.values })))));

if (errors.length) {
  console.error(JSON.stringify({ status: 'FAIL', stage: contract?.stage, errors }, null, 2));
  process.exit(1);
}

const output = {
  version: 1,
  stage: 'hero-b3-final-job-extrema-consumer',
  status: 'GENERATED',
  predecessor: {
    b2FreezeCommitSha: contract.authoritativePredecessors.b2FreezeCommitSha,
    b2FreezeCheckpoint: P.b2Freeze,
    configDataSourceCommit: b2Freeze?.sourceProvenance?.configDataSourceCommit ?? null,
    sourcePackReleaseTag: b2Freeze?.sourceProvenance?.sourcePackReleaseTag ?? null,
    sourcePackArchiveSha256: b2Freeze?.sourceProvenance?.sourcePackArchiveSha256 ?? null,
  },
  eligibility: {
    authoritativeField: 'ConfigDataJobInfo.Rank',
    requiredRank: 4,
    topologyUsed: false,
  },
  stats: STATS,
  displayAliases: contract.statAuthority.displayAliases,
  summary: {
    canonicalHeroCount: 267,
    normalBondedConnectionCount,
    normalTier4CandidateCount: normalTier4Count,
    spReleasedCount,
    spTier4CandidateCount: spTier4Count,
    candidateCount: candidates.length,
    notReleasedPollution,
    candidateSetSha256,
    candidateValuesSha256,
  },
  candidates,
  extrema,
};
fs.writeFileSync(abs(P.output), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS', completion: 'MATERIALIZED', ...output.summary, extrema }, null, 2));
