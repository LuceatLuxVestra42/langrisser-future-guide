'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const P = {
  contract: 'data/contracts/hero-list-stage1.v1.json',
  manifest: 'data/generated/hero-detail.v1.json',
  output: 'data/generated/hero-list-stage1.v1.json',
  validation: 'data/validation/hero-list-stage1-final.v1.json',
  checkpointJson: 'data/checkpoints/hero-list-stage1.json',
  checkpointMd: 'data/checkpoints/hero-list-stage1.md',
};

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const writeJson = (rel, value) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + '\n');
};
const writeText = (rel, value) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), value.endsWith('\n') ? value : value + '\n');
};
const blobSha = rel => {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

const contract = read(P.contract);
const manifest = read(P.manifest);
const checks = [];
const hardErrors = [];
const check = (name, pass, detail = null) => {
  const row = { name, pass: Boolean(pass) };
  if (detail !== null) row.detail = detail;
  checks.push(row);
  if (!row.pass) hardErrors.push(`${name}${detail ? `: ${detail}` : ''}`);
};

check(
  'contract-frozen',
  contract?.version === 1 && contract?.stage === 'hero-list-stage1' && contract?.status === 'FROZEN',
  `${contract?.version}/${contract?.stage}/${contract?.status}`,
);
check(
  'stage6-manifest-frozen-input',
  manifest?.stage === 'hero-page-6-3' &&
    manifest?.completion === 'COMPLETE' &&
    manifest?.storage?.mode === 'SHARDED_BY_HERO' &&
    manifest?.storage?.recordCount === 267 &&
    manifest?.summary?.siteUsableCount === 267 &&
    manifest?.summary?.hardErrorCount === 0,
  JSON.stringify({
    stage: manifest?.stage,
    completion: manifest?.completion,
    storageMode: manifest?.storage?.mode,
    recordCount: manifest?.storage?.recordCount,
    siteUsable: manifest?.summary?.siteUsableCount,
    hardErrors: manifest?.summary?.hardErrorCount,
  }),
);

const manifestIndex = manifest?.storage?.byHeroId || {};
const heroIds = Object.keys(manifestIndex).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
check(
  'manifest-hero-population',
  heroIds.length === contract?.expectedPopulation?.heroCount && new Set(heroIds).size === heroIds.length,
  `heroKeys=${heroIds.length}`,
);

const records = [];
const failedHeroIds = new Set();
let shardMissingCount = 0;
let shardIntegrityMismatchCount = 0;
let shardHeroIdMismatchCount = 0;
let siteUsableMismatchCount = 0;
let identityMissingCount = 0;
let rarityMissingCount = 0;
let factionShapeMismatchCount = 0;
let originMissingCount = 0;
let sourceArtworkPresentCount = 0;
let sourceArtworkMissingCount = 0;
let spReleasedCount = 0;
let spNotReleasedCount = 0;
let unexpectedSpStatusCount = 0;
let projectionMismatchCount = 0;
let routeMismatchCount = 0;

for (const heroId of heroIds) {
  const locator = manifestIndex[String(heroId)];
  if (!locator?.path || !fs.existsSync(abs(locator.path))) {
    shardMissingCount += 1;
    failedHeroIds.add(heroId);
    continue;
  }

  const buffer = fs.readFileSync(abs(locator.path));
  if (sha256(buffer) !== locator.sha256 || buffer.length !== locator.byteLength) {
    shardIntegrityMismatchCount += 1;
    failedHeroIds.add(heroId);
    continue;
  }

  let shard;
  try {
    shard = JSON.parse(buffer.toString('utf8'));
  } catch {
    shardIntegrityMismatchCount += 1;
    failedHeroIds.add(heroId);
    continue;
  }

  if (Number(shard?.heroId) !== heroId) {
    shardHeroIdMismatchCount += 1;
    failedHeroIds.add(heroId);
  }
  if (shard?.validation?.structuralStatus !== 'PASS' || shard?.validation?.siteUsable !== true) {
    siteUsableMismatchCount += 1;
    failedHeroIds.add(heroId);
  }

  const identity = clone(shard?.identity || null);
  const rarity = clone(shard?.presentation?.rarity || null);
  const factions = clone(Array.isArray(shard?.presentation?.factions) ? shard.presentation.factions : []);
  const origin = clone(shard?.presentation?.origin || null);
  const sourceArtworkPath = shard?.presentation?.artwork?.sourceAssetPath ?? null;
  const spStatus = shard?.sp?.status ?? null;

  if (!identity?.nameCn) identityMissingCount += 1;
  if (!rarity?.baseLabel || !Number.isFinite(Number(rarity?.rank))) rarityMissingCount += 1;
  if (factions.some(row => !Number.isInteger(Number(row?.factionId)))) factionShapeMismatchCount += 1;
  if (!origin?.category || !Number.isInteger(Number(origin?.productionId))) originMissingCount += 1;
  if (sourceArtworkPath) sourceArtworkPresentCount += 1;
  else sourceArtworkMissingCount += 1;

  if (spStatus === 'RELEASED') spReleasedCount += 1;
  else if (spStatus === 'NOT_RELEASED') spNotReleasedCount += 1;
  else unexpectedSpStatusCount += 1;

  const record = {
    heroId,
    detailRoute: `/heroes/${heroId}`,
    identity,
    rarity,
    hasSp: spStatus === 'RELEASED',
    spStatus,
    factions,
    origin,
    card: {
      sourceArtworkPath,
      webAssetPath: null,
      assetStatus: sourceArtworkPath ? 'SOURCE_ONLY' : 'SOURCE_MISSING',
    },
  };

  if (record.detailRoute !== `/heroes/${heroId}`) routeMismatchCount += 1;
  if (
    JSON.stringify(record.identity) !== JSON.stringify(shard?.identity || null) ||
    JSON.stringify(record.rarity) !== JSON.stringify(shard?.presentation?.rarity || null) ||
    JSON.stringify(record.factions) !== JSON.stringify(Array.isArray(shard?.presentation?.factions) ? shard.presentation.factions : []) ||
    JSON.stringify(record.origin) !== JSON.stringify(shard?.presentation?.origin || null) ||
    record.card.sourceArtworkPath !== (shard?.presentation?.artwork?.sourceAssetPath ?? null) ||
    record.spStatus !== (shard?.sp?.status ?? null)
  ) {
    projectionMismatchCount += 1;
    failedHeroIds.add(heroId);
  }
  records.push(record);
}

check('all-hero-shards-present', shardMissingCount === 0, `missing=${shardMissingCount}`);
check('all-hero-shards-integrity-pass', shardIntegrityMismatchCount === 0, `mismatch=${shardIntegrityMismatchCount}`);
check('hero-id-parity', shardHeroIdMismatchCount === 0, `mismatch=${shardHeroIdMismatchCount}`);
check('all-source-heroes-site-usable', siteUsableMismatchCount === 0, `mismatch=${siteUsableMismatchCount}`);
check('identity-projection-ready', identityMissingCount === 0, `missing=${identityMissingCount}`);
check('rarity-projection-ready', rarityMissingCount === 0, `missing=${rarityMissingCount}`);
check('faction-projection-shape', factionShapeMismatchCount === 0, `mismatch=${factionShapeMismatchCount}`);
check('origin-projection-ready', originMissingCount === 0, `missing=${originMissingCount}`);
check('projection-exact-copy', projectionMismatchCount === 0, `mismatch=${projectionMismatchCount}`);
check('stable-detail-route', routeMismatchCount === 0, `mismatch=${routeMismatchCount}`);
check(
  'sp-population-preserved',
  spReleasedCount === contract?.expectedPopulation?.releasedSpHeroCount &&
    spNotReleasedCount === contract?.expectedPopulation?.notReleasedSpHeroCount &&
    unexpectedSpStatusCount === 0,
  `released=${spReleasedCount}, notReleased=${spNotReleasedCount}, unexpected=${unexpectedSpStatusCount}`,
);
check(
  'record-population-preserved',
  records.length === contract?.expectedPopulation?.heroCount && new Set(records.map(row => row.heroId)).size === records.length,
  `records=${records.length}, unique=${new Set(records.map(row => row.heroId)).size}`,
);

const forbiddenTopLevelKeys = ['release', 'releaseOrder', 'releaseDate', 'fusionPower', 'soloLimited'];
let forbiddenPresentationInferenceCount = 0;
for (const record of records) {
  for (const key of forbiddenTopLevelKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) forbiddenPresentationInferenceCount += 1;
  }
}
check('no-deferred-presentation-inference', forbiddenPresentationInferenceCount === 0, `forbiddenFields=${forbiddenPresentationInferenceCount}`);

const sourcePolicy = contract?.sourcePolicy || {};
check(
  'source-boundary-frozen-consumer-only',
  sourcePolicy.heroStage6FinalFrozenOnly === true &&
    sourcePolicy.rawConfigDataRead === false &&
    sourcePolicy.stage4ProducerRead === false &&
    sourcePolicy.stage5ProducerRead === false &&
    sourcePolicy.relationshipRederivation === false &&
    sourcePolicy.nameOrIdHeuristics === false,
  JSON.stringify(sourcePolicy),
);

const summary = {
  canonicalHeroCount: heroIds.length,
  generatedRecordCount: records.length,
  uniqueHeroCount: new Set(records.map(row => row.heroId)).size,
  shardMissingCount,
  shardIntegrityMismatchCount,
  shardHeroIdMismatchCount,
  siteUsableMismatchCount,
  identityMissingCount,
  rarityMissingCount,
  factionShapeMismatchCount,
  originMissingCount,
  sourceArtworkPresentCount,
  sourceArtworkMissingCount,
  spReleasedCount,
  spNotReleasedCount,
  unexpectedSpStatusCount,
  projectionMismatchCount,
  routeMismatchCount,
  forbiddenPresentationInferenceCount,
  hardErrorCount: hardErrors.length,
};
const status = hardErrors.length === 0 ? 'PASS' : 'FAIL';
const completion = hardErrors.length === 0 ? 'COMPLETE' : 'BLOCKED';
const freezeState = hardErrors.length === 0 ? 'HERO_LIST_STAGE1_FROZEN' : 'HERO_LIST_STAGE1_NOT_FROZEN';

writeJson(P.output, {
  version: 1,
  stage: 'hero-list-stage1',
  schemaId: 'hero-list/v1',
  status,
  completion,
  freezeState,
  source: {
    contract: P.contract,
    contractGitBlobSha: blobSha(P.contract),
    heroStage6Manifest: P.manifest,
    heroStage6ManifestGitBlobSha: blobSha(P.manifest),
    heroStage6Status: manifest?.status || null,
    heroStage6Completion: manifest?.completion || null,
    heroStage6StorageMode: manifest?.storage?.mode || null,
  },
  sourcePolicy: clone(sourcePolicy),
  ordering: {
    mode: 'HERO_ID_ASC_FOR_DETERMINISTIC_ARTIFACT_ONLY',
    isDisplayReleaseOrder: false,
    releaseChronologyDeferred: true,
  },
  deferredPresentation: clone(contract?.explicitlyDeferred || {}),
  summary,
  records,
});

writeJson(P.validation, {
  version: 1,
  stage: 'hero-list-stage1',
  status,
  completion,
  freezeState,
  sources: {
    contract: P.contract,
    heroStage6Manifest: P.manifest,
  },
  checks,
  summary,
  failedHeroIds: [...failedHeroIds].sort((a, b) => a - b),
  hardErrors,
  decision: hardErrors.length === 0
    ? 'Stage 1 is complete. The lightweight Hero list projection is frozen and Stage 2 may consume it for /heroes grid work.'
    : 'Stage 1 is blocked. Do not start the /heroes grid until all hard errors are resolved.',
});

writeJson(P.checkpointJson, {
  version: 1,
  stage: 'hero-list-stage1',
  status,
  completion,
  freezeState,
  completedScope: [
    'FINAL_FROZEN Hero Stage 6 manifest/shard consumption boundary',
    '267 Hero lightweight list projection',
    'identity/rarity/SP/faction/origin/source artwork locator projection',
    'shard integrity and site-usable validation',
    'deferred presentation inference guard',
  ],
  officialConsumer: P.output,
  validation: P.validation,
  deferred: [
    'release chronology and display ordering',
    'web artwork resolution',
    'fusion power badge metadata',
    'SSR solo-limited presentation metadata',
  ],
  nextStart: 'Stage 2: build the /heroes basic grid from data/generated/hero-list-stage1.v1.json without raw ConfigData or Hero semantic recomputation.',
  summary,
});

writeText(P.checkpointMd, `# Hero List Stage 1 checkpoint\n\n- status: ${status}\n- completion: ${completion}\n- freezeState: ${freezeState}\n- Hero: ${summary.generatedRecordCount}/${summary.canonicalHeroCount}\n- unique Hero: ${summary.uniqueHeroCount}\n- SP: ${summary.spReleasedCount} released / ${summary.spNotReleasedCount} not released\n- shard missing/integrity mismatch: ${summary.shardMissingCount}/${summary.shardIntegrityMismatchCount}\n- projection mismatch: ${summary.projectionMismatchCount}\n- deferred presentation inference: ${summary.forbiddenPresentationInferenceCount}\n- hard errors: ${summary.hardErrorCount}\n\n## Official consumer\n\n\`${P.output}\`\n\n## Deferred\n\n- release chronology/display ordering\n- web artwork resolution\n- fusion power badge metadata\n- SSR solo-limited presentation metadata\n\n## Next start\n\nStage 2: build the \`/heroes\` basic grid from the frozen Stage 1 consumer. Do not read raw ConfigData or re-derive Hero semantics.\n`);

console.log(JSON.stringify({ status, completion, freezeState, summary, hardErrors }, null, 2));
if (hardErrors.length) process.exit(1);
