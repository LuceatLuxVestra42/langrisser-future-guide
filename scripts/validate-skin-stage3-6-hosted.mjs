import crypto from 'node:crypto';
import fs from 'node:fs';

const BASE_URL = (process.env.HOSTED_BASE_URL ?? 'https://luceatluxvestra42.github.io/langrisser-future-guide/').replace(/\/?$/, '/');
const EXPECTED_SOURCE_SHA = process.env.EXPECTED_SOURCE_SHA ?? '';
const SUMMARY_PATH = 'data/validation/skin-stage3-6-hosted-summary.v1.json';
const EVIDENCE_PATH = 'data/evidence/skin-stage3-6-hosted.v1.json';
const CHECKPOINT_PATH = 'data/checkpoints/skin-stage3-6-hosted.v1.json';

function assert(condition, message) { if (!condition) throw new Error(message); }
function readJson(path) { return JSON.parse(fs.readFileSync(path, 'utf8')); }
function resolveUrl(path) { return new URL(path.replace(/^\//, ''), BASE_URL).toString(); }
async function fetchNoStore(path) {
  const url = resolveUrl(path);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
  });
  return { url, response };
}

assert(/^[0-9a-f]{40}$/i.test(EXPECTED_SOURCE_SHA), `EXPECTED_SOURCE_SHA is invalid: ${EXPECTED_SOURCE_SHA}`);
const relation = readJson('data/generated/skin-stage2-3-bidirectional-relation.v1.json');
const assetMap = readJson('data/generated/skin-stage3-5-static-web-asset-map.v1.json');
const validation = readJson('data/validation/skin-stage3-5-static-web-asset-map.v1.json');
assert(validation.status === 'PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP' && validation.finalReady === true, 'Stage 3-5 validation is not final PASS');

async function waitForCurrentDeployment() {
  let lastError = 'not requested';
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const { response } = await fetchNoStore(`skin-stage3-6-hosted-ready.json?qa=${Date.now()}-${attempt}`);
      if (response.ok) {
        const payload = await response.json();
        if (
          payload?.status === 'READY_FOR_SKIN_STAGE3_6_HOSTED_QA' &&
          payload?.sourceSha === EXPECTED_SOURCE_SHA &&
          payload?.heroDetailPageCount === 267 &&
          payload?.skinPngCount === 540
        ) return { attempt, payload };
        lastError = `sentinel payload mismatch: ${JSON.stringify(payload)}`;
      } else lastError = `sentinel HTTP ${response.status}`;
    } catch (error) { lastError = String(error); }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(`DEPLOYMENT_HOSTING_FAIL: current Skin deployment did not become visible: ${lastError}`);
}

async function checkRoute(path) {
  const { url, response } = await fetchNoStore(`${path}${path.includes('?') ? '&' : '?'}qa=${Date.now()}`);
  const text = await response.text();
  assert(response.ok, `DEPLOYMENT_HOSTING_FAIL: ${path || '/'} returned HTTP ${response.status}`);
  assert(text.length > 0, `DEPLOYMENT_HOSTING_FAIL: ${path || '/'} returned empty HTML`);
  return {
    path,
    requestedUrl: url,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get('content-type'),
    bytes: Buffer.byteLength(text),
  };
}

async function checkPng(record) {
  const path = record.publicPath;
  const { url, response } = await fetchNoStore(`${path}?qa=${Date.now()}`);
  assert(response.ok, `DEPLOYMENT_HOSTING_FAIL: Skin ${record.skinId} returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length === record.sizeBytes, `Skin ${record.skinId} hosted size mismatch`);
  assert(bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', `Skin ${record.skinId} hosted PNG signature mismatch`);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  assert(sha256 === String(record.sha256).toLowerCase(), `Skin ${record.skinId} hosted SHA-256 mismatch`);
  return {
    skinId: record.skinId,
    heroId: record.heroId,
    sourceOrder: record.sourceOrder,
    requestedUrl: url,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get('content-type'),
    bytes: bytes.length,
    sha256,
  };
}

const sentinel = await waitForCurrentDeployment();
const heroIds = Object.keys(relation.byHeroId ?? {}).map(Number).sort((a, b) => a - b);
const skinHero = heroIds
  .map((heroId) => ({ heroId, skinIds: relation.byHeroId[String(heroId)] ?? [] }))
  .sort((a, b) => b.skinIds.length - a.skinIds.length || a.heroId - b.heroId)[0];
const zeroSkinHeroId = heroIds.find((heroId) => (relation.byHeroId[String(heroId)] ?? []).length === 0);
assert(skinHero?.skinIds?.length > 0 && Number.isSafeInteger(zeroSkinHeroId), 'Hosted representative Hero selection failed');

const routePaths = ['', 'heroes', 'heroes/', `heroes/${skinHero.heroId}`, `heroes/${skinHero.heroId}/`, `heroes/${zeroSkinHeroId}`, `heroes/${zeroSkinHeroId}/`];
const routes = [];
for (const routePath of routePaths) routes.push(await checkRoute(routePath));

const records = assetMap.records ?? [];
assert(records.length === 540, `Hosted source asset population changed: ${records.length}`);
const representativeIndexes = [0, Math.floor(records.length / 2), records.length - 1];
const representativeRecords = representativeIndexes.map((index) => records[index]);
const assets = [];
for (const record of representativeRecords) assets.push(await checkPng(record));

const evidence = {
  schemaVersion: 1,
  stage: 'skin-page-3',
  substage: '3-6-2',
  evidenceClass: 'GITHUB_PAGES_HOSTED_ROUTE_ASSET_EVIDENCE',
  status: 'PASS_SKIN_STAGE3_6_HOSTED_QA',
  sourceSha: EXPECTED_SOURCE_SHA,
  hostedBaseUrl: BASE_URL,
  deploymentSentinel: { status: 'PASS', attempts: sentinel.attempt, payload: sentinel.payload },
  routeChecks: routes,
  assetChecks: assets,
  representatives: {
    skinHeroId: skinHero.heroId,
    skinHeroCount: skinHero.skinIds.length,
    zeroSkinHeroId,
    skinIds: representativeRecords.map((record) => record.skinId),
  },
  counts: {
    canonicalHeroCount: heroIds.length,
    canonicalSkinCount: records.length,
    checkedRouteCount: routes.length,
    checkedAssetCount: assets.length,
  },
  boundaries: {
    exactDeployedSourceShaVerified: true,
    hostedAssetSha256Verified: true,
    semanticOwnershipRecomputed: false,
    sourceOrderRecomputed: false,
    browserInteractionClaimed: false,
  },
};

const summary = {
  schemaVersion: 1,
  stage: 'skin-page-3',
  substage: '3-6-2',
  status: evidence.status,
  finalReady: true,
  sourceSha: EXPECTED_SOURCE_SHA,
  gates: {
    preflight: 'PASS',
    build: 'PASS',
    deploymentHosted: 'PASS',
    browserUi: 'PENDING',
  },
  counts: evidence.counts,
  nextStartPoint: 'Run hosted Browser/UI Skin carousel, image ratio/crop, responsive, navigation, and console/page-error QA without reopening frozen Skin semantics.',
};

const checkpoint = {
  checkpoint: 'skin-stage3-6-hosted-v1',
  status: evidence.status,
  finalReady: true,
  sourceSha: EXPECTED_SOURCE_SHA,
  preflight: 'PASS_SKIN_STAGE3_6_HERO_DETAIL_CONSUMER_PREFLIGHT',
  build: 'PASS_SKIN_STAGE3_6_STATIC_CANDIDATE',
  hosted: evidence.status,
  browserUi: 'PENDING',
  semanticStageReopened: false,
  nextStart: summary.nextStartPoint,
};

fs.mkdirSync('data/evidence', { recursive: true });
fs.mkdirSync('data/validation', { recursive: true });
fs.mkdirSync('data/checkpoints', { recursive: true });
fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(CHECKPOINT_PATH, `${JSON.stringify(checkpoint, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
