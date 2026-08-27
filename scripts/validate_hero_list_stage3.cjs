'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readText = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SOURCE = 'data/generated/hero-list-stage1.v1.json';
const PREDECESSOR = 'data/checkpoints/hero-list-stage2.json';
const SERVER = 'src/lib/hero-list.server.ts';
const FUNCTIONS = 'src/lib/hero-list.functions.ts';
const ROUTE = 'src/routes/heroes.tsx';

const source = readJson(SOURCE);
const predecessor = readJson(PREDECESSOR);
const server = readText(SERVER);
const functions = readText(FUNCTIONS);
const route = readText(ROUTE);

const failures = [];
const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: Boolean(pass), detail });
  if (!pass) failures.push(`${name}: ${detail}`);
};

check(
  'stage2-predecessor',
  predecessor.stage === 'hero-list-stage2' &&
    predecessor.status === 'PASS_WITH_REVIEW' &&
    predecessor.completion === 'COMPLETE' &&
    predecessor.source?.freezeState === 'HERO_LIST_STAGE1_FROZEN' &&
    predecessor.source?.heroCount === 267,
  `${predecessor.stage}/${predecessor.status}/${predecessor.completion}/${predecessor.source?.heroCount}`,
);

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
const malformed = records.filter(row =>
  !Number.isSafeInteger(row.heroId) ||
  row.heroId <= 0 ||
  !row.identity?.nameCn ||
  !row.rarity?.baseLabel ||
  !Number.isFinite(Number(row.rarity?.rank)) ||
  typeof row.hasSp !== 'boolean'
);

check('hero-population', records.length === 267 && uniqueIds.size === 267, `records=${records.length}, unique=${uniqueIds.size}`);
check('record-schema', malformed.length === 0, `malformed=${malformed.length}`);
check('hard-error-zero', source.summary?.hardErrorCount === 0, `hardErrorCount=${source.summary?.hardErrorCount}`);

const rarityCounts = new Map();
for (const row of records) rarityCounts.set(row.rarity.baseLabel, (rarityCounts.get(row.rarity.baseLabel) || 0) + 1);
const spCount = records.filter(row => row.hasSp).length;
check('rarity-options-available', rarityCounts.size >= 3, `rarities=${JSON.stringify(Object.fromEntries(rarityCounts))}`);
check('sp-count', spCount === source.summary?.spReleasedCount && spCount === 25, `sp=${spCount}, summary=${source.summary?.spReleasedCount}`);

const matthew = records.find(row => row.heroId === 1);
check(
  'search-witness-multilingual',
  matthew?.identity?.nameKr === '매튜' && matthew?.identity?.nameCn === '马修' && String(matthew?.identity?.nameEn).toLowerCase() === 'matthew',
  JSON.stringify(matthew?.identity),
);

const policy = source.sourcePolicy || {};
check(
  'production-boundary',
  policy.heroStage6FinalFrozenOnly === true &&
    policy.rawConfigDataRead === false &&
    policy.stage4ProducerRead === false &&
    policy.stage5ProducerRead === false &&
    policy.relationshipRederivation === false &&
    policy.nameOrIdHeuristics === false,
  JSON.stringify(policy),
);

check(
  'stage3-server-consumer',
  server.includes('../../data/generated/hero-list-stage1.v1.json') &&
    server.includes('readHeroListStage3Data') &&
    server.includes('buildRarityOptions') &&
    server.includes('releaseChronologyAvailable: false') &&
    server.includes('factionKoreanLabelsComplete: false') &&
    server.includes('originKoreanLabelsComplete: false') &&
    !server.includes('data/configdata/') &&
    !server.includes('ConfigDataHero') &&
    !server.includes('ConfigDataJob'),
  'Stage 3 derives only presentation filter metadata from the frozen Stage 1 consumer',
);

check(
  'stage3-server-function',
  functions.includes('getHeroListStage3Data') &&
    functions.includes('readHeroListStage3Data') &&
    functions.includes('createServerFn'),
  'Stage 3 server function exists',
);

check(
  'search-ui',
  route.includes('type="search"') &&
    route.includes('한국명 · 중국명 · 영문명') &&
    route.includes('matchesHeroSearch') &&
    route.includes('identity.nameKr') &&
    route.includes('identity.nameCn') &&
    route.includes('identity.nameEn'),
  'multilingual name search is wired',
);

check(
  'rarity-filter-ui',
  route.includes('희귀도 필터') &&
    route.includes('data.filters.rarities.map') &&
    route.includes('hero.rarity.baseLabel !== rarity'),
  'rarity buttons filter records',
);

check(
  'sp-filter-ui',
  route.includes('SP만') &&
    route.includes('aria-pressed={spOnly}') &&
    route.includes('spOnly && !hero.hasSp'),
  'SP-only toggle filters records',
);

check(
  'result-and-reset-ui',
  route.includes('검색 결과') &&
    route.includes('aria-live="polite"') &&
    route.includes('resetFilters') &&
    route.includes('필터 초기화'),
  'result count and reset affordances exist',
);

check(
  'deferred-boundary-preserved',
  !route.includes('hero.detailRoute') &&
    !route.includes('sourceArtworkPath') &&
    !route.includes('webAssetPath') &&
    !route.includes('releaseOrder') &&
    !route.includes('releaseChronology') &&
    !route.includes('factionId ===') &&
    !route.includes('productionId ==='),
  'detail/artwork/release/faction/origin inference remains deferred',
);

const result = {
  stage: 'hero-list-stage3',
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  completion: failures.length === 0 ? 'PREFLIGHT_COMPLETE' : 'BLOCKED',
  summary: {
    heroCount: records.length,
    uniqueHeroCount: uniqueIds.size,
    rarityOptionCount: rarityCounts.size,
    spCount,
    malformedCount: malformed.length,
    hardErrorCount: failures.length,
  },
  checks,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
