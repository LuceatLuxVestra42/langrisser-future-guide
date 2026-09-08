'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveConfigDataFile } = require('./configdata-source-pack-maintenance-root.cjs');

const ROOT = path.resolve(__dirname, '..');
const STATS = ['hp', 'at', 'magic', 'df', 'magicDf', 'dex'];
const CONTRACT = 'data/contracts/hero-b3-final-job-extrema-consumer.v1.json';
const FREEZE = 'data/checkpoints/hero-b2-7-sp-bonded-freeze.v1.json';
const MANIFEST = 'data/generated/hero-detail.v1.json';
const GENERATED = 'data/generated/hero-final-job-extrema.v1.json';
const SUMMARY = 'data/validation/hero-b3-final-job-extrema-summary.v1.json';

const full = rel => path.join(ROOT, rel);
const json = rel => JSON.parse(fs.readFileSync(full(rel), 'utf8'));
const listRows = x => Array.isArray(x) ? x : (x?.records || x?.rows || x?.data || []);
const digest = input => crypto.createHash('sha256').update(input).digest('hex');
const encode = x => JSON.stringify(x);

function sourceShard(locator, heroId) {
  const bytes = fs.readFileSync(full(locator.path));
  if (digest(bytes) !== locator.sha256 || bytes.length !== locator.byteLength) throw new Error(`manifest integrity hero=${heroId}`);
  const item = JSON.parse(bytes.toString('utf8'));
  if (Number(item.heroId) !== heroId) throw new Error(`hero identity mismatch hero=${heroId}`);
  return item;
}

function six(values, label) {
  const copy = {};
  for (const stat of STATS) {
    if (!Number.isInteger(values?.[stat]) || values[stat] < 0) throw new Error(`${label}: invalid ${stat}`);
    copy[stat] = values[stat];
  }
  return copy;
}

function idBlock(shard) {
  return {
    nameKr: shard?.identity?.nameKr ?? null,
    nameCn: shard?.identity?.nameCn ?? null,
    nameEn: shard?.identity?.nameEn ?? null,
  };
}

function key(c) {
  return `${c.heroId}|${c.variant}|${c.jobConnectionId}|${c.jobId}`;
}

function winnerKey(w) {
  return `${w.heroId}|${w.variant}|${w.jobConnectionId}|${w.jobId}`;
}

const contract = json(CONTRACT);
const freeze = json(FREEZE);
const manifest = json(MANIFEST);
const generated = json(GENERATED);
const authoritativeJobs = new Map(listRows(JSON.parse(fs.readFileSync(resolveConfigDataFile('ConfigDataJobInfo.json'), 'utf8'))).map(x => [Number(x.ID), x]));
const errors = [];

if (contract?.status !== 'INPUTS_FROZEN') errors.push('contract status drift');
if (freeze?.status !== 'FINAL_FROZEN') errors.push('B2 freeze status drift');
if (generated?.stage !== 'hero-b3-final-job-extrema-consumer' || generated?.status !== 'GENERATED') errors.push('generated artifact status/stage drift');
if (manifest?.storage?.recordCount !== 267 || Object.keys(manifest?.storage?.byHeroId || {}).length !== 267) errors.push('manifest population drift');

const expected = [];
let released = 0;
let pollution = 0;
let normalBondedConnections = 0;
let normalTier4 = 0;
let spTier4 = 0;

for (const [heroText, locator] of Object.entries(manifest?.storage?.byHeroId || {}).sort((x, y) => Number(x[0]) - Number(y[0]))) {
  const heroId = Number(heroText);
  try {
    const shard = sourceShard(locator, heroId);
    const identity = idBlock(shard);
    const normalRows = shard?.normalBondedStats?.connections;
    const jobTree = shard?.normal?.jobTree?.connections;
    if (!Array.isArray(normalRows) || !Array.isArray(jobTree)) throw new Error(`normal sources missing hero=${heroId}`);
    const tree = new Map();
    for (const row of jobTree) {
      const jc = Number(row?.jobConnectionId);
      if (!Number.isInteger(jc) || tree.has(jc)) throw new Error(`normal topology duplicate hero=${heroId} jc=${jc}`);
      tree.set(jc, row);
    }
    if (tree.size !== normalRows.length) throw new Error(`normal connection parity hero=${heroId}`);
    for (const bonded of normalRows) {
      normalBondedConnections += 1;
      const jc = Number(bonded?.jobConnectionId);
      const related = tree.get(jc);
      if (!related) throw new Error(`normal bonded relation missing hero=${heroId} jc=${jc}`);
      const jobId = Number(related?.jobId ?? related?.job?.id);
      const raw = authoritativeJobs.get(jobId);
      if (!raw) throw new Error(`JobInfo missing hero=${heroId} job=${jobId}`);
      const rawRank = Number(raw.Rank);
      if (Number(related?.job?.rank) !== rawRank) throw new Error(`normal rank mismatch hero=${heroId} job=${jobId}`);
      if (rawRank === 4) {
        normalTier4 += 1;
        expected.push({
          heroId,
          identity,
          variant: 'NORMAL',
          jobConnectionId: jc,
          jobId,
          jobNameCn: related?.job?.nameCn ?? null,
          values: six(bonded?.values, `normal hero=${heroId} jc=${jc}`),
        });
      }
    }

    if (shard?.sp?.status === 'RELEASED') {
      released += 1;
      const bonded = shard?.spBondedStats;
      if (bonded?.status !== 'VERIFIED') throw new Error(`SP bonded missing hero=${heroId}`);
      const jc = Number(bonded.jobConnectionId);
      const jobId = Number(bonded.jobId);
      if (Number(shard?.sp?.job?.jobConnectionId) !== jc || Number(shard?.sp?.job?.jobId) !== jobId) throw new Error(`SP frozen relation mismatch hero=${heroId}`);
      const raw = authoritativeJobs.get(jobId);
      if (!raw || Number(raw.Rank) !== 4) throw new Error(`SP not authoritative Rank4 hero=${heroId} job=${jobId}`);
      spTier4 += 1;
      expected.push({
        heroId,
        identity,
        variant: 'SP',
        jobConnectionId: jc,
        jobId,
        jobNameCn: shard?.sp?.job?.nameCn ?? null,
        values: six(bonded?.values, `SP hero=${heroId}`),
      });
    } else if (shard?.sp?.status === 'NOT_RELEASED') {
      if (Object.prototype.hasOwnProperty.call(shard, 'spBondedStats')) pollution += 1;
    } else {
      throw new Error(`unexpected SP status hero=${heroId}`);
    }
  } catch (e) {
    errors.push(e.message);
  }
}

expected.sort((a, b) => a.heroId - b.heroId || a.variant.localeCompare(b.variant) || a.jobConnectionId - b.jobConnectionId || a.jobId - b.jobId);
const actual = Array.isArray(generated?.candidates) ? [...generated.candidates] : [];
actual.sort((a, b) => Number(a.heroId) - Number(b.heroId) || String(a.variant).localeCompare(String(b.variant)) || Number(a.jobConnectionId) - Number(b.jobConnectionId) || Number(a.jobId) - Number(b.jobId));

if (released !== 25) errors.push(`released SP=${released}`);
if (spTier4 !== 25) errors.push(`SP Tier4=${spTier4}`);
if (pollution !== 0) errors.push(`NOT_RELEASED pollution=${pollution}`);
if (actual.length !== expected.length) errors.push(`candidate count actual=${actual.length} expected=${expected.length}`);

const expectedMap = new Map(expected.map(c => [key(c), c]));
const actualMap = new Map();
for (const candidate of actual) {
  const k = key(candidate);
  if (actualMap.has(k)) errors.push(`duplicate generated candidate ${k}`);
  actualMap.set(k, candidate);
  const source = expectedMap.get(k);
  if (!source) {
    errors.push(`unexpected candidate ${k}`);
    continue;
  }
  if (encode(candidate.identity) !== encode(source.identity)) errors.push(`identity mismatch ${k}`);
  if ((candidate.jobNameCn ?? null) !== (source.jobNameCn ?? null)) errors.push(`jobNameCn mismatch ${k}`);
  if (encode(candidate.values) !== encode(source.values)) errors.push(`bonded values mismatch ${k}`);
  const rawJob = authoritativeJobs.get(Number(candidate.jobId));
  if (!rawJob || Number(rawJob.Rank) !== 4) errors.push(`non-Tier4 candidate ${k}`);
}
for (const k of expectedMap.keys()) if (!actualMap.has(k)) errors.push(`missing candidate ${k}`);

const expectedKeyRows = expected.map(c => ({ heroId: c.heroId, variant: c.variant, jobConnectionId: c.jobConnectionId, jobId: c.jobId }));
const expectedValueRows = expected.map(c => ({ heroId: c.heroId, variant: c.variant, jobConnectionId: c.jobConnectionId, jobId: c.jobId, values: c.values }));
const keyHash = digest(Buffer.from(encode(expectedKeyRows)));
const valueHash = digest(Buffer.from(encode(expectedValueRows)));
if (generated?.summary?.candidateSetSha256 !== keyHash) errors.push('candidateSetSha256 mismatch');
if (generated?.summary?.candidateValuesSha256 !== valueHash) errors.push('candidateValuesSha256 mismatch');

const expectedExtrema = {};
for (const stat of STATS) {
  const allValues = expected.map(c => c.values[stat]);
  const lo = Math.min(...allValues);
  const hi = Math.max(...allValues);
  const lowKeys = expected.filter(c => c.values[stat] === lo).map(key).sort();
  const highKeys = expected.filter(c => c.values[stat] === hi).map(key).sort();
  const observed = generated?.extrema?.[stat];
  if (observed?.min?.value !== lo) errors.push(`${stat} min value mismatch`);
  if (observed?.max?.value !== hi) errors.push(`${stat} max value mismatch`);
  const observedLow = Array.isArray(observed?.min?.winners) ? observed.min.winners.map(winnerKey).sort() : [];
  const observedHigh = Array.isArray(observed?.max?.winners) ? observed.max.winners.map(winnerKey).sort() : [];
  if (encode(observedLow) !== encode(lowKeys)) errors.push(`${stat} min tie set mismatch`);
  if (encode(observedHigh) !== encode(highKeys)) errors.push(`${stat} max tie set mismatch`);
  expectedExtrema[stat] = { min: { value: lo, winnerCount: lowKeys.length }, max: { value: hi, winnerCount: highKeys.length } };
}

if (generated?.eligibility?.requiredRank !== 4 || generated?.eligibility?.topologyUsed !== false) errors.push('generated eligibility contract mismatch');
if (generated?.summary?.normalBondedConnectionCount !== normalBondedConnections) errors.push('normal bonded connection count mismatch');
if (generated?.summary?.normalTier4CandidateCount !== normalTier4) errors.push('normal Tier4 count mismatch');
if (generated?.summary?.spTier4CandidateCount !== spTier4) errors.push('SP Tier4 count mismatch');
if (generated?.summary?.notReleasedPollution !== 0) errors.push('generated pollution summary nonzero');

if (errors.length) {
  console.error(JSON.stringify({ status: 'FAIL', stage: 'hero-b3-final-job-extrema-validator', hardErrorCount: errors.length, errors }, null, 2));
  process.exit(1);
}

const summary = {
  version: 1,
  stage: 'hero-b3-final-job-extrema-validator',
  status: 'PASS',
  producerArithmeticRecomputed: false,
  statSource: 'frozen bonded consumer values copied exactly',
  eligibilitySource: 'ConfigDataJobInfo.Rank by exact jobId',
  requiredRank: 4,
  topologyUsedForEligibility: false,
  results: {
    canonicalHeroCount: 267,
    normalBondedConnectionCount: normalBondedConnections,
    normalTier4CandidateCount: normalTier4,
    spReleasedCount: released,
    spTier4CandidateCount: spTier4,
    candidateCount: expected.length,
    notReleasedPollution: pollution,
    candidateMismatchCount: 0,
    valueMismatchCount: 0,
    lowerRankPollution: 0,
    extremaMismatchCount: 0,
    tieSetMismatchCount: 0,
    hardErrorCount: 0,
    candidateSetSha256: keyHash,
    candidateValuesSha256: valueHash
  },
  extrema: expectedExtrema,
  blockers: [],
  review: []
};
fs.writeFileSync(full(SUMMARY), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
