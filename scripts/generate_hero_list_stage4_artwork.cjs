'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJson = (rel, value) => {
  const target = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};

const CONTRACT_PATH = 'data/contracts/hero-list-stage4.v1.json';
const LIST_PATH = 'data/generated/hero-list-stage1.v1.json';
const STAGE6_PATH = 'data/generated/hero-detail.v1.json';
const OUTPUT_PATH = 'data/generated/hero-card-artwork-stage4.v1.json';

const contract = readJson(CONTRACT_PATH);
const list = readJson(LIST_PATH);
const stage6 = readJson(STAGE6_PATH);

const failures = [];
const fail = message => failures.push(message);

if (contract.version !== 1 || contract.stage !== 'hero-list-stage4') fail('invalid Stage 4 contract');
if (list.freezeState !== 'HERO_LIST_STAGE1_FROZEN' || list.summary?.generatedRecordCount !== 267) {
  fail('Hero Stage 1 frozen list is not ready');
}
if (
  stage6.status !== 'PASS_WITH_REVIEW' ||
  stage6.completion !== 'COMPLETE' ||
  stage6.summary?.siteUsableCount !== 267 ||
  stage6.summary?.hardErrorCount !== 0 ||
  stage6.storage?.mode !== 'SHARDED_BY_HERO' ||
  stage6.storage?.recordCount !== 267
) {
  fail('Hero Stage 6 manifest is not ready');
}

const records = [];
const seen = new Set();
let resolvedCount = 0;
let pendingCount = 0;
let stage6MissingCount = 0;
let routeMismatchCount = 0;
let sourceLocatorMissingCount = 0;

for (const hero of list.records ?? []) {
  const heroId = Number(hero.heroId);
  if (!Number.isSafeInteger(heroId) || heroId <= 0 || seen.has(heroId)) {
    fail(`invalid or duplicate Hero ID ${hero.heroId}`);
    continue;
  }
  seen.add(heroId);

  const expectedRoute = `/heroes/${heroId}`;
  if (hero.detailRoute !== expectedRoute) routeMismatchCount += 1;

  const sourceArtworkPath = hero.card?.sourceArtworkPath ?? null;
  if (!sourceArtworkPath) sourceLocatorMissingCount += 1;

  const stage6Shard = stage6.storage?.byHeroId?.[String(heroId)] ?? null;
  if (!stage6Shard?.path) stage6MissingCount += 1;

  const relativeFilePath = `${contract.artworkPolicy.assetRoot}/${heroId}.png`;
  const absoluteFilePath = path.join(ROOT, relativeFilePath);
  const exists = fs.existsSync(absoluteFilePath) && fs.statSync(absoluteFilePath).isFile();
  const webAssetPath = exists ? `${contract.artworkPolicy.webRoot}/${heroId}.png` : null;
  const assetStatus = exists ? 'RESOLVED' : contract.artworkPolicy.missingAssetStatus;

  if (exists) resolvedCount += 1;
  else pendingCount += 1;

  records.push({
    heroId,
    detailRoute: expectedRoute,
    sourceArtworkPath,
    expectedFilePath: relativeFilePath,
    webAssetPath,
    assetStatus,
    stage6ShardPath: stage6Shard?.path ?? null,
  });
}

if (records.length !== 267 || seen.size !== 267) fail(`Hero population mismatch records=${records.length} unique=${seen.size}`);
if (routeMismatchCount) fail(`route mismatch count ${routeMismatchCount}`);
if (sourceLocatorMissingCount) fail(`source artwork locator missing count ${sourceLocatorMissingCount}`);
if (stage6MissingCount) fail(`Stage 6 shard missing count ${stage6MissingCount}`);

const output = {
  version: 1,
  stage: 'hero-list-stage4-artwork',
  schemaId: 'hero-card-artwork-stage4/v1',
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  completion: failures.length === 0 ? 'RESOLVER_READY' : 'BLOCKED',
  sourcePolicy: {
    heroListStage1FrozenOnly: true,
    heroStage6ManifestAdmissionOnly: true,
    rawConfigDataRead: false,
    inferWebPathFromUnityLocator: false,
    resolveOnlyWhenFileExists: true,
  },
  assetPolicy: contract.artworkPolicy,
  summary: {
    heroCount: records.length,
    uniqueHeroCount: seen.size,
    resolvedCount,
    pendingCount,
    stage6MissingCount,
    routeMismatchCount,
    sourceLocatorMissingCount,
    hardErrorCount: failures.length,
  },
  records,
  failures,
};

writeJson(OUTPUT_PATH, output);
console.log(JSON.stringify(output.summary, null, 2));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
