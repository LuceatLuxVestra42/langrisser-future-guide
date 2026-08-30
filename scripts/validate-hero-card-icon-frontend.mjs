import fs from 'node:fs';
import path from 'node:path';

const manifest = JSON.parse(fs.readFileSync('data/generated/hero-card-icon-assets.v1.json', 'utf8'));
const validation = JSON.parse(fs.readFileSync('data/validation/hero-card-icon-assets.v1.json', 'utf8'));
const delivery = JSON.parse(fs.readFileSync('data/generated/hero-card-icon-web-delivery.v1.json', 'utf8'));
const route = fs.readFileSync('src/routes/heroes.tsx', 'utf8');
const helper = fs.readFileSync('src/lib/hero-card-icon-assets.server.ts', 'utf8');

const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

assert(manifest.status === 'PASS', 'asset manifest status must be PASS');
assert(manifest.completion === 'COMPLETE', 'asset manifest completion must be COMPLETE');
assert(manifest.freezeState === 'HERO_CARD_ICON_ASSETS_FROZEN', 'asset manifest freezeState mismatch');
assert(manifest.summary?.heroCount === 267, 'asset manifest heroCount must be 267');
assert(manifest.summary?.resolvedCount === 267, 'asset manifest resolvedCount must be 267');
assert(manifest.summary?.fileCount === 267, 'asset manifest fileCount must be 267');
assert(manifest.summary?.pendingCount === 0, 'asset manifest pendingCount must be 0');
assert(manifest.summary?.hardErrorCount === 0, 'asset manifest hardErrorCount must be 0');
assert(manifest.sourcePolicy?.remoteRuntimeHotlink === false, 'runtime hotlink must be false');
assert(manifest.sourcePolicy?.semanticRelationReopened === false, 'semantic relation must stay closed');
assert(manifest.sourcePolicy?.rawConfigDataRead === false, 'raw ConfigData read must stay false');
assert(manifest.sourcePolicy?.fuzzyMatching === false, 'fuzzy asset mapping must stay false');
assert(validation.status === 'PASS' && validation.hardErrorCount === 0, 'asset validation must PASS');

const files = fs.readdirSync('public/images/heroes/card-icons').filter((name) => /^\d+\.png$/.test(name));
const webpFiles = fs.readdirSync('public/images/heroes/card-icons-webp').filter((name) => /^\d+\.webp$/.test(name));
assert(files.length === 267, `expected 267 authoritative PNG card icons, got ${files.length}`);
assert(webpFiles.length === 267, `expected 267 WebP delivery card icons, got ${webpFiles.length}`);
assert(delivery.status === 'PASS' && delivery.completion === 'COMPLETE', 'WebP delivery manifest must be complete');
assert(delivery.freezeState === 'HERO_CARD_ICON_WEB_DELIVERY_FROZEN', 'WebP delivery freezeState mismatch');
assert(delivery.sourceFreezeState === manifest.freezeState, 'WebP delivery predecessor freeze mismatch');
assert(delivery.sourcePolicy?.pngAuthoritativeSourceRetained === true, 'authoritative PNG sources must be retained');
assert(delivery.sourcePolicy?.webDeliveryFormat === 'LOSSLESS_WEBP', 'delivery format must be lossless WebP');
assert(delivery.sourcePolicy?.semanticRelationReopened === false, 'WebP delivery must not reopen semantic relations');
assert(delivery.summary?.heroCount === 267 && delivery.summary?.webDeliveryCount === 267, 'WebP delivery count must be 267');
assert(delivery.summary?.pendingCount === 0 && delivery.summary?.hardErrorCount === 0, 'WebP delivery must have no pending/errors');
assert(delivery.summary?.webDeliveryTotalBytes < delivery.summary?.sourcePngTotalBytes, 'WebP delivery must be smaller than PNG source set');
const deliveryByHeroId = new Map(delivery.records.map((row) => [row.heroId, row]));

for (const row of manifest.records ?? []) {
  assert(row.assetStatus === 'RESOLVED', `Hero ${row.heroId} card icon must be RESOLVED`);
  assert(row.webAssetPath === `/images/heroes/card-icons/${row.heroId}.png`, `Hero ${row.heroId} web path mismatch`);
  assert(row.expectedFilePath === `public/images/heroes/card-icons/${row.heroId}.png`, `Hero ${row.heroId} local path mismatch`);
  assert(fs.existsSync(row.expectedFilePath), `Hero ${row.heroId} local asset missing`);
  assert(row.width > 0 && row.height > 0 && Math.abs(row.width - row.height) <= 8, `Hero ${row.heroId} icon is not square`);
  const web = deliveryByHeroId.get(row.heroId);
  assert(web?.sourcePngPath === row.webAssetPath, `Hero ${row.heroId} WebP predecessor path mismatch`);
  assert(web?.sourcePngSha256 === row.sha256, `Hero ${row.heroId} WebP predecessor hash mismatch`);
  assert(web?.webDeliveryMode === 'LOSSLESS', `Hero ${row.heroId} WebP delivery is not lossless`);
  assert(web?.webDeliveryPath === `/images/heroes/card-icons-webp/${row.heroId}.webp`, `Hero ${row.heroId} WebP web path mismatch`);
  assert(web?.webDeliveryFilePath === `public/images/heroes/card-icons-webp/${row.heroId}.webp`, `Hero ${row.heroId} WebP local path mismatch`);
  assert(fs.existsSync(web?.webDeliveryFilePath ?? ''), `Hero ${row.heroId} WebP delivery missing`);
}

assert(route.includes('getHeroCardIconIndex'), 'Hero list must consume the frozen card icon server index');
assert(route.includes('data-hero-card-icons="true"'), 'Hero list QA container marker missing');
assert(route.includes('data-hero-card-icon="true"'), 'Hero card icon QA marker missing');
assert(route.includes('object-contain'), 'Hero card icons must preserve their source card frame');
assert(!route.includes('SAMPLE_HERO_CARD_PATHS'), 'Hero list must not fall back to portrait samples');
assert(!route.includes('getRarityFrameClass'), 'synthetic rarity frame helper must be removed');
assert(!route.includes('object-[center_20%]'), 'portrait crop presentation must be removed');
assert(!route.includes('hero.card.webAssetPath\n    ?'), 'Hero list must not use detail artwork as the primary list icon');
assert(helper.includes('HERO_CARD_ICON_ASSETS_FROZEN'), 'server helper must enforce frozen card icon manifest');
assert(helper.includes('remoteRuntimeHotlink !== false'), 'server helper must reject remote-runtime hotlinking');
assert(helper.includes('hero-card-icon-web-delivery.v1.json'), 'server helper must consume frozen WebP delivery manifest');
assert(helper.includes('card-icons-webp'), 'server helper must expose WebP delivery paths');

if (errors.length > 0) {
  console.error(`Hero card icon frontend validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  heroCount: 267,
  localCardIconCount: files.length,
  webpDeliveryCount: webpFiles.length,
  losslessWebpDelivery: true,
  authoritativePngSourceRetained: true,
  webDeliverySavingsPercent: delivery.summary.webDeliverySavingsPercent,
  frozenManifest: true,
  exactAssetMapping: true,
  remoteRuntimeHotlink: false,
  semanticRelationReopened: false,
  portraitCropRemoved: true,
  syntheticFrameRemoved: true,
}));
