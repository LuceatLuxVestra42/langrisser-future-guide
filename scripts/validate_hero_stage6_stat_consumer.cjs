'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const text = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = message => { throw new Error(message); };

const stage56 = read('data/generated/hero-page-stage5-6-stat-composition.v1.json');
const stage56Validation = read('data/validation/hero-page-stage5-6-stat-composition.v1.json');
const manifest = read('data/generated/hero-detail.v1.json');
const refreshValidation = read('data/validation/hero-stage6-5-stat-consumer-refresh.v1.json');
const serverSource = text('src/lib/hero-detail-stage5.server.ts');
const routeSource = text('src/routes/heroes_.$heroId.tsx');

if (stage56Validation.status !== 'PASS' || stage56Validation.completion !== 'COMPLETE' || stage56Validation.errors?.length) fail('Stage5-6 predecessor is not PASS/COMPLETE.');
if (stage56.records?.length !== 267 || stage56.summary?.spReleasedCount !== 25) fail('Stage5-6 population mismatch.');
if (refreshValidation.status !== 'PASS' || refreshValidation.completion !== 'COMPLETE' || refreshValidation.summary?.hardErrorCount !== 0) fail('Stage6 refresh producer validation is not PASS/COMPLETE.');
if (manifest.storage?.mode !== 'SHARDED_BY_HERO' || manifest.storage?.recordCount !== 267) fail('Stage6 production manifest is not 267-shard mode.');
if (manifest.productionRefresh?.stage !== 'hero-page-6-5-stat-consumer-refresh' || manifest.productionRefresh?.semanticRecomputation !== false) fail('Stage6 productionRefresh provenance missing.');
if (!manifest.sources?.['data/generated/hero-page-stage5-6-stat-composition.v1.json']) fail('Stage5-6 generated predecessor missing from production manifest sources.');

const by56 = new Map(stage56.records.map(row => [Number(row.heroId), row]));
const locators = manifest.storage.byHeroId || {};
const ids = Object.keys(locators).map(Number).sort((a, b) => a - b);
if (ids.length !== 267 || new Set(ids).size !== 267) fail(`Manifest Hero cardinality mismatch: ${ids.length}.`);

let normalJobs = 0;
let spJobs = 0;
let bytes = 0;
let leonMatches = 0;
const leonExpected = { hp: 4929, at: 623, magic: 233, df: 300, magicDf: 280, dex: 130 };

for (const heroId of ids) {
  const locator = locators[String(heroId)];
  const rel = locator.path;
  const shardText = text(rel);
  if (hash(shardText) !== locator.sha256 || Buffer.byteLength(shardText) !== locator.byteLength) fail(`Hero ${heroId}: shard integrity mismatch.`);
  bytes += locator.byteLength;
  const shard = JSON.parse(shardText);
  const composed = by56.get(heroId);
  if (!composed) fail(`Hero ${heroId}: Stage5-6 record missing.`);
  if (Number(shard.heroId) !== heroId || shard.validation?.structuralStatus !== 'PASS' || shard.validation?.siteUsable !== true) fail(`Hero ${heroId}: production shard structural boundary failed.`);

  const connections = shard.normal?.jobTree?.connections || [];
  const normalByConnection = new Map((composed.normalJobs || []).map(job => [Number(job.jobConnectionId), job]));
  if (connections.length !== normalByConnection.size) fail(`Hero ${heroId}: normal job cardinality mismatch.`);
  for (const connection of connections) {
    const expected = normalByConnection.get(Number(connection.jobConnectionId));
    const actual = connection.finalDisplayStats;
    if (!expected) fail(`Hero ${heroId}: JobConnection ${connection.jobConnectionId} missing from Stage5-6.`);
    if (Number(connection.jobId) !== Number(expected.jobId) || Number(actual?.jobLevelId) !== Number(expected.jobLevelId)) fail(`Hero ${heroId}: normal job identity mismatch.`);
    if (!same(actual?.values, expected.values) || !same(actual?.components, expected.components)) fail(`Hero ${heroId}: normal stat parity mismatch at JobConnection ${connection.jobConnectionId}.`);
    if (actual?.statComposition?.sourceStage !== 'hero-page-5-6-stat-composition' || actual?.statComposition?.includesCentralBond !== true) fail(`Hero ${heroId}: normal stat provenance missing.`);
    normalJobs += 1;
  }

  if (composed.sp?.status === 'RELEASED') {
    const actual = shard.sp?.finalDisplayStats;
    if (shard.sp?.status !== 'RELEASED' || !actual) fail(`Hero ${heroId}: released SP production stats missing.`);
    if (Number(shard.sp.job?.jobConnectionId) !== Number(composed.sp.jobConnectionId) || Number(shard.sp.job?.jobId) !== Number(composed.sp.jobId)) fail(`Hero ${heroId}: SP identity mismatch.`);
    if (!same(actual.values, composed.sp.values) || !same(actual.components, composed.sp.components)) fail(`Hero ${heroId}: SP stat parity mismatch.`);
    if (actual?.statComposition?.sourceStage !== 'hero-page-5-6-stat-composition' || actual?.statComposition?.includesCentralBond !== true || actual?.statComposition?.includesSpBonus !== true) fail(`Hero ${heroId}: SP stat provenance missing.`);
    spJobs += 1;
    if (heroId === 6 && Number(composed.sp.jobId) === 377) {
      if (!same(actual.values, leonExpected)) fail(`Leon SP Job 377 mismatch: ${JSON.stringify(actual.values)}.`);
      leonMatches += 1;
    }
  } else if (shard.sp?.status === 'RELEASED') {
    fail(`Hero ${heroId}: unexpected released SP shard.`);
  }
}

if (normalJobs !== 1388) fail(`Normal job population mismatch: ${normalJobs}.`);
if (spJobs !== 25) fail(`SP materialized population mismatch: ${spJobs}.`);
if (leonMatches !== 1) fail(`Leon SP Job 377 match count: ${leonMatches}.`);
if (bytes !== manifest.storage.totalShardBytes) fail(`Total shard byte mismatch: ${bytes}/${manifest.storage.totalShardBytes}.`);
if (manifest.summary?.statCompositionHeroCount !== 267 || manifest.summary?.statCompositionNormalJobCount !== 1388 || manifest.summary?.statCompositionSpCount !== 25 || manifest.summary?.statCompositionParityMismatchCount !== 0) fail('Manifest stat-composition summary mismatch.');

if (!serverSource.includes('../../data/generated/hero-detail/by-id/*.json') || !serverSource.includes('finalDisplayStats') || !serverSource.includes('fullDatasetRuntimeRead: false') || serverSource.includes('ConfigData')) fail('Frontend server production boundary mismatch.');
if (!routeSource.includes('data-hero-final-job-stats="true"') || !routeSource.includes('최종 직업 스탯')) fail('Frontend final-job stat render path missing.');

console.log(JSON.stringify({
  status: 'PASS',
  stage: 'hero-page-6-5-stat-consumer-independent-validation',
  canonicalHeroCount: ids.length,
  normalJobCount: normalJobs,
  spMaterializedCount: spJobs,
  leonSpJob377MatchCount: leonMatches,
  totalShardBytes: bytes,
  frontendProductionShardConsumer: true,
  frontendFinalJobStatRender: true,
  boundaries: { nameJoin: false, idArithmetic: false, rawConfigDataRead: false, semanticRecomputation: false }
}, null, 2));
