import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist', 'client');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
function assert(condition, message) { if (!condition) throw new Error(message); }
function shaFile(absPath) {
  const bytes = fs.readFileSync(absPath);
  return {
    sizeBytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

const relation = readJson('data/generated/skin-stage2-3-bidirectional-relation.v1.json');
const assetMap = readJson('data/generated/skin-stage3-5-static-web-asset-map.v1.json');
const validation = readJson('data/validation/skin-stage3-5-static-web-asset-map.v1.json');

assert(validation.status === 'PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP' && validation.finalReady === true, 'Stage 3-5 predecessor validation is not final PASS');
assert(fs.existsSync(DIST), 'Static build output dist/client is missing');

const heroIds = Object.keys(relation.byHeroId ?? {}).map(Number).sort((a, b) => a - b);
assert(heroIds.length === 267, `Expected 267 Hero IDs, got ${heroIds.length}`);
const heroDetailFiles = heroIds.map((heroId) => path.join(DIST, 'heroes', String(heroId), 'index.html'));
const missingHeroPages = heroDetailFiles.filter((file) => !fs.existsSync(file));
assert(missingHeroPages.length === 0, `Missing static Hero detail pages: ${missingHeroPages.slice(0, 5).join(', ')}`);

const skinDir = path.join(DIST, 'images', 'skins');
assert(fs.existsSync(skinDir), 'Static build Skin image directory is missing');
const pngNames = fs.readdirSync(skinDir).filter((name) => /^\d+\.png$/.test(name));
assert(pngNames.length === 540, `Expected 540 static Skin PNGs, got ${pngNames.length}`);

let verifiedArtifactCount = 0;
for (const record of assetMap.records ?? []) {
  const expectedName = `${record.skinId}.png`;
  const file = path.join(skinDir, expectedName);
  assert(fs.existsSync(file), `Static candidate missing Skin ${record.skinId}`);
  const actual = shaFile(file);
  assert(actual.sizeBytes === record.sizeBytes, `Static candidate size mismatch for Skin ${record.skinId}`);
  assert(actual.sha256 === String(record.sha256).toLowerCase(), `Static candidate SHA mismatch for Skin ${record.skinId}`);
  verifiedArtifactCount += 1;
}
assert(verifiedArtifactCount === 540, `Static candidate verified Skin count changed: ${verifiedArtifactCount}`);

const representatives = [];
const heroWithMostSkins = heroIds
  .map((heroId) => ({ heroId, skinIds: relation.byHeroId[String(heroId)] ?? [] }))
  .sort((a, b) => b.skinIds.length - a.skinIds.length || a.heroId - b.heroId)[0];
const zeroSkinHero = heroIds.find((heroId) => (relation.byHeroId[String(heroId)] ?? []).length === 0);
assert(heroWithMostSkins?.skinIds?.length > 0, 'No Skin-bearing representative Hero found');
assert(Number.isSafeInteger(zeroSkinHero), 'No zero-Skin representative Hero found');

for (const heroId of [heroWithMostSkins.heroId, zeroSkinHero]) {
  const file = path.join(DIST, 'heroes', String(heroId), 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  assert(html.length > 0, `Hero ${heroId} static document is empty`);
  assert(/<!doctype\s+html|<html[\s>]/i.test(html), `Hero ${heroId} static document is not HTML`);
  representatives.push({
    heroId,
    skinCount: (relation.byHeroId[String(heroId)] ?? []).length,
    documentBytes: Buffer.byteLength(html),
  });
}

const result = {
  schemaVersion: 1,
  stage: 'skin-page-3',
  substage: '3-6-1',
  evidenceClass: 'GITHUB_PAGES_STATIC_CANDIDATE_VALIDATION',
  status: 'PASS_SKIN_STAGE3_6_STATIC_CANDIDATE',
  finalReady: true,
  counts: {
    heroDetailPageCount: heroDetailFiles.length,
    skinPngCount: pngNames.length,
    verifiedSkinArtifactCount: verifiedArtifactCount,
  },
  representatives,
  boundaries: {
    basePath: '/langrisser-future-guide/',
    actualBuiltArtifactHashVerified: true,
    heroDetailRouteFilesVerified: true,
    renderedCarouselBehaviorClaimed: false,
    renderedSkinPathClaimedFromRawHtml: false,
    browserUiProofDeferred: true,
    stage2SemanticsRecomputed: false,
    stage35AssetsReencoded: false,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);