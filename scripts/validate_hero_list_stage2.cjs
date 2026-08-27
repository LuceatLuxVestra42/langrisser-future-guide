'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readText = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SOURCE = 'data/generated/hero-list-stage1.v1.json';
const SERVER = 'src/lib/hero-list.server.ts';
const FUNCTIONS = 'src/lib/hero-list.functions.ts';
const ROUTE = 'src/routes/heroes.tsx';
const INDEX = 'src/routes/index.tsx';

const source = readJson(SOURCE);
const server = readText(SERVER);
const functions = readText(FUNCTIONS);
const route = readText(ROUTE);
const index = readText(INDEX);

const failures = [];
const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: Boolean(pass), detail });
  if (!pass) failures.push(`${name}: ${detail}`);
};

check(
  'stage1-frozen-source',
  source.version === 1 &&
    source.stage === 'hero-list-stage1' &&
    source.schemaId === 'hero-list/v1' &&
    source.status === 'PASS' &&
    source.completion === 'COMPLETE' &&
    source.freezeState === 'HERO_LIST_STAGE1_FROZEN',
  `${source.version}/${source.stage}/${source.schemaId}/${source.status}/${source.completion}/${source.freezeState}`,
);

const records = Array.isArray(source.records) ? source.records : [];
const ids = records.map(row => Number(row.heroId));
const uniqueIds = new Set(ids);
check('hero-population', records.length === 267 && uniqueIds.size === 267, `records=${records.length}, unique=${uniqueIds.size}`);
check(
  'hero-summary-parity',
  source.summary?.canonicalHeroCount === 267 &&
    source.summary?.generatedRecordCount === 267 &&
    source.summary?.uniqueHeroCount === 267 &&
    source.summary?.hardErrorCount === 0,
  JSON.stringify(source.summary),
);

const malformed = records.filter(row =>
  !Number.isSafeInteger(row.heroId) ||
  row.heroId <= 0 ||
  row.detailRoute !== `/heroes/${row.heroId}` ||
  !row.identity?.nameCn ||
  !row.rarity?.baseLabel ||
  !Number.isFinite(Number(row.rarity?.rank)) ||
  typeof row.hasSp !== 'boolean' ||
  !Array.isArray(row.factions) ||
  !row.origin ||
  !row.card
);
check('record-schema', malformed.length === 0, `malformed=${malformed.length}`);

const stage1Policy = source.sourcePolicy || {};
check(
  'production-boundary',
  stage1Policy.heroStage6FinalFrozenOnly === true &&
    stage1Policy.rawConfigDataRead === false &&
    stage1Policy.stage4ProducerRead === false &&
    stage1Policy.stage5ProducerRead === false &&
    stage1Policy.relationshipRederivation === false &&
    stage1Policy.nameOrIdHeuristics === false,
  JSON.stringify(stage1Policy),
);

check(
  'server-consumes-stage1-only',
  server.includes('../../data/generated/hero-list-stage1.v1.json') &&
    !server.includes('ConfigData') &&
    !server.includes('data/configdata/') &&
    !server.includes('hero-detail.v1.json'),
  'frozen list import present; raw/producer imports absent',
);

check(
  'server-function-boundary',
  functions.includes('readHeroListStage2Data') && functions.includes('createServerFn'),
  'server function delegates to Stage 2 loader',
);

check(
  'heroes-route',
  route.includes('createFileRoute("/heroes")') &&
    route.includes('getHeroListStage2Data') &&
    route.includes('data.records.map') &&
    !route.includes('/heroes/$heroId'),
  'basic /heroes grid exists without premature detail route activation',
);

check(
  'no-premature-web-artwork-inference',
  route.includes('UserRound') && !route.includes('sourceArtworkPath') && !route.includes('webAssetPath'),
  'placeholder is used until web asset resolution stage',
);

check(
  'home-character-route',
  index.includes('{ title: "캐릭터", image: cardCharacter, to: "/heroes" }'),
  'home character card points to /heroes',
);

const result = {
  stage: 'hero-list-stage2',
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  completion: failures.length === 0 ? 'PREFLIGHT_COMPLETE' : 'BLOCKED',
  summary: {
    heroCount: records.length,
    uniqueHeroCount: uniqueIds.size,
    malformedCount: malformed.length,
    hardErrorCount: failures.length,
  },
  checks,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
