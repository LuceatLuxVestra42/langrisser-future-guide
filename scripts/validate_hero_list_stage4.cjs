'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readText = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const writeJson = (rel, value) => {
  const target = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};

const predecessor = readJson('data/checkpoints/hero-list-stage3.json');
const list = readJson('data/generated/hero-list-stage1.v1.json');
const stage6 = readJson('data/generated/hero-detail.v1.json');
const artwork = readJson('data/generated/hero-card-artwork-stage4.v1.json');
const server = readText('src/lib/hero-list.server.ts');
const functions = readText('src/lib/hero-list.functions.ts');
const listRoute = readText('src/routes/heroes.tsx');
const detailRoute = readText('src/routes/heroes_.$heroId.tsx');

const failures = [];
const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: Boolean(pass), detail });
  if (!pass) failures.push(`${name}: ${detail}`);
};

check(
  'stage3-predecessor',
  predecessor.stage === 'hero-list-stage3' && predecessor.status === 'PASS_WITH_REVIEW' && predecessor.completion === 'COMPLETE',
  `${predecessor.stage}/${predecessor.status}/${predecessor.completion}`,
);
check(
  'stage1-frozen-source',
  list.freezeState === 'HERO_LIST_STAGE1_FROZEN' && list.summary?.generatedRecordCount === 267 && list.summary?.hardErrorCount === 0,
  `${list.freezeState}/${list.summary?.generatedRecordCount}/${list.summary?.hardErrorCount}`,
);
check(
  'stage6-admission-source',
  stage6.status === 'PASS_WITH_REVIEW' && stage6.completion === 'COMPLETE' && stage6.summary?.siteUsableCount === 267 && stage6.summary?.hardErrorCount === 0 && stage6.storage?.mode === 'SHARDED_BY_HERO' && stage6.storage?.recordCount === 267,
  `${stage6.status}/${stage6.completion}/${stage6.summary?.siteUsableCount}/${stage6.storage?.mode}`,
);
check(
  'artwork-manifest',
  artwork.status === 'PASS' && artwork.completion === 'RESOLVER_READY' && artwork.summary?.heroCount === 267 && artwork.summary?.uniqueHeroCount === 267 && artwork.summary?.hardErrorCount === 0,
  JSON.stringify(artwork.summary),
);

const listById = new Map((list.records ?? []).map(row => [Number(row.heroId), row]));
const malformedArtwork = (artwork.records ?? []).filter(row => {
  const source = listById.get(Number(row.heroId));
  if (!source) return true;
  const expectedFile = `public/images/heroes/cards/${row.heroId}.png`;
  const expectedWeb = `/images/heroes/cards/${row.heroId}.png`;
  const exists = fs.existsSync(path.join(ROOT, expectedFile));
  return (
    row.detailRoute !== `/heroes/${row.heroId}` ||
    row.sourceArtworkPath !== source.card?.sourceArtworkPath ||
    row.expectedFilePath !== expectedFile ||
    (exists ? row.webAssetPath !== expectedWeb || row.assetStatus !== 'RESOLVED' : row.webAssetPath !== null || row.assetStatus !== 'PENDING_ASSET') ||
    !stage6.storage?.byHeroId?.[String(row.heroId)]?.path ||
    row.stage6ShardPath !== stage6.storage.byHeroId[String(row.heroId)].path
  );
});
check('artwork-record-parity', malformedArtwork.length === 0, `malformed=${malformedArtwork.length}`);
check(
  'no-artwork-path-inference',
  artwork.sourcePolicy?.inferWebPathFromUnityLocator === false && artwork.sourcePolicy?.resolveOnlyWhenFileExists === true && !listRoute.includes('sourceArtworkPath'),
  'Unity source locators are not converted into browser URLs',
);
check(
  'stage4-server-consumer',
  server.includes('hero-card-artwork-stage4.v1.json') && server.includes('hero-detail.v1.json') && server.includes('readHeroListStage4Data') && server.includes('readHeroDetailRouteStage4Data') && !server.includes('data/configdata/'),
  'Stage 4 consumes lightweight frozen/generated sources only',
);
check(
  'stage4-server-functions',
  functions.includes('getHeroListStage4Data') && functions.includes('getHeroDetailRouteStage4Data') && functions.includes('heroId must be a positive safe integer'),
  'Stage 4 list/detail server functions present',
);
check(
  'list-detail-navigation',
  listRoute.includes('getHeroListStage4Data') && listRoute.includes('to="/heroes/$heroId"') && listRoute.includes('webAssetPath') && listRoute.includes('import.meta.env.BASE_URL'),
  'Hero cards use Stage 4 resolver and typed detail navigation',
);
check(
  'detail-route-shell',
  detailRoute.includes('createFileRoute("/heroes/$heroId")') && detailRoute.includes('getHeroDetailRouteStage5Data') && detailRoute.includes('notFound') && detailRoute.includes('Stage 6') && detailRoute.includes('webAssetPath'),
  '267-Hero detail route shell consumes current Stage 5 projection with Stage 4 artwork resolver',
);

const result = {
  stage: 'hero-list-stage4',
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  completion: failures.length === 0 ? 'PREFLIGHT_COMPLETE' : 'BLOCKED',
  summary: {
    heroCount: artwork.summary?.heroCount ?? 0,
    resolvedArtworkCount: artwork.summary?.resolvedCount ?? 0,
    pendingArtworkCount: artwork.summary?.pendingCount ?? 0,
    malformedArtworkCount: malformedArtwork.length,
    stage6AdmittedHeroCount: stage6.storage?.recordCount ?? 0,
    hardErrorCount: failures.length,
  },
  checks,
  failures,
};

writeJson('data/validation/hero-list-stage4.v1.json', result);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
