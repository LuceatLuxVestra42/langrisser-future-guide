import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const shaFile = (rel) => {
  const bytes = fs.readFileSync(path.join(ROOT, rel));
  return {
    sizeBytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
};
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const relation = readJson('data/generated/skin-stage2-3-bidirectional-relation.v1.json');
const assetMap = readJson('data/generated/skin-stage3-5-static-web-asset-map.v1.json');
const assetValidation = readJson('data/validation/skin-stage3-5-static-web-asset-map.v1.json');

assert(relation?.stage === 'skin-page-2' && relation?.substage === '2-3' && relation?.status === 'ACCEPTED', 'frozen Stage 2 Skin relation is not admitted');
assert(relation?.cardinality?.skinToHero === 'EXACTLY_ONE' && relation?.cardinality?.heroToSkin === 'ZERO_OR_MANY', 'Skin cardinality contract changed');
assert(relation?.counts?.bySkinId === 540 && relation?.counts?.byHeroId === 267 && relation?.counts?.edgeCount === 540, 'Skin Stage 2 population changed');
assert(assetMap?.stage === 'skin-page-3' && assetMap?.substage === '3-5-0' && assetMap?.status === 'STAGE3_5_STATIC_WEB_ASSETS_MATERIALIZED', 'Stage 3-5 asset map is not materialized');
assert(assetMap?.counts?.mappedSkinCount === 540 && assetMap?.counts?.materializedFileCount === 540, 'Stage 3-5 mapped population changed');
assert(assetMap?.counts?.missingFileCount === 0 && assetMap?.counts?.hashMismatchCount === 0 && assetMap?.counts?.pathCollisionCount === 0 && assetMap?.counts?.unexpectedFileCount === 0, 'Stage 3-5 manifest carries blockers');
assert(assetValidation?.status === 'PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP' && assetValidation?.finalReady === true, 'Stage 3-5 final validator is not PASS/finalReady');
assert(assetValidation?.counts?.acceptedSkinCount === 540 && assetValidation?.blockers?.length === 0, 'Stage 3-5 final validator population/blockers changed');
assert(assetValidation?.boundaries?.actualPublicArtifactHashVerified === true, 'Stage 3-5 public artifact hash proof is absent');
assert(assetValidation?.boundaries?.semanticOwnershipRecomputed === false && assetValidation?.boundaries?.sourceOrderRecomputed === false, 'Stage 3-5 semantic boundary changed');

const assetBySkinId = new Map();
for (const record of assetMap.records ?? []) {
  const skinId = Number(record?.skinId);
  assert(Number.isSafeInteger(skinId) && skinId > 0 && !assetBySkinId.has(skinId), `invalid/duplicate asset Skin ${record?.skinId}`);
  const frozen = relation.bySkinId?.[String(skinId)];
  assert(frozen, `asset Skin ${skinId} missing from frozen relation`);
  assert(record.heroId === frozen.heroId, `hero ownership changed for Skin ${skinId}`);
  assert(record.sourceOrder === frozen.sourceOrder, `sourceOrder changed for Skin ${skinId}`);
  assert(record.publicPath === `images/skins/${skinId}.png`, `publicPath changed for Skin ${skinId}`);
  assert(record.repoPath === `public/images/skins/${skinId}.png`, `repoPath changed for Skin ${skinId}`);
  assert(/^[0-9a-f]{64}$/i.test(record.sha256 ?? ''), `invalid SHA-256 for Skin ${skinId}`);
  const actual = shaFile(record.repoPath);
  assert(actual.sizeBytes === record.sizeBytes && actual.sha256 === record.sha256.toLowerCase(), `committed public artifact mismatch for Skin ${skinId}`);
  assetBySkinId.set(skinId, record);
}
assert(assetBySkinId.size === 540, `Stage 3-6 visible Skin asset population changed: ${assetBySkinId.size}`);

let projectedEdgeCount = 0;
let zeroSkinHeroCount = 0;
let heroesWithSkinCount = 0;
let stage6SkinCountMismatch = 0;
for (const [heroKey, orderedSkinIds] of Object.entries(relation.byHeroId ?? {})) {
  const heroId = Number(heroKey);
  assert(Number.isSafeInteger(heroId) && heroId > 0 && Array.isArray(orderedSkinIds), `invalid Hero reverse-index row ${heroKey}`);
  if (orderedSkinIds.length === 0) zeroSkinHeroCount += 1;
  else heroesWithSkinCount += 1;

  for (let index = 0; index < orderedSkinIds.length; index += 1) {
    const skinId = Number(orderedSkinIds[index]);
    const record = assetBySkinId.get(skinId);
    assert(record, `Hero ${heroId} Skin ${skinId} missing from Stage 3-5 map`);
    assert(record.heroId === heroId, `Hero ${heroId} reverse ownership mismatch at Skin ${skinId}`);
    assert(record.sourceOrder === index + 1, `Hero ${heroId} source order mismatch at Skin ${skinId}`);
  }
  projectedEdgeCount += orderedSkinIds.length;

  const shardPath = `data/generated/hero-detail/by-id/${heroId}.json`;
  assert(fs.existsSync(path.join(ROOT, shardPath)), `Hero ${heroId} Stage 6 shard missing`);
  const shard = readJson(shardPath);
  assert(shard?.heroId === heroId, `Hero ${heroId} Stage 6 shard identity mismatch`);
  assert(shard?.validation?.structuralStatus === 'PASS' && shard?.validation?.siteUsable === true, `Hero ${heroId} Stage 6 shard is not site-usable`);
  const shardSkinCount = Array.isArray(shard?.presentation?.skins) ? shard.presentation.skins.length : 0;
  if (shardSkinCount !== orderedSkinIds.length) stage6SkinCountMismatch += 1;
}

assert(Object.keys(relation.byHeroId ?? {}).length === 267, 'Stage 3-6 Hero population changed');
assert(projectedEdgeCount === 540, `Stage 3-6 projected edge count changed: ${projectedEdgeCount}`);
assert(heroesWithSkinCount === 235, `heroes-with-Skin count changed: ${heroesWithSkinCount}`);
assert(zeroSkinHeroCount === 32, `zero-Skin Hero count changed: ${zeroSkinHeroCount}`);
assert(stage6SkinCountMismatch === 0, `Stage 6/Skin relation count mismatch on ${stage6SkinCountMismatch} Hero shards`);

const serverSource = readText('src/lib/skin-detail.server.ts');
const routeSource = readText('src/routes/heroes_.$heroId.tsx');
assert(serverSource.includes('skin-stage2-3-bidirectional-relation.v1.json'), 'Skin frontend server is not consuming the frozen Stage 2 relation');
assert(serverSource.includes('../../data/generated/skin-stage3-5-static-web-asset-map.v1.json'), 'Skin frontend server is not consuming the frozen Stage 3-5 asset map');
assert(serverSource.includes('../../data/validation/skin-stage3-5-static-web-asset-map.v1.json'), 'Skin frontend server is not consuming Stage 3-5 final validation admission');
assert(routeSource.includes('detail.presentation.skins'), 'Hero detail route is not consuming projected Skin rows');
assert(routeSource.includes('resolvePublicAssetUrl(skin.publicPath)'), 'Hero detail route does not resolve frozen Skin public paths');
assert(routeSource.includes('ChevronLeft') && routeSource.includes('ChevronRight'), 'Hero detail Skin carousel controls are missing');

const forbiddenRawConfigPatterns = [
  /(?:from\s+|import\s*\()[^\n]*["'][^"']*ConfigData[^"']*["']/i,
  /(?:from\s+|import\s*\()[^\n]*["'][^"']*data\/configdata\/[^"']*["']/i,
  /fs\.(?:readFileSync|readFile)[^\n]*ConfigData/i,
  /fs\.(?:readFileSync|readFile)[^\n]*data[\\/]configdata/i,
];
for (const [label, source] of [['Skin frontend server', serverSource], ['Hero detail route', routeSource]]) {
  assert(!forbiddenRawConfigPatterns.some((pattern) => pattern.test(source)), `${label} must not actively read raw ConfigData`);
}

const result = {
  schemaVersion: 1,
  stage: 'skin-page-3',
  substage: '3-6-0',
  evidenceClass: 'HERO_DETAIL_SKIN_CONSUMER_PREFLIGHT',
  status: 'PASS_SKIN_STAGE3_6_HERO_DETAIL_CONSUMER_PREFLIGHT',
  finalReady: true,
  counts: {
    heroCount: 267,
    heroesWithSkinCount,
    zeroSkinHeroCount,
    acceptedSkinCount: assetBySkinId.size,
    projectedEdgeCount,
    stage6SkinCountMismatch,
  },
  boundaries: {
    stage2FrozenRelationOnly: true,
    stage35FrozenPublicAssetMapOnly: true,
    actualPublicArtifactHashVerified: true,
    rawConfigDataRead: false,
    nameJoin: false,
    idArithmetic: false,
    semanticOwnershipRecomputed: false,
    sourceOrderRecomputed: false,
    releaseMetadataSynthesized: false,
    acquisitionMethodSynthesized: false,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);