import fs from 'node:fs';
import path from 'node:path';

const manifest = JSON.parse(fs.readFileSync('data/generated/hero-card-icon-assets.v1.json', 'utf8'));
const validation = JSON.parse(fs.readFileSync('data/validation/hero-card-icon-assets.v1.json', 'utf8'));
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
assert(files.length === 267, `expected 267 local card icons, got ${files.length}`);

for (const row of manifest.records ?? []) {
  assert(row.assetStatus === 'RESOLVED', `Hero ${row.heroId} card icon must be RESOLVED`);
  assert(row.webAssetPath === `/images/heroes/card-icons/${row.heroId}.png`, `Hero ${row.heroId} web path mismatch`);
  assert(row.expectedFilePath === `public/images/heroes/card-icons/${row.heroId}.png`, `Hero ${row.heroId} local path mismatch`);
  assert(fs.existsSync(row.expectedFilePath), `Hero ${row.heroId} local asset missing`);
  assert(row.width > 0 && row.height > 0 && Math.abs(row.width - row.height) <= 8, `Hero ${row.heroId} icon is not square`);
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

if (errors.length > 0) {
  console.error(`Hero card icon frontend validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  heroCount: 267,
  localCardIconCount: files.length,
  frozenManifest: true,
  exactAssetMapping: true,
  remoteRuntimeHotlink: false,
  semanticRelationReopened: false,
  portraitCropRemoved: true,
  syntheticFrameRemoved: true,
}));
