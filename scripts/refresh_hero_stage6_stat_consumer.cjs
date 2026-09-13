'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const P = {
  contract: 'data/contracts/hero-stage6-5-stat-consumer-refresh.v1.json',
  stage56: 'data/generated/hero-page-stage5-6-stat-composition.v1.json',
  stage56Validation: 'data/validation/hero-page-stage5-6-stat-composition.v1.json',
  manifest: 'data/generated/hero-detail.v1.json',
  stage64Validation: 'data/validation/hero-stage6-4-final.v1.json',
  frontendServer: 'src/lib/hero-detail-stage5.server.ts',
  frontendRoute: 'src/routes/heroes_.$heroId.tsx',
  validation: 'data/validation/hero-stage6-5-stat-consumer-refresh.v1.json',
  checkpoint: 'data/checkpoints/hero-stage6-5-stat-consumer-refresh.md',
};
const STAT_KEYS = ['hp', 'at', 'magic', 'df', 'magicDf', 'dex'];
const EXPECTED_LEON_SP = { hp: 4929, at: 623, magic: 233, df: 300, magicDf: 280, dex: 130 };

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const writeJson = (rel, value, pretty = true) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, pretty ? 2 : 0) + '\n');
};
const writeText = (rel, value) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), value.endsWith('\n') ? value : value + '\n');
};
const blobSha = rel => {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const assertIntValues = (values, label, errors) => {
  for (const key of STAT_KEYS) {
    if (!Number.isInteger(values?.[key]) || values[key] < 0) errors.push(`${label}: invalid ${key}=${values?.[key]}`);
  }
};

const contract = read(P.contract);
const stage56 = read(P.stage56);
const stage56Validation = read(P.stage56Validation);
const manifest = read(P.manifest);
const stage64 = read(P.stage64Validation);
const frontendServer = fs.readFileSync(abs(P.frontendServer), 'utf8');
const frontendRoute = fs.readFileSync(abs(P.frontendRoute), 'utf8');

const errors = [];
const checks = [];
const check = (name, pass, detail = null) => {
  const row = { name, pass: Boolean(pass) };
  if (detail !== null) row.detail = detail;
  checks.push(row);
  if (!row.pass) errors.push(`${name}${detail ? `: ${detail}` : ''}`);
};

check('contract-frozen', contract?.version === 1 && contract?.stage === 'hero-page-6-5-stat-consumer-refresh' && contract?.status === 'FROZEN', `${contract?.version}/${contract?.stage}/${contract?.status}`);
check('stage5-6-pass', stage56Validation?.status === 'PASS' && stage56Validation?.completion === 'COMPLETE' && (stage56Validation?.errors?.length ?? 1) === 0, `${stage56Validation?.status}/${stage56Validation?.completion}/errors=${stage56Validation?.errors?.length}`);
check('stage5-6-population', stage56?.summary?.canonicalHeroCount === 267 && stage56?.summary?.spReleasedCount === 25 && Array.isArray(stage56?.records) && stage56.records.length === 267, `heroes=${stage56?.records?.length}, sp=${stage56?.summary?.spReleasedCount}`);
check('stage6-4-predecessor-closed', stage64?.completion === 'COMPLETE' && stage64?.summary?.canonicalHeroCount === 267 && stage64?.summary?.hardErrorCount === 0, `${stage64?.status}/${stage64?.completion}/hard=${stage64?.summary?.hardErrorCount}`);
check('manifest-production-shards', manifest?.completion === 'COMPLETE' && manifest?.storage?.mode === 'SHARDED_BY_HERO' && manifest?.storage?.recordCount === 267, `${manifest?.stage}/${manifest?.completion}/${manifest?.storage?.mode}/records=${manifest?.storage?.recordCount}`);

const stage56ByHero = new Map();
for (const row of Array.isArray(stage56?.records) ? stage56.records : []) {
  const heroId = Number(row?.heroId);
  if (!Number.isInteger(heroId)) {
    errors.push(`Stage5-6 invalid heroId ${row?.heroId}`);
    continue;
  }
  if (stage56ByHero.has(heroId)) errors.push(`Stage5-6 duplicate heroId ${heroId}`);
  stage56ByHero.set(heroId, row);
}
check('stage5-6-unique-267', stage56ByHero.size === 267, `unique=${stage56ByHero.size}`);

const index = manifest?.storage?.byHeroId || {};
const heroIds = Object.keys(index).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
check('manifest-unique-267', heroIds.length === 267 && new Set(heroIds).size === 267, `keys=${heroIds.length}`);

let normalJobCount = 0;
let normalParityMismatchCount = 0;
let spMaterializedCount = 0;
let spParityMismatchCount = 0;
let structuralFailureCount = 0;
let totalShardBytes = 0;
let leonSpJob377MatchCount = 0;
const failedHeroIds = [];

for (const heroId of heroIds) {
  const locator = index[String(heroId)];
  const rel = locator?.path;
  const heroErrors = [];
  if (typeof rel !== 'string' || !fs.existsSync(abs(rel))) {
    errors.push(`Hero ${heroId}: shard missing at ${rel}`);
    failedHeroIds.push(heroId);
    continue;
  }
  const shard = read(rel);
  const composed = stage56ByHero.get(heroId);
  if (!composed) {
    errors.push(`Hero ${heroId}: Stage5-6 row missing`);
    failedHeroIds.push(heroId);
    continue;
  }
  if (Number(shard?.heroId) !== heroId || shard?.validation?.structuralStatus !== 'PASS' || shard?.validation?.siteUsable !== true) {
    structuralFailureCount += 1;
    heroErrors.push('existing Stage6 shard is not structurally site-usable');
  }

  const connections = Array.isArray(shard?.normal?.jobTree?.connections) ? shard.normal.jobTree.connections : [];
  const jobs = Array.isArray(composed?.normalJobs) ? composed.normalJobs : [];
  const jobByConnection = new Map(jobs.map(job => [Number(job?.jobConnectionId), job]));
  if (connections.length !== jobs.length || jobByConnection.size !== jobs.length) {
    heroErrors.push(`normal job cardinality mismatch stage6=${connections.length}, stage5-6=${jobs.length}, unique=${jobByConnection.size}`);
  }

  for (const connection of connections) {
    const connectionId = Number(connection?.jobConnectionId);
    const composedJob = jobByConnection.get(connectionId);
    if (!composedJob) {
      heroErrors.push(`normal JobConnection ${connectionId}: Stage5-6 composition missing`);
      continue;
    }
    normalJobCount += 1;
    const existing = connection?.finalDisplayStats;
    const jobIdPass = Number(connection?.jobId) === Number(composedJob?.jobId);
    const jobLevelPass = Number(existing?.jobLevelId) === Number(composedJob?.jobLevelId);
    if (!jobIdPass || !jobLevelPass) {
      heroErrors.push(`normal JobConnection ${connectionId}: identity mismatch jobId=${connection?.jobId}/${composedJob?.jobId}, jobLevelId=${existing?.jobLevelId}/${composedJob?.jobLevelId}`);
      continue;
    }
    assertIntValues(composedJob.values, `Hero ${heroId} JobConnection ${connectionId}`, heroErrors);
    connection.finalDisplayStats = {
      ...existing,
      status: existing?.status ?? 'VERIFIED',
      jobLevelId: Number(composedJob.jobLevelId),
      formula: 'Stage5-6 frozen stat composition: Stage4 star-adjusted raw + frozen normal bond + optional SP bonus + central bond + frozen mastery flat',
      values: JSON.parse(JSON.stringify(composedJob.values)),
      components: JSON.parse(JSON.stringify(composedJob.components)),
      statComposition: {
        sourceStage: 'hero-page-5-6-stat-composition',
        includesNormalBond: true,
        includesCentralBond: true,
        normalBondProfile: composed?.normalBond?.bondProfile ?? null,
        normalBondSelfMul: composed?.normalBond?.bondSelfMul ?? null,
      },
    };
    if (!same(connection.finalDisplayStats.values, composedJob.values) || !same(connection.finalDisplayStats.components, composedJob.components)) normalParityMismatchCount += 1;
  }

  const spComposed = composed?.sp;
  if (spComposed?.status === 'RELEASED') {
    if (shard?.sp?.status !== 'RELEASED') {
      heroErrors.push(`SP release mismatch shard=${shard?.sp?.status}`);
    } else {
      const shardJobConnectionId = Number(shard?.sp?.job?.jobConnectionId);
      const shardJobId = Number(shard?.sp?.job?.jobId);
      if (shardJobConnectionId !== Number(spComposed.jobConnectionId) || shardJobId !== Number(spComposed.jobId)) {
        heroErrors.push(`SP identity mismatch connection=${shardJobConnectionId}/${spComposed.jobConnectionId}, job=${shardJobId}/${spComposed.jobId}`);
      } else {
        assertIntValues(spComposed.values, `Hero ${heroId} SP JobConnection ${spComposed.jobConnectionId}`, heroErrors);
        shard.sp.finalDisplayStats = {
          status: 'VERIFIED',
          heroLevel: 70,
          star: 6,
          jobConnectionId: Number(spComposed.jobConnectionId),
          jobId: Number(spComposed.jobId),
          jobLevelId: Number(spComposed.jobLevelId),
          formula: 'Stage5-6 frozen SP stat composition: Stage4-compatible star-adjusted raw + frozen normal bond + SP second-stage bonus + central bond + frozen mastery flat',
          values: JSON.parse(JSON.stringify(spComposed.values)),
          components: JSON.parse(JSON.stringify(spComposed.components)),
          statComposition: {
            sourceStage: 'hero-page-5-6-stat-composition',
            includesNormalBond: true,
            includesSpBonus: true,
            includesCentralBond: true,
            normalBondProfile: composed?.normalBond?.bondProfile ?? null,
            normalBondSelfMul: composed?.normalBond?.bondSelfMul ?? null,
          },
        };
        spMaterializedCount += 1;
        if (!same(shard.sp.finalDisplayStats.values, spComposed.values) || !same(shard.sp.finalDisplayStats.components, spComposed.components)) spParityMismatchCount += 1;
        if (heroId === 6 && Number(spComposed.jobId) === 377) {
          leonSpJob377MatchCount += 1;
          if (!same(spComposed.values, EXPECTED_LEON_SP)) heroErrors.push(`Leon SP Job 377 exact regression mismatch: ${JSON.stringify(spComposed.values)}`);
        }
      }
    }
  } else if (shard?.sp?.status === 'RELEASED') {
    heroErrors.push('Stage6 SP RELEASED but Stage5-6 composition is not RELEASED');
  }

  if (heroErrors.length) {
    errors.push(...heroErrors.map(value => `Hero ${heroId}: ${value}`));
    failedHeroIds.push(heroId);
    continue;
  }

  const text = JSON.stringify(shard) + '\n';
  fs.writeFileSync(abs(rel), text);
  locator.sha256 = sha256(text);
  locator.byteLength = Buffer.byteLength(text);
  totalShardBytes += locator.byteLength;
}

check('all-shards-remain-structural', structuralFailureCount === 0, `fail=${structuralFailureCount}`);
check('normal-stat-full-parity', normalParityMismatchCount === 0 && normalJobCount > 0, `jobs=${normalJobCount}, mismatch=${normalParityMismatchCount}`);
check('sp-stat-full-parity', spMaterializedCount === 25 && spParityMismatchCount === 0, `materialized=${spMaterializedCount}, mismatch=${spParityMismatchCount}`);
check('leon-sp-job377-exact', leonSpJob377MatchCount === 1, `matches=${leonSpJob377MatchCount}`);

if (errors.length === 0) {
  manifest.sourcePolicy = `${manifest.sourcePolicy} Final job stat values/components are refreshed from the validated Stage 5-6 stat-composition predecessor without semantic recomputation.`;
  manifest.sources = {
    ...(manifest.sources || {}),
    [P.stage56]: { gitBlobSha: blobSha(P.stage56) },
    [P.stage56Validation]: { gitBlobSha: blobSha(P.stage56Validation) },
    [P.contract]: { gitBlobSha: blobSha(P.contract) },
  };
  manifest.summary = {
    ...(manifest.summary || {}),
    statCompositionHeroCount: 267,
    statCompositionNormalJobCount: normalJobCount,
    statCompositionSpCount: spMaterializedCount,
    statCompositionParityMismatchCount: normalParityMismatchCount + spParityMismatchCount,
  };
  manifest.productionRefresh = {
    stage: 'hero-page-6-5-stat-consumer-refresh',
    predecessor: P.stage56,
    validation: P.validation,
    normalTarget: 'normal.jobTree.connections[*].finalDisplayStats',
    spTarget: 'sp.finalDisplayStats',
    semanticRecomputation: false,
  };
  manifest.storage.totalShardBytes = totalShardBytes;
  writeJson(P.manifest, manifest, true);
}

const frontendShardReadPass = frontendServer.includes('../../data/generated/hero-detail/by-id/*.json') && frontendServer.includes('finalDisplayStats') && frontendServer.includes('finalStats:') && frontendServer.includes('fullDatasetRuntimeRead: false') && !frontendServer.includes('ConfigData');
const frontendRenderPass = frontendRoute.includes('data-hero-final-job-stats="true"') && frontendRoute.includes('최종 직업 스탯');
check('frontend-production-shard-consumer', frontendShardReadPass, 'server must load per-Hero Stage6 shards and project finalDisplayStats without raw ConfigData');
check('frontend-final-job-stat-render', frontendRenderPass, 'Hero route must render the final job stat section from projected Stage6 data');

const status = errors.length ? 'FAIL' : 'PASS';
const completion = errors.length ? 'BLOCKED' : 'COMPLETE';
const validation = {
  version: 1,
  stage: 'hero-page-6-5-stat-consumer-refresh',
  status,
  completion,
  owner: 'hero-production-materialization',
  contract: P.contract,
  predecessors: {
    stage56Generated: { path: P.stage56, gitBlobSha: blobSha(P.stage56) },
    stage56Validation: { path: P.stage56Validation, gitBlobSha: blobSha(P.stage56Validation) },
    stage64Validation: { path: P.stage64Validation, gitBlobSha: blobSha(P.stage64Validation) },
  },
  checks,
  summary: {
    canonicalHeroCount: heroIds.length,
    normalJobCount,
    normalParityMismatchCount,
    spMaterializedCount,
    spParityMismatchCount,
    leonSpJob377MatchCount,
    structuralFailureCount,
    failedHeroCount: new Set(failedHeroIds).size,
    hardErrorCount: errors.length,
    frontendProductionShardConsumer: frontendShardReadPass,
    frontendFinalJobStatRender: frontendRenderPass,
  },
  boundaries: {
    nameJoin: false,
    idArithmetic: false,
    rawConfigDataRead: false,
    stage4Recomputed: false,
    stage5Recomputed: false,
    relationRecomputed: false,
  },
  errors,
  decision: errors.length
    ? 'Hero Stage 6 stat-consumer refresh is BLOCKED. Do not treat production final job stats as refreshed.'
    : 'Hero Stage 6 stat-consumer refresh is COMPLETE. The existing production Hero shards now consume Stage 5-6 final stat composition for every normal job and all 25 released SP jobs; the current frontend reads those shards and renders normal final job stats without semantic recomputation.',
};
writeJson(P.validation, validation, true);

const checkpoint = `# Hero Stage 6-5 Stat Consumer Refresh\n\n- Status: **${status} / ${completion}**\n- Stage 5-6 predecessor: **${stage56Validation?.status} / ${stage56Validation?.completion}**\n- Production Hero shards: **${heroIds.length}/267**\n- Normal jobs refreshed: **${normalJobCount}**\n- Normal parity mismatches: **${normalParityMismatchCount}**\n- SP jobs refreshed: **${spMaterializedCount}/25**\n- SP parity mismatches: **${spParityMismatchCount}**\n- Leon SP Job 377 exact regression matches: **${leonSpJob377MatchCount}**\n- Frontend production shard consumer: **${frontendShardReadPass ? 'PASS' : 'FAIL'}**\n- Frontend normal final-job stat render: **${frontendRenderPass ? 'PASS' : 'FAIL'}**\n- Hard errors: **${errors.length}**\n\n## Authority\n\nStage 5-6 remains the stat-composition semantic predecessor. This Stage 6 layer only materializes its frozen values/components into the existing production Hero shards and refreshes shard integrity metadata. No Stage 4/5 semantic or relation is recomputed.\n\n## Reopen conditions\n\nReopen only if the Stage 5-6 artifact/validation changes, production shard schema changes, exact parity fails, or the frontend stops consuming the Stage 6 per-Hero shard finalDisplayStats path.\n`;
writeText(P.checkpoint, checkpoint);

console.log(JSON.stringify({ status, completion, summary: validation.summary, checks, errors: errors.slice(0, 20) }, null, 2));
if (errors.length) process.exitCode = 1;
